import type {SimulationStep} from '../simulation/RobotSimulator';

export const XYZ_REMOVED_MESSAGE='XYZ coordinate blocks are no longer supported. Replace them with joint moves or saved joint positions.';
export type Numeric = number
  | {kind:'variable';name:string}
  | {kind:'arithmetic';op:'ADD'|'MINUS'|'MULTIPLY'|'DIVIDE'|'POWER';left:Numeric;right:Numeric}
  | {kind:'round';op:'ROUND'|'ROUNDUP'|'ROUNDDOWN';value:Numeric};
export type Condition = boolean
  | {kind:'compare';op:'EQ'|'NEQ'|'LT'|'LTE'|'GT'|'GTE';left:Numeric;right:Numeric}
  | {kind:'logic';op:'AND'|'OR';left:Condition;right:Condition}
  | {kind:'not';value:Condition};
export type Instruction =
  | {kind:'move';blockId:string;servo:number;target:Numeric}
  | {kind:'pose';blockId:string;positionId:string;name:string;positions:number[];durationMs?:Numeric}
  | {kind:'wait';blockId:string;durationMs:Numeric}
  | {kind:'repeat';blockId:string;count:Numeric;body:Instruction[]}
  | {kind:'set'|'change';blockId:string;name:string;value:Numeric}
  | {kind:'if';blockId:string;branches:{condition:Condition;body:Instruction[]}[];elseBody:Instruction[]};
export type PlannedStep=SimulationStep&{blockId:string};
export type PreparedProgram={steps:PlannedStep[];variables:{name:string;value:number}[]};
export class ProgramError extends Error {
  constructor(message:string,public readonly blockId:string|null=null){super(message);this.name='ProgramError';}
}
export function variableName(value:unknown):string{
  if(typeof value!=='string'||!value.trim()||value!==value.trim()||value.length>40||/[\u0000-\u001f\u007f]/.test(value))throw Error('Use a variable name with 1–40 characters.');
  return value;
}
function finite(value:number):number{
  if(!Number.isFinite(value)||Math.abs(value)>Number.MAX_SAFE_INTEGER)throw Error('A calculation is not a finite, usable number. Check its inputs.');
  return value;
}
function record(value:unknown):Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid program expression or instruction.');
  return value as Record<string,unknown>;
}
function operation<T extends string>(value:unknown,allowed:readonly T[]):T{
  if(typeof value!=='string'||!allowed.includes(value as T))throw Error('Unsupported calculation or comparison.');
  return value as T;
}

/** Validate and copy ALL branches, including branches that will not execute.
 * Never accept executable source, accessors from files, or a generic evaluator. */
