// The carrier (Shippo, stood in for here): live rates at checkout once the ZIP is in, a label bought from
// the order's page, tracking followed and read again on its webhook, the buyer told once it is delivered.
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { siteDb } from '../src/lib/db/site';
import { PROVIDERS } from '../src/lib/payments';
import { fulfilOrder, markShopPaid, startShopCheckout, type ShopOrder } from '../src/lib/shop/orders';
import { quoteCart } from '../src/lib/shop/cart';
import { cartTotals } from '../src/lib/shop/totals';
import { checkoutSettings } from '../src/lib/shop/checkout-settings';
import { carrierToken, LOOKUPS_PER_VISITOR, mayLookUp, rateKey, shippingSources } from '../src/lib/shop/carrier';
import { buyLabel, labelRates, refreshDueTracking, refreshTracking, trackingWebhook } from '../src/lib/shop/fulfilment';
import { carrierName, trackingLink } from '../src/lib/shop/tracking';

const sent: { to: string[]; subject: string; html: string }[] = [];
vi.mock('../src/lib/forms/mail', async (actual) => ({ ...(await actual<object>()), sendMail: async (m: any) => (sent.push(m), true) }));
let made = 0;
Object.assign(PROVIDERS.stripe, { configured: () => true, create: async () => ({ ref: `cs_k${++made}`, url: 'https://pay.example/x' }), check: async () => ({ status: 'pending' }), close: async () => {} });

// Shippo, stood in for: its answers in the shapes its API gave in test mode (every rate has `amount` and
// `currency`, and `amount_local` and `currency_local` in the account's currency; errors as `detail` or a
// field's list of messages).
const calls: { method: string; path: string; body: any }[] = [];
let trackStatus = 'TRANSIT';
let labelFails = false;
let rateCurrency: { currency: string; local?: string } = { currency: 'USD' };
const realFetch = globalThis.fetch;
// A live token unless a test says otherwise: a test token tracks only Shippo's test numbers.
const LIVE = 'shippo_live_abc';
beforeAll(() => {
  process.env.SHIPPO_API_KEY = LIVE;
  process.env.SHIPPO_WEBHOOK_TOKEN = 'hook-token';
  vi.stubGlobal('fetch', async (url: string | URL | Request, init?: RequestInit) => {
    const u = new URL(String(url));
    if (u.host !== 'api.goshippo.com') return realFetch(url as any, init);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ method: init?.method ?? 'GET', path: u.pathname, body });
    const key = String(new Headers(init?.headers).get('authorization')).replace('ShippoToken ', '');
    expect(key).toBe(process.env.SHIPPO_API_KEY);
    const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
    if (u.pathname === '/shipments/') {
      return json({
        object_id: 'shp_1',
        rates: [
          { object_id: 'rate_prio', amount: '9.85', currency: 'USD', provider: 'USPS', servicelevel: { name: 'Priority Mail', token: 'usps_priority' }, estimated_days: 2 },
          { object_id: 'rate_ground', amount: '6.10', currency: 'USD', provider: 'USPS', servicelevel: { name: 'Ground Advantage', token: 'usps_ground_advantage' }, estimated_days: 4 },
          { object_id: 'rate_ups', amount: '12.40', currency: 'USD', provider: 'UPS', servicelevel: { name: 'Ground', token: 'ups_ground' }, estimated_days: 3 },
          { object_id: 'rate_cad', amount: '8.00', currency: 'CAD', provider: 'USPS', servicelevel: { name: 'Priority Mail', token: 'usps_priority' }, estimated_days: 2 },
          { object_id: 'rate_cp', amount: '7.00', currency: 'USD', provider: 'Canada Post', servicelevel: { name: 'Expedited', token: 'canada_post_expedited' }, estimated_days: 3 },
        ].map((r) => ({ ...r, shipment: 'shp_1', test: true, attributes: [], messages: [], amount_local: rateCurrency.local && r.currency === 'USD' ? (Number(r.amount) * 1.4).toFixed(2) : r.amount, currency_local: rateCurrency.local && r.currency === 'USD' ? rateCurrency.local : r.currency })),
        messages: [{ source: 'UPS', code: '10429', text: 'Hard: Too Many Requests' }],
      });
    }
    if (u.pathname === '/transactions/' && labelFails) return json({ status: 'ERROR', messages: [{ text: 'Insufficient funds' }] });
    if (u.pathname === '/transactions/' && body.rate === 'rate_gone') return json({ rate: ['Rate with supplied object_id not found.'] }, 400);
    if (u.pathname === '/transactions/') return json({ object_id: 'txn_1', status: 'SUCCESS', tracking_number: '9400100000000000000001', tracking_url_provider: 'https://tools.usps.com/x', label_url: 'https://shippo.example/label.pdf' });
    if (u.pathname === '/tracks/' && init?.method === 'POST') return json({ tracking_number: body.tracking_number });
    if (u.pathname.startsWith('/tracks/') && key.startsWith('shippo_test_') && !u.pathname.startsWith('/tracks/shippo/')) return json({ detail: `${u.pathname.split('/')[2]} is not a valid test tracking carrier. Please use 'shippo'` }, 400);
    if (u.pathname.startsWith('/tracks/')) return json({ tracking_status: { status: trackStatus, status_details: trackStatus === 'DELIVERED' ? 'Left at the front door' : 'In transit', status_date: '2026-11-10T15:00:00Z' } });
    return json({ detail: 'Not found' }, 404);
  });
});

