import {describe,expect,it} from 'vitest';
import {copyVariableValues,evaluateProgram,UninitializedVariableError} from '../app/src/runtime/ProgramLanguage';
import type {Instruction} from '../app/src/runtime/ProgramLanguage';
import {copyProject} from '../app/src/runtime/ProgramProject';
import {saveProjectFile,loadProjectFile} from '../app/src/runtime/ProgramFile';
const variable={kind:'variable',name:'Joint1'} as const;
const startup:Instruction[]=[{kind:'set',blockId:'initial',name:'Joint1',value:2100}];
const increment:Instruction[]=[{kind:'set',blockId:'increment',name:'Joint1',value:{kind:'arithmetic',op:'ADD',left:variable,right:50}},{kind:'move',blockId:'move',servo:1,target:variable}];
describe('shared Run-session variables',()=>{
 it('starts fresh on Run and carries state across independently evaluated event stacks',()=>{
  const first=evaluateProgram(startup,{allowNoMotion:true});
  const a=evaluateProgram(increment,{variables:first.variables});
  const second=evaluateProgram(increment,{variables:a.variables});
  expect(a.steps[0]).toMatchObject({target:2150});expect(second.steps[0]).toMatchObject({target:2200});
  expect(first.variables).toEqual([{name:'Joint1',value:2100}]);
  expect(evaluateProgram(startup,{allowNoMotion:true}).variables).toEqual(first.variables);
 });
 it('shares assignments from one event with other events and My Blocks, case-insensitively',()=>{
  const state=evaluateProgram([{kind:'set',blockId:'a',name:'shared',value:2100}],{allowNoMotion:true});
  const result=evaluateProgram([{kind:'call',blockId:'call',name:'Next'}],{variables:state.variables,functions:[{blockId:'def',name:'Next',body:[{kind:'change',blockId:'change',name:'SHARED',value:50},{kind:'move',blockId:'move',servo:1,target:{kind:'variable',name:'Shared'}}]}]});
  expect(result.steps[0]).toMatchObject({target:2150});expect(result.variables).toEqual([{name:'shared',value:2150}]);
 });
 it('copies bounded state and rejects malformed or ambiguous seeds',()=>{
  const input=[{name:'counter',value:1}],copy=copyVariableValues(input);copy[0]!.value=2;expect(input[0]!.value).toBe(1);
  for(const state of [null,{},[{name:'x',value:NaN}],[{name:'x',value:Infinity}],[{name:'x',value:'1'}],[{name:'X',value:1},{name:'x',value:2}],Array.from({length:33},(_,i)=>({name:`v${i}`,value:0}))])expect(()=>evaluateProgram(startup,{allowNoMotion:true,variables:state})).toThrow();
 });
 it('does not mutate session state when a calculation or expanded plan fails',()=>{
  const variables=[{name:'Joint1',value:4090}];expect(()=>evaluateProgram(increment,{variables})).toThrow('whole-number target');expect(variables).toEqual([{name:'Joint1',value:4090}]);
  expect(()=>evaluateProgram([{kind:'change',blockId:'change',name:'Joint1',value:1},{kind:'wait',blockId:'wait',durationMs:{kind:'arithmetic',op:'DIVIDE',left:1,right:0}}],{variables})).toThrow('divide by zero');expect(variables[0]!.value).toBe(4090);
 });
 it('defers cross-event initialization but still identifies a premature variable read at activation',()=>{
  const project=copyProject({instructions:[],keyEvents:[{blockId:'a',key:'a',body:[{kind:'set',blockId:'set',name:'Joint1',value:2100}]},{blockId:'b',key:'b',body:increment}]});
  expect(project.keyEvents).toHaveLength(2);
  try{evaluateProgram(increment);throw Error('Expected uninitialized variable');}catch(error){expect(error).toBeInstanceOf(UninitializedVariableError);expect((error as UninitializedVariableError).blockId).toBe('increment');}
 });
 it('saves shared-variable projects without embedding runtime state or requiring the events to initialize themselves',()=>{
  const project={instructions:startup,keyEvents:[{blockId:'a',key:'a',body:increment}]};
  const text=saveProjectFile({...project,variables:[{name:'Joint1',value:2800}]} as typeof project);
  expect(JSON.parse(text).variables).toBeUndefined();expect(loadProjectFile(text)).toEqual({...project,positions:[]});
  expect(evaluateProgram(loadProjectFile(text).instructions,{allowNoMotion:true}).variables[0]!.value).toBe(2100);
 });
});
