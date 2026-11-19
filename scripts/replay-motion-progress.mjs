// node scripts/replay-motion-progress.mjs "path/to/export.json" [onset fraction] [reverse units/sec]
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {analyzeJoint, observationPolicy} from '../app/src/safety/MotionProgressWatchdog.ts';
import {rollingFindings} from './rolling-motion-candidate.mjs';

const filename = process.argv[2];
if (!filename) throw Error('Pass the path to a completed robot diagnostics JSON export.');
const onsetFraction = Number(process.argv[3] ?? 0.5);
const reverseUnitsPerSecond = Number(process.argv[4] ?? 60);
assert.ok(onsetFraction >= 0 && onsetFraction < 1 && Number.isFinite(reverseUnitsPerSecond) && reverseUnitsPerSecond > 0);
const recording = JSON.parse(readFileSync(filename, 'utf8')).diagnostics.motionProgressWatchdog;
assert.deepEqual(recording.policy, observationPolicy, 'Recording and replay thresholds differ.');
const results = [];
const rollingBaseline = [];
let baselineFindings = 0;
let commands = 0;
let small = 0;
let outsideCoverage = 0;
for (const [traceIndex, trace] of recording.traces.entries()) {
  assert.ok(Number.isFinite(trace.endedAtMs) && !trace.truncated, 'Replay requires completed, untruncated traces.');
  for (const [index, cmd] of trace.commands.entries()) {
    const original = analyzeJoint(trace, cmd, trace.endedAtMs);
    assert.deepEqual(original, trace.analysis[index], 'Original replay differs from the export.');
    commands++;
    const normalRolling = rollingFindings(trace, cmd);
    for (const finding of normalRolling) rollingBaseline.push({trace:traceIndex + 1, joint:cmd.servo, ...finding});
    baselineFindings += original.findings.length;
    const direction = Math.sign(cmd.target - cmd.from);
    if (Math.abs(cmd.target - cmd.from) <= observationPolicy.nearTargetUnits) { small++; continue; }
    const onset = cmd.writtenAtMs + onsetFraction * (trace.endedAtMs - cmd.writtenAtMs);
    const anchor = trace.samples.find(s => s.atMs >= onset && s.atMs <= trace.endedAtMs);
    if (!anchor) { outsideCoverage++; continue; }
    const before = analyzeJoint({...trace, samples: trace.samples.filter(s => s.atMs <= anchor.atMs)}, cmd, anchor.atMs);
    const atTarget = before.reachedNearTarget || before.crossedTarget;

    for (const scenario of ['freeze', 'reverse']) {
      const samples = trace.samples.map(s => {
        if (s.atMs <= anchor.atMs) return s;
        const delta = scenario === 'reverse' ? Math.round(reverseUnitsPerSecond * (s.atMs - anchor.atMs) / 1000) : 0;
        const positions = [...s.positions];
        positions[cmd.servo - 1] = Math.max(0, Math.min(4095, anchor.positions[cmd.servo - 1] - direction * delta));
        return {...s, positions};
      });
      const replay = analyzeJoint({...trace, samples}, cmd, trace.endedAtMs);
      const first = replay.findings.find(f => f.kind !== 'feedback-gap' && f.atMs > anchor.atMs &&
        !original.findings.some(old => old.atMs === f.atMs && old.kind === f.kind));
      const rolling = rollingFindings({...trace, samples}, cmd).find(f => f.atMs > anchor.atMs &&
        !normalRolling.some(old => old.atMs === f.atMs && old.kind === f.kind));
      results.push({trace: traceIndex + 1, joint: cmd.servo, scenario, atTarget,
        laterSamples: samples.filter(s => s.atMs > anchor.atMs).length,
        remainingMs: Math.round(trace.endedAtMs - anchor.atMs),
        firstFinding: first?.kind ?? null, wouldStop: first?.wouldStop ?? false,
        latencyMs: first ? Math.round(first.atMs - anchor.atMs) : null,
        rollingFinding: rolling?.kind ?? null,
        rollingLatencyMs: rolling ? Math.round(rolling.atMs - anchor.atMs) : null});
    }
  }
}
console.log(JSON.stringify({traces: recording.traces.length, commands, baselineFindings, onsetFraction, reverseUnitsPerSecond,
  initiallyWithinTolerance: small, missingOnsetSample: outsideCoverage, rollingBaseline, results}, null, 2));
