// Deliberately read-only: no writable stream, write method, signals, or encoder.
export interface ReadOnlyPort {
  readonly readable: ReadableStream<Uint8Array> | null;
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
}
export type ConnectionState = 'Disconnected' | 'Connecting' | 'Listening' | 'Closing';

export class PassiveConnection {
  private state: ConnectionState = 'Disconnected';
  private generation = 0;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  constructor(private readonly onState: (state: ConnectionState, message: string) => void,
    private readonly onBytes: (bytes: Uint8Array) => void,
    private readonly locks: LockManager) {}

  private update(state: ConnectionState, message: string) { this.state = state; this.onState(state, message); }

  // Call directly in the Connect click handler to retain browser user activation.
  connect(selectPort: () => Promise<ReadOnlyPort>): void {
    if (this.state !== 'Disconnected') return;
    const generation = ++this.generation;
    this.update('Connecting', 'Choose the robot port. No application commands will be sent.');
    let selection: Promise<{ port: ReadOnlyPort } | { error: unknown }>;
    try { selection = selectPort().then(port => ({ port }), error => ({ error })); }
    catch (error) { this.update('Disconnected', String(error)); return; }
    void this.locks.request('nexarm-classroom-usb', { ifAvailable: true }, async lease => {
      if (!lease) throw new Error('Another tab owns the classroom USB connection. Close it first.');
      const selected = await selection;
      if (generation !== this.generation) return;
      if ('error' in selected) throw selected.error;
      const port = selected.port;
      let opened = false;
      try {
        await port.open({ baudRate: 1_000_000 }); opened = true;
        if (generation !== this.generation) return;
        if (!port.readable) throw new Error('The port has no readable stream.');
        const reader = port.readable.getReader(); this.reader = reader;
        this.update('Listening', 'Listening only. No motion or read-request commands are sent.');
        try {
          while (generation === this.generation) {
            const { value, done } = await reader.read();
            if (generation !== this.generation || done) break;
            if (!value) continue;
            for (let offset = 0; offset < value.length; offset += 256) {
              if (generation !== this.generation) break;
              this.onBytes(value.subarray(offset, offset + 256));
              // Yield on large/noisy serial chunks so Disconnect stays reachable.
              if (offset > 0 && offset % 4096 === 0) await new Promise(resolve => setTimeout(resolve, 0));
            }
          }
        } finally { reader.releaseLock(); this.reader = null; }
      } finally {
        // No replacement connection until the previous open/read/close settles.
        this.update('Closing', 'Closing the read-only session…');
        if (opened) await port.close();
      }
    }).then(() => this.update('Disconnected', 'Disconnected. Connect explicitly to inspect again.'), error => {
      // Failed cleanup cannot safely authorize a second connection; reload only
      // after checking the browser/device connection, rather than silently retry.
      this.update(this.state === 'Closing' ? 'Closing' : 'Disconnected', error instanceof Error ? error.message : 'Connection failed.');
    });
  }

  disconnect(): void {
    if (this.state === 'Disconnected' || this.state === 'Closing') return;
    this.generation++;
    this.update('Closing', 'Disconnecting; waiting for pending port work to settle…');
    void this.reader?.cancel().catch(() => { /* Read loop owns final cleanup. */ });
  }
}
