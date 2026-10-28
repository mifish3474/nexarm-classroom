export type SignalInput={connectionState:string|undefined;faulted:boolean;running:boolean;keysActive:boolean;preparing:boolean;stopped:boolean;released:boolean};

/** Reports application activity, never a measured power state or proof of standstill. */
export function programSignal(input:SignalInput):{state:string;label:string}{
  if(!input.connectionState||input.connectionState==='Disconnected'||input.connectionState==='Closing')return {state:'disconnected',label:'Disconnected'};
  if(input.faulted)return {state:'fault',label:'Fault · check robot'};
  if(input.running)return {state:'running',label:'Program / motion running'};
  if(input.stopped)return {state:'stopped',label:'Stop requested'};
  if(input.released)return {state:'released',label:'Holding needs attention'};
  if(input.preparing)return {state:'checking',label:'Checking program'};
  if(input.keysActive)return {state:'listening',label:'Listening for keys'};
  return {state:'idle',label:input.connectionState==='Listening'?'Idle':'Connecting'};
}
