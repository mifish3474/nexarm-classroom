// Operator-provided ranges, 2026-10-23: factory-software ranges adjusted during
// development testing. These are not independently measured mechanical limits
// or the protected classroom policy planned for student release.
export const OPERATING_RANGES=Object.freeze([
  Object.freeze({min:900,max:3000}),Object.freeze({min:525,max:2600}),
  Object.freeze({min:2000,max:2900}),Object.freeze({min:1250,max:3000}),
  Object.freeze({min:1024,max:3072}),Object.freeze({min:1024,max:2731}),
]);
export function targetIssue(servo:number,target:number):string|null{
  const range=Number.isInteger(servo)?OPERATING_RANGES[servo-1]:undefined;
  if(!range)return 'Choose a joint from 1 to 6.';
  return !Number.isInteger(target)||target<range.min||target>range.max
    ?`J${servo} target ${target} is outside its operating range ${range.min}–${range.max}.`:null;
}
export function assertJointTarget(servo:number,target:number){const issue=targetIssue(servo,target);if(issue)throw Error(issue);}
export function poseIssues(positions:readonly number[]):string[]{
  if(positions.length!==6)return ['Six valid positions required.'];
  return Array.from({length:6},(_,i)=>targetIssue(i+1,positions[i]!)).filter((issue):issue is string=>issue!==null);
}
export function assertPoseTargets(positions:readonly number[],name='Position'){
  const issues=poseIssues(positions);if(issues.length)throw Error(`${name}: ${issues.join(' ')} Reposition and record a replacement; targets have not been changed.`);
}
