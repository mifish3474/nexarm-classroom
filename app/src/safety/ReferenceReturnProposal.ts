import { encodeGoalPosition } from '../protocol/NexArmCodec';
export const HOME_REFERENCE = Object.freeze([2048,2048,2047,2048,2042,2053]);
// Handoff records 5–9 raw units of ordinary residual error. A 16-unit nominal
// segment plus at most 9 of lag preserves the 25-unit measured-command ceiling.
export const HOME_TOLERANCE = 9;
export const RETURN_STEP = 16;
// Historical staged-return envelope: reported pose, Reference A, and original
// test targets. Applies only to this route, not teacher-reviewed single tests.
// These are not mechanical/collision limits.
export const RETURN_BOUNDS = Object.freeze([[2039,2080],[2004,2076],[1938,2075],[2039,2081],[2033,2075],[2044,2085]].map(pair=>Object.freeze(pair)));

// Pure preview used by the guarded executor; this module never writes.
export function assertLocalCommissioningRegion(positions: readonly number[]) {
  if (positions.length !== 6 || positions.some(n => !Number.isInteger(n) || n < 0 || n > 4095)) throw new Error('Six valid readings are required.');
  for(let i=0;i<6;i++)if(positions[i]!<RETURN_BOUNDS[i]![0]!||positions[i]!>RETURN_BOUNDS[i]![1]!)throw new Error(`Servo ${i+1} reports ${positions[i]}; the staged-return start region is ${RETURN_BOUNDS[i]![0]}–${RETURN_BOUNDS[i]![1]}. This blocks the automatic return only. You can review the current pose for a single joint test.`);
}

export function referenceReturnProposal(positions: readonly number[]) {
  assertLocalCommissioningRegion(positions);
  const steps: {servo:number;target:number;from:number;delta:number;packet:string}[]=[];
  for(const servo of [2,3,4,5,1,6]) {
    const from=positions[servo-1]!, goal=HOME_REFERENCE[servo-1]!, distance=goal-from;
    if(Math.abs(distance)<=HOME_TOLERANCE)continue;
    const count=Math.ceil(Math.abs(distance)/RETURN_STEP);let previous=from;
    for(let n=1;n<=count;n++) {
      const target=Math.round(from+distance*n/count),delta=target-previous;
      steps.push({servo,target,from:previous,delta,packet:[...encodeGoalPosition(servo,target)].map(n=>n.toString(16).padStart(2,'0').toUpperCase()).join(' ')});previous=target;
    }
  }
  if(steps.length>32)throw new Error('Return exceeds the 32-waypoint commissioning limit.');
  return steps;
}
