import './styles.css';
import './workspace.css';
import {setupWorkspace} from './workspace';
import { createEditor } from './blocks/editor';
import { ProgramRunner } from './runtime/ProgramRunner';
import type {PlannedStep,PreparedProgram} from './runtime/instructions';
import { TeacherRobotControl } from './safety/TeacherRobotControl';
import type { TeacherPort } from './safety/TeacherRobotControl';
import {createTeachingPanel} from './poses/TeachingPanel';
import {OPERATING_RANGES,assertPoseTargets,assertJointTarget} from './safety/OperatingRanges';
import {ProgramError} from './runtime/ProgramLanguage';
import {saveProjectFile,loadProjectFile,MAX_PROGRAM_FILE_BYTES} from './runtime/ProgramFile';
import {copyProject} from './runtime/ProgramProject';
import type {KeyHandler} from './runtime/ProgramProject';
import {KeyboardEvents,isKeyboardEditing,keyLabel,isStopKey} from './runtime/KeyboardEvents';
import {programSignal} from './ProgramSignal';



function element<T extends HTMLElement>(id:string):T{
  const node=document.getElementById(id);if(!node)throw Error(`Missing interface element: ${id}`);return node as T;
}
setupWorkspace();
const runner=new ProgramRunner();
const run=element<HTMLButtonElement>('run'),stop=element<HTMLButtonElement>('stop'),lesson=element<HTMLButtonElement>('lesson');
const practice=element<HTMLButtonElement>('practice-lesson');
const status=element('run-status');
let preparing=false,loadingProgram=false,session=0,control:TeacherRobotControl|null=null,interfaceError='';
let spaceHeld=false,stopRequested=false;
let interfaceErrorBlock:string|null=null,reviewMessage='';
let plan:PlannedStep[]=[],rows:HTMLLIElement[]=[];
const robotMode=()=>true;
const teaching=createTeachingPanel(()=>control);
element('operating-ranges').textContent=`Current operating ranges: ${OPERATING_RANGES.map((range,i)=>`J${i+1} ${range.min}–${range.max}`).join('; ')}. J6: 1024 = open. These are operator-provided development ranges; protected student policy comes later.`;
const editor=createEditor(element('blockly-editor'),()=>teaching.list());
const keyEvents=new KeyboardEvents();
let keyHandlers=new Map<string,{handler:KeyHandler;result:PreparedProgram}>(),keyMessage='';
let previousKeyFault=false,previousKeyPhase:string|undefined;
function endKeyEvents(message='Keyboard events stopped. Run program to listen again.'){
  if(keyEvents.active)keyMessage=message;
  keyEvents.stop();keyHandlers.clear();
}
function positionOptions(){
  const select=element<HTMLSelectElement>('program-position'),previous=select.value;select.replaceChildren();
  for(const pose of editor.listPositions()){const option=document.createElement('option');option.value=pose.id;option.textContent=pose.name;select.append(option);}
  if(editor.listPositions().some(pose=>pose.id===previous))select.value=previous;
}
positionOptions();

