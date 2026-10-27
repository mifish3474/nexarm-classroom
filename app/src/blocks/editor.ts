import * as Blockly from 'blockly/core';
import * as English from 'blockly/msg/en';
import 'blockly/blocks';
import type {Instruction,Numeric} from '../runtime/instructions';
import {ProgramError} from '../runtime/ProgramLanguage';
import type {NamedPosition} from '../poses/NamedPositions';
import {programInstructions} from '../runtime/ProgramFile';
import {copyProject} from '../runtime/ProgramProject';
import type {ProgramProject} from '../runtime/ProgramProject';
import {KEY_OPTIONS,keyLabel,isEventKey} from '../runtime/KeyboardEvents';
import {inputBlock,numericBlock,conditionBlock,variableLabel,milliseconds,seconds,valueState} from './expressions';

const messages:Record<string,string>={};
for(const [key,value] of Object.entries(English))if(typeof value==='string')messages[key]=value;
Blockly.setLocale(messages);
// Use Blockly's variable editors with numeric-only values in this first phase.
for(const type of ['variables_get','variables_set']){
  const original=Blockly.Blocks[type]!,standard=original.init;
  Blockly.Blocks[type]={...original,init:function(this:Blockly.Block){standard.call(this);if(type==='variables_get')this.setOutput(true,'Number');else this.getInput('VALUE')!.setCheck('Number');}};
}
Blockly.defineBlocksWithJsonArray([
  {type:'lesson_start',message0:'When Run clicked',nextStatement:null,colour:'#086b73',tooltip:'The program begins here.'},
  {type:'lesson_key',message0:'When %1 pressed',args0:[{type:'field_dropdown',name:'KEY',options:KEY_OPTIONS}],nextStatement:null,colour:'#946f12',tooltip:'Run starts listening. One press runs this stack when the robot is idle. Stop ends listening.'},
  {type:'lesson_move',message0:'move joint %1 to %2',args0:[{type:'field_dropdown',name:'SERVO',options:['1','2','3','4','5','6'].map(id=>[id,id])},{type:'input_value',name:'TARGET',check:'Number'}],previousStatement:null,nextStatement:null,colour:'#2b6fa8',tooltip:'A whole-number raw target within this joint’s operating range.'},
  {type:'lesson_repeat',message0:'repeat %1 times',args0:[{type:'input_value',name:'COUNT',check:'Number'}],message1:'do %1',args1:[{type:'input_statement',name:'BODY'}],previousStatement:null,nextStatement:null,colour:'#9b620d',tooltip:'Evaluate the count once, then repeat 1–20 times.'},
  {type:'lesson_wait',message0:'wait %1 seconds',args0:[{type:'input_value',name:'SECONDS',check:'Number'}],previousStatement:null,nextStatement:null,colour:'#9b620d',tooltip:'Wait 0–10 seconds, in tenth-second steps.'},
]);
const numberInput=(value:number)=>({shadow:{type:'math_number',fields:{NUM:value}}});
type State=Blockly.serialization.blocks.State;

