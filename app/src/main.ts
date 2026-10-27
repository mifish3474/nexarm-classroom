import './styles.css';
import { createEditor } from './blocks/editor';
import { ProgramRunner } from './runtime/ProgramRunner';
import type { PlannedStep } from './runtime/instructions';
import { TeacherRobotControl } from './safety/TeacherRobotControl';
import type { TeacherPort } from './safety/TeacherRobotControl';
import {createTeachingPanel} from './poses/TeachingPanel';
import {OPERATING_RANGES} from './safety/OperatingRanges';
import {createReportedCoordinatesPanel} from './robot/ReportedCoordinatesPanel';
import {COORDINATE_FIELDS} from './protocol/CoordinateTarget';
import {saveProgramFile,loadProgramFile,MAX_PROGRAM_FILE_BYTES} from './runtime/ProgramFile';



function element<T extends HTMLElement>(id:string):T{
  const node=document.getElementById(id);if(!node)throw Error(`Missing interface element: ${id}`);return node as T;
}
const runner=new ProgramRunner();
const run=element<HTMLButtonElement>('run'),stop=element<HTMLButtonElement>('stop'),lesson=element<HTMLButtonElement>('lesson');
const practice=element<HTMLButtonElement>('practice-lesson');
const status=element('run-status');
let preparing=false,loadingProgram=false,session=0,control:TeacherRobotControl|null=null,interfaceError='';
let plan:PlannedStep[]=[],rows:HTMLLIElement[]=[];
const robotMode=()=>true;
const teaching=createTeachingPanel(()=>control);
const coordinates=createReportedCoordinatesPanel(element('robot-xyz'));
element('operating-ranges').textContent=`Current operating ranges: ${OPERATING_RANGES.map((range,i)=>`J${i+1} ${range.min}–${range.max}`).join('; ')}. J6: 1024 = open. These are operator-provided development ranges; protected student policy comes later.`;
const editor=createEditor(element('blockly-editor'),()=>teaching.list());
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
  teaching.refresh(true,preparing||loadingProgram);
  const robot=control?.snapshot(),live=true;
  const hasCoordinates=live&&editor.workspace.getAllBlocks(false).some(block=>block.type==='lesson_coordinates'&&block.isEnabled());
  element('robot-xyz').hidden=!live;coordinates.refresh(robot);
  const busy=preparing||loadingProgram||robot?.busy;
  run.disabled=!!busy||(live&&!robot?.canMove);stop.disabled=!(busy||(live&&robot?.connectionState==='Listening'));lesson.disabled=practice.disabled=!!busy;
  element<HTMLSelectElement>('program-position').disabled=!!busy||!editor.listPositions().length;
  element<HTMLButtonElement>('add-position').disabled=!!busy||!editor.listPositions().length;
  element<HTMLButtonElement>('add-wait').disabled=!!busy;
  element<HTMLButtonElement>('add-coordinate').disabled=!!busy;
  element<HTMLButtonElement>('new-program').disabled=!!busy;
  element<HTMLButtonElement>('program-save').disabled=!!busy;
  element<HTMLButtonElement>('program-load').disabled=!!busy;
  element('blockly-editor').inert=element('keyboard-fields').inert=!!busy;
  element('robot-controls').hidden=!live;element('mode-label').textContent=live?'Station robot':'Learn / Simulate';
  element<HTMLButtonElement>('robot-connect').disabled=!!robot&&!robot.canConnect;
  element<HTMLButtonElement>('robot-disconnect').disabled=!robot||['Disconnected','Closing'].includes(robot.connectionState);
  element<HTMLButtonElement>('robot-diagnostics').disabled=!control;
  const readiness=robot?.canMove?(hasCoordinates?'Ready. Run will check all XYZ joint targets before moving.':'Ready. Choose Run or a saved position.'):robot?.reason??'Connect the robot.';
  const readinessNode=element('robot-readiness');if(readinessNode.textContent!==readiness)readinessNode.textContent=readiness;

  element('robot-status').textContent=robot?`${robot.connectionState} · ${robot.armed?'Robot enabled':'Robot disabled'} · ${robot.message}`:'Disconnected.';
  const state=preparing?'Preparing':loadingProgram?'Loading':robot?.program?.phase??(robot?.armed?'Ready':robot?.connectionState==='Listening'?'Disabled':'Disconnected');
  element('state').textContent=state;
  if(live&&robot?.operation==='Saved position')element('state').textContent=robot.home?.phase??state;
  status.textContent=preparing?'Checking your program…':loadingProgram?'Loading program for review…':robot?.program?.message??'Connect this station’s robot, then Run your program.';
  if(interfaceError)status.textContent=interfaceError;
  else if(live&&robot?.operation==='Saved position')status.textContent=robot.message;
  const positions=robot?.positions;
  cards.forEach((card,index)=>{
    const actual=positions?.[index];card.measured.textContent=actual===undefined?'—':String(actual);
    const command=live?robot?.home?.commands?.find(command=>command.servo===index+1):null;
    card.target.textContent=command&&actual!==undefined?`Target ${command.target} · remaining ${command.target-actual}`:robot?.feedbackFresh?'Live reported position':'Last reported position';
  });
  const activeIndex=robot?.program?.activeStep,active=activeIndex===null||activeIndex===undefined?undefined:plan[activeIndex];
  editor.highlight(active?.blockId??null);rows.forEach((row,index)=>row.classList.toggle('active',!!active&&index===activeIndex));
}
function keyboardFields(){
  const container=element('keyboard-fields');container.replaceChildren();
  editor.workspace.getAllBlocks(true).forEach((block,index)=>{
    if(block.type==='lesson_pose'){
      const label=document.createElement('label');label.textContent=`Block ${index+1} · saved position`;
      const select=document.createElement('select');select.setAttribute('aria-label',`Block ${index+1} saved position`);
      const options=editor.listPositions();for(const pose of options){const option=document.createElement('option');option.value=pose.id;option.textContent=pose.name;select.append(option);}
      const current=String(block.getFieldValue('POSITION'));
      if(!options.some(pose=>pose.id===current)){const missing=document.createElement('option');missing.value=current;missing.textContent='Choose a saved position';select.append(missing);}
      select.value=current;select.onchange=()=>{block.setFieldValue(select.value,'POSITION');};label.append(select);container.append(label);
    }
    const names=block.type==='lesson_coordinates'?[...COORDINATE_FIELDS.map(f=>f.field),'SECONDS']:block.type==='lesson_repeat'?['COUNT']:block.type==='lesson_move'?['SERVO','TARGET']:['lesson_wait','lesson_pose'].includes(block.type)?['SECONDS']:[];
    for(const name of names){
      const label=document.createElement('label');label.textContent=`Block ${index+1} · ${name==='COUNT'?'repeat count':name==='SERVO'?'joint':'target'}`;
      const input=document.createElement('input');input.type='number';input.step='1';input.min=name==='TARGET'?'0':'1';input.max=name==='COUNT'?'20':name==='SERVO'?'6':'4095';input.value=String(block.getFieldValue(name));
      const coordinate=block.type==='lesson_coordinates'?COORDINATE_FIELDS.find(f=>f.field===name):null;
      if(coordinate){label.textContent=`Block ${index+1} · ${coordinate.label}`;input.min=String(coordinate.min);input.max=String(coordinate.max);input.step=String(coordinate.step);}
      if(name==='SECONDS'){label.textContent=`Block ${index+1} · ${block.type==='lesson_coordinates'?'coordinate duration':block.type==='lesson_pose'?'pose duration':'wait'} seconds`;input.step='.1';input.min=block.type==='lesson_wait'?'0':'.1';input.max='10';}
      input.onchange=()=>{if(input.validity.valid&&input.value!=='')block.setFieldValue(input.value,name);};label.append(input);container.append(label);
    }
  });
}
keyboardFields();editor.workspace.addChangeListener(event=>{if(!event.isUiEvent&&!preparing&&!loadingProgram&&control?.snapshot().program?.phase!=='Running'){keyboardFields();refresh();}});
document.addEventListener('named-positions-changed',()=>{editor.refreshPositions();positionOptions();keyboardFields();});
element('add-position').onclick=()=>{try{editor.addPosition(element<HTMLSelectElement>('program-position').value);keyboardFields();}catch(error){interfaceError=error instanceof Error?error.message:'Could not add block.';refresh();}};
element('add-wait').onclick=()=>{try{editor.addWait();keyboardFields();}catch(error){interfaceError=error instanceof Error?error.message:'Could not add block.';refresh();}};
element('add-coordinate').onclick=()=>{try{const state=robotMode()?control?.snapshot():null;editor.addCoordinates(state?.feedbackFresh&&state.reportedPose?state.reportedPose:undefined);keyboardFields();}catch(error){interfaceError=error instanceof Error?error.message:'Could not add coordinate block.';refresh();}};
function cancel(stopRobot=true){session++;runner.cancel();preparing=loadingProgram=false;if(stopRobot)control?.stop();refresh();}
run.onclick=async()=>{
  if(preparing||loadingProgram||control?.snapshot().busy)return;
  const ownSession=++session,live=robotMode();
  try{
    interfaceError='';const instructions=editor.compile();preparing=true;plan=[];refresh();const result=await runner.prepare(instructions);
    if(ownSession!==session||live!==robotMode())return;
    plan=result;preparing=false;element('instructions').replaceChildren();
    rows=plan.map(step=>{const row=document.createElement('li');row.textContent=step.kind==='coordinates'?`Checked coordinates: X ${step.x}, Y ${step.y}, Z ${step.z}, P ${step.pitch}, R ${step.roll}, C ${step.claw}, over ${step.durationMs/1000} seconds`:step.kind==='pose'?`Move to ${step.name}: ${step.positions.join(', ')}`:step.kind==='wait'?`Wait ${step.durationMs/1000} seconds`:`Move robot joint ${step.servo} to ${step.target}`;element('instructions').append(row);return row;});
    if(live){if(!control)throw Error('Connect the robot first.');control.runProgram(instructions);refresh();}
  }catch(error){if(ownSession!==session)return;preparing=false;interfaceError=error instanceof Error?error.message:'Program could not run.';refresh();}
};
stop.onclick=()=>cancel();
lesson.onclick=()=>{interfaceError='';cancel(false);editor.lesson();keyboardFields();refresh();};
practice.onclick=()=>{interfaceError='';cancel(false);editor.teacherLesson();keyboardFields();refresh();};
element('new-program').onclick=()=>{interfaceError='';cancel(false);editor.newProgram();keyboardFields();refresh();};

