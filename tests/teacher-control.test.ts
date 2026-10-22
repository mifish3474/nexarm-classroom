import { describe, expect, it, vi } from 'vitest';
import { TeacherRobotControl } from '../app/src/safety/TeacherRobotControl';
import { jogPlan, slowHomePlan, slowHomeStepCount, TEACHER_HOME, HOME_ORDER } from '../app/src/safety/TeacherControlPlan';
import { MANUAL_STATE_KEY } from '../app/src/safety/ManualPositioning';

const flush = async () => { for (let i = 0; i < 35; i++) await Promise.resolve(); };
const locks = {request: async (_name: string, _options: unknown, run: (lease: object) => Promise<void>) => run({})} as unknown as LockManager;
function fixture(options: {hang?: boolean; reject?: boolean; storageFails?: boolean; stored?: Map<string, string>} = {}) {
  let time = 0, visible = true, reader!: ReadableStreamDefaultController<Uint8Array>, finish!: () => void;
  const stored = options.stored ?? new Map<string, string>(), writes: {at: number; bytes: number[]}[] = [];
  const storage = {getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => {
    if (options.storageFails) throw new Error('Storage failed'); stored.set(key, value);
  }};
  const port = {open: vi.fn(async () => {}), close: vi.fn(async () => {}),
    readable: new ReadableStream<Uint8Array>({start(controller) { reader = controller; }}),
    writable: new WritableStream<Uint8Array>({write(bytes) {
      writes.push({at: time, bytes: [...bytes]});
      if (options.reject) return Promise.reject(new Error('USB write failed'));
      if (options.hang) return new Promise<void>(resolve => { finish = resolve; });
    }})};
  const control = new TeacherRobotControl(locks, storage, () => time, () => visible, () => {});
  const feed = async (at: number, positions: readonly number[] = TEACHER_HOME, weak = false) => {
    time = at;
    const body = [255, 26, 11, ...Array(12).fill(0), ...positions.flatMap(n => [n & 255, n >> 8])];
    const checksum = (~(weak ? body.slice(0, 3) : body).reduce((a, b) => a + b, 0)) & 255;
    reader.enqueue(Uint8Array.from([255, 255, ...body, checksum])); await flush();
  };
  const window = async (start: number, positions: readonly number[] = TEACHER_HOME) => {
    for (let at = start; at <= start + 1100; at += 100) await feed(at, positions);
  };
  const ready = async (positions: readonly number[] = TEACHER_HOME) => { control.connect(async () => port); await flush(); await window(0, positions); };
  return {control, port, writes, stored, feed, window, ready, time: () => time, setTime: (at: number) => { time = at; },
    hide: () => { visible = false; }, finish: () => finish()};
}
const targetOf = (bytes: number[]) => bytes[6]! + 256 * bytes[7]!;

describe('teacher Home planning', () => {
  it('uses exactly the requested Home and a finite ordered route with nominal steps <=10', () => {
    expect(TEACHER_HOME).toEqual([2050,2150,2100,2200,2000,1080]);
    const start = [2048,2048,2047,2048,2042,2053], plan = slowHomePlan(start);
    expect([...new Set(plan.steps.map(s => s.servo))]).toEqual(HOME_ORDER.filter(s => s !== 1));
    expect(plan.steps.length).toBe(slowHomeStepCount(start)); expect(plan.steps.length).toBeGreaterThan(100);
    expect(plan).toMatchObject({intervalMs: 1200, maxCommandDelta: 20});
    const current = [...start];
    for (const step of plan.steps) {
      expect(step.from).toBe(current[step.servo - 1]); expect(Math.abs(step.delta)).toBeLessThanOrEqual(10);
      expect(step.target).toBeGreaterThanOrEqual(0); expect(step.target).toBeLessThanOrEqual(4095);
      current[step.servo - 1] = step.target;
    }
    expect(current.every((n, i) => Math.abs(n - TEACHER_HOME[i]!) <= 9)).toBe(true);
    expect(current[5]).toBe(1080); expect(Object.isFrozen(plan.steps)).toBe(true);
  });
  it.each([0,4095])('plans from encodable extreme readings %s without claiming mechanical limits', raw => {
    const positions = Array(6).fill(raw);
    const plan = slowHomePlan(positions); expect(plan.steps.length).toBeLessThanOrEqual(2460);
    expect(plan.steps.length).toBe(slowHomeStepCount(positions));
    expect(plan.steps.every(s => Math.abs(s.delta) <= 10)).toBe(true);
  });
  it('skips ordinary residual error and rejects invalid jog requests without clamping them', () => {
    expect(slowHomePlan(TEACHER_HOME.map(n => n + 9)).steps).toEqual([]);
    expect(() => jogPlan(TEACHER_HOME, 0, 20)).toThrow(); expect(() => jogPlan(TEACHER_HOME, 2, 200)).toThrow();
    expect(() => jogPlan([0,...TEACHER_HOME.slice(1)], 1, -20)).toThrow('0 to 4095');
    expect(() => jogPlan([4090,...TEACHER_HOME.slice(1)], 1, 20)).toThrow('0 to 4095');
    expect(() => slowHomePlan([NaN,1,2,3,4,5])).toThrow(); expect(() => slowHomePlan([1,2])).toThrow();
  });
});

