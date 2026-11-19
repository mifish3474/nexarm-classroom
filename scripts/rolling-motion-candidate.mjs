import {observationPolicy as policy} from '../app/src/safety/MotionProgressWatchdog.ts';

// Offline candidate. Inspect the shortest qualifying recent window at each sample.
export function rollingFindings(trace, cmd) {
  const direction = Math.sign(cmd.target - cmd.from);
  if (Math.abs(cmd.target - cmd.from) <= policy.nearTargetUnits) return [];
  const minimumSpan = Math.max(policy.windowMs, 2000 * policy.minimumProgressUnits / cmd.speed);
  const findings = [];
  let window = [];
  let previousAt = cmd.writtenAtMs;
  let previousKind = null;
  for (const {atMs, positions} of trace.samples) {
    if (atMs <= previousAt || atMs > trace.endedAtMs) continue;
    if (atMs - previousAt > policy.feedbackGapMs) { window = []; previousKind = null; }
    previousAt = atMs;
    const error = direction * (cmd.target - positions[cmd.servo - 1]);
    if (error <= policy.nearTargetUnits) break;
    if (atMs - cmd.writtenAtMs < policy.startupMs) continue;
    window.push({atMs, error});
    while (window.length > policy.minimumSamples && atMs - window[1].atMs >= minimumSpan) window.shift();
    if (window.length < policy.minimumSamples || atMs - window[0].atMs < minimumSpan) continue;

    const errors = window.map(sample => sample.error);
    const stationary = Math.max(...errors) - Math.min(...errors) <= policy.minimumProgressUnits;
    const reversing = error - errors[0] >= policy.reverseUnits &&
      errors.every((value, index) => index === 0 || value > errors[index - 1]);
    const kind = stationary ? 'stall' : reversing ? 'moving-away' : null;
    if (kind && kind !== previousKind) findings.push({kind, atMs});
    previousKind = kind;
  }
  return findings;
}
