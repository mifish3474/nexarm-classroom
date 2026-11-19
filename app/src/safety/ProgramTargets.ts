import {ProgramError, type PlannedStep} from '../runtime/ProgramLanguage';
import {assertJointTarget, assertPoseTargets} from './OperatingRanges';

/** Check the complete evaluated stack before giving any of it to the robot. */
export function assertProgramTargets(steps: readonly PlannedStep[]) {
  for (const step of steps) {
    try {
      if (step.kind === 'pose') {
        assertPoseTargets(step.positions, `Saved position "${step.name}"`);
      } else if (step.kind !== 'wait') {
        assertJointTarget(step.servo, step.target);
      }
    } catch (error) {
      throw new ProgramError(error instanceof Error ? error.message : 'Invalid target.', step.blockId);
    }
  }
}
