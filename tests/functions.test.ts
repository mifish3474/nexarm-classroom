import {describe,expect,it} from 'vitest';
import {evaluateProgram,ProgramError} from '../app/src/runtime/ProgramLanguage';
import type {Instruction,FunctionDefinition} from '../app/src/runtime/ProgramLanguage';
import {copyProject,projectFilename,projectName} from '../app/src/runtime/ProgramProject';
import {saveProjectFile,loadProjectFile} from '../app/src/runtime/ProgramFile';
const call=(name:string,blockId='call'):Instruction=>({kind:'call',name,blockId});
const wait=(blockId='wait',durationMs=100):Instruction=>({kind:'wait',blockId,durationMs});
const fn=(name:string,body:Instruction[],blockId='definition'):FunctionDefinition=>({blockId,name,body});

describe('bounded My Blocks',()=>{
 it('calls nested named sequences in order, sharing numeric variables across function bodies',()=>{
  const functions=[fn('Pick up',[{kind:'change',blockId:'increment',name:'COUNT',value:1},call('Pause','nested')]),fn('Pause',[wait()], 'pause-def')];
  const input:Instruction[]=[{kind:'set',blockId:'set',name:'count',value:0},{kind:'repeat',blockId:'repeat',count:2,body:[call('pick UP')]}];
  expect(evaluateProgram(input,{functions})).toEqual({steps:[{kind:'wait',blockId:'wait',durationMs:100},{kind:'wait',blockId:'wait',durationMs:100}],variables:[{name:'count',value:2}]});
 });
 it('does not execute unused definitions, including definitions that read caller-initialized variables',()=>{
  const functions=[fn('Unused',[{kind:'move',blockId:'move',servo:1,target:{kind:'variable',name:'unset'}}])];
  expect(evaluateProgram([wait()],{functions}).steps).toHaveLength(1);
  expect(()=>evaluateProgram([call('Unused')],{functions})).toThrow('Set variable');
 });
 it('rejects missing definitions and direct or indirect recursion even in unselected branches or unused definitions',()=>{
  for(const functions of [[fn('A',[call('A')])],[fn('A',[call('B')]),fn('B',[call('A','back')],'b')]])expect(()=>evaluateProgram([wait()],{functions})).toThrow('recursion');
  expect(()=>evaluateProgram([{kind:'if',blockId:'if',branches:[{condition:false,body:[call('Missing')]}],elseBody:[wait()]}])).toThrow('missing');
  expect(()=>evaluateProgram([wait()],{functions:[fn('Unused',[call('Missing')])]})).toThrow('missing');
 });
 it('bounds nested calls, expanded movement count, total time and calculation-only work',()=>{
  const deep=Array.from({length:13},(_,i)=>fn(`f${i}`,i===12?[wait()]:[call(`f${i+1}`,`c${i}`)],`d${i}`));
  expect(()=>evaluateProgram([call('f0')],{functions:deep})).toThrow('12 nested');
  expect(()=>evaluateProgram([{kind:'repeat',blockId:'r',count:20,body:[call('many')]}],{functions:[fn('many',Array.from({length:6},(_,i)=>wait(`w${i}`)))]})).toThrow('100');
  expect(()=>evaluateProgram([{kind:'repeat',blockId:'r',count:7,body:[call('slow')]}],{functions:[fn('slow',[wait('w',10000)])]})).toThrow('60-second');
  const fanout=Array.from({length:8},(_,i)=>fn(`f${i}`,i===7?[{kind:'set',blockId:'set',name:'x',value:0}]:Array.from({length:4},(_,j)=>call(`f${i+1}`,`c${i}-${j}`)),`d${i}`));
  expect(()=>evaluateProgram([call('f0')],{functions:fanout,allowNoMotion:true})).toThrow('instruction budget');
 });
 it('validates all definitions, unique names, global block references and project variable limits',()=>{
  expect(()=>copyProject({instructions:[],keyEvents:[],functions:[fn('A',[]),fn('a',[],'b')]})).toThrow('unique My Block');
  expect(()=>copyProject({instructions:[wait()],keyEvents:[],functions:[fn('A',[wait()])]})).toThrow('unique across');
  expect(()=>copyProject({instructions:[],keyEvents:[],functions:Array.from({length:17},(_,i)=>fn(`f${i}`,[],`d${i}`))})).toThrow('16');
  const definitions=Array.from({length:2},(_,i)=>fn(`f${i}`,Array.from({length:17},(_,j):Instruction=>({kind:'set',blockId:`s${i}-${j}`,name:`v${i}-${j}`,value:0})),`d${i}`));
  expect(()=>copyProject({instructions:[],keyEvents:[],functions:definitions})).toThrow('32 variables');
  expect(()=>evaluateProgram([wait()],{functions:[fn('Invalid',[{kind:'serialWrite',blockId:'usb'} as unknown as Instruction])]})).toThrow('not supported');
 });
 it('attributes a function-body calculation failure to its original block',()=>{
  try{evaluateProgram([call('Bad')],{functions:[fn('Bad',[{kind:'move',blockId:'bad-target',servo:1,target:{kind:'arithmetic',op:'DIVIDE',left:1,right:0}}])]});throw Error('Expected failure');}
  catch(error){expect(error).toBeInstanceOf(ProgramError);expect((error as ProgramError).blockId).toBe('bad-target');}
 });
 it('round-trips definitions, key calls, names and embedded poses in v4 without executable state',()=>{
  const project={name:'Sorting challenge',instructions:[call('Pickup')],keyEvents:[{blockId:'key',key:'a',body:[call('Pickup','key-call')]}],functions:[fn('Pickup',[{kind:'pose',blockId:'pose',positionId:'p',name:'Pickup',positions:[2050,2150,2100,2200,2000,1080],durationMs:1000}])]};
  const text=saveProjectFile(project);expect(JSON.parse(text).schemaVersion).toBe(4);expect(loadProjectFile(text)).toEqual(project);
  expect(loadProjectFile(saveProjectFile({name:'Old style',instructions:[wait()],keyEvents:[]})).name).toBe('Old style');
 });
});

describe('project file names',()=>{
 it('keeps friendly names and makes usable filenames without paths or reserved device names',()=>{
  expect(projectName('  Sorting challenge  ')).toBe('Sorting challenge');
  expect(projectFilename('Sorting challenge')).toBe('Sorting challenge.json');
  expect(projectFilename('Sorting challenge.json')).toBe('Sorting challenge.json');
  expect(projectFilename('../A:B?*')).toBe('..-A-B--.json');
  expect(projectFilename('CON')).toBe('NexArm-CON.json');
  expect(projectFilename('My program. ')).toBe('My program.json');
  for(const name of ['', 'x'.repeat(61),'bad\nname'])expect(()=>projectName(name)).toThrow('project name');
 });
});
