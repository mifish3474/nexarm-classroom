import './styles.css';
import { TeacherRobotControl } from './safety/TeacherRobotControl';
import type { TeacherPort } from './safety/TeacherRobotControl';
import { HOME_SPEED } from './safety/SmoothTeacherMotion';
import { TEACHER_HOME } from './safety/TeacherControlPlan';
import {OPERATING_RANGES,targetIssue} from './safety/OperatingRanges';
import {createReportedCoordinatesPanel} from './robot/ReportedCoordinatesPanel';

const node = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const coordinates=createReportedCoordinatesPanel(node('teacher-xyz'));
const serial = (navigator as Navigator & {serial?: {requestPort(): Promise<TeacherPort>}}).serial;
let control: TeacherRobotControl | null = null, error = '';
const labels = ['Base', 'Shoulder', 'Elbow', 'Wrist pitch', 'Wrist roll', 'Gripper'];
const cards = labels.map((label, i) => {
  const range=OPERATING_RANGES[i]!;
  const card = document.createElement('div'); card.className = 'joint-card';
  const title = document.createElement('h3'); title.textContent = `Servo ${i + 1} · ${label}`;
  const value = document.createElement('strong'); value.dataset.servoValue = String(i + 1); value.textContent = '—';
  const home = document.createElement('span'); home.className = 'target'; home.textContent = `Home: ${TEACHER_HOME[i]} · Operating range: ${range.min}–${range.max}${i===5?' (1024 = open)':''}`;
  const actions = document.createElement('div'); actions.className = 'jog-controls';
  const minus = document.createElement('button'), plus = document.createElement('button');
  minus.textContent = '−20'; plus.textContent = '+20'; minus.disabled = plus.disabled = true;
  for (const [button, delta] of [[minus, -20], [plus, 20]] as const) {
    button.setAttribute('aria-label', `Servo ${i + 1} ${delta < 0 ? 'minus' : 'plus'} 20`);
    button.addEventListener('keydown', event => { if (event.repeat) event.preventDefault(); });
    button.onclick = () => act(() => control?.jog(i + 1, delta));
  }
  const slider=document.createElement('input');slider.type='range';slider.min=String(range.min);slider.max=String(range.max);slider.step='1';slider.value=String(TEACHER_HOME[i]);slider.setAttribute('aria-label',`Servo ${i+1} target slider`);
  const fields=document.createElement('div');fields.className='servo-fields';
  function field(name:string,start:number,min:number,max:number){const label=document.createElement('label');label.textContent=name;const input=document.createElement('input');input.type='number';input.required=true;input.min=String(min);input.max=String(max);input.step='1';input.value=String(start);input.setAttribute('aria-label',`Servo ${i+1} ${name.toLowerCase()}`);label.append(input);fields.append(label);return input;}
  const target=field('Target',TEACHER_HOME[i]!,range.min,range.max),speed=field('Speed',2000,1,3400),acceleration=field('Acceleration',100,1,254);
  const move=document.createElement('button');move.textContent='Move';move.setAttribute('aria-label',`Move servo ${i+1} to target`);
  const request=()=>{if(![target,speed,acceleration].every(input=>input.reportValidity()))return;act(()=>control?.moveJoint(i+1,Number(target.value),Number(speed.value),Number(acceleration.value)));};
  const liveRequest=(final=false)=>{target.value=slider.value;if(![speed,acceleration].every(input=>input.validity.valid))return;act(()=>control?.liveJoint(i+1,Number(slider.value),Number(speed.value),Number(acceleration.value),final));};
  slider.oninput=()=>liveRequest();slider.onchange=()=>liveRequest(true);
  target.oninput=()=>{if(target.validity.valid)slider.value=target.value;};move.onclick=request;
  actions.append(minus,plus);
  const jogDetails=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Small +/-20 jogs';jogDetails.append(summary,actions);
  card.append(title, value, home,slider,fields,move,jogDetails); node('teacher-joints').append(card);
  return {value, minus, plus,slider,target,speed,acceleration,move,initialized:false};
});
function act(action: () => void) {
  error = '';
  try { action(); } catch (caught) { error = caught instanceof Error ? caught.message : String(caught); }
  refresh();
}
function refresh() {
  if (!control) return;
  const state = control.snapshot();
  coordinates.refresh(state);
  node<HTMLButtonElement>('teacher-connect').disabled = !state.canConnect;
  node<HTMLButtonElement>('teacher-disconnect').disabled = ['Disconnected', 'Closing'].includes(state.connectionState);
  node('teacher-status').textContent = `${state.connectionState} · ${state.armed ? 'Controls enabled' : 'Controls off'} · ${state.message}`;
  node('teacher-readiness').textContent = state.reason ?? 'Ready for your next joint movement or Home return.';
  node('teacher-error').textContent = error; node('teacher-error').hidden = !error;
  cards.forEach((card, i) => {
    const value = state.positions?.[i];
    if(value===undefined)card.initialized=false;
    else if(!card.initialized){card.slider.value=card.target.value=String(value);card.initialized=true;}
    const editable=state.canMove||state.sliderServo===i+1;
    card.slider.disabled=!(editable||state.liveServo===i+1);
    card.target.disabled=card.speed.disabled=card.acceleration.disabled=card.move.disabled=!editable;
    card.value.textContent = value === undefined ? '—' : String(value);
    card.minus.disabled = !state.canMove || value === undefined || targetIssue(i+1,value-20)!==null;
    card.plus.disabled = !state.canMove || value === undefined || targetIssue(i+1,value+20)!==null;
    card.minus.title = value === undefined ? 'Wait for readings.' : `Target ${value - 20}`;
    card.plus.title = value === undefined ? 'Wait for readings.' : `Target ${value + 20}`;
  });
  node<HTMLButtonElement>('teacher-servo3-factory').disabled=!state.canMove||!state.positions||targetIssue(3,state.positions[2]!+20)!==null;
  const command=state.home?.command;
  const homeCommands=state.operation==='Home'?state.home?.commands:null;
  node('teacher-motion-detail').textContent=['Fault','Settled short'].includes(state.home?.phase??'')?state.home!.message:homeCommands?.length?`Home: ${homeCommands.map(c=>`S${c.servo} reported ${c.actual}, target ${c.target}, remaining ${c.error}`).join('; ')}. Speed ${state.home?.speed}, acceleration ${state.home?.acceleration}.`:command?`Servo ${command.servo}: start ${command.from}, target ${command.target}, reported ${command.actual}, remaining ${command.error} raw units. Speed ${state.home?.speed}, acceleration ${state.home?.acceleration}.`:'No movement command sent yet.';
  const runningHome = state.operation === 'Home' && state.home?.phase === 'Running';
  const count = state.positions ? state.positions.filter((n,i)=>n!==TEACHER_HOME[i]!).length : 0;
  const seconds = Math.ceil(Math.max(1,...(state.positions?.map((n,i)=>Math.abs(n-TEACHER_HOME[i]!)*1.2/HOME_SPEED)??[0])));
  const duration = seconds >= 60 ? `about ${Math.ceil(seconds / 60)} minutes` : `about ${Math.max(1, seconds)} seconds`;
  node('teacher-home-preview').textContent = !state.positions ? 'Connect for a return estimate.' : runningHome ? 'Home frame running. Other controls wait until frame time elapses or you Stop.' : `${count} joints differ from Home. All six targets will be sent; planned frame ${duration}. Review clearance for the combined sweep before clicking Return.`;
  node<HTMLButtonElement>('teacher-home').disabled = !state.canMove;
  const progress = node<HTMLProgressElement>('teacher-home-progress');
  progress.max = state.operation === 'Home' ? Math.max(1, state.home?.totalSteps ?? 0) : 1;
  progress.value = state.operation === 'Home' ? state.home?.completedWaypoints ?? 0 : 0;
  const report = state.operation === 'Home' ? state.home : null;
  node('teacher-home-status').textContent = report ? `${report.phase} · ${report.completedWaypoints}/${report.totalSteps} targets sent · ${report.message}` : 'No return started.';
  node<HTMLButtonElement>('teacher-release').disabled = !state.canRelease;
  node<HTMLButtonElement>('teacher-restore').disabled = !state.canRestore;
  node('teacher-manual-status').textContent = `${state.manualPhase}: ${state.manualMessage}${state.manualReason ? ` ${state.manualReason}` : ''}`;
  if (state.manualPhase !== 'Normal') node<HTMLDetailsElement>('teacher-manual-details').open = true;
}
if (serial && navigator.locks) {
  try { control = new TeacherRobotControl(navigator.locks, localStorage, () => performance.now(), () => !document.hidden, refresh,{directSession:true}); }
  catch { node('teacher-status').textContent = 'Could not initialize local holding-state storage.'; node<HTMLButtonElement>('teacher-connect').disabled = true; }
} else {
  node('teacher-status').textContent = 'Use Chrome or Edge with Web Serial on HTTPS or localhost.';
  node<HTMLButtonElement>('teacher-connect').disabled = true;
}
node('teacher-connect').onclick = () => act(() => control?.connect(() => serial!.requestPort()));
node('teacher-disconnect').onclick = () => act(() => control?.disconnect());
node('teacher-servo3-factory').onclick=()=>act(()=>control?.compareServo3Factory());
node('teacher-home').onclick = () => act(() => control?.returnHome());
node('teacher-stop').onclick = () => act(() => control?.stopThenRelease());
node('teacher-release').onclick = () => act(() => control?.setHolding(false,true));
node('teacher-restore').onclick = () => act(() => control?.setHolding(true,true));
node('teacher-export').onclick = () => {
  if (!control) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(control.report(), null, 2)], {type: 'application/json'}));
  const link = document.createElement('a'); link.href = url; link.download = 'nexarm-teacher-control-session.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
node('teacher-diagnostic-export').onclick=()=>node<HTMLButtonElement>('teacher-export').click();
const disconnect = () => control?.disconnect();
document.addEventListener('visibilitychange', () => { if (document.hidden) disconnect(); });
window.addEventListener('pagehide', disconnect); window.addEventListener('error', disconnect); window.addEventListener('unhandledrejection', disconnect);
setInterval(() => control?.tick(), 50); refresh();