const cards=Array.from({length:6},(_,index)=>{
  const servo=index+1,card=document.createElement('section');card.className='joint-card';
  const title=document.createElement('h3');title.textContent=`Joint ${servo}`;
  const measured=document.createElement('strong'),target=document.createElement('span');target.className='target';
  card.append(title,measured,target);element('joints').append(card);return {measured,target};
});
function refresh(){
  teaching.refresh(true,preparing||loadingProgram||spaceHeld);
  const robot=control?.snapshot(),live=true;
  if(keyEvents.active){
    if(!robot||robot.connectionState!=='Listening'||robot.manualPhase!=='Normal'||robot.faulted&&!previousKeyFault||robot.program?.phase==='Fault'&&previousKeyPhase!=='Fault'||robot.busy&&robot.operation!=='Program')endKeyEvents();
    previousKeyFault=!!robot?.faulted;previousKeyPhase=robot?.program?.phase;
  }
  const busy=preparing||loadingProgram||robot?.busy;
  run.disabled=spaceHeld||!!busy||(live&&!robot?.canMove);stop.disabled=!(busy||keyEvents.active||(live&&robot?.connectionState==='Listening'));lesson.disabled=practice.disabled=!!busy;
  // Controller reports retain past runs. An explicitly rearmed key-only project
  // must show its current listening state rather than an old Stopped/Fault phase.
  const signal=programSignal({connectionState:robot?.connectionState,faulted:!!robot?.faulted&&!keyEvents.active&&robot.program?.phase!=='Running',
    running:robot?.program?.phase==='Running'||robot?.home?.phase==='Running',keysActive:keyEvents.active,preparing,
    stopped:stopRequested,released:!!robot&&robot.manualPhase!=='Normal'});
  element('signal-tower').dataset.state=signal.state;
  if(element('signal-label').textContent!==signal.label)element('signal-label').textContent=signal.label;
  element<HTMLSelectElement>('program-position').disabled=!!busy||!editor.listPositions().length;
  element<HTMLButtonElement>('add-position').disabled=!!busy||!editor.listPositions().length;
  element<HTMLButtonElement>('add-wait').disabled=!!busy;
  element<HTMLButtonElement>('add-joint').disabled=element<HTMLButtonElement>('add-repeat').disabled=!!busy;
  for(const id of ['add-if','add-set','add-change','add-key-event','logic-lesson','program-check'])element<HTMLButtonElement>(id).disabled=!!busy;
  element<HTMLSelectElement>('program-stack').disabled=!!busy;
  element<HTMLButtonElement>('undo').disabled=!!busy||!editor.workspace.getUndoStack().length;
  element<HTMLButtonElement>('redo').disabled=!!busy||!editor.workspace.getRedoStack().length;
  element<HTMLButtonElement>('new-program').disabled=!!busy;
  element<HTMLButtonElement>('program-save').disabled=!!busy;
  element<HTMLButtonElement>('program-load').disabled=!!busy;
  element('blockly-editor').inert=element('keyboard-fields').inert=!!busy;
  element('robot-controls').hidden=!live;element('mode-label').textContent=live?'Station robot':'Learn / Simulate';
  element<HTMLButtonElement>('robot-connect').disabled=!!robot&&!robot.canConnect;
  element<HTMLButtonElement>('robot-disconnect').disabled=!robot||['Disconnected','Closing'].includes(robot.connectionState);
  element<HTMLButtonElement>('robot-diagnostics').disabled=!control;
  const readiness=robot?.canMove?'Ready. Choose Run or a saved position.':robot?.reason??'Connect the robot.';
  const readinessNode=element('robot-readiness');if(readinessNode.textContent!==readiness)readinessNode.textContent=readiness;

  const technicalStatus=robot?`${robot.connectionState} · ${robot.armed?'Robot enabled':'Robot disabled'} · ${robot.message}`:'Disconnected.';
  if(element('robot-status').textContent!==technicalStatus)element('robot-status').textContent=technicalStatus;
  const state=preparing?'Preparing':loadingProgram?'Loading':!robot?'Disconnected':robot.connectionState!=='Listening'?robot.connectionState:robot.manualPhase!=='Normal'?(robot.manualPhase==='Manual setup'?'Release sent':robot.manualPhase):robot.program?.phase??(robot.canMove?'Ready':'Reading positions');
  element('state').textContent=state;
  if(robot?.stopRelease?.active)element('state').textContent=robot.stopRelease.phase;
  if(live&&robot?.operation==='Saved position'&&robot.connectionState==='Listening'&&robot.manualPhase==='Normal')element('state').textContent=robot.home?.phase??state;
  if(keyEvents.active&&!busy)element('state').textContent='Keys active';
  let activity=preparing?'Checking your program…':loadingProgram?'Loading program for review…':robot?.program?.message??readiness;
  if(!preparing&&!loadingProgram){
    if(!busy&&robot&&!robot.canMove&&!robot.faulted)activity=readiness;
    if(robot?.connectionState==='Disconnected'||!robot)activity='Connect the robot to run your program. You can edit or Check program without connecting.';
    if(robot&&robot.connectionState!=='Listening'&&robot.connectionState!=='Disconnected')activity=robot.message;
    if(live&&robot?.operation==='Saved position')activity=robot.message;
    if(!busy&&reviewMessage&&(!robot||robot.canMove))activity=reviewMessage;
  }
  if(keyEvents.active&&!busy&&robot?.canMove)activity=`Listening for keys: ${[...keyHandlers.keys()].map(keyLabel).join(', ')}. Space or Stop ends keyboard events.`;
  if(interfaceError)activity=interfaceError;
  if(stopRequested&&robot?.connectionState==='Listening')activity=robot.message;
  if(status.textContent!==activity)status.textContent=activity;
  const keyControl=element('keyboard-control');
  const hasKeyStacks=editor.listStacks().some(stack=>stack.name!=='When Run clicked');
  document.querySelector<HTMLElement>('.home-cue')!.textContent=hasKeyStacks?'Key sequences use Home-first checks.':'Run starts from Home.';
  if(!hasKeyStacks&&!keyEvents.active)keyMessage='';
  keyControl.hidden=!keyEvents.active&&!keyMessage&&!hasKeyStacks;
  keyControl.dataset.active=String(keyEvents.active);
  const keyText=keyEvents.active?`${busy?'Sequence running; other event keys are ignored.':'Keyboard events active.'} Keys: ${[...keyHandlers.keys()].map(keyLabel).join(', ')}. Click here for keyboard control. Space or Stop ends listening.`:keyMessage||'Key events are off. Run program to start listening. Space is reserved for Stop. Each event uses Home-first checks.';
  if(element('keyboard-event-status').textContent!==keyText)element('keyboard-event-status').textContent=keyText;
  document.querySelector<HTMLElement>('.workspace-status')!.dataset.fault=String(!!interfaceError||!!robot?.faulted);
  const holding=robot&&robot.manualPhase!=='Normal'?`${robot.manualPhase} · Support the arm. Use Positions to restore holding.`:'';
  if(element('holding-summary').textContent!==holding)element('holding-summary').textContent=holding;
  const positions=robot?.positions;
  cards.forEach((card,index)=>{
    const actual=positions?.[index];card.measured.textContent=actual===undefined?'—':String(actual);
    const command=live?robot?.home?.commands?.find(command=>command.servo===index+1):null;
    card.target.textContent=command&&actual!==undefined?`Target ${command.target} · remaining ${command.target-actual}`:robot?.feedbackFresh?'Live reported position':'Last reported position';
  });
  const activeIndex=robot?.program?.activeStep,active=activeIndex===null||activeIndex===undefined?undefined:plan[activeIndex];
  editor.highlight(interfaceError?interfaceErrorBlock:active?.blockId??null);rows.forEach((row,index)=>row.classList.toggle('active',!!active&&index===activeIndex));
}
function keyboardFields(){
  const stackSelect=element<HTMLSelectElement>('program-stack');stackSelect.replaceChildren();
  for(const stack of editor.listStacks()){const option=document.createElement('option');option.value=stack.id;option.textContent=stack.name;stackSelect.append(option);}
  stackSelect.value=editor.appendTarget();
  const container=element('keyboard-fields');container.replaceChildren();
  const addNumber=(block:import('blockly/core').Block,field:string,labelText:string,min:number,max:number,step:string)=>{
    const label=document.createElement('label');label.textContent=labelText;
    const input=document.createElement('input');input.type='number';input.step=step;input.min=String(min);input.max=String(max);input.value=String(block.getFieldValue(field));
    input.onchange=()=>{if(input.validity.valid&&input.value!=='')block.setFieldValue(input.value,field);};label.append(input);container.append(label);
  };
  editor.workspace.getAllBlocks(true).forEach((block,index)=>{
    const prefix=`Block ${index+1} · `;
    if(block.type==='lesson_pose'){
      const label=document.createElement('label');label.textContent=prefix+'saved position';
      const select=document.createElement('select');select.setAttribute('aria-label',prefix+'saved position');
      const options=editor.listPositions();for(const pose of options){const option=document.createElement('option');option.value=pose.id;option.textContent=pose.name;select.append(option);}
      const current=String(block.getFieldValue('POSITION'));
      if(!options.some(pose=>pose.id===current)){const missing=document.createElement('option');missing.value=current;missing.textContent='Choose a saved position';select.append(missing);}
      select.value=current;select.onchange=()=>block.setFieldValue(select.value,'POSITION');label.append(select);container.append(label);
    }
    if(block.type==='lesson_move')addNumber(block,'SERVO',prefix+'joint',1,6,'1');
    const fields=block.type==='lesson_move'?['TARGET']:block.type==='lesson_repeat'?['COUNT']:['lesson_wait','lesson_pose'].includes(block.type)?['SECONDS']:[];
    for(const field of fields){
      const child=block.getInputTargetBlock(field),label=field==='TARGET'?'target':field==='COUNT'?'repeat count':block.type==='lesson_pose'?'pose duration seconds':'wait seconds';
      if(child?.type==='math_number')addNumber(child,'NUM',prefix+label,field==='TARGET'?0:field==='COUNT'?1:block.type==='lesson_pose'?0.1:0,field==='TARGET'?4095:field==='COUNT'?20:10,field==='SECONDS'?'.1':'1');
      else{const note=document.createElement('p');note.className='note';note.textContent=prefix+label+' uses the connected calculation or variable.';container.append(note);}
    }
    if(block.type==='math_number'&&!['lesson_move','lesson_repeat','lesson_wait','lesson_pose'].includes(block.getParent()?.type??'')){
      const parent=block.getParent(),variable=parent?.getField('VAR')?.getText();
      addNumber(block,'NUM',prefix+(parent?.type==='variables_set'?`set value for ${variable}`:parent?.type==='math_change'?`change amount for ${variable}`:'number'),-Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER,'any');
    }
  });
}

