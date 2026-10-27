import {evaluateProgram,ProgramError} from './ProgramLanguage';

self.onmessage = (event: MessageEvent<unknown>) => {
  try {
    const data=event.data as {instructions?:unknown;allowNoMotion?:unknown};
    if(!data||typeof data!=='object'||typeof data.allowNoMotion!=='boolean')throw Error('Invalid program preparation request.');
    self.postMessage(evaluateProgram(data.instructions,{allowNoMotion:data.allowNoMotion}));
  }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : 'Program could not run.',blockId:error instanceof ProgramError?error.blockId:null }); }
};
