import type { ServoId } from '../protocol/NexArmCodec';

export const BASE_APPROVAL_KEY = 'nexarm.approval.reference-a-servo1-plus20.2026-10-22';
export interface JointTestPlan {
  readonly servo: ServoId; readonly hypothesis: string; readonly key: string;
  readonly startMin: number; readonly startMax: number; readonly target: number;
  readonly reference: readonly number[];
}
const current = Object.freeze([2066, 2044, 2043, 2049, 2043, 2053]);
const labels = ['Base', 'Shoulder', 'Elbow', 'Wrist pitch', 'Wrist roll', 'Gripper'];
const plans: readonly JointTestPlan[] = Object.freeze(Array.from({ length: 6 }, (_, index) => {
  const servo = (index + 1) as ServoId;
  const center = servo === 1 ? 2048 : current[index]!;
  return Object.freeze({ servo, hypothesis: labels[index]!,
    key: servo === 1 ? BASE_APPROVAL_KEY : `nexarm.approval.joint-suite.servo${servo}.positive.2026-10-22`,
    startMin: center - 5, startMax: center + 5, target: center + 20,
    reference: servo === 1 ? Object.freeze([2048,2048,2047,2048,2042,2053]) : current });
}));
export function jointPlan(servo: number): JointTestPlan {
  const plan = plans.find(plan => plan.servo === servo);
  if (!plan) throw new Error('Unknown commissioning joint.');
  return plan;
}
export const REMAINING_TESTS = Object.freeze(plans.slice(1));
