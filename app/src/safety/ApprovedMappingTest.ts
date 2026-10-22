import { PassiveConnection } from '../serial/PassiveConnection';
import type { ReadOnlyPort } from '../serial/PassiveConnection';
import { FrameParser, decodePositions } from '../protocol/FrameParser';
import { encodeFactoryHolding, encodeGoalPosition } from '../protocol/NexArmCodec';
import { ReferenceCapture } from '../robot/ReferenceCapture';
import { BASE_APPROVAL_KEY, jointPlan } from './JointTestPlans';
import type { JointTestPlan } from './JointTestPlans';
import { HOME_REFERENCE, HOME_TOLERANCE, referenceReturnProposal } from './ReferenceReturnProposal';
import { RETURN_APPROVAL_KEY, StagedReferenceReturn } from './StagedReferenceReturn';
import { CommissioningAttempts } from './CommissioningAttempts';
import { ManualPositioning } from './ManualPositioning';

export interface TestPort extends ReadOnlyPort { readonly writable: WritableStream<Uint8Array> | null; }
// Keep the original key: changing the allowed observation window must never
// resurrect an approval that was already consumed by an earlier app version.
export const APPROVAL_KEY = BASE_APPROVAL_KEY;
type Phase = 'Disconnected' | 'Observing' | 'Enabled' | 'Observing result' | 'Complete' | 'Stopped' | 'Fault';

// Teacher commissioning only. Retries require a separate recorded adult review;
// callers never supply arbitrary targets/packets or erase consumed approvals.
export class ApprovedMappingTest {
  private readonly connection: PassiveConnection;
  private readonly parser = new FrameParser();
  private readonly evidence = new ReferenceCapture();
  private port: TestPort | null = null;
  private pending: Promise<void> | null = null;
  private connected = false;
  private connectionState = 'Disconnected';
  private phase: Phase = 'Disconnected';
  private message = 'Connect explicitly. No command is sent on connection.';
  private positions: readonly number[] | null = null;
  private receivedAt = -Infinity;
  private connectedAt = 0;
  private before: readonly number[] | null = null;
  private startedAt = 0;
  private written = false;
  private attempt = false;
  private settled: { at: number; value: number }[] = [];
  private plan: JointTestPlan;
  private writeInFlight = false;
  private home: StagedReferenceReturn | null = null;
  private readonly attempts: CommissioningAttempts;
  private frozenPlan: JointTestPlan | null = null;
  private attemptId: string | null = null;
  private manual: ManualPositioning;
  private lastCommandAt = -Infinity;

  constructor(locks: LockManager, private readonly storage: Pick<Storage, 'getItem' | 'setItem'>,
    private readonly now: () => number, private readonly visible: () => boolean,
    private readonly changed: () => void, servo = 1) {
    this.plan = jointPlan(servo);
    this.attempts = new CommissioningAttempts(storage);
    this.manual = new ManualPositioning(storage);
    this.connection = new PassiveConnection((state, message) => {
      this.connectionState = state; this.connected = state === 'Listening';
      if (this.connected) { this.phase = 'Observing'; this.connectedAt = this.now(); this.message = 'Collecting full-checksum starting-state evidence.'; }
      else {
        this.attempts.clearPermit();
        this.manual.interrupt('Connection ended during manual setup.', this.positions ?? []);
        if(this.home?.activeRun)this.home.fail('Connection lost during return. No further command is authorized.');
        this.evidence.clear();
        if (this.phase === 'Observing result') { this.phase = 'Fault'; this.message = 'Connection lost; delivery/movement may have occurred. No retry.'; }
        else if (!['Complete', 'Fault', 'Stopped'].includes(this.phase)) { this.phase = 'Disconnected'; this.message = message; }
      }
      this.changed();
    }, bytes => this.receive(bytes), locks);
  }

  private approvalReason(): string | null {
    return this.attempts.reason(this.plan.key);
  }

  private candidatePlan(): JointTestPlan {
    if (this.frozenPlan && (this.phase === 'Enabled' || this.attempt)) return this.frozenPlan;
    if (this.plan.servo === 1) return this.plan;
    const i = this.plan.servo - 1;
    return { ...this.plan, startMin: Math.min(this.plan.startMin, HOME_REFERENCE[i]! - HOME_TOLERANCE),
      startMax: Math.max(this.plan.startMax, HOME_REFERENCE[i]! + HOME_TOLERANCE),
      target: this.positions ? this.positions[i]! + 20 : this.plan.target };
  }

