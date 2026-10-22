export interface ObservedSample { positions: readonly number[]; at: number; }

// Draft evidence gates, NOT production motion limits or proof of calibration.
export class ReferenceCapture {
  private samples: ObservedSample[] = [];
  clear() { this.samples = []; }
  observe(positions: readonly number[], at: number) {
    if (positions.length !== 6 || positions.some(n => !Number.isInteger(n) || n < 0 || n > 4095) || !Number.isFinite(at)) throw new Error('Invalid observation');
    const previous = this.samples.at(-1);
    if (previous && (at < previous.at || at - previous.at > 500)) this.clear();
    this.samples.push({ positions: [...positions], at });
    this.samples = this.samples.filter(sample => at - sample.at <= 2000).slice(-100);
  }
  reason(now: number): string | null {
    const first = this.samples[0], last = this.samples.at(-1);
    if (!first || !last || now < last.at || now - last.at > 500) return 'Waiting for fresh full-checksum telemetry.';
    if (this.samples.length < 10 || last.at - first.at < 1000) return 'Waiting for a continuous observation window (at least 10 samples over one second).';
    for (let joint = 0; joint < 6; joint++) {
      const values = this.samples.map(sample => sample.positions[joint]!);
      if (Math.max(...values) - Math.min(...values) > 12) return 'Readings are changing. Wait without touching the powered arm.';
    }
    return null;
  }
  capture(now: number) {
    const reason = this.reason(now); if (reason) throw new Error(reason);
    const first = this.samples[0]!, last = this.samples.at(-1)!;
    return {
      format: 'nexarm-reference-draft', schemaVersion: 1, approval: 'unreviewed',
      capturedAt: new Date().toISOString(), protocol: 'factory-passive-0x0b', integrity: 'full-checksum',
      servoIds: [1, 2, 3, 4, 5, 6], rawPositions: [...last.positions],
      observation: { sampleCount: this.samples.length, durationMs: last.at - first.at,
        min: Array.from({ length: 6 }, (_, i) => Math.min(...this.samples.map(s => s.positions[i]!))),
        max: Array.from({ length: 6 }, (_, i) => Math.max(...this.samples.map(s => s.positions[i]!))) },
      calibration: { jointMapping: null, direction: null, zeroOffsets: null, geometry: null, limits: null },
      permittedUse: 'observation-only; not a safe pose, homing target, or motion authorization',
    };
  }
}
