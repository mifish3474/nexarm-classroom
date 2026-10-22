import type { ServoId } from '../protocol/NexArmCodec';

export type SimulationStatus = 'Idle' | 'Running' | 'Completed' | 'Stopped';
export interface SimulationSnapshot {
  readonly positions: readonly number[];
  readonly targets: readonly number[];
  readonly status: SimulationStatus;
  readonly activeStep: number | null;
}
export interface SimulationStep { readonly servo: ServoId; readonly target: number; }

export const EXAMPLE: readonly SimulationStep[] = [
  { servo: 1, target: 2128 }, { servo: 3, target: 2128 },
  { servo: 3, target: 2048 }, { servo: 1, target: 2048 },
];

// Educational ranges and timing only. Never reuse these as live robot limits.
export class RobotSimulator {
  private positions = Array<number>(6).fill(2048);
  private targets = [...this.positions];
  private status: SimulationStatus = 'Idle';
  private activeStep: number | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private generation = 0;
  private readonly listeners = new Set<(state: SimulationSnapshot) => void>();

  snapshot(): SimulationSnapshot {
    return { positions: [...this.positions], targets: [...this.targets], status: this.status, activeStep: this.activeStep };
  }

  subscribe(listener: (state: SimulationSnapshot) => void): () => void {
    this.listeners.add(listener); listener(this.snapshot());
    return () => { this.listeners.delete(listener); };
  }

  private emit(): void { for (const listener of this.listeners) listener(this.snapshot()); }

  stop(): void {
    this.generation++;
    clearTimeout(this.timer); this.timer = undefined;
    this.targets = [...this.positions]; this.activeStep = null; this.status = 'Stopped'; this.emit();
  }

  reset(): void {
    this.stop(); this.positions.fill(2048); this.targets = [...this.positions]; this.status = 'Idle'; this.emit();
  }

  run(input: readonly SimulationStep[]): boolean {
    if (this.status === 'Running') return false;
    if (!input.length || input.length > 100) throw new RangeError('Choose between 1 and 100 simulation steps');
    for (const step of input) {
      if (!Number.isInteger(step.servo) || step.servo < 1 || step.servo > 6 || !Number.isInteger(step.target) || step.target < 0 || step.target > 4095) {
        throw new RangeError('Invalid simulated joint target');
      }
    }
    const planned = [...this.positions];
    let ticks = 1;
    for (const step of input) {
      const joint = step.servo - 1;
      ticks += Math.max(1, Math.ceil(Math.abs(step.target - planned[joint]!) / 5));
      planned[joint] = step.target;
    }
    if (ticks > 1500) throw new RangeError('Simulation exceeds the 60-second movement budget');
    const steps = input.map(step => ({ ...step }));
    const generation = ++this.generation;
    this.status = 'Running';
    let index = 0;
    const tick = () => {
      if (generation !== this.generation) return;
      const step = steps[index];
      if (!step) { this.status = 'Completed'; this.activeStep = null; this.timer = undefined; this.emit(); return; }
      this.activeStep = index;
      const joint = step.servo - 1;
      this.targets[joint] = step.target;
      const current = this.positions[joint]!;
      const difference = step.target - current;
      this.positions[joint] = current + Math.sign(difference) * Math.min(5, Math.abs(difference));
      if (this.positions[joint] === step.target) index++;
      this.emit();
      if (generation === this.generation) this.timer = setTimeout(tick, 40);
    };
    tick(); return true;
  }

  jog(servo: ServoId, delta: number): boolean {
    const current = this.positions[servo - 1];
    if (!Number.isInteger(delta) || Math.abs(delta) > 20 || current === undefined) throw new RangeError('Invalid simulation jog');
    return this.run([{ servo, target: current + delta }]);
  }
}
