import { PassiveConnection } from '../serial/PassiveConnection';
import type { ReadOnlyPort } from '../serial/PassiveConnection';
import { FrameParser, decodePositions } from '../protocol/FrameParser';
import { encodeFactoryHolding, encodeSpeedPosition } from '../protocol/NexArmCodec';
import { ManualPositioning } from './ManualPositioning';
import { SmoothTeacherMotion, smoothPlan, MOTION_SPEED, MOTION_ACCELERATION, HOME_SPEED, absoluteJointPlan } from './SmoothTeacherMotion';

import { TEACHER_HOME } from './TeacherControlPlan';

export interface TeacherPort extends ReadOnlyPort { readonly writable: WritableStream<Uint8Array> | null; }
type Operation = 'Jog' | 'Home' | 'Servo 3 factory comparison' | 'Slider';

// Teacher-only direct controls. All jog, Home, and holding writes pass through
// the same executor and exclusive USB lease. No click is queued for later.
export class TeacherRobotControl {
  private readonly connection: PassiveConnection;
  private readonly parser = new FrameParser();
  private manual: ManualPositioning;
  private port: TeacherPort | null = null;
  private connectionState = 'Disconnected';
  private positions: readonly number[] | null = null;
  private receivedAt = -Infinity;
  private connectedAt = 0;
  private armed = false;
  private faulted = false;
  private message = 'Connect to read positions, then enable teacher controls.';
  private writeInFlight = false;
  private pending: Promise<void> | null = null;
  private lastCommandAt = -Infinity;
  private generation = 0;
  private writeStartedAt=-Infinity;
  private lastMovingServo:number|null=null;
  private route: SmoothTeacherMotion | null = null;
  private operation: Operation | null = null;
  private history: unknown[] = [];

  constructor(locks: LockManager, private readonly storage: Pick<Storage, 'getItem' | 'setItem'>,
    private readonly now: () => number, private readonly visible: () => boolean,
    private readonly changed: () => void) {
    this.manual = new ManualPositioning(storage);
    this.connection = new PassiveConnection((state, message) => {
      this.connectionState = state;
      if (state === 'Listening') {
        this.connectedAt = this.now(); this.message = 'Connected. Positions are read-only until you enable controls.';
      } else {
        this.armed = false; this.generation++;
        this.manual.interrupt('Connection ended.', this.positions ?? []);
        if (this.route?.activeRun) this.route.fail('Connection lost. Future steps canceled.');

        if (!this.faulted) this.message = message;
      }
      this.changed();
    }, bytes => this.receive(bytes), locks);
  }

  connect(select: () => Promise<TeacherPort>) {
    if (this.connectionState !== 'Disconnected' || !this.visible()) return;
    this.manual = new ManualPositioning(this.storage);
    this.armed = false; this.faulted = false; this.route = null; this.operation = null;
     this.parser.reset();  this.positions = null; this.receivedAt = -Infinity;
    this.connection.connect(async () => {
      const port = await select(); this.port = port;
      return {get readable() { return port.readable; }, open: options => port.open(options),
        close: async () => { await this.pending?.catch(() => {}); await port.close(); this.port = null; }};
    });
  }

  private idleReason(): string | null {
    if (this.connectionState !== 'Listening') return 'Connect to the robot.';
    if (!this.visible()) return 'Keep this page visible.';
    if (this.writeInFlight || this.manual.pending) return 'Waiting for the current write to finish.';
    if (this.route?.activeRun) return 'Movement is in progress. Other clicks are not queued.';
    if (this.now()-this.receivedAt>500) return 'Waiting for current position feedback; controls remain enabled.';
    if (this.now()-this.lastCommandAt<500) return 'Finishing the half-second command interval.';
    return null;
  }
  private enableReason(): string | null {
    if (this.manual.blocked) return 'Restore and physically confirm holding in Manual positioning below.';
    return this.idleReason();
  }
  private movementReason(): string | null {
    if (!this.armed) return 'Enable teacher controls first.';
    return this.enableReason();
  }
  snapshot() {
    const reason = this.movementReason(), idle = this.idleReason();
    return {connectionState: this.connectionState, positions: this.positions ? [...this.positions] : null,
      armed: this.armed, faulted: this.faulted, message: this.message, reason,
      canConnect: this.connectionState === 'Disconnected', canEnable: !this.armed && this.enableReason() === null,
      enableReason: this.enableReason(), canMove: reason === null,
      sliderServo:this.operation==='Slider'&&this.route?.phase==='Running'&&this.armed&&!this.manual.blocked&&this.visible()&&!this.writeInFlight&&this.now()-this.receivedAt<=500&&this.now()-this.lastCommandAt>=500?this.route.status().next?.servo:null,
      home: this.route?.status() ?? null, operation: this.operation,
      busy: this.writeInFlight || !!this.route?.activeRun || this.manual.pending,
      manualPhase: this.manual.phase, manualMessage: this.manual.message, manualReason: idle,
      canRelease: this.manual.phase === 'Normal' && idle === null,
      canRestore: ['Manual setup', 'Recovery required'].includes(this.manual.phase) && idle === null,
      canConfirmHolding: ['Confirm holding', 'Recovery required'].includes(this.manual.phase) && idle === null};
  }

