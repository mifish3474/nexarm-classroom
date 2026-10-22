import { encodeGoalPosition } from '../protocol/NexArmCodec';
import type { StagedRoute } from './StagedReferenceReturn';

// Teacher-requested pose. These values do not alter the device's calibration.
export const TEACHER_HOME = Object.freeze([2050, 2150, 2100, 2200, 2000, 1080]);
export const HOME_ORDER = Object.freeze([2, 3, 4, 5, 1, 6]);
export const SLOW_HOME_STEP = 10;
export const SLOW_HOME_INTERVAL_MS = 1200;
export const POSITION_TOLERANCE = 9;

function assertPositions(positions: readonly number[]) {
  if (positions.length !== 6 || positions.some(n => !Number.isInteger(n) || n < 0 || n > 4095)) {
    throw new Error('Six valid reported positions are required.');
  }
}
function step(servo: number, from: number, target: number) {
  return Object.freeze({servo, from, target, delta: target - from,
    packet: [...encodeGoalPosition(servo, target)].map(n => n.toString(16).padStart(2, '0').toUpperCase()).join(' ')});
}

export function slowHomePlan(positions: readonly number[]): StagedRoute {
  assertPositions(positions);
  const steps: ReturnType<typeof step>[] = [];
  for (const servo of HOME_ORDER) {
    let from = positions[servo - 1]!;
    const home = TEACHER_HOME[servo - 1]!, distance = home - from;
    if (Math.abs(distance) <= POSITION_TOLERANCE) continue;
    const count = Math.ceil(Math.abs(distance) / SLOW_HOME_STEP), start = from;
    for (let i = 1; i <= count; i++) {
      const target = Math.round(start + distance * i / count);
      steps.push(step(servo, from, target)); from = target;
    }
  }
  return Object.freeze({target: TEACHER_HOME, steps: Object.freeze(steps),
    intervalMs: SLOW_HOME_INTERVAL_MS, maxCommandDelta: 20, label: 'Teacher Home'});
}

// The live UI needs a count, not thousands of freshly encoded packet previews.
export function slowHomeStepCount(positions: readonly number[]): number {
  assertPositions(positions);
  return positions.reduce((count, position, i) => {
    const distance = Math.abs(position - TEACHER_HOME[i]!);
    return count + (distance <= POSITION_TOLERANCE ? 0 : Math.ceil(distance / SLOW_HOME_STEP));
  }, 0);
}

export function jogPlan(positions: readonly number[], servo: number, delta: number): StagedRoute {
  assertPositions(positions);
  if (!Number.isInteger(servo) || servo < 1 || servo > 6 || ![-20, 20].includes(delta)) throw new Error('Choose one servo and a -20 or +20 step.');
  const target = [...positions], from = positions[servo - 1]!;
  target[servo - 1] = from + delta;
  const steps = Object.freeze([step(servo, from, from + delta)]);
  return Object.freeze({target: Object.freeze(target), steps, intervalMs: 900,
    maxCommandDelta: 20, label: `servo ${servo} jog target`});
}
