import {expect,it} from 'vitest';
import {copyInstructions,evaluateProgram} from '../app/src/runtime/ProgramLanguage';
import type {Instruction} from '../app/src/runtime/ProgramLanguage';
import {loadProjectFile,saveProjectFile} from '../app/src/runtime/ProgramFile';
import {TEACHER_HOME} from '../app/src/safety/TeacherControlPlan';

const home:Instruction={kind:'home',blockId:'home'};

it('prepares Home as one simultaneous pose using the established targets and frame time',()=>{
 const prepared=evaluateProgram([home]);
 expect(prepared).toEqual({steps:[{kind:'pose',blockId:'home',positionId:'nexarm-home',name:'Home',positions:[2050,2150,2100,2200,2000,1080],durationMs:1000}],variables:[]});
 const step=prepared.steps[0];if(step?.kind!=='pose')throw Error('Expected pose');step.positions[0]=900;
 expect(evaluateProgram([home]).steps[0]).toMatchObject({positions:[...TEACHER_HOME]});
 expect(copyInstructions([{...home,positions:Array(6).fill(0),durationMs:0,speed:9999}])).toEqual([home]);
});

it('saves Home in startup, key events, repeats, branches and My Blocks without creating saved positions',()=>{
 const project={instructions:[home,{kind:'repeat' as const,blockId:'repeat',count:2,body:[{kind:'if' as const,blockId:'if',branches:[{condition:true,body:[{kind:'home' as const,blockId:'nested'}]}],elseBody:[]}]}],keyEvents:[{blockId:'key',key:'h',body:[{kind:'home' as const,blockId:'event-home'}]}],functions:[{blockId:'fn',name:'Return',body:[{kind:'home' as const,blockId:'fn-home'}]}],positions:[]};
 const loaded=loadProjectFile(saveProjectFile(project));expect(loaded).toEqual(project);
 expect(evaluateProgram(loaded.instructions).steps).toHaveLength(3);
 expect(evaluateProgram([{kind:'call',blockId:'call',name:'Return'}],{functions:loaded.functions}).steps[0]).toMatchObject({positions:[...TEACHER_HOME],blockId:'fn-home'});
});

it('retains movement, time and block-reference limits for repeated Home instructions',()=>{
 const repeated=(body:Instruction[]):Instruction=>({kind:'repeat',blockId:'repeat',count:20,body});
 expect(()=>evaluateProgram([repeated([home,{...home,blockId:'home-2'},{...home,blockId:'home-3'},{...home,blockId:'home-4'}])])).toThrow('60-second');
 expect(()=>copyInstructions([home,home],true)).toThrow('unique');
 expect(()=>copyInstructions([{kind:'home',blockId:''}])).toThrow('nonempty');
});