const db = siteDb();
const CARRIER = { rates: true, from: { name: 'Example Shop', street1: '1 Main St', city: 'Buffalo', state: 'NY', zip: '14201', country: 'US' }, box: { length: 10, width: 8, height: 4 }, boxWeight: 0.5, carriers: ['usps'] };
const setShop = async (shop: Record<string, unknown> = {}) => {
  const { data } = await db.from('settings').select('value').eq('key', 'site').maybeSingle();
  await db.from('settings').upsert({ key: 'site', value: { ...((data?.value as object) ?? {}), shop: { enabled: true, provider: 'stripe', zones: [{ id: 'us', name: 'US', places: ['US'], rates: [{ id: 'std', name: 'Standard', price: 500 }] }], carrier: CARRIER, ...shop } } });
};
beforeEach(async () => {
  await setShop();
  sent.length = 0;
  calls.length = 0;
  trackStatus = 'TRANSIT';
  labelFails = false;
  rateCurrency = { currency: 'USD' };
});
let n = 0;
const product = async (weight: number) => (await db.from('entries').insert({ type: 'product', slug: `ship-${++n}`, title: `Lamp ${n}`, status: 'publish', fields: { shop: { price: 4000, weight } } }).select('id').single()).data!.id as number;
const ADDRESS = { line1: '2 Elm St', city: 'Albany', state: 'NY', zip: '12207', country: 'US' };
const lastOrder = async () => (await db.from('shop_orders').select('*').order('id', { ascending: false }).limit(1).single<ShopOrder>()).data!;