  private preflight(): string | null {
    if (this.manual.blocked) return 'Finish manual positioning and physically confirm holding before joint tests.';
    if(this.home?.activeRun)return 'A reference return is enabled/running. Joint tests are disabled.';
    if (!this.visible()) return 'The test page must be visible.';
    if (this.approvalReason()) return this.approvalReason();
    if (!this.connected || !this.port) return 'Connect and wait for fresh telemetry.';
    if (['Fault', 'Stopped', 'Complete', 'Observing result'].includes(this.phase)) return 'This run is closed. No command is available.';
    const reason = this.evidence.reason(this.now()); if (reason) return reason;
    if (this.now() - this.lastCommandAt < 900) return 'Waiting for the 900 ms command interval.';
    const window = this.evidence.capture(this.now());
    const plan = this.candidatePlan();
    const selected = this.plan.servo - 1;
    if (window.observation.min[selected]! < plan.startMin || window.observation.max[selected]! > plan.startMax) return `Servo ${plan.servo}: observed ${window.observation.min[selected]}–${window.observation.max[selected]}, permitted start ${plan.startMin}–${plan.startMax}. Review a staged return before this test; do not force powered joints.`;
    if (this.phase === 'Enabled' && (plan.target - this.positions![selected]! < 15 || plan.target - this.positions![selected]! > 25)) return 'Selected joint changed more than 5 raw units after Enable. Review the starting pose again.';
    for (let i = 0; i < 6; i++) {
      if (i === selected) continue;
      if (this.plan.servo !== 1 && i === 0) {
        const minimum = window.observation.min[0]!, maximum = window.observation.max[0]!;
        const atReference = minimum >= HOME_REFERENCE[0]! - HOME_TOLERANCE && maximum <= HOME_REFERENCE[0]! + HOME_TOLERANCE;
        const afterBaseTest = minimum >= 2061 && maximum <= 2071;
        if (!atReference && !afterBaseTest) return 'Base must match Reference A (2039–2057) or the completed base test (2061–2071). A different pose needs review.';
        continue;
      }
      let low = this.plan.reference[i]! - 12, high = this.plan.reference[i]! + 12;
      if (this.plan.servo !== 1) { low = Math.min(low, HOME_REFERENCE[i]! - HOME_TOLERANCE); high = Math.max(high, HOME_REFERENCE[i]! + HOME_TOLERANCE); }
      // Previously attempted suite joints may remain near their original region
      // or the declared target. Actual readback, not the marker, supplies position.
      if (this.plan.servo !== 1 && i > 0) {
        try { if (this.storage.getItem(jointPlan(i + 1).key) !== null) high = Math.max(jointPlan(i + 1).target + 12, HOME_REFERENCE[i]! + HOME_TOLERANCE + 20 + 12); }
        catch { return 'Local approval storage is unavailable.'; }
      }
      if (window.observation.min[i]! < low || window.observation.max[i]! > high) return `Servo ${i + 1}: observed ${window.observation.min[i]}–${window.observation.max[i]}, permitted companion region ${low}–${high}. Review the pose before testing.`;
    }
    return null;
  }

  snapshot() {
    const reason = this.preflight();
    return { phase: this.phase, connectionState: this.connectionState, message: this.message,
      positions: this.positions ? [...this.positions] : null, reason,
      canEnable: this.phase === 'Observing' && reason === null,
      canSend: this.phase === 'Enabled' && reason === null,
      canConnect: this.connectionState === 'Disconnected', attempted: this.attempt,
      plan: this.candidatePlan(), retryJointReason: this.retryReason('joint'), retryReturnReason: this.retryReason('return'),
      canSelect: !this.manual.blocked && !this.home?.activeRun && !this.writeInFlight && ['Disconnected', 'Listening'].includes(this.connectionState) && !['Enabled', 'Observing result', 'Fault'].includes(this.phase),
      homeCanEnable: this.returnReason()===null, homeCanStart: this.home?.phase==='Enabled'&&this.connected&&this.visible()&&this.now()-this.receivedAt<=500,
      homePhase:this.home?.phase??'Not started',homeMessage:this.home?.message??this.returnReason(),
      manualPhase:this.manual.phase,manualMessage:this.manual.message,
      canEnableManual:this.manual.phase==='Normal' && this.manualReason()===null,
      canRelease:this.manual.phase==='Release enabled' && this.manualReason()===null,
      canRestore:['Manual setup','Recovery required'].includes(this.manual.phase) && this.manualReason()===null,
      canConfirmHolding:['Confirm holding','Recovery required'].includes(this.manual.phase) && this.manualReason()===null,
      manualReason:this.manualReason() };
  }

