// The carrier (Shippo, stood in for here): live rates at checkout once the ZIP is in, a label bought from
// the order's page, tracking followed and read again on its webhook, the buyer told once it is delivered.
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { siteDb } from '../src/lib/db/site';
import { PROVIDERS } from '../src/lib/payments';
import { fulfilOrder, markShopPaid, startShopCheckout, type ShopOrder } from '../src/lib/shop/orders';
import { quoteCart } from '../src/lib/shop/cart';
import { cartTotals } from '../src/lib/shop/totals';
import { checkoutSettings } from '../src/lib/shop/checkout-settings';
import { carrierToken, shippingSources } from '../src/lib/shop/carrier';
import { buyLabel, labelRates, trackingWebhook } from '../src/lib/shop/fulfilment';
import { trackingLink } from '../src/lib/shop/tracking';

const sent: { to: string[]; subject: string; html: string }[] = [];
vi.mock('../src/lib/forms/mail', async (actual) => ({ ...(await actual<object>()), sendMail: async (m: any) => (sent.push(m), true) }));
let made = 0;
Object.assign(PROVIDERS.stripe, { configured: () => true, create: async () => ({ ref: `cs_k${++made}`, url: 'https://pay.example/x' }), check: async () => ({ status: 'pending' }), close: async () => {} });

// Shippo, stood in for: its answers as its API documents them.
const calls: { method: string; path: string; body: any }[] = [];
let trackStatus = 'TRANSIT';
const realFetch = globalThis.fetch;
beforeAll(() => {
  process.env.SHIPPO_API_KEY = 'shippo_test_abc';
  process.env.SHIPPO_WEBHOOK_TOKEN = 'hook-token';
  vi.stubGlobal('fetch', async (url: string | URL | Request, init?: RequestInit) => {
    const u = new URL(String(url));
    if (u.host !== 'api.goshippo.com') return realFetch(url as any, init);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ method: init?.method ?? 'GET', path: u.pathname, body });
    expect(new Headers(init?.headers).get('authorization')).toBe('ShippoToken shippo_test_abc');
    const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
    if (u.pathname === '/shipments/') {
      return json({
        object_id: 'shp_1',
        rates: [
          { object_id: 'rate_prio', amount: '9.85', currency: 'USD', provider: 'USPS', servicelevel: { name: 'Priority Mail', token: 'usps_priority' }, estimated_days: 2 },
          { object_id: 'rate_ground', amount: '6.10', currency: 'USD', provider: 'USPS', servicelevel: { name: 'Ground Advantage', token: 'usps_ground_advantage' }, estimated_days: 4 },
          { object_id: 'rate_ups', amount: '12.40', currency: 'USD', provider: 'UPS', servicelevel: { name: 'Ground', token: 'ups_ground' }, estimated_days: 3 },
          { object_id: 'rate_cad', amount: '8.00', currency: 'CAD', provider: 'USPS', servicelevel: { name: 'Priority Mail', token: 'usps_priority' }, estimated_days: 2 },
        ],
      });
    }
    if (u.pathname === '/transactions/') return json({ object_id: 'txn_1', status: 'SUCCESS', tracking_number: '9400100000000000000001', tracking_url_provider: 'https://tools.usps.com/x', label_url: 'https://shippo.example/label.pdf' });
    if (u.pathname === '/tracks/' && init?.method === 'POST') return json({ tracking_number: body.tracking_number });
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
  const paidOrder = async () => {
    const p = await product(1.5);
    await startShopCheckout({ lines: [{ product: p, variant: 'default', quantity: 2 }], name: 'Ada', email: 'ada@example.org', option: 'carrier:usps:usps_priority', address: ADDRESS }, 'http://localhost');
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
  it('names carriers and their tracking pages', () => {
    expect(carrierToken('FedEx')).toBe('fedex');
    expect(carrierToken('DHL Express')).toBe('dhl_express');
    expect(trackingLink('usps', '94 00')).toBe('https://tools.usps.com/go/TrackConfirmAction?tLabels=94%2000');
    expect(trackingLink('other', '1')).toBe('');
  });
});