export function copyInstructions(input:unknown,uniqueIds=false):Instruction[]{
  let visits=0;const ids=new Set<string>(),names=new Map<string,string>();
  function budget(depth:number){if(++visits>1000||depth>12)throw Error('Program is too large or deeply nested.');}
  function name(value:unknown){const label=variableName(value),key=label.toLowerCase();if(!names.has(key))names.set(key,label);if(names.size>32)throw Error('Use at most 32 variables.');return names.get(key)!;}
  function numeric(value:unknown,depth:number):Numeric{
    budget(depth);if(typeof value==='number')return finite(value);
    const node=record(value);
    switch(node.kind){
      case 'variable':return {kind:'variable',name:name(node.name)};
      case 'arithmetic':return {kind:'arithmetic',op:operation(node.op,['ADD','MINUS','MULTIPLY','DIVIDE','POWER']),left:numeric(node.left,depth+1),right:numeric(node.right,depth+1)};
      case 'round':return {kind:'round',op:operation(node.op,['ROUND','ROUNDUP','ROUNDDOWN']),value:numeric(node.value,depth+1)};
      default:throw Error('Use a number, numeric variable, or supported math block.');
    }
  }
  function condition(value:unknown,depth:number):Condition{
    budget(depth);if(typeof value==='boolean')return value;
    const node=record(value);
    switch(node.kind){
      case 'compare':return {kind:'compare',op:operation(node.op,['EQ','NEQ','LT','LTE','GT','GTE']),left:numeric(node.left,depth+1),right:numeric(node.right,depth+1)};
      case 'logic':return {kind:'logic',op:operation(node.op,['AND','OR']),left:condition(node.left,depth+1),right:condition(node.right,depth+1)};
      case 'not':return {kind:'not',value:condition(node.value,depth+1)};
      default:throw Error('Use a comparison or true/false logic block for a condition.');
    }
  }
  function duration(value:unknown,depth:number,min:number):Numeric{
    if(typeof value==='number'&&!Number.isFinite(value))throw Error(min?'Pose duration must be 0.1–10 seconds.':'Wait duration must be between 0 and 10 seconds.');
    const result=numeric(value,depth);
    if(typeof result==='number'&&(!Number.isInteger(result)||result<min||result>10000))throw Error(min?'Pose duration must be 0.1–10 seconds.':'Wait must be between 0 and 10 seconds.');
    if(typeof result==='number'&&result%100!==0)throw Error('Program durations must use tenth-second steps.');
    return result;
  }
  function chain(nodes:unknown,depth:number):Instruction[]{
    if(!Array.isArray(nodes)||nodes.length>100||depth>12)throw Error('Program is too large or deeply nested.');
    return nodes.map(value=>{
      let blockId:string|null=null;
      try{
        budget(depth);const node=record(value);
        if(typeof node.blockId!=='string'||!node.blockId||node.blockId.length>200)throw Error('Program block references must be nonempty and valid.');
        blockId=node.blockId;if(uniqueIds&&ids.has(blockId))throw Error('Program block references must be unique and nonempty.');ids.add(blockId);
        switch(node.kind){
          case 'coordinates':throw Error(XYZ_REMOVED_MESSAGE);
          case 'move':{
            const target=numeric(node.target,depth+1);
            if(typeof node.servo!=='number'||!Number.isInteger(node.servo)||node.servo<1||node.servo>6||typeof target==='number'&&(!Number.isInteger(target)||target<0||target>4095))throw Error('Choose a joint from 1–6 and an integer target from 0–4095.');
            return {kind:'move',blockId,servo:node.servo,target};
          }
          case 'pose':{
            if(typeof node.positionId!=='string'||!node.positionId||node.positionId.length>80||typeof node.name!=='string'||!node.name.trim()||node.name.length>40||!Array.isArray(node.positions)||node.positions.length!==6||node.positions.some(n=>typeof n!=='number'||!Number.isInteger(n)||n<0||n>4095))throw Error('Choose an existing saved position with six valid targets.');
            return {kind:'pose',blockId,positionId:node.positionId,name:node.name,positions:[...node.positions] as number[],durationMs:duration(node.durationMs??1000,depth+1,100)};
          }
          case 'wait':return {kind:'wait',blockId,durationMs:duration(node.durationMs,depth+1,0)};
          case 'repeat':{
            const count=numeric(node.count,depth+1);
            if(typeof count==='number'&&(!Number.isInteger(count)||count<1||count>20))throw Error('Repeat must be an integer from 1 to 20.');
            return {kind:'repeat',blockId,count,body:chain(node.body,depth+1)};
          }
          case 'set':case 'change':return {kind:node.kind,blockId,name:name(node.name),value:numeric(node.value,depth+1)};
          case 'if':{
            if(!Array.isArray(node.branches)||!node.branches.length||node.branches.length>20)throw Error('An if block needs 1–20 conditions.');
            return {kind:'if',blockId,branches:node.branches.map(value=>{const branch=record(value);return {condition:condition(branch.condition,depth+1),body:chain(branch.body,depth+1)};}),elseBody:chain(node.elseBody,depth+1)};
          }
          default:throw Error('This block is not supported by the classroom program.');
        }
      }catch(error){if(error instanceof ProgramError)throw error;throw new ProgramError(error instanceof Error?error.message:'Invalid program.',blockId);}
    });
  }
  return chain(input,0);
}

