import { describe, expect, it, vi } from 'vitest';
import { PassiveConnection } from '../app/src/serial/PassiveConnection';
import type { ReadOnlyPort } from '../app/src/serial/PassiveConnection';

const locks = { request: async (_name: string, _options: unknown, callback: (lease: object) => Promise<void>) => callback({}) } as unknown as LockManager;
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function fixture() {
  const states: string[] = [], bytes: Uint8Array[] = [];
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const port: ReadOnlyPort = {
    readable: new ReadableStream({ start(value) { controller = value; } }),
    open: vi.fn(async () => {}), close: vi.fn(async () => {}),
  };
  Object.defineProperty(port, 'writable', { get() { throw new Error('Writer access forbidden'); } });
  const connection = new PassiveConnection((state) => states.push(state), value => bytes.push(value), locks);
  return { connection, states, port, bytes, push: (value: Uint8Array) => controller.enqueue(value), fail: () => controller.error(new Error('USB removed')) };
}
describe('passive USB lifecycle', () => {
  it('requests consent synchronously, opens once at 1 Mbps, reads and closes without writer access', async () => {
    const f = fixture(), picker = vi.fn(async () => f.port);
    f.connection.connect(picker); expect(picker).toHaveBeenCalledOnce();
    f.connection.connect(picker); expect(picker).toHaveBeenCalledOnce();
    await flush(); f.push(Uint8Array.of(1,2,3)); await flush();
    expect(f.bytes).toEqual([Uint8Array.of(1,2,3)]);
    expect(f.port.open).toHaveBeenCalledExactlyOnceWith({ baudRate: 1000000 });
    f.connection.disconnect(); f.connection.disconnect(); await flush();
    expect(f.port.close).toHaveBeenCalledOnce(); expect(f.states.at(-1)).toBe('Disconnected');
  });
  it('cancels a pending picker before any open', async () => {
    const f = fixture(); let selected!: (port: ReadOnlyPort) => void;
    f.connection.connect(() => new Promise(resolve => { selected = resolve; }));
    f.connection.disconnect(); selected(f.port); await flush();
    expect(f.port.open).not.toHaveBeenCalled(); expect(f.states.at(-1)).toBe('Disconnected');
  });
  it('closes an opening port after cancellation and ignores late data', async () => {
    const f = fixture(); let opened!: () => void;
    f.port.open = () => new Promise(resolve => { opened = resolve; });
    f.connection.connect(async () => f.port); await flush();
    f.connection.disconnect(); opened(); await flush();
    expect(f.port.close).toHaveBeenCalledOnce(); expect(f.bytes).toEqual([]);
  });
  it('handles read errors and refuses replacement connections after failed cleanup', async () => {
    const f = fixture(); f.port.close = vi.fn(async () => { throw new Error('Close failed'); });
    f.connection.connect(async () => f.port); await flush(); f.fail(); await flush();
    expect(f.states.at(-1)).toBe('Closing');
    const picker = vi.fn(async () => f.port); f.connection.connect(picker);
    expect(picker).not.toHaveBeenCalled();
  });
  it('never opens when another tab has the exclusive lease', async () => {
    const f = fixture();
    const unavailable = { request: async (_n: string, _o: unknown, callback: (lease: null) => Promise<void>) => callback(null) } as unknown as LockManager;
    const connection = new PassiveConnection(() => {}, () => {}, unavailable);
    connection.connect(async () => f.port); await flush(); expect(f.port.open).not.toHaveBeenCalled();
  });
});
