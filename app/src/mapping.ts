import './styles.css';
import { ApprovedMappingTest } from './safety/ApprovedMappingTest';
import { REMAINING_TESTS, jointPlan } from './safety/JointTestPlans';
import { encodeGoalPosition } from './protocol/NexArmCodec';
import { referenceReturnProposal } from './safety/ReferenceReturnProposal';
import type { TestPort } from './safety/ApprovedMappingTest';
const node = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const setup = node<HTMLInputElement>('mapping-setup'), grip = node<HTMLInputElement>('mapping-gripper-clear');
const choose = node<HTMLSelectElement>('mapping-joint');
const homeClear=node<HTMLInputElement>('home-clear'),homeEnable=node<HTMLButtonElement>('home-enable'),homeStart=node<HTMLButtonElement>('home-start');
const connect = node<HTMLButtonElement>('mapping-connect'), enable = node<HTMLButtonElement>('mapping-enable'), send = node<HTMLButtonElement>('mapping-send');
const reference = [2048,2048,2047,2048,2042,2053];
let selected = 2;
type Report = ReturnType<ApprovedMappingTest['report']>;
const reports = new Map<number, Report>();
const notes = new Map<number, { joint: string; direction: string; other: string }>();
const tableRows = REMAINING_TESTS.map(plan => {
  const option = document.createElement('option'); option.value = String(plan.servo); option.textContent = `Servo ${plan.servo} · ${plan.hypothesis} hypothesis`; choose.append(option);
  const row = document.createElement('tr');
  for (const text of [String(plan.servo), plan.hypothesis, `${plan.startMin}–${plan.startMax}`, String(plan.target)]) { const cell = document.createElement('td'); cell.textContent = text; row.append(cell); }
  const result = document.createElement('td'); result.textContent = 'Not attempted'; row.append(result);
  node('mapping-test-table').append(row);
  return { servo: plan.servo, result };
});
const values = Array.from({ length: 6 }, (_, i) => {
  const card = document.createElement('div'); card.className = 'joint-card'; const title = document.createElement('h3'); title.textContent = `Reported servo ${i + 1}`;
  const value = document.createElement('strong'), difference = document.createElement('span'); value.textContent = '—'; difference.className = 'target';
  card.append(title,value,difference); node('mapping-positions').append(card); return { value, difference };
});
const serial = (navigator as Navigator & { serial?: { requestPort(): Promise<TestPort> } }).serial;
let test: ApprovedMappingTest | null = null;
let terminal = '';
function retain() {
  if (test?.snapshot().attempted) reports.set(selected, test.report());
}
const refresh = () => {
  if (!test) { connect.disabled = enable.disabled = send.disabled = true; return; }
  const state = test.snapshot(), plan = jointPlan(selected);
  if (state.attempted && ['Complete','Fault','Stopped'].includes(state.phase) && terminal !== `${selected}:${state.phase}`) { retain(); terminal = `${selected}:${state.phase}`; }
  connect.disabled = !setup.checked || !state.canConnect;
  enable.disabled = !setup.checked || !state.canEnable || (selected === 6 && !grip.checked);
  send.disabled = !setup.checked || !state.canSend || (selected === 6 && !grip.checked);
  choose.disabled = !state.canSelect;
  homeEnable.disabled=!homeClear.checked||!state.homeCanEnable;homeStart.disabled=!homeClear.checked||!state.homeCanStart;
  node('home-state').textContent=`${state.homePhase}: ${state.homeMessage??''}`;
  node('mapping-gripper-warning').hidden = selected !== 6;
  send.textContent = `Send single test: servo ${selected} to ${plan.target}`;
  node('mapping-scope').textContent = `Servo ${selected}: start ${plan.startMin}–${plan.startMax} → fixed target ${plan.target} (15–25 raw units positive). Physical joint: ${plan.hypothesis}, to be verified.`;
  node('mapping-packet').textContent = [...encodeGoalPosition(selected,plan.target)].map(n => n.toString(16).padStart(2,'0').toUpperCase()).join(' ');
  node('mapping-message').textContent = state.message; node('mapping-gate').textContent = state.reason ?? 'Starting-state checks pass.';
  node('mapping-phase').textContent = `${state.connectionState} · ${state.phase}`;
  let outside = 0;
  values.forEach((card, i) => {
    card.value.textContent = state.positions ? String(state.positions[i]) : '—';
    const delta = state.positions ? state.positions[i]! - reference[i]! : null;
    card.difference.textContent = delta === null ? `Reference A: ${reference[i]}` : `Reference A: ${reference[i]} · difference ${delta >= 0 ? '+' : ''}${delta}`;
    if (delta !== null && Math.abs(delta) > 5) outside++;
  });
  node('mapping-home-status').textContent = !state.positions ? 'Connect to compare reported values with Reference A.' : outside ? `${outside} joint(s) differ from Reference A by more than 5 raw units. This comparison does not move or calibrate the robot. Return-to-reference requires a reviewed route.` : 'All readings are within ±5 of Reference A. This is a comparison, not approval of a home route.';
  if (state.positions) {
    try { const frozen=test.returnReport();const steps=frozen?.phase==='Enabled'||frozen?.phase==='Running'?frozen.steps:referenceReturnProposal(state.positions); node('mapping-home-proposal').textContent = steps.length?steps.map((step,index)=>`${index+1}. Servo ${step.servo} → ${step.target} (${step.delta>=0?'+':''}${step.delta} nominal raw) · ${step.packet}`).join('\n'):'No movement needed: all joints already within ±5 of Reference A.'; }
    catch (error) { node('mapping-home-proposal').textContent = error instanceof Error ? error.message : 'Return route needs review.'; }
  }
  for (const row of tableRows) {
    try { row.result.textContent = reports.get(row.servo)?.phase ?? (localStorage.getItem(jointPlan(row.servo).key) ? 'Attempt consumed · report separately if not exported' : 'Not attempted'); }
    catch { row.result.textContent = 'Storage unavailable'; }
  }
};
if (serial && navigator.locks) {
  try { test = new ApprovedMappingTest(navigator.locks, localStorage, () => performance.now(), () => !document.hidden, refresh, selected); }
  catch { node('mapping-message').textContent = 'Local approval storage is unavailable. Sending is disabled.'; }
} else node('mapping-message').textContent = 'Supported Web Serial, exclusive browser locks, and local approval storage are required.';
choose.onchange = () => {
  const servo = Number(choose.value); if (!REMAINING_TESTS.some(plan => plan.servo === servo)) return;
  try {
    retain(); test?.selectJoint(servo); selected = servo; terminal = '';
    setup.checked = false; grip.checked = false;
    const saved = notes.get(selected);
    node<HTMLInputElement>('observed-joint').value = saved?.joint ?? '';
    node<HTMLInputElement>('observed-direction').value = saved?.direction ?? '';
    node<HTMLTextAreaElement>('observed-other').value = saved?.other ?? '';
    refresh();
  } catch (error) { choose.value = String(selected); node('mapping-message').textContent = String(error); }
};
setup.onchange = () => { if (!setup.checked) test?.stop(); refresh(); };
grip.onchange = () => { if (!grip.checked && selected === 6 && test?.snapshot().phase === 'Enabled') test.stop(); refresh(); };
connect.onclick = () => { if (setup.checked && serial) test?.connect(() => serial.requestPort()); };
enable.onclick = () => { try { test?.enable(setup.checked,grip.checked); } catch (error) { node('mapping-message').textContent = String(error); } };
homeClear.onchange=()=>{if(!homeClear.checked&&['Enabled','Running'].includes(test?.returnReport()?.phase??''))test?.stop();refresh();};
homeEnable.onclick=()=>{try{retain();test?.enableReturn(homeClear.checked,homeClear.checked);}catch(error){node('home-state').textContent=String(error);}};
homeStart.onclick=()=>{try{test?.startReturn(homeClear.checked,homeClear.checked);}catch(error){node('home-state').textContent=String(error);}};
send.onclick = () => { if (!setup.checked) return; try { test?.send(grip.checked); } catch (error) { node('mapping-message').textContent = String(error); } };
node('mapping-stop').onclick = () => test?.stop();
for (const id of ['observed-joint','observed-direction','observed-other']) node(id).addEventListener('input', () => {
  notes.set(selected, { joint: node<HTMLInputElement>('observed-joint').value, direction: node<HTMLInputElement>('observed-direction').value, other: node<HTMLTextAreaElement>('observed-other').value });
});
node('mapping-export').onclick = () => {
  if (!test) return; retain();
  const output = { format: 'nexarm-joint-suite-report', schemaVersion: 1, capturedAt: new Date().toISOString(),
    confirmedBase: { servo: 1, before: 2051, latest: 2066, physicalJoint: 'Base turn', observedDirection: 'Increasing raw value turns clockwise viewed directly from above', source: 'Prior teacher-confirmed test; not repeated by this suite' },
    stagedReturn:test.returnReport(),tests: REMAINING_TESTS.map(plan => ({ servo: plan.servo, target: plan.target, result: reports.get(plan.servo) ?? null, observation: notes.get(plan.servo) ?? null })) };
  const json = JSON.stringify(output,null,2); node('mapping-report').textContent = json;
  const url = URL.createObjectURL(new Blob([json],{type:'application/json'})); const link = document.createElement('a'); link.href = url; link.download = 'nexarm-joint-suite-report.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
};
const stop = () => test?.stop(); document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
window.addEventListener('pagehide', stop); window.addEventListener('error', stop); window.addEventListener('unhandledrejection', stop);
window.addEventListener('beforeunload', event => { if (reports.size || notes.size || test?.returnReport()) { event.preventDefault(); } });
setInterval(() => test?.tick(),50); refresh();
