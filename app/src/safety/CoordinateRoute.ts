import type {ReportedPose} from '../protocol/FrameParser';
import {validateCoordinateTarget} from '../protocol/CoordinateTarget';
import type {CoordinateTarget} from '../protocol/CoordinateTarget';

export const COORDINATE_LINEAR_STEP_MM=15;
export const COORDINATE_ANGULAR_STEP_DEG=5;
export const COORDINATE_MIN_FRAME_MS=150;
export const COORDINATE_MAX_WAYPOINTS=60;
export const COORDINATE_MAX_JOINT_STEP=350;

const rounded=(value:number,places=0)=>Number(value.toFixed(places));

/** Build a bounded straight-line Cartesian route. Every returned waypoint still
 * needs a controller calculation-only result before any movement is allowed. */
export function coordinateWaypoints(start:ReportedPose,input:unknown):CoordinateTarget[]{
  const target=validateCoordinateTarget(input);
  const linear=Math.max(Math.abs(target.x-start.x),Math.abs(target.y-start.y),Math.abs(target.z-start.z));
  const angular=Math.max(Math.abs(target.pitch-start.pitch),Math.abs(target.roll-start.roll),Math.abs(target.claw-start.claw));
  const count=Math.max(1,Math.ceil(linear/COORDINATE_LINEAR_STEP_MM),Math.ceil(angular/COORDINATE_ANGULAR_STEP_DEG));
  if(count>COORDINATE_MAX_WAYPOINTS)throw Error(`XYZ route needs ${count} waypoints. Use an intermediate saved position so each route uses at most ${COORDINATE_MAX_WAYPOINTS}.`);
  const durationMs=Math.max(COORDINATE_MIN_FRAME_MS,Math.ceil(target.durationMs/count/10)*10),result:CoordinateTarget[]=[];
  for(let i=1;i<=count;i++){
    const t=i/count;
    const waypoint=validateCoordinateTarget({
      x:i===count?target.x:rounded(start.x+(target.x-start.x)*t),
      y:i===count?target.y:rounded(start.y+(target.y-start.y)*t),
      z:i===count?target.z:rounded(start.z+(target.z-start.z)*t),
      pitch:i===count?target.pitch:rounded(start.pitch+(target.pitch-start.pitch)*t,1),
      roll:i===count?target.roll:rounded(start.roll+(target.roll-start.roll)*t),
      claw:i===count?target.claw:rounded(start.claw+(target.claw-start.claw)*t),
      durationMs,
    });
    const prior=result.at(-1);
    if(!prior||['x','y','z','pitch','roll','claw'].some(key=>prior[key as keyof CoordinateTarget]!==waypoint[key as keyof CoordinateTarget]))result.push(waypoint);
  }
  return result;
}

export function assertCoordinateSolutionContinuity(previous:readonly number[],next:readonly number[],waypoint:number){
  if(previous.length!==6||next.length!==6)throw Error('XYZ calculation did not provide six joint targets.');
  const jumps=next.map((target,i)=>({joint:i+1,delta:Math.abs(target-previous[i]!)})).filter(item=>item.delta>COORDINATE_MAX_JOINT_STEP);
  if(jumps.length)throw Error(`XYZ waypoint ${waypoint} changes arm shape too abruptly: ${jumps.map(item=>`J${item.joint} by ${item.delta}`).join(', ')} raw units. No movement sent; add an intermediate position or choose another route.`);
}

export function coordinateArrivalIssues(actual:ReportedPose,target:CoordinateTarget):string[]{
  const issues:string[]=[];
  for(const key of ['x','y','z'] as const)if(Math.abs(actual[key]-target[key])>8)issues.push(`${key.toUpperCase()} reported ${actual[key]}, target ${target[key]}`);
  for(const key of ['pitch','roll','claw'] as const)if(Math.abs(actual[key]-target[key])>4)issues.push(`${key} reported ${actual[key]}, target ${target[key]}`);
  return issues;
}
