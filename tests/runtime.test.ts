import { describe, expect, it } from 'vitest';
import { interpret } from '../app/src/runtime/instructions';

const move = { kind: 'move', blockId: 'a', servo: 2, target: 2128 };
describe('restricted lesson interpreter', () => {
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
