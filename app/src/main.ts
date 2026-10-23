import './styles.css';
import { RobotSimulator } from './simulation/RobotSimulator';
import { createArmIllustration } from './simulation/ArmIllustration';
import { createEditor } from './blocks/editor';
import { ProgramRunner } from './runtime/ProgramRunner';
import type { PlannedStep } from './runtime/instructions';
import type { ServoId } from './protocol/NexArmCodec';
import { TeacherRobotControl } from './safety/TeacherRobotControl';
import type { TeacherPort } from './safety/TeacherRobotControl';
import {createTeachingPanel} from './poses/TeachingPanel';
import {OPERATING_RANGES} from './safety/OperatingRanges';



function element<T extends HTMLElement>(id:string):T{
  const node=document.getElementById(id);if(!node)throw Error(`Missing interface element: ${id}`);return node as T;
}
const simulator=new RobotSimulator(),runner=new ProgramRunner();
const run=element<HTMLButtonElement>('run'),stop=element<HTMLButtonElement>('stop'),lesson=element<HTMLButtonElement>('lesson');
const practice=element<HTMLButtonElement>('practice-lesson'),destination=element<HTMLSelectElement>('execution-mode');
const status=element('run-status');
let preparing=false,session=0,control:TeacherRobotControl|null=null,interfaceError='';
let plan:PlannedStep[]=[],rows:HTMLLIElement[]=[];
const robotMode=()=>destination.value==='robot';
const teaching=createTeachingPanel(()=>control);
element('operating-ranges').textContent=`Current operating ranges: ${OPERATING_RANGES.map((range,i)=>`J${i+1} ${range.min}–${range.max}`).join('; ')}. J6: 1024 = open. These are operator-provided development ranges; protected student policy comes later.`;
const editor=createEditor(element('blockly-editor'),()=>teaching.list()),draw=createArmIllustration(element('arm-illustration'));
function positionOptions(){
  const select=element<HTMLSelectElement>('program-position'),previous=select.value;select.replaceChildren();
  for(const pose of teaching.list()){const option=document.createElement('option');option.value=pose.id;option.textContent=pose.name;select.append(option);}
  if(teaching.list().some(pose=>pose.id===previous))select.value=previous;
}
positionOptions();

