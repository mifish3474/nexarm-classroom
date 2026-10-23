import {expect,it} from 'vitest';
import {SmoothTeacherMotion,smoothPlan,absoluteJointPlan} from '../app/src/safety/SmoothTeacherMotion';
const pose=[2050,2150,2050,2200,2000,1080];
it('exports bounded independent feedback samples for investigating J2 vibration',()=>{
 const motion=new SmoothTeacherMotion(pose,0,absoluteJointPlan(pose,2,2200,2000,100));motion.start(pose,0);motion.next(0);motion.written(0);
 const actual=[...pose];for(let at=10;at<=700;at+=10){actual[1]=at%20?2180:2220;motion.observe(actual,at);}
 const report=motion.report();expect(report.feedback).toHaveLength(64);expect(report.feedback.at(-1)).toEqual({elapsedMs:700,positions:[2050,2220,2050,2200,2000,1080]});
 report.feedback[0]!.positions[1]=0;expect(motion.report().feedback[0]!.positions[1]).not.toBe(0);
});
it('budgets reversal settling and deadlines for travel from earlier dispatched targets',()=>{
 const motion=new SmoothTeacherMotion(pose,0,absoluteJointPlan(pose,3,2038,100,10),{servo:3,min:2050,max:2500});
 motion.start(pose,0);motion.next(0);motion.written(0);
 expect(motion.status().command?.deadlineMs).toBe(13240);
 const actual=[...pose];actual[2]=2463;
 for(let at=100;at<=5000;at+=100){motion.observe(actual,at);motion.checkDeadline(at);}
 expect(motion.phase).toBe('Running');
});
it.each([-100,-21,21,100])('allows %s raw units of companion drift through slider completion',drift=>{
 const motion=new SmoothTeacherMotion(pose,0,absoluteJointPlan(pose,3,2150,2000,100));motion.start(pose,0);motion.next(0);motion.written(0);
 const actual=[...pose];actual[1]!+=drift;actual[2]=2150;
 for(const at of [100,200,300])motion.observe(actual,at);
 expect(motion.phase).toBe('Complete');
});
it.each([-100,100])('allows %s raw units beyond the selected path, then settles normally',drift=>{
 const motion=new SmoothTeacherMotion(pose,0,absoluteJointPlan(pose,3,2150,2000,100));motion.start(pose,0);motion.next(0);motion.written(0);
 const actual=[...pose];actual[2]=drift<0?2050+drift:2150+drift;motion.observe(actual,100);expect(motion.phase).toBe('Running');
 actual[2]=2150;for(const at of [200,300,400])motion.observe(actual,at);expect(motion.phase).toBe('Complete');
});
it.each([['selected',-101],['selected',101],['companion',-101],['companion',101]] as const)('faults beyond the widened margin for %s at %s', (joint,drift)=>{
 const motion=new SmoothTeacherMotion(pose,0,absoluteJointPlan(pose,3,2150,2000,100));motion.start(pose,0);motion.next(0);motion.written(0);
 const actual=[...pose];if(joint==='companion')actual[1]!+=drift;else actual[2]=drift<0?2050+drift:2150+drift;
 motion.observe(actual,100);expect(motion.phase).toBe('Fault');expect(motion.message).toContain(joint==='companion'?'more than 100 raw units':'100-unit margin');
});
it('reports a manually requested small movement settling short without claiming target arrival or faulting',()=>{
 const motion=new SmoothTeacherMotion(pose,0,absoluteJointPlan(pose,3,2070,2000,100));motion.start(pose,0);motion.next(0);motion.written(0);
 for(let at=100;at<=1400;at+=100)motion.observe(pose,at);
 expect(motion.phase).toBe('Settled short');expect(motion.message).toContain('remaining 20');expect(motion.report().failure).toBeNull();expect(motion.next(1500)).toBeNull();
});
it('keeps Home final-pose accuracy despite the wider movement margin',()=>{
 const home=[2050,2150,2100,2200,2000,1080],start=[...home];start[5]=1180;
 const motion=new SmoothTeacherMotion(start,0,smoothPlan(start));motion.start(start,0);motion.next(0);motion.written(0);
 const actual=[...home];actual[0]!+=25;
 for(const at of [100,200,300])motion.observe(actual,at);
 expect(motion.phase).toBe('Fault');expect(motion.message).toBe('Final pose differs from the requested pose.');
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
 other.observe([2050,2251,2050,2200,2000,1080],100);
 expect(other.message).toContain('While commanding servo 3, servo 2 changed');
});
