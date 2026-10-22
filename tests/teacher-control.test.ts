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


describe('smooth teacher controls',()=>{
 it('accepts absolute slider targets, retargets only the moving joint, and triples Home speed',async()=>{
 const f=fixture(),pose=[...TEACHER_HOME];await f.ready();f.control.enable(true);f.control.moveJoint(3,2200);await flush();
 expect(f.writes[0]!.bytes.slice(2,-1)).toEqual([3,10,3,41,100,152,8,0,0,208,7]);
 expect(()=>f.control.moveJoint(2,2200)).toThrow('progress');expect(()=>f.control.moveJoint(3,2300)).toThrow('half-second');
 for(let at=1200;at<=1600;at+=100){pose[2]!+=10;await f.feed(at,pose);}
 f.control.moveJoint(3,2250);await flush();expect(f.writes).toHaveLength(2);expect(f.writes[1]!.bytes[2]).toBe(3);
 pose[2]=2245;for(let at=1700;at<=2100;at+=100)await f.feed(at,pose);
 f.control.returnHome();await flush();expect(f.writes.at(-1)!.bytes.slice(11,13)).toEqual([44,1]);
 expect(f.control.snapshot().home?.speed).toBe(300);f.control.disconnect();await flush();
 });
 it('rejects invalid absolute targets without writing',async()=>{
 const f=fixture();await f.ready();f.control.enable(true);
 for(const target of [-1,4096,NaN,20.5])expect(()=>f.control.moveJoint(3,target)).toThrow();
 expect(f.writes).toEqual([]);f.control.disconnect();await flush();
 });
 it('runs the approved Servo 3 comparison once per click and preserves normal jog settings',async()=>{
 const f=fixture(),pose=[...TEACHER_HOME];await f.ready();
 expect(()=>f.control.compareServo3Factory()).toThrow('Enable');f.control.enable(true);
 f.control.compareServo3Factory();await flush();
 expect(f.writes).toHaveLength(1);const packet=f.writes[0]!.bytes;
 expect(packet.slice(2,-1)).toEqual([3,10,3,41,100,72,8,0,0,208,7]);
 expect(()=>f.control.compareServo3Factory()).toThrow('progress');
 expect(f.control.snapshot().home).toMatchObject({speed:2000,acceleration:100});
 pose[2]!+=15;for(const at of [1200,1300,1400,1500,1600])await f.feed(at,pose);
 expect(f.control.snapshot().canMove).toBe(true);f.control.jog(3,-20);await flush();
 expect(f.writes[1]!.bytes[6]).toBe(10);expect(f.writes[1]!.bytes.slice(11,13)).toEqual([100,0]);
 expect(f.control.report().operations).toEqual(expect.arrayContaining([expect.objectContaining({operation:'Servo 3 factory comparison',result:expect.objectContaining({speed:2000,acceleration:100})})]));
 f.control.disconnect();await flush();
 });
 it.each([1,2,3,4,5,6])('sends speed and acceleration with both directions on joint %s',async servo=>{
 const f=fixture(),pose=[...TEACHER_HOME];await f.ready();f.control.enable(true);
 for(const delta of [20,-20]){const start=f.time();f.control.jog(servo,delta);await flush();const bytes=f.writes.at(-1)!.bytes;
 expect(bytes.slice(2,7)).toEqual([servo,10,3,41,10]);expect(bytes[11]).toBe(100);
 pose[servo-1]!+=delta;for(let offset=100;offset<=500;offset+=100)await f.feed(start+offset,pose);
 expect(f.control.snapshot().canMove).toBe(true);}
 expect(f.writes).toHaveLength(2);f.control.disconnect();await flush();
 });
 it('returns to Home with at most six continuous targets, not hundreds of steps',async()=>{
 const f=fixture(),pose=TEACHER_HOME.map(n=>n+100);await f.ready(pose);f.control.enable(true);f.control.returnHome();await flush();
 let applied=0;for(let at=1200;at<10000&&f.control.snapshot().home?.phase==='Running';at+=100){
 if(f.writes.length>applied){const b=f.writes.at(-1)!.bytes;pose[b[2]!-1]=b[7]!+256*b[8]!;applied=f.writes.length;}
 await f.feed(at,pose);f.control.tick();await flush();}
 expect(f.control.snapshot().home?.phase).toBe('Complete');expect(f.writes).toHaveLength(6);expect(pose).toEqual(TEACHER_HOME);f.control.disconnect();await flush();
 });
 it('keeps controls armed through ordinary jitter and short idle gaps',async()=>{
 const f=fixture();await f.ready();f.control.enable(true);f.setTime(1800);f.control.tick();expect(f.control.snapshot().armed).toBe(true);expect(f.control.snapshot().canMove).toBe(false);
 await f.feed(1900,TEACHER_HOME.map(n=>n+4));expect(f.control.snapshot().canMove).toBe(true);expect(f.writes).toEqual([]);f.control.disconnect();await flush();
 });
 it('Stop sends a fresh hold target and never resumes Home automatically',async()=>{
 const f=fixture(),pose=TEACHER_HOME.map(n=>n+100);await f.ready(pose);f.control.enable(true);f.control.returnHome();await flush();f.control.stop();await flush();
 expect(f.writes).toHaveLength(2);const b=f.writes[1]!.bytes;expect(b[7]!+256*b[8]!).toBe(pose[1]);
 await f.window(1200,pose);f.control.tick();expect(f.writes).toHaveLength(2);expect(f.control.snapshot().armed).toBe(false);f.control.disconnect();await flush();
 });
 it('retains ownership during a hanging write and ignores a late completion',async()=>{
 const f=fixture({hang:true});await f.ready();f.control.enable(true);f.control.jog(1,20);await flush();f.control.disconnect();await flush();expect(f.port.close).not.toHaveBeenCalled();f.finish();await flush();expect(f.port.close).toHaveBeenCalledOnce();expect(f.control.snapshot().armed).toBe(false);expect(f.writes).toHaveLength(1);
 });
 it('cancels an active route on prolonged feedback loss and never auto-retries',async()=>{
 const f=fixture();await f.ready();f.control.enable(true);f.control.jog(1,20);await flush();f.setTime(2700);f.control.tick();expect(f.control.snapshot().faulted).toBe(true);expect(f.writes).toHaveLength(1);f.control.disconnect();await flush();
 });
 it('preserves manual release interlock across reload',async()=>{
 const f=fixture();await f.ready();f.control.setHolding(false,true);await flush();expect(f.writes[0]!.bytes).toEqual([255,255,255,3,61,0,192]);f.control.disconnect();await flush();
 const g=fixture({stored:f.stored});await g.ready();expect(g.control.snapshot().canEnable).toBe(false);g.control.confirmHolding(true);expect(g.writes).toEqual([]);g.control.disconnect();await flush();
 });
});
