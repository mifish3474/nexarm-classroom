import { describe, expect, it } from 'vitest';
import { interpret } from '../app/src/runtime/instructions';

const move = { kind: 'move', blockId: 'a', servo: 2, target: 2128 };
describe('restricted lesson interpreter', () => {
  it('keeps pose moves grouped through repeats and freezes their six targets',()=>{
    const positions=[2050,2150,2100,2200,2000,1080],pose={kind:'pose',blockId:'p',positionId:'pickup',name:'Pickup',positions};
    const plan=interpret([{kind:'repeat',blockId:'r',count:2,body:[pose,{kind:'wait',blockId:'w',durationMs:1000}]}]);
    positions[0]=0;expect(plan).toHaveLength(4);expect(plan[0]).toMatchObject({kind:'pose',positions:[2050,2150,2100,2200,2000,1080]});
    expect(plan[1]).toEqual({kind:'wait',blockId:'w',durationMs:1000});
  });
  it('rejects malformed poses and out of budget waits before execution',()=>{
    const pose={kind:'pose',blockId:'p',positionId:'p',name:'Pickup',positions:[1,2,3,4,5,6]};
    for(const positions of [[1,2],[1,2,3,4,5,NaN],[1,2,3,4,5,4096]])expect(()=>interpret([{...pose,positions}])).toThrow();
    for(const durationMs of [-1,10001,Infinity,1.5])expect(()=>interpret([{kind:'wait',blockId:'w',durationMs}])).toThrow();
    expect(()=>interpret([{kind:'repeat',blockId:'r',count:7,body:[{kind:'wait',blockId:'w',durationMs:10000}]}])).toThrow('60-second');
  });
  it('expands nested repetition in deterministic order with source block IDs', () => {
    expect(interpret([{ kind: 'repeat', blockId: 'r', count: 2, body: [move] }])).toEqual([
      { blockId: 'a', servo: 2, target: 2128 }, { blockId: 'a', servo: 2, target: 2128 },
    ]);
  });
  it('rejects unknown operations, invalid values, and empty programs', () => {
    for (const input of [[{ ...move, kind: 'serialWrite' }], [{ ...move, target: NaN }], [{ ...move, servo: 7 }], [], [{ kind: 'repeat', blockId: 'r', count: Infinity, body: [move] }]]) expect(() => interpret(input)).toThrow();
  });
  it('halts expansion of huge nested loops before dispatching motion', () => {
    expect(() => interpret([{ kind: 'repeat', blockId: 'a', count: 20, body: [{ kind: 'repeat', blockId: 'b', count: 20, body: [move] }] }])).toThrow('100 movement steps');
  });
  it('rejects cyclic/deep data without overflowing the execution stack', () => {
    const node = { kind: 'repeat', blockId: 'r', count: 1, body: [] as unknown[] }; node.body.push(node);
    expect(() => interpret([node])).toThrow('deeply nested');
  });
});
