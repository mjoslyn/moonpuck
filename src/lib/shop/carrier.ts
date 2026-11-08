// A carrier's live rates, labels and tracking for the shop, through Shippo's REST API (no SDK): its key
// is SHIPPO_API_KEY (Settings > Connections, or the environment), test keys starting shippo_test_. Behind
// one `Carrier` interface, so another service can sit beside it. Rates are a shipping source
// (src/lib/shop/totals.ts) beside the manual zones or in their place (Settings > Shop, Carrier); labels
// are bought from an order's page; tracking updates come to /api/shop/carrier/shippo, whose answer is
// never trusted: the order's tracking is read again from Shippo. Server only.
import { env } from '../env';
import { manualSource, type CartFacts, type ShipOption, type ShippingSource, cartWeight } from './totals';
import { carrierProblem, type CarrierSettings, type CheckoutSettings, type ShipFrom } from './checkout-settings';
import type { Destination } from './places';

export interface CarrierAddress {
  name: string;
  company?: string;
  street1: string;
  street2?: string;
  city: string;
  state?: string;
  zip: string;
  country: string;
  phone?: string;
  email?: string;
}

export interface Parcel {
  length: number;
  width: number;
  height: number;
  distance_unit: 'in' | 'cm';
  weight: number;
  mass_unit: 'lb' | 'oz' | 'kg' | 'g';
}

export interface CarrierRate {
  /** The rate's id at the carrier service, to buy a label with (good for a while). */
  rateId: string;
  /** The carrier's token (usps, ups, fedex, dhl_express) and name. */
  carrier: string;
  carrierName: string;
  /** The service's token and name ("Priority Mail"). */
  service: string;
  serviceName: string;
  /** In minor units (cents). */
  amount: number;
  currency: string;
  days: number | null;
}

export interface Label {
  id: string;
  trackingNumber: string;
  trackingUrl: string;
  labelUrl: string;
}

/** A parcel's tracking as the carrier reports it. */
export interface TrackingStatus {
  /** PRE_TRANSIT, TRANSIT, DELIVERED, RETURNED, FAILURE or UNKNOWN. */
  status: string;
  details: string;
  at: string | null;
}

export interface Carrier {
  name: string;
  configured(): boolean;
  /** The rates for a parcel, priced in `currency` (rates the service can't give in it are left out). */
  rates(from: CarrierAddress, to: CarrierAddress, parcel: Parcel, currency: string): Promise<CarrierRate[]>;
  buyLabel(rateId: string): Promise<Label>;
  /** Whether it can read this carrier's tracking (a test key reads only the service's own test numbers). */
  tracks(carrier: string): boolean;
  track(carrier: string, number: string): Promise<TrackingStatus>;
  /** Ask for tracking updates of a number not bought through it (a label bought there is followed on its own). */
  follow(carrier: string, number: string): Promise<void>;
}

export class CarrierError extends Error {}

/** Shippo's test tokens track only its own test numbers, under the carrier `shippo` (SHIPPO_TRANSIT, SHIPPO_DELIVERED...). */
export const SHIPPO_TEST_CARRIER = 'shippo';
const testKey = () => String(env('SHIPPO_API_KEY') ?? '').startsWith('shippo_test_');

const base = () => (env('SHIPPO_API_BASE') || 'https://api.goshippo.com').replace(/\/$/, '');

