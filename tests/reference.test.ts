import { describe, expect, it } from 'vitest';
import { ReferenceCapture } from '../app/src/robot/ReferenceCapture';

describe('unreviewed reference observations', () => {
  it('requires a fresh continuous window and exports no motion authority', () => {
    const reference = new ReferenceCapture();
    expect(() => reference.capture(0)).toThrow('fresh');
    for (let t = 0; t <= 1100; t += 100) reference.observe([2400, 2500, 2600, 2700, 2800, 2900], t);
    expect(reference.capture(1100)).toMatchObject({ approval: 'unreviewed', rawPositions: [2400,2500,2600,2700,2800,2900], calibration: { limits: null, zeroOffsets: null, jointMapping: null } });
    expect(() => reference.capture(1700)).toThrow('fresh');
  });
  it('rejects changing readings, gaps, clock reversal, and invalid positions', () => {
    const reference = new ReferenceCapture();
    for (let t = 0; t <= 1100; t += 100) reference.observe([2048+t/10, 2048,2048,2048,2048,2048], t);
    expect(reference.reason(1100)).toContain('changing');
    reference.observe(Array(6).fill(2048), 1800);
    expect(reference.reason(1800)).toContain('continuous');
    reference.observe(Array(6).fill(2048), 1000);
    expect(reference.reason(1000)).toContain('continuous');
    expect(() => reference.observe([NaN], 1000)).toThrow();
  });
  it('reset invalidates reference evidence and returned values are copied', () => {
    const reference = new ReferenceCapture(), positions = Array(6).fill(2048);
    for (let t = 0; t <= 1100; t += 100) reference.observe(positions, t);
    positions[0] = 0;
    const draft = reference.capture(1100); draft.rawPositions[0] = 0;
    expect(reference.capture(1100).rawPositions[0]).toBe(2048);
    reference.clear(); expect(() => reference.capture(1100)).toThrow();
  });
});