/** Pure bounded preparation. No USB, timers, browser state, or persistent values. */
export function evaluateProgram(input:unknown,options:{allowNoMotion?:boolean}={}):PreparedProgram{
  const instructions=copyInstructions(input),steps:PlannedStep[]=[],variables=new Map<string,number>();let visits=0,durationMs=0;
  function budget(){if(++visits>10000)throw Error('Program exceeded its instruction budget. Try fewer calculations or repeats.');}
  function numeric(value:Numeric):number{
    budget();if(typeof value==='number')return value;
    if(value.kind==='variable'){if(!variables.has(value.name))throw Error(`Set variable "${value.name}" before using it.`);return variables.get(value.name)!;}
    if(value.kind==='round'){const n=numeric(value.value);return finite(value.op==='ROUND'?Math.round(n):value.op==='ROUNDUP'?Math.ceil(n):Math.floor(n));}
    const a=numeric(value.left),b=numeric(value.right);
    if(value.op==='DIVIDE'&&b===0)throw Error('Cannot divide by zero. Change the divisor.');
    return finite(value.op==='ADD'?a+b:value.op==='MINUS'?a-b:value.op==='MULTIPLY'?a*b:value.op==='DIVIDE'?a/b:a**b);
  }
  function condition(value:Condition):boolean{
    budget();if(typeof value==='boolean')return value;
    if(value.kind==='not')return !condition(value.value);
    if(value.kind==='logic')return value.op==='AND'?condition(value.left)&&condition(value.right):condition(value.left)||condition(value.right);
    const a=numeric(value.left),b=numeric(value.right);
    return value.op==='EQ'?a===b:value.op==='NEQ'?a!==b:value.op==='LT'?a<b:value.op==='LTE'?a<=b:value.op==='GT'?a>b:a>=b;
  }
  function duration(value:Numeric,min:number):number{
    const n=numeric(value),rounded=Math.round(n/100)*100;
    if(n<min-1e-6||n>10000+1e-6)throw Error(min?'Pose duration must be 0.1–10 seconds.':'Wait must be between 0 and 10 seconds.');
    // Normalize floating-point noise from e.g. (0.1 + 0.2) seconds, not real offsets.
    if(Math.abs(n-rounded)>1e-6)throw Error('Program durations must use tenth-second steps.');return rounded;
  }
  function push(step:PlannedStep){
    if(steps.length>=100)throw Error('Program exceeds 100 movement steps. Try fewer repeats.');
    durationMs+=step.kind==='wait'?step.durationMs:step.kind==='pose'?(step.durationMs??1000):0;
    if(durationMs>60000)throw Error('Pose durations and waits exceed the 60-second program budget.');
    steps.push(step);
  }
  function walk(nodes:Instruction[]){
    for(const node of nodes){
      try{
        budget();
        switch(node.kind){
          case 'set':variables.set(node.name,numeric(node.value));break;
          case 'change':{
            if(!variables.has(node.name))throw Error(`Set variable "${node.name}" before changing it.`);
            variables.set(node.name,finite(variables.get(node.name)!+numeric(node.value)));break;
          }
          case 'if':{
            let body=node.elseBody;
            for(const branch of node.branches)if(condition(branch.condition)){body=branch.body;break;}
            walk(body);break;
          }
          case 'repeat':{
            const count=numeric(node.count);if(!Number.isInteger(count)||count<1||count>20)throw Error('Repeat must be an integer from 1 to 20.');
            for(let i=0;i<count;i++)walk(node.body);break;
          }
          case 'move':{
            const target=numeric(node.target);if(!Number.isInteger(target)||target<0||target>4095)throw Error(`Joint ${node.servo} needs a whole-number target from 0–4095. Use a rounding block if needed.`);
            push({servo:node.servo as 1|2|3|4|5|6,target,blockId:node.blockId});break;
          }
          case 'wait':push({kind:'wait',durationMs:duration(node.durationMs,0),blockId:node.blockId});break;
          case 'pose':push({...node,durationMs:duration(node.durationMs??1000,100)});break;
        }
      }catch(error){if(error instanceof ProgramError)throw error;throw new ProgramError(error instanceof Error?error.message:'Program could not be prepared.',node.blockId);}
    }
  }
  walk(instructions);
  if(!steps.length&&!options.allowNoMotion)throw new ProgramError('Add a joint move, saved position, or Wait on the selected program path. Use Check program for calculations only.');
  return {steps,variables:[...variables].map(([name,value])=>({name,value}))};
}