  private manualReason(): string | null {
    if (!this.connected || !this.visible()) return 'Connect explicitly with this page visible.';
    if (this.writeInFlight || this.home?.activeRun || ['Enabled','Observing result','Fault','Stopped'].includes(this.phase)) return 'Resolve the active operation and reconnect after a fault.';
    if (this.manual.pending) return 'Waiting for the holding command write; no overlapping operation is allowed.';
    if (this.now() - this.lastCommandAt < 900) return 'Waiting for the 900 ms command interval.';
    return this.evidence.reason(this.now());
  }
  enableManual(confirmed: boolean) {
    const reason=this.manualReason();if(!confirmed||reason)throw new Error(reason??'Confirm support, empty gripper, clearance, and cutoff access.');
    this.manual.enable();this.attempts.clearPermit();this.attempt=false;this.before=null;this.frozenPlan=null;this.phase='Observing';this.changed();
  }
  sendHolding(enabled: boolean, confirmed: boolean) {
    const reason=this.manualReason();if(!confirmed||reason)throw new Error(reason??'Keep the arm supported and pinch areas clear.');
    const action=enabled?'restore':'release';
    try { this.manual.begin(action,this.now(),this.positions!); }
    catch(error) { this.fault(error instanceof Error?error.message:'Manual setup storage failed.');return; }
    this.attempts.clearPermit();
    this.writePacket(encodeFactoryHolding(enabled),()=>{
      if(this.manual.pending&&this.now()-this.manual.pendingSince>=2000){this.fault('Holding-command write completed after its deadline; physical state is uncertain.');return;}
      try { this.manual.sent(action,this.positions??[]);this.evidence.clear(); }
      catch(error) { this.fault(error instanceof Error?error.message:'Could not record holding command completion.'); }
      this.changed();
    });
  }
  confirmHolding(confirmed: boolean) {
    const reason=this.manualReason();if(!confirmed||reason)throw new Error(reason??'Physically verify holding is restored and stable.');
    try { this.manual.confirm(this.positions!); }
    catch(error) { this.fault(error instanceof Error?error.message:'Could not record holding confirmation.');return; }
    this.phase='Observing';this.evidence.clear();this.changed();
  }
  manualReport() { return this.manual.report(); }

  private retryReason(scope: 'joint' | 'return'): string | null {
    if(this.manual.blocked)return 'Finish manual positioning and confirm holding before reviewing movement.';
    if (!this.connected || !this.visible()) return 'Reconnect explicitly, then wait for fresh readings.';
    if (this.writeInFlight || this.home?.activeRun || ['Enabled','Observing result','Fault','Stopped'].includes(this.phase)) return 'Stop the active operation and reconnect before review.';
    if (scope === 'joint' && this.plan.servo === 1) return 'The confirmed base test cannot be renewed here.';
    const reason = this.evidence.reason(this.now()); if (reason) return reason;
    try {
      const key = scope === 'return' ? RETURN_APPROVAL_KEY : this.plan.key;
      if (this.storage.getItem(key) === null) return 'No previous attempt needs renewal.';
      if (this.attempts.reason(key) === null) return 'One reviewed retry is already available for this connection.';
      referenceReturnProposal(this.positions!); // Recovery cannot widen the local region.
      return null;
    } catch (error) { return error instanceof Error ? error.message : 'Review is unavailable.'; }
  }

