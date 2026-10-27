import {interpret} from './instructions';
import type {Instruction} from './instructions';

export const MAX_PROGRAM_FILE_BYTES=256*1024;

// Data-only, bounded instructions. Files cannot supply Blockly block definitions,
// executable code, connection state, servo holding state, or a safety policy.
export function programInstructions(input:unknown):Instruction[]{
  if(!Array.isArray(input))throw Error('The program must contain a list of blocks.');
  if(input.length)interpret(input);
  const ids=new Set<string>();
  const copy=(nodes:unknown[]):Instruction[]=>nodes.map(value=>{
    const node=value as Instruction;
    if(!node.blockId||ids.has(node.blockId))throw Error('Program block references must be unique and nonempty.');
    ids.add(node.blockId);
    if((node.kind==='wait'||node.kind==='pose')&&((node.durationMs??1000)%100!==0))throw Error('Program durations must use tenth-second steps.');
    switch(node.kind){
      case 'move':return {kind:node.kind,blockId:node.blockId,servo:node.servo,target:node.target};
      case 'pose':return {kind:node.kind,blockId:node.blockId,positionId:node.positionId,name:node.name,positions:[...node.positions],durationMs:node.durationMs??1000};
      case 'wait':return {kind:node.kind,blockId:node.blockId,durationMs:node.durationMs};
      case 'repeat':return {kind:node.kind,blockId:node.blockId,count:node.count,body:copy(node.body)};
    }
  });
  return copy(input);
}

export function saveProgramFile(instructions:unknown):string{
  const text=JSON.stringify({format:'nexarm-classroom-program',schemaVersion:1,instructions:programInstructions(instructions)},null,2);
  if(new TextEncoder().encode(text).length>MAX_PROGRAM_FILE_BYTES)throw Error('Program file exceeds 256 KB.');
  return text;
}

export function loadProgramFile(text:string):Instruction[]{
  if(new TextEncoder().encode(text).length>MAX_PROGRAM_FILE_BYTES)throw Error('Program file exceeds 256 KB.');
  let data:unknown;try{data=JSON.parse(text);}catch{throw Error('Choose a valid NexArm program JSON file.');}
  if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Choose a NexArm program file.');
  const file=data as Record<string,unknown>;
  if(file.format!=='nexarm-classroom-program'||file.schemaVersion!==1)throw Error('This program file format or version is not supported.');
  return programInstructions(file.instructions);
}