describe('teacher direct controls', () => {
  it('permits the next settled jog at 500 ms without waiting for another full capture window', async () => {
    const f=fixture(),pose=[...TEACHER_HOME];await f.ready();f.control.enable(true);f.control.jog(1,20);await flush();pose[0]!+=15;
    for(const at of [1200,1300,1400,1500])await f.feed(at,pose);
    expect(f.control.snapshot().canMove).toBe(false);await f.feed(1600,pose);
    expect(f.control.snapshot().canMove).toBe(true);f.control.jog(1,-20);await flush();
    expect(f.writes.map(w=>w.at)).toEqual([1100,1600]);f.control.disconnect();await flush();
  });
  it.each([1,2,3,4,5,6])('jogs servo %s in both directions repeatedly without consuming old test approvals', async servo => {
    const f = fixture(), pose = [...TEACHER_HOME];
    f.stored.set('nexarm.approval.reference-a-servo1-plus20.2026-10-22', 'old base');
    await f.ready(pose); expect(f.writes).toEqual([]); expect(() => f.control.jog(servo,20)).toThrow('Enable');
    expect(() => f.control.enable(false)).toThrow('Confirm'); f.control.enable(true);
    for (const delta of [20,-20,20]) {
      const before = pose[servo - 1]!; f.control.jog(servo,delta); await flush();
      expect(() => f.control.jog(servo,delta)).toThrow('progress');
      expect(targetOf(f.writes.at(-1)!.bytes)).toBe(before + delta);
      pose[servo - 1] = before + delta - Math.sign(delta) * 5;
      const at = f.time(); for (const offset of [100,200,300]) await f.feed(at + offset,pose);
      expect(f.control.snapshot().home?.phase).toBe('Complete'); await f.window(f.time() + 100,pose);
      expect(f.control.snapshot().canMove).toBe(true);
    }
    expect(f.writes).toHaveLength(3); expect(f.writes.every(write => write.bytes[2] === servo)).toBe(true);
    expect(f.stored.get('nexarm.approval.reference-a-servo1-plus20.2026-10-22')).toBe('old base');
    expect(f.stored.size).toBe(1); f.control.disconnect(); await flush();
  });
  it.each([-9,0,9])('completes the full long Home route with residual %s and >=1200 ms between writes', async lag => {
    const f = fixture(), pose = [2066,2009,1943,2048,2044,2052]; await f.ready(pose); f.control.enable(true); f.control.returnHome(); await flush();
    expect(() => f.control.jog(1,20)).toThrow('progress'); let applied = 0;
    for (let at = 1200; at <= 250000 && f.control.snapshot().home?.phase === 'Running'; at += 100) {
      if (f.writes.length > applied) {
        const bytes = f.writes.at(-1)!.bytes, index = bytes[2]! - 1, target = targetOf(bytes);
        expect(Math.abs(target - pose[index]!)).toBeLessThanOrEqual(20); pose[index] = target + lag; applied = f.writes.length;
      }
      await f.feed(at,pose); f.control.tick(); await flush();
    }
    expect(f.control.snapshot().home?.phase).toBe('Complete'); expect(f.writes.length).toBeGreaterThan(100);
    expect(pose.every((n,i) => Math.abs(n - TEACHER_HOME[i]!) <= 9)).toBe(true);
    expect([...new Set(f.writes.map(w => w.bytes[2]))]).toEqual(HOME_ORDER);
    for (let i = 1; i < f.writes.length; i++) expect(f.writes[i]!.at - f.writes[i - 1]!.at).toBeGreaterThanOrEqual(1200);
    const count = f.writes.length; await f.window(f.time() + 100,pose); f.control.returnHome();
    expect(f.writes).toHaveLength(count); f.control.disconnect(); await flush();
  });
  it('Stop cancels the remaining route but allows another explicit enable on the same connection', async () => {
    const f = fixture(), pose = [2048,2048,2047,2048,2042,2053]; await f.ready(pose); f.control.enable(true); f.control.returnHome(); await flush();
    f.control.stop(); await f.window(1200,pose); f.control.tick(); expect(f.writes).toHaveLength(1);
    expect(f.control.snapshot()).toMatchObject({armed:false,connectionState:'Listening',canEnable:true});
    f.control.enable(true); f.control.jog(1,-20); await flush(); expect(f.writes).toHaveLength(2);
    expect(f.port.open).toHaveBeenCalledOnce(); f.control.disconnect(); await flush();
  });
  it('disarms on unexpected motion and can be deliberately enabled again after inspection and stable feedback', async () => {
    const f = fixture(), pose = [...TEACHER_HOME]; await f.ready(pose); f.control.enable(true); f.control.jog(2,20); await flush();
    pose[0]! += 13; await f.feed(1200,pose); expect(f.control.snapshot()).toMatchObject({faulted:true,armed:false});
    expect(() => f.control.jog(2,20)).toThrow('Enable'); await f.window(1300,pose);
    f.control.enable(true); f.control.jog(2,-20); await flush(); expect(f.writes).toHaveLength(2); f.control.disconnect(); await flush();
  });
  it('never queues double clicks or resumes a late write after Stop; ownership remains until cleanup', async () => {
    const f = fixture({hang:true}); await f.ready(); f.control.enable(true); f.control.jog(1,20); await flush();
    expect(() => f.control.jog(2,20)).toThrow(); f.control.stop(); await f.window(1200);
    expect(f.control.snapshot().canEnable).toBe(false); f.control.disconnect(); await flush(); expect(f.port.close).not.toHaveBeenCalled();
    f.finish(); await flush(); expect(f.port.close).toHaveBeenCalledOnce(); expect(f.writes).toHaveLength(1); expect(f.control.snapshot().armed).toBe(false);
  });
  it('times out hanging and rejected writes without retrying', async () => {
    const f = fixture({hang:true}); await f.ready(); f.control.enable(true); f.control.jog(1,20); await flush();
    for (let at=1200;at<=3100;at+=100) await f.feed(at); f.control.tick();
    expect(f.control.snapshot().faulted).toBe(true); expect(f.writes).toHaveLength(1); f.finish(); await flush(); expect(f.control.snapshot().home?.phase).toBe('Fault'); f.control.disconnect(); await flush();
    const g=fixture({reject:true}); await g.ready(); g.control.enable(true); g.control.jog(1,20); await flush();
    expect(g.control.snapshot().faulted).toBe(true); expect(g.writes).toHaveLength(1); g.control.disconnect(); await flush();
  });
  it('rejects a write completion past deadline even without a watchdog tick', async () => {
    const f=fixture({hang:true}); await f.ready(); f.control.enable(true); f.control.returnHome();
    // Already home sends nothing; start an actual jog.
    f.control.jog(1,20); await flush(); f.setTime(3200); f.finish(); await flush();
    expect(f.control.snapshot().faulted).toBe(true); expect(f.writes).toHaveLength(1); f.control.disconnect(); await flush();
  });
  it('stops on stale or weak feedback and page hiding without sending torque or another position', async () => {
    const f=fixture(); await f.ready(); f.control.enable(true); f.setTime(1700); expect(() => f.control.jog(2,20)).toThrow('fresh'); f.control.tick(); expect(f.control.snapshot().armed).toBe(false); f.control.disconnect(); await flush();
    const g=fixture(); await g.ready(); g.control.enable(true); await g.feed(1200,TEACHER_HOME,true); expect(g.control.snapshot().faulted).toBe(true); expect(g.writes).toEqual([]); g.control.disconnect(); await flush();
    const h=fixture(); await h.ready(); h.control.enable(true); h.control.jog(2,20); await flush(); h.hide(); h.control.tick(); await flush(); expect(h.control.snapshot().armed).toBe(false); expect(h.writes).toHaveLength(1); expect(h.port.close).toHaveBeenCalledOnce();
  });
  it('releases/restores through the same writer and requires physical confirmation, also after reload', async () => {
    const f=fixture(); await f.ready(); f.control.enable(true); f.control.setHolding(false,true); await flush();
    expect(f.writes[0]!.bytes).toEqual([255,255,255,3,61,0,192]); expect(f.control.snapshot().armed).toBe(false);
    expect(() => f.control.enable(true)).toThrow('holding'); expect(() => f.control.setHolding(true,true)).toThrow('interval');
    await f.window(1200); f.control.setHolding(true,true); await flush(); expect(f.writes[1]!.bytes).toEqual([255,255,255,3,61,1,191]);
    await f.window(2400); f.control.confirmHolding(true); expect(f.writes).toHaveLength(2); await f.window(3600); f.control.enable(true);
    f.control.setHolding(false,true); await flush(); f.control.disconnect(); await flush();
    const g=fixture({stored:f.stored}); await g.ready(); expect(g.control.snapshot().manualPhase).toBe('Recovery required'); expect(g.control.snapshot().canEnable).toBe(false);
    g.control.confirmHolding(true); expect(g.writes).toEqual([]); await g.window(1200); g.control.enable(true); expect(g.control.snapshot().armed).toBe(true);
    expect(JSON.parse(g.stored.get(MANUAL_STATE_KEY)!).requiresHoldingVerification).toBe(false); g.control.disconnect(); await flush();
  });
  it('blocks release when storage fails and refreshes another tab’s manual interlock at Connect', async () => {
    const f=fixture({storageFails:true}); await f.ready(); f.control.setHolding(false,true); expect(f.writes).toEqual([]); expect(f.control.snapshot().manualPhase).toBe('Recovery required'); f.control.disconnect(); await flush();
    const g=fixture(); g.stored.set(MANUAL_STATE_KEY,JSON.stringify({requiresHoldingVerification:true,events:[]})); await g.ready();
    expect(g.control.snapshot().canEnable).toBe(false); expect(g.writes).toEqual([]); g.control.disconnect(); await flush();
  });
});
