export const MANUAL_STATE_KEY = 'nexarm.commissioning.manual-positioning.v1';
type Phase = 'Normal' | 'Release enabled' | 'Release pending' | 'Manual setup' |
  'Restore pending' | 'Confirm holding' | 'Recovery required';
type Event = { action: string; at: string; positions: readonly number[] };

// A durable interlock, not a measurement of torque state. Explicit physical
// confirmation plus fresh feedback is required to finish manual setup.
export class ManualPositioning {
  phase: Phase = 'Normal';
  message = 'Manual setup inactive. No holding command is sent automatically.';
  pendingSince = -Infinity;
  private events: Event[] = [];
  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'>) {
    try {
      const raw = storage.getItem(MANUAL_STATE_KEY);
      if (raw !== null) {
        if (raw.length > 200_000) throw new Error('Invalid manual setup record');
        const value: unknown = JSON.parse(raw);
        if (!value || typeof value !== 'object' || !('requiresHoldingVerification' in value) || typeof value.requiresHoldingVerification !== 'boolean') throw new Error('Invalid manual setup record');
        if (!('events' in value) || !Array.isArray(value.events) || value.events.length > 50 || value.events.some(event =>
          !event || typeof event.action !== 'string' || typeof event.at !== 'string' || !Array.isArray(event.positions) ||
          ![0,6].includes(event.positions.length) || event.positions.some((n:unknown)=>typeof n!=='number'||!Number.isInteger(n)||n<0||n>4095))) throw new Error('Invalid manual setup history');
        this.events = value.events;
        if (value.requiresHoldingVerification) throw new Error('Unfinished manual setup');
      }
    } catch { this.phase = 'Recovery required'; this.message = 'Holding state needs review after reload or unavailable/invalid storage. Reconnect; restore or verify factory holding before movement.'; }
  }
  get blocked() { return this.phase !== 'Normal'; }
  get pending() { return this.phase === 'Release pending' || this.phase === 'Restore pending'; }
  private record(action: string, positions: readonly number[], required = true) {
    const next = [...this.events, { action, at: new Date().toISOString(), positions: [...positions] }].slice(-50);
    const value = JSON.stringify({ requiresHoldingVerification: required, phase: this.phase, events: next });
    this.storage.setItem(MANUAL_STATE_KEY, value);
    if (this.storage.getItem(MANUAL_STATE_KEY) !== value) throw new Error('Manual setup state could not be durably recorded.');
    this.events = next;
  }
  enable() {
    if (this.phase !== 'Normal') throw new Error('Resolve the existing manual setup first.');
    this.phase = 'Release enabled'; this.message = 'Release enabled. Support the arm before the separate Release action; it can fall when holding is removed.';
  }
  begin(action: 'release' | 'restore', at: number, positions: readonly number[]) {
    // All Off is an explicit idempotent retry when a prior write was sent but
    // physical release was not observed. Never silently restore holding to retry.
    if (action === 'release' ? !['Release enabled','Manual setup'].includes(this.phase) : !['Manual setup','Recovery required'].includes(this.phase)) throw new Error('Manual setup action is not available.');
    this.phase = action === 'release' ? 'Release pending' : 'Restore pending';
    this.pendingSince = at;
    this.message = `${action === 'release' ? 'Release' : 'Restore'} requested. Physical holding state is unverified.`;
    try { this.record(`${action} requested`, positions); }
    catch (error) { this.phase = 'Recovery required'; this.message = 'Manual setup storage failed. No new command may be sent.'; throw error; }
  }
  sent(action: 'release' | 'restore', positions: readonly number[]) {
    // Stop/disconnect/fault makes a late completion inert.
    if (this.phase !== (action === 'release' ? 'Release pending' : 'Restore pending')) return;
    this.record(`${action} write completed; physical effect unverified`, positions);
    this.phase = action === 'release' ? 'Manual setup' : 'Confirm holding';
    this.message = action === 'release'
      ? 'Release command sent. Keep the arm supported. Verify release before gently positioning; never force resistance. Movement tests remain disabled.'
      : 'Restore command sent. Keep supporting the arm; verify it holds the placed pose. Wait for fresh stable readings, then confirm holding separately.';
  }
  confirm(positions: readonly number[]) {
    if (!['Confirm holding','Recovery required'].includes(this.phase)) throw new Error('Restore holding before confirming.');
    this.record('Operator physically confirmed holding restored', positions, false);
    this.phase = 'Normal'; this.message = 'Holding confirmed. Fresh evidence and separate movement clearance/Enable are still required.';
  }
  finishRestoreFromFeedback(positions:readonly number[]){
    if(this.phase!=='Confirm holding')throw Error('Send Restore holding before completing restore.');
    this.record('Restore write completed and fresh position feedback stabilized; physical torque is not measured',positions,false);
    this.phase='Normal';this.message='Restore completed; position feedback is stable. Physical holding is not measured.';
  }
  interrupt(reason: string, positions: readonly number[]) {
    if (this.phase === 'Normal') return;
    if (this.phase === 'Release enabled') { this.phase = 'Normal'; this.message = 'Unsent release canceled. No holding command sent.'; return; }
    this.phase = 'Recovery required'; this.message = `${reason} No automatic holding command. Keep the arm supported; reconnect to restore/verify holding.`;
    try { this.record(reason, positions); } catch { /* Retain the earlier durable interlock; never clear it on failure. */ }
  }
  report() { return { phase: this.phase, message: this.message, physicalTorqueState: 'not measured', events: this.events.map(event => ({ ...event, positions: [...event.positions] })) }; }
}
