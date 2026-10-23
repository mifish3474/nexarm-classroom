import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXAMPLE, RobotSimulator } from '../app/src/simulation/RobotSimulator';

describe('simulation operation ownership', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it('moves pose joints together, freezes targets and observes the full wait before the next move',()=>{
    const simulator=new RobotSimulator(),positions=[2068,2068,2068,2068,2068,2068];
    simulator.run([{kind:'pose',positionId:'p',name:'Pickup',positions},{kind:'wait',durationMs:1000},{servo:1,target:2088}]);positions.fill(0);
    vi.advanceTimersByTime(160);expect(simulator.snapshot().positions).toEqual(Array(6).fill(2068));
    vi.advanceTimersByTime(960);expect(simulator.snapshot().positions).toEqual(Array(6).fill(2068));
    vi.runAllTimers();expect(simulator.snapshot().positions).toEqual([2088,2068,2068,2068,2068,2068]);
  });
  it('Stop during a wait cancels later pose movement',()=>{
    const simulator=new RobotSimulator();simulator.run([{kind:'wait',durationMs:1000},{kind:'pose',positionId:'p',name:'P',positions:Array(6).fill(2100)}]);
    vi.advanceTimersByTime(500);simulator.stop();vi.runAllTimers();expect(simulator.snapshot().positions).toEqual(Array(6).fill(2048));
  });

  it('runs the bounded example deterministically without hardware', () => {
    const simulator = new RobotSimulator();
    expect(simulator.run(EXAMPLE)).toBe(true);
    vi.runAllTimers();
    expect(simulator.snapshot()).toMatchObject({ status: 'Completed', positions: Array(6).fill(2048), activeStep: null });
  });
  it('rejects overlapping runs and jogs', () => {
    const simulator = new RobotSimulator(); simulator.run(EXAMPLE);
    expect(simulator.run(EXAMPLE)).toBe(false);
    expect(simulator.jog(2, 20)).toBe(false);
  });
  it('Stop cancels future steps and prevents old timers from changing reset state', () => {
    const simulator = new RobotSimulator(); simulator.run(EXAMPLE);
    vi.advanceTimersByTime(120); simulator.stop();
    const stopped = simulator.snapshot(); vi.runAllTimers();
    expect(simulator.snapshot()).toEqual(stopped);
    simulator.reset(); simulator.jog(2, 20); vi.runAllTimers();
    expect(simulator.snapshot().positions).toEqual([2048, 2068, 2048, 2048, 2048, 2048]);
  });
  it('freezes the run input and does not expose mutable state', () => {
    const simulator = new RobotSimulator();
    const steps = [{ servo: 1 as const, target: 2068 }]; simulator.run(steps); steps[0]!.target = 100;
    const copy = simulator.snapshot().positions as number[]; copy[0] = 0;
    vi.runAllTimers(); expect(simulator.snapshot().positions[0]).toBe(2068);
  });
  it('rejects non-finite targets and oversized programs before any movement', () => {
    const simulator = new RobotSimulator();
    expect(() => simulator.run([{ servo: 1, target: NaN }])).toThrow(RangeError);
    expect(() => simulator.run(Array(10_000).fill(EXAMPLE[0]))).toThrow(RangeError);
    expect(simulator.snapshot().positions).toEqual(Array(6).fill(2048));
    expect(simulator.snapshot().status).toBe('Idle');
  });
});