  reviewRetry(scope: 'joint' | 'return', confirmed: boolean): void {
    const reason = this.retryReason(scope);
    if (!confirmed || reason) throw new Error(reason ?? 'Confirm inspection and review of the prior attempt.');
    const key = scope === 'return' ? RETURN_APPROVAL_KEY : this.plan.key;
    this.attempts.review(key, this.positions!, scope === 'return' ? this.returnReport() : this.report());
    if (scope === 'return') this.home = null;
    else { this.frozenPlan = null; this.attempt = false; this.before = null; this.written = false; this.attemptId = null; }
    this.phase = 'Observing'; this.evidence.clear();
    this.message = 'Teacher review recorded. No command sent. Collect fresh evidence, then Enable and Send/Start separately.';
    this.changed();
  }
  recoveryHistory() { try { return this.attempts.history().map(review=>({...review,attempt:this.storage.getItem(`${review.scope}.retry.${review.id}`)})); } catch (error) { return { unavailable: true, reason: error instanceof Error ? error.message : 'Could not read recovery history.' }; } }

  private returnReason():string|null {
    if(this.manual.blocked)return 'Finish manual positioning and physically confirm holding before a return.';
    if(!this.connected||!this.positions||!this.visible())return 'Connect with this page visible before reviewing a return.';
    if(this.writeInFlight||this.home?.activeRun||['Enabled','Observing result','Fault'].includes(this.phase))return 'Resolve the active operation before enabling a return.';
    const approval = this.attempts.reason(RETURN_APPROVAL_KEY); if (approval) return approval;
    const reason=this.evidence.reason(this.now());if(reason)return reason;
    if(this.now()-this.lastCommandAt<900)return 'Waiting for the 900 ms command interval.';
    try{return referenceReturnProposal(this.positions).length?null:'Already within ±9 of Reference A; no movement needed.';}catch(error){return error instanceof Error?error.message:'Return route needs review.';}
  }
  enableReturn(confirmed:boolean,gripperClear:boolean){
    const reason=this.returnReason();if(!confirmed||!gripperClear||reason)throw new Error(reason??'Confirm full-route clearance and an empty gripper.');
    this.home=new StagedReferenceReturn(this.positions!,this.now());this.attempt=false;this.before=null;this.written=false;this.frozenPlan=null;this.phase='Observing';this.changed();
  }
  startReturn(confirmed:boolean,gripperClear:boolean){
    if(!confirmed||!gripperClear||this.home?.phase!=='Enabled'||!this.connected||!this.visible()||this.evidence.reason(this.now()))throw new Error('Return preconditions are no longer satisfied.');
    this.home.start(this.positions!,this.now());
    try{this.attempts.consume(RETURN_APPROVAL_KEY,{route:this.home.steps});}
    catch{this.fault('Return approval could not be consumed. No write attempted.');return;}
    this.pumpReturn();this.changed();
  }
  private pumpReturn(){
    if(!this.home||this.home.phase!=='Running')return;
    if(!this.connected||!this.visible()||this.now()-this.receivedAt>500){this.fault('Return connection/freshness/visibility check failed.');return;}
    const step=this.home.next(this.now());
    if(this.home.report().phase==='Fault'){this.fault(this.home.message);return;}
    if(step){if(this.writeInFlight){this.fault('A writer is still active.');return;}this.writeCommand(step.servo,step.target,()=>{this.home?.written(this.now());if(this.home?.phase==='Fault')this.fault(this.home.message);this.changed();});}
  }
  returnReport(){return this.home?.report()??null;}

  selectJoint(servo: number): void {
    if (!this.snapshot().canSelect) throw new Error('Stop/disconnect and resolve the current test before changing joints.');
    if (servo === 1) throw new Error('The base mapping is already confirmed; no repeat is offered.');
    this.plan = jointPlan(servo); this.evidence.clear(); this.before = null;
    this.attempts.clearPermit(); this.frozenPlan = null; this.attemptId = null;
    this.attempt = false; this.written = false; this.settled = [];
    this.phase = this.connected ? 'Observing' : 'Disconnected';
    this.message = `Servo ${servo} selected. Collect fresh evidence and review clearance before enabling.`; this.changed();
  }

