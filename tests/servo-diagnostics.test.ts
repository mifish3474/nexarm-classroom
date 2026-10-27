import {describe,it,expect,vi} from 'vitest';
import {DIAGNOSTIC_READS,encodeDiagnosticRead,assertDiagnosticReadPacket,inspectDiagnosticReply,diagnosticRead} from '../app/src/protocol/ServoDiagnosticProtocol';
import {ServoDiagnosticSession} from '../app/src/robot/ServoDiagnosticSession';
import {FrameParser} from '../app/src/protocol/FrameParser';
import type {Frame} from '../app/src/protocol/FrameParser';

const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
const locks={request:async(_name:string,_options:unknown,run:(lease:object)=>Promise<void>)=>run({})} as unknown as LockManager;
const packet=(id:number,field:number,payload:number[],weak=false)=>{
  const body=[id,payload.length+2,field,...payload];return Uint8Array.from([255,255,...body,(~(weak?body.slice(0,3):body).reduce((a,b)=>a+b,0))&255]);
};
function fixture(options:{hang?:boolean;reject?:boolean;locks?:LockManager}={}){
  let at=0,visible=true,reader!:ReadableStreamDefaultController<Uint8Array>,finishWrite!:()=>void;
  const writes:{at:number;bytes:number[]}[]=[],port={open:vi.fn(async()=>{}),close:vi.fn(async()=>{}),
    readable:new ReadableStream<Uint8Array>({start(controller){reader=controller;}}),writable:new WritableStream<Uint8Array>({write(bytes){writes.push({at,bytes:[...bytes]});if(options.reject)return Promise.reject(Error('USB failed'));if(options.hang)return new Promise<void>(resolve=>{finishWrite=resolve;});}})};
  const session=new ServoDiagnosticSession(options.locks??locks,()=>at,()=>visible,()=>{});
  const feed=async(id:number,field:number,payload:number[],weak=false)=>{reader.enqueue(packet(id,field,payload,weak));await flush();};
  const raw=async(bytes:Uint8Array)=>{reader.enqueue(bytes);await flush();};
  const ready=async()=>{session.connect(async()=>port);await flush();};
  const advance=async(ms:number)=>{at+=ms;session.tick();await flush();};
  const reply=async()=>{
    const query=DIAGNOSTIC_READS.find(read=>read.key===session.snapshot().current)!;
    if(query.kind==='controller-version')return feed(255,1,[1,0,0]);
    if(query.kind==='factory-overload')return feed(255,71,[query.servo!,20,200,80]);
    if(query.kind==='factory-max-torque')return feed(255,75,[query.servo!,232,3]);
    if(query.kind==='position')return feed(query.servo!,0,[0,8]);
    if(query.kind==='identity')return feed(query.servo!,0,[2,43,0,30,0]);
    if(query.kind==='protection'){const bytes=Array(27).fill(0);bytes[7]=16;bytes[21]=20;bytes[22]=200;bytes[23]=80;return feed(query.servo!,0,bytes);}
    return feed(query.servo!,0,[0,8,0,0,100,0,120,30,0,16,0,0,0,250,0]);
  };
  return {session,writes,port,ready,feed,raw,reply,advance,finish:async()=>{finishWrite();await flush();},hide:()=>{visible=false;},end:async()=>{reader.close();await flush();}};
}