async function shippo(method: string, path: string, body?: unknown): Promise<any> {
  const key = env('SHIPPO_API_KEY');
  if (!key) throw new CarrierError('Shippo isn’t connected (Settings > Connections).');
  const res = await fetch(`${base()}${path}`, { method, headers: { Authorization: `ShippoToken ${key}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const why = data?.detail || data?.messages?.[0]?.text || (typeof data === 'object' ? Object.values(data).flat().find((v) => typeof v === 'string') : '') || res.statusText;
    throw new CarrierError(`Shippo answered ${res.status}${why ? `: ${why}` : ''}`);
  }
  return data;
}

/** A carrier's token from the name Shippo gives it ("USPS", "FedEx", "DHL Express"). */
export const carrierToken = (name: string) => {
  const t = String(name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return t === 'dhl' ? 'dhl_express' : t;
};

import { toMinor } from '../payments/money';

export const shippoCarrier: Carrier = {
  name: 'Shippo',
  configured: () => !!env('SHIPPO_API_KEY'),
  async rates(from, to, parcel, currency) {
    const shipment = await shippo('POST', '/shipments/', { address_from: from, address_to: to, parcels: [parcel], async: false });
    const want = currency.toUpperCase();
    const out: CarrierRate[] = [];
    for (const r of Array.isArray(shipment?.rates) ? shipment.rates : []) {
      if (!r?.object_id) continue;
      // Shippo prices a rate in the carrier's currency (`amount`) and in the account's own (`amount_local`):
      // the one in the shop's currency is taken.
      const amount = String(r.currency_local ?? '').toUpperCase() === want && Number.isFinite(Number(r.amount_local)) ? r.amount_local : String(r.currency ?? '').toUpperCase() === want && Number.isFinite(Number(r.amount)) ? r.amount : null;
      if (amount == null) continue;
      out.push({
        rateId: String(r.object_id),
        carrier: carrierToken(r.provider),
        carrierName: String(r.provider ?? ''),
        service: String(r.servicelevel?.token ?? r.servicelevel?.name ?? ''),
        serviceName: String(r.servicelevel?.name ?? ''),
        // The shop's currencies all have two decimal places (src/lib/payments/money.ts).
        amount: toMinor(amount),
        currency: want,
        days: Number.isFinite(Number(r.estimated_days)) ? Number(r.estimated_days) : null,
      });
    }
    return out;
  },
  async buyLabel(rateId) {
    const t = await shippo('POST', '/transactions/', { rate: rateId, label_file_type: 'PDF', async: false });
    if (t?.status !== 'SUCCESS' || !t.label_url) throw new CarrierError(`The label wasn’t bought${t?.messages?.[0]?.text ? `: ${t.messages[0].text}` : ''}.`);
    return { id: String(t.object_id), trackingNumber: String(t.tracking_number ?? ''), trackingUrl: String(t.tracking_url_provider ?? ''), labelUrl: String(t.label_url) };
  },
  tracks: (carrier) => !testKey() || carrier === SHIPPO_TEST_CARRIER,
  async track(carrier, number) {
    if (!shippoCarrier.tracks(carrier)) throw new CarrierError(`Shippo’s test token tracks only its test numbers (carrier “Shippo test numbers”, such as SHIPPO_TRANSIT or SHIPPO_DELIVERED), not ${carrier} ones.`);
    const t = await shippo('GET', `/tracks/${encodeURIComponent(carrier)}/${encodeURIComponent(number)}`);
    const s = t?.tracking_status ?? {};
    return { status: String(s.status ?? 'UNKNOWN'), details: String(s.status_details ?? ''), at: s.status_date ? String(s.status_date) : null };
  },
  async follow(carrier, number) {
    if (!shippoCarrier.tracks(carrier)) return;
    await shippo('POST', '/tracks/', { carrier, tracking_number: number });
  },
};

/** The carrier in use: Shippo, while its key is set. */
export const activeCarrier = (): Carrier | null => (shippoCarrier.configured() ? shippoCarrier : null);

/** Whether the carrier service is on a test key (its labels are test labels, its tracking test numbers). */
export const carrierTesting = () => shippoCarrier.configured() && testKey();

export const shipFrom = (f: ShipFrom): CarrierAddress => ({ name: f.name || f.company || 'Shop', company: f.company || undefined, street1: f.street1, street2: f.street2 || undefined, city: f.city, state: f.state || undefined, zip: f.zip, country: f.country, phone: f.phone || undefined, email: f.email || undefined });

/** A parcel of the box with `weight` (the shop's weight unit) inside: inches for pounds and ounces, else centimetres. */
export function parcelOf(c: CarrierSettings, weight: number, unit: string): Parcel {
  const mass = (['lb', 'oz', 'kg', 'g'].includes(unit) ? unit : 'lb') as Parcel['mass_unit'];
  return { ...c.box, distance_unit: mass === 'lb' || mass === 'oz' ? 'in' : 'cm', weight: Math.round((weight + c.boxWeight) * 1000) / 1000, mass_unit: mass };
}

/** The rates a carrier offers for a parcel, of the carriers chosen and in the shop's currency, cheapest first. */
export async function offered(carrier: Carrier, c: CarrierSettings, to: CarrierAddress, weight: number, unit: string, currency: string): Promise<CarrierRate[]> {
  const rates = await carrier.rates(shipFrom(c.from), to, parcelOf(c, weight, unit), currency);
  const sorted = rates.filter((r) => r.currency === currency.toUpperCase() && (!c.carriers.length || c.carriers.includes(r.carrier))).sort((a, b) => a.amount - b.amount);
  // One rate per carrier and service (its option's id), the cheapest, should the service answer it twice.
  const seen = new Set<string>();
  return sorted.filter((r) => !seen.has(`${r.carrier}:${r.service}`) && seen.add(`${r.carrier}:${r.service}`));
}

// The rates answered for an address and weight, for a few minutes: a buyer's checkout asks again as they
// change their choices, and checkout asks once more to charge. The key is the address as rates depend on
// it (country, state, ZIP, city and street, in one case and spacing; not the apartment line, which the
// cart doesn't re-price on), so checkout finds the rates the cart showed. The oldest go past 500.
const CACHE_MS = 10 * 60_000;
const CACHE_MAX = 500;
const cache = new Map<string, { at: number; rates: CarrierRate[] }>();
const norm = (v: string | undefined) => String(v ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
export const rateKey = (to: CarrierAddress, weight: number, c: CarrierSettings, unit: string, currency: string) =>
  JSON.stringify([norm(to.country), norm(to.state), norm(to.zip), norm(to.city), norm(to.street1), weight, c, unit, currency]);

// New lookups a buyer's checkout may make (each a shipment at the carrier service): per visitor and in
// all, in each running copy of the Worker, so a script can't spend the shop's API allowance. Over them a
// visitor gets no carrier rates until the window passes; checkout itself isn't limited.
const LOOKUP_WINDOW_MS = 10 * 60_000;
export const LOOKUPS_PER_VISITOR = 30;
export const LOOKUPS_IN_ALL = 300;
const lookups = new Map<string, number[]>();
/** Whether `client` may make one more lookup now (and counts it when so). */
export function mayLookUp(client: string, now = Date.now()): boolean {
  const recent = (k: string) => (lookups.get(k) ?? []).filter((t) => now - t < LOOKUP_WINDOW_MS);
  const mine = recent(`v:${client}`);
  const all = recent('*');
  if (mine.length >= LOOKUPS_PER_VISITOR || all.length >= LOOKUPS_IN_ALL) return false;
  lookups.set(`v:${client}`, [...mine, now]);
  lookups.set('*', [...all, now]);
  if (lookups.size > 5000) for (const k of [...lookups.keys()].slice(0, 2500)) if (k !== '*') lookups.delete(k);
  return true;
}

/** A rate as a shipping option: `carrier:<carrier>:<service>`, the same each time it is asked for. */
export const rateOption = (r: CarrierRate): ShipOption => ({ id: `carrier:${r.carrier}:${r.service}`, kind: 'ship', name: `${r.carrierName} ${r.serviceName}`.trim(), price: r.amount, source: 'carrier', carrier: r.carrier, service: r.service, days: r.days });

/** The carrier's rates as a shipping source: only for an address with a ZIP code (and a street, when given) and a weight. */
export function carrierSource(carrier: Carrier, c: CarrierSettings, unit: string, currency: string, client?: string): ShippingSource {
  return {
    id: 'carrier',
    async quote(cart: CartFacts, dest: Destination) {
      const weight = cartWeight(cart);
      if (!dest.zip || (!weight && !c.boxWeight)) return [];
      const to: CarrierAddress = { name: 'Buyer', street1: dest.line1 || '', street2: dest.line2, city: dest.city || '', state: dest.state, zip: dest.zip, country: dest.country };
      const key = rateKey(to, weight, c, unit, currency);
      const hit = cache.get(key);
      let rates = hit && Date.now() - hit.at < CACHE_MS ? hit.rates : null;
      if (!rates) {
        // A buyer's cart (`client`) is limited; checkout, which charges, isn't.
        if (client !== undefined && !mayLookUp(client)) return [];
        rates = await offered(carrier, c, to, weight, unit, currency);
        cache.delete(key);
        cache.set(key, { at: Date.now(), rates });
        while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
      }
      return rates.map(rateOption);
    },
  };
}

/** The shipping sources checkout uses: the manual zones, and the carrier's live rates while on (in their place with `only`). */
export function shippingSources(settings: CheckoutSettings, unit: string, currency: string, client?: string): ShippingSource[] {
  const carrier = activeCarrier();
  const live = carrier && settings.carrier.rates && !carrierProblem(settings.carrier) ? carrierSource(carrier, settings.carrier, unit, currency, client) : null;
  if (!live) return [manualSource(settings)];
  return settings.carrier.only ? [live] : [manualSource(settings), live];
}

export { trackingLink, carrierName } from './tracking';
