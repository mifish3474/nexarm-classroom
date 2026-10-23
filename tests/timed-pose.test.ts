import {expect,it} from 'vitest';
import {timedPosePlan,TimedPoseMotion} from '../app/src/safety/TimedPoseMotion';
import {TEACHER_HOME} from '../app/src/safety/TeacherControlPlan';
const home=[...TEACHER_HOME];
function frame(before=home,target=home,duration=1000){const plan=timedPosePlan(before,target,duration),motion=new TimedPoseMotion(before,0,plan);motion.start(before,0);return {plan,motion};}
it.each([1,2,3,4,5,6])('uses the same 30-unit pose allowance for J%s, including no-op planning and settling',servo=>{
 const i=servo-1,before=[...home],target=[...home];target[i]!+=100;
 for(const residual of [-30,-14,14,30]){
   const {motion}=frame(before,target);motion.next(0);motion.written(0);const actual=[...target];actual[i]!+=residual;
   for(const at of [100,200,300,1000])motion.observe(actual,at);expect(motion.phase).toBe('Complete');expect(motion.status().commands[0]?.tolerance).toBe(30);
   expect(timedPosePlan(actual,target).steps).toHaveLength(0);
 }
 for(const residual of [-31,31]){
   const {motion}=frame(before,target);motion.next(0);motion.written(0);const actual=[...target];actual[i]!+=residual;
   for(let at=100;at<=5200;at+=100)motion.observe(actual,at);expect(motion.phase).toBe('Fault');
 }
});
it('calculates per-joint factory-style speeds and extends time to keep the 600/10 envelope',()=>{
 const target=[...home];target[0]+=100;target[1]+=200;const p=timedPosePlan(home,target,1000);expect(p.durationMs).toBe(1000);expect(p.steps.map(s=>s.speed)).toEqual([120,240]);
 target[0]=2950;const q=timedPosePlan(home,target,1000);expect(q.durationMs).toBe(1800);expect(q.steps[0]!.speed).toBe(600);expect(q.steps[1]!.speed).toBe(133);expect(q.steps.every(s=>s.acceleration===10)).toBe(true);
});
it('treats J3 2811 to 2838 consistently as already in pose, and verifies time and stability without a write',()=>{
 const before=[...home];before[2]=2811;const target=[...before];target[2]=2838;const {plan,motion}=frame(before,target);
 expect(plan.steps).toHaveLength(0);expect(motion.next(0)).toBeNull();for(const at of [100,200,300])motion.observe(before,at);expect(motion.phase).toBe('Running');motion.observe(before,1000);expect(motion.phase).toBe('Complete');expect(motion.report().latest[2]).toBe(2811);expect(motion.report().target[2]).toBe(2838);
});
it('dispatches only needed joints, ID order, with at least 2ms and resolved writes between them',()=>{
 const target=home.map(n=>n+100),{motion}=frame(home,target);expect(motion.next(0)?.servo).toBe(1);expect(motion.next(10)).toBeNull();motion.written(10);expect(motion.next(11)).toBeNull();expect(motion.next(12)?.servo).toBe(2);
 motion.stop();motion.written(13);expect(motion.next(1000)).toBeNull();expect(motion.report().sent).toEqual([1,2]);
});
it('holds progression until duration expires and every joint is stable and inside pose tolerance',()=>{
 const target=[...home];target[2]=2838;const {motion}=frame(home,target);motion.next(0);motion.written(0);const actual=[...target];actual[2]=2810;
 for(const at of [100,200,300])motion.observe(actual,at);expect(motion.phase).toBe('Running');motion.observe(actual,1000);expect(motion.phase).toBe('Running'); // effective time extended to 1476 ms
 motion.observe(actual,1500);expect(motion.phase).toBe('Complete');expect(motion.status().commands[0]).toMatchObject({tolerance:30,error:28});
});
it('retains stale, deviation, late drift, large residual and unstable-feedback checks',()=>{
 const stale=frame().motion;stale.checkDeadline(1501);expect(stale.phase).toBe('Fault');
 const drift=frame().motion,actual=[...home];actual[1]+=101;drift.observe(actual,100);expect(drift.phase).toBe('Fault');
 for(const error of [31,-31]){const before=[...home];before[2]=2811;const target=[...before];target[2]=2838;const {motion}=frame(before,target);const p=[...target];p[2]+=error;motion.next(0);motion.written(0);for(let at=100;at<=5200;at+=100)motion.observe(p,at);expect(motion.phase).toBe('Fault');}
 const {motion}=frame();for(let at=100;at<=5100;at+=100){const p=[...home];p[0]+=at%200?12:0;motion.observe(p,at);}expect(motion.phase).toBe('Fault');
});
it('rejects invalid goals/durations and freezes inputs',()=>{
 for(const ms of [0,99,10001,NaN,100.5])expect(()=>frame(home,home,ms)).toThrow();const bad=[...home];bad[2]=2901;expect(()=>frame(home,bad)).toThrow('J3');
 const target=[...home];target[0]+=100;const {motion}=frame(home,target);target[0]=0;expect(motion.next(0)!.target).toBe(2150);
});
