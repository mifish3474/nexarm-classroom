import {expect,it} from 'vitest';
import {timedPosePlan,TimedPoseMotion} from '../app/src/safety/TimedPoseMotion';
import {TEACHER_HOME} from '../app/src/safety/TeacherControlPlan';
const home=[...TEACHER_HOME];
function frame(before=home,target=home,duration=1000){const plan=timedPosePlan(before,target,duration),motion=new TimedPoseMotion(before,0,plan);motion.start(before,0);return {plan,motion};}
function dispatch(motion:TimedPoseMotion){for(let at=0;at<=10;at+=2){expect(motion.next(at)?.servo).toBe(at/2+1);motion.written(at);}}

it.each([1,2,3,4,5,6])('advances timed poses despite J%s stopping short, without substituting the target for feedback',servo=>{
 const i=servo-1,target=[...home];target[i]!+=100;
 for(const residual of [14,30,32,86,100]){
   const {motion}=frame(home,target);dispatch(motion);const actual=[...target];actual[i]!-=residual;
   motion.observe(actual,900);motion.checkDeadline(1009);expect(motion.phase).toBe('Running');
   motion.checkDeadline(1010);expect(motion.phase).toBe('Complete');
   expect(motion.report()).toMatchObject({completionPolicy:'elapsed-time',latest:actual,target});
   expect(motion.status().commands[i]!.error).toBe(residual);
 }
});
it('calculates per-joint factory-style speeds and extends time to keep the 600/10 envelope',()=>{
 const target=[...home];target[0]+=100;target[1]+=200;const p=timedPosePlan(home,target,1000);expect(p.durationMs).toBe(1000);expect(p.steps.map(s=>s.speed)).toEqual([120,240,10,10,10,10]);
 target[0]=2950;const q=timedPosePlan(home,target,1000);expect(q.durationMs).toBe(1800);expect(q.steps[0]!.speed).toBe(600);expect(q.steps[1]!.speed).toBe(133);expect(q.steps.every(s=>s.acceleration===10)).toBe(true);
});
it('sends all targets including J3 2811 to 2838, with no small-move skip or arrival gate',()=>{
 const before=[...home];before[2]=2811;const target=[...before];target[2]=2838;const {plan,motion}=frame(before,target,2000);
 expect(plan.steps).toHaveLength(6);expect(plan.steps[2]).toMatchObject({servo:3,target:2838,speed:16});dispatch(motion);
 motion.observe(before,1500);motion.checkDeadline(2009);expect(motion.phase).toBe('Running');motion.checkDeadline(2010);expect(motion.phase).toBe('Complete');
 expect(motion.report().latest[2]).toBe(2811);expect(motion.report().target[2]).toBe(2838);
 expect(timedPosePlan(home,home).steps).toHaveLength(6);
});
it('requires resolved writes and at least 2ms spacing, and Stop cancels unsent targets',()=>{
 const {motion}=frame(home,home.map(n=>n+100));expect(motion.next(0)?.servo).toBe(1);expect(motion.next(10)).toBeNull();motion.written(10);expect(motion.next(11)).toBeNull();expect(motion.next(12)?.servo).toBe(2);
 motion.stop();motion.written(13);expect(motion.next(1000)).toBeNull();expect(motion.report().sent).toEqual([1,2]);
});
it('starts the frame clock only after all writes resolve and never completes a partially sent frame',()=>{
 const {motion}=frame();for(let at=0;at<=8;at+=2){motion.next(at);motion.written(at);}motion.next(10);
 motion.observe(home,1000);motion.checkDeadline(1000);expect(motion.phase).toBe('Running');motion.written(1000);
 motion.observe(home,1900);motion.checkDeadline(1999);expect(motion.phase).toBe('Running');motion.checkDeadline(2000);expect(motion.phase).toBe('Complete');
});
it('does not require stable readings or arrival before the next frame',()=>{
 const target=home.map(n=>n+100),{motion}=frame(home,target);dispatch(motion);
 for(let at=100;at<=1000;at+=100)motion.observe(home.map(n=>n+(at%200?15:45)),at);
 motion.checkDeadline(1010);expect(motion.phase).toBe('Complete');expect(motion.report().latest).toEqual(home.map(n=>n+45));
});
it('retains stale feedback and dispatch deadline faults',()=>{
 const stale=frame().motion;dispatch(stale);stale.checkDeadline(1501);expect(stale.phase).toBe('Fault');
 const deviated=frame().motion;dispatch(deviated);deviated.observe(home.map(n=>n+200),100);deviated.checkDeadline(1601);expect(deviated.phase).toBe('Fault');expect(deviated.message).toContain('feedback');
 const {motion}=frame();for(let at=100;at<=5100;at+=100)motion.observe(home,at);expect(motion.phase).toBe('Fault');expect(motion.message).toContain('dispatch');
});
it.each([1,2,3,4,5,6])('records J%s endpoint deviations without stopping timed playback or altering its target',servo=>{
 const {motion}=frame(),actual=[...home];actual[servo-1]!+=200;dispatch(motion);
 motion.observe(actual,100);expect(motion.phase).toBe('Running');motion.observe(actual,1010);expect(motion.phase).toBe('Complete');
 expect(motion.report()).toMatchObject({pathCheckPolicy:'diagnostic-only',pathDeviationCount:2,latest:actual,target:home});
 expect(motion.report().pathDeviations[0]).toMatchObject({servo,actual:actual[servo-1],targetSent:true});
});
it('allows an earlier target to keep moving before the next joint target is dispatched and bounds diagnostics',()=>{
 const {motion}=frame(),actual=[...home];actual[5]=1600;motion.next(0);motion.written(0);
 motion.observe(actual,100);expect(motion.phase).toBe('Running');expect(motion.report().pathDeviations[0]).toMatchObject({servo:6,targetSent:false,actual:1600});
 for(let at=102;at<=110;at+=2){motion.next(at);motion.written(at);}
 for(let at=120;at<=1110;at+=10)motion.observe(actual,at);
 expect(motion.phase).toBe('Complete');expect(motion.report().pathDeviations).toHaveLength(64);expect(motion.report().pathDeviationCount).toBeGreaterThan(64);
 const report=motion.report();report.pathDeviations[0]!.actual=0;expect(motion.report().pathDeviations[0]!.actual).toBe(1600);
});
it('rejects invalid goals/durations and freezes inputs',()=>{
 for(const ms of [0,99,10001,NaN,100.5])expect(()=>frame(home,home,ms)).toThrow();const bad=[...home];bad[2]=2901;expect(()=>frame(home,bad)).toThrow('J3');
 const target=[...home];target[0]+=100;const {motion}=frame(home,target);target[0]=0;expect(motion.next(0)!.target).toBe(2150);
});
