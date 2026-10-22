import { PassiveConnection } from '../serial/PassiveConnection';
import type { ReadOnlyPort } from '../serial/PassiveConnection';
import { FrameParser, decodePositions } from '../protocol/FrameParser';
import { encodeGoalPosition } from '../protocol/NexArmCodec';
import { ReferenceCapture } from '../robot/ReferenceCapture';

export interface TestPort extends ReadOnlyPort { readonly writable: WritableStream<Uint8Array> | null; }
// Keep the original key: changing the allowed observation window must never
// resurrect an approval that was already consumed by an earlier app version.
export const APPROVAL_KEY = 'nexarm.approval.reference-a-servo1-plus20.2026-10-22';
const START_MIN = 2043, START_MAX = 2053;
const REFERENCE = [2048, 2048, 2047, 2048, 2042, 2053];
type Phase = 'Disconnected' | 'Observing' | 'Enabled' | 'Observing result' | 'Complete' | 'Stopped' | 'Fault';

// A fixed, teacher-approved commissioning exception. No caller supplies targets,
// servo IDs, packets, retries, or a way to reset the consumed approval.
export class ApprovedMappingTest {
  private readonly connection: PassiveConnection;
  private readonly parser = new FrameParser();
  private readonly evidence = new ReferenceCapture();
  private port: TestPort | null = null;
  private pending: Promise<void> | null = null;
  private connected = false;
  private connectionState = 'Disconnected';
  private phase: Phase = 'Disconnected';
  private message = 'Connect explicitly. No command is sent on connection.';
  private positions: readonly number[] | null = null;
  private receivedAt = -Infinity;
  private connectedAt = 0;
  private before: readonly number[] | null = null;
  private startedAt = 0;
  private written = false;
  private attempt = false;
  private settled: { at: number; value: number }[] = [];

  constructor(locks: LockManager, private readonly storage: Pick<Storage, 'getItem' | 'setItem'>,
    private readonly now: () => number, private readonly visible: () => boolean,
    private readonly changed: () => void) {
    this.connection = new PassiveConnection((state, message) => {
      this.connectionState = state; this.connected = state === 'Listening';
      if (this.connected) { this.phase = 'Observing'; this.connectedAt = this.now(); this.message = 'Collecting full-checksum starting-state evidence.'; }
      else {
        this.evidence.clear();
        if (this.phase === 'Observing result') { this.phase = 'Fault'; this.message = 'Connection lost; delivery/movement may have occurred. No retry.'; }
        else if (!['Complete', 'Fault', 'Stopped'].includes(this.phase)) { this.phase = 'Disconnected'; this.message = message; }
      }
      this.changed();
    }, bytes => this.receive(bytes), locks);
  }

  private approvalReason(): string | null {
    try { return this.storage.getItem(APPROVAL_KEY) === null ? null : 'This approval has already been consumed. No repeat or return command is authorized.'; }
    catch { return 'Local approval storage is unavailable. Sending is disabled.'; }
  }

  private preflight(): string | null {
    if (!this.visible()) return 'The test page must be visible.';
    if (this.approvalReason()) return this.approvalReason();
    if (!this.connected || !this.port) return 'Connect and wait for fresh telemetry.';
    if (['Fault', 'Stopped', 'Complete', 'Observing result'].includes(this.phase)) return 'This run is closed. No command is available.';
    const reason = this.evidence.reason(this.now()); if (reason) return reason;
    const window = this.evidence.capture(this.now());
    if (window.observation.min[0]! < START_MIN || window.observation.max[0]! > START_MAX) return 'Servo 1 must remain within 2043–2053 throughout the observation window. Do not reset the physical arm to fit this test.';
    for (let i = 1; i < 6; i++) {
      if (Math.abs(window.observation.min[i]! - REFERENCE[i]!) > 12 || Math.abs(window.observation.max[i]! - REFERENCE[i]!) > 12) return 'The other joints do not match Reference A. Review a new reference.';
    }
    return null;
  }

  snapshot() {
    const reason = this.preflight();
    return { phase: this.phase, connectionState: this.connectionState, message: this.message,
      positions: this.positions ? [...this.positions] : null, reason,
      canEnable: this.phase === 'Observing' && reason === null,
      canSend: this.phase === 'Enabled' && reason === null,
      canConnect: this.connectionState === 'Disconnected', attempted: this.attempt };
  }

  connect(select: () => Promise<TestPort>): void {
    if (this.connectionState !== 'Disconnected' || !this.visible()) return;
    this.parser.reset(); this.evidence.clear(); this.positions = null; this.receivedAt = -Infinity;
    this.connection.connect(async () => {
      const port = await select(); this.port = port;
      // The read lifecycle owns the same exclusive lease until any outstanding
      // write settles and the port closes. A hung write cannot free a new writer.
      return {
        get readable() { return port.readable; },
        open: options => port.open(options),
        close: async () => { await this.pending?.catch(() => {}); await port.close(); this.port = null; },
      };
    });
  }

  enable(confirmed: boolean): void {
    const reason = this.preflight();
    if (!confirmed || this.phase !== 'Observing' || reason) throw new Error(reason ?? 'Confirm the reviewed setup before enabling.');
    this.phase = 'Enabled'; this.message = 'Enabled for one attempt: servo 1 → 2068. Send is a separate deliberate action.'; this.changed();
  }

