// Shop discounts: cleaning a saved one, which fits a cart and what it takes off, the server's checks (uses,
// once per email, members, categories under categories) and checkout with a code.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { siteDb } from '../src/lib/db/site';
import { PROVIDERS } from '../src/lib/payments';
import { applyDiscount, cleanDiscount, pickDiscount, type Discount } from '../src/lib/shop/discounts';
import { discountCandidates } from '../src/lib/shop/discount-lookup';
import { startShopCheckout, type ShopOrder } from '../src/lib/shop/orders';
import { quoteCart } from '../src/lib/shop/cart';
import { cartTotals } from '../src/lib/shop/totals';
import { checkoutSettings } from '../src/lib/shop/checkout-settings';

vi.mock('../src/lib/forms/mail', async (actual) => ({ ...(await actual<object>()), sendMail: async () => true }));

let made = 0;
const created: any[] = [];
Object.assign(PROVIDERS.stripe, {
  configured: () => true,
  create: async (req: any) => (created.push(req), { ref: `cs_${++made}`, url: `https://pay.example/cs_${made}` }),
  check: async () => ({ status: 'pending' }),
  close: async () => {},
});

const db = siteDb();
const SHOP = {
  enabled: true,
  provider: 'stripe',
  zones: [{ id: 'us', name: 'US', places: ['US'], rates: [{ id: 'std', name: 'Standard', price: 500 }] }],
  pickup: [{ id: 'store', name: 'The store', address: '1 Main St', fee: 0, place: 'US-NY' }],
  tax: { rate: 0 },
};
const ADDRESS = { line1: '2 Elm St', city: 'Buffalo', state: 'NY', zip: '14201', country: 'US' };
beforeEach(async () => {
  const { data } = await db.from('settings').select('value').eq('key', 'site').maybeSingle();
  await db.from('settings').upsert({ key: 'site', value: { ...((data?.value as object) ?? {}), shop: SHOP } });
  // Each test makes the discounts it needs.
  await db.from('shop_discounts').delete().gt('id', 0);
});

let n = 0;
const product = async (price: number, terms: number[] = []) => {
  const id = (await db.from('entries').insert({ type: 'product', slug: `d-${++n}`, title: `Thing ${n}`, status: 'publish', fields: { shop: { price } } }).select('id').single()).data!.id as number;
  if (terms.length) await db.from('entry_terms').insert(terms.map((term_id) => ({ entry_id: id, term_id })));
  return id;
};
const discount = async (raw: Record<string, unknown>) => {
  const row = cleanDiscount(raw);
  if (typeof row === 'string') throw new Error(row);
  return (await db.from('shop_discounts').insert(row).select('*').single()).data!.id as number;
};
const base: Discount = { id: 1, code: 'TEN', name: '', kind: 'percent', value: 10, applies: 'all', products: [], categories: [], min_subtotal: 0, starts_at: null, ends_at: null, max_uses: null, once_per_email: false, members_only: false, levels: [], active: true };
const lastOrder = async () => (await db.from('shop_orders').select('*').order('id', { ascending: false }).limit(1).single<ShopOrder>()).data!;

describe('cleanDiscount', () => {
  it('keeps known shapes and says what is missing', () => {
    expect(cleanDiscount({ code: ' summer 10! ', kind: 'percent', value: 150 })).toMatchObject({ code: 'SUMMER10', value: 100, applies: 'all' });
    expect(cleanDiscount({ automatic: true, code: 'X', kind: 'free_shipping', value: 5 })).toMatchObject({ code: null, value: 0 });
    expect(cleanDiscount({ kind: 'percent', value: 10 })).toBe('Give the discount a code, or make it automatic.');
    expect(cleanDiscount({ code: 'A', kind: 'amount', value: 0 })).toBe('Give the amount off.');
    expect(cleanDiscount({ code: 'A', value: 5, applies: 'products' })).toBe('Choose the products it applies to.');
    expect(cleanDiscount({ code: 'A', value: 5, starts_at: '2026-02-01', ends_at: '2026-01-01' })).toBe('It has to end after it starts.');
    expect(cleanDiscount({ code: 'A', value: 5, levels: ['gold'] })).toMatchObject({ members_only: false, levels: [] });
  });
});

