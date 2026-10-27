import {describe,it,expect} from 'vitest';
import {evaluateProgram,ProgramError,copyInstructions} from '../app/src/runtime/ProgramLanguage';
import {saveProgramFile,loadProgramFile} from '../app/src/runtime/ProgramFile';
import type {Instruction,Numeric,Condition} from '../app/src/runtime/ProgramLanguage';
const variable=(name:string):Numeric=>({kind:'variable',name});
const arithmetic=(op:'ADD'|'MINUS'|'MULTIPLY'|'DIVIDE'|'POWER',left:Numeric,right:Numeric):Numeric=>({kind:'arithmetic',op,left,right});
const set=(name:string,value:Numeric):Instruction=>({kind:'set',blockId:`set-${name}`,name,value});
const wait=(durationMs:Numeric=100):Instruction=>({kind:'wait',blockId:'pause',durationMs});
const move=(target:Numeric):Instruction=>({kind:'move',blockId:'move',servo:1,target});
const choose=(condition:Condition,yes:Instruction[]=[],no:Instruction[]=[]):Instruction=>({kind:'if',blockId:'choice',branches:[{condition,body:yes}],elseBody:no});

describe('numeric variables and conditions',()=>{
  it('checks and saves calculation-only programs, while execution still requires an action',()=>{
    const input=[set('answer',arithmetic('ADD',20,22))];
    expect(evaluateProgram(input,{allowNoMotion:true})).toEqual({steps:[],variables:[{name:'answer',value:42}]});
    expect(loadProgramFile(saveProgramFile(input))).toEqual(input);
    expect(()=>evaluateProgram(input)).toThrow('Check program');
  });
  it('evaluates assignments, changes and branch choices in loop order, then resets on the next preparation',()=>{
    const input:Instruction[]=[set('counter',0),set('cycles',3),{kind:'repeat',blockId:'repeat',count:variable('cycles'),body:[
      choose({kind:'compare',op:'LT',left:variable('counter'),right:2},[move(arithmetic('ADD',2050,variable('counter')))],[wait(200)]),
      {kind:'change',blockId:'change',name:'counter',value:1},
    ]}];
    const expected={steps:[{blockId:'move',servo:1,target:2050},{blockId:'move',servo:1,target:2051},{kind:'wait',blockId:'pause',durationMs:200}],variables:[{name:'counter',value:3},{name:'cycles',value:3}]};
    expect(evaluateProgram(input)).toEqual(expected);expect(evaluateProgram(input)).toEqual(expected);
    expect(()=>evaluateProgram([move(variable('counter'))])).toThrow('Set variable "counter"');
  });
  it('takes a repeat count once on entry even when that variable changes inside it',()=>{
    const input:Instruction[]=[set('count',2),{kind:'repeat',blockId:'r',count:variable('count'),body:[{kind:'change',blockId:'c',name:'count',value:1},wait()]}];
    expect(evaluateProgram(input)).toMatchObject({steps:[{kind:'wait'},{kind:'wait'}],variables:[{name:'count',value:4}]});
  });
  it.each(['EQ','NEQ','LT','LTE','GT','GTE'] as const)('supports numeric comparison %s',op=>{
    const result=evaluateProgram([choose({kind:'compare',op,left:2,right:3},[wait(100)],[wait(200)])]);
    expect(result.steps[0]).toMatchObject({durationMs:['NEQ','LT','LTE'].includes(op)?100:200});
  });
  it('supports elseif priority, else, NOT, and short-circuit AND/OR without evaluating an unused value',()=>{
    const invalid:Condition={kind:'compare',op:'EQ',left:variable('unset'),right:0};
    expect(evaluateProgram([choose({kind:'logic',op:'AND',left:false,right:invalid},[wait(100)],[wait(200)])]).steps[0]).toMatchObject({durationMs:200});
    expect(evaluateProgram([choose({kind:'logic',op:'OR',left:true,right:invalid},[wait()])]).steps).toHaveLength(1);
    expect(evaluateProgram([{kind:'if',blockId:'if',branches:[{condition:false,body:[]},{condition:{kind:'not',value:false},body:[wait(300)]},{condition:true,body:[wait(400)]}],elseBody:[wait(500)]}]).steps[0]).toMatchObject({durationMs:300});
  });
  it('uses numeric-only variables and Blockly-compatible case-insensitive names, safely including object-property names',()=>{
    expect(evaluateProgram([set('Count',1),{kind:'change',blockId:'c',name:'COUNT',value:2},move(arithmetic('ADD',2050,variable('count')))])).toMatchObject({steps:[{target:2053}],variables:[{name:'Count',value:3}]});
    expect(evaluateProgram([set('__proto__',2100),move(variable('__proto__'))]).steps[0]).toMatchObject({target:2100});
    expect(()=>evaluateProgram([{...set('x',0),value:true},wait()])).toThrow();
    expect(()=>evaluateProgram([{kind:'change',blockId:'c',name:'unset',value:1},wait()])).toThrow('before changing');
  });
  it('allows computation in targets and durations, rounding, and floating-point noise in tenth-second waits',()=>{
    const result=evaluateProgram([set('pause',arithmetic('ADD',.1,.2)),move({kind:'round',op:'ROUNDUP',value:arithmetic('DIVIDE',4201,2)}),wait(arithmetic('MULTIPLY',variable('pause'),1000))]);
    expect(result.steps).toEqual([{blockId:'move',servo:1,target:2101},{kind:'wait',blockId:'pause',durationMs:300}]);
    expect(()=>evaluateProgram([wait(arithmetic('MULTIPLY',.25,1000))])).toThrow('tenth-second');
    expect(()=>evaluateProgram([move(arithmetic('DIVIDE',4201,2))])).toThrow('whole-number');
  });
  it('identifies the failing block for divide-by-zero, nonfinite calculations and invalid computed counts',()=>{
    for(const input of [[move(arithmetic('DIVIDE',1,0))],[move(arithmetic('POWER',10,1000))],[{kind:'repeat',blockId:'bad-repeat',count:arithmetic('ADD',20,1),body:[wait()]}]]){
      try{evaluateProgram(input);throw Error('Expected rejection');}catch(error){expect(error).toBeInstanceOf(ProgramError);expect((error as ProgramError).blockId).toBeTruthy();}
    }
  });
  it('validates every branch structurally, including retired XYZ, unknown expressions and bad input types',()=>{
    for(const bad of [{kind:'coordinates',blockId:'xyz'},{kind:'serialWrite',blockId:'usb'},move({kind:'execute',source:'alert(1)'} as unknown as Numeric)])expect(()=>evaluateProgram([choose(true,[wait()],[bad as Instruction])])).toThrow();
    expect(()=>evaluateProgram([choose(1 as unknown as Condition,[wait()])])).toThrow('expression');
    expect(()=>evaluateProgram([move({kind:'variable',name:'x'.repeat(41)})])).toThrow('variable name');
    expect(()=>evaluateProgram([...Array.from({length:33},(_,i)=>set(`v${i}`,i)),wait()])).toThrow('32 variables');
  });
  it('bounds execution of calculation-only nested loops and rejects cyclic expressions without stack overflow',()=>{
    let body:Instruction[]=[{kind:'change',blockId:'c',name:'x',value:1}];
    for(let i=0;i<4;i++)body=[{kind:'repeat',blockId:`r${i}`,count:20,body}];
    expect(()=>evaluateProgram([set('x',0),...body,wait()])).toThrow('instruction budget');
    const cycle={kind:'round',op:'ROUND',value:0} as Numeric&{value:unknown};cycle.value=cycle;
    expect(()=>evaluateProgram([move(cycle)])).toThrow('deeply nested');
  });
  it('preserves expressions, all branches and used variables through v2 files and still loads v1 files',()=>{
    const input=[set('target',arithmetic('ADD',2050,20)),choose(true,[move(variable('target'))],[wait(300)])];
    const text=saveProgramFile(input);expect(JSON.parse(text).schemaVersion).toBe(2);expect(loadProgramFile(text)).toEqual(input);
    expect(loadProgramFile(JSON.stringify({format:'nexarm-classroom-program',schemaVersion:1,instructions:[move(2050)]}))).toEqual([move(2050)]);
    const safe=copyInstructions([{...move(2050),sourceCode:'fetch("remote")',stationLimits:{bypass:true}}]);expect(safe).toEqual([move(2050)]);
  });
});
