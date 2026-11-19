import {expect, it} from 'vitest';
import {MotionProgressWatchdog, analyzeJoint} from '../app/src/safety/MotionProgressWatchdog';

function replay(values: number[], target = 2500, servo = 3, times = values.map((_, i) => 300 + i * 100)) {
  const watch = new MotionProgressWatchdog();
  watch.begin('Program', 2000, 0);
  watch.written({servo, from: 2000, target, speed: 250, acceleration: 10, submittedAtMs: 0, writtenAtMs: 10});
  values.forEach((value, i) => watch.observe(Array(6).fill(value), times[i]!));
  watch.end('Complete', times.at(-1)!);
  const trace = watch.report(60000).traces[0]!;
  expect(analyzeJoint(JSON.parse(JSON.stringify(trace)), trace.commands[0]!, trace.endedAtMs!)).toEqual(trace.analysis[0]);
  return trace.analysis[0]!;
}

it('requires sustained wrong-way travel or stalled fresh readings far from the target', () => {
  expect(replay(Array(9).fill(2000)).findings).toEqual([
    {kind:'stall', atMs:900, remainingUnits:500, wouldStop:true},
  ]);
  expect(replay([2000,2010,2020,2030,2040,2050,2060], 1500).findings[0]?.kind).toBe('moving-away');
  expect(replay(Array(9).fill(2000), 2500, 6).findings[0]).toMatchObject({kind:'stall', wouldStop:false});
});

it('accepts rounding offsets, tiny moves, overshoot and recovery from brief reversals', () => {
  for (const trace of [
    replay([2000,1995,2000,2020,2100,2250,2468,2468,2467,2468]),
    replay(Array(10).fill(2000), 2020),
    replay([2300,2560,2559,2560,2558,2559,2560,2559]),
    replay([2000,1999,2000,2001,1980,1960,1940], 1500),
  ]) expect(trace.findings).toEqual([]);
});

it('separates missing reports from a stationary joint, including coalesced readings', () => {
  const result = replay(Array(9).fill(2000), 2500, 3, [100,200,300,400,500,600,1400,1400,1500]);
  expect(result.findings.map(f => f.kind)).toEqual(['feedback-gap']);
});

it('bounds capture and exposes truncation without diagnosing a missing tail', () => {
  const watch = new MotionProgressWatchdog();
  for (let i = 0; i < 65; i++) watch.begin('Slider', null, i);
  watch.written({servo:1, from:2000, target:2020, speed:100, acceleration:10, submittedAtMs:65, writtenAtMs:66});
  for (let i = 0; i < 520; i++) watch.observe(Array(6).fill(2000), 100+i);
  const report = watch.report(5000);
  expect(report.discardedTraces).toBe(1);
  expect(report.traces.at(-1)).toMatchObject({truncated:true, analysis:[{findings:[]}]});
  expect(report.traces.at(-1)!.samples).toHaveLength(512);
});