describe('live rates', () => {
  it('come once the ZIP is in, of the carriers chosen and the shop’s currency, beside the zones’ rates', async () => {
    const p = await product(2);
    const quote = await quoteCart(db, [{ product: p, variant: 'default', quantity: 1 }], { published: true }, { shop: { enabled: true } });
    const settings = checkoutSettings({ zones: [{ id: 'us', name: 'US', places: ['US'], rates: [{ id: 'std', name: 'Standard', price: 500 }] }], carrier: CARRIER });
    const sources = shippingSources(settings, 'lb', 'USD');
    const before = await cartTotals(quote, settings, { destination: { country: 'US', state: 'NY' }, sources });
    expect(before.shipping.options.map((o) => o.id)).toEqual(['manual:us:std']);
    const after = await cartTotals(quote, settings, { destination: { country: 'US', state: 'NY', zip: '12207', city: 'Albany', line1: '2 Elm St' }, sources });
    expect(after.shipping.options.map((o) => [o.id, o.price])).toEqual([
      ['manual:us:std', 500],
      ['carrier:usps:usps_ground_advantage', 610],
      ['carrier:usps:usps_priority', 985],
    ]);
    const shipment = calls.find((c) => c.path === '/shipments/')!.body;
    expect(shipment.parcels).toEqual([{ length: 10, width: 8, height: 4, distance_unit: 'in', weight: 2.5, mass_unit: 'lb' }]);
    expect(shipment.address_from).toMatchObject({ street1: '1 Main St', zip: '14201' });
    // Asked again for the same address and weight: from the cache.
    await cartTotals(quote, settings, { destination: { country: 'US', state: 'NY', zip: '12207', city: 'Albany', line1: '2 Elm St' }, sources });
    expect(calls.filter((c) => c.path === '/shipments/')).toHaveLength(1);
    // In place of the zones' rates.
    expect(shippingSources({ ...settings, carrier: { ...settings.carrier, only: true } }, 'lb', 'USD').map((s) => s.id)).toEqual(['carrier']);
  });
  it('are charged at checkout, the order keeping the carrier and service', async () => {
    const p = await product(1);
    await startShopCheckout({ lines: [{ product: p, variant: 'default', quantity: 1 }], name: 'Ada', email: 'ada@example.org', option: 'carrier:usps:usps_priority', address: ADDRESS }, 'http://localhost');
    const o = await lastOrder();
    expect(o).toMatchObject({ shipping_total: 985, total: 4985, shipping: { source: 'carrier', carrier: 'usps', service: 'usps_priority' } });
    expect(o.lines[0].weight).toBe(1);
  });
});

