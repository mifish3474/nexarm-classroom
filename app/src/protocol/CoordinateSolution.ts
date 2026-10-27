import type {Frame} from './FrameParser';
import type {CoordinateTarget} from './CoordinateTarget';

// The manufacturer calculation-only example returns XYZ/P/R/C followed by
// six raw targets. ID 0x5a is the controller reply, 0xff the USB bridge ID.
// This result is a proposed target, never measured feedback.
export function decodeCoordinateSolution(frame:Frame,target:CoordinateTarget):number[]|null {
  return inspectCoordinateSolution(frame,target).positions;
}

export function inspectCoordinateSolution(frame:Frame,target:CoordinateTarget):{positions:number[]|null;reason:string|null;terminal?:boolean} {
  const rejected=(reason:string)=>({positions:null,reason});
  if(frame.command!==7)return rejected(`Expected calculation command 7; received ${frame.command}.`);
  if(![255,0x5a].includes(frame.deviceId))return rejected(`Unexpected calculation device ID ${frame.deviceId}.`);
  if(frame.integrity!=='full')return rejected('Calculation reply has only an abbreviated checksum.');
  if(frame.payload.length!==24)return rejected(`Calculation reply has ${frame.payload.length} data bytes; expected 24.`);
  // Observed controller response: all pose fields AND all six joint targets are
  // zero. Do not call this a timeout, a rounding mismatch or proven unreachable.
  if(frame.payload.every(byte=>byte===0))return {positions:null,reason:'Controller returned an all-zero calculation result, including all six joint targets. No usable joint solution was supplied.',terminal:true};
  const word=(i:number)=>frame.payload[i]!+256*frame.payload[i+1]!;
  const signed=(i:number)=>{const n=word(i);return n>=32768?n-65536:n;};
  const echo=[target.x,target.y,target.z,Math.round(target.pitch*10),target.roll,target.claw];
  const labels=['X','Y','Z','P','R','C'];
  const differences=echo.flatMap((n,i)=>signed(i*2)===n?[]:[`${labels[i]} requested ${n/(i===3?10:1)}, reply ${signed(i*2)/(i===3?10:1)}`]);
  if(differences.length)return rejected(`Coordinate values differ: ${differences.join('; ')}.`);
  const positions=Array.from({length:6},(_,i)=>word(12+i*2));
  if(positions.some(n=>n>4095))return rejected('Calculation reply contains joint targets outside the raw encoding range 0–4095.');
  return {positions,reason:null};
}
