import type { SimulationStep } from '../simulation/RobotSimulator';

export type Instruction =
  | { kind: 'move'; blockId: string; servo: number; target: number }
  | { kind: 'repeat'; blockId: string; count: number; body: Instruction[] };
export interface PlannedStep extends SimulationStep { blockId: string; }

// This first interpreter expands only a small bounded language. No source code
// is generated or executed. The simulation backend separately validates motion.
export function interpret(input: unknown): PlannedStep[] {
  const steps: PlannedStep[] = [];
  let visits = 0;
  const walk = (nodes: unknown, depth: number) => {
    if (!Array.isArray(nodes) || nodes.length > 100 || depth > 12) throw new Error('Program is too large or deeply nested.');
    for (const value of nodes) {
      if (++visits > 1000) throw new Error('Program exceeded its instruction budget.');
      if (!value || typeof value !== 'object') throw new Error('Invalid instruction.');
      const node = value as Record<string, unknown>;
      if (typeof node.blockId !== 'string' || node.blockId.length > 200) throw new Error('Invalid block reference.');
      if (node.kind === 'move') {
        if (typeof node.servo !== 'number' || !Number.isInteger(node.servo) || node.servo < 1 || node.servo > 6 || typeof node.target !== 'number' || !Number.isInteger(node.target) || node.target < 0 || node.target > 4095) throw new Error('Choose a joint from 1–6 and an integer target from 0–4095.');
        if (steps.length >= 100) throw new Error('Program exceeds 100 movement steps. Try fewer repeats.');
        steps.push({ servo: node.servo as PlannedStep['servo'], target: node.target, blockId: node.blockId });
      } else if (node.kind === 'repeat') {
        if (typeof node.count !== 'number' || !Number.isInteger(node.count) || node.count < 1 || node.count > 20) throw new Error('Repeat must be an integer from 1 to 20.');
        for (let i = 0; i < node.count; i++) walk(node.body, depth + 1);
      } else throw new Error('This block is not supported by the simulation lesson.');
    }
  };
  walk(input, 0);
  if (!steps.length) throw new Error('Add a movement block under When Run clicked.');
  return steps;
}
