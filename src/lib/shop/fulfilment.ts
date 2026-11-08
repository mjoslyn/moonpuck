// Labels and tracking for shipped orders, through the carrier service (src/lib/shop/carrier.ts): the
// label rates for an order's parcel (the box under Settings > Shop with its items' weights), buying one
// (which records the label, marks the order shipped with its tracking and emails the buyer), and the
// parcel's tracking, read from the carrier service when its update comes, by the hourly run, or on the
// order's page; a parcel delivered emails the buyer once (`delivered_at`). Server only.
import type { Db } from '../db/query';
import { serviceClient } from '../db/site';
import { env } from '../env';
import { shopSettings } from './config';
import { carrierProblem, checkoutSettings } from './checkout-settings';
import { activeCarrier, parcelOf, shipFrom, type CarrierRate, type TrackingStatus } from './carrier';
import { fulfilOrder, sendShopEmail, type ShopOrder } from './orders';
import { siteOrigin } from '../tickets/orders';

async function siteValue(db: Db) {
  const { data } = await db.from('settings').select('value').eq('key', 'site').maybeSingle();
  return (data?.value ?? {}) as Record<string, any>;
}

async function loadOrder(db: Db, id: number): Promise<ShopOrder> {
  const { data } = await db.from('shop_orders').select('*').eq('id', id).maybeSingle<ShopOrder>();
  if (!data) throw new Error('No such order.');
  return data;
}

/** The weight of an order's shipped items, in the shop's unit (items without a weight count as nothing). */
export const orderWeight = (o: Pick<ShopOrder, 'lines'>) => o.lines.reduce((w, l) => w + (l.weight ?? 0) * l.quantity, 0);

/** The rates for an order's label: of the carriers chosen, in the shop's currency, cheapest first. */
export async function labelRates(db: Db, id: number): Promise<{ rates: CarrierRate[]; chosen: string | null }> {
  const o = await loadOrder(db, id);
  if (o.status !== 'paid' || o.fulfilment !== 'ship' || !o.address) throw new Error('Only paid orders that are posted take a label.');
  const carrier = activeCarrier();
  if (!carrier) throw new Error('Connect Shippo under Settings > Connections to buy labels.');
  const site = await siteValue(db);
  const c = checkoutSettings(site.shop).carrier;
  const problem = carrierProblem(c);
  if (problem) throw new Error(`${problem} (Settings > Shop, Carrier)`);
  const { weightUnit, currency } = shopSettings(site);
  const a = o.address;
  const rates = await carrier.rates(shipFrom(c.from), { name: o.name, street1: a.line1, street2: a.line2, city: a.city, state: a.state, zip: a.zip, country: a.country, phone: o.phone || undefined, email: o.email }, parcelOf(c, orderWeight(o), weightUnit));
  const offered = rates.filter((r) => r.currency === currency.toUpperCase() && (!c.carriers.length || c.carriers.includes(r.carrier))).sort((x, y) => x.amount - y.amount);
  // The service the buyer chose, when they chose a carrier's rate.
  const chosen = o.shipping?.source === 'carrier' ? (offered.find((r) => r.carrier === o.shipping?.carrier && r.service === o.shipping?.service)?.rateId ?? null) : null;
  return { rates: offered, chosen };
}

/**
 * Buy a label at a rate from `labelRates` (`rate`: what the screen showed of it, kept with the label), then
 * mark the order shipped with its tracking number, which emails the buyer. A label is bought once: an
 * order that has one is refused.
 */
