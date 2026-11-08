// Shop > Stock and low-stock alerts: rows with on hand, held and left against the mark; a sale that takes
// a variant to its mark emails the shop once; raising the count re-arms it.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { siteDb } from '../src/lib/db/site';
import { PROVIDERS } from '../src/lib/payments';
import { alertLowStock, stockRows } from '../src/lib/shop/low-stock';
import { markShopPaid, startShopCheckout, type ShopOrder } from '../src/lib/shop/orders';
import { checkoutSettings } from '../src/lib/shop/checkout-settings';

const sent: { to: string[]; subject: string; html: string }[] = [];
vi.mock('../src/lib/forms/mail', async (actual) => ({ ...(await actual<object>()), sendMail: async (m: any) => (sent.push(m), true) }));
let made = 0;
Object.assign(PROVIDERS.stripe, { configured: () => true, create: async () => ({ ref: `cs_s${++made}`, url: 'https://pay.example/x' }), check: async () => ({ status: 'pending' }), close: async () => {} });

const db = siteDb();
const setShop = async (shop: Record<string, unknown>) => {
  const { data } = await db.from('settings').select('value').eq('key', 'site').maybeSingle();
  await db.from('settings').upsert({ key: 'site', value: { ...((data?.value as object) ?? {}), shop: { enabled: true, provider: 'stripe', pickup: [{ id: 'store', name: 'Store', address: '1 Main St' }], ...shop } } });
};
let n = 0;
const product = async (stock: number, shop: Record<string, unknown> = {}) => {
  const id = (await db.from('entries').insert({ type: 'product', slug: `stk-${++n}`, title: `Pot ${n}`, status: 'publish', fields: { shop: { price: 1000, trackStock: true, sku: `POT-${n}`, ...shop } } }).select('id').single()).data!.id as number;
  await db.from('shop_stock').insert({ product_id: id, variant: 'default', on_hand: stock });
  return id;
};
const buy = async (p: number, quantity: number) => {
  await startShopCheckout({ lines: [{ product: p, variant: 'default', quantity }], name: 'Ada', email: 'ada@example.org', option: 'pickup:store' }, 'http://localhost');
  const o = (await db.from('shop_orders').select('*').order('id', { ascending: false }).limit(1).single<ShopOrder>()).data!;
  return o;
};

beforeEach(async () => {
  await setShop({});
  sent.length = 0;
});

describe('stock rows', () => {
  it('show on hand, held and left against the mark', async () => {
    const p = await product(5, { lowStock: 4 });
    await buy(p, 2);
    const [r] = await stockRows(db, { products: [p] });
    expect(r).toMatchObject({ onHand: 5, held: 2, left: 3, mark: 4, state: 'low', sku: `POT-${n}` });
    const q = await product(0);
    expect((await stockRows(db, { products: [q] }))[0]).toMatchObject({ left: 0, mark: 3, state: 'out' });
  });
  it('take the shop’s mark, 0 for never', () => {
    expect(checkoutSettings({}).lowStock).toBe(3);
    expect(checkoutSettings({ lowStock: 0 }).lowStock).toBe(0);
    expect(checkoutSettings({ lowStock: '7' }).lowStock).toBe(7);
  });
});

describe('alerts', () => {
  it('email the shop once when a sale takes a variant to its mark, again once the count is raised', async () => {
    const p = await product(5);
    const o = await buy(p, 2);
    await markShopPaid(db, o, { paymentId: 'pi' }, 'http://localhost');
    expect(sent.filter((m) => m.subject.startsWith('Low stock'))).toEqual([expect.objectContaining({ to: ['info@example.org'], subject: `Low stock: Pot ${n}` })]);
    expect(sent.find((m) => m.subject.startsWith('Low stock'))!.html).toContain('3 left');

    sent.length = 0;
    await markShopPaid(db, await buy(p, 1), { paymentId: 'pi2' }, 'http://localhost');
    expect(sent.filter((m) => m.subject.startsWith('Low stock'))).toEqual([]);

    // A restock re-arms it.
    await db.from('shop_stock').update({ on_hand: 10 }).eq('product_id', p);
    expect((await db.from('shop_stock').select('low_alerted_at').eq('product_id', p).single()).data!.low_alerted_at).toBeNull();
    await db.from('shop_stock').update({ on_hand: 1 }).eq('product_id', p);
    expect((await alertLowStock(db, [p], 'http://localhost')).map((r) => r.left)).toEqual([1]);
  });
  it('send nothing when off', async () => {
    await setShop({ lowStockAlerts: false });
    const p = await product(1);
    expect(await alertLowStock(db, [p], 'http://localhost')).toEqual([]);
    expect(sent).toEqual([]);
  });
});