describe('read-only diagnostic protocol boundary',()=>{
 it('permits only one firmware query or fixed servo READ packets; excludes all writes, movement and arbitrary registers',()=>{
   expect(DIAGNOSTIC_READS).toHaveLength(49);expect(Object.isFrozen(DIAGNOSTIC_READS[0])).toBe(true);
   for(const read of DIAGNOSTIC_READS){const bytes=encodeDiagnosticRead(read.key);expect(()=>assertDiagnosticReadPacket(bytes)).not.toThrow();const frame=new FrameParser().push(bytes)[0]!;expect(frame.integrity).toBe('full');if(read.kind==='controller-version')expect([...bytes]).toEqual([255,255,255,2,1,253]);else if(frame.deviceId===255){expect([71,75]).toContain(frame.command);expect(frame.payload).toEqual([read.servo]);}else expect(frame.command).toBe(2);}
   for(const bytes of [packet(255,61,[0]),packet(255,72,[1,20,200]),packet(255,76,[1,232,3]),packet(255,8,Array(14).fill(0)),packet(1,3,[0x2a,0,8]),packet(1,2,[0x37,1]),packet(254,2,[0,5]),Uint8Array.from([...encodeDiagnosticRead('J1-identity'),...encodeDiagnosticRead('J2-identity')])])expect(()=>assertDiagnosticReadPacket(bytes)).toThrow('only whitelisted READ');
   expect(()=>encodeDiagnosticRead('custom-register')).toThrow();const bad=encodeDiagnosticRead('J1-status-1');bad[bad.length-1]^=1;expect(()=>assertDiagnosticReadPacket(bad)).toThrow();
 });
 it('accepts captured dual-controller firmware and factory replies while distinguishing missing thresholds from zero values',()=>{
   const read=diagnosticRead('controller-version'),frame:Frame={deviceId:255,command:1,integrity:'full',payload:[1,0,2,1,0,2]};
   expect(inspectDiagnosticReply(read,frame)).toMatchObject({kind:'data',decoded:{esp32Version:'1.0.2',at32Version:'1.0.2',firmwareBytes:[1,0,2,1,0,2]}});
   expect(inspectDiagnosticReply(diagnosticRead('J2-factory-max-torque'),{...frame,command:75,payload:[2,0,0]})).toMatchObject({kind:'data',decoded:{maxTorqueRaw:0,zeroMeaningVerified:false}});
   expect(inspectDiagnosticReply(diagnosticRead('J2-factory-overload'),{...frame,command:71,payload:[2,20,200]})).toMatchObject({kind:'data',decoded:{overloadThresholdByteRaw:null}});
   for(const invalid of [{...frame,command:75,payload:[3,232,3]},{...frame,command:76,payload:[2,232,3]},{...frame,command:75,payload:[2,232]},{...frame,command:75,payload:[2,232,3],integrity:'abbreviated-only' as const}])expect(inspectDiagnosticReply(diagnosticRead('J2-factory-max-torque'),invalid).kind).toBe('ignore');
 });
 it('keeps nonzero servo reply ERROR separate from payload and rejects weak, wrong-ID and mismatched layouts',()=>{
   const read=diagnosticRead('J1-status-1'),frame:Frame={deviceId:1,command:16,integrity:'full',payload:[]};
   expect(inspectDiagnosticReply(read,frame)).toEqual({kind:'device-error',errorByte:16,payload:[]});
   for(const invalid of [{...frame,deviceId:2},{...frame,integrity:'abbreviated-only' as const},{...frame,command:0,payload:[1,2]}])expect(inspectDiagnosticReply(read,invalid).kind).toBe('ignore');
   const zero=inspectDiagnosticReply(read,{...frame,command:0,payload:Array(15).fill(0)});expect(zero).toMatchObject({kind:'data',decoded:{allBytesZero:true,interpretationVerified:false}});
 });
});

