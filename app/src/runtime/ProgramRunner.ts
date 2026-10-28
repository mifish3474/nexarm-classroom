import { interpret } from './instructions';
import type {Instruction,PreparedProgram} from './instructions';
import type {FunctionDefinition} from './ProgramLanguage';
import {ProgramError,variableName} from './ProgramLanguage';

export class ProgramRunner {
  private worker: Worker | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private reject: ((error: Error) => void) | null = null;
  cancel(): void {
    this.worker?.terminate(); this.worker = null;
    clearTimeout(this.timer);
    this.reject?.(new Error('Program canceled.')); this.reject = null;
  }
  prepare(instructions: Instruction[],allowNoMotion=false,functions:FunctionDefinition[]=[]): Promise<PreparedProgram> {
    this.cancel();
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./interpreter.worker.ts', import.meta.url), { type: 'module' });
      this.worker = worker; this.reject = reject;
      const finish = () => { clearTimeout(this.timer); worker.terminate(); this.worker = null; this.reject = null; };
      worker.onmessage = (event: MessageEvent<unknown>) => {
        if (this.worker !== worker) return;
        try {
          const data = event.data as { error?: unknown; steps?: unknown;variables?:unknown;blockId?:unknown };
          if (!data || typeof data !== 'object') throw new Error('Invalid interpreter response.');
          if (typeof data.error === 'string') throw new ProgramError(data.error,typeof data.blockId==='string'?data.blockId:null);
          if (!Array.isArray(data.steps)) throw new Error('Invalid interpreter plan.');
          const plan = !data.steps.length&&allowNoMotion?[]:interpret(data.steps.map(step => ({ ...step, kind: step.kind??'move' })));
          if(!Array.isArray(data.variables)||data.variables.length>32)throw Error('Invalid variable results.');
          const variables=data.variables.map((value:unknown)=>{
            if(!value||typeof value!=='object')throw Error('Invalid variable result.');
            const item=value as {name:unknown;value:unknown};
            if(typeof item.value!=='number'||!Number.isFinite(item.value)||Math.abs(item.value)>Number.MAX_SAFE_INTEGER)throw Error('Invalid variable result.');
            return {name:variableName(item.name),value:item.value};
          });
          finish(); resolve({steps:plan,variables});
        } catch (error) { finish(); reject(error); }
      };
      worker.onerror = () => { if (this.worker !== worker) return; finish(); reject(new Error('Interpreter could not start. Reload and try again.')); };
      this.timer = setTimeout(() => { finish(); reject(new Error('Program preparation timed out. Try a smaller program.')); }, 2000);
      worker.postMessage({instructions,allowNoMotion,functions});
    });
  }
}
