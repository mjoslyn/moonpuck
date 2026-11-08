// Shop > Stats: sales by the day orders were paid (in the site's time zone), refunds, products, discounts,
// unpaid checkouts, other currencies, and reading the orders for a range.
import { describe, expect, it } from 'vitest';
import { siteDb } from '../src/lib/db/site';
import { shopStats, summarizeOrders } from '../src/lib/shop/stats';

const line = (product: number, title: string, quantity: number, total: number, discount = 0) => ({ product, variant: 'default', title, label: '', sku: '', unit: total / quantity, quantity, total, discount, tax: 0, track: false, restocked: 0 });
const order = (o: Record<string, unknown>) => ({
  id: 1, status: 'paid', email: 'a@example.org', lines: [line(1, 'Mug', 2, 2000)], subtotal: 2000, discount: 0, discount_code: '', shipping_total: 500, tax: 100, total: 2600,
  refunded_amount: 0, currency: 'USD', fulfilment: 'ship', paid_at: '2026-11-03T15:00:00.000Z', created_at: '2026-11-03T14:50:00.000Z', ...o,
}) as any;
const range = { from: '2026-11-01', to: '2026-11-07' };

describe('summarizeOrders', () => {
  it('adds up paid and refunded orders by the day they were paid', () => {
    const s = summarizeOrders(
      [
        order({ id: 1 }),
        order({ id: 2, email: 'A@example.org', status: 'refunded', refunded_amount: 2600, fulfilment: 'pickup', shipping_total: 0, total: 2100, paid_at: '2026-11-05T12:00:00.000Z' }),
        order({ id: 3, email: 'b@example.org', lines: [line(1, 'Mug', 1, 1000, 100), line(2, 'Towel', 3, 3000, 300)], discount: 400, discount_code: 'TEN', total: 3600 }),
        order({ id: 4, status: 'expired', paid_at: null }),
        order({ id: 5, status: 'cancelled', paid_at: null, created_at: '2026-10-20T10:00:00.000Z' }),
        order({ id: 6, currency: 'CAD' }),
        // Outside the range.
        order({ id: 7, paid_at: '2026-11-08T15:00:00.000Z' }),
      ],
      range,
      'USD',
      'America/New_York',
    );
    expect(s.totals).toEqual({ orders: 3, sales: 8300, refunds: 2600, net: 5700, items: 8, average: 2767, discounts: 400, shipping: 1000, tax: 300, buyers: 2, repeat: 1, unpaid: 1 });
    expect(s.daily).toHaveLength(7);
    expect(s.daily.find((d) => d.day === '2026-11-03')).toEqual({ day: '2026-11-03', orders: 2, sales: 6200 });
    expect(s.products).toEqual([
      { product: 1, title: 'Mug', quantity: 5, sales: 4900 },
      { product: 2, title: 'Towel', quantity: 3, sales: 2700 },
    ]);
    expect(s.discounts).toEqual([{ code: 'TEN', orders: 1, amount: 400 }]);
    expect(s.fulfilment).toEqual({ ship: 2, pickup: 1, none: 0 });
    expect(s.otherCurrency).toBe(1);
  });
  it('counts an order on its day in the site’s time zone', () => {
    // 02:00 UTC on Nov 8 is still Nov 7 in New York.
    const s = summarizeOrders([order({ paid_at: '2026-11-08T02:00:00.000Z' })], range, 'USD', 'America/New_York');
    expect(s.totals.orders).toBe(1);
    expect(s.daily.at(-1)).toMatchObject({ day: '2026-11-07', orders: 1 });
  });
});

describe('shopStats', () => {
  it('reads the range’s orders', async () => {
    const db = siteDb();
    const base = { status: 'paid', provider: 'free', name: 'A', email: 'a@example.org', lines: [line(1, 'Mug', 1, 1000)], quantity: 1, subtotal: 1000, total: 1000, currency: 'USD' };
    for (const row of [
      { ...base, token: 'st-1', code: 'ST1', paid_at: '2026-11-02T15:00:00.000Z' },
      { ...base, token: 'st-2', code: 'ST2', paid_at: '2026-10-01T15:00:00.000Z' },
      { ...base, token: 'st-3', code: 'ST3', status: 'expired', provider: 'stripe', created_at: '2026-11-04T15:00:00.000Z' },
    ])
      expect((await db.from('shop_orders').insert(row)).error).toBeNull();
    const s = await shopStats(db, range, 'USD', 'UTC');
    expect(s.totals).toMatchObject({ orders: 1, sales: 1000, unpaid: 1 });
    expect(s.cut).toBe(false);
  });
});
