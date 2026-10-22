const ns = 'http://www.w3.org/2000/svg';
function svgNode(tag: string, attributes: Record<string, string>, parent: SVGElement) {
  const node = document.createElementNS(ns, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  parent.append(node); return node;
}

export function createArmIllustration(container: HTMLElement) {
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 560 510'); svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Illustrated virtual arm. Base turn, three bending joints, wrist rotation and gripper opening are exaggerated for learning. Not a calibrated NexArm model.');
  const title = svgNode('title', {}, svg); title.textContent = 'Virtual arm illustration';
  svgNode('path', { d: 'M20 480 H540', stroke: '#cad9e3', 'stroke-width': '2' }, svg);
  svgNode('rect', { x: '240', y: '280', width: '80', height: '24', rx: '8', fill: '#29485b' }, svg);
  const base = svgNode('g', { transform: 'translate(70 78)' }, svg);
  svgNode('circle', { r: '36', fill: '#e1eff2', stroke: '#8ab2bd' }, base);
  const yaw = svgNode('path', { d: 'M0 0 L28 0', stroke: '#086b73', 'stroke-width': '7', 'stroke-linecap': 'round', 'data-joint': '1' }, base);
  const baseLabel = svgNode('text', { x: '25', y: '138', fill: '#476075', 'font-size': '14' }, svg); baseLabel.textContent = 'J1 · base turn';
  const links = Array.from({ length: 3 }, () => svgNode('line', { stroke: '#168c97', 'stroke-width': '20', 'stroke-linecap': 'round' }, svg));
  const joints = Array.from({ length: 4 }, () => svgNode('circle', { r: '12', fill: '#fff', stroke: '#29485b', 'stroke-width': '5' }, svg));
  const labels = ['J2', 'J3', 'J4'].map(text => { const node = svgNode('text', { fill: '#29485b', 'font-size': '15', 'font-weight': '700' }, svg); node.textContent = text; return node; });
  const tool = svgNode('g', {}, svg);
  const roll = svgNode('path', { d: 'M-9 0 H9', stroke: '#ae7200', 'stroke-width': '5' }, tool);
  const fingers = [-1, 1].map(() => svgNode('path', { fill: 'none', stroke: '#29485b', 'stroke-width': '6', 'stroke-linecap': 'round' }, tool));
  const toolLabel = svgNode('text', { fill: '#476075', 'font-size': '14' }, svg);
  toolLabel.textContent = 'J5 · roll / J6 · grip';
  container.append(svg);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const controls = document.createElement('div'); controls.className = 'animation-controls';
  const label = document.createElement('label');
  const toggle = document.createElement('input'); toggle.type = 'checkbox'; toggle.checked = !reduced.matches;
  label.append(toggle, ' Animate arm illustration');
  const notice = document.createElement('p'); notice.className = 'note'; notice.setAttribute('role', 'status');
  controls.append(label, notice); container.before(controls);
  let userSelected = false;
  const explain = () => {
    notice.textContent = toggle.checked ? 'Animation on. The drawing follows the simulated joint readings.' : reduced.matches && !userSelected ? 'Your device requests reduced motion, so animation is off. Readings still update; a program ending at its starting pose may look unchanged. Select the checkbox to animate.' : 'Animation off. The drawing updates only when movement stops or completes.';
  };
  explain();
  let last = Array<number>(6).fill(2048);
  const draw = (positions: readonly number[], running: boolean) => {
    last = [...positions];
    if (!toggle.checked && running) return;
    // Deliberately illustrative scaling, never forward kinematics or real angles.
    const offset = (i: number) => Math.max(-75, Math.min(75, (positions[i]! - 2048) * .25));
    yaw.setAttribute('transform', `rotate(${offset(0)})`);
    const angles = [-65 + offset(1), 75 + offset(2), -30 + offset(3)];
    const lengths = [85, 75, 45];
    let x = 280, y = 280, angle = 0;
    joints[0]!.setAttribute('cx', String(x)); joints[0]!.setAttribute('cy', String(y));
    for (let i = 0; i < 3; i++) {
      angle += angles[i]!;
      const nx = x + lengths[i]! * Math.cos(angle * Math.PI / 180);
      const ny = y + lengths[i]! * Math.sin(angle * Math.PI / 180);
      const line = links[i]!;
      for (const [key, value] of Object.entries({ x1: x, y1: y, x2: nx, y2: ny })) line.setAttribute(key, String(value));
      labels[i]!.setAttribute('x', String(x - 32)); labels[i]!.setAttribute('y', String(y - 20));
      joints[i + 1]!.setAttribute('cx', String(nx)); joints[i + 1]!.setAttribute('cy', String(ny));
      x = nx; y = ny;
    }
    tool.setAttribute('transform', `translate(${x} ${y}) rotate(${angle})`);
    roll.setAttribute('transform', `rotate(${offset(4)})`);
    const gap = Math.max(5, Math.min(26, 14 + offset(5) * .2));
    fingers.forEach((finger, i) => { const sign = i === 0 ? -1 : 1; finger.setAttribute('d', `M8 ${sign * gap} H29 L35 ${sign * (gap - 4)}`); });
    toolLabel.setAttribute('x', String(Math.min(x - 40, 380))); toolLabel.setAttribute('y', String(y + 48));
  };
  toggle.addEventListener('change', () => { userSelected = true; explain(); draw(last, false); });
  reduced.addEventListener('change', () => {
    if (!userSelected) toggle.checked = !reduced.matches;
    explain(); draw(last, false);
  });
  return draw;
}
