import {expect,it} from 'vitest';
import {SmoothTeacherMotion,smoothPlan,absoluteJointPlan} from '../app/src/safety/SmoothTeacherMotion';
const pose=[2050,2150,2050,2200,2000,1080];
it('reports a manually requested small movement settling short without claiming target arrival or faulting',()=>{
 const motion=new SmoothTeacherMotion(pose,0,absoluteJointPlan(pose,3,2070,2000,100));motion.start(pose,0);motion.next(0);motion.written(0);
 for(let at=100;at<=1400;at+=100)motion.observe(pose,at);
 expect(motion.phase).toBe('Settled short');expect(motion.message).toContain('remaining 20');expect(motion.report().failure).toBeNull();expect(motion.next(1500)).toBeNull();
});
it('reports a positive servo 3 stall with preserved readings and does not retry',()=>{
 const motion=new SmoothTeacherMotion(pose,0,smoothPlan(pose,3,20));motion.start(pose,0);
 expect(motion.next(0)?.target).toBe(2070);motion.written(0);
 for(let at=100;at<=4500;at+=100){motion.observe(pose,at);motion.checkDeadline(at);}
 expect(motion.phase).toBe('Fault');expect(motion.message).toContain('Servo 3 timed out');expect(motion.message).toContain('Little or no');
 expect(motion.report().failure?.command).toMatchObject({servo:3,from:2050,target:2070,actual:2050,error:20});
 motion.observe([2050,2150,2040,2200,2000,1080],4600);
 expect(motion.report().failure?.positions[2]).toBe(2050);expect(motion.next(4700)).toBeNull();
});
it('accepts a negative servo 3 move and labels companion deviation separately',()=>{
 const motion=new SmoothTeacherMotion(pose,0,smoothPlan(pose,3,-20));motion.start(pose,0);motion.next(0);motion.written(0);
 for(const at of [100,200,300])motion.observe([2050,2150,2035,2200,2000,1080],at);
 expect(motion.phase).toBe('Complete');
 const other=new SmoothTeacherMotion(pose,0,smoothPlan(pose,3,20));other.start(pose,0);other.next(0);other.written(0);
 other.observe([2050,2171,2050,2200,2000,1080],100);
 expect(other.message).toContain('While commanding servo 3, servo 2 changed');
});
