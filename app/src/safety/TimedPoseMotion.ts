import {assertPoseTargets} from './OperatingRanges';
import {MOTION_DEVIATION_MARGIN} from './SmoothTeacherMotion';

export function timedPosePlan(before:readonly number[],values:readonly number[],requestedMs=1000){
  if(before.length!==6||before.some(n=>!Number.isInteger(n)||n<0||n>4095))throw Error('Six valid measured positions required.');
  assertPoseTargets(values,'Pose');
  if(!Number.isInteger(requestedMs)||requestedMs<100||requestedMs>10000)throw Error('Pose duration must be 0.1–10 seconds.');
  // Like factory frames, send every target, including small and zero-distance moves.
  const target=[...values],joints=target.map((value,i)=>({servo:i+1,from:before[i]!,target:value,delta:value-before[i]!}));
  // Factory distance/time * 1.2 profile, within the previously tested 600/10 envelope.
  const durationMs=Math.max(requestedMs,...joints.map(s=>Math.ceil(Math.abs(s.delta)*1200/600)));
  const steps=joints.map(s=>({...s,speed:Math.max(10,Math.min(600,Math.trunc(Math.abs(s.delta)*1200/durationMs))),acceleration:10}));
  return {target,steps,requestedMs,durationMs,speed:600,acceleration:10};
}
export class TimedPoseMotion{
  phase:'Enabled'|'Running'|'Complete'|'Stopped'|'Fault'='Enabled';message='Ready';
  readonly steps:ReturnType<typeof timedPosePlan>['steps'];
  readonly speed=600;readonly acceleration=10;
  private latest:number[];private lastObservation:number;private started=0;private lastWrite=-Infinity;private clock=0;
  private index=0;private pending=false;private endsAt:number|null=null;
  private feedback:{at:number;positions:number[]}[]=[];
  private sent:number[]=[];
  constructor(private readonly before:readonly number[],at:number,private readonly plan:ReturnType<typeof timedPosePlan>){
    this.before=[...before];this.latest=[...before];this.lastObservation=at;this.steps=plan.steps.map(s=>({...s}));
  }
  get activeRun(){return this.phase==='Enabled'||this.phase==='Running';}
  pathBounds(){return null;}
  start(positions:readonly number[],at:number){this.latest=[...positions];this.started=this.clock=at;this.lastObservation=at;this.phase='Running';this.message='Sending timed pose targets.';}
  next(at:number){this.checkDeadline(at);if(this.phase!=='Running'||this.pending||at-this.lastWrite<2)return null;const step=this.steps[this.index];if(!step)return null;this.pending=true;this.sent.push(step.servo);return step;}
  written(at:number){if(this.phase!=='Running'||!this.pending)return;this.pending=false;this.index++;this.lastWrite=this.clock=at;if(this.index===this.steps.length){this.endsAt=at+this.plan.durationMs;this.message='Pose frame running; advancing when frame time elapses.';}}
  observe(values:readonly number[],at:number){
    this.latest=[...values];this.lastObservation=at;if(this.phase!=='Running')return;
    this.feedback=[...this.feedback,{at,positions:[...values]}].slice(-64);
    for(let i=0;i<6;i++){
      const target=this.sent.includes(i+1)?this.plan.target[i]!:this.before[i]!;
      if(values[i]!<Math.min(this.before[i]!,target)-MOTION_DEVIATION_MARGIN||values[i]!>Math.max(this.before[i]!,target)+MOTION_DEVIATION_MARGIN){this.fail(`Pose J${i+1} moved outside its commanded path.`);return;}
    }
    this.checkDeadline(at);
  }
  checkDeadline(at:number){
    this.clock=at;if(this.phase!=='Running')return;
    if(at-this.lastObservation>1500){this.fail('Pose canceled: no valid position feedback for 1.5 seconds.');return;}
    if(this.endsAt!==null&&at>=this.endsAt){this.phase='Complete';this.message='Pose frame time elapsed. Check live readings; exact arrival is not verified.';return;}
    if(this.endsAt===null&&at>this.started+this.plan.durationMs+4000)this.fail('Pose target dispatch did not finish.');
  }
  fail(message:string){if(this.phase==='Fault')return;this.phase='Fault';this.message=message;}
  stop(){if(this.activeRun){this.phase='Stopped';this.message='Pose canceled. No further joint targets will be sent.';}}
  status(){
    const commands=this.steps.filter(s=>this.sent.includes(s.servo)).map(s=>({...s,actual:this.latest[s.servo-1]!,error:s.target-this.latest[s.servo-1]!,elapsedMs:this.clock-this.started,deadlineMs:this.plan.durationMs}));
    const next=this.steps[this.index];
    return {phase:this.phase,message:this.message,speed:this.speed,acceleration:this.acceleration,commandedPath:null,commands,command:commands.reduce<(typeof commands)[number]|null>((largest,c)=>!largest||Math.abs(c.error)>Math.abs(largest.error)?c:largest,null),next:next?{servo:next.servo,target:next.target}:null,completedWaypoints:this.index,totalSteps:this.steps.length,requestedMs:this.plan.requestedMs,durationMs:this.plan.durationMs,completionPolicy:'elapsed-time' as const};
  }
  report(){return {...this.status(),mode:'timed-pose',before:[...this.before],latest:[...this.latest],target:[...this.plan.target],sent:[...this.sent],feedback:this.feedback.map(s=>({elapsedMs:s.at-this.started,positions:[...s.positions]}))};}
}
