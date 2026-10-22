export const REVIEW_HISTORY_KEY = 'nexarm.commissioning.retry-reviews.v1';
type Store = Pick<Storage, 'getItem' | 'setItem'>;
type Review = { id: string; scope: string; reviewedAt: string; positions: number[]; previousAttempt: string | null; previousResult: unknown };

// Reviews permit exactly one additional attempt in this connection. Original
// consumed markers are retained; no API removes them or sends serial commands.
export class CommissioningAttempts {
  private permit: { scope: string; id: string } | null = null;
  constructor(private readonly storage: Store) {}
  clearPermit() { this.permit = null; }
  reason(scope: string): string | null {
    try {
      return this.storage.getItem(scope) !== null && this.permit?.scope !== scope
        ? 'Previous attempt consumed and recorded. Use Teacher recovery to review and allow one more attempt.' : null;
    } catch { return 'Local attempt storage is unavailable. Sending is disabled.'; }
  }
  history(): Review[] {
    const raw = this.storage.getItem(REVIEW_HISTORY_KEY);
    if (raw === null) return [];
    if (raw.length > 2_000_000) throw new Error('Recovery history is too large; export for review.');
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value) || value.some(row => !row || typeof row.id !== 'string' || typeof row.scope !== 'string')) throw new Error('Recovery history is invalid. Export for review; do not clear consumed markers.');
    return value as Review[];
  }
  review(scope: string, positions: readonly number[], previousResult: unknown) {
    this.clearPermit();
    if (this.storage.getItem(scope) === null) throw new Error('No consumed attempt needs renewal for this operation.');
    const records = this.history();
    if (records.length >= 500) throw new Error('Recovery history is full; export for review.');
    const record = { id: crypto.randomUUID(), scope, reviewedAt: new Date().toISOString(), positions: [...positions], previousAttempt: this.storage.getItem(scope), previousResult };
    const value = JSON.stringify([...records, record]);
    if (value.length > 2_000_000) throw new Error('Recovery history is full; export for review.');
    this.storage.setItem(REVIEW_HISTORY_KEY, value);
    if (this.storage.getItem(REVIEW_HISTORY_KEY) !== value) throw new Error('Could not record teacher review. No retry permitted.');
    this.permit = { scope, id: record.id };
  }
  consume(scope: string, details: object): string {
    const reason = this.reason(scope); if (reason) throw new Error(reason);
    const used = this.storage.getItem(scope) !== null;
    const key = used ? `${scope}.retry.${this.permit!.id}` : scope;
    this.clearPermit(); // A failure or uncertain write never preserves a permit.
    if (this.storage.getItem(key) !== null) throw new Error('Attempt already consumed.');
    const marker = JSON.stringify({ ...details, scope, consumedAt: new Date().toISOString() });
    this.storage.setItem(key, marker);
    if (this.storage.getItem(key) !== marker) throw new Error('Attempt could not be durably recorded.');
    return key;
  }
}
