// Shop orders: checkout against stock (holds, the last one, a buyer's share), payment taking the stock
// off once, the webhook, expiry, free orders and the order page.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { siteDb } from '../src/lib/db/site';
import { PROVIDERS } from '../src/lib/payments';
import { loadStock } from '../src/lib/shop/stock';
import { cancelShopOrder, expireShopHolds, fulfilOrder, markShopPaid, ordersCsvRows, ordersQuery, refundShopOrder, restockOrder, returnFromShopCheckout, shopWebhook, startShopCheckout, type ShopOrder } from '../src/lib/shop/orders';
import { renderRequest } from '../src/render/page';
import '../src/lib/shop/page-data';

const sent: { to: string[]; subject: string }[] = [];
vi.mock('../src/lib/forms/mail', async (actual) => ({ ...(await actual<object>()), sendMail: async (m: { to: string[]; subject: string }) => (sent.push(m), true) }));

// A stand-in for Stripe: checkouts made here, paid when the test says.
const paid = new Set<string>();
let made = 0;
const created: any[] = [];
const refunds: number[] = [];
Object.assign(PROVIDERS.stripe, {
  configured: () => true,
  create: async (req: any) => (created.push(req), { ref: `cs_${++made}`, url: `https://pay.example/cs_${made}` }),
  check: async ({ ref }: { ref: string }) => (paid.has(ref) ? { status: 'paid', paymentId: `pi_${ref}`, amount: 0 } : { status: 'pending' }),
  close: async () => {},
  refund: async (_payment: string, amount: number) => (refunds.push(amount), { id: `re_${refunds.length}`, status: 'succeeded' }),
});

const db = siteDb();
// The site's address (SITE_URL): where its orders are made, and so which ones this copy looks after.
vi.stubEnv('SITE_URL', 'http://localhost');
const setSite = async (value: Record<string, unknown>) => {
  const { data } = await db.from('settings').select('value').eq('key', 'site').maybeSingle();
  await db.from('settings').upsert({ key: 'site', value: { ...((data?.value as object) ?? {}), ...value } });
};
const product = async (slug: string, shop: Record<string, unknown>, stock?: number) => {
  const id = (await db.from('entries').insert({ type: 'product', slug, title: slug, status: 'publish', fields: { shop } }).select('id').single()).data!.id as number;
  if (stock != null) await db.from('shop_stock').insert({ product_id: id, variant: 'default', on_hand: stock });
  return id;
};
const order = async (id: number) => (await db.from('shop_orders').select('*').eq('id', id).single<ShopOrder>()).data!;
const byToken = async (redirect: string) => (await db.from('shop_orders').select('*').order('id', { ascending: false }).limit(1).single<ShopOrder>()).data!;
const buyer = (lines: unknown[], more: Record<string, unknown> = {}) => ({ lines, name: 'Ada', email: 'ada@example.org', ...more });

const SHOP = {
  enabled: true,
  provider: 'stripe',
  zones: [{ id: 'us', name: 'US', places: ['US'], rates: [{ id: 'std', name: 'Standard', price: 500 }] }],
  pickup: [{ id: 'store', name: 'The store', address: '1 Main St', fee: 0, place: 'US-NY' }],
  tax: { rate: 10 },
};
const ADDRESS = { line1: '2 Elm St', city: 'Buffalo', state: 'NY', zip: '14201', country: 'US' };

beforeEach(async () => {
  await setSite({ shop: SHOP });
  sent.length = 0;
});