describe('applyDiscount and pickDiscount', () => {
  const lines = [{ product: 1, total: 1000, terms: [7] }, { product: 2, total: 3000 }];
  it('takes a percent or an amount off the lines it applies to', () => {
    expect(applyDiscount(base, lines, 4000, 500)).toMatchObject({ amount: 400, lines: [true, true] });
    expect(applyDiscount({ ...base, applies: 'products', products: [2] }, lines, 4000, 500)).toMatchObject({ amount: 300, lines: [false, true] });
    expect(applyDiscount({ ...base, kind: 'amount', value: 5000, applies: 'categories', categories: [7] }, lines, 4000, 500)).toMatchObject({ amount: 1000 });
    expect(applyDiscount({ ...base, kind: 'free_shipping' }, lines, 4000, 500)).toMatchObject({ amount: 0, freeShipping: true, saving: 500 });
  });
  it('says why one does not fit', () => {
    expect(applyDiscount({ ...base, min_subtotal: 5000 }, lines, 4000, 0)).toEqual({ problem: expect.stringContaining('$50.00') });
    expect(applyDiscount({ ...base, applies: 'products', products: [9] }, lines, 4000, 0)).toEqual({ problem: expect.stringContaining('doesn’t apply') });
    expect(applyDiscount({ ...base, ends_at: '2020-01-01T00:00:00.000Z' }, lines, 4000, 0)).toEqual({ problem: expect.stringContaining('expired') });
  });
  it('takes the code when there is one, else the automatic one that saves the most', () => {
    const auto = [{ ...base, id: 2, code: null, value: 5 }, { ...base, id: 3, code: null, kind: 'free_shipping' as const }];
    expect(pickDiscount(auto, null, lines, 4000, 500).applied?.discount.id).toBe(3);
    expect(pickDiscount(auto, null, lines, 4000, 100).applied?.discount.id).toBe(2);
    expect(pickDiscount([base], 'ten', lines, 4000, 0).applied?.amount).toBe(400);
  });
});

describe('discountCandidates', () => {
  it('widens categories to the ones under them', async () => {
    const top = (await db.from('terms').insert({ taxonomy: 'product_category', slug: 'd-top', name: 'Top' }).select('id').single()).data!.id as number;
    const sub = (await db.from('terms').insert({ taxonomy: 'product_category', slug: 'd-sub', name: 'Sub', parent_id: top }).select('id').single()).data!.id as number;
    await discount({ code: 'CATS', value: 20, applies: 'categories', categories: [top] });
    expect((await discountCandidates(db, { code: 'cats' })).discounts[0].categories.sort()).toEqual([top, sub].sort());
    // And a product in the sub-category gets it.
    const p = await product(1000, [sub]);
    const quote = await quoteCart(db, [{ product: p, variant: 'default', quantity: 1 }], { published: true }, { shop: SHOP });
    const found = await discountCandidates(db, { code: 'CATS' });
    const t = await cartTotals(quote, checkoutSettings(SHOP), { destination: null, option: 'pickup:store', ...found, codeProblem: found.problem });
    expect(t.discount).toMatchObject({ code: 'CATS', amount: 200 });
  });
  it('checks members, uses and once per email', async () => {
    await discount({ code: 'GOLD', value: 10, members_only: true, levels: ['gold'] });
    const gold = { user_id: 'u', email: 'm@example.org', name: 'M', level: 'gold', status: 'active' as const, expires_on: null };
    expect((await discountCandidates(db, { code: 'GOLD' })).problem).toMatch(/members only/);
    expect((await discountCandidates(db, { code: 'GOLD', member: { ...gold, level: 'silver' } })).problem).toMatch(/members only/);
    expect((await discountCandidates(db, { code: 'GOLD', member: gold })).problem).toBeUndefined();
    expect((await discountCandidates(db, { code: 'NOPE' })).problem).toBe('This code isn’t valid.');

    const once = await discount({ code: 'ONCE', value: 10, once_per_email: true, max_uses: 2 });
    const order = { token: 't', code: 'C', status: 'paid', provider: 'free', name: 'A', email: 'ada@example.org', lines: [], quantity: 1, subtotal: 0, total: 0, currency: 'USD', discount_id: once, discount_code: 'ONCE' };
    await db.from('shop_orders').insert({ ...order, token: 'once-1', code: 'O1' });
    expect((await discountCandidates(db, { code: 'ONCE', email: 'ADA@example.org' })).problem).toBe('You’ve already used this code.');
    expect((await discountCandidates(db, { code: 'ONCE', email: 'bo@example.org' })).problem).toBeUndefined();
    await db.from('shop_orders').insert({ ...order, token: 'once-2', code: 'O2', email: 'cy@example.org' });
    expect((await discountCandidates(db, { code: 'ONCE', email: 'bo@example.org' })).problem).toBe('This code has been used up.');
  });
  it('lists only automatic discounts that are on and running', async () => {
    await discount({ automatic: true, value: 5 });
    await discount({ automatic: true, value: 5, active: false });
    await discount({ automatic: true, value: 5, starts_at: '2099-01-01' });
    await discount({ code: 'CODED', value: 5 });
    expect((await discountCandidates(db, {})).discounts).toHaveLength(1);
  });
});

