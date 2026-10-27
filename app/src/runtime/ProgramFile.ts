import {copyInstructions,evaluateProgram} from './ProgramLanguage';
import type {Instruction} from './instructions';
import {copyProject} from './ProgramProject';
import type {ProgramProject} from './ProgramProject';

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
  const project=copyProject(input);
  if(!project.keyEvents.length)return saveProgramFile(project.instructions);
  const text=JSON.stringify({format:'nexarm-classroom-program',schemaVersion:3,...project},null,2);
  if(new TextEncoder().encode(text).length>MAX_PROGRAM_FILE_BYTES)throw Error('Program file exceeds 256 KB.');
  return text;
}

export function loadProjectFile(text:string):ProgramProject{
  if(new TextEncoder().encode(text).length>MAX_PROGRAM_FILE_BYTES)throw Error('Program file exceeds 256 KB.');
  let data:unknown;try{data=JSON.parse(text);}catch{throw Error('Choose a valid NexArm program JSON file.');}
  if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Choose a NexArm program file.');
  const file=data as Record<string,unknown>;
  if(file.format==='nexarm-classroom-program'&&file.schemaVersion===3)return copyProject(file);
  return {instructions:loadProgramFile(text),keyEvents:[]};
}