const cards=Array.from({length:6},(_,index)=>{
  const servo=(index+1) as ServoId,card=document.createElement('section');card.className='joint-card';
  const title=document.createElement('h3');title.textContent=`Joint ${servo}`;
  const measured=document.createElement('strong'),target=document.createElement('span');target.className='target';
  const meter=document.createElement('meter');meter.min=0;meter.max=4095;meter.setAttribute('aria-label',`Joint ${servo} simulated raw position`);
  const controls=document.createElement('div');controls.className='jog-controls';
  const buttons=[-20,20].map(delta=>{
    const button=document.createElement('button');button.className='secondary';button.textContent=delta>0?'+20':'−20';
    button.setAttribute('aria-label',`Simulate joint ${servo} ${delta>0?'plus':'minus'} 20 raw units`);
    button.onclick=()=>{plan=[];try{simulator.jog(servo,delta);}catch{status.textContent='That move exceeds the simulation range.';}};
    controls.append(button);return button;
  });card.append(title,measured,target,meter,controls);element('joints').append(card);return {measured,target,meter,buttons};
});
function refresh(){
  teaching.refresh(robotMode(),preparing);
  const simulated=simulator.snapshot(),robot=control?.snapshot(),live=robotMode();
  const busy=preparing||(live?robot?.program?.phase==='Running'||robot?.busy:simulated.status==='Running');
  run.disabled=!!busy||(live&&!robot?.canMove);stop.disabled=!(busy||(live&&robot?.connectionState==='Listening'));lesson.disabled=practice.disabled=!!busy;
  element<HTMLSelectElement>('program-position').disabled=!!busy||!teaching.list().length;
  element<HTMLButtonElement>('add-position').disabled=!!busy||!teaching.list().length;
  element<HTMLButtonElement>('add-wait').disabled=!!busy;
  element<HTMLButtonElement>('new-program').disabled=!!busy;
  element<HTMLButtonElement>('reset').disabled=live;
  element('blockly-editor').inert=element('keyboard-fields').inert=!!busy;
  element('robot-controls').hidden=!live;element('mode-label').textContent=live?'Station robot':'Learn / Simulate';
  element('robot-heading').textContent=live?'Robot readings':'Your virtual robot';
  element<HTMLButtonElement>('robot-connect').disabled=!!robot&&!robot.canConnect;
  element<HTMLButtonElement>('robot-disconnect').disabled=!robot||['Disconnected','Closing'].includes(robot.connectionState);
  element<HTMLButtonElement>('robot-diagnostics').disabled=!control;
  const readiness=robot?.canMove?'Ready. Choose Run or a saved position.':robot?.reason??'Connect the robot.';
  const readinessNode=element('robot-readiness');if(readinessNode.textContent!==readiness)readinessNode.textContent=readiness;

  element('robot-status').textContent=robot?`${robot.connectionState} · ${robot.armed?'Robot enabled':'Robot disabled'} · ${robot.message}`:'Disconnected.';
  const state=preparing?'Preparing':live?robot?.program?.phase??(robot?.armed?'Ready':robot?.connectionState==='Listening'?'Disabled':'Disconnected'):simulated.status;
  element('state').textContent=state;
  if(live&&robot?.operation==='Saved position')element('state').textContent=robot.home?.phase??state;
  status.textContent=preparing?'Checking your program…':live?robot?.program?.message??'Connect this station’s robot, then Run your program.':simulated.status==='Running'?'Simulating. Watch the highlighted block and virtual arm.':simulated.status==='Completed'?'Complete. Did the result match your prediction?':simulated.status==='Stopped'?'Stopped. Pending simulation steps were canceled.':'Ready to simulate.';
  if(interfaceError)status.textContent=interfaceError;
  else if(live&&robot?.operation==='Saved position')status.textContent=robot.message;
  const positions=live?robot?.positions:simulated.positions;
  cards.forEach((card,index)=>{
    const actual=positions?.[index];card.measured.textContent=actual===undefined?'—':String(actual);card.meter.value=actual??0;
    const command=live?robot?.home?.commands?.find(command=>command.servo===index+1):null;
    card.target.textContent=live?(command&&actual!==undefined?`Target ${command.target} · remaining ${command.target-actual}`:'Live reported position'):`Target ${simulated.targets[index]}`;
    card.meter.setAttribute('aria-label',`Joint ${index+1} ${live?'reported':'simulated'} raw position`);
    card.buttons.forEach(button=>button.disabled=!!busy||live);
  });
  const activeIndex=live?robot?.program?.activeStep:simulated.activeStep,active=activeIndex===null||activeIndex===undefined?undefined:plan[activeIndex];
  editor.highlight(active?.blockId??null);rows.forEach((row,index)=>row.classList.toggle('active',!!active&&index===activeIndex));
  if(positions)draw(positions,live?robot?.program?.phase==='Running':simulated.status==='Running');
}
simulator.subscribe(refresh);
function keyboardFields(){
  const container=element('keyboard-fields');container.replaceChildren();
  editor.workspace.getAllBlocks(true).forEach((block,index)=>{
    if(block.type==='lesson_pose'){
      const label=document.createElement('label');label.textContent=`Block ${index+1} · saved position`;
      const select=document.createElement('select');select.setAttribute('aria-label',`Block ${index+1} saved position`);
      const options=teaching.list();for(const pose of options){const option=document.createElement('option');option.value=pose.id;option.textContent=pose.name;select.append(option);}
      const current=String(block.getFieldValue('POSITION'));
      if(!options.some(pose=>pose.id===current)){const missing=document.createElement('option');missing.value=current;missing.textContent='Choose a saved position';select.append(missing);}
      select.value=current;select.onchange=()=>{block.setFieldValue(select.value,'POSITION');};label.append(select);container.append(label);
    }
    const names=block.type==='lesson_repeat'?['COUNT']:block.type==='lesson_move'?['SERVO','TARGET']:['lesson_wait','lesson_pose'].includes(block.type)?['SECONDS']:[];
    for(const name of names){
      const label=document.createElement('label');label.textContent=`Block ${index+1} · ${name==='COUNT'?'repeat count':name==='SERVO'?'joint':'target'}`;
      const input=document.createElement('input');input.type='number';input.step='1';input.min=name==='TARGET'?'0':'1';input.max=name==='COUNT'?'20':name==='SERVO'?'6':'4095';input.value=String(block.getFieldValue(name));
      if(name==='SECONDS'){label.textContent=`Block ${index+1} · ${block.type==='lesson_pose'?'pose duration':'wait'} seconds`;input.step='.1';input.min=block.type==='lesson_pose'?'.1':'0';input.max='10';}
      input.onchange=()=>{if(input.validity.valid&&input.value!=='')block.setFieldValue(input.value,name);};label.append(input);container.append(label);
    }
  });
}
keyboardFields();editor.workspace.addChangeListener(event=>{if(!event.isUiEvent&&!preparing&&simulator.snapshot().status!=='Running'&&control?.snapshot().program?.phase!=='Running')keyboardFields();});
document.addEventListener('named-positions-changed',()=>{editor.refreshPositions();positionOptions();keyboardFields();});
element('add-position').onclick=()=>{try{editor.addPosition(element<HTMLSelectElement>('program-position').value);keyboardFields();}catch(error){interfaceError=error instanceof Error?error.message:'Could not add block.';refresh();}};
element('add-wait').onclick=()=>{try{editor.addWait();keyboardFields();}catch(error){interfaceError=error instanceof Error?error.message:'Could not add block.';refresh();}};
function cancel(stopRobot=true){session++;runner.cancel();preparing=false;simulator.stop();if(stopRobot)control?.stop();refresh();}
run.onclick=async()=>{
  if(preparing||simulator.snapshot().status==='Running'||(robotMode()&&control?.snapshot().busy))return;
  const ownSession=++session,live=robotMode();
  try{
    interfaceError='';const instructions=editor.compile();preparing=true;plan=[];refresh();const result=await runner.prepare(instructions);
    if(ownSession!==session||live!==robotMode())return;
    plan=result;preparing=false;element('instructions').replaceChildren();
    rows=plan.map(step=>{const row=document.createElement('li');row.textContent=step.kind==='pose'?`Move to ${step.name}: ${step.positions.join(', ')}`:step.kind==='wait'?`Wait ${step.durationMs/1000} seconds`:`Move ${live?'robot':'virtual'} joint ${step.servo} to ${step.target}`;element('instructions').append(row);return row;});
    if(live){if(!control)throw Error('Connect the robot first.');control.runProgram(instructions);refresh();}
    else simulator.run(plan);
  }catch(error){if(ownSession!==session)return;preparing=false;interfaceError=error instanceof Error?error.message:'Program could not run.';refresh();}
};
stop.onclick=()=>cancel();
element('reset').onclick=()=>{if(robotMode()){status.textContent='Switch to Simulation to reset the virtual robot.';return;}cancel();simulator.reset();};
lesson.onclick=()=>{cancel(false);editor.lesson();keyboardFields();if(!robotMode())simulator.reset();};
practice.onclick=()=>{cancel(false);editor.teacherLesson();keyboardFields();if(!robotMode())simulator.reset();};
element('new-program').onclick=()=>{interfaceError='';cancel(false);editor.newProgram();keyboardFields();if(!robotMode())simulator.reset();};
destination.onchange=()=>{interfaceError='';cancel();control?.disconnect();refresh();};
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
