import { PassiveConnection } from '../serial/PassiveConnection';
import type { ReadOnlyPort } from '../serial/PassiveConnection';
import { FrameParser, decodePositions } from '../protocol/FrameParser';
import { encodeFactoryHolding, encodeSpeedPosition, encodeSpeedPositions } from '../protocol/NexArmCodec';
import { ConcurrentHomeMotion } from './ConcurrentHomeMotion';
import {TimedPoseMotion,timedPosePlan} from './TimedPoseMotion';
import { ManualPositioning } from './ManualPositioning';
import { SmoothTeacherMotion, smoothPlan, MOTION_SPEED, MOTION_ACCELERATION, HOME_SPEED, absoluteJointPlan, absolutePosePlan } from './SmoothTeacherMotion';
import type { CommandedPath } from './SmoothTeacherMotion';
import {interpret} from '../runtime/instructions';
import type {PlannedStep} from '../runtime/instructions';

import { TEACHER_HOME } from './TeacherControlPlan';
import {assertJointTarget,assertPoseTargets,OPERATING_RANGES,poseIssues} from './OperatingRanges';

export interface TeacherPort extends ReadOnlyPort { readonly writable: WritableStream<Uint8Array> | null; }
type Operation = 'Jog' | 'Home' | 'Saved position' | 'Servo 3 factory comparison' | 'Slider' | 'Program';
type SliderTarget={servo:number;target:number;speed:number;acceleration:number};
const LIVE_TARGET_DEADBAND=10;
const PROGRAM_SPEED=600,PROGRAM_ACCELERATION=10;
type WriteDiagnostic={atMs:number;operation:Operation|null;bytes:number[];positions:number[]|null;finishedAtMs:number|null;outcome:'not-submitted'|'pending'|'stream-write-resolved'|'stream-write-rejected'};

