// The shop in backups and snapshots: an order never goes backwards or is deleted by a restore, stock
// comes back less what orders paid since took off, discounts come back.
import { beforeAll, describe, expect, it } from 'vitest';
import { siteDb } from '../src/lib/db/site';
import { bindings, setBindings } from '../src/lib/platform';
import { orderAhead, restore, snapshotPreview, takeSnapshot } from '../src/lib/sync';
import { memoryBucket } from './setup/memory-bucket';

beforeAll(() => setBindings({ ...bindings(), BUCKET: memoryBucket() }));
const db = siteDb();

describe('orderAhead', () => {
  const o = { status: 'paid', refunded_amount: 0, fulfilled: '', stock_taken: true, updated_at: '2026-11-01T00:00:00.000Z' };
  it('says when the order there is further along', () => {
    expect(orderAhead({ ...o, status: 'refunded' }, o)).toMatch(/refunded/);
    expect(orderAhead({ ...o, refunded_amount: 100 }, o)).toMatch(/refunded/);
    expect(orderAhead({ ...o, fulfilled: 'shipped' }, o)).toMatch(/shipped/);
    expect(orderAhead({ ...o, updated_at: '2026-11-02T00:00:00.000Z' }, o)).toMatch(/changed/);
    expect(orderAhead(o, { ...o, status: 'pending' } as any)).toMatch(/paid/);
    expect(orderAhead({ ...o, status: 'pending', stock_taken: false }, o)).toBeNull();
    expect(orderAhead(o, o)).toBeNull();
  });
});

describe('restoring a snapshot', () => {
  it('keeps orders as they are now or made since, and puts stock back less what sold since', async () => {
    const product = (await db.from('entries').insert({ type: 'product', slug: 'sync-mug', title: 'Mug', status: 'publish', fields: { shop: { price: 1000, trackStock: true } } }).select('id').single()).data!.id as number;
    await db.from('shop_stock').insert({ product_id: product, variant: 'default', on_hand: 10 });
    const discount = (await db.from('shop_discounts').insert({ code: 'BACK', kind: 'percent', value: 10 }).select('id').single()).data!.id as number;
    const line = (quantity: number) => [{ product, variant: 'default', title: 'Mug', label: '', sku: '', unit: 1000, quantity, total: 1000 * quantity, discount: 0, tax: 0, track: true, restocked: 0 }];
    const base = { status: 'paid', provider: 'stripe', name: 'A', email: 'a@example.org', subtotal: 1000, total: 1000, currency: 'USD', stock_taken: true };
    await db.from('shop_orders').insert({ ...base, token: 'sync-a', code: 'SYNC-A', lines: line(1), quantity: 1, paid_at: new Date(Date.now() - 3600_000).toISOString() });
    const snap = await takeSnapshot(db, 'manual');

    // Since the snapshot: A is refunded, B is paid (taking 3 off), the count is set to 7, the discount goes.
    await new Promise((r) => setTimeout(r, 5));
    await db.from('shop_orders').update({ status: 'refunded', refunded_amount: 1000 }).eq('token', 'sync-a');
    await db.from('shop_orders').insert({ ...base, token: 'sync-b', code: 'SYNC-B', lines: line(3), quantity: 3, paid_at: new Date().toISOString() });
    await db.from('shop_stock').update({ on_hand: 7 }).eq('product_id', product);
    await db.from('shop_discounts').delete().eq('id', discount);

    const preview = await snapshotPreview('here', snap.path);
    expect(preview.tables.find((t) => t.table === 'shop_orders')).toMatchObject({ since: 0 });

    const r = await restore('here', snap.path, { deleteSince: true });
    expect(r.problems.join(' ')).toMatch(/Kept order SYNC-A/);
    const orders = (await db.from('shop_orders').select('token, status').in('token', ['sync-a', 'sync-b']).order('token')).data;
    expect(orders).toEqual([{ token: 'sync-a', status: 'refunded' }, { token: 'sync-b', status: 'paid' }]);
    expect((await db.from('shop_stock').select('on_hand').eq('product_id', product).single()).data!.on_hand).toBe(7);
    expect((await db.from('shop_discounts').select('code').eq('id', discount).maybeSingle()).data).toEqual({ code: 'BACK' });
  });

  it('puts back an order that went backwards since (cancelled by hand) only when it is not further along', async () => {
    await db.from('shop_orders').insert({ token: 'sync-c', code: 'SYNC-C', status: 'pending', provider: 'stripe', name: 'C', email: 'c@example.org', lines: [], quantity: 1, subtotal: 500, total: 500, currency: 'USD', expires_at: new Date(Date.now() + 3600_000).toISOString() });
    const snap = await takeSnapshot(db, 'manual');
    await new Promise((r) => setTimeout(r, 5));
    await db.from('shop_orders').update({ note: 'changed by hand' }).eq('token', 'sync-c');
    const r = await restore('here', snap.path);
    // Changed since the snapshot: kept as it is now.
    expect(r.problems.join(' ')).toMatch(/SYNC-C/);
    expect((await db.from('shop_orders').select('note').eq('token', 'sync-c').single()).data!.note).toBe('changed by hand');
  });
});
