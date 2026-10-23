import * as Blockly from 'blockly/core';
import * as English from 'blockly/msg/en';
import type { Instruction } from '../runtime/instructions';
import type {NamedPosition} from '../poses/NamedPositions';

const messages: Record<string, string> = {};
for (const [key, value] of Object.entries(English)) if (typeof value === 'string') messages[key] = value;
Blockly.setLocale(messages);
Blockly.defineBlocksWithJsonArray([
  { type: 'lesson_start', message0: 'When Run clicked', nextStatement: null, colour: 175, tooltip: 'The program begins here.' },
  { type: 'lesson_move', message0: 'move joint %1 to %2', args0: [
    { type: 'field_dropdown', name: 'SERVO', options: ['1','2','3','4','5','6'].map(id => [id, id]) },
    { type: 'field_number', name: 'TARGET', value: 2128, min: 0, max: 4095, precision: 1 },
  ], previousStatement: null, nextStatement: null, colour: 205, tooltip: 'Raw target for simulation or development testing. Mechanical limits are not enforced in this build.' },
  { type: 'lesson_repeat', message0: 'repeat %1 times', args0: [{ type: 'field_number', name: 'COUNT', value: 2, min: 1, max: 20, precision: 1 }], message1: 'do %1', args1: [{ type: 'input_statement', name: 'BODY' }], previousStatement: null, nextStatement: null, colour: 35, tooltip: 'Run the blocks inside this loop the specified number of times.' },
  { type:'lesson_wait',message0:'wait %1 seconds',args0:[{type:'field_number',name:'SECONDS',value:1,min:0,max:10,precision:.1}],previousStatement:null,nextStatement:null,colour:35,tooltip:'Wait before continuing to the next block.' },
]);

export function createEditor(container: HTMLElement,getPositions:()=>NamedPosition[]=()=>[]) {
  Blockly.Blocks['lesson_pose']={init:function(this:Blockly.Block){
    const block=this;
    const field=new Blockly.FieldDropdown(()=>{
      const options:[string,string][]=getPositions().map(pose=>[pose.name,pose.id]);
      const current=block.getFieldValue('POSITION');
      if(current&&current!=='none'&&!options.some(option=>option[1]===current))options.push(['Missing position — choose another',current]);
      return options.length?options:[['Record a position first','none']];
    });
    this.appendDummyInput().appendField('move to saved position').appendField(field,'POSITION');
    this.appendDummyInput().appendField('over').appendField(new Blockly.FieldNumber(1,.1,10,.1),'SECONDS').appendField('seconds');
    this.setPreviousStatement(true);this.setNextStatement(true);this.setColour(205);
    this.setTooltip('Move all needed joints together, then wait for measured settling before continuing. Check the whole sweep is clear.');
  }};
  const workspace = Blockly.inject(container, {
    media: `${import.meta.env.BASE_URL}blockly-media/`, sounds: false,
    toolbox: { kind: 'flyoutToolbox', contents: [
      { kind: 'block', type: 'lesson_move' }, {kind:'block',type:'lesson_pose'}, {kind:'block',type:'lesson_wait'}, { kind: 'block', type: 'lesson_repeat' },
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
  };
  lesson();
  const teacherLesson=()=>{
    workspace.clear();
    Blockly.serialization.workspaces.load({blocks:{languageVersion:0,blocks:[{
      type:'lesson_start',x:20,y:24,next:{block:{type:'lesson_move',fields:{SERVO:'1',TARGET:2130},next:{block:{type:'lesson_move',fields:{SERVO:'1',TARGET:2050}}}}},
    }]}},workspace);
    workspace.getTopBlocks(false)[0]?.setDeletable(false);
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
          const pose=getPositions().find(pose=>pose.id===block.getFieldValue('POSITION'));
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
    const block=workspace.newBlock(type);for(const [name,value] of Object.entries(fields))block.setFieldValue(value,name);
    block.initSvg();block.render();last.nextConnection!.connect(block.previousConnection!);
  };
  return { workspace, compile, lesson, teacherLesson,
    refreshPositions:()=>{
      for(const space of [workspace,workspace.getFlyout()?.getWorkspace()])for(const block of space?.getAllBlocks(false)??[]){
        const field=block.getField('POSITION');if(field instanceof Blockly.FieldDropdown)field.getOptions(false);
      }
    },
    newProgram:()=>{
      workspace.clear();Blockly.serialization.workspaces.load({blocks:{languageVersion:0,blocks:[{type:'lesson_start',x:20,y:24}]}},workspace);
      workspace.getTopBlocks(false)[0]?.setDeletable(false);
    },
    addPosition:(id:string)=>{if(!getPositions().some(pose=>pose.id===id))throw Error('Record or choose a saved position first.');append('lesson_pose',{POSITION:id});},
    addWait:()=>append('lesson_wait'),highlight: (id: string | null) => workspace.highlightBlock(id) };
}