  connect(select: () => Promise<TestPort>): void {
    if (this.connectionState !== 'Disconnected' || !this.visible()) return;
    // Another tab may have released the arm since this page was opened.
    // Refresh the durable interlock before acquiring any new serial session.
    this.manual = new ManualPositioning(this.storage);
    this.parser.reset(); this.evidence.clear(); this.positions = null; this.receivedAt = -Infinity;
    this.connection.connect(async () => {
      const port = await select(); this.port = port;
      // The read lifecycle owns the same exclusive lease until any outstanding
      // write settles and the port closes. A hung write cannot free a new writer.
      return {
        get readable() { return port.readable; },
        open: options => port.open(options),
        close: async () => { await this.pending?.catch(() => {}); await port.close(); this.port = null; },
      };
    });
  }

  enable(confirmed: boolean, gripperClear = false): void {
    if (this.plan.servo === 6 && !gripperClear) throw new Error('Confirm an empty gripper and clear pinch area before this test.');
    const reason = this.preflight();
    if (!confirmed || this.phase !== 'Observing' || reason) throw new Error(reason ?? 'Confirm the reviewed setup before enabling.');
    this.frozenPlan = this.candidatePlan();
    this.phase = 'Enabled'; this.message = `Enabled for one attempt: servo ${this.plan.servo} → ${this.frozenPlan.target}. Send is a separate deliberate action.`; this.changed();
  }

  send(gripperClear = false): void {
    if (this.plan.servo === 6 && !gripperClear) throw new Error('The gripper pinch area must still be confirmed clear.');
    const reason = this.preflight();
    if (this.phase !== 'Enabled' || reason) throw new Error(reason ?? 'Explicit Enable is required.');
    const plan = this.frozenPlan!;
    // Synchronous consumption and write initiation: no await can let Stop, a
    // second click, or another UI action interleave after validation.
    try {
      this.attemptId = this.attempts.consume(plan.key, { target: plan.target, startingWindow: [plan.startMin, plan.startMax], startingValue: this.positions![plan.servo - 1] });
    } catch { this.fault('Approval storage failed. No write was attempted. Review before proceeding.'); return; }
    this.before = [...this.positions!]; this.attempt = true; this.startedAt = this.now();
    this.phase = 'Observing result'; this.written = false; this.settled = [];
    this.message = 'One attempt consumed. Observing feedback; no retry or automatic return.';
    this.writeCommand(plan.servo,plan.target,()=>{
      if (this.phase !== 'Observing result') return;
      if (this.now() - this.startedAt >= 2000) { this.fault('Write/observation deadline exceeded; delivery may have occurred.'); return; }
      this.written = true; this.checkSettled(); this.changed();
    });
    this.changed();
  }

  private writeCommand(servo:number,target:number,completed:()=>void){
    this.writePacket(encodeGoalPosition(servo,target),completed);
  }
  private writePacket(packet:Uint8Array,completed:()=>void){
    if(this.writeInFlight){this.fault('Overlapping write rejected.');return;}
    if(this.now()-this.lastCommandAt<900){this.fault('Command interval violated. No write attempted.');return;}
    let writer: WritableStreamDefaultWriter<Uint8Array> | undefined;
    try {
      if (!this.port?.writable) throw new Error('No writable stream.');
      writer = this.port.writable.getWriter();
      const activeWriter = writer;
      this.writeInFlight = true;
      this.lastCommandAt = this.now();
      this.pending = activeWriter.write(packet).finally(() => { activeWriter.releaseLock(); this.writeInFlight = false; });
      void this.pending.then(completed, () => this.fault('Write failed; delivery may have occurred. No retry.'));
    } catch { this.writeInFlight = false; writer?.releaseLock(); this.fault('Write could not complete; approval remains consumed.'); }
    this.changed();
  }

