import { PassiveConnection } from '../serial/PassiveConnection';
import type { ReadOnlyPort } from '../serial/PassiveConnection';
import { FrameParser, decodePositions, decodeReportedPose } from '../protocol/FrameParser';
import type {ReportedPose} from '../protocol/FrameParser';
import { encodeFactoryHolding, encodeSpeedPosition, encodeSpeedPositions } from '../protocol/NexArmCodec';
import {COORDINATE_EXECUTION_BLOCKED_REASON} from './CoordinateExecutionPolicy';
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
// Operator-approved fast-stop test. Ordinary motion profiles remain unchanged.
const STOP_SPEED=600,STOP_ACCELERATION=100,STOP_WRITE_DEADLINE_MS=2000;
const PROGRAM_HOME_TOLERANCE=40,PROGRAM_HOME_GRACE_MS=2000;
type WriteDiagnostic={atMs:number;operation:Operation|null;bytes:number[];positions:number[]|null;finishedAtMs:number|null;outcome:'not-submitted'|'pending'|'stream-write-resolved'|'stream-write-rejected'};
type StopDiagnostic={requestedAtMs:number;submittedAtMs:number|null;finishedAtMs:number|null;servos:number[];targets:number[]|null;feedbackAgeAtSendMs:number|null;outcome:'waiting-for-writer'|'submitted'|'stream-write-resolved'|'unavailable'|'canceled';message:string;feedback:{atMs:number;positions:number[]}[]};
type StopRelease={generation:number;requestedAtMs:number;hold:StopDiagnostic;phase:'Stopping'|'Waiting for steady readings'|'Release pending'|'Release sent'|'Canceled'|'Fault';deadlineMs:number|null;samples:{atMs:number;positions:number[]}[];releaseSubmittedAtMs:number|null;releaseFinishedAtMs:number|null;message:string};
type HomeRecovery={generation:number;requestedAtMs:number;phase:'Restoring holding'|'Returning Home'|'Checking Home'|'Ready at Home'|'Canceled'|'Fault';readyAfterMs:number|null;deadlineMs:number|null;message:string};

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
  private reportedPose:ReportedPose|null=null;
  private receivedAt = -Infinity;
  private connectedAt = 0;
  private armed = false;
  private faulted = false;
  private message = 'Connect to read positions, then enable robot controls.';
  private writeInFlight = false;
  private writeUncertain=false;
  private pending: Promise<void> | null = null;
  private pendingStop:{generation:number;deadlineMs:number;diagnostic:StopDiagnostic}|null=null;
  private stops:StopDiagnostic[]=[];
  private stopObservation:StopDiagnostic|null=null;
  private stopRelease:StopRelease|null=null;
  private recovery:HomeRecovery|null=null;
  private get recoveryActive(){return !!this.recovery&&['Restoring holding','Returning Home','Checking Home'].includes(this.recovery.phase);}
  private get stopReleaseActive(){return !!this.stopRelease&&['Stopping','Waiting for steady readings','Release pending'].includes(this.stopRelease.phase);}
  private lastCommandAt = -Infinity;
  private generation = 0;
  private writeStartedAt=-Infinity;
  private lastMovingServos:number[]=[];
  // Timed completion cannot prove motion stopped; retain these across later routes.
  private timedHoldServos:number[]=[];
  private readySamples:{at:number;positions:number[]}[]=[];
  private updateDirectSession(){
    if(!this.options.directSession||this.idleReason(true)!==null||this.readySamples.length!==3||!this.positions)return;
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
  private program:{steps:PlannedStep[];startup:'Home pending'|'Returning Home'|'Running blocks';homeVerifyUntil:number|null;speed:number;acceleration:number;stationLimitsEnforced:false;index:number;at:number;waitUntil:number|null;motionIntervalMs:number;phase:'Running'|'Completed'|'Stopped'|'Fault';message:string}|null=null;
  private cancelProgram(phase:'Stopped'|'Fault',message:string){if(this.program?.phase==='Running'){this.program.phase=phase;this.program.message=message;}}
  runProgram(instructions:unknown){
    const reason=this.movementReason();if(reason)throw Error(reason);
    // Development testing only. The bounded language validates IDs and raw
    // encoding values; protected robot-specific limits are a student-release gate.
    const steps=interpret(instructions);
    // Validate the entire program before the first write, including later poses.
    for(const step of steps){if(step.kind==='pose')assertPoseTargets(step.positions,`Saved position "${step.name}"`);else if(step.kind!=='wait')assertJointTarget(step.servo,step.target);}
    this.recovery=null;this.stopObservation=null;this.liveTarget=null;this.lastLive=null;this.retain();this.route=null;this.operation='Program';
    this.program={steps,startup:this.options.homeBeforeProgram===false?'Running blocks':'Home pending',homeVerifyUntil:null,speed:PROGRAM_SPEED,acceleration:PROGRAM_ACCELERATION,stationLimitsEnforced:false,index:0,at:this.now(),waitUntil:null,motionIntervalMs:500,phase:'Running',message:'Preparing Home-first program.'};
    this.advanceProgram();this.changed();
  }
  private advanceProgram(){
    const program=this.program;if(program?.phase!=='Running'||this.route?.activeRun)return;
    if(!this.armed||this.connectionState!=='Listening'||!this.visible()){this.fault('Program canceled because the robot session changed.');return;}
    if(this.writeInFlight||this.now()-this.receivedAt>500)return;
    if(program.startup==='Home pending'){
      if(this.positions!.some((n,i)=>Math.abs(n-TEACHER_HOME[i]!)>PROGRAM_HOME_TOLERANCE)){
        if(this.now()-this.lastCommandAt<500)return;
        program.startup='Returning Home';
        this.recordEvent('program-home','Program validated. Returning to the established Home before block 1.');
        this.startTimedPose(TEACHER_HOME,1000,'Program');
        this.message=program.message='Returning to Home before starting your blocks.';this.changed();return;
      }
      program.startup='Running blocks';
      this.recordEvent('program-home','Already within 40 raw units of Home on all joints; no Home move needed.');
    }
    if(program.startup==='Returning Home'){
      program.homeVerifyUntil??=this.now()+PROGRAM_HOME_GRACE_MS;
      const outside=this.positions!.map((n,i)=>({servo:i+1,actual:n,target:TEACHER_HOME[i]!})).filter(joint=>Math.abs(joint.actual-joint.target)>PROGRAM_HOME_TOLERANCE);
      if(outside.length){
        this.message=program.message='Home frame elapsed; waiting for readings near Home before block 1.';
        if(this.now()>=program.homeVerifyUntil)this.fault(`Home was not reached: ${outside.map(joint=>`J${joint.servo} reported ${joint.actual}, Home ${joint.target}`).join('; ')}. Program blocks were not started. No automatic retry.`);
        return;
      }
      program.startup='Running blocks';program.message='Home readings checked. Running your program.';this.message=program.message;
      this.recordEvent('program-home','Home readings within 40 raw units on all joints. Starting block 1.');
    }
    if(program.waitUntil!==null){if(this.now()<program.waitUntil)return;program.waitUntil=null;program.message='Running your program.';}
    if(program.index===program.steps.length){program.phase='Completed';program.message='Program timing complete. Check live readings and the physical result before running again.';this.message=program.message;return;}
    if(this.now()-this.lastCommandAt<program.motionIntervalMs)return;
    try{
      const step=program.steps[program.index]!;
      if(step.kind==='wait'){
        this.retain();this.route=null;program.index++;program.waitUntil=this.now()+step.durationMs;program.message=`Waiting ${step.durationMs/1000} seconds.`;this.message=program.message;return;
      }
      if(step.kind==='pose'&&this.options.directSession){program.index++;program.motionIntervalMs=2;this.startTimedPose(step.positions,step.durationMs??1000,'Program');return;}
      const plan=step.kind==='pose'?absolutePosePlan(this.positions!,step.positions,{speed:program.speed,acceleration:program.acceleration}):absoluteJointPlan(this.positions!,step.servo,step.target,program.speed,program.acceleration);
      program.index++;program.motionIntervalMs=500;this.start({...plan,manual:false},'Program');
    }catch(error){this.fault(error instanceof Error?error.message:'Program movement could not start.');}
  }
  private liveServo(){
    if(!this.armed||this.manual.blocked||!this.visible()||this.connectionState!=='Listening'||this.now()-this.receivedAt>500)return null;
    return this.liveTarget?.servo??(this.operation==='Slider'&&(this.route?.phase==='Running'||this.lastLive!==null)?(this.route?.status().command?.servo??this.route?.status().next?.servo):null);
  }
  liveJoint(servo:number,target:number,speed=2000,acceleration=100,final=false){
    if(this.recoveryActive)throw Error('Home recovery is in progress. Stop it before using manual controls.');
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
    private readonly changed: () => void,private readonly options:{directSession?:boolean;homeBeforeProgram?:boolean}={}) {
    this.manual = new ManualPositioning(storage);
    this.connection = new PassiveConnection((state, message) => {
      this.connectionState = state;
      this.recordEvent('connection',`${state}: ${message}`);
      if (state === 'Listening') {
        this.connectedAt = this.now(); this.message = this.options.directSession?'Connected. Waiting for fresh stable position feedback.':'Connected. Positions are read-only until you enable controls.';
      } else {
        this.cancelRecovery('Connection ended.');
        this.cancelStopRelease('Connection ended.');
        this.cancelStopHold('Connection ended before the stop hold could be submitted.');this.stopObservation=null;
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
    this.cancelStopRelease('A new connection cannot continue an earlier release test.');
    this.cancelStopHold('A new connection cannot replay a prior stop.');this.stopObservation=null;
    this.readySamples=[];this.timedHoldServos=[];
    this.writeUncertain=false;
    this.liveTarget=null;this.lastLive=null;this.armed = false; this.faulted = false; this.route = null; this.operation = null;this.program=null;
     this.parser.reset();  this.positions = null; this.reportedPose=null; this.receivedAt = -Infinity;
    this.connection.connect(async () => {
      const port = await select(); this.port = port;
      return {get readable() { return port.readable; }, open: options => port.open(options),
        close: async () => { await this.pending?.catch(() => {}); await port.close(); this.port = null; }};
    });
  }

  private idleReason(ignoreRecovery=false): string | null {
    if (this.connectionState !== 'Listening') return 'Connect to the robot.';
    if (!this.visible()) return 'Keep this page visible.';
    if(this.writeUncertain)return 'USB command delivery is uncertain. Disconnect and reconnect before another command.';
    if(!ignoreRecovery&&this.recoveryActive)return 'Restore & Return Home is in progress. Stop cancels recovery.';
    if(this.stopReleaseActive)return 'Stop and release is in progress. Restore holding before another Run.';
    if(this.pendingStop)return 'Stop requested. Waiting for the active USB write before sending the hold.';
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
      reportedPose:this.reportedPose?{...this.reportedPose}:null,
      armed: this.armed, faulted: this.faulted, message: this.message, reason,
      stopRelease:this.stopRelease?{phase:this.stopRelease.phase,active:this.stopReleaseActive,message:this.stopRelease.message}:null,
      recovery:this.recovery?{phase:this.recovery.phase,active:this.recoveryActive,message:this.recovery.message}:null,
      canRestoreAndHome:idle===null&&['Normal','Manual setup','Recovery required'].includes(this.manual.phase),
      canConnect: this.connectionState === 'Disconnected', canEnable: !this.armed && this.enableReason() === null,
      enableReason: this.enableReason(), canMove: reason === null&&!this.liveTarget,liveServo:this.liveServo(),
      sliderServo:this.operation==='Slider'&&this.route?.phase==='Running'&&this.armed&&!this.manual.blocked&&this.visible()&&!this.writeInFlight&&this.now()-this.receivedAt<=500&&this.now()-this.lastCommandAt>=500?this.route.status().next?.servo:null,
      home: this.route?.status() ?? null, operation: this.operation,
      program:this.program?{phase:this.program.phase,startup:this.program.startup,message:this.program.message,completed:this.program.phase==='Completed'?this.program.steps.length:Math.max(0,this.program.index-(this.route?.phase==='Complete'?0:1)),total:this.program.steps.length,activeStep:this.program.phase==='Running'&&this.program.startup==='Running blocks'?this.program.index-1:null}:null,
      busy: this.recoveryActive || this.stopReleaseActive || !!this.pendingStop || this.writeInFlight || !!this.route?.activeRun || this.manual.pending || this.program?.phase==='Running',
      manualPhase: this.options.directSession&&this.manual.phase==='Confirm holding'?'Restore settling':this.manual.phase, manualMessage: this.manual.message, manualReason: idle,
      feedbackFresh:this.connectionState==='Listening'&&this.visible()&&this.now()-this.receivedAt<=500,
      canCapture:captureReason===null,captureReason,
      canRelease: ['Normal','Manual setup'].includes(this.manual.phase) && idle === null,
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
    this.stopObservation=null;
    const plan=timedPosePlan(this.positions!,target,durationMs);
    this.retain();this.faulted=false;this.liveTarget=null;this.lastLive=null;
    this.route=new TimedPoseMotion(this.positions!,this.now(),plan);this.operation=operation;
    this.route.start(this.positions!,this.now());this.message=`Timed pose: requested ${durationMs/1000}s, planned ${plan.durationMs/1000}s; maximum speed 600, acceleration 10.`;
    this.pump();this.changed();
  }
  private start(plan: ReturnType<typeof smoothPlan>, operation: Operation,previousPath?:CommandedPath|null) {
    this.stopObservation=null;
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
      if(step){if(!this.lastMovingServos.includes(step.servo))this.lastMovingServos.push(step.servo);if(!this.timedHoldServos.includes(step.servo))this.timedHoldServos.push(step.servo);const generation=this.generation;
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
      if(this.route instanceof TimedPoseMotion){
        // Elapsed time does not prove a joint stopped. Preserve Stop's hold set.
        this.message=`${this.operation==='Home'?'Home':this.operation==='Saved position'?'Saved position':'Program pose'} frame time elapsed. Check live readings; exact arrival is not verified.`;
        this.changed();return;
      }
      this.lastMovingServos=[];

      this.message = this.operation === 'Home' ? 'Home reached within joint settling tolerances. Inspect the pose; no correction loop runs.' : this.operation==='Saved position'?'Saved position reached within joint settling tolerances.':this.operation==='Program'?'Program step settled.':'Jog finished.';
    }
    this.changed();
  }

  // Existing factory All Off/All On workflow, available without enabling motion.
  setHolding(enabled: boolean, supported: boolean) {
    this.stopObservation=null;
    this.liveTarget=null;this.lastLive=null;
    const reason = this.idleReason();
    if (!supported || reason) throw new Error(reason ?? 'Support the arm and confirm clear pinch areas and cutoff access.');
    if (typeof enabled !== 'boolean') throw new Error('Choose release or restore.');
    this.recovery=null;
    this.armed = false;
    try {
      if (!enabled && this.manual.phase === 'Normal') this.manual.enable();
      this.manual.begin(enabled ? 'restore' : 'release', this.now(), this.positions!);
    } catch (error) { this.fault(error instanceof Error ? error.message : 'Holding setup could not be recorded.'); return; }
    this.write(encodeFactoryHolding(enabled), () => {
      this.lastMovingServos=[];this.timedHoldServos=[];
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
    // Defense at the transport boundary, including any retained native route.
    for(let offset=0;offset+5<packet.length;){
      if(packet[offset+2]===255&&(packet[offset+4]===7||packet[offset+4]===8)){this.fault(COORDINATE_EXECUTION_BLOCKED_REASON);return;}
      const length=packet[offset+3]!+4;if(length<6||offset+length>packet.length)break;offset+=length;
    }
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

      this.positions = positions; this.reportedPose=decodeReportedPose(frame); this.receivedAt = at;
      const stop=this.stopObservation;
      if(stop&&at-(stop.submittedAtMs??stop.requestedAtMs)<=2000&&stop.feedback.length<40)stop.feedback.push({atMs:at,positions:[...positions]});
      const release=this.stopRelease;
      if(release?.phase==='Waiting for steady readings'&&at>(release.hold.finishedAtMs??Infinity))release.samples=[...release.samples,{atMs:at,positions:[...positions]}].slice(-3);
      if (this.route?.phase === 'Running') {
        this.route.observe(positions, at);
        const phase = this.route.status().phase;
        if (phase === 'Fault' || phase === 'Complete' || phase === 'Settled short') this.checkRoute();
      }
      if(!this.writeInFlight)this.readySamples=[...this.readySamples,{at,positions:[...positions]}].slice(-3);
    }
    this.progressStopRelease();this.progressRecovery();this.updateDirectSession();
    this.changed();
  }
  tick() {
    if (this.connectionState !== 'Listening') return;
    if (!this.visible()) { this.disconnect(); return; }
    if(this.pendingStop){this.flushStopHold();if(this.pendingStop||this.writeUncertain){this.changed();return;}}
    if(this.program?.phase==='Running'&&this.now()-this.program.at>=60000){this.fault('Program reached its 60-second time limit. Edit it into a shorter sequence.');return;}
    if(this.now()-this.receivedAt>500)this.liveTarget=null;
    if(this.writeInFlight && this.now()-this.writeStartedAt>=2000 && (!this.faulted||this.stopObservation?.outcome==='submitted'||this.stopRelease?.phase==='Release pending')){this.writeUncertain=true;this.fault('USB write did not finish within two seconds. Delivery is uncertain.');return;}
    this.progressStopRelease();
    if (this.manual.pending && this.now() - this.manual.pendingSince >= 2000) {
      this.fault('Holding write deadline exceeded. Physical holding needs confirmation.'); return;
    }
    if (this.receivedAt === -Infinity ? this.now() - this.connectedAt > 2000 : this.now() - this.receivedAt > 1500) {
      if (this.recoveryActive||((this.route?.activeRun||this.program?.phase==='Running') && !this.faulted)) this.fault('Movement canceled after 1.5 seconds without valid feedback.'); this.changed(); return;
    }
    // Ask the feedback supervisor to check its deadline even while a write hangs.
    if (this.route?.phase === 'Running') {
      this.route.checkDeadline(this.now());
      if (this.route.status().phase === 'Fault') { this.fault(this.route.message); return; }
      if(this.route.status().phase==='Complete')this.checkRoute();
    }
    this.progressRecovery();this.updateDirectSession();this.flushLive();this.advanceProgram();this.pump(); this.changed();
  }

  private retain() {
    if (this.route) this.history = [...this.history, {operation: this.operation, at: new Date().toISOString(), result: this.route.report()}].slice(-100);
  }
  private fault(message: string) {
    this.readySamples=[];
    this.cancelRecovery(message,'Fault');
    this.cancelStopRelease(message,'Fault');
    this.cancelStopHold(message,'unavailable');
    if(this.stopObservation?.outcome==='submitted'){this.stopObservation.outcome='unavailable';this.stopObservation.message=message;}
    this.recordEvent('fault',message);
    this.cancelProgram('Fault',message);
    const moving=this.route?.activeRun;
    this.liveTarget=null;this.lastLive=null;this.armed = false; this.faulted = true; this.generation++;
    if (this.route?.activeRun) this.route.fail(message);
    this.manual.interrupt(message, this.positions ?? []);  this.message = message+(moving?' Future targets canceled. Use Stop or the physical cutoff to intervene in the current movement.':''); this.changed();
  }
  private cancelStopHold(message:string,outcome:'unavailable'|'canceled'='canceled'){
    if(!this.pendingStop)return;
    this.pendingStop.diagnostic.outcome=outcome;this.pendingStop.diagnostic.message=message;
    this.recordEvent('stop-hold-unavailable',message);this.pendingStop=null;
  }
  private flushStopHold(){
    const request=this.pendingStop;if(!request)return;
    if(request.generation!==this.generation||this.connectionState!=='Listening'||this.manual.blocked){
      this.cancelStopHold('Stop hold canceled after a connection or holding-state change.');return;
    }
    if(this.writeUncertain||this.now()>=request.deadlineMs){
      const message='Stop hold could not be delivered within the USB deadline. Delivery is uncertain; use the physical cutoff if needed. Disconnect and reconnect before another command.';
      this.writeUncertain=true;this.fault(message);return;
    }
    if(this.writeInFlight)return;
    if(!this.positions||this.now()-this.receivedAt>500){
      const message='Future commands canceled. Could not send fresh hold targets; use the physical cutoff if needed.';
      this.cancelStopHold(message,'unavailable');this.message=message;return;
    }
    const diagnostic=request.diagnostic,generation=this.generation;
    // Sample at transmission time, not at the original Space press. Never replay
    // a stale position target after waiting for the previous USB write.
    diagnostic.submittedAtMs=this.now();diagnostic.targets=[...this.positions];diagnostic.feedbackAgeAtSendMs=this.now()-this.receivedAt;
    diagnostic.outcome='submitted';diagnostic.message='Fast hold submitted at speed 600 / acceleration 100; physical stopping is unverified.';
    this.pendingStop=null;
    this.recordEvent('stop-hold-submitted',`Fast hold submitted ${this.now()-diagnostic.requestedAtMs} ms after Stop; feedback age ${diagnostic.feedbackAgeAtSendMs} ms.`);
    this.write(encodeSpeedPositions(diagnostic.servos.map(servo=>({servo,target:this.positions![servo-1]!})),STOP_SPEED,STOP_ACCELERATION),()=>{
      this.message='Fast hold targets sent (600 / 100). Verify the arm has stopped. Holding remains enabled; no program resumes automatically.';this.changed();
    },true);
    if(!this.writeInFlight){diagnostic.outcome='unavailable';diagnostic.message='Stop hold could not be submitted to the USB writer.';return;}
    const pending=this.pending,port=this.port;
    // Record stream completion independently of canceled route callbacks. A USB
    // completion still does not acknowledge servo execution or physical stopping.
    if(pending)void pending.then(()=>{
      diagnostic.finishedAtMs=this.now();
      if(this.now()-diagnostic.submittedAtMs!>=STOP_WRITE_DEADLINE_MS){diagnostic.outcome='unavailable';diagnostic.message='Hold write exceeded its deadline; physical effect is uncertain.';}
      else if(diagnostic.outcome!=='unavailable'){diagnostic.outcome='stream-write-resolved';diagnostic.message='Hold stream write resolved; physical stopping is unverified.';}
      if(this.now()-diagnostic.submittedAtMs!>=STOP_WRITE_DEADLINE_MS&&!this.writeUncertain&&this.port===port&&this.connectionState==='Listening'){
        this.writeUncertain=true;this.fault('Stop hold write exceeded its deadline. Delivery is uncertain; use the physical cutoff if needed.');
      }
      this.progressStopRelease();
      if(generation===this.generation)this.changed();
    },()=>{
      diagnostic.finishedAtMs=this.now();diagnostic.outcome='unavailable';diagnostic.message='Hold stream write rejected; physical effect is uncertain.';
      if(!this.writeUncertain&&this.port===port&&this.connectionState==='Listening'){this.writeUncertain=true;this.fault('Stop hold write failed. Delivery is uncertain; use the physical cutoff if needed.');}
    });
  }
  // Lifecycle cancellation retains holding. Only an explicit operator Stop
  // selects stopThenRelease; disconnect/hidden-page/error paths never do.
  stop(){this.cancelRecovery('Recovery canceled.');this.cancelStopRelease('Control session canceled.');this.requestStop(false);}
  private requestStop(holdAllJoints:boolean) {
    this.readySamples=[];
    this.recordEvent('stop','Stop requested. No torque-off command is requested.');
    if(this.pendingStop){if(holdAllJoints)this.pendingStop.diagnostic.servos=[1,2,3,4,5,6];this.flushStopHold();this.changed();return;}
    this.cancelProgram('Stopped','Stopped. Edit your program and run again when ready.');
    this.liveTarget=null;this.lastLive=null;
    const moving=holdAllJoints?[1,2,3,4,5,6]:[...new Set([...this.timedHoldServos,...this.lastMovingServos])]; this.lastMovingServos=[];this.timedHoldServos=[];
    this.armed = false; this.generation++; this.route?.stop();
    this.manual.interrupt('Stopped by teacher.', this.positions ?? []);
    this.message = 'Stopped. Future commands canceled; connection remains open.';
    if(moving.length&&this.connectionState==='Listening'&&!this.manual.blocked){
      const diagnostic:StopDiagnostic={requestedAtMs:this.now(),submittedAtMs:null,finishedAtMs:null,servos:moving,targets:null,feedbackAgeAtSendMs:null,outcome:'waiting-for-writer',message:'Stop requested; priority hold waits for the active USB write.',feedback:[]};
      this.stops=[...this.stops,diagnostic].slice(-20);this.stopObservation=diagnostic;
      this.pendingStop={generation:this.generation,deadlineMs:Math.min(this.now()+STOP_WRITE_DEADLINE_MS,this.writeInFlight?this.writeStartedAt+STOP_WRITE_DEADLINE_MS:Infinity),diagnostic};
      if(this.writeInFlight){
        this.message='Stop requested. Waiting for the active USB write before sending the fast hold; use the physical cutoff if needed.';
        const pending=this.pending;
        if(pending)void pending.then(()=>{this.flushStopHold();this.changed();},()=>{
          if(this.pendingStop?.diagnostic!==diagnostic)return;
          this.writeUncertain=true;this.fault('USB write failed before the stop hold. Delivery is uncertain; use the physical cutoff if needed. Disconnect and reconnect.');
        });
      }
      this.flushStopHold();
    } else if(moving.length)this.message='Future commands canceled. Hold not sent because connection or servo holding is unavailable; use the physical cutoff if needed.';
    this.changed();
  }
  /** Operator Stop/Space uses the hardware-tested post-hold feedback gate. */
  stopThenRelease(){
    this.cancelRecovery('Stop canceled recovery.');
    if(this.stopReleaseActive)return;
    if(this.connectionState==='Listening'&&this.manual.phase==='Manual setup'&&!this.writeInFlight){
      this.message='A release command was sent; physical holding is not measured. If the arm still holds, support it and use Release holding to send it again.';this.changed();return;
    }
    if(this.connectionState!=='Listening'||!this.visible()||this.writeUncertain||this.manual.blocked||!this.positions||this.now()-this.receivedAt>500){
      this.stop();this.message+=' No new release command was sent; check holding and the connection.';this.changed();return;
    }
    const requestedAtMs=this.now();this.requestStop(true);
    const hold=this.pendingStop?.diagnostic??this.stopObservation;
    if(!hold||['unavailable','canceled'].includes(hold.outcome)){this.message+=' Release was not scheduled.';this.changed();return;}
    this.stopRelease={generation:this.generation,requestedAtMs,hold,phase:'Stopping',deadlineMs:null,samples:[],releaseSubmittedAtMs:null,releaseFinishedAtMs:null,message:'Fast hold requested; waiting for new steady readings before release. Support the arm.'};
    this.recordEvent('stop-release-requested',this.stopRelease.message);this.message=this.stopRelease.message;
    this.progressStopRelease();this.changed();
  }
  private cancelStopRelease(message:string,phase:'Canceled'|'Fault'='Canceled'){
    if(!this.stopReleaseActive)return;
    const release=this.stopRelease!;
    release.phase=phase;release.message=message+(release.releaseSubmittedAtMs===null?' No release command sent.':' Release may already have reached the arm; keep it supported.');
    this.message=release.message;this.recordEvent('stop-release-canceled',release.message);
  }
  private progressStopRelease(){
    const release=this.stopRelease;if(!release||!this.stopReleaseActive)return;
    if(release.generation!==this.generation||this.connectionState!=='Listening'||!this.visible()||this.writeUncertain){this.cancelStopRelease('Stop and release interrupted.');return;}
    if(release.phase==='Release pending')return;
    if(this.manual.blocked){this.cancelStopRelease('Holding state changed.');return;}
    if(release.phase==='Stopping'){
      if(['unavailable','canceled'].includes(release.hold.outcome)){this.cancelStopRelease('Fast hold was not completed.');return;}
      if(release.hold.outcome!=='stream-write-resolved'||release.hold.finishedAtMs===null)return;
      release.phase='Waiting for steady readings';release.deadlineMs=release.hold.finishedAtMs+2000;
      this.message=release.message='Fast hold sent. Waiting for fresh, steady readings before release. Support the arm.';
    }
    if(this.now()>=release.deadlineMs!||!this.positions||this.now()-this.receivedAt>500){this.cancelStopRelease('Fresh, steady readings were not received in time.');return;}
    if(this.writeInFlight)return;
    const samples=release.samples;
    if(samples.length!==3||samples[2]!.atMs-samples[0]!.atMs<150||samples[0]!.atMs<this.now()-1000||this.positions.some((_,i)=>Math.max(...samples.map(sample=>sample.positions[i]!))-Math.min(...samples.map(sample=>sample.positions[i]!))>9))return;
    try{
      // Persist the ordinary holding-recovery interlock before sending All Off.
      this.manual.enable();this.manual.begin('release',this.now(),this.positions!);
      this.armed=false;release.phase='Release pending';const submittedAtMs=this.now();
      this.message=release.message='Post-hold steady readings observed. Release requested; support the arm.';
      this.write(encodeFactoryHolding(false),()=>{
        this.lastMovingServos=[];this.timedHoldServos=[];this.manual.sent('release',this.positions??[]);
        release.phase='Release sent';this.message=release.message='Release command sent; physical release is not confirmed. Keep supporting the arm. If it still holds, use Release holding to retry. Restore holding before Run.';this.changed();
      },true);
      if(!this.writeInFlight)return;
      release.releaseSubmittedAtMs=submittedAtMs;this.recordEvent('stop-release-submitted',release.message);
      const pending=this.pending,port=this.port;
      if(pending)void pending.then(()=>{
        release.releaseFinishedAtMs=this.now();
        if(this.now()-release.releaseSubmittedAtMs!>=2000&&!this.writeUncertain&&this.port===port&&this.connectionState==='Listening'){this.writeUncertain=true;this.fault('Release write exceeded its deadline. Holding state is uncertain; support the arm.');}
      },()=>{
        release.releaseFinishedAtMs=this.now();
        if(!this.writeUncertain&&this.port===port&&this.connectionState==='Listening'){this.writeUncertain=true;this.fault('Release write failed. Holding state is uncertain; support the arm.');}
      });
    }catch(error){this.fault(error instanceof Error?error.message:'Release could not be recorded.');}
  }
  disconnect() { this.stop(); this.connection.disconnect(); }
  restoreAndHome(){
    if(!this.snapshot().canRestoreAndHome)throw Error('Wait for a connected, idle robot with fresh readings before Restore & Return Home.');
    assertPoseTargets(TEACHER_HOME,'Home');
    const requestedAtMs=this.now(),generation=this.generation,needsRestore=this.manual.phase!=='Normal';
    if(needsRestore){this.setHolding(true,true);if(this.generation!==generation||this.manual.phase!=='Restore pending')return;}
    this.liveTarget=null;this.lastLive=null;this.retain();this.route=null;this.operation='Home';this.readySamples=[];this.faulted=false;
    this.recovery={generation:this.generation,requestedAtMs,phase:'Restoring holding',readyAfterMs:needsRestore?null:this.now(),deadlineMs:needsRestore?null:this.now()+2000,message:'Restore & Return Home: waiting for fresh, steady readings before movement. Support the arm until holding is established.'};
    this.message=this.recovery.message;this.recordEvent('home-recovery-requested',this.message);this.changed();
  }
  private cancelRecovery(message:string,phase:'Canceled'|'Fault'='Canceled'){
    if(!this.recoveryActive)return;
    this.recovery!.phase=phase;this.recovery!.message=message+' No program will resume automatically.';
    this.recordEvent('home-recovery-canceled',this.recovery!.message);
  }
  private recoveryReadingsStable(afterMs:number){
    const samples=this.readySamples;
    return !!this.positions&&this.now()-this.receivedAt<=500&&samples.length===3&&samples[0]!.at>afterMs&&samples[2]!.at-samples[0]!.at>=150&&samples[0]!.at>=this.now()-1000&&this.positions.every((_,i)=>Math.max(...samples.map(sample=>sample.positions[i]!))-Math.min(...samples.map(sample=>sample.positions[i]!))<=9);
  }
  private progressRecovery(){
    const recovery=this.recovery;if(!recovery||!this.recoveryActive)return;
    if(recovery.generation!==this.generation||this.connectionState!=='Listening'||!this.visible()||this.writeUncertain){this.cancelRecovery('Recovery interrupted.');return;}
    if(this.writeInFlight)return;
    if(recovery.phase==='Restoring holding'){
      if(this.manual.phase==='Restore pending')return;
      if(!['Normal','Confirm holding'].includes(this.manual.phase)){this.cancelRecovery('Holding state changed.');return;}
      if(recovery.readyAfterMs===null){recovery.readyAfterMs=this.lastCommandAt;recovery.deadlineMs=this.lastCommandAt+2000;}
      if(this.now()>=recovery.deadlineMs!){this.fault('Home recovery could not establish fresh, steady holding readings. No Home move was started.');return;}
      if(!this.recoveryReadingsStable(recovery.readyAfterMs)||this.idleReason(true)!==null)return;
      try{if(this.manual.phase==='Confirm holding')this.manual.finishRestoreFromFeedback(this.positions!);}
      catch(error){this.fault(error instanceof Error?error.message:'Holding recovery could not be recorded.');return;}
      this.armed=true;
      if(this.positions!.every((n,i)=>Math.abs(n-TEACHER_HOME[i]!)<=PROGRAM_HOME_TOLERANCE)){
        recovery.phase='Ready at Home';this.faulted=false;this.message=recovery.message='Ready at Home: fresh, steady readings are within 40 units on every joint. No return move was needed. Choose Run when ready.';this.recordEvent('home-recovery-ready',this.message);return;
      }
      recovery.phase='Returning Home';
      try{this.startTimedPose(TEACHER_HOME,1000,'Home');this.message=recovery.message='Returning Home. Keep the full sweep clear; Stop cancels recovery.';}
      catch(error){this.fault(error instanceof Error?error.message:'Home recovery could not start.');}return;
    }
    if(this.manual.blocked){this.fault('Holding state changed during Home recovery.');return;}
    if(recovery.phase==='Returning Home'){
      if(this.route?.phase==='Fault'){this.fault(this.route.message);return;}
      if(this.route?.phase!=='Complete')return;
      recovery.phase='Checking Home';recovery.readyAfterMs=this.now();recovery.deadlineMs=this.now()+PROGRAM_HOME_GRACE_MS;this.readySamples=[];
      this.message=recovery.message='Home frame elapsed. Checking fresh, steady readings near Home.';return;
    }
    const outside=this.positions?.map((n,i)=>({servo:i+1,actual:n,target:TEACHER_HOME[i]!})).filter(joint=>Math.abs(joint.actual-joint.target)>PROGRAM_HOME_TOLERANCE)??[];
    if(!outside.length&&this.recoveryReadingsStable(recovery.readyAfterMs!)){
      recovery.phase='Ready at Home';this.message=recovery.message='Ready at Home: fresh, steady readings are within 40 units on every joint. Choose Run when ready.';this.recordEvent('home-recovery-ready',this.message);return;
    }
    if(this.now()>=recovery.deadlineMs!)this.fault('Home recovery was not verified: '+(outside.length?outside.map(j=>`J${j.servo} reported ${j.actual}, Home ${j.target}`).join('; '):'fresh, steady readings were unavailable')+'. No automatic retry.');
  }
  report() {
    return {format: 'nexarm-teacher-control-session', schemaVersion: 1, capturedAt: new Date().toISOString(),
      operatingRanges:{source:'Operator-provided factory-software ranges, adjusted during development; 2026-10-23',protectedStudentPolicy:false,joints:OPERATING_RANGES.map((range,i)=>({servo:i+1,...range}))},
      diagnostics:{clock:'page monotonic milliseconds',state:this.connectionState,message:this.message,feedbackAgeMs:Number.isFinite(this.receivedAt)?this.now()-this.receivedAt:null,
        stopping:{speed:STOP_SPEED,acceleration:STOP_ACCELERATION,physicalStoppingVerified:false,pending:!!this.pendingStop,attempts:this.stops.map(stop=>({...stop,servos:[...stop.servos],targets:stop.targets?[...stop.targets]:null,feedback:stop.feedback.map(sample=>({...sample,positions:[...sample.positions]}))}))},
        stopThenRelease:this.stopRelease?{requestedAtMs:this.stopRelease.requestedAtMs,phase:this.stopRelease.phase,message:this.stopRelease.message,holdRequestedAtMs:this.stopRelease.hold.requestedAtMs,holdWriteFinishedAtMs:this.stopRelease.hold.finishedAtMs,releaseSubmittedAtMs:this.stopRelease.releaseSubmittedAtMs,releaseFinishedAtMs:this.stopRelease.releaseFinishedAtMs,releasePolicy:'post-hold-steady-feedback',physicalStoppingVerified:false,physicalReleaseVerified:false,samples:this.stopRelease.samples.map(sample=>({...sample,positions:[...sample.positions]}))}:null,
        homeRecovery:this.recovery?{requestedAtMs:this.recovery.requestedAtMs,phase:this.recovery.phase,message:this.recovery.message,homeTolerance:PROGRAM_HOME_TOLERANCE,routeClearanceVerified:false,physicalHoldingVerified:false}:null,
        writePending:this.writeInFlight,powerAndTorqueState:'not measured',
        writes:this.writes.map(entry=>({...entry,bytes:[...entry.bytes],positions:entry.positions?[...entry.positions]:null})),
        events:this.events.map(entry=>({...entry,positions:entry.positions?[...entry.positions]:null}))},
      home: [...TEACHER_HOME], latest: this.positions ? [...this.positions] : null,
      reportedCoordinates:{source:'passive-0x0b',units:{xyz:'mm',pitch:'degrees',roll:'degrees',claw:'degrees'},referenceVerified:false,latest:this.reportedPose?{...this.reportedPose}:null,feedbackFresh:this.snapshot().feedbackFresh},
      program:this.program?{...this.program,steps:this.program.steps.map(step=>step.kind==='pose'?({...step,positions:[...step.positions]}):({...step}))}:null,
      operations: [...this.history, ...(this.route ? [{operation: this.operation, result: this.route.report()}] : [])],
      manualPositioning: this.manual.report()};
  }
}
