import type {ReportedPose} from '../protocol/FrameParser';
import {validateCoordinateTarget} from '../protocol/CoordinateTarget';
import type {CoordinateTarget} from '../protocol/CoordinateTarget';

/** Validate the exact destination that will be executed. Dev.70 intentionally
 * does not invent intermediate Cartesian checks because playback is one smooth
 * joint-space pose, not a Cartesian waypoint stream. */
export function coordinatePreflightTarget(input:unknown):CoordinateTarget{
  return validateCoordinateTarget(input);
}

export function coordinateArrivalIssues(actual:ReportedPose,target:CoordinateTarget):string[]{
  const issues:string[]=[];
  for(const key of ['x','y','z'] as const)if(Math.abs(actual[key]-target[key])>8)issues.push(`${key.toUpperCase()} reported ${actual[key]}, target ${target[key]}`);
  for(const key of ['pitch','roll','claw'] as const)if(Math.abs(actual[key]-target[key])>4)issues.push(`${key} reported ${actual[key]}, target ${target[key]}`);
  return issues;
}