describe('labels and tracking', () => {
  // Each buyer its own address (a buyer has at most 5 unpaid orders an hour).
  let buyers = 0;
  const paidOrder = async () => {
    const p = await product(1.5);
    const r = await startShopCheckout({ lines: [{ product: p, variant: 'default', quantity: 2 }], name: 'Ada', email: `ada${++buyers}@example.org`, option: 'carrier:usps:usps_priority', address: ADDRESS }, 'http://localhost');
    expect(r).toMatchObject({ redirect: expect.any(String) });
    const o = await lastOrder();
    await markShopPaid(db, o, { paymentId: 'pi' }, 'http://localhost');
    sent.length = 0;
    calls.length = 0;
    return o;
  };
  it('buys a label at the rate chosen, marks the order shipped and emails the tracking', async () => {
    const o = await paidOrder();
    const { rates, chosen } = await labelRates(db, o.id);
    expect(rates.map((r) => r.service)).toEqual(['usps_ground_advantage', 'usps_priority']);
    expect(chosen).toBe('rate_prio');
    expect(calls[0].body.parcels[0].weight).toBe(3.5);
    const after = await buyLabel(db, o.id, rates.find((r) => r.rateId === chosen)!, 'http://localhost');
    expect(after).toMatchObject({ fulfilled: 'shipped', tracking: '9400100000000000000001', carrier: 'usps', label: { id: 'txn_1', url: 'https://shippo.example/label.pdf', amount: 985 } });
    expect(calls.find((c) => c.path === '/transactions/')!.body).toMatchObject({ rate: 'rate_prio', label_file_type: 'PDF' });
    // A label bought there is followed by Shippo on its own.
    expect(calls.some((c) => c.path === '/tracks/' && c.method === 'POST')).toBe(false);
    expect(sent[0].html).toContain(trackingLink('usps', '9400100000000000000001').replace(/&/g, '&amp;'));
    await expect(buyLabel(db, o.id, rates[0])).rejects.toThrow(/already has a label/);
  });
  it('follows a number typed for a known carrier, and tells the buyer once it is delivered', async () => {
    const o = await paidOrder();
    await fulfilOrder(db, o.id, 'shipped', '1Z999', 'http://localhost', 'ups');
    expect(calls).toContainEqual({ method: 'POST', path: '/tracks/', body: { carrier: 'ups', tracking_number: '1Z999' } });
    expect(await trackingWebhook('wrong', { data: { tracking_number: '1Z999' } })).toBe(-1);
    // The webhook's own status isn't taken: Shippo is asked.
    expect(await trackingWebhook('hook-token', { data: { tracking_number: '1Z999', tracking_status: { status: 'DELIVERED' } } })).toBe(1);
    expect((await lastOrder()).tracking_status).toMatchObject({ status: 'TRANSIT' });
    expect(sent.filter((m) => /arrived/.test(m.subject))).toEqual([]);
    trackStatus = 'DELIVERED';
    await trackingWebhook('hook-token', { data: { tracking_number: '1Z999' } });
    await trackingWebhook('hook-token', { data: { tracking_number: '1Z999' } });
    expect(sent.filter((m) => /arrived/.test(m.subject))).toHaveLength(1);
    expect((await lastOrder()).delivered_at).toBe('2026-11-10T15:00:00.000Z');
  });
  it('buys one label when two purchases overlap, and lets go of the claim when the purchase fails', async () => {
    const o = await paidOrder();
    const { rates } = await labelRates(db, o.id);
    labelFails = true;
    await expect(buyLabel(db, o.id, rates[0])).rejects.toThrow(/Insufficient funds/);
    expect((await lastOrder()).label).toBeNull();
    labelFails = false;
    calls.length = 0;
    const both = await Promise.allSettled([buyLabel(db, o.id, rates[0]), buyLabel(db, o.id, rates[1])]);
    expect(both.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(calls.filter((c) => c.path === '/transactions/')).toHaveLength(1);
    expect((await lastOrder()).label).toMatchObject({ id: 'txn_1' });
  });
  it('keeps a carrier that isn’t one of the four, and clears one when none is chosen', async () => {
    await setShop({ carrier: { ...CARRIER, carriers: [] } });
    const o = await paidOrder();
    const { rates } = await labelRates(db, o.id);
    const cp = rates.find((r) => r.carrier === 'canada_post')!;
    expect(cp).toBeTruthy();
    expect(await buyLabel(db, o.id, cp)).toMatchObject({ carrier: 'canada_post' });
    await fulfilOrder(db, o.id, 'shipped', '9400100000000000000001', 'http://localhost', '');
    expect((await lastOrder()).carrier).toBe('');
  });
  it('says why a label wasn’t bought, from Shippo’s answer', async () => {
    const o = await paidOrder();
    const { rates } = await labelRates(db, o.id);
    await expect(buyLabel(db, o.id, { ...rates[0], rateId: 'rate_gone' })).rejects.toThrow('Shippo answered 400: Rate with supplied object_id not found.');
    expect((await lastOrder()).label).toBeNull();
  });
  it('with a test token, tracks only Shippo’s test numbers, and leaves the others out of the hourly run', async () => {
    process.env.SHIPPO_API_KEY = 'shippo_test_abc';
    try {
      const o = await paidOrder();
      // A test label's number (usps) can't be read in test mode: not followed, a plain refusal on Check the
      // tracking now, and left out of the hourly run.
      await fulfilOrder(db, o.id, 'shipped', '9305520845500000956183', 'http://localhost', 'usps');
      expect(calls.some((c) => c.path === '/tracks/')).toBe(false);
      await expect(refreshTracking(db, await lastOrder())).rejects.toThrow(/test token tracks only its test numbers/);
      calls.length = 0;
      await refreshDueTracking();
      expect(calls.some((c) => c.path === '/tracks/usps/9305520845500000956183')).toBe(false);
      // Its test numbers, under the carrier `shippo`, are followed and read.
      trackStatus = 'DELIVERED';
      await fulfilOrder(db, o.id, 'shipped', 'SHIPPO_DELIVERED', 'http://localhost', 'shippo');
      expect(calls).toContainEqual({ method: 'POST', path: '/tracks/', body: { carrier: 'shippo', tracking_number: 'SHIPPO_DELIVERED' } });
      expect(await refreshTracking(db, await lastOrder())).toMatchObject({ status: 'DELIVERED' });
      expect(sent.filter((m) => /arrived/.test(m.subject))).toHaveLength(1);
    } finally {
      process.env.SHIPPO_API_KEY = LIVE;
    }
  });
  it('prices rates in the shop’s currency, from the account’s local amount', async () => {
    rateCurrency = { currency: 'USD', local: 'CAD' };
    const settings = checkoutSettings({ carrier: { ...CARRIER, carriers: ['usps'] } });
    const p = await product(1);
    const quote = await quoteCart(db, [{ product: p, variant: 'default', quantity: 1 }], { published: true }, { shop: { enabled: true } });
    const t = await cartTotals(quote, settings, { destination: { country: 'US', state: 'NY', zip: '10001', city: 'New York', line1: '5 Main St' }, sources: shippingSources(settings, 'lb', 'CAD') });
    // At their CAD amounts (Ground Advantage 6.10 at 1.4); Priority Mail answered twice, at 9.85 USD (13.79 CAD)
    // and 8.00 CAD, is offered once, at the cheaper.
    expect(t.shipping.options.filter((x) => x.source === 'carrier').map((x) => [x.id, x.price])).toEqual([
      ['carrier:usps:usps_priority', 800],
      ['carrier:usps:usps_ground_advantage', 854],
    ]);
  });
  it('finds the rates the cart showed at checkout whatever the spacing, case or apartment line', () => {
    const c = checkoutSettings({ carrier: CARRIER }).carrier;
    const a = rateKey({ name: 'Buyer', street1: ' 2  elm st ', street2: '', city: 'albany', state: 'ny', zip: '12207 ', country: 'US' }, 2, c, 'lb', 'USD');
    const b = rateKey({ name: 'Ada', street1: '2 Elm St', street2: 'Apt 4', city: 'Albany', state: 'NY', zip: '12207', country: 'US' }, 2, c, 'lb', 'USD');
    expect(a).toBe(b);
  });
  it('limits the lookups a visitor’s cart can make', () => {
    const at = Date.now();
    for (let i = 0; i < LOOKUPS_PER_VISITOR; i++) expect(mayLookUp('203.0.113.9', at)).toBe(true);
    expect(mayLookUp('203.0.113.9', at)).toBe(false);
    expect(mayLookUp('198.51.100.1', at)).toBe(true);
    expect(mayLookUp('203.0.113.9', at + 11 * 60_000)).toBe(true);
  });
  it('checks the parcels unchecked longest, however many are open', async () => {
    const now = new Date().toISOString();
    const base = { status: 'paid', provider: 'stripe', name: 'A', email: 'a@example.org', lines: [], quantity: 1, subtotal: 100, total: 100, currency: 'USD', fulfilment: 'ship', fulfilled: 'shipped', carrier: 'usps', tracking_status: { status: 'TRANSIT', details: '', at: null, checked_at: now } };
    for (let i = 0; i < 210; i++) expect((await db.from('shop_orders').insert({ ...base, token: `due-${i}-tokenaaaaaaaaaaaaaaaaaa`, code: `DUE-${i}`, tracking: `DUE${i}`, fulfilled_at: new Date(Date.now() - (20 - i / 20) * 86400_000).toISOString() })).error).toBeNull();
    // The newest, never checked.
    expect((await db.from('shop_orders').insert({ ...base, token: 'due-new-tokenaaaaaaaaaaaaaaaaa', code: 'DUE-NEW', tracking: 'DUENEW', tracking_status: null, fulfilled_at: now })).error).toBeNull();
    calls.length = 0;
    await refreshDueTracking();
    // The newest open parcel is read; those checked just now aren't (the earlier tests' parcels may be too).
    expect(calls.map((c) => c.path)).toContain('/tracks/usps/DUENEW');
    expect(calls.some((c) => /\/DUE\d+$/.test(c.path))).toBe(false);
  });
  it('names carriers and their tracking pages', () => {
    expect(carrierName('canada_post')).toBe('Canada Post');
    expect(carrierName('shippo')).toBe('Shippo test numbers');
    expect(carrierToken('FedEx')).toBe('fedex');
    expect(carrierToken('DHL Express')).toBe('dhl_express');
    expect(trackingLink('usps', '94 00')).toBe('https://tools.usps.com/go/TrackConfirmAction?tLabels=94%2000');
    expect(trackingLink('other', '1')).toBe('');
  });
});
