import './styles.css';
import { PassiveConnection } from './serial/PassiveConnection';
import type { ReadOnlyPort } from './serial/PassiveConnection';
import { decodePositions, FrameParser } from './protocol/FrameParser';
import { ReferenceCapture } from './robot/ReferenceCapture';

const node = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const connect = node<HTMLButtonElement>('connect-passive'), disconnect = node<HTMLButtonElement>('disconnect-passive');
const record = node<HTMLButtonElement>('capture-reference'), download = node<HTMLButtonElement>('export-reference');
const ack = node<HTMLInputElement>('acknowledge');
const capture = new ReferenceCapture(), parser = new FrameParser();
let listening = false, busy = false, full = 0, weak = 0;
let draft: ReturnType<ReferenceCapture['capture']> | null = null;
const values = Array.from({ length: 6 }, (_, i) => {
  const card = document.createElement('div'); card.className = 'joint-card';
  const label = document.createElement('h3'); label.textContent = `Reported servo ${i + 1}`;
  const value = document.createElement('strong'); value.textContent = '—'; card.append(label, value);
  node('reported-positions').append(card); return value;
});
const invalidate = () => { capture.clear(); values.forEach(value => { value.textContent = '—'; }); };
const refresh = () => {
  connect.disabled = !connection || busy || !ack.checked;
  record.disabled = !listening || capture.reason(performance.now()) !== null;
  node('reference-status').textContent = listening ? capture.reason(performance.now()) ?? 'A draft observation can be recorded. This is not calibrated or approved for motion.' : 'No active reference observation.';
};
// Feature detection only on this separate, explicitly opened teacher page.
const serial = (navigator as Navigator & { serial?: { requestPort(): Promise<ReadOnlyPort> } }).serial;
const connection = navigator.locks && serial ? new PassiveConnection((state, message) => {
  busy = state !== 'Disconnected'; listening = state === 'Listening';
  disconnect.disabled = state === 'Disconnected' || state === 'Closing';
  if (!listening) invalidate();
  node('connection-status').textContent = message; refresh();
}, bytes => {
  for (const frame of parser.push(bytes)) {
    if (frame.deviceId !== 255 || frame.command !== 11 || frame.payload.length !== 24) continue;
    if (frame.integrity === 'abbreviated-only') { weak++; invalidate(); }
    else {
      const positions = decodePositions(frame);
      if (positions) {
        full++; capture.observe(positions, performance.now());
        values.forEach((value, i) => { value.textContent = String(positions[i]); });
      } else invalidate();
    }
    node('integrity-status').textContent = `Expected full-checksum frames: ${full}. Abbreviated-only frames: ${weak}. Abbreviated-only data cannot become a reference.`;
  }
  refresh();
}, navigator.locks) : null;
if (!connection) node('connection-status').textContent = 'Read-only USB inspection requires Web Serial and exclusive tab locks in a supported browser over HTTPS or localhost.';
ack.onchange = () => { if (!ack.checked) connection?.disconnect(); refresh(); };
connect.onclick = () => {
  if (!connection || !serial || !ack.checked || document.hidden) return;
  parser.reset(); invalidate(); full = 0; weak = 0;
  connection.connect(() => serial.requestPort());
};
disconnect.onclick = () => connection?.disconnect();
record.onclick = () => {
  if (!listening) return;
  try { draft = capture.capture(performance.now()); node('reference-output').textContent = JSON.stringify(draft, null, 2); download.disabled = false; }
  catch (error) { node('reference-status').textContent = error instanceof Error ? error.message : 'Cannot record reference.'; }
};
download.onclick = () => {
  if (!draft) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'nexarm-reference-draft.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
node('clear-reference').onclick = () => { draft = null; download.disabled = true; node('reference-output').textContent = 'No draft recorded.'; };
const stop = () => { invalidate(); listening = false; connection?.disconnect(); refresh(); };
document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
window.addEventListener('pagehide', stop); window.addEventListener('error', stop); window.addEventListener('unhandledrejection', stop);
setInterval(refresh, 100); refresh();
