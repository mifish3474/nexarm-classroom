import {PassiveConnection} from '../serial/PassiveConnection';
import type {ReadOnlyPort} from '../serial/PassiveConnection';
import {FrameParser,decodePositions} from '../protocol/FrameParser';
import {DIAGNOSTIC_READS,diagnosticRead,encodeDiagnosticRead,assertDiagnosticReadPacket,inspectDiagnosticReply,replyKey} from '../protocol/ServoDiagnosticProtocol';
import type {DiagnosticRead} from '../protocol/ServoDiagnosticProtocol';

export interface DiagnosticPort extends ReadOnlyPort {readonly writable:WritableStream<Uint8Array>|null;}
type Outcome='pending'|'data'|'device-error'|'timeout'|'canceled'|'write-failed'|'skipped';
type Result={key:string;kind:DiagnosticRead['kind'];servo:number|null;sample:number;sentAtMs:number|null;finishedAtMs:number|null;elapsedMs:number|null;outcome:Outcome;requestBytes:number[];payload:number[]|null;errorByte:number|null;decoded:Record<string,unknown>|null;note:string;};
const REPLY_TIMEOUT_MS=1000,WRITE_TIMEOUT_MS=2000,READ_GAP_MS=100;

// Separate from motion controllers. Holds the same exclusive USB lease but has
// no access to a move/torque encoder, persistent storage, or arbitrary packets.
export class ServoDiagnosticSession {
  private readonly connection:PassiveConnection;
  private readonly parser=new FrameParser();
  private port:DiagnosticPort|null=null;
  private connectionState='Disconnected';private phase:'Idle'|'Reading'|'Complete'|'Canceled'|'Fault'='Idle';
  private message='Connect, then choose Read diagnostics. Connecting sends no application commands.';
  private used=false;private cursor=0;private active:Result|null=null;private results:Result[]=[];
  private generation=0;private nextAt=0;private writeStarted=0;private writing=false;private pendingWrite:Promise<void>|null=null;
  private quarantine=new Set<string>();
  private unavailableDirectServos=new Set<number>();
  private observations:{atMs:number;reason:string;deviceId:number;fieldByte:number;integrity:string;payload:number[]}[]=[];
  private passive:{atMs:number;positions:number[]}|null=null;private ignoredFrames=0;
  constructor(locks:LockManager,private readonly now:()=>number,private readonly visible:()=>boolean,private readonly changed:()=>void){
    this.connection=new PassiveConnection((state,message)=>{
      this.connectionState=state;
      if(state==='Listening')this.message='Connected. No requests sent yet. Keep the robot stationary, then choose Read diagnostics.';
      else {if(this.phase==='Reading')this.cancel('Canceled','Connection ended; future reads canceled.');this.message=message;}
      this.changed();
    },bytes=>this.receive(bytes),locks);
  }
  connect(select:()=>Promise<DiagnosticPort>){
    if(this.connectionState!=='Disconnected'||!this.visible())return;
    this.generation++;this.used=false;this.phase='Idle';this.results=[];this.cursor=0;this.active=null;this.observations=[];this.ignoredFrames=0;this.passive=null;this.quarantine.clear();this.unavailableDirectServos.clear();this.parser.reset();
    this.connection.connect(async()=>{
      const port=await select();this.port=port;
      return {get readable(){return port.readable;},open:options=>port.open(options),close:async()=>{await this.pendingWrite?.catch(()=>{});try{await port.close();}finally{this.port=null;}}};
    });
  }
  start(){
    if(this.connectionState!=='Listening'||!this.visible()||this.used||this.writing)throw Error('Connect for a new independent read-only scan.');
    if(!this.port?.writable)throw Error('The port has no writable stream for read requests.');
    this.used=true;this.phase='Reading';this.nextAt=this.now();this.message='Reading diagnostic snapshots. No motion or configuration writes.';this.tick();
  }
  snapshot(){return {connectionState:this.connectionState,phase:this.phase,message:this.message,completed:this.results.filter(r=>r.outcome!=='pending').length,total:DIAGNOSTIC_READS.length,
    canConnect:this.connectionState==='Disconnected',canStart:this.connectionState==='Listening'&&!this.used&&!this.writing,canStop:this.phase==='Reading',canExport:this.used,
    current:this.active?.key??null,results:structuredClone(this.results),passive:this.passive?{atMs:this.passive.atMs,positions:[...this.passive.positions],fresh:this.connectionState==='Listening'&&this.visible()&&this.now()-this.passive.atMs<=1000}:null};}
  private finish(outcome:Exclude<Outcome,'pending'|'skipped'>,note:string){
    const r=this.active;if(!r)return;r.outcome=outcome;r.note=note;r.finishedAtMs=this.now();r.elapsedMs=r.sentAtMs===null?null:this.now()-r.sentAtMs;
    if(outcome==='timeout'){this.quarantine.add(replyKey(diagnosticRead(r.key)));if(r.kind==='position'&&r.servo!==null)this.unavailableDirectServos.add(r.servo);}
    this.active=null;this.cursor++;this.nextAt=this.now()+READ_GAP_MS;
  }
  private cancel(phase:'Canceled'|'Fault',message:string){
    if(this.active)this.finish(phase==='Fault'?'write-failed':'canceled',message);
    this.phase=phase;this.message=message;this.generation++;this.changed();
  }
  stop(){if(this.phase==='Reading')this.cancel('Canceled','Diagnostic reads stopped. Future requests canceled; no hold or torque command sent. Reconnect for another scan.');}
  disconnect(){this.stop();this.connection.disconnect();}
  tick(){
    if(this.connectionState!=='Listening')return;
    if(!this.visible()){this.disconnect();return;}
    if(this.phase!=='Reading')return;
    if(this.writing&&this.now()-this.writeStarted>=WRITE_TIMEOUT_MS){this.cancel('Fault','Read-request delivery did not finish. Future reads canceled; reconnect after USB settles.');return;}
    if(this.active&&this.now()-this.active.sentAtMs!>=REPLY_TIMEOUT_MS)this.finish('timeout','No matching fully checked reply. No value inferred; this is not a zero reading.');
    if(this.active||this.writing||this.now()<this.nextAt)return;
    while(this.cursor<DIAGNOSTIC_READS.length){
      const read=DIAGNOSTIC_READS[this.cursor]!;
      const directUnavailable=read.servo!==null&&this.unavailableDirectServos.has(read.servo)&&['identity','protection','status'].includes(read.kind);
      if(!directUnavailable&&!this.quarantine.has(replyKey(read)))break;
      this.results.push({key:read.key,kind:read.kind,servo:read.servo,sample:read.sample,sentAtMs:null,finishedAtMs:this.now(),elapsedMs:null,outcome:'skipped',requestBytes:[],payload:null,errorByte:null,decoded:null,note:directUnavailable?'The short direct-position read did not reply. Broader register reads skipped; factory API results are separate.':'Earlier same-servo/layout read timed out. Skipped to avoid mistaking a late reply for a new sample.'});this.cursor++;
    }
    if(this.cursor===DIAGNOSTIC_READS.length){this.phase='Complete';this.message='Scan complete. Export the results. These readings are not a safety assessment. Disconnect and reconnect to repeat.';this.changed();return;}
    const read=DIAGNOSTIC_READS[this.cursor]!,packet=encodeDiagnosticRead(read.key);
    const result:Result={key:read.key,kind:read.kind,servo:read.servo,sample:read.sample,sentAtMs:this.now(),finishedAtMs:null,elapsedMs:null,outcome:'pending',requestBytes:[...packet],payload:null,errorByte:null,decoded:null,note:'Waiting for reply.'};
    this.results.push(result);this.active=result;this.message=`Reading ${read.key} (${this.cursor+1}/${DIAGNOSTIC_READS.length}).`;
    this.submit(packet);this.changed();
  }
  private submit(packet:Uint8Array){
    let writer:WritableStreamDefaultWriter<Uint8Array>|undefined;
    try{
      assertDiagnosticReadPacket(packet);
      if(this.writing||this.phase!=='Reading'||!this.visible()||this.connectionState!=='Listening'||!this.port?.writable)throw Error('Read-only writer unavailable.');
      writer=this.port.writable.getWriter();const activeWriter=writer,generation=this.generation;
      this.writing=true;this.writeStarted=this.now();
      this.pendingWrite=activeWriter.write(packet).finally(()=>{activeWriter.releaseLock();this.writing=false;});
      void this.pendingWrite.then(()=>{if(this.generation===generation)this.changed();},()=>{if(this.generation===generation)this.cancel('Fault','USB read request failed; future requests canceled. Reconnect before another scan.');});
    }catch(error){writer?.releaseLock();this.writing=false;this.cancel('Fault',error instanceof Error?error.message:'Read request failed.');}
  }
  private receive(bytes:Uint8Array){
    if(this.connectionState!=='Listening')return;
    for(const frame of this.parser.push(bytes)){
      const positions=decodePositions(frame);if(positions)this.passive={atMs:this.now(),positions:[...positions]};
      const active=this.active;if(!active||this.phase!=='Reading')continue;
      if(this.now()-active.sentAtMs!>=REPLY_TIMEOUT_MS){this.finish('timeout','Read deadline elapsed; no matching reply was accepted within it. No value inferred.');continue;}
      const read=diagnosticRead(active.key),reply=inspectDiagnosticReply(read,frame);
      if(reply.kind==='ignore'){
        this.ignoredFrames++;
        // Preserve relevant rejected replies only; do not fill the export with
        // continuous passive telemetry or USB device identifiers.
        const backgroundPose=[255,90].includes(frame.deviceId)&&frame.command===11&&frame.payload.length===24;
        // Keep unexpected bridge envelopes too: a repackaged reply may explain
        // why a direct-servo read did not match. Exclude only known pose chatter.
        if(!backgroundPose)this.observations=[...this.observations,{atMs:this.now(),reason:reply.reason,deviceId:frame.deviceId,fieldByte:frame.command,integrity:frame.integrity,payload:[...frame.payload]}].slice(-40);
        continue;
      }
      active.payload=[...reply.payload];
      if(reply.kind==='device-error'){active.errorByte=reply.errorByte;this.finish('device-error',`Servo returned error byte 0x${reply.errorByte.toString(16).padStart(2,'0')}. Payload retained; no healthy readings inferred.`);}
      else {active.decoded=reply.decoded;this.finish('data',read.kind==='controller-version'?'Controller version bytes received.':'Fully checked data received. Model/layout interpretation remains unverified.');}
    }
    this.changed();
  }
  report(){return {format:'nexarm-read-only-servo-diagnostics',schemaVersion:1,capturedAt:new Date().toISOString(),
    constraints:{readOnly:true,profile:'factory-api-and-gated-registers-v2',oneScanPerConnection:true,maxRequests:DIAGNOSTIC_READS.length,replyDeadlineMs:REPLY_TIMEOUT_MS,writeDeadlineMs:WRITE_TIMEOUT_MS,minGapMs:READ_GAP_MS,modelMappingVerified:false,unitsVerified:false,personnelProtectionVerified:false,
      correlation:'One outstanding read, matched ID/layout. No wire transaction ID. Repeated reads after a timeout are skipped; late/canceled replies cannot resume a scan.'},
    ...this.snapshot(),ignoredFrames:this.ignoredFrames,rejectedReplies:structuredClone(this.observations)};}
}
