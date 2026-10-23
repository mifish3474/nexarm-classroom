import './styles.css';
import { RobotSimulator } from './simulation/RobotSimulator';
import { createArmIllustration } from './simulation/ArmIllustration';
import { createEditor } from './blocks/editor';
import { ProgramRunner } from './runtime/ProgramRunner';
import type { PlannedStep } from './runtime/instructions';
import type { ServoId } from './protocol/NexArmCodec';
import { TeacherRobotControl } from './safety/TeacherRobotControl';
import type { TeacherPort } from './safety/TeacherRobotControl';
import { classroomProfile, CLASSROOM_PROFILE_KEY } from './safety/ClassroomProfile';
import type { ClassroomProfile } from './safety/ClassroomProfile';

function element<T extends HTMLElement>(id:string):T{
  const node=document.getElementById(id);if(!node)throw Error(`Missing interface element: ${id}`);return node as T;
}
const simulator=new RobotSimulator(),runner=new ProgramRunner();
const editor=createEditor(element('blockly-editor')),draw=createArmIllustration(element('arm-illustration'));
const run=element<HTMLButtonElement>('run'),stop=element<HTMLButtonElement>('stop'),lesson=element<HTMLButtonElement>('lesson');
const practice=element<HTMLButtonElement>('practice-lesson'),destination=element<HTMLSelectElement>('execution-mode');
const clearance=element<HTMLInputElement>('robot-clearance'),speed=element<HTMLInputElement>('station-speed');
const status=element('run-status');
let preparing=false,session=0,control:TeacherRobotControl|null=null,profile:ClassroomProfile|null=null,previouslyArmed=false,interfaceError='';
let plan:PlannedStep[]=[],rows:HTMLLIElement[]=[];
const robotMode=()=>destination.value==='robot';

