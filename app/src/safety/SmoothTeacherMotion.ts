import {encodeSpeedPosition} from '../protocol/NexArmCodec';
import {TEACHER_HOME,HOME_ORDER} from './TeacherControlPlan';
export const MOTION_SPEED=100, MOTION_ACCELERATION=10;
export const HOME_SPEED=300;
// Raw feedback tolerance for supervised teacher motion, not a mechanical limit.
export const MOTION_DEVIATION_MARGIN=100;
type Step={servo:number;from:number;target:number;delta:number;packet:string};
type Command={servo:number;from:number;target:number;actual:number;error:number;elapsedMs:number;deadlineMs:number};
export type CommandedPath={servo:number;min:number;max:number};
export function smoothPlan(positions:readonly number[],servo?:number,delta?:number,profile={speed:MOTION_SPEED,acceleration:MOTION_ACCELERATION}){
  if(positions.length!==6||positions.some(n=>!Number.isInteger(n)||n<0||n>4095))throw Error('Six valid positions required.');
  if(servo!==undefined&&(!Number.isInteger(servo)||servo<1||servo>6||![-20,20].includes(delta!)))throw Error('Choose a joint and +/-20.');
  const target=servo===undefined?[...TEACHER_HOME]:[...positions],steps:Step[]=[];
  if(servo!==undefined)target[servo-1]=positions[servo-1]!+delta!;
  for(const id of servo===undefined?HOME_ORDER:[servo]){
    const from=positions[id-1]!,to=target[id-1]!;
    if(Math.abs(to-from)<=9)continue;
    const packet=encodeSpeedPosition(id,to,profile.speed,profile.acceleration);
    steps.push({servo:id,from,target:to,delta:to-from,packet:[...packet].map(n=>n.toString(16).padStart(2,'0')).join(' ')});
  }
  return {target,steps,speed:profile.speed,acceleration:profile.acceleration,manual:false};
}
export function absoluteJointPlan(positions:readonly number[],servo:number,targetValue:number,speed:number,acceleration:number){
  if(positions.length!==6||positions.some(n=>!Number.isInteger(n)||n<0||n>4095))throw Error('Six valid positions required.');
  const packet=encodeSpeedPosition(servo,targetValue,speed,acceleration),from=positions[servo-1]!;
  const target=[...positions];target[servo-1]=targetValue;
  return {target,steps:[{servo,from,target:targetValue,delta:targetValue-from,packet:[...packet].map(n=>n.toString(16).padStart(2,'0')).join(' ')}],speed,acceleration,manual:true};
}
export class SmoothTeacherMotion{
  phase:'Enabled'|'Running'|'Complete'|'Settled short'|'Stopped'|'Fault'='Enabled';message='Ready';index=0;
  readonly before:readonly number[];readonly steps:readonly Step[];
  private latest:readonly number[];private active:{step:Step;at:number;before:readonly number[];written:boolean;samples:{at:number;v:number}[]}|null=null;
  private lastObservation:number;private lastWrite=-Infinity;
  private command:Command|null=null;
  private failure:{message:string;positions:readonly number[];command:Command|null}|null=null;
  private readonly path:CommandedPath|null;
  private feedback:{elapsedMs:number;positions:number[]}[]=[];
  constructor(positions:readonly number[],at:number,private plan:ReturnType<typeof smoothPlan>,previousPath?:CommandedPath|null){
    this.before=[...positions];this.latest=[...positions];this.steps=plan.steps.map(s=>({...s}));this.lastObservation=at;
    const step=this.steps[0];
    this.path=plan.manual&&step?{servo:step.servo,min:Math.min(step.from,step.target),max:Math.max(step.from,step.target)}:null;
    // A reversal cannot recall an earlier target. Allow travel toward targets
    // already dispatched during this still-moving slider operation.
    if(this.path&&previousPath?.servo===this.path.servo){this.path.min=Math.min(this.path.min,previousPath.min);this.path.max=Math.max(this.path.max,previousPath.max);}
    if(!this.steps.length)this.phase='Complete';
  }
  pathBounds(){return this.path?{...this.path}:null;}
  private travelDistance(step:Step){return Math.max(Math.abs(step.delta),this.path?Math.max(Math.abs(step.target-this.path.min),Math.abs(step.target-this.path.max)):0);}
  get speed(){return this.plan.speed;}
  get acceleration(){return this.plan.acceleration;}
  get activeRun(){return this.phase==='Enabled'||this.phase==='Running';}
  start(positions:readonly number[],at:number){this.latest=[...positions];this.lastObservation=at;this.phase=this.steps.length?'Running':'Complete';}
  next(at:number){this.checkDeadline(at);if(this.phase!=='Running'||this.active||at-this.lastWrite<500||at-this.lastObservation>500)return null;
    const step=this.steps[this.index];if(!step)return null;
    this.active={step,at,before:[...this.latest],written:false,samples:[]};
    this.command={servo:step.servo,from:this.latest[step.servo-1]!,target:step.target,actual:this.latest[step.servo-1]!,error:step.target-this.latest[step.servo-1]!,elapsedMs:0,deadlineMs:Math.max(4000,this.travelDistance(step)/this.speed*2000+4000)};
    return step;
  }
  checkDeadline(at:number){if(this.phase!=='Running')return;
    if(at-this.lastObservation>1500){this.fail('No valid position feedback for 1.5 seconds.');return;}
    if(this.active&&at-this.active.at>Math.max(4000,this.travelDistance(this.active.step)/this.speed*2000+4000)){
      const a=this.active,actual=this.latest[a.step.servo-1]!;
      if(this.command)this.command.elapsedMs=at-a.at;
      this.fail(`Servo ${a.step.servo} timed out: start ${a.before[a.step.servo-1]}, target ${a.step.target}, reported ${actual}, remaining ${a.step.target-actual} raw units. ${Math.abs(actual-a.before[a.step.servo-1]!)<=3?'Little or no reported movement.':'Movement reported but target did not settle.'}`);
    }
  }
  observe(positions:readonly number[],at:number){this.latest=[...positions];this.lastObservation=at;if(this.phase!=='Running')return;
    const a=this.active;if(!a)return;const i=a.step.servo-1,v=positions[i]!;
    this.feedback.push({elapsedMs:at-a.at,positions:[...positions]});this.feedback=this.feedback.slice(-64);
    if(this.command){this.command.actual=v;this.command.error=a.step.target-v;this.command.elapsedMs=at-a.at;}
    const companion=positions.findIndex((n,j)=>j!==i&&Math.abs(n-a.before[j]!)>MOTION_DEVIATION_MARGIN);
    if(companion!==-1){this.fail(`While commanding servo ${i+1}, servo ${companion+1} changed from ${a.before[companion]} to ${positions[companion]} (more than ${MOTION_DEVIATION_MARGIN} raw units).`);return;}
    const min=this.path?.min??Math.min(a.before[i]!,a.step.target),max=this.path?.max??Math.max(a.before[i]!,a.step.target);
    if(v<min-MOTION_DEVIATION_MARGIN||v>max+MOTION_DEVIATION_MARGIN){this.fail(`Servo ${i+1} reported ${v} outside its commanded path from ${min} to ${max} (${MOTION_DEVIATION_MARGIN}-unit margin).`);return;}
    if(this.plan.manual && Math.abs(v-a.step.target)>9 && at-a.at>=Math.max(1000,this.travelDistance(a.step)/this.speed*1000+1000)){
      a.samples.push({at,v});a.samples=a.samples.slice(-3);
      if(a.written&&a.samples.length===3&&a.samples[2]!.at-a.samples[0]!.at>=150&&Math.max(...a.samples.map(s=>s.v))-Math.min(...a.samples.map(s=>s.v))<=3){this.phase='Settled short';this.message=`Servo ${i+1} settled at ${v}; target ${a.step.target}, remaining ${a.step.target-v}. Adjust the slider to request another position.`;this.active=null;}return;
    }
    if(Math.abs(v-a.step.target)<=9){a.samples.push({at,v});a.samples=a.samples.slice(-3);if(a.samples.length===3&&Math.max(...a.samples.map(s=>s.v))-Math.min(...a.samples.map(s=>s.v))<=9&&a.samples[2]!.at-a.samples[0]!.at>=150&&a.written){this.index++;this.active=null;if(this.index===this.steps.length){if(positions.some((n,j)=>Math.abs(n-this.plan.target[j]!)>(this.plan.manual&&j!==i?MOTION_DEVIATION_MARGIN:12))){this.fail('Final pose differs from the requested pose.');return;}this.phase='Complete';}}}else a.samples=[];
  }
  written(at:number){this.lastWrite=at;if(this.active)this.active.written=true;}
  fail(message:string){if(this.phase==='Fault')return;this.failure={message,positions:[...this.latest],command:this.command?{...this.command}:null};this.phase='Fault';this.message=message;this.active=null;}
  stop(){if(this.activeRun)this.phase='Stopped';this.active=null;}
  status(){const next=this.steps[this.index];return {phase:this.phase,message:this.message,speed:this.speed,acceleration:this.acceleration,commandedPath:this.pathBounds(),completedWaypoints:this.index,totalSteps:this.steps.length,next:next?{servo:next.servo,target:next.target}:null,command:this.command?{...this.command}:null};}
  report(){return {...this.status(),feedback:this.feedback.map(sample=>({...sample,positions:[...sample.positions]})),failure:this.failure?{...this.failure,positions:[...this.failure.positions],command:this.failure.command?{...this.failure.command}:null}:null,before:[...this.before],latest:[...this.latest],target:[...this.plan.target],steps:this.steps.map(s=>({...s})),speed:this.speed,acceleration:this.acceleration};}
}
