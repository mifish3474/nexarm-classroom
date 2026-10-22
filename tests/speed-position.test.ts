import {expect,it} from 'vitest';
import {encodeSpeedPosition} from '../app/src/protocol/NexArmCodec';
it('encodes the reviewed factory continuous position/speed/acceleration layout',()=>{
  const packet=encodeSpeedPosition(1,2070,20,10);
  expect([...packet.slice(0,-1)]).toEqual([255,255,1,10,3,41,10,22,8,0,0,20,0]);
  expect(packet.at(-1)).toBe((~[...packet.slice(2,-1)].reduce((a,b)=>a+b,0))&255);
  expect([...encodeSpeedPosition(6,1080,300,40).slice(5,12)]).toEqual([41,40,56,4,0,0,44]);
});
it('rejects invalid motion parameters and unverified zero speed',()=>{
  for(const args of [[0,2070,20,10],[1,4096,20,10],[1,2070,0,10],[1,2070,3401,10],[1,2070,20,0],[1,2070,20,255],[1,2070,1.5,10]])
    expect(()=>encodeSpeedPosition(args[0]!,args[1]!,args[2]!,args[3]!)).toThrow();
});
