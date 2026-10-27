import type {Frame} from './FrameParser';

export type DiagnosticKind='controller-version'|'factory-overload'|'factory-max-torque'|'position'|'identity'|'protection'|'status';
export interface DiagnosticRead {readonly key:string;readonly kind:DiagnosticKind;readonly servo:number|null;readonly sample:number;}
const layouts=Object.freeze({position:{address:0x38,count:2},identity:{address:0x00,count:5},protection:{address:0x0d,count:27},status:{address:0x38,count:15}});
const factoryCommands=Object.freeze({'factory-overload':71,'factory-max-torque':75});
const isFactory=(kind:DiagnosticKind):kind is keyof typeof factoryCommands=>kind==='factory-overload'||kind==='factory-max-torque';

// Fixed, finite whitelist. No imported settings or arbitrary register editor.
export const DIAGNOSTIC_READS:readonly DiagnosticRead[]=Object.freeze([
  {key:'controller-version',kind:'controller-version' as const,servo:null,sample:0},
  ...(['factory-overload','factory-max-torque','position'] as const).flatMap(kind=>Array.from({length:6},(_,i)=>({key:`J${i+1}-${kind}`,kind,servo:i+1,sample:0}))),
  ...(['identity','protection'] as const).flatMap(kind=>Array.from({length:6},(_,i)=>({key:`J${i+1}-${kind}`,kind,servo:i+1,sample:0}))),
  ...[1,2,3].flatMap(sample=>Array.from({length:6},(_,i)=>({key:`J${i+1}-status-${sample}`,kind:'status' as const,servo:i+1,sample}))),
].map(read=>Object.freeze(read)));

export function diagnosticRead(key:string):DiagnosticRead {
  const read=DIAGNOSTIC_READS.find(read=>read.key===key);if(!read)throw Error('Unknown diagnostic read.');return read;
}
export function encodeDiagnosticRead(key:string):Uint8Array {
  const read=diagnosticRead(key);
  const body=read.kind==='controller-version'?[255,2,1]:isFactory(read.kind)?[255,3,factoryCommands[read.kind],read.servo!]:[read.servo!,4,2,layouts[read.kind].address,layouts[read.kind].count];
  return Uint8Array.from([255,255,...body,(~body.reduce((a,b)=>a+b,0))&255]);
}
// Independent transport gate: only exact whitelist packets may reach the writer.
export function assertDiagnosticReadPacket(bytes:Uint8Array):void {
  if(!DIAGNOSTIC_READS.some(read=>{const allowed=encodeDiagnosticRead(read.key);return allowed.length===bytes.length&&allowed.every((byte,i)=>byte===bytes[i]);}))throw Error('Blocked: diagnostic transport permits only whitelisted READ requests.');
}
export function replyKey(read:DiagnosticRead):string {return `${read.servo??255}/${read.kind==='controller-version'?'version':isFactory(read.kind)?read.kind:layouts[read.kind].count}`;}
export type DiagnosticReply={kind:'ignore';reason:string}|{kind:'device-error';errorByte:number;payload:number[]}|{kind:'data';payload:number[];decoded:Record<string,unknown>};
export function inspectDiagnosticReply(read:DiagnosticRead,frame:Frame):DiagnosticReply {
  const ignore=(reason:string):DiagnosticReply=>({kind:'ignore',reason});
  if(frame.integrity!=='full')return ignore('Abbreviated checksum: not usable diagnostic data.');
  if(read.kind==='controller-version'){
    if(![255,90].includes(frame.deviceId)||frame.command!==1)return ignore('Unrelated system frame.');
    if(![1,3,6].includes(frame.payload.length))return ignore('Unexpected controller-version layout.');
    // Factory CommManager.handle_packet explicitly maps bytes 0..2 to ESP32
    // and, when present, bytes 3..5 to AT32. Captured firmware uses six bytes.
    return {kind:'data',payload:[...frame.payload],decoded:{firmwareBytes:[...frame.payload],version:frame.payload.length>=3?frame.payload.slice(0,3).join('.'):null,
      esp32Version:frame.payload.length>=3?frame.payload.slice(0,3).join('.'):null,at32Version:frame.payload.length===6?frame.payload.slice(3,6).join('.'):null}};
  }
  if(isFactory(read.kind)){
    if(![255,90].includes(frame.deviceId)||frame.command!==factoryCommands[read.kind])return ignore('Unrelated frame for factory read.');
    if(frame.payload[0]!==read.servo)return ignore('Factory reply identifies a different servo.');
    const p=[...frame.payload];
    if(read.kind==='factory-overload'){
      if(![3,4].includes(p.length))return ignore('Unexpected factory overload layout.');
      return {kind:'data',payload:p,decoded:{source:'factory-read-api',interpretationVerified:false,postOverloadTorqueByteRaw:p[1],overloadDelayByteRaw:p[2],overloadThresholdByteRaw:p.length===4?p[3]:null}};
    }
    if(p.length!==3)return ignore('Unexpected factory maximum-torque layout.');
    return {kind:'data',payload:p,decoded:{source:'factory-read-api',interpretationVerified:false,maxTorqueRaw:p[1]!+256*p[2]!,zeroMeaningVerified:false}};
  }
  if(frame.deviceId!==read.servo)return ignore('Different servo or system telemetry.');
  // On a direct servo response, this field is ERROR, not an echoed command.
  if(frame.command!==0)return {kind:'device-error',errorByte:frame.command,payload:[...frame.payload]};
  const layout=layouts[read.kind];
  if(frame.payload.length!==layout.count)return ignore(`Expected ${layout.count} data bytes; received ${frame.payload.length}.`);
  const p=[...frame.payload],word=(i:number)=>p[i]!+256*p[i+1]!;
  let decoded:Record<string,unknown>;
  if(read.kind==='position')decoded={positionRaw:word(0),interpretationVerified:false};
  else if(read.kind==='identity')decoded={firmwareBytes:p.slice(0,2),modelCodeRaw:word(3),modelName:null,modelMappingVerified:false};
  else if(read.kind==='protection')decoded={interpretationVerified:false,protectionControlByteRaw:p[0x14-layout.address],ledAlarmByteRaw:p[0x15-layout.address],
    maxTorqueBytesRaw:p.slice(0x13-layout.address,0x15-layout.address),postOverloadTorqueByteRaw:p[0x22-layout.address],overloadDelayByteRaw:p[0x23-layout.address],overloadThresholdBytesRaw:p.slice(0x24-layout.address,0x26-layout.address)};
  else decoded={interpretationVerified:false,positionRaw:word(0),speedRaw:word(2),loadRaw:word(4),voltageByteRaw:p[6],temperatureByteRaw:p[7],statusByteRaw:p[9],movingByteRaw:p[10],currentRaw:word(13),allBytesZero:p.every(n=>n===0)};
  return {kind:'data',payload:p,decoded};
}
