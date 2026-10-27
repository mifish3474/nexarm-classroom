import {describe,it,expect} from 'vitest';
import {decodeCoordinateSolution,inspectCoordinateSolution} from '../app/src/protocol/CoordinateSolution';
import {encodeCoordinateCalculation} from '../app/src/protocol/NexArmCodec';
import {FrameParser} from '../app/src/protocol/FrameParser';
import {OPERATING_RANGES,assertPoseTargets} from '../app/src/safety/OperatingRanges';
const target={x:39,y:-1,z:-71,pitch:18.4,roll:8,claw:-87,durationMs:2000};
const positions=[2050,2150,2100,2200,2000,1080];
const frame={deviceId:255,command:7,integrity:'full' as const,payload:[39,-1,-71,184,8,-87,...positions].flatMap(n=>[n&255,(n>>8)&255])};
describe('calculation-only coordinates',()=>{
 it('decodes the three successful replies in the reported session and rejects its all-zero fourth result explicitly',()=>{
   const replies=[
     {pose:[257,19,378,0,1,-87],joints:[2000,2188,2089,2229,2059,1058],payload:[1,1,19,0,122,1,0,0,1,0,169,255,208,7,140,8,41,8,181,8,11,8,34,4]},
     {pose:[375,76,-69,-83.1,-1,-86],joints:[1918,1103,2807,2808,2037,1070],payload:[119,1,76,0,187,255,193,252,255,255,170,255,126,7,79,4,247,10,248,10,245,7,46,4]},
     {pose:[373,76,-70,-83.9,-1,-45],joints:[1917,1102,2806,2815,2037,1536],payload:[117,1,76,0,186,255,185,252,255,255,211,255,125,7,78,4,246,10,255,10,245,7,0,6]},
   ];
   for(const reply of replies){const [x,y,z,pitch,roll,claw]=reply.pose;expect(decodeCoordinateSolution({...frame,payload:reply.payload},{x:x!,y:y!,z:z!,pitch:pitch!,roll:roll!,claw:claw!,durationMs:2000})).toEqual(reply.joints);}
   const zero={...frame,payload:Array(24).fill(0)};
   const input={x:294,y:59,z:243,pitch:-75.2,roll:-1,claw:-45,durationMs:2000};
   expect([...encodeCoordinateCalculation(input)]).toEqual([255,255,255,16,7,16,253,38,1,59,0,243,0,255,255,211,255,208,7,224]);
   expect(inspectCoordinateSolution(zero,input)).toMatchObject({positions:null,terminal:true,reason:expect.stringContaining('including all six joint targets')});
   expect(decodeCoordinateSolution(zero,input)).toBeNull();
   expect(inspectCoordinateSolution({...zero,integrity:'abbreviated-only'},input).terminal).not.toBe(true);
 });
 it('explains an echo mismatch without accepting it or changing the target',()=>{
   const input={...target,x:294,y:59,z:243,pitch:-75.2,roll:-1,claw:-45};
   const reply={...frame,payload:[294,59,243,-751,-1,-45,...positions].flatMap(n=>[n&255,(n>>8)&255])};
   expect(inspectCoordinateSolution(reply,input)).toEqual({positions:null,reason:'Coordinate values differ: P requested -75.2, reply -75.1.'});expect(input.pitch).toBe(-75.2);
 });
 it('preserves X=257 across validation, two-byte request encoding and reply matching',()=>{
   const input={...target,x:257},packet=encodeCoordinateCalculation(input);
   expect([...packet.slice(7,9)]).toEqual([1,1]);
   expect(decodeCoordinateSolution({...frame,payload:[1,1,...frame.payload.slice(2)]},input)).toEqual(positions);
 });
 it('encodes opcode 7 with signed values and full checksum; never opcode 8',()=>{
   const bytes=encodeCoordinateCalculation(target),parsed=new FrameParser().push(bytes)[0]!;
   expect(parsed).toMatchObject({deviceId:255,command:7,integrity:'full'});
   expect(parsed.payload).toEqual([184,0,39,0,255,255,185,255,8,0,169,255,208,7]);
 });
 it('decodes matching full replies from either documented controller or bridge ID',()=>{
   expect(decodeCoordinateSolution(frame,target)).toEqual(positions);
   expect(decodeCoordinateSolution({...frame,deviceId:90},target)).toEqual(positions);
 });
 it('rejects weak, truncated, wrong command/device, mismatched pose and invalid raw target replies',()=>{
   for(const invalid of [{...frame,integrity:'abbreviated-only' as const},{...frame,payload:frame.payload.slice(0,12)},{...frame,command:11},{...frame,deviceId:1},{...frame,payload:[40,...frame.payload.slice(1)]},{...frame,payload:[...frame.payload.slice(0,22),255,255]}])expect(decodeCoordinateSolution(invalid,target)).toBeNull();
 });
 it.each(OPERATING_RANGES.map((range,i)=>({servo:i+1,...range})))('enforces both exact boundaries for J$servo without clamping',({servo,min,max})=>{
   for(const value of [min,max])expect(()=>assertPoseTargets(positions.map((n,i)=>i===servo-1?value:n))).not.toThrow();
   for(const value of [min-1,max+1])expect(()=>assertPoseTargets(positions.map((n,i)=>i===servo-1?value:n))).toThrow(`J${servo} target ${value}`);
 });
});