describe('bounded read-only diagnostic session',()=>{
 it('does not complete a diagnostic reply from a header received before the capture started',async()=>{
   const f=fixture();await f.ready();const bytes=packet(255,1,[1,0,2,1,0,2]);await f.raw(bytes.subarray(0,6));f.session.start();await flush();await f.raw(bytes.subarray(6));
   expect(f.session.snapshot().completed).toBe(0);expect(f.session.report().rawReceive.capturedBytes).toBe(bytes.length-6);await f.feed(255,1,[1,0,2,1,0,2]);expect(f.session.snapshot().completed).toBe(1);f.session.disconnect();await flush();
 });
 it('captures unparsed bytes only during an explicit scan, without treating them as readings or allowing late capture',async()=>{
   const f=fixture();await f.ready();const bytes=new TextEncoder().encode('unframed reply');await f.raw(bytes);expect(f.session.report().rawReceive.capturedBytes).toBe(0);
   f.session.start();await flush();await f.raw(bytes);expect(f.session.snapshot().completed).toBe(0);expect(f.session.snapshot().results[0]!.decoded).toBeNull();
   const report=f.session.report();expect(report.rawReceive.capturedBytes).toBe(bytes.length);expect(report.rawReceiveCapture.records[0]).toMatchObject({pendingReadAtArrival:'controller-version',hex:Array.from(bytes,n=>n.toString(16).padStart(2,'0')).join('')});
   report.rawReceiveCapture.records[0]!.hex='changed';expect(f.session.report().rawReceiveCapture.records[0]!.hex).not.toBe('changed');
   f.session.stop();await f.raw(bytes);expect(f.session.report().rawReceive.capturedBytes).toBe(bytes.length);expect(f.writes).toHaveLength(1);f.session.disconnect();await flush();
 });
 it.each(['bytes','chunks'])('bounds raw capture by %s and reports omissions without further requests',async bound=>{
   const f=fixture();await f.ready();f.session.start();await flush();const count=bound==='bytes'?300:1100,bytes=new Uint8Array(bound==='bytes'?256:1).fill(65);
   for(let i=0;i<count;i++)await f.raw(bytes);
   const report=f.session.report();expect(report.rawReceive.capturedBytes).toBe(bound==='bytes'?65536:1024);expect(report.rawReceiveCapture.records.length).toBeLessThanOrEqual(1024);expect(report.rawReceive.truncated).toBe(true);expect(report.rawReceive.omittedBytes).toBe(count*bytes.length-report.rawReceive.capturedBytes);expect(f.writes).toHaveLength(1);f.session.disconnect();await flush();
 });
 it('Connect is passive; explicit Start sends a finite ordered scan, preserves raw settings/fault data and repeats no scan automatically',async()=>{
   const f=fixture();await f.ready();expect(f.writes).toHaveLength(0);expect(f.port.open).toHaveBeenCalledWith({baudRate:1_000_000});f.session.start();await flush();
   for(let i=0;i<49;i++){
     expect(f.writes).toHaveLength(i+1);await f.advance(5);await f.reply();await f.advance(99);expect(f.writes).toHaveLength(i+1);await f.advance(1);
   }
   const state=f.session.snapshot();expect(state).toMatchObject({phase:'Complete',completed:49,canStart:false});expect(f.writes).toHaveLength(49);
   expect(state.results.filter(r=>r.kind==='status')).toHaveLength(18);expect(state.results.at(-1)).toMatchObject({outcome:'data',decoded:{loadRaw:100,currentRaw:250,statusByteRaw:16,interpretationVerified:false}});
   expect(state.results.find(r=>r.kind==='protection')).toMatchObject({decoded:{postOverloadTorqueByteRaw:20,overloadDelayByteRaw:200,interpretationVerified:false}});
   const report=f.session.report();expect(report.constraints).toMatchObject({readOnly:true,modelMappingVerified:false,personnelProtectionVerified:false});
   const index=report.results.findIndex(r=>r.kind==='identity'),exported=report.results[index]!.payload!;exported[0]=99;expect(f.session.snapshot().results[index]!.payload![0]).toBe(2);
   expect(()=>f.session.start()).toThrow('new independent');await f.advance(60000);expect(f.writes).toHaveLength(49);f.session.disconnect();await flush();
 });
 it('isolates passive telemetry, weak frames and wrong servos from the pending read; preserves device errors without inferring healthy values',async()=>{
   const f=fixture();await f.ready();f.session.start();await flush();while(f.session.snapshot().current!=='J1-identity'){await f.reply();await f.advance(100);}const before=f.session.snapshot().completed;
   await f.feed(2,0,[2,43,0,30,0]);await f.feed(1,0,[2,43,0,30,0],true);expect(f.session.snapshot().completed).toBe(before);
   await f.feed(255,55,[1,2,43,0,30,0]);expect(f.session.report().rejectedReplies.some(r=>r.deviceId===255&&r.fieldByte===55)).toBe(true);expect(f.session.snapshot().completed).toBe(before);
   await f.feed(255,11,[...Array(12).fill(0),...Array(6).fill([0,8]).flat()]);expect(f.session.snapshot().passive?.positions).toEqual(Array(6).fill(2048));expect(f.session.snapshot().completed).toBe(before);
   await f.feed(1,16,[]);expect(f.session.snapshot().results.at(-1)).toMatchObject({outcome:'device-error',errorByte:16,decoded:null});expect(f.session.report().rejectedReplies.length).toBeGreaterThan(0);
   f.session.disconnect();await flush();
 });
 it('does not turn timeouts into zeros and skips repeated samples after a same-layout timeout',async()=>{
   const f=fixture();await f.ready();f.session.start();await flush();
   while(f.session.snapshot().current!=='J1-status-1'){await f.reply();await f.advance(100);}
   await f.advance(1000);expect(f.session.snapshot().results.at(-1)).toMatchObject({key:'J1-status-1',outcome:'timeout',payload:null,decoded:null});
   await f.feed(1,0,Array(15).fill(0));await f.advance(100);
   while(f.session.snapshot().phase==='Reading'){if(f.session.snapshot().current)await f.reply();await f.advance(100);}
   expect(f.session.snapshot().results.filter(r=>r.key==='J1-status-2'||r.key==='J1-status-3').map(r=>r.outcome)).toEqual(['skipped','skipped']);expect(f.writes).toHaveLength(47);f.session.disconnect();await flush();
 });
 it('uses factory configuration results when the short register probes time out, without repeating the failed bulk reads',async()=>{
   const f=fixture();await f.ready();f.session.start();await flush();await f.feed(255,1,[1,0,2,1,0,2]);await f.advance(100);
   while(f.session.snapshot().phase==='Reading'){
     const key=f.session.snapshot().current;
     if(key){const query=diagnosticRead(key);if(query.kind==='factory-overload'||query.kind==='factory-max-torque')await f.reply();else await f.advance(1000);}
     await f.advance(100);
   }
   const report=f.session.report();expect(report.results.filter(r=>r.outcome==='data')).toHaveLength(13);expect(report.results.filter(r=>r.outcome==='timeout')).toHaveLength(6);expect(report.results.filter(r=>r.outcome==='skipped')).toHaveLength(30);expect(f.writes).toHaveLength(19);expect(f.writes.filter(w=>w.bytes[4]===2).every(w=>w.bytes[5]===56&&w.bytes[6]===2)).toBe(true);f.session.disconnect();await flush();
 });
 it.each(['stop','hide','disconnect','stream-end'])('cancels future reads on %s; late replies do not restart a scan',async action=>{
   const f=fixture();await f.ready();f.session.start();await flush();
   if(action==='stop')f.session.stop();else if(action==='hide'){f.hide();f.session.tick();}else if(action==='disconnect')f.session.disconnect();else await f.end();await flush();
   if(action==='stop')await f.feed(255,1,[1,0,0]);await f.advance(5000);expect(f.writes).toHaveLength(1);expect(f.session.snapshot().phase).toBe('Canceled');f.session.disconnect();await flush();
 });
 it('bounds hanging/failed USB writes and waits for the writer before closing the port',async()=>{
   const f=fixture({hang:true});await f.ready();f.session.start();await flush();await f.advance(2100);expect(f.session.snapshot().phase).toBe('Fault');expect(f.writes).toHaveLength(1);
   f.session.disconnect();await flush();expect(f.port.close).not.toHaveBeenCalled();await f.finish();expect(f.port.close).toHaveBeenCalledOnce();
   const failed=fixture({reject:true});await failed.ready();failed.session.start();await flush();expect(failed.session.snapshot().phase).toBe('Fault');expect(failed.writes).toHaveLength(1);failed.session.disconnect();await flush();
 });
 it('honors the existing USB lease and makes no requests if another tab owns it',async()=>{
   const held={request:async(_name:string,_options:unknown,run:(lease:null)=>Promise<void>)=>run(null)} as unknown as LockManager;
   const f=fixture({locks:held});await f.ready();expect(f.session.snapshot().message).toContain('Another tab owns');expect(f.port.open).not.toHaveBeenCalled();expect(f.writes).toHaveLength(0);
 });
 it('rejects a packet smuggled into the private transport even while connected',async()=>{
   const f=fixture();await f.ready();const transport=f.session as unknown as {submit:(bytes:Uint8Array)=>void};transport.submit(packet(255,61,[0]));await flush();expect(f.writes).toHaveLength(0);expect(f.session.snapshot().phase).toBe('Fault');f.session.disconnect();await flush();
 });
});
