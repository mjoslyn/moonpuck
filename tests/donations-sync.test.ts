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

// ---- between two copies ------------------------------------------------------------------------
import { copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inject } from 'vitest';
import { fileD1, type D1Database } from '../src/lib/db/d1';
import { SqliteExecutor } from '../src/lib/db/sqlite';
import { Db } from '../src/lib/db/query';
import { compareGroups, writeGroup } from '../src/lib/sync';

const otherFile = join(mkdtempSync(join(tmpdir(), 'moonpuck-other-')), 'd1.sqlite');
copyFileSync(inject('d1Template'), otherFile);
const otherD1: Promise<D1Database> = fileD1(otherFile);
class OtherCopy extends SqliteExecutor {
  db() {
    return otherD1;
  }
  as(ctx: ConstructorParameters<typeof SqliteExecutor>[0]) {
    return new OtherCopy(ctx);
  }
}
const other = new Db(new OtherCopy({ role: 'service' } as any));
const group = async (groups: string[], id: string) => (await compareGroups(db, other, groups)).find((g) => g.id === id)!;
const gift = (token: string, more: Record<string, unknown> = {}) => ({ token, code: token.toUpperCase(), provider: 'stripe', amount: 2500, total: 2500, currency: 'USD', name: 'P', email: 'p@example.org', status: 'paid', kind: 'once', note: '', paid_at: '2026-11-01T00:00:00.000Z', ...more });

describe('syncing donations to another copy', () => {
  it('brings a monthly gift’s donor with it, by token, and keeps the source’s time', async () => {
    const plan = (await db.from('donation_plans').insert({ token: 'plan-two-1', status: 'active', subscription: 'sub_two', amount: 2500, total: 2500, name: 'P', email: 'p@example.org', home: 'https://source.example' }).select('id').single()).data!.id as number;
    // The other copy has rows of its own first, so ids differ.
    await other.from('donation_plans').insert({ token: 'plan-there-0', status: 'active', amount: 100, total: 100, name: 'Q', email: 'q@example.org' });
    await db.from('donations').insert(gift('gift-two-1', { kind: 'monthly', plan_id: plan, invoice: 'in_two_1' }));

    // Donations without Monthly donors: a conflict already when comparing.
    expect((await group(['donations:gifts'], 'donations:gifts')).conflicts.find((c) => c.key === 'gift-two-1')?.reason).toContain('monthly donor');
    const both = ['donations:plans', 'donations:gifts'];
    expect((await group(both, 'donations:gifts')).added.map((i) => i.key)).toContain('gift-two-1');

    await writeGroup(db, other, both, 'donations:plans', ['plan-two-1']);
    expect((await writeGroup(db, other, both, 'donations:gifts', ['gift-two-1'])).written).toBe(1);
    const there = (await other.from('donation_plans').select('id, home, updated_at').eq('token', 'plan-two-1').single()).data!;
    const here = (await db.from('donations').select('updated_at').eq('token', 'gift-two-1').single()).data!;
    const copied = (await other.from('donations').select('plan_id, updated_at').eq('token', 'gift-two-1').single()).data!;
    expect(there.home).toBe('https://source.example');
    expect(copied).toEqual({ plan_id: there.id, updated_at: here.updated_at });
    expect((await group(both, 'donations:gifts')).same).toBeGreaterThanOrEqual(1);

    // Edited on the source since: a change. Edited on the other copy since: a conflict.
    await new Promise((r) => setTimeout(r, 5));
    await db.from('donations').update({ dedication: 'For Pat' }).eq('token', 'gift-two-1');
    expect((await group(both, 'donations:gifts')).changed.map((i) => i.key)).toContain('gift-two-1');
    await new Promise((r) => setTimeout(r, 5));
    await other.from('donations').update({ note: 'checked' }).eq('token', 'gift-two-1');
    expect((await group(both, 'donations:gifts')).conflicts.map((c) => c.reason)).toContain('it changed there since');
  });

  it('calls an invoice another gift there has a conflict, not an error', async () => {
    await other.from('donations').insert(gift('gift-there-2', { invoice: 'in_shared' }));
    await db.from('donations').insert(gift('gift-two-2', { invoice: 'in_shared' }));
    expect((await group(['donations:gifts'], 'donations:gifts')).conflicts).toContainEqual(expect.objectContaining({ key: 'gift-two-2', reason: 'its monthly payment is another gift there' }));
    expect((await writeGroup(db, other, ['donations:gifts'], 'donations:gifts', ['gift-two-2'])).skipped).toEqual([expect.objectContaining({ reason: 'its monthly payment is another gift there' })]);
  });
});

describe('undoing what a sync wrote', () => {
  it('puts back a row a sync overwrote (it carries the source’s earlier time), and keeps one edited since', async () => {
    await db.from('donations').insert([gift('gift-undo-1', { note: 'mine' }), gift('gift-undo-2', { note: 'mine' })]);
    const snap = await takeSnapshot(db, 'manual');
    await new Promise((r) => setTimeout(r, 5));
    // A sync's write: the source's row and its time, from before the backup.
    await db.from('donations').update({ note: 'from the other copy', updated_at: '2026-01-01T00:00:00.000Z' }).eq('token', 'gift-undo-1');
    // An edit here since the backup.
    await db.from('donations').update({ note: 'edited since' }).eq('token', 'gift-undo-2');
    const r = await restore('here', snap.path);
    const notes = (await db.from('donations').select('token, note').in('token', ['gift-undo-1', 'gift-undo-2']).order('token')).data;
    expect(notes).toEqual([{ token: 'gift-undo-1', note: 'mine' }, { token: 'gift-undo-2', note: 'edited since' }]);
    // The gift kept as it is isn't counted as restored.
    const held = (JSON.parse(await (await import('../src/lib/sync')).backupFile('here', snap.path).then((b) => b.text())).tables as Record<string, any[]>);
    const total = Object.values(held).reduce((n, t) => n + t.length, 0);
    expect(r.restored).toBeLessThan(total);
    expect(r.problems.join(' ')).toContain('Kept gift GIFT-UNDO-2 as it is');
  });
});