keyboardFields();editor.workspace.addChangeListener(event=>{if(!event.isUiEvent&&!preparing&&!loadingProgram&&control?.snapshot().program?.phase!=='Running'){endKeyEvents('Keyboard events stopped after editing. Run program to listen again.');reviewMessage='';plan=[];rows=[];element('instructions').replaceChildren();element('variable-values').replaceChildren();keyboardFields();refresh();}});
element<HTMLSelectElement>('program-stack').onchange=()=>editor.selectAppendTarget(element<HTMLSelectElement>('program-stack').value);
document.addEventListener('named-positions-changed',()=>{endKeyEvents('Keyboard events stopped after position changes. Run program to listen again.');editor.refreshPositions();positionOptions();keyboardFields();refresh();});
// Stop listening synchronously before an edit, rather than waiting for Blockly's
// deferred change events. Selecting/typing in the editor cannot trigger a robot.
function beginEditing(){if(keyEvents.active){endKeyEvents('Keyboard events stopped for editing. Run program to listen again.');refresh();}}
element('blockly-editor').addEventListener('pointerdown',beginEditing,true);
element('keyboard-fields').addEventListener('change',beginEditing,true);
document.addEventListener('click',event=>{if(event.target instanceof Element&&event.target.closest('#add-block-menu button,.edit-actions button'))beginEditing();},true);
element('add-position').onclick=()=>{try{editor.addPosition(element<HTMLSelectElement>('program-position').value);keyboardFields();}catch(error){interfaceError=error instanceof Error?error.message:'Could not add block.';refresh();}};
element('add-wait').onclick=()=>{try{editor.addWait();keyboardFields();}catch(error){interfaceError=error instanceof Error?error.message:'Could not add block.';refresh();}};
for(const [id,add] of [['add-joint',editor.addJoint],['add-repeat',editor.addRepeat],['add-if',editor.addIf],['add-set',editor.addSet],['add-change',editor.addChange],['add-key-event',editor.addKeyEvent]] as const)element(id).onclick=()=>{
  try{add();interfaceError='';keyboardFields();}catch(error){interfaceError=error instanceof Error?error.message:'Could not add block.';}refresh();
};
element('undo').onclick=()=>{editor.workspace.undo(false);keyboardFields();refresh();};
element('redo').onclick=()=>{editor.workspace.undo(true);keyboardFields();refresh();};
document.addEventListener('add-position-to-code',event=>{
  if(preparing||loadingProgram||control?.snapshot().busy)return;
  try{editor.addPosition((event as CustomEvent<string>).detail);interfaceError='';keyboardFields();refresh();}
  catch(error){interfaceError=error instanceof Error?error.message:'Could not add block.';refresh();}
});
function cancel(stopRobot=true,releaseHolding=false){endKeyEvents();session++;runner.cancel();preparing=loadingProgram=false;if(stopRobot){stopRequested=true;if(releaseHolding)control?.stopThenRelease();else control?.stop();}refresh();}
function validateTargets(result:PreparedProgram){
  for(const step of result.steps){
    try{if(step.kind==='pose')assertPoseTargets(step.positions,`Saved position "${step.name}"`);else if(step.kind!=='wait')assertJointTarget(step.servo,step.target);}
    catch(error){throw new ProgramError(error instanceof Error?error.message:'Invalid target.',step.blockId);}
  }
}
function showPrepared(result:PreparedProgram){
  plan=result.steps;element('instructions').replaceChildren();element('variable-values').replaceChildren();
  rows=plan.map(step=>{const row=document.createElement('li');row.textContent=step.kind==='pose'?`Move to ${step.name}: ${step.positions.join(', ')}`:step.kind==='wait'?`Wait ${step.durationMs/1000} seconds`:`Move robot joint ${step.servo} to ${step.target}`;element('instructions').append(row);return row;});
  for(const variable of result.variables){const value=document.createElement('p');value.textContent=`${variable.name} = ${variable.value}`;element('variable-values').append(value);}
}
async function prepareProgram(execute:boolean){
  if(spaceHeld||preparing||loadingProgram||control?.snapshot().busy)return;
  const ownSession=++session,live=robotMode();
  endKeyEvents();
  try{
    if(execute)stopRequested=false;
    interfaceError='';interfaceErrorBlock=null;reviewMessage='';plan=[];rows=[];element('instructions').replaceChildren();element('variable-values').replaceChildren();
    const project=copyProject(editor.compileProject()),instructions=project.instructions;preparing=true;plan=[];refresh();
    const handlers=new Map<string,{handler:KeyHandler;result:PreparedProgram}>();
    // Validate every enabled key stack before any startup Home/movement write.
    for(const handler of project.keyEvents){
      if(!handler.body.length)continue;
      const result=await runner.prepare(handler.body,true);if(ownSession!==session)return;
      validateTargets(result);handlers.set(handler.key,{handler,result});
    }
    const result=await runner.prepare(instructions,!execute||handlers.size>0);
    if(ownSession!==session||live!==robotMode())return;
    validateTargets(result);preparing=false;showPrepared(result);
    if(execute){
      if(!control||!control.snapshot().canMove)throw Error(control?.snapshot().reason??'Connect the robot first.');
      if(result.steps.length)control.runProgram(instructions);
      if(result.steps.length&&control.snapshot().program?.phase==='Fault')throw new ProgramError(control.snapshot().program?.message??'Startup failed.');
      if(handlers.size){
        keyHandlers=handlers;previousKeyFault=control.snapshot().faulted;previousKeyPhase=control.snapshot().program?.phase;keyEvents.start([...handlers.keys()]);
        keyMessage='';element('keyboard-control').hidden=false;element('keyboard-control').focus({preventScroll:true});
      }
    }
    else{
      for(const [key,binding] of handlers){
        const row=document.createElement('li');row.textContent=`When ${keyLabel(key)} pressed: ${binding.result.steps.length} planned moves/waits (checked, not run).`;element('instructions').append(row);
        for(const variable of binding.result.variables){const value=document.createElement('p');value.textContent=`${keyLabel(key)}: ${variable.name} = ${variable.value}`;element('variable-values').append(value);}
      }
      reviewMessage=`Program checked: ${plan.length} planned moves/waits.${handlers.size?` ${handlers.size} keyboard event stacks also checked; Run starts listening.`:''} Nothing ran.${result.variables.length?' Final variable values are under Program steps and keyboard editing.':''}`;
    }
    refresh();
  }catch(error){if(ownSession!==session)return;endKeyEvents();preparing=false;interfaceError=error instanceof Error?error.message:'Program could not be checked.';interfaceErrorBlock=error instanceof ProgramError?error.blockId:null;refresh();}
}
run.onclick=()=>prepareProgram(true);
element('program-check').onclick=()=>prepareProgram(false);

