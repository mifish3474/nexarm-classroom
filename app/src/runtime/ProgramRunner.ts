import { interpret } from './instructions';
import type {Instruction,PreparedProgram} from './instructions';
import type {FunctionDefinition,VariableValues} from './ProgramLanguage';
import {ProgramError,UninitializedVariableError,copyVariableValues} from './ProgramLanguage';

export class ProgramRunner {
  private worker: Worker | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private reject: ((error: Error) => void) | null = null;
  cancel(): void {
    this.worker?.terminate(); this.worker = null;
    clearTimeout(this.timer);
    this.reject?.(new Error('Program canceled.')); this.reject = null;
  }
  prepare(instructions: Instruction[],allowNoMotion=false,functions:FunctionDefinition[]=[],variables:VariableValues=[]): Promise<PreparedProgram> {
    this.cancel();
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./interpreter.worker.ts', import.meta.url), { type: 'module' });
      this.worker = worker; this.reject = reject;
      const finish = () => { clearTimeout(this.timer); worker.terminate(); this.worker = null; this.reject = null; };
      worker.onmessage = (event: MessageEvent<unknown>) => {
        if (this.worker !== worker) return;
        try {
          const data = event.data as { error?: unknown; steps?: unknown;variables?:unknown;blockId?:unknown;variable?:unknown;changing?:unknown };
          if (!data || typeof data !== 'object') throw new Error('Invalid interpreter response.');
          if(typeof data.error==='string'){
            const blockId=typeof data.blockId==='string'?data.blockId:null;
            if(typeof data.variable==='string')throw new UninitializedVariableError(data.variable,data.changing===true,blockId);
            throw new ProgramError(data.error,blockId);
          }
          if (!Array.isArray(data.steps)) throw new Error('Invalid interpreter plan.');
          const plan = !data.steps.length&&allowNoMotion?[]:interpret(data.steps.map(step => ({ ...step, kind: step.kind??'move' })));
          if(!Array.isArray(data.variables))throw Error('Invalid variable results.');
          const values=copyVariableValues(data.variables);
          finish(); resolve({steps:plan,variables:values});
        } catch (error) { finish(); reject(error); }
      };
      worker.onerror = () => { if (this.worker !== worker) return; finish(); reject(new Error('Interpreter could not start. Reload and try again.')); };
      this.timer = setTimeout(() => { finish(); reject(new Error('Program preparation timed out. Try a smaller program.')); }, 2000);
      worker.postMessage({instructions,allowNoMotion,functions,variables});
    });
  }
}
