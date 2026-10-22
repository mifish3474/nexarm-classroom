import { describe, expect, it, vi } from 'vitest';
import { APPROVAL_KEY, ApprovedMappingTest } from '../app/src/safety/ApprovedMappingTest';
import { jointPlan } from '../app/src/safety/JointTestPlans';
import {RETURN_APPROVAL_KEY} from '../app/src/safety/StagedReferenceReturn';
import {MANUAL_STATE_KEY} from '../app/src/safety/ManualPositioning';
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const locks = { request: async (_name: string, _options: unknown, callback: (lease: object) => Promise<void>) => callback({}) } as unknown as LockManager;
function fixture(options: { rejectWrite?: boolean; hangWrite?: boolean; storageFails?: boolean; servo?: number } = {}) {
  let time = 0, visible = true;
  let reader!: ReadableStreamDefaultController<Uint8Array>;
  let finishWrite!: () => void;
  const writes: number[][] = [], stored = new Map<string,string>();
  const storage = { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string,value: string) => { if (options.storageFails) throw new Error('No storage'); stored.set(key,value); } };
  const port = {
    readable: new ReadableStream<Uint8Array>({ start(controller) { reader = controller; } }),
    writable: new WritableStream<Uint8Array>({ write(bytes) {
      writes.push([...bytes]);
      if (options.rejectWrite) return Promise.reject(new Error('USB failure'));
      if (options.hangWrite) return new Promise<void>(resolve => { finishWrite = resolve; });
    } }), open: vi.fn(async () => {}), close: vi.fn(async () => {}),
  };
  const test = new ApprovedMappingTest(locks, storage, () => time, () => visible, () => {}, options.servo ?? 1);
  const feed = async (at: number, positions = [2048,2048,2047,2048,2042,2053], weak = false) => {
    time = at;
    const body = [255,26,11,...Array(12).fill(0),...positions.flatMap(n => [n & 255,n >> 8])];
    const check = (~(weak ? body.slice(0,3) : body).reduce((a,b) => a+b,0)) & 255;
    reader.enqueue(Uint8Array.from([255,255,...body,check])); await flush();
  };
  const ready = async (start?: number) => { const positions = [...jointPlan(options.servo ?? 1).reference]; positions[(options.servo ?? 1)-1] = start ?? positions[(options.servo ?? 1)-1]!; test.connect(async () => port); await flush(); for (let t = 0; t <= 1100; t += 100) await feed(t,positions); };
  return { test, port, writes, stored, feed, ready, setTime: (at: number) => { time = at; }, hide: () => { visible = false; }, finishWrite: () => finishWrite() };
}
describe('approved single-axis commissioning exception', () => {
  it('releases and restores through the same writer, requiring new evidence and physical holding confirmation',async()=>{
    const f=fixture({servo:2});await f.ready();expect(()=>f.test.enableManual(false)).toThrow('Confirm');
    f.test.enableManual(true);expect(f.writes).toEqual([]);expect(f.test.snapshot().canRelease).toBe(true);
    expect(()=>f.test.enable(true)).toThrow('manual');expect(()=>f.test.selectJoint(3)).toThrow();
    f.test.sendHolding(false,true);await flush();expect(f.writes).toEqual([[255,255,255,3,61,0,192]]);
    expect(f.test.snapshot().manualPhase).toBe('Manual setup');expect(f.test.snapshot().canRestore).toBe(false);
    const placed=[2048,2048,2047,2048,2042,2053];
    for(let at=1200;at<=2300;at+=100)await f.feed(at,placed);
    expect(f.test.snapshot().canRestore).toBe(true);expect(f.test.snapshot().canEnable).toBe(false);
    f.test.sendHolding(true,true);await flush();expect(f.writes[1]).toEqual([255,255,255,3,61,1,191]);
    expect(f.test.snapshot().manualPhase).toBe('Confirm holding');expect(()=>f.test.confirmHolding(true)).toThrow();
    for(let at=2400;at<=3500;at+=100)await f.feed(at,placed);
    expect(()=>f.test.confirmHolding(false)).toThrow('Physically');f.test.confirmHolding(true);
    expect(JSON.parse(f.stored.get(MANUAL_STATE_KEY)!).requiresHoldingVerification).toBe(false);
    expect(f.test.snapshot().canEnable).toBe(false);
    for(let at=3600;at<=4700;at+=100)await f.feed(at,placed);
    expect(f.test.snapshot().canEnable).toBe(true);expect(f.writes).toHaveLength(2);f.test.stop();await flush();
  });
  it('refreshes the durable manual interlock at connect even if another tab released after page construction',async()=>{
    const f=fixture({servo:2});f.stored.set(MANUAL_STATE_KEY,JSON.stringify({requiresHoldingVerification:true,events:[]}));await f.ready();
    expect(f.test.snapshot().manualPhase).toBe('Recovery required');expect(f.test.snapshot().canEnable).toBe(false);
    expect(f.test.snapshot().canConfirmHolding).toBe(true);expect(f.writes).toEqual([]);
    f.test.confirmHolding(true);expect(f.writes).toEqual([]);f.test.stop();await flush();
  });
  it('does not automatically restore on Stop or let a late release write unlock movement',async()=>{
    const f=fixture({servo:2,hangWrite:true});await f.ready();f.test.enableManual(true);f.test.sendHolding(false,true);await flush();
    f.test.stop();await flush();expect(f.test.snapshot().manualPhase).toBe('Recovery required');expect(f.test.snapshot().canConnect).toBe(false);
    f.finishWrite();await flush();expect(f.test.snapshot().manualPhase).toBe('Recovery required');expect(f.writes).toHaveLength(1);
    expect(JSON.parse(f.stored.get(MANUAL_STATE_KEY)!).requiresHoldingVerification).toBe(true);
  });
  it('cancels a hanging release at its deadline and rejects a late completion even before a watchdog tick',async()=>{
    const f=fixture({servo:2,hangWrite:true});await f.ready();f.test.enableManual(true);f.test.sendHolding(false,true);await flush();
    f.setTime(3200);f.finishWrite();await flush();expect(f.test.snapshot().phase).toBe('Fault');expect(f.test.snapshot().manualPhase).toBe('Recovery required');expect(f.writes).toHaveLength(1);
    const g=fixture({servo:2,hangWrite:true});await g.ready();g.test.enableManual(true);g.test.sendHolding(false,true);await flush();
    for(let at=1200;at<=3100;at+=100)await g.feed(at,[2066,2044,2043,2049,2043,2053]);
    g.test.tick();expect(g.test.snapshot().phase).toBe('Fault');expect(g.port.close).not.toHaveBeenCalled();g.finishWrite();await flush();expect(g.port.close).toHaveBeenCalledOnce();
  });
  it('writes no release when durable manual-state storage fails',async()=>{
    const f=fixture({servo:2,storageFails:true});await f.ready();f.test.enableManual(true);f.test.sendHolding(false,true);await flush();
    expect(f.writes).toEqual([]);expect(f.test.snapshot().phase).toBe('Fault');
  });
  it('requires a separate teacher review and fresh evidence for a return retry, preserving the old marker',async()=>{
    const f=fixture({servo:2});f.stored.set(RETURN_APPROVAL_KEY,'old return attempt');await f.ready();
    expect(f.test.snapshot().homeCanEnable).toBe(false);
    expect(()=>f.test.reviewRetry('return',false)).toThrow('Confirm');
    f.test.reviewRetry('return',true);expect(f.writes).toEqual([]);expect(f.test.snapshot().homeCanEnable).toBe(false);
    for(let at=1200;at<=2300;at+=100)await f.feed(at,[2066,2044,2043,2049,2043,2053]);
    expect(f.test.snapshot().homeCanEnable).toBe(true);f.test.enableReturn(true,true);f.test.startReturn(true,true);await flush();
    expect(f.writes).toHaveLength(1);expect(f.stored.get(RETURN_APPROVAL_KEY)).toBe('old return attempt');
    expect([...f.stored.keys()].filter(key=>key.startsWith(`${RETURN_APPROVAL_KEY}.retry.`))).toHaveLength(1);
    expect(()=>f.test.reviewRetry('return',true)).toThrow('Stop');f.test.stop();await flush();
  });
  it('allows a reviewed selected-joint retry only from the reviewed starting region',async()=>{
    const f=fixture({servo:3});f.stored.set(jointPlan(3).key,'prior attempt');await f.ready();
    f.test.reviewRetry('joint',true);expect(f.writes).toEqual([]);
    await f.feed(1200,[2066,2044,2043,2049,2043,2053]);
    for(let at=1300;at<=2300;at+=100)await f.feed(at,[2048,2048,2056,2048,2042,2053]);
    expect(f.test.snapshot().canEnable).toBe(false); // Old retained readings still vary too much.
    for(let at=2400;at<=4500;at+=100)await f.feed(at,[2048,2048,2056,2048,2042,2053]);
    expect(f.test.snapshot().canEnable).toBe(true);f.test.enable(true);expect(f.test.snapshot().plan.target).toBe(2076);
    f.test.send();await flush();expect(f.writes[0]?.slice(2,8)).toEqual([3,5,3,42,28,8]);
    expect(f.stored.get(jointPlan(3).key)).toBe('prior attempt');f.test.stop();await flush();
  });
  it.each([2,3,4,5,6])('accepts a settled +9 Reference A offset for joint %s and freezes a +20 target',async servo=>{
    const f=fixture({servo}),positions=[2057,2057,2056,2057,2051,2062];f.test.connect(async()=>f.port);await flush();
    for(let at=0;at<=1100;at+=100)await f.feed(at,positions);
    expect(f.test.snapshot().canEnable).toBe(true);f.test.enable(true,true);
    const target=positions[servo-1]!+20;expect(f.test.snapshot().plan.target).toBe(target);
    positions[servo-1]!-=5;await f.feed(1200,positions);expect(f.test.snapshot().plan.target).toBe(target);
    f.test.send(true);await flush();expect(f.writes[0]![6]!+256*f.writes[0]![7]!).toBe(target);
    f.test.stop();await flush();
  });
  it('does not renew with stale feedback, a hidden page, or an unresolved write',async()=>{
    const f=fixture({servo:2});f.stored.set(RETURN_APPROVAL_KEY,'old');await f.ready();f.setTime(1700);
    expect(()=>f.test.reviewRetry('return',true)).toThrow('fresh');f.hide();expect(()=>f.test.reviewRetry('return',true)).toThrow('Reconnect');f.test.stop();await flush();
    const g=fixture({servo:2,hangWrite:true});await g.ready();g.test.enable(true);g.test.send();await flush();
    g.test.stop();await flush();expect(()=>g.test.reviewRetry('joint',true)).toThrow('Reconnect');
    expect(g.test.snapshot().canConnect).toBe(false);g.finishWrite();await flush();
  });
  it('completes the return with the documented 9-unit lag, without correction commands',async()=>{
    const f=fixture({servo:2}),positions=[2046,2009,1943,2048,2044,2052];f.test.connect(async()=>f.port);await flush();
    for(let at=0;at<=1100;at+=100)await f.feed(at,positions);
    f.test.enableReturn(true,true);f.test.startReturn(true,true);await flush();
    let applied=0;
    for(let at=1200;at<=13000;at+=100){
      if(f.writes.length>applied){const frame=f.writes.at(-1)!,index=frame[2]!-1,target=frame[6]!+256*frame[7]!;expect(Math.abs(target-positions[index]!)).toBeLessThanOrEqual(25);positions[index]=target-9;applied=f.writes.length;}
      await f.feed(at,positions);f.test.tick();await flush();
    }
    expect(f.test.returnReport()?.phase).toBe('Complete');expect(f.writes).toHaveLength(10);
    for(let at=13100;at<=15200;at+=100)await f.feed(at,positions);
    expect(f.test.snapshot().canEnable).toBe(true);f.test.stop();await flush();
  });
  it('returns the reported pose through ten guarded waypoints, skipping the other four joints',async()=>{
    const f=fixture({servo:2}),positions=[2046,2009,1943,2048,2044,2052];
    f.stored.set(APPROVAL_KEY,'previous base attempt'); f.test.connect(async()=>f.port);await flush();
    for(let at=0;at<=1100;at+=100)await f.feed(at,positions);
    expect(f.test.snapshot().homeCanEnable).toBe(true);f.test.enableReturn(true,true);expect(f.writes).toEqual([]);
    expect(()=>f.test.enable(true)).toThrow();expect(()=>f.test.selectJoint(3)).toThrow();
    f.test.startReturn(true,true);await flush();
    for(let at=1200;at<=12000&&f.test.returnReport()?.phase==='Running';at+=100){const last=f.writes.at(-1);if(last)positions[last[2]!-1]=last[6]!+256*last[7]!;await f.feed(at,positions);f.test.tick();await flush();}
    expect(f.writes.map(b=>[b[2],b[6]!+256*b[7]!])).toEqual([[2,2022],[2,2035],[2,2048],[3,1958],[3,1973],[3,1988],[3,2002],[3,2017],[3,2032],[3,2047]]);
    expect(f.test.returnReport()?.phase).toBe('Complete');expect(f.stored.get(APPROVAL_KEY)).toBe('previous base attempt');expect(f.stored.has(RETURN_APPROVAL_KEY)).toBe(true);
    expect(()=>f.test.enableReturn(true,true)).toThrow('consumed');f.test.stop();await flush();
  });
  it('returns all six joints in the negative direction with 9-unit residuals and no delta above 25',async()=>{
    const f=fixture({servo:2}),positions=[2068,2064,2063,2069,2063,2073],reference=[2048,2048,2047,2048,2042,2053];
    f.test.connect(async()=>f.port);await flush();for(let at=0;at<=1100;at+=100)await f.feed(at,positions);
    f.test.enableReturn(true,true);f.test.startReturn(true,true);await flush();let applied=0;
    for(let at=1200;at<=19000&&f.test.returnReport()?.phase==='Running';at+=100){
      if(f.writes.length>applied){const frame=f.writes.at(-1)!,index=frame[2]!-1,target=frame[6]!+256*frame[7]!;expect(Math.abs(target-positions[index]!)).toBeLessThanOrEqual(25);positions[index]=target+9;applied=f.writes.length;}
      await f.feed(at,positions);f.test.tick();await flush();
    }
    expect(f.test.returnReport()?.phase).toBe('Complete');expect([...new Set(f.writes.map(frame=>frame[2]))]).toEqual([2,3,4,5,1,6]);
    expect(positions.every((n,i)=>Math.abs(n-reference[i]!)<=9)).toBe(true);f.test.stop();await flush();
  });
  it('cancels future return waypoints on Stop, changed joints, or late writes',async()=>{
    const f=fixture({servo:2,hangWrite:true});await f.ready();f.test.enableReturn(true,true);f.test.startReturn(true,true);await flush();
    f.setTime(3200);f.test.tick();await flush();expect(f.test.returnReport()?.phase).toBe('Fault');expect(f.writes).toHaveLength(1);expect(f.port.close).not.toHaveBeenCalled();
    f.finishWrite();await flush();expect(f.port.close).toHaveBeenCalledOnce();expect(f.test.returnReport()?.phase).toBe('Fault');
    const g=fixture({servo:2});await g.ready();g.test.enableReturn(true,true);g.test.startReturn(true,true);await flush();g.test.stop();await flush();expect(g.writes).toHaveLength(1);expect(g.test.returnReport()?.phase).toBe('Stopped');
    const h=fixture({servo:2});await h.ready();h.test.enableReturn(true,true);h.test.startReturn(true,true);await flush();await h.feed(1200,[2048,2070,2043,2049,2043,2053]);expect(h.test.returnReport()?.phase).toBe('Fault');expect(h.writes).toHaveLength(1);
  });
  it('requires return confirmation and rejects storage failure without writing',async()=>{
    const f=fixture({servo:2,storageFails:true});await f.ready();expect(()=>f.test.enableReturn(true,false)).toThrow();f.test.enableReturn(true,true);f.test.startReturn(true,true);await flush();expect(f.writes).toEqual([]);expect(f.test.returnReport()?.phase).toBe('Fault');
  });
  it.each([[2,2064,179],[3,2063,179],[4,2069,172],[5,2063,177],[6,2073,166]])('suite servo %s writes its own fixed target once and supervises the selected channel', async (servo,target,checksum) => {
    const f = fixture({servo}); await f.ready(); f.test.enable(true,true); f.test.send(true); await flush();
    expect(f.writes).toEqual([[255,255,servo,5,3,42,target & 255,8,checksum]]);
    const feedback = [...jointPlan(servo).reference]; feedback[servo-1] = target-2;
    for(const at of [1200,1300,1400]) await f.feed(at,feedback);
    expect(f.test.snapshot().phase).toBe('Complete'); expect(f.stored.has(jointPlan(servo).key)).toBe(true);
    expect(f.stored.has(APPROVAL_KEY)).toBe(false); f.test.stop(); await flush();
  });
  it('switches tests on one idle connection but never during enable/write, and retains independent lockouts', async () => {
    const f = fixture({servo:2}); await f.ready(); f.test.enable(true);
    expect(() => f.test.selectJoint(3)).toThrow(); f.test.send(); await flush();
    expect(() => f.test.selectJoint(3)).toThrow();
    const feedback = [2066,2062,2043,2049,2043,2053];
    for(const at of [1200,1300,1400]) await f.feed(at,feedback);
    f.test.selectJoint(3); expect(f.test.snapshot().canEnable).toBe(false);
    for(let at=1500;at<=2600;at+=100) await f.feed(at,feedback);
    expect(f.test.snapshot().canEnable).toBe(true);
    expect(() => f.test.selectJoint(1)).toThrow('already confirmed');
    f.test.selectJoint(2); expect(f.test.snapshot().canEnable).toBe(false);
    expect(f.test.snapshot().reason).toContain('consumed'); expect(f.writes).toHaveLength(1); f.test.stop(); await flush();
  });
  it('requires a separate clear-pinch confirmation for the gripper at Enable and Send', async () => {
    const f = fixture({servo:6}); await f.ready(); expect(() => f.test.enable(true)).toThrow('empty gripper');
    f.test.enable(true,true); expect(() => f.test.send()).toThrow('pinch area');
    expect(f.writes).toEqual([]); f.test.stop(); await flush();
  });
  it.each([2048,2066])('remaining tests can start with the base at reviewed pose %s without commanding a home move', async base => {
    const f = fixture({servo:2}); f.test.connect(async()=>f.port); await flush();
    for(let at=0;at<=1100;at+=100) await f.feed(at,[base,2044,2043,2049,2043,2053]);
    expect(f.test.snapshot().canEnable).toBe(true); expect(f.writes).toEqual([]); f.test.stop(); await flush();
  });
  it('sends exactly the approved frame only after explicit enable and retires the approval', async () => {
    const f = fixture(); await f.ready(); expect(f.writes).toEqual([]);
    expect(() => f.test.send()).toThrow('Enable'); f.test.enable(true); expect(f.writes).toEqual([]);
    f.test.send(); expect(() => f.test.send()).toThrow(); await flush();
    expect(f.writes).toEqual([[255,255,1,5,3,42,20,8,176]]); expect(f.stored.has(APPROVAL_KEY)).toBe(true);
    for (const t of [1200,1300,1400]) await f.feed(t,[2063,2048,2047,2048,2042,2053]);
    expect(f.test.snapshot().phase).toBe('Complete'); expect(f.writes).toHaveLength(1);
    f.test.stop(); await flush(); expect(f.test.snapshot().canEnable).toBe(false);
  });
  it.each([2043, 2048, 2050, 2053])('accepts start %s but always sends the fixed target 2068', async start => {
    const f = fixture(); await f.ready(start); expect(f.test.snapshot().canEnable).toBe(true);
    f.test.enable(true); f.test.send(); await flush();
    expect(f.writes).toEqual([[255,255,1,5,3,42,20,8,176]]);
    expect(f.test.report()).toMatchObject({ startingWindow: [2043,2053], before: [start,2048,2047,2048,2042,2053], target: 2068 });
    f.test.stop(); await flush();
  });
  it.each([2042, 2054])('rejects start %s outside the approved window without resetting hardware', async start => {
    const f = fixture(); await f.ready(start);
    expect(() => f.test.enable(true)).toThrow('2043–2053'); expect(f.writes).toEqual([]); f.test.stop(); await flush();
  });
  it('checks the entire retained window, not only its latest reading', async () => {
    const f = fixture(); await f.ready(); await f.feed(1200,[2042,2048,2047,2048,2042,2053]); await f.feed(1300,[2050,2048,2047,2048,2042,2053]);
    expect(f.test.snapshot().positions![0]).toBe(2050);
    expect(() => f.test.enable(true)).toThrow('2043–2053'); expect(f.writes).toEqual([]); f.test.stop(); await flush();
  });
  it('allows in-window variation after enabling but rejects an out-of-window sample', async () => {
    const f = fixture(); await f.ready(2043); f.test.enable(true); await f.feed(1200,[2053,2048,2047,2048,2042,2053]);
    expect(f.test.snapshot().canSend).toBe(true);
    await f.feed(1300,[2054,2048,2047,2048,2042,2053]);
    expect(f.test.snapshot().phase).toBe('Fault'); expect(() => f.test.send()).toThrow(); expect(f.writes).toEqual([]);
  });
  it('disarms on changed conditions between Enable and Send', async () => {
    const f = fixture(); await f.ready(); f.test.enable(true); await f.feed(1200,[2048,2070,2047,2048,2042,2053]);
    expect(f.test.snapshot().phase).toBe('Fault'); expect(() => f.test.send()).toThrow(); expect(f.writes).toEqual([]);
  });
  it('rejects stale or hidden sending even before a watchdog tick', async () => {
    const f = fixture(); await f.ready(); f.test.enable(true); f.setTime(1700);
    expect(() => f.test.send()).toThrow(); f.hide(); expect(() => f.test.send()).toThrow(); expect(f.writes).toEqual([]); f.test.stop(); await flush();
  });
  it('refuses writes when durable approval consumption fails', async () => {
    const f = fixture({ storageFails: true }); await f.ready(); f.test.enable(true); f.test.send(); await flush();
    expect(f.writes).toEqual([]); expect(f.test.snapshot().phase).toBe('Fault');
  });
  it('consumes uncertain writes and never retries or returns', async () => {
    const f = fixture({ rejectWrite: true }); await f.ready(); f.test.enable(true); f.test.send(); await flush();
    expect(f.test.snapshot().phase).toBe('Fault'); expect(f.writes).toHaveLength(1); expect(f.stored.has(APPROVAL_KEY)).toBe(true);
  });
  it('keeps ownership during a timed-out write and ignores its late resolution', async () => {
    const f = fixture({ hangWrite: true }); await f.ready(); f.test.enable(true); f.test.send(); await flush();
    f.setTime(3200); f.test.tick(); await flush();
    expect(f.test.snapshot().phase).toBe('Fault'); expect(f.test.snapshot().canConnect).toBe(false); expect(f.port.close).not.toHaveBeenCalled();
    f.finishWrite(); await flush(); expect(f.port.close).toHaveBeenCalledOnce(); expect(f.test.snapshot().phase).toBe('Fault'); expect(f.writes).toHaveLength(1);
  });
  it('faults on weak telemetry or unexpected uncommanded joint motion', async () => {
    const f = fixture(); await f.ready(); f.test.enable(true); await f.feed(1200,undefined,true);
    expect(f.test.snapshot().phase).toBe('Fault'); expect(f.writes).toEqual([]);
    const g = fixture(); await g.ready(); g.test.enable(true); g.test.send(); await flush();
    await g.feed(1200,[2063,2070,2047,2048,2042,2053]); expect(g.test.snapshot().phase).toBe('Fault'); expect(g.writes).toHaveLength(1);
  });
  it('Stop before Send writes nothing, and persisted consumption survives a new controller', async () => {
    const f = fixture(); await f.ready(); f.test.enable(true); f.test.stop(); expect(() => f.test.send()).toThrow(); expect(f.writes).toEqual([]); await flush();
    const g = fixture(); g.stored.set(APPROVAL_KEY,'already attempted'); await g.ready();
    expect(g.test.snapshot().canEnable).toBe(false); expect(() => g.test.enable(true)).toThrow('consumed'); g.test.stop(); await flush();
  });
});