describe('checkout with a discount', () => {
  it('records the code and sends the lines to the provider less their share', async () => {
    const a = await product(1000);
    const b = await product(3000);
    await discount({ code: 'HALF', value: 50, applies: 'products', products: [b] });
    const r = await startShopCheckout({ lines: [{ product: a, variant: 'default', quantity: 1 }, { product: b, variant: 'default', quantity: 2 }], name: 'Ada', email: 'ada@example.org', option: 'manual:us:std', address: ADDRESS, code: 'half' }, 'http://localhost');
    expect(r).toEqual({ redirect: expect.stringMatching(/^https:\/\/pay\.example\//) });
    const o = await lastOrder();
    expect(o).toMatchObject({ subtotal: 7000, discount: 3000, shipping_total: 500, total: 4500, discount_code: 'HALF' });
    expect(o.lines.map((l) => l.discount)).toEqual([0, 3000]);
    expect(created.at(-1).items.map((i: any) => [i.unit, i.quantity])).toEqual([[1000, 1], [3000, 1], [500, 1]]);
  });
  it('refuses a code that does not fit, and one used up between the quote and the order', async () => {
    const a = await product(1000);
    await discount({ code: 'BIG', value: 10, min_subtotal: 5000 });
    const body = { lines: [{ product: a, variant: 'default', quantity: 1 }], name: 'Ada', email: 'ada@example.org', option: 'pickup:store' };
    expect(await startShopCheckout({ ...body, code: 'BIG' }, 'http://localhost')).toMatchObject({ error: 'discount', message: expect.stringContaining('at least') });
    expect(await startShopCheckout({ ...body, code: 'WHAT' }, 'http://localhost')).toMatchObject({ error: 'discount', message: 'This code isn’t valid.' });

    // The statement that makes the order counts the uses again.
    const one = await discount({ code: 'ONE', value: 10, max_uses: 1 });
    const p_order = { token: 'race-1', code: 'R1', status: 'pending', provider: 'stripe', name: 'A', email: 'a@example.org', lines: [{ product: 1, variant: 'default', quantity: 1, track: false }], subtotal: 1000, total: 900, currency: 'USD', discount_id: one, discount_code: 'ONE', expires_at: new Date(Date.now() + 60_000).toISOString() };
    const first = await db.rpc('shop_order_create', { p_order, p_limits: { discount: { id: one, max: 1, once: false } } });
    expect(first.data).toMatchObject({ ok: true });
    const second = await db.rpc('shop_order_create', { p_order: { ...p_order, token: 'race-2', code: 'R2', email: 'b@example.org' }, p_limits: { discount: { id: one, max: 1, once: false } } });
    expect(second.data).toMatchObject({ ok: false, discount: true });
  });
  it('takes the automatic discount that fits without a code', async () => {
    const a = await product(2000);
    await discount({ automatic: true, kind: 'free_shipping' });
    await startShopCheckout({ lines: [{ product: a, variant: 'default', quantity: 1 }], name: 'Ada', email: 'ada@example.org', option: 'manual:us:std', address: ADDRESS }, 'http://localhost');
    expect(await lastOrder()).toMatchObject({ subtotal: 2000, shipping_total: 0, total: 2000, discount_code: '', discount: 500 });
  });
});
