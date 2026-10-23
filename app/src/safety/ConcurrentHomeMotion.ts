import { SmoothTeacherMotion, MOTION_DEVIATION_MARGIN, TARGET_TOLERANCE } from './SmoothTeacherMotion';
import type { smoothPlan } from './SmoothTeacherMotion';

// Each joint retains the existing path, settling and deadline supervisor.
// Group supervision replaces single-joint companion checks during Home.
export class ConcurrentHomeMotion {
  phase:SmoothTeacherMotion['phase']='Enabled';
  message='Ready';
  readonly steps:ReturnType<typeof smoothPlan>['steps'];
  private readonly joints:SmoothTeacherMotion[];
  private latest:readonly number[];
  private dispatched=false;
  private failure: {message:string;positions:number[]}|null=null;
  constructor(private readonly before:readonly number[],at:number,private readonly plan:ReturnType<typeof smoothPlan>,private readonly label='Home'){
    this.before=[...before];this.latest=[...before];this.steps=plan.steps.map(step=>({...step}));
    this.joints=this.steps.map(step=>new SmoothTeacherMotion(before,at,{...plan,steps:[step]},null,true));
    if(!this.steps.length){this.phase='Complete';this.message=`Already within ${label} tolerance.`;}
  }
  get speed(){return this.plan.speed;}
  get acceleration(){return this.plan.acceleration;}
  get activeRun(){return this.phase==='Enabled'||this.phase==='Running';}
  pathBounds(){return null;}
  start(positions:readonly number[],at:number){
    this.latest=[...positions];this.joints.forEach(joint=>joint.start(positions,at));
    this.phase=this.steps.length?'Running':'Complete';
  }
  nextBatch(at:number){
    this.checkDeadline(at);
    if(this.phase!=='Running'||this.dispatched)return null;
    const steps=this.joints.map(joint=>joint.next(at));
    if(steps.some(step=>!step)){this.fail(`${this.label} group could not prepare all joint targets.`);return null;}
    this.dispatched=true;return this.steps;
  }
  written(at:number){if(this.phase==='Running')this.joints.forEach(joint=>joint.written(at));}
  observe(positions:readonly number[],at:number){
    this.latest=[...positions];if(this.phase!=='Running')return;
    // Validate every joint, including ones that have already settled or were
    // skipped because they started near Home.
    for(let i=0;i<6;i++){
      const step=this.steps.find(step=>step.servo===i+1),from=this.before[i]!,target=step?.target??from;
      if(positions[i]!<Math.min(from,target)-MOTION_DEVIATION_MARGIN||positions[i]!>Math.max(from,target)+MOTION_DEVIATION_MARGIN){
        this.fail(`${this.label} servo ${i+1} reported ${positions[i]} outside its commanded path from ${from} to ${target} (${MOTION_DEVIATION_MARGIN}-unit margin).`);return;
      }
    }
    for(const joint of this.joints){joint.observe(positions,at);if(joint.phase==='Fault'){this.fail(joint.message);return;}}
    if(this.joints.every(joint=>joint.phase==='Complete')){
      if(positions.some((value,i)=>Math.abs(value-this.plan.target[i]!)>TARGET_TOLERANCE)){this.fail(`Final pose differs from the requested ${this.label} pose.`);return;}
      this.phase='Complete';this.message=`All ${this.label} joints settled.`;
    }
  }
  checkDeadline(at:number){
    if(this.phase!=='Running')return;
    for(const joint of this.joints){joint.checkDeadline(at);if(joint.phase==='Fault'){this.fail(joint.message);return;}}
  }
  fail(message:string){
    if(this.phase==='Fault')return;
    this.failure={message,positions:[...this.latest]};this.phase='Fault';this.message=message;
    this.joints.forEach(joint=>{if(joint.activeRun)joint.fail(message);});
  }
  stop(){if(this.activeRun)this.phase='Stopped';this.joints.forEach(joint=>joint.stop());}
  status(){
    const statuses=this.joints.map(joint=>joint.status()),commands=statuses.flatMap(status=>status.command?[{...status.command,actual:this.latest[status.command.servo-1]!,error:status.command.target-this.latest[status.command.servo-1]!}]:[]);
    const waiting=statuses.find(status=>status.phase!=='Complete');
    return {phase:this.phase,message:this.message,speed:this.speed,acceleration:this.acceleration,commandedPath:null,
      completedWaypoints:statuses.filter(status=>status.phase==='Complete').length,totalSteps:this.steps.length,
      next:waiting?.next??null,command:waiting?.command??commands[0]??null,commands};
  }
  report(){return {...this.status(),mode:this.label==='Home'?'concurrent-home':'concurrent-position',before:[...this.before],latest:[...this.latest],target:[...this.plan.target],
    steps:this.steps.map(step=>({...step})),joints:this.joints.map(joint=>joint.report()),
    failure:this.failure?{...this.failure,positions:[...this.failure.positions]}:null};}
}
