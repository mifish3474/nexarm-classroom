import {copyInstructions,evaluateProgram} from './ProgramLanguage';
import type {Instruction} from './instructions';
import {copyProject} from './ProgramProject';
import type {ProgramProject} from './ProgramProject';
import {resolveProjectPositions} from './ProjectPositions';

export const MAX_PROGRAM_FILE_BYTES=256*1024;

// Data-only, bounded instructions. Files cannot supply Blockly block definitions,
// executable code, connection state, servo holding state, or a safety policy.
export function programInstructions(input:unknown):Instruction[]{
  if(!Array.isArray(input))throw Error('The program must contain a list of blocks.');
  const result=copyInstructions(input,true);
  if(result.length)evaluateProgram(result,{allowNoMotion:true});
  return result;
}

export function saveProgramFile(instructions:unknown):string{
  const text=JSON.stringify({format:'nexarm-classroom-program',schemaVersion:2,instructions:programInstructions(instructions)},null,2);
  if(new TextEncoder().encode(text).length>MAX_PROGRAM_FILE_BYTES)throw Error('Program file exceeds 256 KB.');
  return text;
}

export function loadProgramFile(text:string):Instruction[]{
  if(new TextEncoder().encode(text).length>MAX_PROGRAM_FILE_BYTES)throw Error('Program file exceeds 256 KB.');
  let data:unknown;try{data=JSON.parse(text);}catch{throw Error('Choose a valid NexArm program JSON file.');}
  if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Choose a NexArm program file.');
  const file=data as Record<string,unknown>;
  if(file.format!=='nexarm-classroom-program'||![1,2].includes(file.schemaVersion as number))throw Error('This program file format or version is not supported.');
  return programInstructions(file.instructions);
}

export function saveProjectFile(input:ProgramProject):string{
  const project=resolveProjectPositions(input);
  const text=JSON.stringify({format:'nexarm-classroom-program',schemaVersion:5,...project},null,2);
  if(new TextEncoder().encode(text).length>MAX_PROGRAM_FILE_BYTES)throw Error('Program file exceeds 256 KB.');
  return text;
}

function copyWorkspaceState(input:unknown):Record<string,unknown>{
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('The saved Blockly workspace is missing or invalid.');
  let text:string;
  try{text=JSON.stringify(input);}catch{throw Error('The Blockly workspace could not be saved.');}
  if(!text)throw Error('The Blockly workspace could not be saved.');
  const copy=JSON.parse(text) as unknown;
  if(!copy||typeof copy!=='object'||Array.isArray(copy))throw Error('The saved Blockly workspace is invalid.');
  return copy as Record<string,unknown>;
}

/** Save the complete editor state. The compiled snapshot is retained for inspection,
 * but the Blockly workspace is authoritative and may contain unfinished stacks. */
export function saveWorkspaceProjectFile(input:ProgramProject):string{
  const workspace=copyWorkspaceState(input.workspace);
  const project=resolveProjectPositions(input);
  const text=JSON.stringify({format:'nexarm-classroom-program',schemaVersion:6,...project,workspace},null,2);
  if(new TextEncoder().encode(text).length>MAX_PROGRAM_FILE_BYTES)throw Error('Program file exceeds 256 KB.');
  return text;
}

export function loadProjectFile(text:string):ProgramProject{
  if(new TextEncoder().encode(text).length>MAX_PROGRAM_FILE_BYTES)throw Error('Program file exceeds 256 KB.');
  let data:unknown;try{data=JSON.parse(text);}catch{throw Error('Choose a valid NexArm program JSON file.');}
  if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Choose a NexArm program file.');
  const file=data as Record<string,unknown>;
  if(file.format==='nexarm-classroom-program'&&file.schemaVersion===6){
    if(!Array.isArray(file.positions))throw Error('This program file needs its saved-position list.');
    const project=resolveProjectPositions(copyProject(file,true),true);
    return {...project,workspace:copyWorkspaceState(file.workspace)};
  }
  // Preserve old Space stacks for editing, without silently rebinding to a new key.
  if(file.format==='nexarm-classroom-program'&&[3,4,5].includes(file.schemaVersion as number)){
    if(file.schemaVersion===5&&!Array.isArray(file.positions))throw Error('This program file needs its saved-position list.');
    if(file.schemaVersion===3&&file.functions!==undefined)throw Error('My Blocks require program file version 4.');
    return resolveProjectPositions(copyProject(file,true),true);
  }
  return resolveProjectPositions({instructions:loadProgramFile(text),keyEvents:[],...(file.name!==undefined?{name:file.name as string}:{})},true);
}
