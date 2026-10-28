import { describe, expect, it, vi } from 'vitest';
import { TeacherRobotControl } from '../app/src/safety/TeacherRobotControl';
import { jogPlan, slowHomePlan, slowHomeStepCount, TEACHER_HOME, HOME_ORDER } from '../app/src/safety/TeacherControlPlan';
import { MANUAL_STATE_KEY } from '../app/src/safety/ManualPositioning';
import {OPERATING_RANGES} from '../app/src/safety/OperatingRanges';
import {encodeCoordinateTarget,encodeCoordinateCalculation,encodeSpeedPosition} from '../app/src/protocol/NexArmCodec';

const flush = async () => { for (let i = 0; i < 35; i++) await Promise.resolve(); };
const locks = {request: async (_name: string, _options: unknown, run: (lease: object) => Promise<void>) => run({})} as unknown as LockManager;
function fixture(options: {hang?: boolean; hangWrites?:number[]; reject?: boolean; storageFails?: boolean; stored?: Map<string, string>;directSession?:boolean;homeBeforeProgram?:boolean} = {}) {
  let time = 0, visible = true, reader!: ReadableStreamDefaultController<Uint8Array>, finish!: () => void, fail!:()=>void;
  const stored = options.stored ?? new Map<string, string>(), writes: {at: number; bytes: number[]}[] = [];
  const storage = {getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => {
    if (options.storageFails) throw new Error('Storage failed'); stored.set(key, value);
  }};
  const port = {open: vi.fn(async () => {}), close: vi.fn(async () => {}),
    readable: new ReadableStream<Uint8Array>({start(controller) { reader = controller; }}),
    writable: new WritableStream<Uint8Array>({write(bytes) {
      writes.push({at: time, bytes: [...bytes]});
      if (options.reject) return Promise.reject(new Error('USB write failed'));
      if (options.hang||options.hangWrites?.includes(writes.length)) return new Promise<void>((resolve,reject) => { finish = resolve;fail=()=>reject(new Error('USB write failed')); });
    }})};
  // Existing executor tests isolate block execution; Home-first has dedicated
  // coverage below and remains enabled by default in the production controller.
  const control = new TeacherRobotControl(locks, storage, () => time, () => visible, () => {},{directSession:options.directSession??false,homeBeforeProgram:options.homeBeforeProgram??false});
  const feed = async (at: number, positions: readonly number[] = TEACHER_HOME, weak = false,rawPose:readonly number[]=Array(6).fill(0)) => {
    time = at;
    const body = [255, 26, 11, ...rawPose.flatMap(n=>[n&255,(n>>8)&255]), ...positions.flatMap(n => [n & 255, n >> 8])];
    const checksum = (~(weak ? body.slice(0, 3) : body).reduce((a, b) => a + b, 0)) & 255;
    reader.enqueue(Uint8Array.from([255, 255, ...body, checksum])); await flush();
  };
  const window = async (start: number, positions: readonly number[] = TEACHER_HOME) => {
    for (let at = start; at <= start + 1100; at += 100) await feed(at, positions);
  };
  const ready = async (positions: readonly number[] = TEACHER_HOME) => { control.connect(async () => port); await flush(); await window(0, positions); };
  const solution=async(positions:readonly number[]=TEACHER_HOME,pose:readonly number[]=[39,-1,-71,184,8,-87],weak=false)=>{
    const body=[255,26,7,...[...pose,...positions].flatMap(n=>[n&255,(n>>8)&255])];
    reader.enqueue(Uint8Array.from([255,255,...body,(~(weak?body.slice(0,3):body).reduce((a,b)=>a+b,0))&255]));await flush();
  };
  return {control, port, writes, stored, feed, window, ready, solution, time: () => time, setTime: (at: number) => { time = at; },
    hide: () => { visible = false; }, finish: () => finish(),fail:()=>fail(),endStream:()=>reader.close()};
}
const targetOf = (bytes: number[]) => bytes[6]! + 256 * bytes[7]!;
const dispatchPose=async(f:ReturnType<typeof fixture>,positions:readonly number[]=TEACHER_HOME)=>{
  for(let i=0;i<5;i++){await f.feed(f.time()+2,positions);f.control.tick();await flush();}
};