export function createEditor(container:HTMLElement,getPositions:()=>NamedPosition[]=()=>[]){
  let programPositions:NamedPosition[]=[];
  let appendTargetId='';
  const allPositions=()=>[...getPositions(),...programPositions];
  Blockly.Blocks['lesson_pose']={init:function(this:Blockly.Block){
    const block=this;
    const field=new Blockly.FieldDropdown(()=>{
      const options:[string,string][]=allPositions().map(pose=>[programPositions.some(p=>p.id===pose.id)?`${pose.name} (program file)`:pose.name,pose.id]);
      const current=block.getFieldValue('POSITION');
      if(current&&current!=='none'&&!options.some(option=>option[1]===current))options.push(['Missing position — choose another',current]);
      return options.length?options:[['Record a position first','none']];
    });
    field.maxDisplayLength=20;
    this.appendDummyInput().appendField('move to position').appendField(field,'POSITION');
    this.appendEndRowInput();
    this.appendValueInput('SECONDS').setCheck('Number').appendField('over');this.appendDummyInput().appendField('seconds');
    this.setInputsInline(true);
    this.setPreviousStatement(true);this.setNextStatement(true);this.setColour('#2b6fa8');
    this.setTooltip('All six targets advance on planned frame time. Exact arrival is not verified. Check the whole sweep.');
  }};
  const workspace=Blockly.inject(container,{
    media:`${import.meta.env.BASE_URL}blockly-media/`,sounds:false,
    grid:{spacing:20,length:1,colour:'#cad7e2',snap:false},
    toolbox:{kind:'categoryToolbox',contents:[
      {kind:'category',name:'Events',colour:'#946f12',contents:[{kind:'block',type:'lesson_key',fields:{KEY:'space'}}]},
      {kind:'category',name:'Motion',colour:'#2b6fa8',contents:[{kind:'block',type:'lesson_move',inputs:{TARGET:numberInput(2128)}},{kind:'block',type:'lesson_pose',inputs:{SECONDS:numberInput(1)}}]},
      {kind:'category',name:'Control',colour:'#9b620d',contents:[{kind:'block',type:'lesson_wait',inputs:{SECONDS:numberInput(1)}},{kind:'block',type:'lesson_repeat',inputs:{COUNT:numberInput(2)}},{kind:'block',type:'controls_if',extraState:{hasElse:true},inputs:{IF0:{shadow:{type:'logic_boolean',fields:{BOOL:'TRUE'}}}}}]},
      {kind:'category',name:'Math',colour:'#5965a5',contents:[{kind:'block',type:'math_number'},{kind:'block',type:'math_arithmetic',inputs:{A:numberInput(0),B:numberInput(0)}},{kind:'block',type:'math_round',inputs:{NUM:numberInput(0)}}]},
      {kind:'category',name:'Logic',colour:'#3d7694',contents:[{kind:'block',type:'logic_compare',inputs:{A:numberInput(0),B:numberInput(0)}},{kind:'block',type:'logic_operation'},{kind:'block',type:'logic_negate'},{kind:'block',type:'logic_boolean'}]},
      {kind:'category',name:'Variables',colour:'#985082',custom:'VARIABLE'},
    ]},
    trashcan:true,scrollbars:true,zoom:{controls:true,wheel:false,startScale:.85},
  });
  new ResizeObserver(()=>Blockly.svgResize(workspace)).observe(container);
  const newProgram=()=>{
    Blockly.serialization.workspaces.load({blocks:{languageVersion:0,blocks:[{type:'lesson_start',x:20,y:24}]}},workspace);
    workspace.getToolbox()?.clearSelection();
    workspace.getTopBlocks(false)[0]?.setDeletable(false);appendTargetId=workspace.getTopBlocks(false)[0]!.id;workspace.clearUndo();
  };
  newProgram();
  const compileProject=():ProgramProject=>{
    if(workspace.getAllBlocks(false).filter(block=>!block.isShadow()).length>100)throw new ProgramError('Use at most 100 blocks, including calculations.');
    if(workspace.getVariableMap().getAllVariables().length>32)throw new ProgramError('Use at most 32 variables.');
    const roots=workspace.getTopBlocks(false);
    const starts=roots.filter(block=>block.type==='lesson_start'),events=roots.filter(block=>block.type==='lesson_key');
    if(starts.length!==1||starts.length+events.length!==roots.length)throw new ProgramError('Connect blocks beneath When Run clicked or a When key pressed event.');
    if(events.length>16)throw new ProgramError('Use at most 16 keyboard event stacks.');
    const keys=new Set<string>();
    for(const event of events){
      const key=event.getFieldValue('KEY');
      if(!event.isEnabled()||!isEventKey(key))throw new ProgramError('Enable the key event and choose a supported key.',event.id);
      if(keys.has(key))throw new ProgramError(`Use one When ${keyLabel(key)} pressed stack. Combine its blocks into one sequence.`,event.id);
      keys.add(key);
    }
    function chain(first:Blockly.Block|null,depth=0):Instruction[]{
      if(depth>12)throw new ProgramError('Try fewer nested repeats or conditions.');
      const nodes:Instruction[]=[];
      for(let block=first;block;block=block.getNextBlock()){
        if(!block.isEnabled())throw new ProgramError('Remove or enable disabled blocks before running.',block.id);
        const blockId=block.id,n=(name:string)=>numericBlock(inputBlock(block!,name));
        switch(block.type){
          case 'lesson_move':nodes.push({kind:'move',blockId,servo:Number(block.getFieldValue('SERVO')),target:n('TARGET')});break;
          case 'lesson_wait':nodes.push({kind:'wait',blockId,durationMs:milliseconds(n('SECONDS'))});break;
          case 'lesson_repeat':nodes.push({kind:'repeat',blockId,count:n('COUNT'),body:chain(block.getInputTargetBlock('BODY'),depth+1)});break;
          case 'lesson_pose':{
            const pose=allPositions().find(pose=>pose.id===block!.getFieldValue('POSITION'));
            if(!pose)throw new ProgramError('A saved position is missing. Record it or choose another position in the block.',blockId);
            nodes.push({kind:'pose',blockId,positionId:pose.id,name:pose.name,positions:[...pose.positions],durationMs:milliseconds(n('SECONDS'))});break;
          }
          case 'variables_set':case 'math_change':nodes.push({kind:block.type==='variables_set'?'set':'change',blockId,name:variableLabel(block),value:n(block.type==='variables_set'?'VALUE':'DELTA')});break;
          case 'controls_if':{
            const branches=[];
            for(let i=0;block.getInput(`IF${i}`);i++)branches.push({condition:conditionBlock(inputBlock(block,`IF${i}`)),body:chain(block.getInputTargetBlock(`DO${i}`),depth+1)});
            nodes.push({kind:'if',blockId,branches,elseBody:chain(block.getInputTargetBlock('ELSE'),depth+1)});break;
          }
          default:throw new ProgramError('This block is not supported in a classroom program.',blockId);
        }
      }
      return nodes;
    }
    return {instructions:chain(starts[0]!.getNextBlock()),keyEvents:events.map(event=>({blockId:event.id,key:String(event.getFieldValue('KEY')),body:chain(event.getNextBlock())}))};
  };
  const append=(type:string,fields:State['fields']={},inputs:State['inputs']={},extraState?:unknown)=>{
    const roots=workspace.getTopBlocks(false);
    const selected=roots.find(block=>block.id===appendTargetId&&['lesson_start','lesson_key'].includes(block.type))??roots.find(block=>block.type==='lesson_start');
    if(!selected)throw new ProgramError('Choose a When Run clicked or key-event stack first.');
    let last=selected;while(last.getNextBlock())last=last.getNextBlock()!;
    Blockly.Events.setGroup(true);
    try{
      const state:State={type,fields,inputs};if(extraState)state.extraState=extraState;
      const block=Blockly.serialization.blocks.append(state,workspace,{recordUndo:true});last.nextConnection!.connect(block.previousConnection!);
    }finally{Blockly.Events.setGroup(false);}
  };
  const loadProject=(input:ProgramProject)=>{
    const project=copyProject(input),instructions=project.instructions,previousPositions=programPositions;
    const previous=Blockly.serialization.workspaces.save(workspace),stage=new Blockly.Workspace();
    const loaded:NamedPosition[]=[],poseIds=new Map<string,string>();
    const poseId=(node:Extract<Instruction,{kind:'pose'}>)=>{
      const key=JSON.stringify([node.positionId,node.name,node.positions]);let id=poseIds.get(key);
      if(!id){id=`program-${crypto.randomUUID()}`;poseIds.set(key,id);loaded.push({id,name:node.name,positions:[...node.positions],capturedAt:new Date().toISOString()});}return id;
    };
    const variableId=(name:string)=>(stage.getVariableMap().getVariable(name)??stage.getVariableMap().createVariable(name)).getId();
    const value=(n:Numeric)=>typeof n==='number'?{shadow:valueState(n,variableId)}:{block:valueState(n,variableId)};
    function chain(nodes:Instruction[]):State|undefined{
      let next:State|undefined;
      for(const node of [...nodes].reverse()){
        let state:State;
        switch(node.kind){
          case 'move':state={type:'lesson_move',fields:{SERVO:String(node.servo)},inputs:{TARGET:value(node.target)}};break;
          case 'pose':state={type:'lesson_pose',fields:{POSITION:poseId(node)},inputs:{SECONDS:value(seconds(node.durationMs??1000))}};break;
          case 'wait':state={type:'lesson_wait',inputs:{SECONDS:value(seconds(node.durationMs))}};break;
          case 'repeat':{const body=chain(node.body);state={type:'lesson_repeat',inputs:{COUNT:value(node.count),...(body?{BODY:{block:body}}:{})}};break;}
          case 'set':case 'change':state={type:node.kind==='set'?'variables_set':'math_change',fields:{VAR:{id:variableId(node.name)}},inputs:{[node.kind==='set'?'VALUE':'DELTA']:value(node.value)}};break;
          case 'if':{
            const inputs:NonNullable<State['inputs']>={};
            node.branches.forEach((branch,i)=>{inputs[`IF${i}`]={block:valueState(branch.condition,variableId)};const body=chain(branch.body);if(body)inputs[`DO${i}`]={block:body};});
            const otherwise=chain(node.elseBody);if(otherwise)inputs.ELSE={block:otherwise};
            state={type:'controls_if',extraState:{elseIfCount:node.branches.length-1,hasElse:true},inputs};break;
          }
        }
        state.id=node.blockId;if(next)state.next={block:next};next=state;
      }
      return next;
    }
    try{
      programPositions=loaded;const next=chain(instructions);
      const root:State={type:'lesson_start',x:20,y:24,deletable:false,...(next?{next:{block:next}}:{})};
      Blockly.serialization.blocks.append(root,stage);
      project.keyEvents.forEach((event,i)=>{
        const next=chain(event.body),state:State={type:'lesson_key',id:event.blockId,fields:{KEY:event.key},x:20+((i+1)%2)*300,y:24+Math.floor((i+1)/2)*260,...(next?{next:{block:next}}:{})};
        Blockly.serialization.blocks.append(state,stage);
      });
      Blockly.serialization.workspaces.load(Blockly.serialization.workspaces.save(stage),workspace);
      workspace.getToolbox()?.clearSelection();
      const start=workspace.getTopBlocks(false).find(block=>block.type==='lesson_start')!;start.setDeletable(false);appendTargetId=start.id;workspace.clearUndo();
    }catch(error){programPositions=previousPositions;Blockly.serialization.workspaces.load(previous,workspace);throw error;}
    finally{stage.dispose();}
  };
  const loadProgram=(input:unknown)=>loadProject({instructions:programInstructions(input),keyEvents:[]});
  const teacherLesson=()=>loadProgram([{kind:'move',blockId:'practice-out',servo:1,target:2130},{kind:'move',blockId:'practice-back',servo:1,target:2050}]);
  const lesson=()=>loadProgram([{kind:'move',blockId:'lesson-out',servo:1,target:2128},{kind:'repeat',blockId:'lesson-repeat',count:2,body:[{kind:'move',blockId:'lesson-j3-out',servo:3,target:2128},{kind:'move',blockId:'lesson-j3-back',servo:3,target:2048}]},{kind:'move',blockId:'lesson-back',servo:1,target:2048}]);
  const logicLesson=()=>loadProgram([
    {kind:'set',blockId:'counter-start',name:'counter',value:0},{kind:'set',blockId:'cycles-start',name:'cycles',value:3},
    {kind:'repeat',blockId:'cycles-repeat',count:{kind:'variable',name:'cycles'},body:[
      {kind:'if',blockId:'counter-choice',branches:[{condition:{kind:'compare',op:'LT',left:{kind:'variable',name:'counter'},right:2},body:[{kind:'wait',blockId:'short-wait',durationMs:200}]}],elseBody:[{kind:'wait',blockId:'long-wait',durationMs:400}]},
      {kind:'change',blockId:'counter-next',name:'counter',value:1},
    ]},
  ]);
  const addVariable=(type:'variables_set'|'math_change')=>{
    const variable=workspace.getVariableMap().getAllVariables()[0]??workspace.getVariableMap().createVariable('counter');
    append(type,{VAR:{id:variable.getId()}},type==='variables_set'?{VALUE:numberInput(0)}:{DELTA:numberInput(1)});
  };
  const addKeyEvent=()=>{
    const events=workspace.getTopBlocks(false).filter(block=>block.type==='lesson_key');
    if(events.length>=16)throw new ProgramError('Use at most 16 keyboard event stacks.');
    const index=events.length+1;
    Blockly.Events.setGroup(true);
    try{const block=Blockly.serialization.blocks.append({type:'lesson_key',fields:{KEY:'space'},x:20+(index%2)*300,y:24+Math.floor(index/2)*260},workspace,{recordUndo:true});appendTargetId=block.id;}
    finally{Blockly.Events.setGroup(false);}
  };
  const listStacks=()=>workspace.getTopBlocks(false).filter(block=>['lesson_start','lesson_key'].includes(block.type)).map(block=>({id:block.id,name:block.type==='lesson_start'?'When Run clicked':`When ${keyLabel(String(block.getFieldValue('KEY')))} pressed`}));
  return {workspace,compile:()=>compileProject().instructions,compileProject,lesson,teacherLesson,logicLesson,loadProgram,loadProject,newProgram,listPositions:allPositions,addKeyEvent,listStacks,
    appendTarget:()=>listStacks().some(stack=>stack.id===appendTargetId)?appendTargetId:listStacks().find(stack=>stack.name==='When Run clicked')?.id??'',
    selectAppendTarget:(id:string)=>{if(!listStacks().some(stack=>stack.id===id))throw new ProgramError('Choose a program stack.');appendTargetId=id;},
    refreshPositions:()=>{
      for(const space of [workspace,workspace.getFlyout()?.getWorkspace()])for(const block of space?.getAllBlocks(false)??[]){const field=block.getField('POSITION');if(field instanceof Blockly.FieldDropdown)field.getOptions(false);}
    },
    addJoint:()=>append('lesson_move',{}, {TARGET:numberInput(2128)}),
    addWait:()=>append('lesson_wait',{}, {SECONDS:numberInput(1)}),
    addRepeat:()=>append('lesson_repeat',{}, {COUNT:numberInput(2)}),
    addIf:()=>append('controls_if',{}, {IF0:{shadow:{type:'logic_boolean',fields:{BOOL:'TRUE'}}}}, {hasElse:true}),
    addSet:()=>addVariable('variables_set'),addChange:()=>addVariable('math_change'),
    addPosition:(id:string)=>{if(!allPositions().some(pose=>pose.id===id))throw new ProgramError('Record or choose a saved position first.');append('lesson_pose',{POSITION:id},{SECONDS:numberInput(1)});},
    highlight:(id:string|null)=>workspace.highlightBlock(id),
  };
}
