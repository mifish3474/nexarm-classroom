import './styles.css';
import { TeacherRobotControl } from './safety/TeacherRobotControl';
import type { TeacherPort } from './safety/TeacherRobotControl';
import { slowHomeStepCount, TEACHER_HOME, SLOW_HOME_INTERVAL_MS } from './safety/TeacherControlPlan';

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
  actions.append(minus, plus); card.append(title, value, home, actions); node('teacher-joints').append(card);
  return {value, minus, plus};
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
    const value = state.positions?.[i]; card.value.textContent = value === undefined ? '—' : String(value);
    card.minus.disabled = !state.canMove || value === undefined || value < 20;
    card.plus.disabled = !state.canMove || value === undefined || value > 4075;
    card.minus.title = value === undefined ? 'Wait for readings.' : `Target ${value - 20}`;
    card.plus.title = value === undefined ? 'Wait for readings.' : `Target ${value + 20}`;
  });
  const runningHome = state.operation === 'Home' && state.home?.phase === 'Running';
  const count = state.positions ? slowHomeStepCount(state.positions) : 0;
  const seconds = Math.ceil(Math.max(0, count - 1) * SLOW_HOME_INTERVAL_MS / 1000);
  const duration = seconds >= 60 ? `about ${Math.ceil(seconds / 60)} minutes` : `about ${Math.max(1, seconds)} seconds`;
  node('teacher-home-preview').textContent = !state.positions ? 'Connect for a route estimate.' : runningHome ? 'Home is running. Jog buttons are paused until it finishes or you Stop.' : count ? `${count} small steps; ${duration} plus any feedback waits. Review the joint order and clearance before clicking Return.` : 'Already within 9 raw units of your Home values; no return is needed.';
  node<HTMLButtonElement>('teacher-home').disabled = !state.canMove || !count;
  const progress = node<HTMLProgressElement>('teacher-home-progress');
  progress.max = state.operation === 'Home' ? Math.max(1, state.home?.totalSteps ?? 0) : 1;
  progress.value = state.operation === 'Home' ? state.home?.completedWaypoints ?? 0 : 0;
  const report = state.operation === 'Home' ? state.home : null, next = report?.next;
  node('teacher-home-status').textContent = report ? `${report.phase} · ${report.completedWaypoints}/${report.totalSteps} steps${runningHome && next ? ` · Servo ${next.servo} toward ${next.target}` : ''}` : 'No return started.';
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
const disconnect = () => { clearance.checked = false; control?.disconnect(); };
document.addEventListener('visibilitychange', () => { if (document.hidden) disconnect(); });
window.addEventListener('pagehide', disconnect); window.addEventListener('error', disconnect); window.addEventListener('unhandledrejection', disconnect);
setInterval(() => control?.tick(), 50); refresh();
