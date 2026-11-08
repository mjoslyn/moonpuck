// Donations in backups and snapshots: a gift or monthly gift never goes backwards or is deleted by a
// restore, and a gift keeps its monthly gift.
import { beforeAll, describe, expect, it } from 'vitest';
import { siteDb } from '../src/lib/db/site';
import { bindings, setBindings } from '../src/lib/platform';
import { donationAhead, restore, snapshotPreview, syncGroups, takeSnapshot } from '../src/lib/sync';
import { memoryBucket } from './setup/memory-bucket';

beforeAll(() => setBindings({ ...bindings(), BUCKET: memoryBucket() }));
const db = siteDb();

describe('donationAhead', () => {
  const gift = { status: 'paid', refunded_amount: 0, updated_at: '2026-11-01T00:00:00.000Z' };
  it('says when the gift or monthly gift there is further along', () => {
    expect(donationAhead({ ...gift, status: 'refunded' }, gift)).toMatch(/refunded/);
    expect(donationAhead({ ...gift, refunded_amount: 100 }, gift)).toMatch(/refunded/);
    expect(donationAhead({ ...gift, updated_at: '2026-11-02T00:00:00.000Z' }, gift)).toMatch(/changed/);
    expect(donationAhead(gift, gift)).toBeNull();
    const plan = { status: 'active', updated_at: gift.updated_at };
    expect(donationAhead({ ...plan, status: 'cancelled' }, plan, true)).toMatch(/cancelled/);
    expect(donationAhead({ ...plan, status: 'past_due' }, plan, true)).toBeNull();
  });
  it('syncs monthly donors before their gifts', () => {
    const ids = syncGroups().map((g) => g.id);
    expect(ids.indexOf('donations:plans')).toBeLessThan(ids.indexOf('donations:gifts'));
  });
});

describe('restoring a snapshot', () => {
  it('holds donations and monthly donors, keeps what moved on since, and deletes none', async () => {
    const plan = (await db.from('donation_plans').insert({ token: 'plan-sync-1', status: 'active', subscription: 'sub_1', amount: 2500, total: 2500, name: 'P', email: 'p@example.org' }).select('id').single()).data!.id as number;
    const base = { provider: 'stripe', amount: 2500, total: 2500, currency: 'USD', name: 'P', email: 'p@example.org', status: 'paid', note: '', paid_at: new Date().toISOString() };
    const made = await db.from('donations').insert([
      { ...base, token: 'gift-sync-1', code: 'GIFT-0001', kind: 'monthly', plan_id: plan },
      { ...base, token: 'gift-sync-2', code: 'GIFT-0002', kind: 'once', note: 'as it was' },
    ]);
    expect(made.error).toBeNull();
    const snap = await takeSnapshot(db, 'manual');
    const preview = await snapshotPreview('here', snap.path);
    expect(preview.tables.find((t) => t.table === 'donations')).toMatchObject({ restore: 2, since: 0 });
    expect(preview.tables.find((t) => t.table === 'donation_plans')).toMatchObject({ restore: 1, since: 0 });

    // Since: gift 1 refunded, the plan cancelled, gift 2's note changed and then the row lost, a new gift.
    await new Promise((r) => setTimeout(r, 5));
    await db.from('donations').update({ status: 'refunded', refunded_amount: 2500 }).eq('token', 'gift-sync-1');
    await db.from('donation_plans').update({ status: 'cancelled' }).eq('token', 'plan-sync-1');
    await db.from('donations').delete().eq('token', 'gift-sync-2');
    await db.from('donations').insert({ ...base, token: 'gift-sync-3', code: 'GIFT-0003', kind: 'once' });

    const r = await restore('here', snap.path, { deleteSince: true });
    expect(r.problems.join(' ')).toMatch(/GIFT-0001/);
    const gifts = (await db.from('donations').select('token, status, plan_id, note').in('token', ['gift-sync-1', 'gift-sync-2', 'gift-sync-3']).order('token')).data;
    expect(gifts).toEqual([
      { token: 'gift-sync-1', status: 'refunded', plan_id: plan, note: '' },
      { token: 'gift-sync-2', status: 'paid', plan_id: null, note: 'as it was' },
      { token: 'gift-sync-3', status: 'paid', plan_id: null, note: '' },
    ]);
    expect((await db.from('donation_plans').select('status').eq('token', 'plan-sync-1').single()).data!.status).toBe('cancelled');
  });
});