describe('priority fast Stop',()=>{
 const program=[{kind:'move',blockId:'first',servo:1,target:2700},{kind:'move',blockId:'later',servo:2,target:2400}];
 it('uses the approved 600/100 profile immediately without changing normal movement or releasing holding',async()=>{
  const f=fixture({directSession:true});await f.ready();f.control.runProgram(program);await flush();
  expect(f.writes[0]!.bytes[6]).toBe(10);expect(f.writes[0]!.bytes.slice(11,13)).toEqual([88,2]);
  const actual=[...TEACHER_HOME];actual[0]=2090;await f.feed(1200,actual);f.control.stop();await flush();
  expect(f.writes).toHaveLength(2);const hold=f.writes[1]!;expect(hold.at).toBe(1200);expect(hold.bytes[6]).toBe(100);expect(hold.bytes.slice(11,13)).toEqual([88,2]);expect(hold.bytes[7]!+256*hold.bytes[8]!).toBe(2090);
  expect(f.writes.every(w=>w.bytes[4]!==61)).toBe(true);expect(f.control.report().diagnostics.stopping.attempts[0]).toMatchObject({requestedAtMs:1200,submittedAtMs:1200,finishedAtMs:1200,outcome:'stream-write-resolved',feedbackAgeAtSendMs:0});
  await f.feed(1300,actual);await f.feed(1400,actual);expect(f.control.report().diagnostics.stopping.attempts[0]!.feedback).toHaveLength(2);f.control.tick();expect(f.writes).toHaveLength(2);f.control.disconnect();await flush();
 });
 it('waits for an active write, then sends one priority hold using the newest readings without a timer tick',async()=>{
  const f=fixture({directSession:true,hangWrites:[1]});await f.ready();f.control.runProgram(program);await flush();
  f.control.stop();f.control.stop();expect(f.control.snapshot().busy).toBe(true);expect(f.control.snapshot().canMove).toBe(false);expect(()=>f.control.moveJoint(2,2300)).toThrow('Stop requested');
  const actual=[...TEACHER_HOME];actual[0]=2140;await f.feed(1300,actual);expect(f.writes).toHaveLength(1);f.finish();await flush();
  expect(f.writes).toHaveLength(2);expect(f.writes[1]!.at).toBe(1300);expect(f.writes[1]!.bytes[7]!+256*f.writes[1]!.bytes[8]!).toBe(2140);expect(f.control.report().diagnostics.stopping.attempts).toHaveLength(1);
  expect(f.control.report().diagnostics.stopping.attempts[0]).toMatchObject({requestedAtMs:1100,submittedAtMs:1300,feedbackAgeAtSendMs:0,outcome:'stream-write-resolved'});
  await f.window(1400,actual);f.control.tick();expect(f.writes).toHaveLength(2);expect(f.control.snapshot().program?.phase).toBe('Stopped');f.control.disconnect();await flush();
 });
 it('aborts a queued hold if the latest feedback is stale and never replays it on later readings',async()=>{
  const f=fixture({directSession:true,hangWrites:[1]});await f.ready();f.control.runProgram(program);await flush();f.control.stop();f.setTime(1800);f.finish();await flush();
  expect(f.writes).toHaveLength(1);expect(f.control.snapshot().message).toContain('Could not send fresh hold');expect(f.control.report().diagnostics.stopping.attempts[0]!.outcome).toBe('unavailable');
  await f.window(1900);f.control.tick();expect(f.writes).toHaveLength(1);f.control.disconnect();await flush();
 });
 it.each([false,true])('never sends a delayed hold after the original write deadline, with tick=%s',async tick=>{
  const f=fixture({directSession:true,hangWrites:[1]});await f.ready();f.control.runProgram(program);await flush();await f.feed(1300);f.control.stop();
  await f.feed(3100);if(tick)f.control.tick();f.finish();await flush();
  expect(f.writes).toHaveLength(1);expect(f.control.snapshot().canMove).toBe(false);expect(f.control.report().diagnostics.stopping.attempts[0]!.outcome).toBe('unavailable');expect(f.control.snapshot().message).toContain('deadline');
  await f.feed(3200);f.control.tick();expect(f.writes).toHaveLength(1);f.control.disconnect();await flush();
 });
 it('does not send a follow-up hold after the interrupted write rejects',async()=>{
  const f=fixture({directSession:true,hangWrites:[1]});await f.ready();f.control.runProgram(program);await flush();f.control.stop();f.fail();await flush();
  expect(f.writes).toHaveLength(1);expect(f.control.snapshot().faulted).toBe(true);expect(f.control.snapshot().message).toContain('Delivery is uncertain');expect(f.control.report().diagnostics.stopping.pending).toBe(false);
  await f.window(1200);expect(f.control.snapshot().canMove).toBe(false);expect(f.writes).toHaveLength(1);f.control.disconnect();await flush();
 });
 it('cancels a queued hold on disconnect without writing after closure begins',async()=>{
  const f=fixture({directSession:true,hangWrites:[1]});await f.ready();f.control.runProgram(program);await flush();f.control.stop();f.control.disconnect();await flush();f.finish();await flush();
  expect(f.writes).toHaveLength(1);expect(f.port.close).toHaveBeenCalledOnce();expect(f.control.report().diagnostics.stopping.attempts[0]!.outcome).toBe('canceled');expect(f.control.report().diagnostics.stopping.pending).toBe(false);
 });
 it('never follows an in-flight Release with a position hold',async()=>{
  const f=fixture({directSession:true,hangWrites:[7]});await f.ready();f.control.returnHome();await flush();await dispatchPose(f);
  for(let at=1200;at<=2300;at+=100){await f.feed(at);f.control.tick();await flush();}
  f.control.setHolding(false,true);await flush();expect(f.writes).toHaveLength(7);f.control.stop();f.finish();await flush();
  expect(f.writes).toHaveLength(7);expect(f.control.snapshot().manualPhase).toBe('Recovery required');expect(f.control.report().diagnostics.stopping.pending).toBe(false);f.control.disconnect();await flush();
 });
 it('records a failed fast-hold write and blocks movement without pretending the arm stopped',async()=>{
  const f=fixture({directSession:true,hangWrites:[2]});await f.ready();f.control.runProgram(program);await flush();f.control.stop();await flush();f.setTime(3100);f.control.tick();
  expect(f.control.report().diagnostics.stopping.attempts[0]!.outcome).toBe('unavailable');expect(f.control.snapshot().canMove).toBe(false);f.finish();await flush();expect(f.writes).toHaveLength(2);expect(f.control.report().diagnostics.stopping.physicalStoppingVerified).toBe(false);f.control.disconnect();await flush();
 });
 it.each(['reject','resolve-late'])('a repeated Stop cannot hide a fast-hold write failure: %s',async result=>{
  const f=fixture({directSession:true,hangWrites:[2]});await f.ready();f.control.runProgram(program);await flush();f.control.stop();await flush();f.control.stop();
  if(result==='reject')f.fail();else{f.setTime(3100);f.finish();}await flush();
  expect(f.control.snapshot().faulted).toBe(true);await f.window(3200);expect(f.control.snapshot().canMove).toBe(false);expect(f.writes).toHaveLength(2);expect(f.control.report().diagnostics.stopping.attempts[0]!.outcome).toBe('unavailable');f.control.disconnect();await flush();
 });
});

