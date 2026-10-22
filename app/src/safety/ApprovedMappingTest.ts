import { PassiveConnection } from '../serial/PassiveConnection';
import type { ReadOnlyPort } from '../serial/PassiveConnection';
import { FrameParser, decodePositions } from '../protocol/FrameParser';
import { encodeGoalPosition } from '../protocol/NexArmCodec';
import { ReferenceCapture } from '../robot/ReferenceCapture';
import { BASE_APPROVAL_KEY, jointPlan } from './JointTestPlans';
import type { JointTestPlan } from './JointTestPlans';
import { referenceReturnProposal } from './ReferenceReturnProposal';
import { RETURN_APPROVAL_KEY, StagedReferenceReturn } from './StagedReferenceReturn';

export interface TestPort extends ReadOnlyPort { readonly writable: WritableStream<Uint8Array> | null; }
// Keep the original key: changing the allowed observation window must never
// resurrect an approval that was already consumed by an earlier app version.
export const APPROVAL_KEY = BASE_APPROVAL_KEY;
type Phase = 'Disconnected' | 'Observing' | 'Enabled' | 'Observing result' | 'Complete' | 'Stopped' | 'Fault';

// A fixed, teacher-approved commissioning exception. No caller supplies targets,
// servo IDs, packets, retries, or a way to reset the consumed approval.
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

  constructor(locks: LockManager, private readonly storage: Pick<Storage, 'getItem' | 'setItem'>,
    private readonly now: () => number, private readonly visible: () => boolean,
    private readonly changed: () => void, servo = 1) {
    this.plan = jointPlan(servo);
    this.connection = new PassiveConnection((state, message) => {
      this.connectionState = state; this.connected = state === 'Listening';
      if (this.connected) { this.phase = 'Observing'; this.connectedAt = this.now(); this.message = 'Collecting full-checksum starting-state evidence.'; }
      else {
        if(this.home?.activeRun)this.home.fail('Connection lost during return. No further command is authorized.');
        this.evidence.clear();
        if (this.phase === 'Observing result') { this.phase = 'Fault'; this.message = 'Connection lost; delivery/movement may have occurred. No retry.'; }
        else if (!['Complete', 'Fault', 'Stopped'].includes(this.phase)) { this.phase = 'Disconnected'; this.message = message; }
      }
      this.changed();
    }, bytes => this.receive(bytes), locks);
  }

  private approvalReason(): string | null {
    try { return this.storage.getItem(this.plan.key) === null ? null : 'This approval has already been consumed. No repeat or return command is authorized.'; }
    catch { return 'Local approval storage is unavailable. Sending is disabled.'; }
  }

  private preflight(): string | null {
    if(this.home?.activeRun)return 'A reference return is enabled/running. Joint tests are disabled.';
    if (!this.visible()) return 'The test page must be visible.';
    if (this.approvalReason()) return this.approvalReason();
    if (!this.connected || !this.port) return 'Connect and wait for fresh telemetry.';
    if (['Fault', 'Stopped', 'Complete', 'Observing result'].includes(this.phase)) return 'This run is closed. No command is available.';
    const reason = this.evidence.reason(this.now()); if (reason) return reason;
    const window = this.evidence.capture(this.now());
    const selected = this.plan.servo - 1;
    if (window.observation.min[selected]! < this.plan.startMin || window.observation.max[selected]! > this.plan.startMax) return `Servo ${this.plan.servo} must remain within ${this.plan.startMin}–${this.plan.startMax} throughout the observation window. Do not reset the physical arm to fit this test.`;
    for (let i = 0; i < 6; i++) {
      if (i === selected) continue;
      if (this.plan.servo !== 1 && i === 0) {
        const minimum = window.observation.min[0]!, maximum = window.observation.max[0]!;
        const atReference = minimum >= 2043 && maximum <= 2053;
        const afterBaseTest = minimum >= 2061 && maximum <= 2071;
        if (!atReference && !afterBaseTest) return 'Base must match either Reference A (2043–2053) or the completed base test (2061–2071). A different pose needs review.';
        continue;
      }
      let low = this.plan.reference[i]! - 12, high = this.plan.reference[i]! + 12;
      // Previously attempted suite joints may remain near their original region
      // or the declared target. Actual readback, not the marker, supplies position.
      if (this.plan.servo !== 1 && i > 0) {
        try { if (this.storage.getItem(jointPlan(i + 1).key) !== null) high = jointPlan(i + 1).target + 12; }
        catch { return 'Local approval storage is unavailable.'; }
      }
      if (window.observation.min[i]! < low || window.observation.max[i]! > high) return 'The other joints do not match the reviewed reference/test regions. Review a new reference.';
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
      canSelect: !this.home?.activeRun && !this.writeInFlight && ['Disconnected', 'Listening'].includes(this.connectionState) && !['Enabled', 'Observing result', 'Fault'].includes(this.phase),
      homeCanEnable: this.returnReason()===null, homeCanStart: this.home?.phase==='Enabled'&&this.connected&&this.visible()&&this.now()-this.receivedAt<=500,
      homePhase:this.home?.phase??'Not started',homeMessage:this.home?.message??this.returnReason() };
  }

  private returnReason():string|null {
    if(!this.connected||!this.positions||!this.visible())return 'Connect with this page visible before reviewing a return.';
    if(this.writeInFlight||this.home?.activeRun||['Enabled','Observing result','Fault'].includes(this.phase))return 'Resolve the active operation before enabling a return.';
    try{if(this.storage.getItem(RETURN_APPROVAL_KEY)!==null)return 'This commissioning return attempt is consumed; another attempt needs review.';}catch{return 'Approval storage is unavailable.';}
    const reason=this.evidence.reason(this.now());if(reason)return reason;
    try{return referenceReturnProposal(this.positions).length?null:'Already within ±5 of Reference A; no movement needed.';}catch(error){return error instanceof Error?error.message:'Return route needs review.';}
  }
  enableReturn(confirmed:boolean,gripperClear:boolean){
    const reason=this.returnReason();if(!confirmed||!gripperClear||reason)throw new Error(reason??'Confirm full-route clearance and an empty gripper.');
    this.home=new StagedReferenceReturn(this.positions!,this.now());this.attempt=false;this.before=null;this.written=false;this.phase='Observing';this.changed();
  }
  startReturn(confirmed:boolean,gripperClear:boolean){
    if(!confirmed||!gripperClear||this.home?.phase!=='Enabled'||!this.connected||!this.visible()||this.evidence.reason(this.now()))throw new Error('Return preconditions are no longer satisfied.');
    this.home.start(this.positions!,this.now());
    try{if(this.storage.getItem(RETURN_APPROVAL_KEY)!==null)throw new Error('Already consumed');const marker=JSON.stringify({consumedAt:new Date().toISOString(),route:this.home.steps});this.storage.setItem(RETURN_APPROVAL_KEY,marker);if(this.storage.getItem(RETURN_APPROVAL_KEY)!==marker)throw new Error('Storage failed');}
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
    this.attempt = false; this.written = false; this.settled = [];
    this.phase = this.connected ? 'Observing' : 'Disconnected';
    this.message = `Servo ${servo} selected. Collect fresh evidence and review clearance before enabling.`; this.changed();
  }

  connect(select: () => Promise<TestPort>): void {
    if (this.connectionState !== 'Disconnected' || !this.visible()) return;
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
    this.phase = 'Enabled'; this.message = `Enabled for one attempt: servo ${this.plan.servo} → ${this.plan.target}. Send is a separate deliberate action.`; this.changed();
  }

  send(gripperClear = false): void {
    if (this.plan.servo === 6 && !gripperClear) throw new Error('The gripper pinch area must still be confirmed clear.');
    const reason = this.preflight();
    if (this.phase !== 'Enabled' || reason) throw new Error(reason ?? 'Explicit Enable is required.');
    // Synchronous consumption and write initiation: no await can let Stop, a
    // second click, or another UI action interleave after validation.
    const marker = JSON.stringify({ approval: this.plan.key, consumedAt: new Date().toISOString(), target: this.plan.target, startingWindow: [this.plan.startMin, this.plan.startMax], startingValue: this.positions![this.plan.servo - 1] });
    try {
      this.storage.setItem(this.plan.key, marker);
      if (this.storage.getItem(this.plan.key) !== marker) throw new Error('Approval could not be durably marked.');
    } catch { this.fault('Approval storage failed. No write was attempted. Review before proceeding.'); return; }
    this.before = [...this.positions!]; this.attempt = true; this.startedAt = this.now();
    this.phase = 'Observing result'; this.written = false; this.settled = [];
    this.message = 'One attempt consumed. Observing feedback; no retry or automatic return.';
    this.writeCommand(this.plan.servo,this.plan.target,()=>{
      if (this.phase !== 'Observing result') return;
      if (this.now() - this.startedAt >= 2000) { this.fault('Write/observation deadline exceeded; delivery may have occurred.'); return; }
      this.written = true; this.checkSettled(); this.changed();
    });
    this.changed();
  }

  private writeCommand(servo:number,target:number,completed:()=>void){
    if(this.writeInFlight){this.fault('Overlapping write rejected.');return;}
    let writer: WritableStreamDefaultWriter<Uint8Array> | undefined;
    try {
      if (!this.port?.writable) throw new Error('No writable stream.');
      writer = this.port.writable.getWriter();
      const activeWriter = writer;
      this.writeInFlight = true;
      this.pending = activeWriter.write(encodeGoalPosition(servo,target)).finally(() => { activeWriter.releaseLock(); this.writeInFlight = false; });
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
        if (at - this.startedAt >= 2000) { this.fault('Observation deadline exceeded. No correction or retry.'); break; }
        const selected = this.plan.servo - 1, value = positions[selected]!;
        const low = this.plan.servo === 1 ? 2036 : this.plan.startMin - 12;
        if (positions.some((position, index) => index !== selected && Math.abs(position - this.before![index]!) > 12) || value < low || value > this.plan.target + 12) {
          this.fault('Unexpected reported joint deviation. Use the reviewed physical cutoff procedure if needed.'); break;
        }
        if (Math.abs(value - this.plan.target) <= 12 && value - this.before![selected]! >= 8) {
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
    if(this.home?.activeRun){if(this.now()-this.receivedAt>500)this.fault('Return feedback is stale.');else this.pumpReturn();this.changed();return;}
    if (this.phase === 'Observing result' && this.now() - this.startedAt >= 2000) this.fault('Observation/write deadline exceeded. Delivery may have occurred; no retry.');
    else if (this.receivedAt !== -Infinity && this.now() - this.receivedAt > 500 && !['Complete', 'Fault', 'Stopped'].includes(this.phase)) this.fault('Telemetry is stale.');
    else if (this.receivedAt === -Infinity && this.now() - this.connectedAt > 2000) this.fault('No expected telemetry received.');
    this.changed();
  }

  private fault(message: string) { if(this.home&&this.home.phase!=='Complete')this.home.fail(message);this.phase = 'Fault'; this.message = message; this.evidence.clear(); this.connection.disconnect(); this.changed(); }
  stop() { this.home?.stop();if (this.phase !== 'Complete' && this.phase !== 'Fault') { this.phase = 'Stopped'; this.message = 'Stopped/disarmed. A sent command cannot be recalled. No physical stop is guaranteed.'; } this.evidence.clear(); this.connection.disconnect(); this.changed(); }
  report() { return { format: 'nexarm-mapping-test-result', servo: this.plan.servo, approval: this.plan.key, target: this.plan.target, startingWindow: [this.plan.startMin, this.plan.startMax], attempted: this.attempt, written: this.written, phase: this.phase, message: this.message, before: this.before ? [...this.before] : null, latest: this.positions ? [...this.positions] : null, physicalJoint: null, observedDirection: null, capturedAt: new Date().toISOString() }; }
}
