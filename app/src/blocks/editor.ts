import * as Blockly from 'blockly/core';
import * as English from 'blockly/msg/en';
import type { Instruction } from '../runtime/instructions';
import type {NamedPosition} from '../poses/NamedPositions';
import {programInstructions} from '../runtime/ProgramFile';

const messages: Record<string, string> = {};
for (const [key, value] of Object.entries(English)) if (typeof value === 'string') messages[key] = value;
Blockly.setLocale(messages);
Blockly.defineBlocksWithJsonArray([
  { type: 'lesson_start', message0: 'When Run clicked', nextStatement: null, colour: '#086b73', tooltip: 'The program begins here.' },
  { type: 'lesson_move', message0: 'move joint %1 to %2', args0: [
    { type: 'field_dropdown', name: 'SERVO', options: ['1','2','3','4','5','6'].map(id => [id, id]) },
    { type: 'field_number', name: 'TARGET', value: 2128, min: 0, max: 4095, precision: 1 },
  ], previousStatement: null, nextStatement: null, colour: '#2b6fa8', tooltip: 'Raw servo target. Robot targets must fit the current operating range for that joint.' },
  { type: 'lesson_repeat', message0: 'repeat %1 times', args0: [{ type: 'field_number', name: 'COUNT', value: 2, min: 1, max: 20, precision: 1 }], message1: 'do %1', args1: [{ type: 'input_statement', name: 'BODY' }], previousStatement: null, nextStatement: null, colour: '#9b620d', tooltip: 'Run the blocks inside this loop the specified number of times.' },
  { type:'lesson_wait',message0:'wait %1 seconds',args0:[{type:'field_number',name:'SECONDS',value:1,min:0,max:10,precision:.1}],previousStatement:null,nextStatement:null,colour:'#9b620d',tooltip:'Wait before continuing to the next block.' },
]);

