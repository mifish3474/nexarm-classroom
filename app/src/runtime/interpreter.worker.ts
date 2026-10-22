import { interpret } from './instructions';

self.onmessage = (event: MessageEvent<unknown>) => {
  try { self.postMessage({ steps: interpret(event.data) }); }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : 'Program could not run.' }); }
};
