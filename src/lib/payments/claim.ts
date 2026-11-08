// A refund's claim on its row (a gift, a shop order, a ticket order), before the provider is asked: the
// idempotency key to send, kept on the row (`refund_attempt`) while the outcome is unknown. A retry of
// the same refund (same amount, from the same refunded total) reuses its key, so it is made once. Any
// other refund takes the row only if nobody changed it since it was read (its `updated_at`) and no other
// refund started in the last ten minutes is still unanswered, so two people refunding at once can't both
// refund. Server only.
import type { Db } from '../db/query';

export interface RefundAttempt {
  key: string;
  amount: number;
  from: number;
  at?: string;
}

/** How long an unanswered refund holds its row before another may start. */
export const REFUND_HOLD_MS = 10 * 60_000;

export async function claimRefund(
  db: Db,
  table: string,
  row: { id: number; updated_at?: string | null; refunded_amount: number | null; refund_attempt?: RefundAttempt | null },
  amount: number,
  newKey: () => string,
  now: Date = new Date(),
): Promise<string> {
  const last = row.refund_attempt;
  const from = row.refunded_amount ?? 0;
  const retry = !!last && last.amount === amount && last.from === from;
  if (last && !retry && last.at && now.getTime() - Date.parse(last.at) < REFUND_HOLD_MS) throw new Error('Another refund of this is under way. Reload in a few minutes and try again.');
  const key = retry ? last!.key : newKey();
  let q = db.from(table).update({ refund_attempt: { key, amount, from, at: now.toISOString() } }).eq('id', row.id);
  if (row.updated_at) q = q.eq('updated_at', row.updated_at);
  const { data, error } = await q.select('id');
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error('This changed while you were looking at it (another refund?). Reload and try again.');
  return key;
}
