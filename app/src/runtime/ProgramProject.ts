import {copyInstructions,copyFunctions,validateCalls,evaluateProgram,ProgramError} from './ProgramLanguage';
import type {Instruction,FunctionDefinition} from './ProgramLanguage';
import {isEventKey,keyLabel,SPACE_RESERVED_MESSAGE} from './KeyboardEvents';

export type KeyHandler={blockId:string;key:string;body:Instruction[]};
export type ProgramProject={instructions:Instruction[];keyEvents:KeyHandler[];functions?:FunctionDefinition[];name?:string};

export function projectName(value:unknown):string{
  if(typeof value!=='string'||!value.trim()||value.trim().length>60||/[\u0000-\u001f\u007f]/.test(value))throw Error('Use a project name with 1–60 characters.');
  return value.trim();
}
export function projectFilename(name:string):string{
  const safe=projectName(name).replace(/\.json$/i,'').replace(/[<>:"/\\|?*]/g,'-').replace(/[. ]+$/g,'').slice(0,60)||'nexarm-program';
  return (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(safe)?'NexArm-'+safe:safe)+'.json';
}

/** Validate a complete project before replacing the editor or enabling events. */
export function copyProject(input:unknown,allowUnassigned=false):ProgramProject{
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Choose a valid program project.');
  const project=input as Record<string,unknown>;
  const instructions=copyInstructions(project.instructions,true);
  if(!Array.isArray(project.keyEvents)||project.keyEvents.length>16)throw Error('Use at most 16 keyboard event stacks.');
  const keys=new Set<string>();
  const keyEvents=project.keyEvents.map((value:unknown):KeyHandler=>{
    if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid keyboard event.');
    const event=value as Record<string,unknown>;
    if(typeof event.blockId!=='string'||!event.blockId||event.blockId.length>200)throw Error('Invalid keyboard event block reference.');
    const reserved=event.key==='space'||event.key==='unassigned';
    if(reserved&&!allowUnassigned)throw new ProgramError(SPACE_RESERVED_MESSAGE,event.blockId);
    if(!reserved&&!isEventKey(event.key))throw new ProgramError('Choose an arrow, a letter, or a number for the key event.',event.blockId);
    const key=reserved?'unassigned':event.key as string;
    if(key!=='unassigned'&&keys.has(key))throw new ProgramError(`Use one When ${keyLabel(key)} pressed stack. Combine its blocks into one sequence.`,event.blockId);
    keys.add(key);return {blockId:event.blockId,key,body:copyInstructions(event.body,true)};
  });
  const functions=copyFunctions(project.functions);
  const result:ProgramProject={instructions,keyEvents,...(functions.length?{functions}:{}),...(project.name!==undefined?{name:projectName(project.name)}:{})},ids=new Set<string>(),names=new Set<string>();let nodes=0;
  function visit(value:unknown){
    if(!value||typeof value!=='object')return;
    if(++nodes>1000)throw Error('Program project is too large.');
    if(Array.isArray(value)){value.forEach(visit);return;}
    const node=value as Record<string,unknown>;
    if(typeof node.blockId==='string'){if(ids.has(node.blockId))throw Error('Program block references must be unique across all stacks.');ids.add(node.blockId);}
    if(['set','change','variable'].includes(String(node.kind))&&typeof node.name==='string')names.add(node.name.toLowerCase());
    Object.values(node).forEach(visit);
  }
  visit(result);if(names.size>32)throw Error('Use at most 32 variables across the project.');
  validateCalls([instructions,...keyEvents.map(handler=>handler.body)],functions);
  if(instructions.length)evaluateProgram(instructions,{allowNoMotion:true,functions});
  for(const handler of keyEvents)if(handler.body.length)evaluateProgram(handler.body,{allowNoMotion:true,functions});
  return result;
}
