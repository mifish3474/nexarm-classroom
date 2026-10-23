import './styles.css';
import { TeacherRobotControl } from './safety/TeacherRobotControl';
import type { TeacherPort } from './safety/TeacherRobotControl';
import { HOME_SPEED } from './safety/SmoothTeacherMotion';
import { TEACHER_HOME } from './safety/TeacherControlPlan';

const node = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const clearance = node<HTMLInputElement>('teacher-clearance'), support = node<HTMLInputElement>('teacher-support');
const held = node<HTMLInputElement>('teacher-held');
const serial = (navigator as Navigator & {serial?: {requestPort(): Promise<TeacherPort>}}).serial;
let control: TeacherRobotControl | null = null, error = '', previouslyArmed = false;
const labels = ['Base', 'Shoulder', 'Elbow', 'Wrist pitch', 'Wrist roll', 'Gripper'];
const cards = labels.map((label, i) => {
  const card = document.createElement('div'); card.className = 'joint-card';
  const title = document.createElement('h3'); title.textContent = `Servo ${i + 1} · ${label}`;
  const value = document.createElement('strong'); value.dataset.servoValue = String(i + 1); value.textContent = '—';
  const home = document.createElement('span'); home.className = 'target'; home.textContent = `Home: ${TEACHER_HOME[i]}`;
  const actions = document.createElement('div'); actions.className = 'jog-controls';
  const minus = document.createElement('button'), plus = document.createElement('button');
  minus.textContent = '−20'; plus.textContent = '+20'; minus.disabled = plus.disabled = true;
  for (const [button, delta] of [[minus, -20], [plus, 20]] as const) {
    button.setAttribute('aria-label', `Servo ${i + 1} ${delta < 0 ? 'minus' : 'plus'} 20`);
    button.addEventListener('keydown', event => { if (event.repeat) event.preventDefault(); });
    button.onclick = () => act(() => control?.jog(i + 1, delta));
  }
  const slider=document.createElement('input');slider.type='range';slider.min='0';slider.max='4095';slider.step='1';slider.value=String(TEACHER_HOME[i]);slider.setAttribute('aria-label',`Servo ${i+1} target slider`);
  const fields=document.createElement('div');fields.className='servo-fields';
  function field(name:string,start:number,min:number,max:number){const label=document.createElement('label');label.textContent=name;const input=document.createElement('input');input.type='number';input.required=true;input.min=String(min);input.max=String(max);input.step='1';input.value=String(start);input.setAttribute('aria-label',`Servo ${i+1} ${name.toLowerCase()}`);label.append(input);fields.append(label);return input;}
  const target=field('Target',TEACHER_HOME[i]!,0,4095),speed=field('Speed',2000,1,3400),acceleration=field('Acceleration',100,1,254);
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
  if (previouslyArmed && !state.armed) clearance.checked = false;
  previouslyArmed = state.armed;
  node<HTMLButtonElement>('teacher-connect').disabled = !state.canConnect;
  node<HTMLButtonElement>('teacher-disconnect').disabled = ['Disconnected', 'Closing'].includes(state.connectionState);
  node<HTMLButtonElement>('teacher-enable').disabled = !clearance.checked || !state.canEnable;
  node('teacher-status').textContent = `${state.connectionState} · ${state.armed ? 'Controls enabled' : 'Controls off'} · ${state.message}`;
  node('teacher-readiness').textContent = state.armed ? state.reason ?? 'Ready for your next jog or Home return.' : state.enableReason ?? (clearance.checked ? 'Ready: Enable teacher controls.' : 'Confirm the setup, then Enable teacher controls.');
  node('teacher-error').textContent = error; node('teacher-error').hidden = !error;
  cards.forEach((card, i) => {
    const value = state.positions?.[i];
    if(value===undefined)card.initialized=false;
    else if(!card.initialized){card.slider.value=card.target.value=String(value);card.initialized=true;}
    const editable=state.canMove||state.sliderServo===i+1;
    card.slider.disabled=!(editable||state.liveServo===i+1);
    card.target.disabled=card.speed.disabled=card.acceleration.disabled=card.move.disabled=!editable;
    card.value.textContent = value === undefined ? '—' : String(value);
    card.minus.disabled = !state.canMove || value === undefined || value < 20;
    card.plus.disabled = !state.canMove || value === undefined || value > 4075;
    card.minus.title = value === undefined ? 'Wait for readings.' : `Target ${value - 20}`;
    card.plus.title = value === undefined ? 'Wait for readings.' : `Target ${value + 20}`;
  });
  node<HTMLButtonElement>('teacher-servo3-factory').disabled=!state.canMove||!state.positions||state.positions[2]!>4075;
  const command=state.home?.command;
  const homeCommands=state.operation==='Home'?state.home?.commands:null;
  node('teacher-motion-detail').textContent=['Fault','Settled short'].includes(state.home?.phase??'')?state.home!.message:homeCommands?.length?`Home: ${homeCommands.map(c=>`S${c.servo} reported ${c.actual}, target ${c.target}, remaining ${c.error}`).join('; ')}. Speed ${state.home?.speed}, acceleration ${state.home?.acceleration}.`:command?`Servo ${command.servo}: start ${command.from}, target ${command.target}, reported ${command.actual}, remaining ${command.error} raw units. Speed ${state.home?.speed}, acceleration ${state.home?.acceleration}.`:'No movement command sent yet.';
  const runningHome = state.operation === 'Home' && state.home?.phase === 'Running';
  const count = state.positions ? state.positions.filter((n,i)=>Math.abs(n-TEACHER_HOME[i]!)>9).length : 0;
  const seconds = Math.ceil(Math.max(...(state.positions?.map((n,i)=>Math.abs(n-TEACHER_HOME[i]!)/HOME_SPEED)??[0])));
  const duration = seconds >= 60 ? `about ${Math.ceil(seconds / 60)} minutes` : `about ${Math.max(1, seconds)} seconds`;
  node('teacher-home-preview').textContent = !state.positions ? 'Connect for a return estimate.' : runningHome ? 'Home joints are moving together. Other controls wait until it finishes or you Stop.' : count ? `${count} joint movements starting together; ${duration} plus acceleration and settling. Review clearance for the combined sweep before clicking Return.` : 'Already within 9 raw units of your Home values; no return is needed.';
  node<HTMLButtonElement>('teacher-home').disabled = !state.canMove || !count;
  const progress = node<HTMLProgressElement>('teacher-home-progress');
  progress.max = state.operation === 'Home' ? Math.max(1, state.home?.totalSteps ?? 0) : 1;
  progress.value = state.operation === 'Home' ? state.home?.completedWaypoints ?? 0 : 0;
  const report = state.operation === 'Home' ? state.home : null;
  node('teacher-home-status').textContent = report ? `${report.phase} · ${report.completedWaypoints}/${report.totalSteps} joints settled${runningHome ? ' · Moving together' : ''}` : 'No return started.';
  node<HTMLButtonElement>('teacher-release').disabled = !support.checked || !state.canRelease;
  node<HTMLButtonElement>('teacher-restore').disabled = !support.checked || !state.canRestore;
  node<HTMLButtonElement>('teacher-confirm-holding').disabled = !held.checked || !state.canConfirmHolding;
  node('teacher-manual-status').textContent = `${state.manualPhase}: ${state.manualMessage}${state.manualReason ? ` ${state.manualReason}` : ''}`;
  if (state.manualPhase !== 'Normal') node<HTMLDetailsElement>('teacher-manual-details').open = true;
}
if (serial && navigator.locks) {
  try { control = new TeacherRobotControl(navigator.locks, localStorage, () => performance.now(), () => !document.hidden, refresh); }
  catch { node('teacher-status').textContent = 'Could not initialize local holding-state storage.'; node<HTMLButtonElement>('teacher-connect').disabled = true; }
} else {
  node('teacher-status').textContent = 'Use Chrome or Edge with Web Serial on HTTPS or localhost.';
  node<HTMLButtonElement>('teacher-connect').disabled = true;
}
node('teacher-connect').onclick = () => act(() => control?.connect(() => serial!.requestPort()));
node('teacher-disconnect').onclick = () => act(() => { clearance.checked = false; control?.disconnect(); });
node('teacher-enable').onclick = () => act(() => control?.enable(clearance.checked));
node('teacher-servo3-factory').onclick=()=>act(()=>control?.compareServo3Factory());
node('teacher-home').onclick = () => act(() => control?.returnHome());
node('teacher-stop').onclick = () => act(() => { clearance.checked = false; control?.stop(); });
clearance.onchange = () => act(() => { if (!clearance.checked) control?.stop(); });
support.onchange = held.onchange = refresh;
node('teacher-release').onclick = () => act(() => { control?.setHolding(false, support.checked); held.checked = false; });
node('teacher-restore').onclick = () => act(() => { control?.setHolding(true, support.checked); held.checked = false; });
node('teacher-confirm-holding').onclick = () => act(() => { control?.confirmHolding(held.checked); held.checked = support.checked = false; });
node('teacher-export').onclick = () => {
  if (!control) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(control.report(), null, 2)], {type: 'application/json'}));
  const link = document.createElement('a'); link.href = url; link.download = 'nexarm-teacher-control-session.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
node('teacher-diagnostic-export').onclick=()=>node<HTMLButtonElement>('teacher-export').click();
const disconnect = () => { clearance.checked = false; control?.disconnect(); };
document.addEventListener('visibilitychange', () => { if (document.hidden) disconnect(); });
window.addEventListener('pagehide', disconnect); window.addEventListener('error', disconnect); window.addEventListener('unhandledrejection', disconnect);
setInterval(() => control?.tick(), 50); refresh();
