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
    hide: () => { visible = false; }, finish: () => finish(),endStream:()=>reader.close()};
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
 const program=[{kind:'move',blockId:'out',servo:1,target:2130},{kind:'repeat',blockId:'repeat',count:2,body:[{kind:'move',blockId:'up',servo:3,target:2180},{kind:'move',blockId:'down',servo:3,target:2100}]},{kind:'move',blockId:'back',servo:1,target:2050}];
 it('waits for settling and at least 500 ms between Blockly moves without sending torque commands',async()=>{
 const f=fixture(),pose=[...TEACHER_HOME];await f.ready();f.control.enable(true);
 f.control.runProgram([{kind:'move',blockId:'out',servo:1,target:2130},{kind:'move',blockId:'back',servo:1,target:2050}]);await flush();
 for(let at=1150;at<=3000;at+=50){await f.feed(at,pose);f.control.tick();await flush();}
 expect(f.writes).toHaveLength(1);
 pose[0]=2130;for(const at of [3100,3200,3300]){await f.feed(at,pose);f.control.tick();await flush();}
 expect(f.writes).toHaveLength(2);expect(f.writes[1]!.at-f.writes[0]!.at).toBeGreaterThanOrEqual(500);
 for(const write of f.writes){expect(write.bytes).toHaveLength(14);expect(write.bytes.slice(2,7)).toEqual([1,10,3,41,10]);expect(write.bytes.slice(11,13)).toEqual([88,2]);}
 const report=f.control.report();expect(report.diagnostics.writes.map(entry=>entry.atMs)).toEqual(f.writes.map(entry=>entry.at));
 expect(report.diagnostics.writes.every(entry=>entry.outcome==='stream-write-resolved')).toBe(true);expect(report.diagnostics.powerAndTorqueState).toBe('not measured');
 report.diagnostics.writes[0]!.bytes[0]=0;expect(f.control.report().diagnostics.writes[0]!.bytes[0]).toBe(255);
 f.control.disconnect();await flush();
 });
 it('does not advance a rapidly settled program before the minimum interval',async()=>{
 const f=fixture(),pose=[...TEACHER_HOME];await f.ready();f.control.enable(true);f.control.runProgram([{kind:'move',blockId:'out',servo:1,target:2130},{kind:'move',blockId:'back',servo:1,target:2050}]);await flush();
 pose[0]=2130;for(const at of [1200,1300,1400,1500,1599]){await f.feed(at,pose);f.control.tick();await flush();expect(f.writes).toHaveLength(1);}
 await f.feed(1600,pose);f.control.tick();await flush();expect(f.writes).toHaveLength(2);expect(f.writes[1]!.at-f.writes[0]!.at).toBe(500);f.control.disconnect();await flush();
 });
 it('records a connection ending during a program without release, retry or automatic restore',async()=>{
 const f=fixture();await f.ready();f.control.enable(true);f.control.runProgram(program);await flush();f.endStream();await flush();
 expect(f.control.snapshot().connectionState).toBe('Disconnected');expect(f.control.snapshot().program?.phase).toBe('Fault');expect(f.writes).toHaveLength(1);
 const report=f.control.report();expect(report.diagnostics.events.some(event=>event.kind==='connection'&&event.message.startsWith('Disconnected'))).toBe(true);
 expect(report.diagnostics.writes).toHaveLength(1);expect(report.diagnostics.writes[0]!.bytes[4]).toBe(3);
 });
 it('runs an edited Blockly sequence twice under one enable without teacher approvals',async()=>{
 const f=fixture(),pose=[...TEACHER_HOME];await f.ready();f.control.enable(true);
 for(let run=0;run<2;run++){
   f.control.runProgram(program);await flush();const start=f.time();let applied=f.writes.length-1;
   expect(()=>f.control.jog(2,20)).toThrow('Program');expect(()=>f.control.liveJoint(1,2200)).toThrow('Stop the program');
   expect(()=>f.control.returnHome()).toThrow('Program');expect(()=>f.control.runProgram(program)).toThrow('Program');
   for(let at=start+100;at<=start+5000&&f.control.snapshot().program?.phase==='Running';at+=100){
     if(f.writes.length>applied){const b=f.writes.at(-1)!.bytes;pose[b[2]!-1]=b[7]!+256*b[8]!;applied=f.writes.length;}
     await f.feed(at,pose);f.control.tick();await flush();
   }
   expect(f.control.snapshot().program).toMatchObject({phase:'Completed',completed:6,total:6});expect(f.control.snapshot().armed).toBe(true);
   await f.feed(f.time()+500,pose);
 }
 expect(f.writes).toHaveLength(12);f.control.disconnect();await flush();
 });
 it('rejects invalid blocks and unencodable targets before any program write',async()=>{
 const f=fixture();await f.ready();f.control.enable(true);
 expect(()=>f.control.runProgram([{kind:'serialWrite',blockId:'x'}])).toThrow();
 for(const target of [-1,4096,NaN,1.5])expect(()=>f.control.runProgram([{kind:'move',blockId:'x',servo:2,target}])).toThrow();
 expect(f.writes).toEqual([]);expect(f.control.snapshot().armed).toBe(true);f.control.disconnect();await flush();
 });
 it('retains feedback excursion faults without station limit checks',async()=>{
 const f=fixture(),pose=[...TEACHER_HOME];await f.ready();f.control.enable(true);f.control.runProgram(program);await flush();
 pose[1]!+=101;await f.feed(1200,pose);
 expect(f.control.snapshot().program?.phase).toBe('Fault');expect(f.control.snapshot().armed).toBe(false);
 await f.feed(1800);f.control.tick();expect(f.writes).toHaveLength(1);f.control.disconnect();await flush();
 });
 it('runs without station configuration and ignores stale saved station settings',async()=>{
 const f=fixture({stored:new Map([['nexarm.classroom-profile.v1','invalid obsolete setup']])});await f.ready();f.control.enable(true);
 f.control.runProgram([{kind:'move',blockId:'x',servo:1,target:4095}]);await flush();
 const packet=f.writes[0]!.bytes;expect(packet[7]!+256*packet[8]!).toBe(4095);expect(packet.slice(11,13)).toEqual([88,2]);
 expect(f.control.report().program?.stationLimitsEnforced).toBe(false);f.control.disconnect();await flush();
 });
 it('Stop cancels the program, holds the active joint and requires no teacher to re-enable',async()=>{
 const f=fixture();await f.ready();f.control.enable(true);f.control.runProgram(program);await flush();f.control.stop();await flush();
 expect(f.control.snapshot().program?.phase).toBe('Stopped');expect(f.writes).toHaveLength(2);
 await f.feed(1700);f.control.tick();expect(f.writes).toHaveLength(2);f.control.enable(true);f.control.runProgram(program);await flush();expect(f.writes).toHaveLength(3);f.control.disconnect();await flush();
 });
 it('enforces the total run budget and cannot resume after an interrupted write',async()=>{
 const f=fixture();await f.ready();f.control.enable(true);f.control.runProgram(program);await flush();f.setTime(61100);f.control.tick();
 expect(f.control.snapshot().program?.phase).toBe('Fault');expect(f.control.snapshot().message).toContain('60-second');f.control.disconnect();await flush();
 const g=fixture({hang:true});await g.ready();g.control.enable(true);g.control.runProgram(program);await flush();g.control.stop();g.finish();await flush();await g.feed(1700);g.control.tick();
 expect(g.writes).toHaveLength(1);expect(g.control.snapshot().program?.phase).toBe('Stopped');g.control.disconnect();await flush();
 });
 it('allows rapid slider reversal within dispatched targets but not an overwritten pending target',async()=>{
 const f=fixture(),pose=[...TEACHER_HOME];pose[0]=2078;await f.ready(pose);f.control.enable(true);
 f.control.liveJoint(1,2500);await flush();
 f.control.liveJoint(1,3000);f.control.liveJoint(1,2038);
 await f.feed(1200,pose);f.control.tick();await flush();
 expect(f.writes).toHaveLength(2);expect(f.writes[1]!.bytes[7]!+256*f.writes[1]!.bytes[8]!).toBe(2038);
 pose[0]=2463;await f.feed(1300,pose);
 expect(f.control.snapshot().armed).toBe(true);expect(f.control.snapshot().home?.commandedPath).toEqual({servo:1,min:2038,max:2500});
 pose[0]=2601;await f.feed(1400,pose);expect(f.control.snapshot().faulted).toBe(true);
 expect(f.control.snapshot().message).toContain('from 2038 to 2500');f.control.disconnect();await flush();
 });
 it('drops old path allowances after settling or Stop and re-enable',async()=>{
 const f=fixture(),pose=[...TEACHER_HOME];await f.ready(pose);f.control.enable(true);
 f.control.liveJoint(1,2500);await flush();pose[0]=2500;
 for(const at of [1200,1300,1400,1600])await f.feed(at,pose);
 f.control.liveJoint(1,2400);await flush();pose[0]=2400;
 for(const at of [1700,1800,1900,2100])await f.feed(at,pose);
 f.control.liveJoint(1,2300);await flush();expect(f.control.snapshot().home?.commandedPath).toEqual({servo:1,min:2300,max:2400});
 f.control.stop();await flush();await f.feed(2700,pose);f.control.enable(true);f.control.liveJoint(1,2350);await flush();
 expect(f.control.snapshot().home?.commandedPath).toEqual({servo:1,min:2350,max:2400});f.control.disconnect();await flush();
 });
 it('filters tiny J2 input changes but sends the final released target once',async()=>{
 const f=fixture();await f.ready();f.control.enable(true);f.control.liveJoint(2,2250);await flush();
 for(const [at,target] of [[1200,2251],[1300,2256],[1400,2248]]){await f.feed(at!);f.control.liveJoint(2,target!);f.control.tick();await flush();}
 expect(f.writes).toHaveLength(1);
 f.control.liveJoint(2,2248,2000,100,true);await flush();expect(f.writes).toHaveLength(2);
 expect(f.writes[1]!.bytes[7]!+256*f.writes[1]!.bytes[8]!).toBe(2248);
 f.control.liveJoint(2,2248,2000,100,true);await flush();expect(f.writes).toHaveLength(2);
 // Feedback alone, including oscillation, never requests a correction or retry.
 const pose=[...TEACHER_HOME];for(let at=1500;at<=2500;at+=100){pose[1]=at%200?2230:2260;await f.feed(at,pose);f.control.tick();await flush();}
 expect(f.writes).toHaveLength(2);f.control.disconnect();await flush();
 });
 it('hands live control between all six joints after completion without re-enabling',async()=>{
 const f=fixture(),pose=[...TEACHER_HOME];await f.ready();f.control.enable(true);
 for(let servo=1;servo<=6;servo++){
   f.control.liveJoint(servo,pose[servo-1]!+50);await flush();expect(f.writes.at(-1)!.bytes[2]).toBe(servo);
   const at=f.time();pose[servo-1]!+=50;
   // Companion variation above the old margin must also allow completion.
   pose[servo===1?1:0]!+=25;
   for(const offset of [100,200,300,500])await f.feed(at+offset,pose);
   expect(f.control.snapshot().home?.phase).toBe('Complete');expect(f.control.snapshot().armed).toBe(true);
 }
 expect(f.writes).toHaveLength(6);f.control.disconnect();await flush();
 });
 it('drops pending live input on stale feedback or an interrupted hanging write',async()=>{
 const f=fixture();await f.ready();f.control.enable(true);f.control.liveJoint(3,2200);await flush();f.control.liveJoint(3,2250);
 f.setTime(1700);f.control.tick();await f.feed(1800);f.control.tick();await flush();expect(f.writes).toHaveLength(1);f.control.disconnect();await flush();
 const g=fixture({hang:true});await g.ready();g.control.enable(true);g.control.liveJoint(3,2200);await flush();g.control.liveJoint(3,2250);g.control.stop();g.finish();await flush();
 await g.feed(1700);g.control.tick();expect(g.writes).toHaveLength(1);expect(g.control.snapshot().armed).toBe(false);g.control.disconnect();await flush();
 });
 it('coalesces live slider input at 100 ms and cancels pending targets on Stop',async()=>{
 const f=fixture(),pose=[...TEACHER_HOME];await f.ready();f.control.enable(true);
 f.control.liveJoint(3,2200);await flush();f.control.liveJoint(3,2220);f.control.liveJoint(3,2250);
 expect(f.writes).toHaveLength(1);expect(f.control.snapshot().liveServo).toBe(3);
 await f.feed(1200,pose);f.control.tick();await flush();expect(f.writes).toHaveLength(2);
 expect(f.writes[1]!.bytes[7]!+256*f.writes[1]!.bytes[8]!).toBe(2250);
 f.control.liveJoint(3,2300);f.control.stop();await flush();const count=f.writes.length;
 for(let at=1300;at<=2000;at+=100){await f.feed(at,pose);f.control.tick();}
 expect(f.writes).toHaveLength(count);expect(f.control.snapshot().armed).toBe(false);f.control.disconnect();await flush();
 });
 it('retargets after an early completion without the old half-second gate',async()=>{
 const f=fixture();await f.ready();f.control.enable(true);f.control.liveJoint(3,2100);await flush();
 for(const at of [1200,1300,1400])await f.feed(at);
 f.control.liveJoint(3,2200);await flush();expect(f.writes).toHaveLength(2);f.control.disconnect();await flush();
 });
 it('accepts absolute slider targets, retargets only the moving joint, and uses doubled Home speed',async()=>{
 const f=fixture(),pose=[...TEACHER_HOME];await f.ready();f.control.enable(true);f.control.moveJoint(3,2200);await flush();
 expect(f.writes[0]!.bytes.slice(2,-1)).toEqual([3,10,3,41,100,152,8,0,0,208,7]);
 expect(()=>f.control.moveJoint(2,2200)).toThrow('progress');expect(()=>f.control.moveJoint(3,2300)).toThrow('half-second');
 for(let at=1200;at<=1600;at+=100){pose[2]!+=10;await f.feed(at,pose);}
 f.control.moveJoint(3,2250);await flush();expect(f.writes).toHaveLength(2);expect(f.writes[1]!.bytes[2]).toBe(3);
 pose[2]=2245;for(let at=1700;at<=2100;at+=100)await f.feed(at,pose);
 f.control.returnHome();await flush();expect(f.writes.at(-1)!.bytes.slice(11,13)).toEqual([88,2]);
 expect(f.control.snapshot().home?.speed).toBe(600);f.control.disconnect();await flush();
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
 it('dispatches all Home targets in one write at speed 600 and waits for every joint',async()=>{
 const f=fixture(),pose=TEACHER_HOME.map(n=>n+100);await f.ready(pose);f.control.enable(true);f.control.returnHome();await flush();
 let applied=0;for(let at=1200;at<10000&&f.control.snapshot().home?.phase==='Running';at+=100){
 if(f.writes.length>applied){const batch=f.writes.at(-1)!.bytes;for(let offset=0;offset<batch.length;offset+=14){const b=batch.slice(offset,offset+14);pose[b[2]!-1]=b[7]!+256*b[8]!;expect(b.slice(11,13)).toEqual([88,2]);}applied=f.writes.length;}
 await f.feed(at,pose);f.control.tick();await flush();}
 expect(f.control.snapshot().home?.phase).toBe('Complete');expect(f.writes).toHaveLength(1);expect(f.writes[0]!.bytes).toHaveLength(84);expect(pose).toEqual(TEACHER_HOME);f.control.disconnect();await flush();
 });
 it('keeps controls armed through ordinary jitter and short idle gaps',async()=>{
 const f=fixture();await f.ready();f.control.enable(true);f.setTime(1800);f.control.tick();expect(f.control.snapshot().armed).toBe(true);expect(f.control.snapshot().canMove).toBe(false);
 await f.feed(1900,TEACHER_HOME.map(n=>n+4));expect(f.control.snapshot().canMove).toBe(true);expect(f.writes).toEqual([]);f.control.disconnect();await flush();
 });
 it('Stop sends a fresh hold target and never resumes Home automatically',async()=>{
 const f=fixture(),pose=TEACHER_HOME.map(n=>n+100);await f.ready(pose);f.control.enable(true);f.control.returnHome();await flush();f.control.stop();await flush();
 expect(f.writes).toHaveLength(2);const b=f.writes[1]!.bytes;expect(b[7]!+256*b[8]!).toBe(pose[1]);
 expect(b).toHaveLength(84);for(let offset=0;offset<b.length;offset+=14){const frame=b.slice(offset,offset+14);expect(frame[7]!+256*frame[8]!).toBe(pose[frame[2]!-1]);expect(frame.slice(11,13)).toEqual([100,0]);}
 await f.window(1200,pose);f.control.tick();expect(f.writes).toHaveLength(2);expect(f.control.snapshot().armed).toBe(false);f.control.disconnect();await flush();
 });
 it('retains ownership during a hanging write and ignores a late completion',async()=>{
 const f=fixture({hang:true});await f.ready();f.control.enable(true);f.control.jog(1,20);await flush();f.control.disconnect();await flush();expect(f.port.close).not.toHaveBeenCalled();f.finish();await flush();expect(f.port.close).toHaveBeenCalledOnce();expect(f.control.snapshot().armed).toBe(false);expect(f.writes).toHaveLength(1);
 });
 it('never resumes a Home batch after Stop interrupts a hanging write',async()=>{
 const f=fixture({hang:true});await f.ready(TEACHER_HOME.map(value=>value+100));f.control.enable(true);f.control.returnHome();await flush();
 expect(f.writes).toHaveLength(1);expect(f.writes[0]!.bytes).toHaveLength(84);
 f.control.stop();expect(f.control.snapshot().armed).toBe(false);expect(f.control.snapshot().message).toContain('Could not send fresh hold targets');
 f.finish();await flush();await f.feed(1700);f.control.tick();await flush();expect(f.writes).toHaveLength(1);expect(f.control.snapshot().home?.phase).toBe('Stopped');
 f.control.disconnect();await flush();
 });
 it('cancels an active route on prolonged feedback loss and never auto-retries',async()=>{
 const f=fixture();await f.ready();f.control.enable(true);f.control.jog(1,20);await flush();f.setTime(2700);f.control.tick();expect(f.control.snapshot().faulted).toBe(true);expect(f.writes).toHaveLength(1);f.control.disconnect();await flush();
 });
 it('preserves manual release interlock across reload',async()=>{
 const f=fixture();await f.ready();f.control.setHolding(false,true);await flush();expect(f.writes[0]!.bytes).toEqual([255,255,255,3,61,0,192]);f.control.disconnect();await flush();
 const g=fixture({stored:f.stored});await g.ready();expect(g.control.snapshot().canEnable).toBe(false);g.control.confirmHolding(true);expect(g.writes).toEqual([]);g.control.disconnect();await flush();
 });
});