const ranges=Array.from({length:6},(_,index)=>{
  const card=document.createElement('label');card.className='joint-card';card.textContent=`S${index+1} minimum / maximum`;
  const inputs=['minimum','maximum'].map(name=>{
    const input=document.createElement('input');input.type='number';input.min='0';input.max='4095';input.step='1';input.required=true;
    input.setAttribute('aria-label',`S${index+1} station ${name}`);card.append(input);return input;
  });element('station-limits').append(card);return inputs;
});
try{
  const saved=localStorage.getItem(CLASSROOM_PROFILE_KEY);
  if(saved){if(saved.length>8192)throw Error('Station setup is too large.');profile=classroomProfile(JSON.parse(saved));}
  element('station-status').textContent=profile?'Station setup loaded from this browser. Use only its assigned robot.':'No station limits saved. Configure them once before robot programming.';
}catch{element('station-status').textContent='Station setup could not be loaded. Simulation works; configure limits before robot programming.';}
if(profile){profile.limits.forEach((limit,index)=>{ranges[index]![0]!.value=String(limit.min);ranges[index]![1]!.value=String(limit.max);});speed.value=String(profile.speed);}

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
  const simulated=simulator.snapshot(),robot=control?.snapshot(),live=robotMode();
  const busy=preparing||(live?robot?.program?.phase==='Running'||robot?.busy:simulated.status==='Running');
  run.disabled=!!busy||(live&&(!profile||!robot?.canMove));stop.disabled=!(busy||(live&&robot?.connectionState==='Listening'));lesson.disabled=practice.disabled=!!busy;
  element<HTMLButtonElement>('reset').disabled=live;
  element('blockly-editor').inert=element('keyboard-fields').inert=!!busy;
  element('robot-controls').hidden=!live;element('mode-label').textContent=live?'Station robot':'Learn / Simulate';
  element('robot-heading').textContent=live?'Robot readings':'Your virtual robot';
  element<HTMLButtonElement>('robot-connect').disabled=!!robot&&!robot.canConnect;
  element<HTMLButtonElement>('robot-disconnect').disabled=!robot||['Disconnected','Closing'].includes(robot.connectionState);
  if(previouslyArmed&&!robot?.armed)clearance.checked=false;previouslyArmed=!!robot?.armed;
  element<HTMLButtonElement>('robot-enable').disabled=!profile||!clearance.checked||!robot?.canEnable;
  element('robot-status').textContent=robot?`${robot.connectionState} · ${robot.armed?'Robot enabled':'Robot disabled'} · ${robot.message}`:'Disconnected.';
  ranges.flat().forEach(input=>input.disabled=!!busy);speed.disabled=!!busy;
  element<HTMLButtonElement>('station-save').disabled=element<HTMLButtonElement>('station-clear').disabled=!!busy;
  const state=preparing?'Preparing':live?robot?.program?.phase??(robot?.armed?'Ready':robot?.connectionState==='Listening'?'Disabled':'Disconnected'):simulated.status;
  element('state').textContent=state;
  status.textContent=preparing?'Checking your program…':live?robot?.program?.message??(!profile?'Set up this station’s movement limits, then Connect and Enable.':'Connect and Enable this station’s robot, then Run your program.'):simulated.status==='Running'?'Simulating. Watch the highlighted block and virtual arm.':simulated.status==='Completed'?'Complete. Did the result match your prediction?':simulated.status==='Stopped'?'Stopped. Pending simulation steps were canceled.':'Ready to simulate.';
  if(interfaceError)status.textContent=interfaceError;
  const positions=live?robot?.positions:simulated.positions;
  cards.forEach((card,index)=>{
    const actual=positions?.[index];card.measured.textContent=actual===undefined?'—':String(actual);card.meter.value=actual??0;
    card.target.textContent=live?'Live reported position':`Target ${simulated.targets[index]}`;
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
    const names=block.type==='lesson_repeat'?['COUNT']:block.type==='lesson_move'?['SERVO','TARGET']:[];
    for(const name of names){
      const label=document.createElement('label');label.textContent=`Block ${index+1} · ${name==='COUNT'?'repeat count':name==='SERVO'?'joint':'target'}`;
      const input=document.createElement('input');input.type='number';input.step='1';input.min=name==='TARGET'?'0':'1';input.max=name==='COUNT'?'20':name==='SERVO'?'6':'4095';input.value=String(block.getFieldValue(name));
      input.onchange=()=>{if(input.validity.valid&&input.value!=='')block.setFieldValue(input.value,name);};label.append(input);container.append(label);
    }
  });
}
keyboardFields();editor.workspace.addChangeListener(event=>{if(!event.isUiEvent&&!preparing&&simulator.snapshot().status!=='Running'&&control?.snapshot().program?.phase!=='Running')keyboardFields();});
function cancel(stopRobot=true){session++;runner.cancel();preparing=false;simulator.stop();if(stopRobot)control?.stop();refresh();}
run.onclick=async()=>{
  if(preparing||simulator.snapshot().status==='Running'||(robotMode()&&control?.snapshot().busy))return;
  const ownSession=++session,live=robotMode();
  try{
    interfaceError='';const instructions=editor.compile();preparing=true;plan=[];refresh();const result=await runner.prepare(instructions);
    if(ownSession!==session||live!==robotMode())return;
    plan=result;preparing=false;element('instructions').replaceChildren();
    rows=plan.map(step=>{const row=document.createElement('li');row.textContent=`Move ${live?'robot':'virtual'} joint ${step.servo} to ${step.target}`;element('instructions').append(row);return row;});
    if(live){if(!control||!profile)throw Error('Connect and enable the robot after station setup.');control.runProgram(instructions,profile);refresh();}
    else simulator.run(plan);
  }catch(error){if(ownSession!==session)return;preparing=false;interfaceError=error instanceof Error?error.message:'Program could not run.';refresh();}
};
stop.onclick=()=>cancel();
element('reset').onclick=()=>{if(robotMode()){status.textContent='Switch to Simulation to reset the virtual robot.';return;}cancel();simulator.reset();};
lesson.onclick=()=>{cancel(false);editor.lesson();keyboardFields();if(!robotMode())simulator.reset();};
practice.onclick=()=>{cancel(false);editor.teacherLesson();keyboardFields();if(!robotMode())simulator.reset();};
destination.onchange=()=>{interfaceError='';cancel();control?.disconnect();clearance.checked=false;refresh();};
element('robot-connect').onclick=()=>{
  try{
    if(!robotMode())return;
    const serial=(navigator as Navigator&{serial?:{requestPort():Promise<TeacherPort>}}).serial;
    if(!serial||!navigator.locks)throw Error('Robot mode needs Chrome or Edge with Web Serial on HTTPS or localhost.');
    control??=new TeacherRobotControl(navigator.locks,localStorage,()=>performance.now(),()=>!document.hidden,refresh);
    control.connect(()=>serial.requestPort());
  }catch(error){element('robot-status').textContent=error instanceof Error?error.message:'Could not connect.';}
};
element('robot-disconnect').onclick=()=>{cancel();control?.disconnect();refresh();};
element('robot-enable').onclick=()=>{try{if(!profile)throw Error('Configure station limits first.');control?.enable(clearance.checked);interfaceError='';refresh();}catch(error){interfaceError=error instanceof Error?error.message:'Could not enable.';refresh();}};
clearance.onchange=()=>{if(!clearance.checked)cancel();refresh();};
element('station-save').onclick=()=>{
  try{
    if(![...ranges.flat(),speed].every(input=>input.reportValidity()&&input.value!==''))return;
    const next=classroomProfile({schemaVersion:1,limits:ranges.map(inputs=>({min:Number(inputs[0]!.value),max:Number(inputs[1]!.value)})),speed:Number(speed.value),acceleration:10});
    cancel();profile=next;
    try{localStorage.setItem(CLASSROOM_PROFILE_KEY,JSON.stringify(next));element('station-status').textContent='Station setup saved in this browser. Students can edit and run within these ranges.';}
    catch{element('station-status').textContent='Station setup is usable in memory, but browser storage failed. It must be entered again after reload.';}
    refresh();
  }catch(error){element('station-status').textContent=error instanceof Error?error.message:'Could not save station setup.';}
};
element('station-clear').onclick=()=>{
  cancel();control?.disconnect();profile=null;ranges.flat().forEach(input=>input.value='');
  try{localStorage.removeItem(CLASSROOM_PROFILE_KEY);element('station-status').textContent='Station limits cleared. Simulation remains available.';}
  catch{element('station-status').textContent='Limits cleared in memory. Browser storage could not be cleared; saved limits may return after reload.';}refresh();
};
function leave(){cancel();control?.disconnect();}
document.addEventListener('visibilitychange',()=>{if(document.hidden)leave();});
window.addEventListener('pagehide',leave);window.addEventListener('error',leave);window.addEventListener('unhandledrejection',leave);
setInterval(()=>{if(control){control.tick();refresh();}},50);