  enable(confirmed: boolean) {
    const reason = this.enableReason();
    if (!confirmed || reason) throw new Error(reason ?? 'Confirm holding, clearance, and physical cutoff access.');
    this.armed = true; this.faulted = false;
    this.message = 'Teacher controls enabled. Each jog click sends one step; Home runs only when clicked.';
    this.changed();
  }
  jog(servo: number, delta: number) {
    const reason = this.movementReason(); if (reason) throw new Error(reason);
    this.start(smoothPlan(this.positions!, servo, delta), 'Jog');
  }
  moveJoint(servo:number,target:number,speed=2000,acceleration=100){
    const same=this.operation==='Slider'&&this.route?.phase==='Running'&&this.route.status().next?.servo===servo;
    if(same){if(!this.armed||this.manual.blocked||this.connectionState!=='Listening'||!this.visible()||this.writeInFlight||this.now()-this.receivedAt>500||this.now()-this.lastCommandAt<500)throw Error('Wait for fresh feedback and the half-second interval.');}
    else {const reason=this.movementReason();if(reason)throw Error(reason);}
    const plan=absoluteJointPlan(this.positions!,servo,target,speed,acceleration);
    if(same)this.route!.stop();this.start(plan,'Slider');
  }
  compareServo3Factory() {
    const reason=this.movementReason();if(reason)throw new Error(reason);
    this.start(smoothPlan(this.positions!,3,20,{speed:2000,acceleration:100}),'Servo 3 factory comparison');
  }
  returnHome() {
    const reason = this.movementReason(); if (reason) throw new Error(reason);
    this.start(smoothPlan(this.positions!,undefined,undefined,{speed:HOME_SPEED,acceleration:MOTION_ACCELERATION}), 'Home');
  }
  private start(plan: ReturnType<typeof smoothPlan>, operation: Operation) {
    this.retain();
    this.route = new SmoothTeacherMotion(this.positions!, this.now(), plan); this.operation = operation;
    if (this.route.phase === 'Complete') { this.message = this.route.message; this.changed(); return; }
    this.route.start(this.positions!, this.now());
    this.message = operation === 'Home' ? 'Returning slowly to Teacher Home, one joint at a time.' : 'Jogging one joint. Wait for feedback before another click.';
    this.pump(); this.changed();
  }
  private pump() {
    const route = this.route;
    if (!route || route.phase !== 'Running') return;
    if (!this.armed || this.connectionState !== 'Listening' || !this.visible() || this.now() - this.receivedAt > 1500) {
      this.fault('Movement stopped: connection, visibility, or fresh feedback changed.'); return;
    }
    if (this.writeInFlight || this.now() - this.lastCommandAt < 500) return;
    const step = route.next(this.now());
    if (route.status().phase === 'Fault') { this.fault(route.message); return; }
    if (step) { this.lastMovingServo=step.servo; this.write(encodeSpeedPosition(step.servo, step.target, route.speed, route.acceleration), () => {
      route.written(this.now()); this.checkRoute();
    }); }
  }
  private checkRoute() {
    if (this.route?.phase === 'Fault') { this.fault(this.route.message); return; }
    if (this.route?.phase === 'Settled short'){this.lastMovingServo=null;this.message=this.route.message;}
    if (this.route?.phase === 'Complete') {
      this.lastMovingServo=null;

      this.message = this.operation === 'Home' ? 'Home reached within 9 raw units. Inspect the pose; no correction loop runs.' : 'Jog finished.';
    }
    this.changed();
  }

  // Existing factory All Off/All On workflow, available without enabling motion.
  setHolding(enabled: boolean, supported: boolean) {
    const reason = this.idleReason();
    if (!supported || reason) throw new Error(reason ?? 'Support the arm and confirm clear pinch areas and cutoff access.');
    if (typeof enabled !== 'boolean') throw new Error('Choose release or restore.');
    this.armed = false;
    try {
      if (!enabled && this.manual.phase === 'Normal') this.manual.enable();
      this.manual.begin(enabled ? 'restore' : 'release', this.now(), this.positions!);
    } catch (error) { this.fault(error instanceof Error ? error.message : 'Holding setup could not be recorded.'); return; }
    this.write(encodeFactoryHolding(enabled), () => {
      this.manual.sent(enabled ? 'restore' : 'release', this.positions ?? []);
      this.message = this.manual.message; this.changed();
    });
  }
  confirmHolding(confirmed: boolean) {
    const reason = this.idleReason();
    if (!confirmed || reason) throw new Error(reason ?? 'Physically verify holding is restored and stable.');
    try { this.manual.confirm(this.positions!); }
    catch (error) { this.fault(error instanceof Error ? error.message : 'Holding confirmation could not be recorded.'); return; }
    this.armed = false; this.faulted = false;
    this.message = 'Holding confirmed. Movement controls remain off until Enable.'; this.changed();
  }