stop.onclick=()=>cancel(true,true);
lesson.onclick=()=>{interfaceError='';cancel(false);editor.lesson();keyboardFields();refresh();};
practice.onclick=()=>{interfaceError='';cancel(false);editor.teacherLesson();keyboardFields();refresh();};
element('logic-lesson').onclick=()=>{interfaceError='';cancel(false);editor.logicLesson();positionOptions();keyboardFields();refresh();};
element('new-program').onclick=()=>{interfaceError='';cancel(false);editor.newProgram();keyboardFields();refresh();};

const programFile=element<HTMLInputElement>('program-file'),fileStatus=element('program-file-status');
const fileBusy=()=>preparing||loadingProgram||!!control?.snapshot().busy;
element('program-save').onclick=()=>{
  if(fileBusy())return;
  try{
    const text=saveProjectFile(editor.compileProject()),url=URL.createObjectURL(new Blob([text],{type:'application/json'})),link=document.createElement('a');
    link.href=url;link.download='nexarm-program.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    fileStatus.textContent='Program file saved. It includes the positions used by its blocks. Keep it to reload this test later.';
  }catch(error){fileStatus.textContent=error instanceof Error?error.message:'Program could not be saved.';}
};
element('program-load').onclick=()=>{if(!fileBusy()){endKeyEvents();programFile.click();refresh();}};
programFile.onchange=async()=>{
  const file=programFile.files?.[0];programFile.value='';if(!file)return;
  if(fileBusy()){fileStatus.textContent='Finish or Stop the current operation before loading a program.';return;}
  const token=++session;endKeyEvents();loadingProgram=true;runner.cancel();refresh();
  try{
    if(file.size>MAX_PROGRAM_FILE_BYTES)throw Error('Program file exceeds 256 KB.');
    const project=loadProjectFile(await file.text());if(token!==session)return;
    editor.loadProject(project);positionOptions();keyboardFields();plan=[];rows=[];element('instructions').replaceChildren();interfaceError='';
    fileStatus.textContent=project.keyEvents.some(event=>event.key==='unassigned')?'Program loaded for review. Space is reserved for Stop. Choose another key in each "Choose key" event before Check, Run or Save. Its blocks and positions are preserved. Nothing has run.':'Program loaded for review. Included positions are available to its blocks; your saved-position library is unchanged. Nothing has run.';
  }catch(error){if(token===session)fileStatus.textContent=error instanceof Error?error.message:'Program could not be loaded. Existing blocks are unchanged.';}
  finally{if(token===session){loadingProgram=false;refresh();}}
};
element('robot-connect').onclick=()=>{
  try{
    interfaceError='';stopRequested=false;
    if(!robotMode())return;
    const serial=(navigator as Navigator&{serial?:{requestPort():Promise<TeacherPort>}}).serial;
    if(!serial||!navigator.locks)throw Error('Robot mode needs Chrome or Edge with Web Serial on HTTPS or localhost.');
    control??=new TeacherRobotControl(navigator.locks,localStorage,()=>performance.now(),()=>!document.hidden,refresh,{directSession:true});
    control.connect(()=>serial.requestPort());
  }catch(error){interfaceError=error instanceof Error?error.message:'Could not connect.';refresh();}
};
element('robot-disconnect').onclick=()=>{cancel();control?.disconnect();refresh();};
element('robot-diagnostics').onclick=()=>{
  if(!control)return;
  const data=JSON.stringify(control.report(),null,2),url=URL.createObjectURL(new Blob([data],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download='nexarm-robot-diagnostics.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
element('keyboard-control').onclick=()=>element('keyboard-control').focus({preventScroll:true});
window.addEventListener('keydown',event=>{
  if(!event.isTrusted)return;
  const robot=control?.snapshot();
  // A running sequence/listening session must stop even inside a field or menu.
  // Idle text entry retains spaces; Space on a focused button cannot start motion.
  const typing=event.target instanceof Element&&!!event.target.closest('input,textarea,select,[contenteditable],.blocklyWidgetDiv,.blocklyDropDownDiv');
  if(isStopKey(event)&&(spaceHeld||preparing||loadingProgram||robot?.busy||keyEvents.active||robot?.connectionState==='Listening'&&!typing)){
    event.preventDefault();event.stopImmediatePropagation();
    if(!spaceHeld){spaceHeld=true;cancel(true,true);}
    return;
  }
  if(event.target instanceof Element&&event.target.closest('#blockly-editor,#keyboard-fields,.blocklyWidgetDiv,.blocklyDropDownDiv'))beginEditing();
  const key=keyEvents.keydown(event,{canMove:!spaceHeld&&!!robot?.canMove,busy:preparing||loadingProgram||!!robot?.busy,
    editing:isKeyboardEditing(event.target)||!!document.querySelector('dialog[open],.workspace-menu[open]'),visible:!document.hidden&&document.hasFocus()});
  if(!key)return;
  const binding=keyHandlers.get(key);if(!binding)return;
  try{
    interfaceError='';interfaceErrorBlock=null;reviewMessage='';showPrepared(binding.result);
    if(binding.result.steps.length)control!.runProgram(binding.handler.body);
    if(binding.result.steps.length&&control!.snapshot().program?.phase==='Fault')endKeyEvents();
    refresh();
  }catch(error){endKeyEvents();interfaceError=error instanceof Error?error.message:'Key event could not run.';interfaceErrorBlock=error instanceof ProgramError?error.blockId:binding.handler.blockId;refresh();}
},true);
window.addEventListener('keyup',event=>{
  if(!event.isTrusted)return;
  if(isStopKey(event)&&spaceHeld){event.preventDefault();event.stopImmediatePropagation();spaceHeld=false;refresh();return;}
  keyEvents.keyup(event);
},true);
window.addEventListener('blur',()=>{
  spaceHeld=false;
  keyEvents.releaseAll();
  if(control?.snapshot().stopRelease?.active){cancel();return;}
  if(preparing&&editor.listStacks().some(stack=>stack.name!=='When Run clicked')){
    keyMessage='Keyboard preparation canceled when this window lost focus. Run program to listen again.';cancel(false);return;
  }
  if(keyEvents.active){
    endKeyEvents('Keyboard events stopped when this window lost focus. Run program to listen again.');
    if(control?.snapshot().program?.phase==='Running')cancel();else refresh();
  }
});
function leave(){cancel();control?.disconnect();}
document.addEventListener('visibilitychange',()=>{if(document.hidden)leave();});
window.addEventListener('pagehide',leave);window.addEventListener('error',leave);window.addEventListener('unhandledrejection',leave);
setInterval(()=>{if(control){control.tick();refresh();}},50);
refresh();
