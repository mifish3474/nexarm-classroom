import { describe, expect, it, vi } from 'vitest';
import { APPROVAL_KEY, ApprovedMappingTest } from '../app/src/safety/ApprovedMappingTest';
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const locks = { request: async (_name: string, _options: unknown, callback: (lease: object) => Promise<void>) => callback({}) } as unknown as LockManager;
function fixture(options: { rejectWrite?: boolean; hangWrite?: boolean; storageFails?: boolean } = {}) {
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
  const test = new ApprovedMappingTest(locks, storage, () => time, () => visible, () => {});
  const feed = async (at: number, positions = [2048,2048,2047,2048,2042,2053], weak = false) => {
    time = at;
    const body = [255,26,11,...Array(12).fill(0),...positions.flatMap(n => [n & 255,n >> 8])];
    const check = (~(weak ? body.slice(0,3) : body).reduce((a,b) => a+b,0)) & 255;
    reader.enqueue(Uint8Array.from([255,255,...body,check])); await flush();
  };
  const ready = async (start = 2048) => { test.connect(async () => port); await flush(); for (let t = 0; t <= 1100; t += 100) await feed(t,[start,2048,2047,2048,2042,2053]); };
  return { test, port, writes, stored, feed, ready, setTime: (at: number) => { time = at; }, hide: () => { visible = false; }, finishWrite: () => finishWrite() };
}
describe('approved single-axis commissioning exception', () => {
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
