import './styles.css';
import { ApprovedMappingTest } from './safety/ApprovedMappingTest';
import type { TestPort } from './safety/ApprovedMappingTest';
const node = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const setup = node<HTMLInputElement>('mapping-setup');
const connect = node<HTMLButtonElement>('mapping-connect'), enable = node<HTMLButtonElement>('mapping-enable'), send = node<HTMLButtonElement>('mapping-send');
const values = Array.from({ length: 6 }, (_, i) => { const card = document.createElement('div'); card.className = 'joint-card'; const title = document.createElement('h3'); title.textContent = `Reported servo ${i + 1}`; const value = document.createElement('strong'); value.textContent = '—'; card.append(title,value); node('mapping-positions').append(card); return value; });
const serial = (navigator as Navigator & { serial?: { requestPort(): Promise<TestPort> } }).serial;
let test: ApprovedMappingTest | null = null;
const refresh = () => {
  if (!test) { connect.disabled = enable.disabled = send.disabled = true; return; }
  const state = test.snapshot();
  connect.disabled = !setup.checked || !state.canConnect;
  enable.disabled = !setup.checked || !state.canEnable; send.disabled = !setup.checked || !state.canSend;
  node('mapping-message').textContent = state.message; node('mapping-gate').textContent = state.reason ?? 'Starting-state checks pass.';
  node('mapping-phase').textContent = `${state.connectionState} · ${state.phase}`;
  values.forEach((value, i) => { value.textContent = state.positions ? String(state.positions[i]) : '—'; });
};
if (serial && navigator.locks) {
  try { test = new ApprovedMappingTest(navigator.locks, localStorage, () => performance.now(), () => !document.hidden, refresh); }
  catch { node('mapping-message').textContent = 'Local approval storage is unavailable. Sending is disabled.'; }
} else node('mapping-message').textContent = 'Supported Web Serial, exclusive browser locks, and local approval storage are required.';
setup.onchange = () => { if (!setup.checked) test?.stop(); refresh(); };
connect.onclick = () => { if (setup.checked && serial) test?.connect(() => serial.requestPort()); };
enable.onclick = () => { try { test?.enable(setup.checked); } catch (error) { node('mapping-message').textContent = String(error); } };
send.onclick = () => { if (!setup.checked) return; try { test?.send(); } catch (error) { node('mapping-message').textContent = String(error); } };
node('mapping-stop').onclick = () => test?.stop();
node('mapping-export').onclick = () => {
  if (!test) return;
  const json = JSON.stringify(test.report(), null, 2); node('mapping-report').textContent = json;
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'nexarm-mapping-test-result.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const stop = () => test?.stop(); document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
window.addEventListener('pagehide', stop); window.addEventListener('error', stop); window.addEventListener('unhandledrejection', stop);
setInterval(() => test?.tick(), 50); refresh();