export async function buyLabel(db: Db, id: number, rate: Pick<CarrierRate, 'rateId' | 'carrier' | 'service' | 'serviceName' | 'carrierName' | 'amount' | 'currency'>, origin?: string): Promise<ShopOrder> {
  const o = await loadOrder(db, id);
  if (o.status !== 'paid' || o.fulfilment !== 'ship') throw new Error('Only paid orders that are posted take a label.');
  if (o.label) throw new Error('This order already has a label.');
  const carrier = activeCarrier();
  if (!carrier) throw new Error('Connect Shippo under Settings > Connections to buy labels.');
  if (!/^[\w-]{1,100}$/.test(rate.rateId)) throw new Error('No such rate.');
  const bought = await carrier.buyLabel(rate.rateId);
  const label = { id: bought.id, url: bought.labelUrl, carrier: rate.carrier, service: `${rate.carrierName} ${rate.serviceName}`.trim(), amount: Math.round(Number(rate.amount)) || 0, currency: rate.currency, at: new Date().toISOString() };
  // Kept before anything else, so a label paid for is never lost.
  const { error } = await db.from('shop_orders').update({ label }).eq('id', id);
  if (error) console.error(`shop: label ${bought.id} for order ${o.code} not recorded: ${error.message}`);
  await fulfilOrder(db, id, 'shipped', bought.trackingNumber, origin, rate.carrier, { follow: false });
  return loadOrder(db, id);
}

/**
 * An order's tracking read again from the carrier service and kept; delivered, the buyer is emailed once
 * (`delivered_at`, set where it is null).
 */
export async function refreshTracking(db: Db, o: ShopOrder, origin?: string): Promise<TrackingStatus | null> {
  const carrier = activeCarrier();
  if (!carrier || !o.tracking || !o.carrier || o.fulfilled !== 'shipped') return null;
  const t = await carrier.track(o.carrier, o.tracking);
  await db.from('shop_orders').update({ tracking_status: { ...t, checked_at: new Date().toISOString() } }).eq('id', o.id).eq('tracking', o.tracking);
  if (t.status === 'DELIVERED') {
    const { data } = await db.from('shop_orders').update({ delivered_at: t.at || new Date().toISOString() }).eq('id', o.id).is('delivered_at', null).select('*').maybeSingle<ShopOrder>();
    if (data) await sendShopEmail('delivered', data, siteOrigin(origin)).catch((e) => console.error(`shop: delivered email for ${o.code}: ${(e as Error).message}`));
  }
  return t;
}

/**
 * A tracking update from the carrier service (POST /api/shop/carrier/shippo?token=): its token checked,
 * then only the number is taken from it; each order with that number has its tracking read again.
 */
export async function trackingWebhook(token: string, body: any, origin?: string): Promise<number> {
  const want = env('SHIPPO_WEBHOOK_TOKEN');
  if (!want || token !== want) return -1;
  const number = String(body?.data?.tracking_number ?? '').trim();
  if (!number || number.length > 100) return 0;
  const db = serviceClient();
  const { data } = await db.from('shop_orders').select('*').eq('tracking', number).eq('fulfilled', 'shipped').limit(20);
  let n = 0;
  for (const o of (data ?? []) as ShopOrder[]) if (await refreshTracking(db, o, origin).catch((e) => (console.error(`shop: tracking ${o.code}: ${(e as Error).message}`), null))) n++;
  return n;
}

/** The hourly run: shipped orders of the last 30 days not yet delivered, read again (at most 50 a run, longest unchecked first), for updates missed. */
export async function refreshDueTracking(): Promise<number> {
  if (!activeCarrier()) return 0;
  const db = serviceClient();
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const { data } = await db.from('shop_orders').select('*').eq('fulfilled', 'shipped').is('delivered_at', null).neq('carrier', '').neq('tracking', '').gte('fulfilled_at', since).order('fulfilled_at').limit(200);
  const due = ((data ?? []) as ShopOrder[])
    .filter((o) => !o.tracking_status || Date.now() - Date.parse(o.tracking_status.checked_at) > 3 * 3600_000)
    .sort((a, b) => Date.parse(a.tracking_status?.checked_at ?? '1970-01-01') - Date.parse(b.tracking_status?.checked_at ?? '1970-01-01'))
    .slice(0, 50);
  let n = 0;
  for (const o of due) if (await refreshTracking(db, o).catch((e) => (console.error(`shop: tracking ${o.code}: ${(e as Error).message}`), null))) n++;
  return n;
}