describe('Home-first Run',()=>{
 const program=[{kind:'move',blockId:'first',servo:1,target:2130}];
 const setup=()=>fixture({directSession:true,homeBeforeProgram:true});
 it('rejects a later computed range violation before Home or any earlier valid step',async()=>{
   const f=setup();await f.ready(TEACHER_HOME.map(n=>n+100));
   const instructions=[{kind:'set',blockId:'v',name:'target',value:1880},...program,{kind:'move',blockId:'bad',servo:3,target:{kind:'variable',name:'target'}}];
   expect(()=>f.control.runProgram(instructions)).toThrow('J3 target 1880');expect(f.writes).toHaveLength(0);
   expect(()=>f.control.runProgram([{kind:'move',blockId:'divide',servo:1,target:{kind:'arithmetic',op:'DIVIDE',left:2100,right:0}}])).toThrow('divide by zero');expect(f.writes).toHaveLength(0);
   f.control.disconnect();await flush();
 });
 it('returns every joint to Home before block 1, retaining the original program steps',async()=>{
   const f=setup(),before=TEACHER_HOME.map(n=>n+200);await f.ready(before);expect(f.writes).toHaveLength(0);
   f.control.runProgram(program);await flush();await dispatchPose(f,before);
   expect(f.writes).toHaveLength(6);expect(f.writes.map(w=>w.bytes[7]!+256*w.bytes[8]!)).toEqual(TEACHER_HOME);
   expect(f.control.snapshot().program).toMatchObject({startup:'Returning Home',completed:0,total:1,activeStep:null});
   for(let at=1300;at<=2300;at+=100){await f.feed(at);f.control.tick();await flush();}
   expect(f.writes).toHaveLength(7);expect(f.writes[6]!.bytes[2]).toBe(1);expect(f.writes[6]!.bytes[7]!+256*f.writes[6]!.bytes[8]!).toBe(2130);
   expect(f.control.snapshot().program?.startup).toBe('Running blocks');f.control.disconnect();await flush();
 });
 it('skips redundant Home movement when fresh readings are already near Home',async()=>{
   const f=setup();await f.ready(TEACHER_HOME.map(n=>n+5));f.control.runProgram(program);await flush();expect(f.writes).toHaveLength(1);expect(f.writes[0]!.bytes[2]).toBe(1);f.control.disconnect();await flush();
 });
 it('validates later destinations before moving Home',async()=>{
   const f=setup();await f.ready(TEACHER_HOME.map(n=>n+100));
   expect(()=>f.control.runProgram([...program,{kind:'move',blockId:'bad',servo:3,target:1880}])).toThrow('J3 target 1880');expect(f.writes).toHaveLength(0);f.control.disconnect();await flush();
 });
 it('fails a Home shortfall without starting any blocks or retrying the return',async()=>{
   const f=setup(),before=TEACHER_HOME.map(n=>n+200);await f.ready(before);f.control.runProgram(program);await flush();await dispatchPose(f,before);
   for(let at=1300;at<=4500;at+=100){await f.feed(at,before);f.control.tick();await flush();}
   expect(f.control.snapshot().program?.phase).toBe('Fault');expect(f.control.snapshot().message).toContain('Home was not reached');expect(f.writes).toHaveLength(6);f.control.disconnect();await flush();
 });
 it.each(['stop','hide','disconnect'])('cancels startup on %s and never starts the blocks',async action=>{
   const f=setup();await f.ready(TEACHER_HOME.map(n=>n+200));f.control.runProgram(program);await flush();
   if(action==='stop')f.control.stop();else if(action==='hide'){f.hide();f.control.tick();}else f.control.disconnect();await flush();
   const count=f.writes.length;f.setTime(5000);f.control.tick();await flush();expect(f.writes).toHaveLength(count);expect(f.control.snapshot().program?.phase).not.toBe('Running');f.control.disconnect();await flush();
 });
});

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
 it.each(['first','after joint','after pose','after wait','inside repeat'])('rejects retired XYZ %s before Home, calculation, or joint writes',async placement=>{
   const f=fixture({directSession:true,homeBeforeProgram:true});await f.ready(TEACHER_HOME.map(n=>n+100));
   const xyz={kind:'coordinates',blockId:'c',x:39,y:-1,z:-71,pitch:18.4,roll:8,claw:-87,durationMs:2000};
   const first=placement==='after joint'?{kind:'move',blockId:'j',servo:1,target:2130}:placement==='after pose'?{kind:'pose',blockId:'p',positionId:'p',name:'P',positions:[...TEACHER_HOME]}:{kind:'wait',blockId:'w',durationMs:1000};
   const program=placement==='first'?[xyz]:placement==='inside repeat'?[{kind:'repeat',blockId:'r',count:2,body:[xyz]}]:[first,xyz];
   expect(()=>f.control.runProgram(program)).toThrow('XYZ coordinate blocks are no longer supported');
   for(let at=1200;at<=3500;at+=100){await f.feed(at);f.control.tick();await flush();}expect(f.writes).toHaveLength(0);
   f.control.disconnect();await flush();
 });
 it.each([false,true])('rejects native packets at the writer boundary even with a preceding joint packet: %s',async prefixJoint=>{
   const f=fixture({directSession:true});await f.ready();let callback=false;
   const gateway=f.control as unknown as {write:(packet:Uint8Array,completed:()=>void)=>void};
   const native=encodeCoordinateTarget({x:200,y:0,z:200,pitch:0,roll:0,claw:0,durationMs:2000});
   gateway.write(prefixJoint?Uint8Array.from([...encodeSpeedPosition(1,2130,600,10),...native]):native,()=>{callback=true;});await flush();
   expect(f.writes).toHaveLength(0);expect(callback).toBe(false);expect(f.control.snapshot().faulted).toBe(true);expect(f.control.snapshot().message).toContain('no longer supported');f.control.disconnect();await flush();
 });
 it('also rejects calculation-only XYZ packets before any USB write',async()=>{
   const f=fixture({directSession:true});await f.ready();let completed=false;
   const gateway=f.control as unknown as {write:(packet:Uint8Array,completed:()=>void)=>void};
   gateway.write(encodeCoordinateCalculation({x:200,y:0,z:200,pitch:0,roll:0,claw:0,durationMs:1000}),()=>{completed=true;});await flush();
   expect(f.writes).toHaveLength(0);expect(completed).toBe(false);expect(f.control.snapshot().message).toContain('no longer supported');f.control.disconnect();await flush();
 });
 it('reports passive coordinates with freshness and diagnostics, rejects weak updates, and clears them on reconnect without writes',async()=>{
   const f=fixture({directSession:true});await f.ready();
   const raw=[39,-1,399,184,8,-87],expected={x:39,y:-1,z:399,pitch:18.4,roll:8,claw:-87};
   await f.feed(1200,TEACHER_HOME,false,raw);expect(f.control.snapshot()).toMatchObject({reportedPose:expected,feedbackFresh:true});
   expect(f.control.report().reportedCoordinates).toMatchObject({source:'passive-0x0b',referenceVerified:false,latest:expected,feedbackFresh:true});
   const copy=f.control.snapshot().reportedPose as {x:number};copy.x=999;expect(f.control.snapshot().reportedPose?.x).toBe(39);
   await f.feed(1800,TEACHER_HOME,true,[100,200,300,0,0,0]);expect(f.control.snapshot()).toMatchObject({reportedPose:expected,feedbackFresh:false});
   expect(f.control.report().reportedCoordinates.feedbackFresh).toBe(false);expect(f.writes).toHaveLength(0);
   f.control.disconnect();await flush();expect(f.control.snapshot()).toMatchObject({reportedPose:expected,feedbackFresh:false});
   f.control.connect(async()=>f.port);await flush();expect(f.control.snapshot().reportedPose).toBeNull();expect(f.writes).toHaveLength(0);
   f.control.disconnect();await flush();
 });
 it('timed pose J3 2811 to 2838 sends every target and completes on time despite no movement',async()=>{
   const f=fixture({directSession:true}),before=[...TEACHER_HOME];before[2]=2811;const target=[...before];target[2]=2838;await f.ready(before);
   f.control.moveToPosition(target);await flush();await dispatchPose(f,before);expect(f.writes).toHaveLength(6);expect(f.writes.map(w=>w.bytes[2])).toEqual([1,2,3,4,5,6]);
   expect(f.writes[2]!.bytes[7]!+256*f.writes[2]!.bytes[8]!).toBe(2838);
   for(let at=1200;at<=2200;at+=100){await f.feed(at,before);f.control.tick();}expect(f.control.snapshot().home?.phase).toBe('Complete');expect(f.control.snapshot().message).toContain('frame time elapsed');expect(f.control.snapshot().positions?.[2]).toBe(2811);expect(f.writes).toHaveLength(6);f.control.disconnect();await flush();
 });
 it('Stop during timed dispatch holds only submitted joints and cancels the rest',async()=>{
   const f=fixture({directSession:true});await f.ready();f.control.moveToPosition(TEACHER_HOME.map(n=>n+100));await flush();expect(f.writes).toHaveLength(1);expect(f.writes[0]!.bytes[2]).toBe(1);
   f.control.stop();await flush();expect(f.writes).toHaveLength(2);expect(f.writes[1]!.bytes).toHaveLength(14);expect(f.writes[1]!.bytes[2]).toBe(1);
   for(let at=1200;at<=3000;at+=100){await f.feed(at);f.control.tick();await flush();}expect(f.writes).toHaveLength(2);f.control.disconnect();await flush();
 });
 it.each(['pose','move'])('larger J3 %s steps accept the measured stable 28-unit offset before continuing',async kind=>{
   const f=fixture({directSession:true}),target=[...TEACHER_HOME];target[2]=2838;await f.ready();
   const first=kind==='pose'?{kind:'pose',blockId:'j3',positionId:'p',name:'P',positions:target}:{kind:'move',blockId:'j3',servo:3,target:2838};
   f.control.runProgram([first,{kind:'move',blockId:'next',servo:1,target:2130}]);await flush();if(kind==='pose')await dispatchPose(f);
   const count=kind==='pose'?6:1;
   const actual=[...target];actual[2]=2810;for(const at of [1300,1400]){await f.feed(at,actual);f.control.tick();await flush();}expect(f.writes).toHaveLength(count);
   for(let at=1500;at<=2700;at+=100){await f.feed(at,actual);f.control.tick();await flush();}expect(f.writes).toHaveLength(count+1);expect(f.writes[count]!.bytes[2]).toBe(1);
   actual[0]=2130;for(const at of [2800,2900,3000]){await f.feed(at,actual);f.control.tick();await flush();}expect(f.control.snapshot().program?.phase).toBe('Completed');f.control.disconnect();await flush();
 });
 it('direct sessions become ready after Connect without Enable and never write until an explicit move',async()=>{
   const f=fixture({directSession:true});await f.ready();expect(f.control.snapshot().canMove).toBe(true);expect(f.writes).toHaveLength(0);
   f.control.runProgram([{kind:'move',blockId:'a',servo:1,target:2130}]);await flush();expect(f.writes).toHaveLength(1);f.control.disconnect();await flush();
 });
 it('direct restore completes from new stable feedback without a confirmation or automatic movement',async()=>{
   const f=fixture({directSession:true});await f.ready();f.control.setHolding(false,true);await flush();await f.feed(1700);expect(f.control.snapshot().canMove).toBe(false);
   f.control.setHolding(true,true);await flush();expect(f.control.snapshot().manualPhase).toBe('Restore settling');
   await f.feed(1800);await f.feed(1900);expect(f.control.snapshot().canMove).toBe(false);
   for(const at of [2000,2100,2200])await f.feed(at);f.control.tick();expect(f.control.snapshot().manualPhase).toBe('Normal');expect(f.control.snapshot().canMove).toBe(true);expect(f.writes).toHaveLength(2);
   expect(f.control.report().manualPositioning.physicalTorqueState).toBe('not measured');expect(JSON.parse(f.stored.get(MANUAL_STATE_KEY)!).requiresHoldingVerification).toBe(false);
   f.control.disconnect();await flush();
 });
 it('a 32-unit residual advances to the next pose, then Stop still holds all joints after elapsed completion',async()=>{
   const f=fixture({directSession:true}),target=[...TEACHER_HOME];target[2]=2838;await f.ready();
   const instructions=[{kind:'pose',blockId:'p',positionId:'p',name:'P',positions:target},{kind:'pose',blockId:'later',positionId:'home',name:'Home',positions:[...TEACHER_HOME]}];f.control.runProgram(instructions);await flush();await dispatchPose(f);
   const actual=[...target];actual[2]=2806;
   for(let at=1200;at<=5000;at+=100){await f.feed(at,actual);f.control.tick();await flush();}
   expect(f.control.snapshot().program?.phase).toBe('Completed');expect(f.control.snapshot().canMove).toBe(true);expect(f.control.snapshot().faulted).toBe(false);expect(f.writes).toHaveLength(12);
   expect(f.control.report().operations).toEqual(expect.arrayContaining([expect.objectContaining({result:expect.objectContaining({completionPolicy:'elapsed-time',latest:actual,target})})]));
   f.control.stop();await flush();expect(f.writes).toHaveLength(13);expect(f.writes.at(-1)!.bytes).toHaveLength(84);
   const count=f.writes.length;for(const at of [5200,5300,5400,5600])await f.feed(at,actual);f.control.tick();expect(f.control.snapshot().canMove).toBe(true);expect(f.writes).toHaveLength(count);
   f.control.runProgram([{kind:'move',blockId:'new',servo:1,target:2130}]);await flush();expect(f.writes).toHaveLength(count+1);expect(f.writes.at(-1)!.bytes[2]).toBe(1);f.control.disconnect();await flush();
 });
 it('release clears elapsed-frame Stop holds so Stop cannot send a position command while released',async()=>{
   const f=fixture({directSession:true});await f.ready();f.control.returnHome();await flush();await dispatchPose(f);
   for(let at=1200;at<=2300;at+=100){await f.feed(at);f.control.tick();await flush();}expect(f.control.snapshot().home?.phase).toBe('Complete');
   f.control.setHolding(false,true);await flush();const count=f.writes.length;f.control.stop();await flush();expect(f.writes).toHaveLength(count);expect(f.control.snapshot().canMove).toBe(false);f.control.disconnect();await flush();
 });
 it('continued J6 movement during a frame reversal is diagnostic and preserves playback and Stop',async()=>{
   const f=fixture({directSession:true}),target=[...TEACHER_HOME];target[5]=2000;await f.ready();
   const pose=(positions:readonly number[])=>({kind:'pose',blockId:'p',positionId:'p',name:'P',positions:[...positions]});
   f.control.runProgram([pose(target),pose(TEACHER_HOME)]);await flush();await dispatchPose(f);
   const actual=[...TEACHER_HOME];actual[5]=1400;
   for(let at=1200;at<=2900;at+=100){await f.feed(at,actual);f.control.tick();await flush();}
   await f.feed(2950,actual);f.control.tick();await flush();expect(f.writes).toHaveLength(7); // second frame has sent only J1
   actual[5]=1600;await f.feed(2952,actual);f.control.tick();await flush();
   expect(f.control.snapshot().faulted).toBe(false);expect(f.control.snapshot().program?.phase).toBe('Running');
   for(let at=2954;at<=2960;at+=2){await f.feed(at,actual);f.control.tick();await flush();}
   for(let at=3000;at<=4100;at+=100){await f.feed(at,actual);f.control.tick();await flush();}
   expect(f.writes).toHaveLength(12);expect(f.control.snapshot().program?.phase).toBe('Completed');expect(f.control.snapshot().canMove).toBe(true);
   const operation=f.control.report().operations.at(-1) as {result:{pathCheckPolicy:string;pathDeviations:unknown[]}};
   expect(operation.result.pathCheckPolicy).toBe('diagnostic-only');expect(operation.result.pathDeviations).toEqual(expect.arrayContaining([expect.objectContaining({servo:6,actual:1600,targetSent:false})]));
   f.control.stop();await flush();expect(f.writes.at(-1)!.bytes).toHaveLength(84);const count=f.writes.length;
   for(let at=4200;at<=4800;at+=100){await f.feed(at,actual);f.control.tick();await flush();}expect(f.writes).toHaveLength(count);f.control.disconnect();await flush();
 });
 it('short timed poses and a zero wait advance at frame time without an extra half-second gate',async()=>{
   const f=fixture({directSession:true});await f.ready();
   const pose={kind:'pose',blockId:'p',positionId:'home',name:'Home',positions:[...TEACHER_HOME],durationMs:100};
   f.control.runProgram([pose,{kind:'wait',blockId:'w',durationMs:0},pose]);await flush();await dispatchPose(f);expect(f.writes).toHaveLength(6);
   const firstEnd=f.time()+100;await f.feed(firstEnd);f.control.tick();await flush();expect(f.writes).toHaveLength(6);
   f.control.tick();await flush();expect(f.writes).toHaveLength(7);expect(f.writes[6]!.at-f.writes[5]!.at).toBe(100);
   f.control.stop();await flush();expect(f.writes.at(-1)!.bytes).toHaveLength(84);const count=f.writes.length;
   for(let at=firstEnd+100;at<=firstEnd+700;at+=100){await f.feed(at);f.control.tick();await flush();}expect(f.writes).toHaveLength(count);f.control.disconnect();await flush();
 });
 it('direct readiness cannot clear an interrupted release on reload or stale/unstable restore readings',async()=>{
   const stored=new Map([[MANUAL_STATE_KEY,JSON.stringify({requiresHoldingVerification:true,events:[]})]]),f=fixture({directSession:true,stored});await f.ready();expect(f.control.snapshot().canMove).toBe(false);expect(f.writes).toHaveLength(0);
   f.control.setHolding(true,true);await flush();f.setTime(1700);f.control.tick();expect(f.control.snapshot().canMove).toBe(false);
   for(let at=1800;at<=2400;at+=100){const pose=[...TEACHER_HOME];pose[0]+=at%200?20:0;await f.feed(at,pose);}expect(f.control.snapshot().canMove).toBe(false);
   for(const at of [2500,2600,2700])await f.feed(at);expect(f.control.snapshot().canMove).toBe(true);expect(f.writes).toHaveLength(1);f.control.disconnect();await flush();
 });
 it('direct sessions cannot become ready after an uncertain USB write or resume after reconnect',async()=>{
   const f=fixture({directSession:true,reject:true});await f.ready();f.control.moveJoint(1,2130);await flush();
   for(const at of [1300,1400,1500,1800])await f.feed(at);f.control.tick();expect(f.control.snapshot().canMove).toBe(false);expect(f.control.snapshot().reason).toContain('Disconnect and reconnect');expect(f.writes).toHaveLength(1);f.control.disconnect();await flush();
 });
 it.each([1,2,3,4,5,6])('blocks capturing out-of-range J%s readings without writing and restores capture once valid',async servo=>{
   const f=fixture();await f.ready();const range=OPERATING_RANGES[servo-1]!,pose=[...TEACHER_HOME];
   for(const value of [range.min-1,range.max+1]){
     pose[servo-1]=value;await f.feed(f.time()+100,pose);expect(f.control.snapshot().canCapture).toBe(false);expect(f.control.snapshot().captureReason).toContain(`J${servo}`);
     expect(()=>f.control.capturePosition()).toThrow(`J${servo}`);expect(f.writes).toHaveLength(0);
   }
   for(const value of [range.min,range.max]){pose[servo-1]=value;await f.feed(f.time()+100,pose);expect(f.control.snapshot().canCapture).toBe(true);expect(f.control.capturePosition()).toEqual(pose);}
   expect(f.writes).toHaveLength(0);f.control.disconnect();await flush();
 });
 it('rejects later out-of-range program poses before the first write and retains Enable',async()=>{
   const f=fixture();await f.ready();f.control.enable(true);
   const invalid=[1968,1335,3144,3407,2109,2397];
   expect(()=>f.control.runProgram([{kind:'move',blockId:'first',servo:1,target:2130},{kind:'pose',blockId:'bad',positionId:'t2',name:'t2',positions:invalid}])).toThrow('Saved position "t2": J3 target 3144');
   expect(f.writes).toHaveLength(0);expect(f.control.snapshot().armed).toBe(true);expect(f.control.snapshot().program).toBeNull();
   expect(()=>f.control.moveToPosition(invalid)).toThrow('J4 target 3407');expect(f.writes).toHaveLength(0);
   f.control.runProgram([{kind:'move',blockId:'ok',servo:1,target:2130}]);await flush();expect(f.writes).toHaveLength(1);f.control.disconnect();await flush();
 });
 it('checks slider, jog and factory comparison targets without blocking read-only out-of-range feedback or Stop holds',async()=>{
   const f=fixture(),outside=[2050,2150,3003,3084,2000,1080];await f.ready(outside);f.control.enable(true);
   expect(f.control.snapshot().positions).toEqual(outside);expect(()=>f.control.capturePosition()).toThrow('Cannot record position');
   expect(()=>f.control.moveJoint(3,2901)).toThrow('2000–2900');expect(()=>f.control.liveJoint(4,3001)).toThrow('1250–3000');
   expect(()=>f.control.jog(3,20)).toThrow('J3');expect(()=>f.control.compareServo3Factory()).toThrow('J3');expect(f.writes).toHaveLength(0);
   f.control.moveJoint(3,2900);await flush();expect(f.writes[0]!.bytes[7]!+256*f.writes[0]!.bytes[8]!).toBe(2900);
   f.control.stop();await flush();expect(f.writes[1]!.bytes[7]!+256*f.writes[1]!.bytes[8]!).toBe(3003);
   expect(f.control.report().operatingRanges.protectedStudentPolicy).toBe(false);f.control.disconnect();await flush();
 });
 it('advances Blockly after Servo 4 stably settles ten units from its saved target',async()=>{
   const f=fixture(),before=[2050,2150,2100,3084,2000,1080],target=[...before];target[3]=2720;
   await f.ready(before);f.control.enable(true);f.control.runProgram([{kind:'pose',blockId:'pose',positionId:'p',name:'P',positions:target},{kind:'move',blockId:'next',servo:1,target:2130}]);await flush();
   const actual=[...target];actual[3]=2730;
   for(const at of [1300,1400,1500]){await f.feed(at,actual);f.control.tick();await flush();}expect(f.writes).toHaveLength(1);
   await f.feed(1700,actual);f.control.tick();await flush();expect(f.writes).toHaveLength(2);expect(f.writes[1]!.bytes[2]).toBe(1);
   expect(f.control.snapshot().program?.phase).toBe('Running');f.control.disconnect();await flush();
 });
 it('moves a saved pose in one batch, freezes its target and skips an already reached pose',async()=>{
   const f=fixture(),target=TEACHER_HOME.map(n=>n+100),expected=[...target];await f.ready();
   expect(()=>f.control.moveToPosition(target)).toThrow('Enable');f.control.enable(true);
   expect(()=>f.control.moveToPosition([1,2])).toThrow('Six valid');expect(f.writes).toHaveLength(0);
   f.control.moveToPosition(target);target.fill(0);await flush();expect(f.writes).toHaveLength(1);expect(f.writes[0]!.bytes).toHaveLength(84);
   for(let i=0;i<84;i+=14){const b=f.writes[0]!.bytes.slice(i,i+14);expect(b[7]!+256*b[8]!).toBe(expected[b[2]!-1]);expect(b.slice(11,13)).toEqual([88,2]);expect(b[6]).toBe(10);}
   expect(()=>f.control.moveToPosition(expected)).toThrow('progress');
   for(const at of [1300,1400,1500,1700])await f.feed(at,expected);
   expect(f.control.snapshot().home?.phase).toBe('Complete');f.control.moveToPosition(expected);await flush();expect(f.writes).toHaveLength(1);
   f.control.disconnect();await flush();
 });
 it('waits for all pose joints and a timed pause before dispatching the next pose block',async()=>{
   const f=fixture(),target=TEACHER_HOME.map(n=>n+100);await f.ready();f.control.enable(true);
   const instructions=[{kind:'pose',blockId:'p',positionId:'p',name:'Pickup',positions:target},{kind:'wait',blockId:'w',durationMs:1000},{kind:'pose',blockId:'b',positionId:'b',name:'Back',positions:[...TEACHER_HOME]}];
   f.control.runProgram(instructions);await flush();target.fill(0);expect(f.writes[0]!.bytes).toHaveLength(84);
   const pose=TEACHER_HOME.map(n=>n+100);pose[5]=TEACHER_HOME[5]!;
   for(const at of [1300,1400,1500,1700]){await f.feed(at,pose);f.control.tick();await flush();}expect(f.writes).toHaveLength(1);
   pose[5]!+=100;for(const at of [1800,1900,2000]){await f.feed(at,pose);f.control.tick();await flush();}
   expect(f.control.snapshot().program?.message).toContain('Waiting');
   for(let at=2100;at<3000;at+=100){await f.feed(at,pose);f.control.tick();await flush();}expect(f.writes).toHaveLength(1);
   await f.feed(3000,pose);f.control.tick();await flush();expect(f.writes).toHaveLength(2);expect(f.writes[1]!.bytes).toHaveLength(84);
   for(const at of [3200,3300,3400,3500]){await f.feed(at);f.control.tick();await flush();}
   expect(f.control.snapshot().program?.phase).toBe('Completed');f.control.disconnect();await flush();
 });
 it('Stop holds every commanded saved-pose joint and cancels subsequent blocks',async()=>{
   const f=fixture();await f.ready();f.control.enable(true);f.control.runProgram([{kind:'pose',blockId:'p',positionId:'p',name:'P',positions:TEACHER_HOME.map(n=>n+300)},{kind:'move',blockId:'later',servo:1,target:2300}]);await flush();
   await f.feed(1200,TEACHER_HOME.map(n=>n+20));f.control.stop();await flush();expect(f.writes).toHaveLength(2);expect(f.writes[1]!.bytes).toHaveLength(84);
   for(let at=1300;at<=3000;at+=100){await f.feed(at,TEACHER_HOME.map(n=>n+20));f.control.tick();await flush();}expect(f.writes).toHaveLength(2);expect(f.control.snapshot().program?.phase).toBe('Stopped');f.control.disconnect();await flush();
 });
 it('cancels a wait on Stop or stale feedback without sending the next pose',async()=>{
   for(const stop of [true,false]){
     const f=fixture();await f.ready();f.control.enable(true);f.control.runProgram([{kind:'wait',blockId:'w',durationMs:1000},{kind:'pose',blockId:'p',positionId:'p',name:'P',positions:TEACHER_HOME.map(n=>n+100)}]);
     if(stop)f.control.stop();f.setTime(2800);f.control.tick();await flush();expect(f.writes).toHaveLength(0);expect(f.control.snapshot().program?.phase).toBe(stop?'Stopped':'Fault');f.control.disconnect();await flush();
   }
 });
 it('captures fresh hand-positioned measurements without writing and rejects stale or moving capture',async()=>{
 const f=fixture(),pose=[2070,2160,2080,2190,2010,1100];await f.ready();f.control.setHolding(false,true);await flush();await f.feed(1700,pose);
 const count=f.writes.length,recorded=f.control.capturePosition();expect(recorded).toEqual(pose);recorded[0]=0;expect(f.control.snapshot().positions).toEqual(pose);expect(f.writes).toHaveLength(count);
 f.setTime(2300);expect(()=>f.control.capturePosition()).toThrow('current position feedback');
 await f.feed(2400,pose);f.control.setHolding(true,true);await flush();await f.feed(3000,pose);f.control.confirmHolding(true);f.control.enable(true);f.control.moveJoint(1,2130);await flush();
 expect(()=>f.control.capturePosition()).toThrow('progress');f.control.disconnect();await flush();
 });
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
 f.control.runProgram([{kind:'move',blockId:'x',servo:1,target:3000}]);await flush();
 const packet=f.writes[0]!.bytes;expect(packet[7]!+256*packet[8]!).toBe(3000);expect(packet.slice(11,13)).toEqual([88,2]);
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
 expect(g.writes).toHaveLength(2);expect(g.control.snapshot().program?.phase).toBe('Stopped');g.finish();await flush();g.control.disconnect();await flush();
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
 await g.feed(1700);g.control.tick();expect(g.writes).toHaveLength(2);expect(g.control.snapshot().armed).toBe(false);g.finish();await flush();g.control.disconnect();await flush();
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
 expect(b).toHaveLength(84);for(let offset=0;offset<b.length;offset+=14){const frame=b.slice(offset,offset+14);expect(frame[7]!+256*frame[8]!).toBe(pose[frame[2]!-1]);expect(frame.slice(11,13)).toEqual([88,2]);expect(frame[6]).toBe(100);}
 await f.window(1200,pose);f.control.tick();expect(f.writes).toHaveLength(2);expect(f.control.snapshot().armed).toBe(false);f.control.disconnect();await flush();
 });
 it('retains ownership during a hanging write and ignores a late completion',async()=>{
 const f=fixture({hang:true});await f.ready();f.control.enable(true);f.control.jog(1,20);await flush();f.control.disconnect();await flush();expect(f.port.close).not.toHaveBeenCalled();f.finish();await flush();expect(f.port.close).toHaveBeenCalledOnce();expect(f.control.snapshot().armed).toBe(false);expect(f.writes).toHaveLength(1);
 });
 it('never resumes a Home batch after Stop interrupts a hanging write',async()=>{
 const f=fixture({hang:true});await f.ready(TEACHER_HOME.map(value=>value+100));f.control.enable(true);f.control.returnHome();await flush();
 expect(f.writes).toHaveLength(1);expect(f.writes[0]!.bytes).toHaveLength(84);
 f.control.stop();expect(f.control.snapshot().armed).toBe(false);expect(f.control.snapshot().message).toContain('Waiting for the active USB write');
 f.finish();await flush();await f.feed(1700);f.control.tick();await flush();expect(f.writes).toHaveLength(2);expect(f.control.snapshot().home?.phase).toBe('Stopped');f.finish();await flush();
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