export function createEditor(container: HTMLElement,getPositions:()=>NamedPosition[]=()=>[]) {
  let programPositions:NamedPosition[]=[];
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
    this.appendDummyInput().appendField('over').appendField(new Blockly.FieldNumber(1,.1,10,.1),'SECONDS').appendField('seconds');
    this.setPreviousStatement(true);this.setNextStatement(true);this.setColour('#2b6fa8');
    this.setTooltip('Send all six targets and advance when the planned frame time elapses. Exact arrival is not verified. Check the whole sweep is clear.');
  }};
  const workspace = Blockly.inject(container, {
    media: `${import.meta.env.BASE_URL}blockly-media/`, sounds: false,
    grid:{spacing:20,length:1,colour:'#cad7e2',snap:false},
    toolbox: { kind: 'flyoutToolbox', contents: [
      {kind:'label',text:'Motion'},
      { kind: 'block', type: 'lesson_move' }, {kind:'block',type:'lesson_pose'},
      {kind:'label',text:'Control'}, {kind:'block',type:'lesson_wait'}, { kind: 'block', type: 'lesson_repeat' },
    ] },
    trashcan: true, scrollbars: true, zoom: { controls: true, wheel: false, startScale: .85 },
  });
  const lesson = () => {
    workspace.clear();
    Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [{
      type: 'lesson_start', x: 20, y: 24, next: { block: {
        type: 'lesson_move', fields: { SERVO: '1', TARGET: 2128 }, next: { block: {
          type: 'lesson_repeat', fields: { COUNT: 2 }, inputs: { BODY: { block: {
            type: 'lesson_move', fields: { SERVO: '3', TARGET: 2128 }, next: { block: {
              type: 'lesson_move', fields: { SERVO: '3', TARGET: 2048 },
            } },
          } } }, next: { block: { type: 'lesson_move', fields: { SERVO: '1', TARGET: 2048 } } },
        } },
      } },
    }] } }, workspace);
    workspace.getTopBlocks(false)[0]?.setDeletable(false);
    workspace.clearUndo();
  };
  const newProgram=()=>{
    workspace.clear();Blockly.serialization.workspaces.load({blocks:{languageVersion:0,blocks:[{type:'lesson_start',x:20,y:24}]}},workspace);
    workspace.getTopBlocks(false)[0]?.setDeletable(false);workspace.clearUndo();
  };
  newProgram();
  const teacherLesson=()=>{
    workspace.clear();
    Blockly.serialization.workspaces.load({blocks:{languageVersion:0,blocks:[{
      type:'lesson_start',x:20,y:24,next:{block:{type:'lesson_move',fields:{SERVO:'1',TARGET:2130},next:{block:{type:'lesson_move',fields:{SERVO:'1',TARGET:2050}}}}},
    }]}},workspace);
    workspace.getTopBlocks(false)[0]?.setDeletable(false);
    workspace.clearUndo();
  };
  new ResizeObserver(() => Blockly.svgResize(workspace)).observe(container);

  const compile = (): Instruction[] => {
    if (workspace.getAllBlocks(false).length > 100) throw new Error('Use at most 100 blocks.');
    const roots = workspace.getTopBlocks(false);
    if (roots.length !== 1 || roots[0]?.type !== 'lesson_start') throw new Error('Connect all blocks beneath the one When Run clicked block.');
    const chain = (first: Blockly.Block | null, depth: number): Instruction[] => {
      if (depth > 12) throw new Error('Try fewer nested repeats.');
      const nodes: Instruction[] = [];
      for (let block = first; block; block = block.getNextBlock()) {
        if (!block.isEnabled()) throw new Error('Remove or enable disabled blocks before running.');
        if (block.type === 'lesson_move') nodes.push({ kind: 'move', blockId: block.id, servo: Number(block.getFieldValue('SERVO')), target: Number(block.getFieldValue('TARGET')) });
        else if(block.type==='lesson_pose'){
          const pose=allPositions().find(pose=>pose.id===block.getFieldValue('POSITION'));
          if(!pose)throw Error('A saved position is missing. Record it or choose another position in the block.');
          nodes.push({kind:'pose',blockId:block.id,positionId:pose.id,name:pose.name,positions:[...pose.positions],durationMs:Math.round(Number(block.getFieldValue('SECONDS'))*1000)});
        }
        else if(block.type==='lesson_wait')nodes.push({kind:'wait',blockId:block.id,durationMs:Math.round(Number(block.getFieldValue('SECONDS'))*1000)});
        else if (block.type === 'lesson_repeat') nodes.push({ kind: 'repeat', blockId: block.id, count: Number(block.getFieldValue('COUNT')), body: chain(block.getInputTargetBlock('BODY'), depth + 1) });
        else throw new Error('Unsupported lesson block.');
      }
      return nodes;
    };
    return chain(roots[0]!.getNextBlock(), 0);
  };
  const append=(type:string,fields:Record<string,string>={})=>{
    const roots=workspace.getTopBlocks(false);
    if(roots.length!==1||roots[0]?.type!=='lesson_start')throw Error('Connect all blocks beneath When Run clicked first.');
    let last=roots[0];while(last.getNextBlock())last=last.getNextBlock()!;
    Blockly.Events.setGroup(true);
    try{
      const block=workspace.newBlock(type);for(const [name,value] of Object.entries(fields))block.setFieldValue(value,name);
      block.initSvg();block.render();last.nextConnection!.connect(block.previousConnection!);
    }finally{Blockly.Events.setGroup(false);}
  };
  const loadProgram=(input:unknown)=>{
    const instructions=programInstructions(input),previousPositions=programPositions;
    const previous=Blockly.serialization.workspaces.save(workspace),stage=new Blockly.Workspace();
    const loaded:NamedPosition[]=[],poseIds=new Map<string,string>();
    const poseId=(node:Extract<Instruction,{kind:'pose'}>)=>{
      const key=JSON.stringify([node.positionId,node.name,node.positions]);let id=poseIds.get(key);
      if(!id){id=`program-${crypto.randomUUID()}`;poseIds.set(key,id);loaded.push({id,name:node.name,positions:[...node.positions],capturedAt:new Date().toISOString()});}return id;
    };
    const chain=(nodes:Instruction[],connection:Blockly.Connection)=>{
      let last=connection;
      for(const node of nodes){
        const type=node.kind==='move'?'lesson_move':node.kind==='pose'?'lesson_pose':node.kind==='wait'?'lesson_wait':'lesson_repeat';
        if(node.kind==='pose')poseId(node);
        const block=stage.newBlock(type,node.blockId);
        const fields:Record<string,string>=node.kind==='move'?{SERVO:String(node.servo),TARGET:String(node.target)}:
          node.kind==='pose'?{POSITION:poseId(node),SECONDS:String((node.durationMs??1000)/1000)}:
          node.kind==='wait'?{SECONDS:String(node.durationMs/1000)}:{COUNT:String(node.count)};
        for(const [name,value] of Object.entries(fields))block.setFieldValue(value,name);
        last.connect(block.previousConnection!);last=block.nextConnection!;
        if(node.kind==='repeat')chain(node.body,block.getInput('BODY')!.connection!);
      }
    };
    try{
      programPositions=loaded;
      const root=stage.newBlock('lesson_start');root.moveBy(20,24);root.setDeletable(false);chain(instructions,root.nextConnection!);
      Blockly.serialization.workspaces.load(Blockly.serialization.workspaces.save(stage),workspace);
      workspace.getTopBlocks(false)[0]?.setDeletable(false);
      workspace.clearUndo();
    }catch(error){programPositions=previousPositions;Blockly.serialization.workspaces.load(previous,workspace);throw error;}
    finally{stage.dispose();}
  };
  return { workspace, compile, lesson, teacherLesson,loadProgram,listPositions:allPositions,
    refreshPositions:()=>{
      for(const space of [workspace,workspace.getFlyout()?.getWorkspace()])for(const block of space?.getAllBlocks(false)??[]){
        const field=block.getField('POSITION');if(field instanceof Blockly.FieldDropdown)field.getOptions(false);
      }
    },
    newProgram,
    addJoint:()=>append('lesson_move'),addRepeat:()=>append('lesson_repeat'),
    addPosition:(id:string)=>{if(!allPositions().some(pose=>pose.id===id))throw Error('Record or choose a saved position first.');append('lesson_pose',{POSITION:id});},
    addWait:()=>append('lesson_wait'),highlight: (id: string | null) => workspace.highlightBlock(id) };
}
