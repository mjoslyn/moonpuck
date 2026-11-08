// A refund's claim on its row (gifts, shop orders and ticket orders share it): one of two refunds started
// at once goes ahead; a retry of the same refund reuses its key; another refund waits for an unanswered one.
import { describe, expect, it } from 'vitest';
import { siteDb } from '../src/lib/db/site';
import { claimRefund, REFUND_HOLD_MS } from '../src/lib/payments/claim';

const db = siteDb();
const row = async (token: string) => (await db.from('donations').select('*').eq('token', token).single()).data!;

describe('claimRefund', () => {
  it('lets one of two refunds read at the same moment go ahead', async () => {
    await db.from('donations').insert({ token: 'claim-1-xxxxxxxxxxxxxxxxxxxxxxx', code: 'CLAIM-001', status: 'paid', kind: 'once', provider: 'stripe', amount: 5000, total: 5000, currency: 'USD', name: 'A', email: 'a@example.org' });
    const seen = await row('claim-1-xxxxxxxxxxxxxxxxxxxxxxx');
    let n = 0;
    const key = () => `k${++n}`;
    expect(await claimRefund(db, 'donations', seen, 1000, key)).toBe('k1');
    // The second, from the same read: the row changed meanwhile.
    await expect(claimRefund(db, 'donations', seen, 2000, key)).rejects.toThrow(/changed while/);
  });

  it('reuses a refund’s key for its retry, holds others while it is unanswered, then lets them go', async () => {
    await db.from('donations').insert({ token: 'claim-2-xxxxxxxxxxxxxxxxxxxxxxx', code: 'CLAIM-002', status: 'paid', kind: 'once', provider: 'stripe', amount: 5000, total: 5000, currency: 'USD', name: 'A', email: 'a@example.org' });
    const now = new Date();
    expect(await claimRefund(db, 'donations', await row('claim-2-xxxxxxxxxxxxxxxxxxxxxxx'), 1000, () => 'first', now)).toBe('first');
    // No answer came: the same refund again reuses its key, so the provider makes it once.
    expect(await claimRefund(db, 'donations', await row('claim-2-xxxxxxxxxxxxxxxxxxxxxxx'), 1000, () => 'other', now)).toBe('first');
    await expect(claimRefund(db, 'donations', await row('claim-2-xxxxxxxxxxxxxxxxxxxxxxx'), 3000, () => 'other', now)).rejects.toThrow(/under way/);
    expect(await claimRefund(db, 'donations', await row('claim-2-xxxxxxxxxxxxxxxxxxxxxxx'), 3000, () => 'later', new Date(now.getTime() + REFUND_HOLD_MS + 1000))).toBe('later');
  });
});
