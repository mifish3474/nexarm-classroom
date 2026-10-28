import {expect,it} from 'vitest';
import {copyInstructions,evaluateProgram} from '../app/src/runtime/ProgramLanguage';
import type {Instruction} from '../app/src/runtime/ProgramLanguage';
import {loadProjectFile,saveProjectFile} from '../app/src/runtime/ProgramFile';

const note=(blockId:string,text='Explain this step'):Instruction=>({kind:'comment',blockId,text});
const move:Instruction={kind:'move',blockId:'move',servo:1,target:2100};

it('skips comment text without evaluating it, adding motion, or changing variables',()=>{
 const text='<script>throw Error("not code")</script> Joint1 = 9999';
 const instructions:Instruction[]=[note('before',text),{kind:'set',blockId:'set',name:'Joint1',value:2100},{kind:'repeat',blockId:'repeat',count:2,body:[note('inside'),move]},note('after','')];
 expect(evaluateProgram(instructions)).toEqual({steps:[{servo:1,target:2100,blockId:'move'},{servo:1,target:2100,blockId:'move'}],variables:[{name:'Joint1',value:2100}]});
 expect(evaluateProgram([note('only')],{allowNoMotion:true})).toEqual({steps:[],variables:[]});
 expect(()=>evaluateProgram([note('only')])).toThrow('Add a joint move');
});

it('preserves notes in startup, key events, branches and My Blocks through program files',()=>{
 const project={instructions:[note('run','Pick up the cube 🦾'),{kind:'if' as const,blockId:'if',branches:[{condition:true,body:[note('branch')]}],elseBody:[note('else')]}],keyEvents:[{blockId:'key',key:'a',body:[note('event')]}],functions:[{blockId:'fn',name:'Pick up',body:[note('function')]}],positions:[]};
 expect(loadProjectFile(saveProjectFile(project))).toEqual(project);
});

it('validates bounded plain text and retains the existing block-reference checks',()=>{
 for(const text of [null,123,{},'x'.repeat(1001)])expect(()=>copyInstructions([{kind:'comment',blockId:'bad',text}])).toThrow('Comment text');
 expect(copyInstructions([note('max','x'.repeat(1000))])).toEqual([note('max','x'.repeat(1000))]);
 expect(()=>copyInstructions([note('same'),note('same')],true)).toThrow('unique');
});