  send(): void {
    const reason = this.preflight();
    if (this.phase !== 'Enabled' || reason) throw new Error(reason ?? 'Explicit Enable is required.');
    // Synchronous consumption and write initiation: no await can let Stop, a
    // second click, or another UI action interleave after validation.
    const marker = JSON.stringify({ approval: 'reference-a-servo1-plus20', consumedAt: new Date().toISOString(), target: 2068, startingWindow: [START_MIN, START_MAX], startingValue: this.positions![0] });
    try {
      this.storage.setItem(APPROVAL_KEY, marker);
      if (this.storage.getItem(APPROVAL_KEY) !== marker) throw new Error('Approval could not be durably marked.');
    } catch { this.fault('Approval storage failed. No write was attempted. Review before proceeding.'); return; }
    this.before = [...this.positions!]; this.attempt = true; this.startedAt = this.now();
    this.phase = 'Observing result'; this.written = false; this.settled = [];
    this.message = 'One attempt consumed. Observing feedback; no retry or automatic return.';
    let writer: WritableStreamDefaultWriter<Uint8Array> | undefined;
    try {
      if (!this.port?.writable) throw new Error('No writable stream.');
      writer = this.port.writable.getWriter();
      const activeWriter = writer;
      this.pending = activeWriter.write(encodeGoalPosition(1, 2068)).finally(() => activeWriter.releaseLock());
      void this.pending.then(() => {
        if (this.phase !== 'Observing result') return;
        if (this.now() - this.startedAt >= 2000) { this.fault('Write/observation deadline exceeded; delivery may have occurred.'); return; }
        this.written = true; this.checkSettled(); this.changed();
      }, () => this.fault('Write failed; delivery may have occurred. No retry.'));
    } catch { writer?.releaseLock(); this.fault('Write could not complete; approval remains consumed.'); }
    this.changed();
  }

  private receive(bytes: Uint8Array) {
    for (const frame of this.parser.push(bytes)) {
      if (!this.connected) break;
      if (frame.deviceId !== 255 || frame.command !== 11 || frame.payload.length !== 24) continue;
      const positions = decodePositions(frame);
      if (!positions) { this.fault('Weak or invalid expected telemetry. Test ended without further commands.'); break; }
      const at = this.now();
      if (this.receivedAt !== -Infinity && at - this.receivedAt > 500) { this.fault('Telemetry gap exceeded 500 ms.'); break; }
      this.positions = positions; this.receivedAt = at; this.evidence.observe(positions, at);
      if (this.phase === 'Enabled' && this.preflight()) { this.fault('Starting conditions changed after enabling.'); break; }
      if (this.phase === 'Observing result') {
        if (at - this.startedAt >= 2000) { this.fault('Observation deadline exceeded. No correction or retry.'); break; }
        if (positions.slice(1).some((value, index) => Math.abs(value - this.before![index + 1]!) > 12) || positions[0]! < 2036 || positions[0]! > 2080) {
          this.fault('Unexpected reported joint deviation. Use the reviewed physical cutoff procedure if needed.'); break;
        }
        if (Math.abs(positions[0]! - 2068) <= 12 && positions[0]! - this.before![0]! >= 8) {
          this.settled.push({ at, value: positions[0]! }); this.settled = this.settled.slice(-100);
          if (Math.max(...this.settled.map(s => s.value)) - Math.min(...this.settled.map(s => s.value)) > 3) this.settled = [{ at, value: positions[0]! }];
          this.checkSettled();
        } else this.settled = [];
      }
    }
    this.changed();
  }

  private checkSettled() {
    if (this.written && this.settled.length >= 3 && this.settled.at(-1)!.at - this.settled[0]!.at >= 200) {
      this.phase = 'Complete'; this.message = 'Feedback candidate recorded. Confirm the physical joint and direction yourself. No return movement is authorized.';
    }
  }

  tick(): void {
    if (!this.connected) return;
    if (!this.visible()) { this.stop(); return; }
    if (this.phase === 'Observing result' && this.now() - this.startedAt >= 2000) this.fault('Observation/write deadline exceeded. Delivery may have occurred; no retry.');
    else if (this.receivedAt !== -Infinity && this.now() - this.receivedAt > 500 && !['Complete', 'Fault', 'Stopped'].includes(this.phase)) this.fault('Telemetry is stale.');
    else if (this.receivedAt === -Infinity && this.now() - this.connectedAt > 2000) this.fault('No expected telemetry received.');
    this.changed();
  }

  private fault(message: string) { this.phase = 'Fault'; this.message = message; this.evidence.clear(); this.connection.disconnect(); this.changed(); }
  stop() { if (this.phase !== 'Complete' && this.phase !== 'Fault') { this.phase = 'Stopped'; this.message = 'Stopped/disarmed. A sent command cannot be recalled. No physical stop is guaranteed.'; } this.evidence.clear(); this.connection.disconnect(); this.changed(); }
  report() { return { format: 'nexarm-mapping-test-result', approval: 'reference-a-servo1-plus20', target: 2068, startingWindow: [START_MIN, START_MAX], attempted: this.attempt, written: this.written, phase: this.phase, message: this.message, before: this.before, latest: this.positions, physicalJoint: null, observedDirection: null, capturedAt: new Date().toISOString() }; }
}
