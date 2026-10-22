import {HOME_REFERENCE,referenceReturnProposal} from './ReferenceReturnProposal';
export const RETURN_APPROVAL_KEY='nexarm.approval.staged-reference-a.2026-10-22';
type Step=ReturnType<typeof referenceReturnProposal>[number];
export class StagedReferenceReturn {
  phase:'Enabled'|'Running'|'Complete'|'Stopped'|'Fault'='Enabled';
  message='Review the frozen route before Start Return.';
  readonly before:readonly number[];
  readonly steps:readonly Step[];
  index=0;
  private latest:readonly number[];
  private holding:readonly number[];
  private lastObservation:number;
  private lastWrite=-Infinity;
  private active:{step:Step;before:readonly number[];at:number;written:boolean;samples:{at:number;value:number}[]}|null=null;
  constructor(positions:readonly number[],at:number){this.before=[...positions];this.latest=[...positions];this.holding=[...positions];this.lastObservation=at;this.steps=referenceReturnProposal(positions);if(!this.steps.length){this.phase='Complete';this.message='Already within ±5 of Reference A. No command needed.';}}
  start(positions:readonly number[],at:number){
    if(this.phase!=='Enabled'||positions.some((n,i)=>Math.abs(n-this.before[i]!)>5))throw new Error('Return starting state changed; stop and review.');
    this.latest=[...positions];this.holding=[...positions];this.lastObservation=at;this.phase='Running';this.message='Staged return running. No automatic retry or correction.';
  }
  next(at:number):Step|null{
    if(this.phase!=='Running')return null;
    if(at-this.lastObservation>500){this.fail('Return feedback is stale.');return null;}
    if(this.active){if(at-this.active.at>=2000)this.fail('Waypoint write/settling deadline exceeded.');return null;}
    if(at-this.lastWrite<900)return null;
    const step=this.steps[this.index];if(!step)return null;
    const position=this.latest[step.servo-1]!;
    if(Math.abs(position-step.from)>5||Math.abs(step.target-position)>25){this.fail('Waypoint start differs from the frozen route.');return null;}
    this.active={step,before:[...this.latest],at,written:false,samples:[]};this.lastWrite=at;return step;
  }
  observe(positions:readonly number[],at:number){
    this.latest=[...positions];this.lastObservation=at;if(this.phase!=='Running')return;
    if(!this.active){if(positions.some((n,i)=>Math.abs(n-this.holding[i]!)>12))this.fail('Unexpected joint deviation between return waypoints.');return;}
    const a=this.active,joint=a.step.servo-1,value=positions[joint]!;
    if(at-a.at>=2000){this.fail('Waypoint settling deadline exceeded.');return;}
    if(positions.some((n,i)=>i!==joint&&Math.abs(n-a.before[i]!)>12)||value<Math.min(a.before[joint]!,a.step.target)-12||value>Math.max(a.before[joint]!,a.step.target)+12){this.fail('Unexpected joint deviation during return.');return;}
    if(Math.abs(value-a.step.target)<=5){
      a.samples.push({at,value});a.samples=a.samples.slice(-100);
      if(Math.max(...a.samples.map(s=>s.value))-Math.min(...a.samples.map(s=>s.value))>3)a.samples=[{at,value}];
    }else a.samples=[];
    this.advance();
  }
  written(at:number){if(this.phase==='Running'&&this.active){if(at-this.active.at>=2000){this.fail('Waypoint write deadline exceeded.');return;}this.active.written=true;this.advance();}}
  private advance(){
    const a=this.active;if(!a||!a.written||a.samples.length<3||a.samples.at(-1)!.at-a.samples[0]!.at<200)return;
    this.index++;this.active=null;this.holding=[...this.latest];
    if(this.index===this.steps.length){
      if(this.latest.some((n,i)=>Math.abs(n-HOME_REFERENCE[i]!)>5)){this.fail('Final readings are outside Reference A tolerance. No correction will be attempted.');return;}
      this.phase='Complete';this.message='Return feedback is within ±5 of Reference A. Review the physical pose before testing.';
    }
  }
  fail(message:string){this.phase='Fault';this.message=message;this.active=null;}
  stop(){if(!['Complete','Fault'].includes(this.phase)){this.phase='Stopped';this.message='Return canceled; already transmitted targets cannot be recalled.';}this.active=null;}
  get activeRun(){return this.phase==='Enabled'||this.phase==='Running';}
  report(){return {format:'nexarm-staged-return-result',phase:this.phase,message:this.message,before:[...this.before],latest:[...this.latest],target:[...HOME_REFERENCE],completedWaypoints:this.index,steps:this.steps.map(step=>({...step}))};}
}
