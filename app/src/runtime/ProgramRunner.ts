import { interpret } from './instructions';
import type { Instruction, PlannedStep } from './instructions';

export class ProgramRunner {
  private worker: Worker | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private reject: ((error: Error) => void) | null = null;
  cancel(): void {
    this.worker?.terminate(); this.worker = null;
    clearTimeout(this.timer);
    this.reject?.(new Error('Program canceled.')); this.reject = null;
  }
  prepare(instructions: Instruction[]): Promise<PlannedStep[]> {
    this.cancel();
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./interpreter.worker.ts', import.meta.url), { type: 'module' });
      this.worker = worker; this.reject = reject;
      const finish = () => { clearTimeout(this.timer); worker.terminate(); this.worker = null; this.reject = null; };
      worker.onmessage = (event: MessageEvent<unknown>) => {
        if (this.worker !== worker) return;
        try {
          const data = event.data as { error?: unknown; steps?: unknown };
          if (!data || typeof data !== 'object') throw new Error('Invalid interpreter response.');
          if (typeof data.error === 'string') throw new Error(data.error);
          if (!Array.isArray(data.steps)) throw new Error('Invalid interpreter plan.');
          const plan = interpret(data.steps.map(step => ({ ...step, kind: 'move' })));
          finish(); resolve(plan);
        } catch (error) { finish(); reject(error); }
      };
      worker.onerror = () => { if (this.worker !== worker) return; finish(); reject(new Error('Interpreter could not start. Reload and try again.')); };
      this.timer = setTimeout(() => { finish(); reject(new Error('Program preparation timed out. Try a smaller program.')); }, 2000);
      worker.postMessage(instructions);
    });
  }
}
