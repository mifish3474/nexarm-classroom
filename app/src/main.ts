import './styles.css';
import { RobotSimulator } from './simulation/RobotSimulator';
import { createArmIllustration } from './simulation/ArmIllustration';
import { createEditor } from './blocks/editor';
import { ProgramRunner } from './runtime/ProgramRunner';
import type { PlannedStep } from './runtime/instructions';
import type { ServoId } from './protocol/NexArmCodec';

function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing interface element: ${id}`);
  return node as T;
}
const simulator = new RobotSimulator();
const runner = new ProgramRunner();
const editor = createEditor(element('blockly-editor'));
const draw = createArmIllustration(element('arm-illustration'));
const run = element<HTMLButtonElement>('run'), stop = element<HTMLButtonElement>('stop'), lesson = element<HTMLButtonElement>('lesson');
const status = element('run-status');
let preparing = false, session = 0;
let plan: PlannedStep[] = [];
let rows: HTMLLIElement[] = [];
const cards = Array.from({ length: 6 }, (_, index) => {
  const servo = (index + 1) as ServoId;
  const card = document.createElement('section'); card.className = 'joint-card';
  const title = document.createElement('h3'); title.textContent = `Joint ${servo}`;
  const measured = document.createElement('strong'), target = document.createElement('span'); target.className = 'target';
  const meter = document.createElement('meter'); meter.min = 0; meter.max = 4095; meter.setAttribute('aria-label', `Joint ${servo} simulated raw position`);
  const controls = document.createElement('div'); controls.className = 'jog-controls';
  const buttons = [-20, 20].map(delta => {
    const button = document.createElement('button'); button.className = 'secondary'; button.textContent = delta > 0 ? '+20' : '−20';
    button.setAttribute('aria-label', `Simulate joint ${servo} ${delta > 0 ? 'plus' : 'minus'} 20 raw units`);
    button.onclick = () => { plan = []; try { simulator.jog(servo, delta); } catch { status.textContent = 'That move exceeds the simulation range.'; } };
    controls.append(button); return button;
  });
  card.append(title, measured, target, meter, controls); element('joints').append(card);
  return { measured, target, meter, buttons };
});
const refresh = () => {
  const snapshot = simulator.snapshot(), busy = preparing || snapshot.status === 'Running';
  run.disabled = busy; stop.disabled = !busy; lesson.disabled = busy;
  element('blockly-editor').inert = busy; element('keyboard-fields').inert = busy;
  element('state').textContent = preparing ? 'Preparing' : snapshot.status;
  status.textContent = preparing ? 'Checking your program…' : snapshot.status === 'Running' ? 'Simulating. Watch the highlighted block and virtual arm.' : snapshot.status === 'Completed' ? 'Complete. Did the result match your prediction?' : snapshot.status === 'Stopped' ? 'Stopped. Pending simulation steps were canceled.' : 'Ready to simulate.';
  cards.forEach((card, i) => {
    card.measured.textContent = String(snapshot.positions[i]); card.target.textContent = `Target ${snapshot.targets[i]}`; card.meter.value = snapshot.positions[i]!;
    card.buttons.forEach(button => { button.disabled = busy; });
  });
  const active = snapshot.activeStep === null ? undefined : plan[snapshot.activeStep];
  editor.highlight(active?.blockId ?? null);
  rows.forEach((row, i) => row.classList.toggle('active', !!active && snapshot.activeStep === i));
  draw(snapshot.positions, snapshot.status === 'Running');
};
simulator.subscribe(refresh);
function keyboardFields() {
  const container = element('keyboard-fields'); container.replaceChildren();
  editor.workspace.getAllBlocks(true).forEach((block, index) => {
    const names = block.type === 'lesson_repeat' ? ['COUNT'] : block.type === 'lesson_move' ? ['SERVO', 'TARGET'] : [];
    for (const name of names) {
      const label = document.createElement('label'); label.textContent = `Block ${index + 1} · ${name === 'COUNT' ? 'repeat count' : name === 'SERVO' ? 'joint' : 'target'}`;
      const input = document.createElement('input'); input.type = 'number'; input.step = '1';
      input.min = name === 'TARGET' ? '0' : '1'; input.max = name === 'COUNT' ? '20' : name === 'SERVO' ? '6' : '4095';
      input.value = String(block.getFieldValue(name));
      input.onchange = () => { if (input.validity.valid && input.value !== '') block.setFieldValue(input.value, name); };
      label.append(input); container.append(label);
    }
  });
}
keyboardFields();
editor.workspace.addChangeListener(event => { if (!event.isUiEvent && !preparing && simulator.snapshot().status !== 'Running') keyboardFields(); });
function cancel() { session++; runner.cancel(); preparing = false; simulator.stop(); }
run.onclick = async () => {
  if (preparing || simulator.snapshot().status === 'Running') return;
  const ownSession = ++session;
  try {
    const instructions = editor.compile(); preparing = true; plan = []; refresh();
    const result = await runner.prepare(instructions);
    if (ownSession !== session) return;
    plan = result; preparing = false; element('instructions').replaceChildren();
    rows = plan.map(step => { const row = document.createElement('li'); row.textContent = `Move virtual joint ${step.servo} to ${step.target}`; element('instructions').append(row); return row; });
    simulator.run(plan);
  } catch (error) {
    if (ownSession !== session) return;
    preparing = false; refresh(); status.textContent = error instanceof Error ? error.message : 'Program could not run.';
  }
};
stop.onclick = cancel;
element('reset').onclick = () => { cancel(); simulator.reset(); };
lesson.onclick = () => { cancel(); editor.lesson(); keyboardFields(); simulator.reset(); };
document.addEventListener('visibilitychange', () => { if (document.hidden) cancel(); });
window.addEventListener('pagehide', cancel); window.addEventListener('error', cancel); window.addEventListener('unhandledrejection', cancel);
