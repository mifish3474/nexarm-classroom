import {expect,it} from 'vitest';
import {OPERATING_RANGES,assertJointTarget,assertPoseTargets,poseIssues} from '../app/src/safety/OperatingRanges';
import {TEACHER_HOME} from '../app/src/safety/TeacherControlPlan';
it('uses the operator-provided low/high ranges without adding student restrictions',()=>{
 expect(OPERATING_RANGES).toEqual([{min:900,max:3000},{min:525,max:2600},{min:2000,max:2900},{min:1250,max:3000},{min:1024,max:3072},{min:1024,max:2731}]);
 expect(Object.isFrozen(OPERATING_RANGES)).toBe(true);expect(OPERATING_RANGES.every(Object.isFrozen)).toBe(true);
 expect(()=>assertPoseTargets(TEACHER_HOME)).not.toThrow();
});
it.each([1,2,3,4,5,6])('accepts both exact J%s endpoints and rejects targets outside them',servo=>{
 const range=OPERATING_RANGES[servo-1]!;
 for(const target of [range.min,range.max])expect(()=>assertJointTarget(servo,target)).not.toThrow();
 for(const target of [range.min-1,range.max+1,NaN,Infinity,range.min+.5])expect(()=>assertJointTarget(servo,target)).toThrow(`J${servo}`);
});
it('reports every invalid joint without rewriting a recorded vector',()=>{
 const t2=[1968,1335,3144,3407,2109,2397],copy=[...t2];
 expect(poseIssues(t2)).toEqual(['J3 target 3144 is outside its operating range 2000–2900.','J4 target 3407 is outside its operating range 1250–3000.']);
 expect(()=>assertPoseTargets(t2,'Saved position "t2"')).toThrow('t2');expect(t2).toEqual(copy);
 expect(()=>assertPoseTargets([1,2])).toThrow('Six valid');
 expect(()=>assertJointTarget(0,2000)).toThrow();expect(()=>assertJointTarget(7,2000)).toThrow();
});
