import {expect,it} from 'vitest';
import {encodeCoordinateTarget} from '../app/src/protocol/NexArmCodec';
import {validateCoordinateTarget} from '../app/src/protocol/CoordinateTarget';
import {NativeCoordinateMotion} from '../app/src/safety/NativeCoordinateMotion';
import {interpret} from '../app/src/runtime/instructions';
const target={x:39,y:-1,z:399,pitch:18.4,roll:8,claw:-87,durationMs:2000};
const home=[2050,2150,2100,2200,2000,1080];

it('matches the published coordinate packet and the factory P*10/signed layout for LCD values',()=>{
 expect([...encodeCoordinateTarget({x:200,y:100,z:200,pitch:0,roll:0,claw:0,durationMs:1000})]).toEqual([255,255,255,16,8,0,0,200,0,100,0,200,0,0,0,0,0,232,3,9]);
 expect([...encodeCoordinateTarget(target)]).toEqual([255,255,255,16,8,184,0,39,0,255,255,143,1,8,0,169,255,208,7,244]);
 expect([...encodeCoordinateTarget({...target,pitch:-12.5})].slice(5,7)).toEqual([131,255]);
});
it('preserves the LCD Z=-71 in historical validation and signed packet encoding without clamping',()=>{
 const t={...target,z:-71};expect(validateCoordinateTarget(t).z).toBe(-71);
 expect([...encodeCoordinateTarget(t)].slice(11,13)).toEqual([185,255]);
 for(const z of [-570,0,570])expect(validateCoordinateTarget({...target,z}).z).toBe(z);
});
it('rejects invalid, non-finite, fractional or out-of-bound coordinate values and durations before encoding',()=>{
 for(const patch of [{x:-1},{x:551},{x:.5},{y:-551},{z:-571},{z:571},{pitch:180.1},{pitch:.05},{roll:90.1},{claw:91},{durationMs:99},{durationMs:10001},{durationMs:100.5}])expect(()=>encodeCoordinateTarget({...target,...patch})).toThrow();
 for(const key of Object.keys(target))for(const value of [NaN,Infinity,'20',null,undefined])expect(()=>validateCoordinateTarget({...target,[key]:value})).toThrow();
 expect(encodeCoordinateTarget({...target,pitch:-180,roll:-90,claw:-90,durationMs:100})).toHaveLength(20);
});
it('rejects retired coordinate instructions at any nesting depth',()=>{
 const node={kind:'coordinates',blockId:'c',...target};
 expect(()=>interpret([node])).toThrow('XYZ coordinate blocks are no longer supported');
 expect(()=>interpret([{kind:'repeat',blockId:'r',count:2,body:[node]}])).toThrow('XYZ coordinate blocks are no longer supported');
});
it('waits for the native write and duration, keeps actual readings separate, and never resends',()=>{
 const motion=new NativeCoordinateMotion(home,0,target);motion.start(home,0);expect(motion.dispatch(0)).toBe(true);expect(motion.dispatch(10)).toBe(false);
 motion.observe(home,1000);expect(motion.phase).toBe('Running');motion.written(1000);
 motion.observe(home,2000);motion.checkDeadline(2999);expect(motion.phase).toBe('Running');motion.checkDeadline(3000);expect(motion.phase).toBe('Complete');
 expect(motion.report()).toMatchObject({jointTargetsKnown:false,browserJointLimitsPrechecked:false,profile:'firmware-controlled',latest:home,target});expect(motion.dispatch(3100)).toBe(false);
});
it('cancels native frames on Stop or stale feedback without late completion',()=>{
 const motion=new NativeCoordinateMotion(home,0,target);motion.start(home,0);motion.dispatch(0);motion.stop();motion.written(1);motion.observe(home,3000);expect(motion.phase).toBe('Stopped');
 const stale=new NativeCoordinateMotion(home,0,target);stale.start(home,0);stale.dispatch(0);stale.written(0);stale.checkDeadline(1501);expect(stale.phase).toBe('Fault');
 const stalledWrite=new NativeCoordinateMotion(home,0,target);stalledWrite.start(home,0);stalledWrite.dispatch(0);stalledWrite.observe(home,2000);expect(stalledWrite.phase).toBe('Fault');expect(stalledWrite.message).toContain('write deadline');
});
