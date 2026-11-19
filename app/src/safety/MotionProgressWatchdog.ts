// Developer diagnostics. Analysis runs on export, using only this trace.
export const observationPolicy = {
  startupMs: 250, windowMs: 300, minimumSamples: 3, feedbackGapMs: 500,
  nearTargetUnits: 40, reverseUnits: 12, minimumProgressUnits: 4,
  consecutiveWindows: 2,
} as const;

export interface JointCommand {
  servo: number; from: number; target: number; speed: number; acceleration: number;
  submittedAtMs: number; writtenAtMs: number;
}
interface Sample { atMs: number; positions: readonly number[] }
export interface MotionTrace {
  operation: string; frameMs: number | null; commands: JointCommand[]; samples: Sample[];
  endedAtMs: number | null; outcome: string; truncated: boolean;
}
type Finding = 'stall' | 'moving-away' | 'feedback-gap';

export function analyzeJoint(trace: MotionTrace, command: JointCommand, throughMs: number) {
  const policy = observationPolicy;
  const findings: {kind: Finding; atMs: number; remainingUnits: number; wouldStop: boolean}[] = [];
  let previousAt = command.writtenAtMs;
  let remaining = Math.abs(command.target - command.from);
  let reached = remaining <= policy.nearTargetUnits;
  const direction = Math.sign(command.target - command.from);
  let crossedTarget = false;
  let window: {atMs: number; error: number}[] = [];
  let candidate: Finding | undefined;
  let consecutive = 0;
  let qualifyingWindows = 0;
  const finding = (kind: Finding, atMs: number) => {
    findings.push({kind, atMs, remainingUnits: remaining,
      wouldStop: kind !== 'feedback-gap' && command.servo !== 6});
  };
  for (const sample of trace.samples) {
    if (sample.atMs <= previousAt || sample.atMs > throughMs) continue;
    if (sample.atMs - previousAt > policy.feedbackGapMs) {
      finding('feedback-gap', previousAt + policy.feedbackGapMs);
      window = []; consecutive = 0;
    }
    previousAt = sample.atMs;
    const signedError = command.target - sample.positions[command.servo - 1]!;
    remaining = Math.abs(signedError);
    crossedTarget ||= direction * signedError < 0;
    reached ||= remaining <= policy.nearTargetUnits;
    if (reached || crossedTarget || sample.atMs - command.writtenAtMs < policy.startupMs) continue;
    window.push({atMs: sample.atMs, error: remaining});
    const first = window[0]!;
    const span = sample.atMs - first.atMs;
    if (window.length < policy.minimumSamples || span < policy.windowMs) continue;
    // Give intentionally slow commands enough time to make measurable progress.
    if (span * command.speed / 1000 < 2 * policy.minimumProgressUnits) continue;
    qualifyingWindows++;
    const progress = first.error - remaining;
    const kind = progress <= -policy.reverseUnits ? 'moving-away'
      : progress < policy.minimumProgressUnits ? 'stall' : undefined;
    consecutive = kind && kind === candidate ? consecutive + 1 : kind ? 1 : 0;
    candidate = kind;
    if (kind && consecutive === policy.consecutiveWindows) finding(kind, sample.atMs);
    window = [window[window.length - 1]!];
  }
  if (!trace.truncated && throughMs - previousAt > policy.feedbackGapMs)
    finding('feedback-gap', previousAt + policy.feedbackGapMs);
  return {servo: command.servo, reachedNearTarget: reached, crossedTarget, qualifyingWindows, findings};
}

export class MotionProgressWatchdog {
  private traces: MotionTrace[] = [];
  private current: MotionTrace | undefined;
  private discarded = 0;

  begin(operation: string, frameMs: number | null, at: number) {
    this.end('replaced', at);
    const trace: MotionTrace = {operation, frameMs, commands: [], samples: [],
      endedAtMs: null, outcome: 'observing', truncated: false};
    this.current = trace;
    this.traces.push(trace);
    if (this.traces.length > 64) { this.traces.shift(); this.discarded++; }
  }

  written(command: JointCommand) { this.current?.commands.push(command); }

  observe(positions: readonly number[], atMs: number) {
    const trace = this.current;
    if (!trace?.commands.length) return;
    if (trace.samples.length >= 512) { trace.truncated = true; return; }
    trace.samples.push({atMs, positions: [...positions]});
  }

  end(outcome: string, at: number) {
    if (!this.current) return;
    this.current.endedAtMs = at;
    this.current.outcome = outcome;
    this.current = undefined;
  }

  report(at: number) {
    return {schemaVersion: 1, mode: 'observation-only', policy: observationPolicy,
      discardedTraces: this.discarded, traces: this.traces.map(trace => ({
        ...structuredClone(trace),
        analysis: trace.commands.map(cmd => analyzeJoint(trace, cmd, trace.endedAtMs ?? at)),
      }))};
  }
}
