import {expect,it} from 'vitest';
import {ConcurrentHomeMotion} from '../app/src/safety/ConcurrentHomeMotion';
import {smoothPlan,HOME_SPEED,absolutePosePlan} from '../app/src/safety/SmoothTeacherMotion';
import {TEACHER_HOME} from '../app/src/safety/TeacherControlPlan';
import {encodeSpeedPosition,encodeSpeedPositions} from '../app/src/protocol/NexArmCodec';

function motion(start=TEACHER_HOME.map(value=>value+300)){
 const group=new ConcurrentHomeMotion(start,0,smoothPlan(start,undefined,undefined,{speed:HOME_SPEED,acceleration:10}));
 group.start(start,0);return group;
}
it.each([-12,-10,10,12])('accepts a stable Servo 4 residual of %s without another command',residual=>{
 const before=[2050,2150,2100,3084,2000,1080],target=[...before];target[3]=2720;
 const group=new ConcurrentHomeMotion(before,0,absolutePosePlan(before,target),'saved position');group.start(before,0);
 expect(group.nextBatch(0)).toHaveLength(1);group.written(0);
 const actual=[...target];actual[3]!+=residual;
 group.observe(actual,100);group.observe(actual,200);expect(group.phase).toBe('Running');group.observe(actual,300);
 expect(group.phase).toBe('Complete');expect(group.status().commands[0]?.error).toBe(-residual);expect(group.nextBatch(400)).toBeNull();
});
it('still times out outside tolerance and rejects unstable in-tolerance feedback',()=>{
 for(const residual of [13,-13]){
   const group=motion();group.nextBatch(0);group.written(0);const actual=[...TEACHER_HOME];actual[3]!+=residual;
   for(let at=100;at<=5200;at+=100){group.observe(actual,at);group.checkDeadline(at);}
   expect(group.phase).toBe('Fault');expect(group.message).toContain('Servo 4 timed out');
 }
 const group=motion();group.nextBatch(0);group.written(0);
 for(let at=100;at<=1200;at+=100){const actual=[...TEACHER_HOME];actual[3]!+=at%200===0?12:-12;group.observe(actual,at);}
 expect(group.phase).toBe('Running');
});
it('batches existing checksum-valid frames without a new wire instruction',()=>{
 const targets=TEACHER_HOME.map((target,i)=>({servo:i+1,target})),bytes=encodeSpeedPositions(targets,600,10);
 expect(bytes).toHaveLength(84);
 targets.forEach((target,i)=>expect([...bytes.slice(i*14,i*14+14)]).toEqual([...encodeSpeedPosition(target.servo,target.target,600,10)]));
 expect(()=>encodeSpeedPositions([],600,10)).toThrow();expect(()=>encodeSpeedPositions([targets[0]!,targets[0]!],600,10)).toThrow();
 expect(()=>encodeSpeedPositions([{servo:2,target:4096}],600,10)).toThrow();
});
it('allows all commanded joints to move beyond the companion margin and settle independently',()=>{
 const group=motion();expect(group.nextBatch(0)).toHaveLength(6);group.written(0);expect(group.nextBatch(100)).toBeNull();
 const halfway=TEACHER_HOME.map(value=>value+150);group.observe(halfway,100);expect(group.phase).toBe('Running');
 const nearly=[...TEACHER_HOME];nearly[5]!+=100;
 for(const at of [200,300,400])group.observe(nearly,at);
 expect(group.status().completedWaypoints).toBe(5);expect(group.phase).toBe('Running');
 for(const at of [500,600,700])group.observe(TEACHER_HOME,at);
 expect(group.phase).toBe('Complete');expect(group.status().commands).toHaveLength(6);
});
it('skips near-Home joints and sends no command when all joints are near Home',()=>{
 const start=[...TEACHER_HOME];start[1]!+=50;const group=motion(start);expect(group.nextBatch(0)?.map(step=>step.servo)).toEqual([2]);
 const done=motion([...TEACHER_HOME]);expect(done.phase).toBe('Complete');expect(done.nextBatch(0)).toBeNull();
});
it('faults the entire group for a path excursion and preserves diagnostics',()=>{
 const group=motion();group.nextBatch(0);group.written(0);const actual=[...TEACHER_HOME];actual[2]!-=101;group.observe(actual,100);
 expect(group.phase).toBe('Fault');expect(group.message).toContain('Home servo 3');expect(group.report().failure?.positions).toEqual(actual);expect(group.nextBatch(200)).toBeNull();
});
it('supervises skipped and already-settled joints while others move',()=>{
 const start=TEACHER_HOME.map(value=>value+300);start[0]=TEACHER_HOME[0]!;const group=motion(start);group.nextBatch(0);group.written(0);
 start[0]!+=101;group.observe(start,100);expect(group.phase).toBe('Fault');
 const other=motion();other.nextBatch(0);other.written(0);const actual=TEACHER_HOME.map(value=>value+300);actual[1]=TEACHER_HOME[1]!;
 for(const at of [100,200,300])other.observe(actual,at);expect(other.status().completedWaypoints).toBe(1);
 actual[1]=TEACHER_HOME[1]!-101;other.observe(actual,400);expect(other.phase).toBe('Fault');
});
it('times out an unsettled joint even after the others finish, without retrying',()=>{
 const group=motion();group.nextBatch(0);group.written(0);const actual=[...TEACHER_HOME];actual[1]!+=30;
 for(let at=100;at<=5200;at+=100){group.observe(actual,at);group.checkDeadline(at);}
 expect(group.phase).toBe('Fault');expect(group.message).toContain('Servo 2 timed out');expect(group.nextBatch(5300)).toBeNull();
});
it('fails on missing feedback and never resumes a stopped group on late completion',()=>{
 const group=motion();group.nextBatch(0);group.written(0);group.checkDeadline(1600);expect(group.phase).toBe('Fault');
 const stopped=motion();stopped.nextBatch(0);stopped.stop();stopped.written(100);stopped.observe(TEACHER_HOME,200);expect(stopped.phase).toBe('Stopped');expect(stopped.nextBatch(600)).toBeNull();
});
