import {validateCoordinateTarget} from '../protocol/CoordinateTarget';

type JointCommand={servo:number;from:number;target:number;actual:number;error:number;elapsedMs:number;deadlineMs:number};

export class NativeCoordinateMotion {
  phase:'Enabled'|'Running'|'Complete'|'Stopped'|'Fault'='Enabled';
  message='Ready to send native coordinates.';
  readonly target:ReturnType<typeof validateCoordinateTarget>;
  private latest:number[];private lastObservation:number;private started=0;private sent=false;private writtenAt:number|null=null;
  constructor(private readonly before:readonly number[],at:number,input:unknown){this.target=validateCoordinateTarget(input);this.latest=[...before];this.lastObservation=at;}
  get activeRun(){return this.phase==='Enabled'||this.phase==='Running';}
  pathBounds(){return null;}
  start(positions:readonly number[],at:number){this.started=at;this.lastObservation=at;this.latest=[...positions];this.phase='Running';}
  dispatch(at:number){this.checkDeadline(at);if(this.phase!=='Running'||this.sent)return false;this.sent=true;return true;}
  written(at:number){if(this.phase==='Running'&&this.sent){this.writtenAt=at;this.message='Native coordinate frame running; firmware controls the joints.';}}
  observe(positions:readonly number[],at:number){this.latest=[...positions];this.lastObservation=at;this.checkDeadline(at);}
  checkDeadline(at:number){
    if(this.phase!=='Running')return;
    if(at-this.lastObservation>1500){this.fail('Coordinate move canceled after 1.5 seconds without valid feedback.');return;}
    if(this.writtenAt!==null&&at-this.writtenAt>=this.target.durationMs){this.phase='Complete';this.message='Native coordinate frame time elapsed. Verify the LCD and physical result; arrival is not confirmed.';}
    else if(this.writtenAt===null&&at-this.started>=2000)this.fail('Coordinate command write deadline exceeded.');
  }
  fail(message:string){this.phase='Fault';this.message=message;}
  stop(){if(this.activeRun){this.phase='Stopped';this.message='Coordinate sequence canceled. Current firmware motion may need physical intervention.';}}
  status(){return {phase:this.phase,message:this.message,speed:null,acceleration:null,commandedPath:null,commands:[] as JointCommand[],command:null as JointCommand|null,next:null,completedWaypoints:this.writtenAt===null?0:1,totalSteps:1,durationMs:this.target.durationMs,completionPolicy:'elapsed-time' as const};}
  report(){return {...this.status(),mode:'native-coordinate',target:{...this.target},before:[...this.before],latest:[...this.latest],sent:this.sent,writeResolved:this.writtenAt!==null,jointTargetsKnown:false,profile:'firmware-controlled',browserJointLimitsPrechecked:false};}
}