  private write(packet: Uint8Array, completed: () => void, urgent = false) {
    if (this.writeInFlight || (!urgent && this.now() - this.lastCommandAt < 500) || !this.port?.writable) {
      this.fault('Writer is unavailable. No command queued.'); return;
    }
    let writer: WritableStreamDefaultWriter<Uint8Array> | undefined;
    const generation = this.generation, started = this.now();
    try {
      writer = this.port.writable.getWriter(); const activeWriter = writer;
      this.writeInFlight = true; this.writeStartedAt=started; this.lastCommandAt = started;
      this.pending = activeWriter.write(packet).finally(() => {
        activeWriter.releaseLock(); this.writeInFlight = false;
        this.lastCommandAt = Math.max(this.lastCommandAt, this.now());
      });
      void this.pending.then(() => {
        if (generation !== this.generation) return;
        if (this.now() - started >= 2000) { this.fault('Write deadline exceeded; delivery may have occurred.'); return; }
        try { completed(); } catch (error) { this.fault(error instanceof Error ? error.message : 'Completion recording failed.'); }
      }, () => { if (generation === this.generation) this.fault('Write failed; delivery may have occurred. Inspect before enabling again.'); });
    } catch { writer?.releaseLock(); this.writeInFlight = false; this.fault('Write could not complete. Inspect before enabling again.'); }
    this.changed();
  }

  private receive(bytes: Uint8Array) {
    for (const frame of this.parser.push(bytes)) {
      if (this.connectionState !== 'Listening') break;
      if (frame.deviceId !== 255 || frame.command !== 11 || frame.payload.length !== 24) continue;
      const positions = decodePositions(frame), at = this.now();
      if (!positions) continue;

      this.positions = positions; this.receivedAt = at;
      if (this.route?.phase === 'Running') {
        this.route.observe(positions, at);
        const phase = this.route.status().phase;
        if (phase === 'Fault' || phase === 'Complete' || phase === 'Settled short') this.checkRoute();
      }
    }
    this.changed();
  }
  tick() {
    if (this.connectionState !== 'Listening') return;
    if (!this.visible()) { this.disconnect(); return; }
    if(this.writeInFlight && this.now()-this.writeStartedAt>=2000 && !this.faulted){this.fault('USB write did not finish within two seconds. Delivery is uncertain.');return;}
    if (this.manual.pending && this.now() - this.manual.pendingSince >= 2000) {
      this.fault('Holding write deadline exceeded. Physical holding needs confirmation.'); return;
    }
    if (this.receivedAt === -Infinity ? this.now() - this.connectedAt > 2000 : this.now() - this.receivedAt > 1500) {
      if (this.route?.activeRun && !this.faulted) this.fault('Movement canceled after 1.5 seconds without valid feedback.'); this.changed(); return;
    }
    // Ask the feedback supervisor to check its deadline even while a write hangs.
    if (this.route?.phase === 'Running') {
      this.route.checkDeadline(this.now());
      if (this.route.status().phase === 'Fault') { this.fault(this.route.message); return; }
    }
    this.pump(); this.changed();
  }

  private retain() {
    if (this.route) this.history = [...this.history, {operation: this.operation, at: new Date().toISOString(), result: this.route.report()}].slice(-100);
  }
  private fault(message: string) {
    const moving=this.route?.activeRun;
    this.armed = false; this.faulted = true; this.generation++;
    if (this.route?.activeRun) this.route.fail(message);
    this.manual.interrupt(message, this.positions ?? []);  this.message = message+(moving?' Future targets canceled. Use Stop or the physical cutoff to intervene in the current movement.':''); this.changed();
  }
  stop() {
    const moving=this.lastMovingServo; this.lastMovingServo=null;
    this.armed = false; this.generation++; this.route?.stop();
    this.manual.interrupt('Stopped by teacher.', this.positions ?? []);
    this.message = 'Stopped. Future commands canceled; connection remains open.';
    if(moving && this.positions && this.now()-this.receivedAt<=500 && !this.writeInFlight && this.connectionState==='Listening') {
      this.write(encodeSpeedPosition(moving,this.positions[moving-1]!,MOTION_SPEED,MOTION_ACCELERATION),()=>{this.message='Hold target sent at the latest measured position. Verify the arm has stopped, then enable when ready.';this.changed();},true);
    } else if(moving) this.message='Future commands canceled. Could not send a fresh hold target; use the physical cutoff if needed.';
    this.changed();
  }
  disconnect() { this.stop(); this.connection.disconnect(); }
  report() {
    return {format: 'nexarm-teacher-control-session', schemaVersion: 1, capturedAt: new Date().toISOString(),
      home: [...TEACHER_HOME], latest: this.positions ? [...this.positions] : null,
      operations: [...this.history, ...(this.route ? [{operation: this.operation, result: this.route.report()}] : [])],
      manualPositioning: this.manual.report()};
  }
}