const programFile=element<HTMLInputElement>('program-file'),fileStatus=element('program-file-status');
const fileBusy=()=>preparing||loadingProgram||!!control?.snapshot().busy;
element('program-save').onclick=()=>{
  if(fileBusy())return;
  try{
    const text=saveProgramFile(editor.compile()),url=URL.createObjectURL(new Blob([text],{type:'application/json'})),link=document.createElement('a');
    link.href=url;link.download='nexarm-program.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    fileStatus.textContent='Program file saved. It includes the positions used by its blocks. Keep it to reload this test later.';
  }catch(error){fileStatus.textContent=error instanceof Error?error.message:'Program could not be saved.';}
};
element('program-load').onclick=()=>{if(!fileBusy())programFile.click();};
programFile.onchange=async()=>{
  const file=programFile.files?.[0];programFile.value='';if(!file)return;
  if(fileBusy()){fileStatus.textContent='Finish or Stop the current operation before loading a program.';return;}
  const token=++session;loadingProgram=true;runner.cancel();refresh();
  try{
    if(file.size>MAX_PROGRAM_FILE_BYTES)throw Error('Program file exceeds 256 KB.');
    const instructions=loadProgramFile(await file.text());if(token!==session)return;
    editor.loadProgram(instructions);positionOptions();keyboardFields();plan=[];rows=[];element('instructions').replaceChildren();interfaceError='';
    fileStatus.textContent='Program loaded for review. Included positions are available to its blocks; your saved-position library is unchanged. Nothing has run.';
  }catch(error){if(token===session)fileStatus.textContent=error instanceof Error?error.message:'Program could not be loaded. Existing blocks are unchanged.';}
  finally{if(token===session){loadingProgram=false;refresh();}}
};
element('robot-connect').onclick=()=>{
  try{
    if(!robotMode())return;
    const serial=(navigator as Navigator&{serial?:{requestPort():Promise<TeacherPort>}}).serial;
    if(!serial||!navigator.locks)throw Error('Robot mode needs Chrome or Edge with Web Serial on HTTPS or localhost.');
    control??=new TeacherRobotControl(navigator.locks,localStorage,()=>performance.now(),()=>!document.hidden,refresh,{directSession:true});
    control.connect(()=>serial.requestPort());
  }catch(error){element('robot-status').textContent=error instanceof Error?error.message:'Could not connect.';}
};
element('robot-disconnect').onclick=()=>{cancel();control?.disconnect();refresh();};
element('robot-diagnostics').onclick=()=>{
  if(!control)return;
  const data=JSON.stringify(control.report(),null,2),url=URL.createObjectURL(new Blob([data],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download='nexarm-robot-diagnostics.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
function leave(){cancel();control?.disconnect();}
document.addEventListener('visibilitychange',()=>{if(document.hidden)leave();});
window.addEventListener('pagehide',leave);window.addEventListener('error',leave);window.addEventListener('unhandledrejection',leave);
setInterval(()=>{if(control){control.tick();refresh();}},50);
refresh();
