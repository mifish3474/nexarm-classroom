import {HOME_REFERENCE,HOME_TOLERANCE,referenceReturnProposal} from './ReferenceReturnProposal';
export const RETURN_APPROVAL_KEY='nexarm.approval.staged-reference-a.2026-10-22';
type Step=ReturnType<typeof referenceReturnProposal>[number];
export interface StagedRoute {
  readonly target: readonly number[];
  readonly steps: readonly Step[];
  readonly intervalMs: number;
  readonly maxCommandDelta: number;
  readonly label: string;
}
export class StagedReferenceReturn {
  phase:'Enabled'|'Running'|'Complete'|'Stopped'|'Fault'='Enabled';
  message='Review the frozen route before Start Return.';
  readonly before:readonly number[];
  readonly steps:readonly Step[];
  private readonly target:readonly number[];
  private readonly intervalMs:number;
  private readonly maxCommandDelta:number;
  private readonly label:string;
  index=0;
  private latest:readonly number[];
  private holding:readonly number[];
  private lastObservation:number;
  private lastWrite=-Infinity;
  private active:{step:Step;before:readonly number[];at:number;written:boolean;samples:{at:number;value:number}[]}|null=null;
  constructor(positions:readonly number[],at:number,route?:StagedRoute){
    this.before=Object.freeze([...positions]);this.latest=[...positions];this.holding=[...positions];this.lastObservation=at;
    this.target=Object.freeze([...(route?.target??HOME_REFERENCE)]);
    this.intervalMs=route?.intervalMs??900;this.maxCommandDelta=route?.maxCommandDelta??25;this.label=route?.label??'Reference A';
    this.steps=Object.freeze((route?.steps??referenceReturnProposal(positions)).map(step=>Object.freeze({...step})));
    if(!this.steps.length){this.phase='Complete';this.message=`Already within ±9 of ${this.label}. No command needed.`;}
  }
  start(positions:readonly number[],at:number){
    if(this.phase!=='Enabled'||positions.some((n,i)=>Math.abs(n-this.before[i]!)>5))throw new Error('Return starting state changed; stop and review.');
    this.latest=[...positions];this.holding=[...positions];this.lastObservation=at;this.phase='Running';this.message='Staged return running. No automatic retry or correction.';
  }
  next(at:number):Step|null{
    this.checkDeadline(at);
    if(this.phase!=='Running')return null;
    if(this.active)return null;
    if(at-this.lastWrite<this.intervalMs)return null;
    const step=this.steps[this.index];if(!step)return null;
    const position=this.latest[step.servo-1]!;
    if(Math.abs(position-step.from)>HOME_TOLERANCE||Math.abs(step.target-position)>this.maxCommandDelta){this.fail('Waypoint start differs from the frozen route.');return null;}
    this.active={step,before:[...this.latest],at,written:false,samples:[]};this.lastWrite=at;return step;
  }
  checkDeadline(at:number){
    if(this.phase!=='Running')return;
    if(at-this.lastObservation>500){this.fail('Return feedback is stale.');return;}
    if(this.active&&at-this.active.at>=2000)this.fail('Waypoint write/settling deadline exceeded.');
  }
  observe(positions:readonly number[],at:number){
    this.latest=[...positions];this.lastObservation=at;if(this.phase!=='Running')return;
    if(!this.active){if(positions.some((n,i)=>Math.abs(n-this.holding[i]!)>12))this.fail('Unexpected joint deviation between return waypoints.');return;}
    const a=this.active,joint=a.step.servo-1,value=positions[joint]!;
    if(at-a.at>=2000){this.fail('Waypoint settling deadline exceeded.');return;}
    if(positions.some((n,i)=>i!==joint&&Math.abs(n-a.before[i]!)>12)||value<Math.min(a.before[joint]!,a.step.target)-12||value>Math.max(a.before[joint]!,a.step.target)+12){this.fail('Unexpected joint deviation during return.');return;}
    if(Math.abs(value-a.step.target)<=HOME_TOLERANCE){
      a.samples.push({at,value});a.samples=a.samples.slice(-100);
      if(Math.max(...a.samples.map(s=>s.value))-Math.min(...a.samples.map(s=>s.value))>3)a.samples=[{at,value}];
    }else a.samples=[];
    this.advance();
  }
  written(at:number){if(this.phase==='Running'&&this.active){if(at-this.active.at>=2000){this.fail('Waypoint write deadline exceeded.');return;}this.lastWrite=Math.max(this.lastWrite,at);this.active.written=true;this.advance();}}
  private advance(){
    const a=this.active;if(!a||!a.written||a.samples.length<3||a.samples.at(-1)!.at-a.samples[0]!.at<200)return;
    this.index++;this.active=null;this.holding=[...this.latest];
    if(this.index===this.steps.length){
      if(this.latest.some((n,i)=>Math.abs(n-this.target[i]!)>HOME_TOLERANCE)){this.fail(`Final readings are outside ${this.label} tolerance. No correction will be attempted.`);return;}
      this.phase='Complete';this.message=`Feedback is within ±9 of ${this.label}. Inspect the physical pose; small residual error is expected.`;
    }
  }
  fail(message:string){this.phase='Fault';this.message=message;this.active=null;}
  stop(){if(!['Complete','Fault'].includes(this.phase)){this.phase='Stopped';this.message='Return canceled; already transmitted targets cannot be recalled.';}this.active=null;}
  get activeRun(){return this.phase==='Enabled'||this.phase==='Running';}
  status(){const next=this.steps[this.index];return {phase:this.phase,message:this.message,completedWaypoints:this.index,totalSteps:this.steps.length,next:next?{servo:next.servo,target:next.target}:null};}
  report(){return {format:'nexarm-staged-return-result',phase:this.phase,message:this.message,before:[...this.before],latest:[...this.latest],target:[...this.target],completedWaypoints:this.index,steps:this.steps.map(step=>({...step}))};}
}
