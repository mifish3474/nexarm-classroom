import * as Blockly from 'blockly/core';
import {ProgramError} from '../runtime/ProgramLanguage';
import type {Numeric,Condition} from '../runtime/ProgramLanguage';

export function inputBlock(block:Blockly.Block,name:string):Blockly.Block{
  const child=block.getInputTargetBlock(name);
  if(!child)throw new ProgramError(`Fill the ${name.toLowerCase()} input before checking or running.`,block.id);
  if(!child.isEnabled())throw new ProgramError('Remove or enable disabled value blocks.',child.id);
  return child;
}
export function variableLabel(block:Blockly.Block):string{
  const field=block.getField('VAR');
  if(!(field instanceof Blockly.FieldVariable)||!field.getVariable())throw new ProgramError('Choose a variable for this block.',block.id);
  return field.getVariable()!.getName();
}
export function numericBlock(block:Blockly.Block,depth=0):Numeric{
  if(depth>12)throw new ProgramError('Try fewer nested calculations.',block.id);
  const n=(name:string)=>numericBlock(inputBlock(block,name),depth+1);
  switch(block.type){
    case 'math_number':return Number(block.getFieldValue('NUM'));
    case 'variables_get':return {kind:'variable',name:variableLabel(block)};
    case 'math_arithmetic':return {kind:'arithmetic',op:block.getFieldValue('OP'),left:n('A'),right:n('B')};
    case 'math_round':return {kind:'round',op:block.getFieldValue('OP'),value:n('NUM')};
    default:throw new ProgramError('Use a number, numeric variable, or math block in this input.',block.id);
  }
}
export function conditionBlock(block:Blockly.Block,depth=0):Condition{
  if(depth>12)throw new ProgramError('Try fewer nested conditions.',block.id);
  const b=(name:string)=>conditionBlock(inputBlock(block,name),depth+1);
  switch(block.type){
    case 'logic_boolean':return block.getFieldValue('BOOL')==='TRUE';
    case 'logic_compare':return {kind:'compare',op:block.getFieldValue('OP'),left:numericBlock(inputBlock(block,'A')),right:numericBlock(inputBlock(block,'B'))};
    case 'logic_operation':return {kind:'logic',op:block.getFieldValue('OP'),left:b('A'),right:b('B')};
    case 'logic_negate':return {kind:'not',value:b('BOOL')};
    default:throw new ProgramError('Use a comparison or true/false logic block in this input.',block.id);
  }
}
export const milliseconds=(seconds:Numeric):Numeric=>typeof seconds==='number'?seconds*1000:{kind:'arithmetic',op:'MULTIPLY',left:seconds,right:1000};
export const seconds=(ms:Numeric):Numeric=>typeof ms==='number'?ms/1000:ms.kind==='arithmetic'&&ms.op==='MULTIPLY'&&ms.right===1000?ms.left:{kind:'arithmetic',op:'DIVIDE',left:ms,right:1000};

type State=Blockly.serialization.blocks.State;
export function valueState(value:Numeric|Condition,variableId:(name:string)=>string):State{
  const input=(value:Numeric|Condition)=>typeof value==='number'||typeof value==='boolean'?{shadow:valueState(value,variableId)}:{block:valueState(value,variableId)};
  if(typeof value==='number')return {type:'math_number',fields:{NUM:value}};
  if(typeof value==='boolean')return {type:'logic_boolean',fields:{BOOL:value?'TRUE':'FALSE'}};
  switch(value.kind){
    case 'variable':return {type:'variables_get',fields:{VAR:{id:variableId(value.name)}}};
    case 'arithmetic':return {type:'math_arithmetic',fields:{OP:value.op},inputs:{A:input(value.left),B:input(value.right)}};
    case 'round':return {type:'math_round',fields:{OP:value.op},inputs:{NUM:input(value.value)}};
    case 'compare':return {type:'logic_compare',fields:{OP:value.op},inputs:{A:input(value.left),B:input(value.right)}};
    case 'logic':return {type:'logic_operation',fields:{OP:value.op},inputs:{A:input(value.left),B:input(value.right)}};
    case 'not':return {type:'logic_negate',inputs:{BOOL:input(value.value)}};
  }
}
