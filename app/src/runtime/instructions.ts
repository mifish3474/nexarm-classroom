import type { SimulationStep } from '../simulation/RobotSimulator';

export type Instruction =
  | { kind: 'move'; blockId: string; servo: number; target: number }
  | { kind: 'pose'; blockId: string; positionId:string; name:string; positions:number[] }
  | { kind: 'wait'; blockId: string; durationMs:number }
  | { kind: 'repeat'; blockId: string; count: number; body: Instruction[] };
export type PlannedStep = SimulationStep & { blockId: string };

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
      if(steps.length>=100)throw new Error('Program exceeds 100 movement steps. Try fewer repeats.');
      if (node.kind === 'move') {
        if (typeof node.servo !== 'number' || !Number.isInteger(node.servo) || node.servo < 1 || node.servo > 6 || typeof node.target !== 'number' || !Number.isInteger(node.target) || node.target < 0 || node.target > 4095) throw new Error('Choose a joint from 1–6 and an integer target from 0–4095.');
        if (steps.length >= 100) throw new Error('Program exceeds 100 movement steps. Try fewer repeats.');
        steps.push({ servo: node.servo as 1|2|3|4|5|6, target: node.target, blockId: node.blockId });
      } else if(node.kind==='pose'){
        if(typeof node.positionId!=='string'||!node.positionId||node.positionId.length>80||typeof node.name!=='string'||!node.name.trim()||node.name.length>40||!Array.isArray(node.positions)||node.positions.length!==6||node.positions.some(n=>typeof n!=='number'||!Number.isInteger(n)||n<0||n>4095))throw Error('Choose an existing saved position with six valid targets.');
        steps.push({kind:'pose',positionId:node.positionId,name:node.name,positions:[...node.positions],blockId:node.blockId});
      } else if(node.kind==='wait'){
        if(typeof node.durationMs!=='number'||!Number.isInteger(node.durationMs)||node.durationMs<0||node.durationMs>10000)throw Error('Wait must be between 0 and 10 seconds.');
        steps.push({kind:'wait',durationMs:node.durationMs,blockId:node.blockId});
      } else if (node.kind === 'repeat') {
        if (typeof node.count !== 'number' || !Number.isInteger(node.count) || node.count < 1 || node.count > 20) throw new Error('Repeat must be an integer from 1 to 20.');
        for (let i = 0; i < node.count; i++) walk(node.body, depth + 1);
      } else throw new Error('This block is not supported by the simulation lesson.');
    }
  };
  walk(input, 0);
  if(steps.reduce((sum,step)=>sum+(step.kind==='wait'?step.durationMs:0),0)>60000)throw Error('Waits exceed the 60-second program budget.');
  if (!steps.length) throw new Error('Add a movement block under When Run clicked.');
  return steps;
}