  private receive(bytes: Uint8Array) {
    for (const frame of this.parser.push(bytes)) {
      if (!this.connected) break;
      if (frame.deviceId !== 255 || frame.command !== 11 || frame.payload.length !== 24) continue;
      const positions = decodePositions(frame);
      if (!positions) { this.fault('Weak or invalid expected telemetry. Test ended without further commands.'); break; }
      const at = this.now();
      if (this.receivedAt !== -Infinity && at - this.receivedAt > 500) { this.fault('Telemetry gap exceeded 500 ms.'); break; }
      this.positions = positions; this.receivedAt = at; this.evidence.observe(positions, at);
      if(this.home?.activeRun){
        if(this.home.phase==='Enabled'&&positions.some((n,i)=>Math.abs(n-this.home!.before[i]!)>5)){this.fault('Return starting state changed after enabling.');break;}
        this.home.observe(positions,at);if(this.home.phase==='Fault'){this.fault(this.home.message);break;}
        if(this.home.phase==='Complete')this.evidence.clear();
        this.changed();continue;
      }
      if (this.phase === 'Enabled' && this.preflight()) { this.fault('Starting conditions changed after enabling.'); break; }
      if (this.phase === 'Observing result') {
        const plan = this.frozenPlan!;
        if (at - this.startedAt >= 2000) { this.fault('Observation deadline exceeded. No correction or retry.'); break; }
        const selected = this.plan.servo - 1, value = positions[selected]!;
        const low = this.plan.servo === 1 ? 2036 : this.before![selected]! - 12;
        if (positions.some((position, index) => index !== selected && Math.abs(position - this.before![index]!) > 12) || value < low || value > plan.target + 12) {
          this.fault('Unexpected reported joint deviation. Use the reviewed physical cutoff procedure if needed.'); break;
        }
        if (Math.abs(value - plan.target) <= 12 && value - this.before![selected]! >= 8) {
          this.settled.push({ at, value }); this.settled = this.settled.slice(-100);
          if (Math.max(...this.settled.map(s => s.value)) - Math.min(...this.settled.map(s => s.value)) > 3) this.settled = [{ at, value }];
          this.checkSettled();
        } else this.settled = [];
      }
    }
    this.changed();
  }

  private checkSettled() {
    if (this.written && this.settled.length >= 3 && this.settled.at(-1)!.at - this.settled[0]!.at >= 200) {
      this.phase = 'Complete'; this.message = 'Feedback candidate recorded. Confirm the physical joint and direction yourself. No automatic return will run.';
    }
  }

  tick(): void {
    if (!this.connected) return;
    if (!this.visible()) { this.stop(); return; }
    if(this.manual.pending&&this.now()-this.manual.pendingSince>=2000){this.fault('Holding-command write deadline exceeded; physical state is uncertain.');return;}
    if(this.home?.activeRun){if(this.now()-this.receivedAt>500)this.fault('Return feedback is stale.');else this.pumpReturn();this.changed();return;}
    if (this.phase === 'Observing result' && this.now() - this.startedAt >= 2000) this.fault('Observation/write deadline exceeded. Delivery may have occurred; no retry.');
    else if (this.receivedAt !== -Infinity && this.now() - this.receivedAt > 500 && !['Complete', 'Fault', 'Stopped'].includes(this.phase)) this.fault('Telemetry is stale.');
    else if (this.receivedAt === -Infinity && this.now() - this.connectedAt > 2000) this.fault('No expected telemetry received.');
    this.changed();
  }

  private fault(message: string) { this.manual.interrupt(message,this.positions??[]);if(this.home&&this.home.phase!=='Complete')this.home.fail(message);this.phase = 'Fault'; this.message = message; this.evidence.clear(); this.connection.disconnect(); this.changed(); }
  stop() { this.manual.interrupt('Manual setup stopped/disconnected.',this.positions??[]);this.attempts.clearPermit();this.home?.stop();if (this.phase !== 'Complete' && this.phase !== 'Fault') { this.phase = 'Stopped'; this.message = 'Stopped/disarmed. A sent command cannot be recalled. No physical stop is guaranteed.'; } this.evidence.clear(); this.connection.disconnect(); this.changed(); }
  report() { const plan = this.candidatePlan(); return { format: 'nexarm-mapping-test-result', servo: plan.servo, approval: plan.key, attemptId: this.attemptId, target: plan.target, startingWindow: [plan.startMin, plan.startMax], attempted: this.attempt, written: this.written, phase: this.phase, message: this.message, before: this.before ? [...this.before] : null, latest: this.positions ? [...this.positions] : null, physicalJoint: null, observedDirection: null, capturedAt: new Date().toISOString() }; }
}