// Teacher-only direct controls. All jog, Home, and holding writes pass through
// the same executor and exclusive USB lease. Live dragging retains only the
// newest unsent target; discrete clicks are never queued.
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
  private message = 'Connect to read positions, then enable robot controls.';
  private writeInFlight = false;
  private writeUncertain=false;
  private pending: Promise<void> | null = null;
  private lastCommandAt = -Infinity;
  private generation = 0;
  private writeStartedAt=-Infinity;
  private lastMovingServos:number[]=[];
  private readySamples:{at:number;positions:number[]}[]=[];
  private updateDirectSession(){
    if(!this.options.directSession||this.idleReason()!==null||this.readySamples.length!==3||!this.positions)return;
    const samples=this.readySamples;
    if(samples[2]!.at-samples[0]!.at<150||samples[0]!.at<this.now()-1000||this.positions.some((_,i)=>Math.max(...samples.map(sample=>sample.positions[i]!))-Math.min(...samples.map(sample=>sample.positions[i]!))>9))return;
    if(this.manual.phase==='Confirm holding'){
      try{this.manual.finishRestoreFromFeedback(this.positions);this.message=this.manual.message;}
      catch(error){this.fault(error instanceof Error?error.message:'Restore could not be recorded.');return;}
    }
    if(!this.manual.blocked&&!this.armed){this.armed=true;if(!this.faulted)this.message='Ready. Choose Run, a saved position, or a joint control. No movement starts automatically.';}
  }
  private route: SmoothTeacherMotion | ConcurrentHomeMotion | TimedPoseMotion | null = null;
  private operation: Operation | null = null;
  private history: unknown[] = [];
  private writes:WriteDiagnostic[]=[];
  private events:{atMs:number;kind:string;message:string;positions:number[]|null}[]=[];
  private recordEvent(kind:string,message:string){this.events=[...this.events,{atMs:this.now(),kind,message,positions:this.positions?[...this.positions]:null}].slice(-200);}
  private liveTarget:SliderTarget|null=null;
  private lastLive:SliderTarget|null=null;
  private sliderInterval=500;
  private program:{steps:PlannedStep[];speed:number;acceleration:number;stationLimitsEnforced:false;index:number;at:number;waitUntil:number|null;phase:'Running'|'Completed'|'Stopped'|'Fault';message:string}|null=null;
  private cancelProgram(phase:'Stopped'|'Fault',message:string){if(this.program?.phase==='Running'){this.program.phase=phase;this.program.message=message;}}
  runProgram(instructions:unknown){
    const reason=this.movementReason();if(reason)throw Error(reason);
    // Development testing only. The bounded language validates IDs and raw
    // encoding values; protected robot-specific limits are a student-release gate.
    const steps=interpret(instructions);
    // Validate the entire program before the first write, including later poses.
    for(const step of steps){if(step.kind==='pose')assertPoseTargets(step.positions,`Saved position "${step.name}"`);else if(step.kind!=='wait')assertJointTarget(step.servo,step.target);}
    this.liveTarget=null;this.lastLive=null;this.retain();this.route=null;this.operation='Program';
    this.program={steps,speed:PROGRAM_SPEED,acceleration:PROGRAM_ACCELERATION,stationLimitsEnforced:false,index:0,at:this.now(),waitUntil:null,phase:'Running',message:'Running your program.'};
    this.advanceProgram();this.changed();
  }
  private advanceProgram(){
    const program=this.program;if(program?.phase!=='Running'||this.route?.activeRun)return;
    if(!this.armed||this.connectionState!=='Listening'||!this.visible()){this.fault('Program canceled because the robot session changed.');return;}
    if(this.writeInFlight||this.now()-this.receivedAt>500)return;
    if(program.waitUntil!==null){if(this.now()<program.waitUntil)return;program.waitUntil=null;program.message='Running your program.';}
    if(program.index===program.steps.length){program.phase='Completed';program.message='Program complete. Edit your blocks and run again.';this.message=program.message;return;}
    if(this.now()-this.lastCommandAt<500)return;
    try{
      const step=program.steps[program.index]!;
      if(step.kind==='wait'){
        this.retain();this.route=null;program.index++;program.waitUntil=this.now()+step.durationMs;program.message=`Waiting ${step.durationMs/1000} seconds.`;this.message=program.message;return;
      }
      if(step.kind==='pose'&&this.options.directSession){program.index++;this.startTimedPose(step.positions,step.durationMs??1000,'Program');return;}
      const plan=step.kind==='pose'?absolutePosePlan(this.positions!,step.positions,{speed:program.speed,acceleration:program.acceleration}):absoluteJointPlan(this.positions!,step.servo,step.target,program.speed,program.acceleration);
      program.index++;this.start({...plan,manual:false},'Program');
    }catch(error){this.fault(error instanceof Error?error.message:'Program movement could not start.');}
  }
  private liveServo(){
    if(!this.armed||this.manual.blocked||!this.visible()||this.connectionState!=='Listening'||this.now()-this.receivedAt>500)return null;
    return this.liveTarget?.servo??(this.operation==='Slider'&&(this.route?.phase==='Running'||this.lastLive!==null)?(this.route?.status().command?.servo??this.route?.status().next?.servo):null);
  }
  liveJoint(servo:number,target:number,speed=2000,acceleration=100,final=false){
    if(this.program?.phase==='Running')throw Error('Stop the program before using manual controls.');
    absoluteJointPlan(this.positions??[],servo,target,speed,acceleration);
    assertJointTarget(servo,target);
    const active=this.liveServo();
    if(!this.armed||this.manual.blocked||!this.visible()||this.connectionState!=='Listening'||this.now()-this.receivedAt>500)throw Error('Enable controls and wait for fresh readings.');
    if((active&&active!==servo&&(this.route?.activeRun||this.writeInFlight||this.liveTarget))||(this.route?.activeRun&&!(this.operation==='Slider'&&active===servo))||this.manual.pending)throw Error('Another joint or operation is active.');
    const same=this.lastLive?.servo===servo&&this.lastLive.speed===speed&&this.lastLive.acceleration===acceleration;
    if(same&&(target===this.lastLive!.target||(!final&&Math.abs(target-this.lastLive!.target)<LIVE_TARGET_DEADBAND))){this.liveTarget=null;this.changed();return;}
    this.liveTarget={servo,target,speed,acceleration};this.flushLive();this.changed();
  }
  private flushLive(){
    if(!this.liveTarget)return;
    if(!this.armed||this.manual.blocked||!this.visible()||this.connectionState!=='Listening'){this.liveTarget=null;return;}
    if(this.writeInFlight||this.now()-this.receivedAt>500||this.now()-this.lastCommandAt<100)return;
    if(this.route?.activeRun&&!(this.operation==='Slider'&&this.route.status().next?.servo===this.liveTarget.servo)){this.liveTarget=null;return;}
    const next=this.liveTarget;this.liveTarget=null;
    this.applyJoint(next.servo,next.target,next.speed,next.acceleration,true);
    this.lastLive={...next};
  }

  constructor(locks: LockManager, private readonly storage: Pick<Storage, 'getItem' | 'setItem'>,
    private readonly now: () => number, private readonly visible: () => boolean,
    private readonly changed: () => void,private readonly options:{directSession?:boolean}={}) {
    this.manual = new ManualPositioning(storage);
    this.connection = new PassiveConnection((state, message) => {
      this.connectionState = state;
      this.recordEvent('connection',`${state}: ${message}`);
      if (state === 'Listening') {
        this.connectedAt = this.now(); this.message = this.options.directSession?'Connected. Waiting for fresh stable position feedback.':'Connected. Positions are read-only until you enable controls.';
      } else {
        this.cancelProgram('Fault','Robot connection ended.');
        this.armed = false; this.liveTarget=null;this.lastLive=null; this.generation++;
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
    this.readySamples=[];
    this.writeUncertain=false;
    this.liveTarget=null;this.lastLive=null;this.armed = false; this.faulted = false; this.route = null; this.operation = null;this.program=null;
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
    if(this.writeUncertain)return 'USB command delivery is uncertain. Disconnect and reconnect before another command.';
    if (this.writeInFlight || this.manual.pending) return 'Waiting for the current write to finish.';
    if(this.program?.phase==='Running')return 'Program is running. Stop it before using manual controls.';
    if (this.route?.activeRun) return 'Movement is in progress. Other clicks are not queued.';
    if (this.now()-this.receivedAt>500) return 'Waiting for current position feedback; controls remain enabled.';
    if (this.now()-this.lastCommandAt<500) return 'Finishing the half-second command interval.';
    return null;
  }
  private enableReason(): string | null {
    if (this.manual.blocked) return this.options.directSession?'Servos released or restore incomplete. Use Restore servo holding, then wait for fresh stable readings.':'Restore and physically confirm holding in Manual positioning below.';
    return this.idleReason();
  }
  private movementReason(): string | null {
    if (!this.armed) return this.options.directSession?(this.enableReason()??'Waiting for fresh stable readings before the next action.'):'Enable robot controls first.';
    return this.enableReason();
  }
  snapshot() {
    const reason = this.movementReason(), idle = this.idleReason();
    const captureReason=idle??(this.positions?(poseIssues(this.positions).join(' ')||null):'Wait for six current position readings.');
    return {connectionState: this.connectionState, positions: this.positions ? [...this.positions] : null,
      armed: this.armed, faulted: this.faulted, message: this.message, reason,
      canConnect: this.connectionState === 'Disconnected', canEnable: !this.armed && this.enableReason() === null,
      enableReason: this.enableReason(), canMove: reason === null&&!this.liveTarget,liveServo:this.liveServo(),
      sliderServo:this.operation==='Slider'&&this.route?.phase==='Running'&&this.armed&&!this.manual.blocked&&this.visible()&&!this.writeInFlight&&this.now()-this.receivedAt<=500&&this.now()-this.lastCommandAt>=500?this.route.status().next?.servo:null,
      home: this.route?.status() ?? null, operation: this.operation,
      program:this.program?{phase:this.program.phase,message:this.program.message,completed:this.program.phase==='Completed'?this.program.steps.length:Math.max(0,this.program.index-(this.route?.phase==='Complete'?0:1)),total:this.program.steps.length,activeStep:this.program.phase==='Running'?this.program.index-1:null}:null,
      busy: this.writeInFlight || !!this.route?.activeRun || this.manual.pending || this.program?.phase==='Running',
      manualPhase: this.options.directSession&&this.manual.phase==='Confirm holding'?'Restore settling':this.manual.phase, manualMessage: this.manual.message, manualReason: idle,
      feedbackFresh:this.connectionState==='Listening'&&this.visible()&&this.now()-this.receivedAt<=500,
      canCapture:captureReason===null,captureReason,
      canRelease: this.manual.phase === 'Normal' && idle === null,
      canRestore: ['Manual setup', 'Recovery required'].includes(this.manual.phase) && idle === null,
      canConfirmHolding: ['Confirm holding', 'Recovery required'].includes(this.manual.phase) && idle === null};
  }

  capturePosition():number[]{
    const reason=this.idleReason();if(reason)throw Error(reason);
    if(!this.positions)throw Error('Wait for six current position readings.');
    assertPoseTargets(this.positions,'Cannot record position');
    this.recordEvent('capture','Measured position snapshot read. No robot command sent.');
    return [...this.positions];
  }

  enable(confirmed: boolean) {
    const reason = this.enableReason();
    if (!confirmed || reason) throw new Error(reason ?? 'Confirm holding, clearance, and physical cutoff access.');
    this.armed = true; this.faulted = false;
    this.message = 'Robot controls enabled. Run a program or choose a manual action.';
    this.changed();
  }
  jog(servo: number, delta: number) {
    this.liveTarget=null;this.lastLive=null;
    const reason = this.movementReason(); if (reason) throw new Error(reason);
    this.start(smoothPlan(this.positions!, servo, delta), 'Jog');
  }
  moveJoint(servo:number,target:number,speed=2000,acceleration=100){
    this.liveTarget=null;this.lastLive=null;this.applyJoint(servo,target,speed,acceleration,false);
  }
  private applyJoint(servo:number,target:number,speed:number,acceleration:number,live:boolean){
    const interval=live?100:500;
    const same=this.operation==='Slider'&&this.route?.phase==='Running'&&this.route.status().next?.servo===servo;
    if(live){if(!this.armed||this.manual.blocked||this.connectionState!=='Listening'||!this.visible()||this.writeInFlight||this.now()-this.receivedAt>500||this.now()-this.lastCommandAt<interval)throw Error('Live slider is not ready.');}
    else if(same){if(!this.armed||this.manual.blocked||this.connectionState!=='Listening'||!this.visible()||this.writeInFlight||this.now()-this.receivedAt>500||this.now()-this.lastCommandAt<interval)throw Error('Wait for fresh feedback and the half-second interval.');}
    else {const reason=this.movementReason();if(reason)throw Error(reason);}
    const plan=absoluteJointPlan(this.positions!,servo,target,speed,acceleration);
    assertJointTarget(servo,target);
    const previousPath=same?this.route!.pathBounds():null;
    if(same)this.route!.stop();this.sliderInterval=interval;this.start(plan,'Slider',previousPath);
  }
  compareServo3Factory() {
    this.liveTarget=null;this.lastLive=null;
    const reason=this.movementReason();if(reason)throw new Error(reason);
    this.start(smoothPlan(this.positions!,3,20,{speed:2000,acceleration:100}),'Servo 3 factory comparison');
  }
  returnHome() {
    this.liveTarget=null;this.lastLive=null;
    const reason = this.movementReason(); if (reason) throw new Error(reason);
    if(this.options.directSession){this.startTimedPose(TEACHER_HOME,1000,'Home');return;}
    this.start(smoothPlan(this.positions!,undefined,undefined,{speed:HOME_SPEED,acceleration:MOTION_ACCELERATION}), 'Home');
  }
  moveToPosition(target:readonly number[],durationMs=1000){
    const reason=this.movementReason();if(reason)throw Error(reason);
    assertPoseTargets(target,'Saved position');
    if(this.options.directSession){this.startTimedPose(target,durationMs,'Saved position');return;}
    const plan=absolutePosePlan(this.positions!,target);
    this.liveTarget=null;this.lastLive=null;this.start(plan,'Saved position');
  }
  private startTimedPose(target:readonly number[],durationMs:number,operation:Operation){
    const plan=timedPosePlan(this.positions!,target,durationMs);
    this.retain();this.faulted=false;this.liveTarget=null;this.lastLive=null;this.lastMovingServos=[];
    this.route=new TimedPoseMotion(this.positions!,this.now(),plan);this.operation=operation;
    this.route.start(this.positions!,this.now());this.message=`Timed pose: requested ${durationMs/1000}s, planned ${plan.durationMs/1000}s; maximum speed 600, acceleration 10.`;
    this.pump();this.changed();
  }
  private start(plan: ReturnType<typeof smoothPlan>, operation: Operation,previousPath?:CommandedPath|null) {
    for(const step of plan.steps)assertJointTarget(step.servo,step.target);
    this.faulted=false;
    this.retain();
    const poseProgram=operation==='Program'&&this.program?.steps[this.program.index-1]?.kind==='pose';
    this.route = operation==='Home'||operation==='Saved position'||poseProgram?new ConcurrentHomeMotion(this.positions!,this.now(),plan,operation==='Home'?'Home':'saved position'):new SmoothTeacherMotion(this.positions!, this.now(), plan,previousPath,false,operation==='Program'); this.operation = operation;
    if (this.route.phase === 'Complete') { this.message = this.route.message; this.changed(); return; }
    this.route.start(this.positions!, this.now());
    this.message = operation === 'Home' ? 'Returning to Teacher Home with all needed joints moving together.' : operation==='Saved position'?'Moving to saved position with all needed joints together.':operation==='Program'?'Running your Blockly program. Waiting for each move to settle.':'Jogging one joint. Wait for feedback before another click.';
    this.pump(); this.changed();
  }
  private pump() {
    const route = this.route;
    if (!route || route.phase !== 'Running') return;
    if (!this.armed || this.connectionState !== 'Listening' || !this.visible() || this.now() - this.receivedAt > 1500) {
      this.fault('Movement stopped: connection, visibility, or fresh feedback changed.'); return;
    }
    if(route instanceof TimedPoseMotion){
      if(this.writeInFlight)return;
      const step=route.next(this.now());if(route.status().phase==='Fault'){this.fault(route.message);return;}
      if(step){this.lastMovingServos.push(step.servo);const generation=this.generation;
        this.write(encodeSpeedPosition(step.servo,step.target,step.speed,step.acceleration),()=>{route.written(this.now());this.checkRoute();setTimeout(()=>{if(this.route===route&&this.generation===generation)this.pump();},2);},false,2);
      }return;
    }
    if (this.writeInFlight || this.now() - this.lastCommandAt < (this.operation==='Slider'?this.sliderInterval:500)) return;
    if(route instanceof ConcurrentHomeMotion){
      const steps=route.nextBatch(this.now());
      if(route.status().phase==='Fault'){this.fault(route.message);return;}
      if(steps){this.lastMovingServos=steps.map(step=>step.servo);this.write(encodeSpeedPositions(steps,route.speed,route.acceleration),()=>{route.written(this.now());this.checkRoute();});}
      return;
    }
    const step = route.next(this.now());
    if (route.status().phase === 'Fault') { this.fault(route.message); return; }
    if (step) { this.lastMovingServos=[step.servo]; this.write(encodeSpeedPosition(step.servo, step.target, route.speed, route.acceleration), () => {
      route.written(this.now()); this.checkRoute();
    },false,this.operation==='Slider'?this.sliderInterval:500); }
  }
  private checkRoute() {
    if (this.route?.phase === 'Fault') { this.fault(this.route.message); return; }
    if (this.route?.phase === 'Settled short'){this.lastMovingServos=[];this.message=this.route.message;}
    if (this.route?.phase === 'Complete') {
      this.lastMovingServos=[];

      this.message = this.operation === 'Home' ? 'Home reached within joint settling tolerances. Inspect the pose; no correction loop runs.' : this.operation==='Saved position'?'Saved position reached within joint settling tolerances.':this.operation==='Program'?'Program step settled.':'Jog finished.';
    }
    this.changed();
  }

  // Existing factory All Off/All On workflow, available without enabling motion.
  setHolding(enabled: boolean, supported: boolean) {
    this.liveTarget=null;this.lastLive=null;
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
      if(enabled&&this.options.directSession&&this.manual.phase==='Confirm holding')this.manual.message='Restore command sent. Waiting for fresh stable position feedback; continue supporting the arm. Physical holding is not measured.';
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

  private write(packet: Uint8Array, completed: () => void, urgent = false, interval=500) {
    if (this.writeInFlight || (!urgent && this.now() - this.lastCommandAt < interval) || !this.port?.writable) {
      this.fault('Writer is unavailable. No command queued.'); return;
    }
    let writer: WritableStreamDefaultWriter<Uint8Array> | undefined;
    this.readySamples=[];
    const generation = this.generation, started = this.now();
    const diagnostic:WriteDiagnostic={atMs:started,operation:this.operation,bytes:[...packet],positions:this.positions?[...this.positions]:null,finishedAtMs:null,outcome:'not-submitted'};
    this.writes=[...this.writes,diagnostic].slice(-200);
    try {
      writer = this.port.writable.getWriter(); const activeWriter = writer;
      this.writeInFlight = true; this.writeStartedAt=started; this.lastCommandAt = started;
      diagnostic.outcome='pending';
      this.pending = activeWriter.write(packet).finally(() => {
        diagnostic.finishedAtMs=this.now();
        activeWriter.releaseLock(); this.writeInFlight = false;
        this.lastCommandAt = Math.max(this.lastCommandAt, this.now());
      });
      void this.pending.then(() => {
        diagnostic.outcome='stream-write-resolved';
        if (generation !== this.generation) return;
        if (this.now() - started >= 2000) { this.writeUncertain=true;this.fault('Write deadline exceeded; delivery may have occurred.'); return; }
        try { completed(); } catch (error) { this.fault(error instanceof Error ? error.message : 'Completion recording failed.'); }
      }, () => { diagnostic.outcome='stream-write-rejected';if (generation === this.generation){this.writeUncertain=true;this.fault('Write failed; delivery may have occurred. Disconnect and reconnect.');} });
    } catch { diagnostic.finishedAtMs=this.now();writer?.releaseLock(); this.writeInFlight = false; this.writeUncertain=true;this.fault('Write could not complete. Disconnect and reconnect.'); }
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
      if(!this.writeInFlight)this.readySamples=[...this.readySamples,{at,positions:[...positions]}].slice(-3);
    }
    this.updateDirectSession();
    this.changed();
  }
  tick() {
    if (this.connectionState !== 'Listening') return;
    if (!this.visible()) { this.disconnect(); return; }
    if(this.program?.phase==='Running'&&this.now()-this.program.at>=60000){this.fault('Program reached its 60-second time limit. Edit it into a shorter sequence.');return;}
    if(this.now()-this.receivedAt>500)this.liveTarget=null;
    if(this.writeInFlight && this.now()-this.writeStartedAt>=2000 && !this.faulted){this.writeUncertain=true;this.fault('USB write did not finish within two seconds. Delivery is uncertain.');return;}
    if (this.manual.pending && this.now() - this.manual.pendingSince >= 2000) {
      this.fault('Holding write deadline exceeded. Physical holding needs confirmation.'); return;
    }
    if (this.receivedAt === -Infinity ? this.now() - this.connectedAt > 2000 : this.now() - this.receivedAt > 1500) {
      if ((this.route?.activeRun||this.program?.phase==='Running') && !this.faulted) this.fault('Movement canceled after 1.5 seconds without valid feedback.'); this.changed(); return;
    }
    // Ask the feedback supervisor to check its deadline even while a write hangs.
    if (this.route?.phase === 'Running') {
      this.route.checkDeadline(this.now());
      if (this.route.status().phase === 'Fault') { this.fault(this.route.message); return; }
      if(this.route.status().phase==='Complete')this.checkRoute();
    }
    this.updateDirectSession();this.flushLive();this.advanceProgram();this.pump(); this.changed();
  }

  private retain() {
    if (this.route) this.history = [...this.history, {operation: this.operation, at: new Date().toISOString(), result: this.route.report()}].slice(-100);
  }
  private fault(message: string) {
    this.readySamples=[];
    this.recordEvent('fault',message);
    this.cancelProgram('Fault',message);
    const moving=this.route?.activeRun;
    this.liveTarget=null;this.lastLive=null;this.armed = false; this.faulted = true; this.generation++;
    if (this.route?.activeRun) this.route.fail(message);
    this.manual.interrupt(message, this.positions ?? []);  this.message = message+(moving?' Future targets canceled. Use Stop or the physical cutoff to intervene in the current movement.':''); this.changed();
  }
  stop() {
    this.readySamples=[];
    this.recordEvent('stop','Stop requested. No torque-off command is requested.');
    this.cancelProgram('Stopped','Stopped. Edit your program and run again when ready.');
    this.liveTarget=null;this.lastLive=null;
    const moving=this.lastMovingServos; this.lastMovingServos=[];
    this.armed = false; this.generation++; this.route?.stop();
    this.manual.interrupt('Stopped by teacher.', this.positions ?? []);
    this.message = 'Stopped. Future commands canceled; connection remains open.';
    if(moving.length && this.positions && this.now()-this.receivedAt<=500 && !this.writeInFlight && this.connectionState==='Listening') {
      this.write(encodeSpeedPositions(moving.map(servo=>({servo,target:this.positions![servo-1]!})),MOTION_SPEED,MOTION_ACCELERATION),()=>{this.message='Hold targets sent at the latest measured positions. Verify the arm has stopped, then enable when ready.';this.changed();},true);
    } else if(moving.length) this.message='Future commands canceled. Could not send fresh hold targets; use the physical cutoff if needed.';
    this.changed();
  }
  disconnect() { this.stop(); this.connection.disconnect(); }
  report() {
    return {format: 'nexarm-teacher-control-session', schemaVersion: 1, capturedAt: new Date().toISOString(),
      operatingRanges:{source:'Operator-provided factory-software ranges, adjusted during development; 2026-10-23',protectedStudentPolicy:false,joints:OPERATING_RANGES.map((range,i)=>({servo:i+1,...range}))},
      diagnostics:{clock:'page monotonic milliseconds',state:this.connectionState,message:this.message,feedbackAgeMs:Number.isFinite(this.receivedAt)?this.now()-this.receivedAt:null,
        writePending:this.writeInFlight,powerAndTorqueState:'not measured',
        writes:this.writes.map(entry=>({...entry,bytes:[...entry.bytes],positions:entry.positions?[...entry.positions]:null})),
        events:this.events.map(entry=>({...entry,positions:entry.positions?[...entry.positions]:null}))},
      home: [...TEACHER_HOME], latest: this.positions ? [...this.positions] : null,
      program:this.program?{...this.program,steps:this.program.steps.map(step=>step.kind==='pose'?({...step,positions:[...step.positions]}):({...step}))}:null,
      operations: [...this.history, ...(this.route ? [{operation: this.operation, result: this.route.report()}] : [])],
      manualPositioning: this.manual.report()};
  }
}