describe('checkout', () => {
  it('holds stock until paid, then takes it off once, and emails the buyer and the shop', async () => {
    const mug = await product('hold-mug', { price: 1000, trackStock: true }, 3);
    const r = await startShopCheckout(buyer([{ product: mug, variant: 'default', quantity: 2 }], { option: 'manual:us:std', address: ADDRESS }), 'http://localhost');
    expect(r).toEqual({ redirect: expect.stringMatching(/^https:\/\/pay\.example\//) });
    const o = await byToken('');
    expect(o).toMatchObject({ status: 'pending', subtotal: 2000, shipping_total: 500, tax: 200, total: 2700, fulfilment: 'ship', stock_taken: false });
    expect(o.address).toMatchObject({ city: 'Buffalo', state: 'NY' });
    // Tax and shipping go to the provider as their own lines.
    expect(created.at(-1).items.map((i: any) => [i.name, i.unit, i.quantity])).toEqual([['hold-mug', 1000, 2], ['Shipping: Standard', 500, 1], ['Tax', 200, 1]]);
    // Held: one left for anyone else.
    expect((await loadStock(db, [mug])).get(mug)).toEqual({ default: 1 });

    paid.add(o.provider_ref!);
    await shopWebhook('stripe', { kind: 'checkout', ref: o.provider_ref! });
    await markShopPaid(db, o, { paymentId: 'again' });
    const after = await order(o.id);
    expect(after).toMatchObject({ status: 'paid', stock_taken: true, provider_payment: `pi_${o.provider_ref}` });
    expect((await db.from('shop_stock').select('on_hand').eq('product_id', mug).single()).data!.on_hand).toBe(1);
    expect((await loadStock(db, [mug])).get(mug)).toEqual({ default: 1 });
    // The receipt, the shop's copy, and (1 of 3 left) the low-stock email.
    expect(sent.map((m) => m.subject)).toEqual([expect.stringContaining(o.code), expect.stringContaining(o.code), 'Low stock: hold-mug']);
    expect(sent[0].to).toEqual(['ada@example.org']);
  });

  it('refuses the last one to a second buyer, and lets it go when the hold expires', async () => {
    const pin = await product('last-pin', { price: 800, trackStock: true }, 1);
    const one = await startShopCheckout(buyer([{ product: pin, variant: 'default', quantity: 1 }], { option: 'pickup:store' }), 'http://localhost');
    expect('redirect' in one).toBe(true);
    const two = await startShopCheckout(buyer([{ product: pin, variant: 'default', quantity: 1 }], { email: 'bo@example.org', option: 'pickup:store' }), 'http://localhost');
    // The cart is priced first: it shows as sold out, so the buyer is told it changed.
    expect(two).toMatchObject({ error: 'changed' });
    const held = await byToken('');
    await db.from('shop_orders').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq('id', held.id);
    await expireShopHolds(db);
    expect((await order(held.id)).status).toBe('expired');
    expect((await loadStock(db, [pin])).get(pin)).toEqual({ default: 1 });
  });

  it('checks the stock again in the statement that makes the order', async () => {
    const cap = await product('race-cap', { price: 900, trackStock: true }, 1);
    const { data } = await db.rpc('shop_order_create', {
      p_order: { token: 'x'.repeat(32), code: 'RACE-0001', status: 'pending', provider: 'stripe', name: 'A', email: 'a@b.c', lines: [{ product: cap, variant: 'default', quantity: 1, track: true }], subtotal: 900, total: 900, expires_at: new Date(Date.now() + 60_000).toISOString() },
      p_limits: {},
    });
    expect(data).toMatchObject({ ok: true });
    const { data: second } = await db.rpc('shop_order_create', {
      p_order: { token: 'y'.repeat(32), code: 'RACE-0002', status: 'pending', provider: 'stripe', name: 'B', email: 'b@b.c', lines: [{ product: cap, variant: 'default', quantity: 1, track: true }], subtotal: 900, total: 900, expires_at: new Date(Date.now() + 60_000).toISOString() },
      p_limits: {},
    });
    expect(second).toEqual({ ok: false, line: { product: cap, variant: 'default', left: 0 } });
  });

  it('asks for a shipping choice and an address, and limits one buyer\'s unpaid orders', async () => {
    const tee = await product('tee', { price: 2000 });
    const lines = [{ product: tee, variant: 'default', quantity: 1 }];
    expect(await startShopCheckout(buyer(lines), 'http://localhost')).toMatchObject({ error: 'shipping' });
    expect(await startShopCheckout(buyer(lines, { option: 'manual:us:std', address: { country: 'US', state: 'NY' } }), 'http://localhost')).toMatchObject({ error: 'address' });
    expect(await startShopCheckout(buyer(lines, { email: 'nope' }), 'http://localhost')).toMatchObject({ error: 'invalid' });
    for (let i = 0; i < 5; i++) expect('redirect' in (await startShopCheckout(buyer(lines, { email: 'many@example.org', option: 'pickup:store' }), 'http://localhost'))).toBe(true);
    expect(await startShopCheckout(buyer(lines, { email: 'many@example.org', option: 'pickup:store' }), 'http://localhost')).toMatchObject({ error: 'limit' });
  });

  it('places an order with nothing to pay at once, taxed at the pickup location', async () => {
    const gift = await product('free-gift', { price: 0, trackStock: true }, 2);
    await db.from('entries').update({ fields: { shop: { price: 0, trackStock: true } } }).eq('id', gift);
    const r = await startShopCheckout(buyer([{ product: gift, variant: 'default', quantity: 1 }], { option: 'pickup:store' }), 'http://localhost');
    expect(r).toEqual({ redirect: expect.stringMatching(/^\/cart\/\?order=/) });
    const o = await byToken('');
    expect(o).toMatchObject({ status: 'paid', provider: 'free', total: 0, fulfilment: 'pickup', stock_taken: true });
    expect((await db.from('shop_stock').select('on_hand').eq('product_id', gift).single()).data!.on_hand).toBe(1);
  });

  it('cancels on the way back from Cancel when unpaid, and shows a paid order on the cart page', async () => {
    const lamp = await product('order-lamp', { price: 3000 });
    await startShopCheckout(buyer([{ product: lamp, variant: 'default', quantity: 1 }], { option: 'pickup:store' }), 'http://localhost');
    const unpaid = await byToken('');
    expect(await returnFromShopCheckout(unpaid.token, true)).toBe('/cart/?checkout=cancelled');
    expect((await order(unpaid.id)).status).toBe('cancelled');

    await startShopCheckout(buyer([{ product: lamp, variant: 'default', quantity: 1 }], { option: 'pickup:store' }), 'http://localhost');
    const o = await byToken('');
    paid.add(o.provider_ref!);
    expect(await returnFromShopCheckout(o.token, false)).toBe(`/cart/?order=${o.token}`);
    expect((await order(o.id)).status).toBe('paid');
    // The tax is the pickup location's (New York state isn't set, so the store's 10%).
    expect((await order(o.id)).tax).toBe(300);

    const content = (items: unknown[]) => ({ root: { props: {} }, content: items });
    await db.from('templates').insert({ kind: 'template', slug: 'page', title: 'Page', content: content([{ type: 'entry-content', props: { id: 'pc', attrs: {} } }]) });
    const page = await renderRequest(new URL(`http://localhost/cart/?order=${o.token}`), db);
    expect(page.status).toBe(200);
    expect(page.html).toContain(`data-order="paid"`);
    expect(page.html).toContain(o.code);
    expect(page.html).toContain('Pick up at The store');
  });
});

describe('the Orders screen', () => {
  const paidOrder = async (slug: string, stock: number, quantity: number) => {
    const id = await product(slug, { price: 1000, trackStock: true }, stock);
    await startShopCheckout(buyer([{ product: id, variant: 'default', quantity }], { option: 'pickup:store' }), 'http://localhost');
    const o = await byToken('');
    paid.add(o.provider_ref!);
    await returnFromShopCheckout(o.token, false);
    return { product: id, order: await order(o.id) };
  };
  const onHand = async (product: number) => (await db.from('shop_stock').select('on_hand').eq('product_id', product).single()).data!.on_hand;

  it('refunds part, then the rest, putting lines back in stock once', async () => {
    const { product: p, order: o } = await paidOrder('refund-scarf', 5, 3);
    expect(await onHand(p)).toBe(2);
    expect(await refundShopOrder(db, o.id, 1000, { 0: 1 })).toEqual({ refunded: 1000, full: false, restocked: { 0: 1 } });
    expect(await onHand(p)).toBe(3);
    // More than is left to put back: nothing goes back.
    expect(await restockOrder(db, o.id, { 0: 3 })).toEqual({});
    const rest = o.total - 1000;
    expect(await refundShopOrder(db, o.id, rest, { 0: 2 })).toMatchObject({ full: true, restocked: { 0: 2 } });
    expect(await onHand(p)).toBe(5);
    expect(await order(o.id)).toMatchObject({ status: 'refunded', refunded_amount: o.total });
    expect(refunds.slice(-2)).toEqual([1000, rest]);
    await expect(refundShopOrder(db, o.id, 1, {})).rejects.toThrow(/at most/);
    // Fully refunded, it can be cancelled.
    await cancelShopOrder(db, o.id);
    expect((await order(o.id)).status).toBe('cancelled');
  });

  it('cancels an unpaid order, letting its hold go, and refuses to cancel a paid one', async () => {
    const p = await product('cancel-hat', { price: 1000, trackStock: true }, 1);
    await startShopCheckout(buyer([{ product: p, variant: 'default', quantity: 1 }], { option: 'pickup:store' }), 'http://localhost');
    const held = await byToken('');
    expect((await loadStock(db, [p])).get(p)).toEqual({ default: 0 });
    await cancelShopOrder(db, held.id);
    expect((await order(held.id)).status).toBe('cancelled');
    expect((await loadStock(db, [p])).get(p)).toEqual({ default: 1 });
    const { order: o } = await paidOrder('cancel-paid', 2, 1);
    await expect(cancelShopOrder(db, o.id)).rejects.toThrow(/Refund/);
  });

  it('marks an order shipped with its tracking and emails the buyer', async () => {
    const { order: o } = await paidOrder('ship-mug', 2, 1);
    sent.length = 0;
    await fulfilOrder(db, o.id, 'shipped', '1Z999');
    expect(await order(o.id)).toMatchObject({ fulfilled: 'shipped', tracking: '1Z999' });
    expect(sent.map((m) => m.subject)).toEqual([expect.stringContaining('has shipped')]);
    // To send: paid, not yet fulfilled, with something to send.
    const { data } = await ordersQuery(db, 'to-fulfil');
    expect((data ?? []).some((x: ShopOrder) => x.id === o.id)).toBe(false);
    const rows = ordersCsvRows([await order(o.id)]);
    expect(rows[0][0]).toBe('Order');
    expect(rows[1]).toEqual(expect.arrayContaining([o.code, 'ship-mug', '1Z999']));
  });
});

describe('another copy’s order', () => {
  it('is left alone here: not marked paid, not expired, not refunded or cancelled at the provider', async () => {
    const base = { provider: 'stripe', name: 'E', email: 'e@example.org', lines: [], quantity: 1, subtotal: 500, total: 500, currency: 'USD', home: 'https://other-copy.example' };
    await db.from('shop_orders').insert({ ...base, token: 'shop-else-1-xxxxxxxxxxxxxxxxxxxx', code: 'ELSE-S001', status: 'pending', provider_ref: 'cs_shop_else', expires_at: new Date(Date.now() - 3600_000).toISOString() });
    paid.add('cs_shop_else');
    await shopWebhook('stripe', { kind: 'checkout', ref: 'cs_shop_else' }, 'http://localhost');
    await expireShopHolds(db);
    const o = (await db.from('shop_orders').select('*').eq('token', 'shop-else-1-xxxxxxxxxxxxxxxxxxxx').single<ShopOrder>()).data!;
    expect(o.status).toBe('pending');
    await expect(cancelShopOrder(db, o.id, {}, 'http://localhost')).rejects.toThrow(/made on https:\/\/other-copy\.example/);
    await db.from('shop_orders').update({ status: 'paid', provider_payment: 'pi_shop_else' }).eq('id', o.id);
    await expect(refundShopOrder(db, o.id, 100, {}, 'http://localhost')).rejects.toThrow(/made on/);
  });

  it('takes only the currencies it offers', async () => {
    const { shopSettings } = await import('../src/lib/shop/config');
    expect(shopSettings({ shop: { currency: 'jpy' } }).currency).toBe('USD');
    expect(shopSettings({ shop: { currency: 'gbp' } }).currency).toBe('GBP');
  });
});
