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
  rates(from: CarrierAddress, to: CarrierAddress, parcel: Parcel): Promise<CarrierRate[]>;
  buyLabel(rateId: string): Promise<Label>;
  track(carrier: string, number: string): Promise<TrackingStatus>;
  /** Ask for tracking updates of a number not bought through it (a label bought there is followed on its own). */
  follow(carrier: string, number: string): Promise<void>;
}

export class CarrierError extends Error {}

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

const minor = (amount: unknown) => Math.round(Number(amount) * 100);

export const shippoCarrier: Carrier = {
  name: 'Shippo',
  configured: () => !!env('SHIPPO_API_KEY'),
  async rates(from, to, parcel) {
    const shipment = await shippo('POST', '/shipments/', { address_from: from, address_to: to, parcels: [parcel], async: false });
    return (Array.isArray(shipment?.rates) ? shipment.rates : [])
      .filter((r: any) => r?.object_id && Number.isFinite(Number(r.amount)))
      .map(
        (r: any): CarrierRate => ({
          rateId: String(r.object_id),
          carrier: carrierToken(r.provider),
          carrierName: String(r.provider ?? ''),
          service: String(r.servicelevel?.token ?? r.servicelevel?.name ?? ''),
          serviceName: String(r.servicelevel?.name ?? ''),
          amount: minor(r.amount),
          currency: String(r.currency ?? 'USD').toUpperCase(),
          days: Number.isFinite(Number(r.estimated_days)) ? Number(r.estimated_days) : null,
        }),
      );
  },
  async buyLabel(rateId) {
    const t = await shippo('POST', '/transactions/', { rate: rateId, label_file_type: 'PDF', async: false });
    if (t?.status !== 'SUCCESS' || !t.label_url) throw new CarrierError(`The label wasn’t bought${t?.messages?.[0]?.text ? `: ${t.messages[0].text}` : ''}.`);
    return { id: String(t.object_id), trackingNumber: String(t.tracking_number ?? ''), trackingUrl: String(t.tracking_url_provider ?? ''), labelUrl: String(t.label_url) };
  },
  async track(carrier, number) {
    const t = await shippo('GET', `/tracks/${encodeURIComponent(carrier)}/${encodeURIComponent(number)}`);
    const s = t?.tracking_status ?? {};
    return { status: String(s.status ?? 'UNKNOWN'), details: String(s.status_details ?? ''), at: s.status_date ? String(s.status_date) : null };
  },
  async follow(carrier, number) {
    await shippo('POST', '/tracks/', { carrier, tracking_number: number });
  },
};

/** The carrier in use: Shippo, while its key is set. */
export const activeCarrier = (): Carrier | null => (shippoCarrier.configured() ? shippoCarrier : null);

export const shipFrom = (f: ShipFrom): CarrierAddress => ({ name: f.name || f.company || 'Shop', company: f.company || undefined, street1: f.street1, street2: f.street2 || undefined, city: f.city, state: f.state || undefined, zip: f.zip, country: f.country, phone: f.phone || undefined, email: f.email || undefined });

/** A parcel of the box with `weight` (the shop's weight unit) inside: inches for pounds and ounces, else centimetres. */
export function parcelOf(c: CarrierSettings, weight: number, unit: string): Parcel {
  const mass = (['lb', 'oz', 'kg', 'g'].includes(unit) ? unit : 'lb') as Parcel['mass_unit'];
  return { ...c.box, distance_unit: mass === 'lb' || mass === 'oz' ? 'in' : 'cm', weight: Math.round((weight + c.boxWeight) * 1000) / 1000, mass_unit: mass };
}

/** The rates a carrier offers for a parcel, of the carriers chosen and in the shop's currency, cheapest first. */
async function offered(carrier: Carrier, c: CarrierSettings, to: CarrierAddress, weight: number, unit: string, currency: string): Promise<CarrierRate[]> {
  const rates = await carrier.rates(shipFrom(c.from), to, parcelOf(c, weight, unit));
  return rates.filter((r) => r.currency === currency.toUpperCase() && (!c.carriers.length || c.carriers.includes(r.carrier))).sort((a, b) => a.amount - b.amount);
}

// The rates answered for an address and weight, for a few minutes: a buyer's checkout asks again as they
// change their choices, and checkout asks once more to charge.
const CACHE_MS = 10 * 60_000;
const cache = new Map<string, { at: number; rates: CarrierRate[] }>();

/** A rate as a shipping option: `carrier:<carrier>:<service>`, the same each time it is asked for. */
export const rateOption = (r: CarrierRate): ShipOption => ({ id: `carrier:${r.carrier}:${r.service}`, kind: 'ship', name: `${r.carrierName} ${r.serviceName}`.trim(), price: r.amount, source: 'carrier', carrier: r.carrier, service: r.service, days: r.days });

/** The carrier's rates as a shipping source: only for an address with a ZIP code (and a street, when given) and a weight. */
export function carrierSource(carrier: Carrier, c: CarrierSettings, unit: string, currency: string): ShippingSource {
  return {
    id: 'carrier',
    async quote(cart: CartFacts, dest: Destination) {
      const weight = cartWeight(cart);
      if (!dest.zip || (!weight && !c.boxWeight)) return [];
      const to: CarrierAddress = { name: 'Buyer', street1: dest.line1 || '', street2: dest.line2, city: dest.city || '', state: dest.state, zip: dest.zip, country: dest.country };
      const key = JSON.stringify([to, weight, c, unit, currency]);
      const hit = cache.get(key);
      let rates = hit && Date.now() - hit.at < CACHE_MS ? hit.rates : null;
      if (!rates) {
        rates = await offered(carrier, c, to, weight, unit, currency);
        if (cache.size > 500) cache.clear();
        cache.set(key, { at: Date.now(), rates });
      }
      return rates.map(rateOption);
    },
  };
}

/** The shipping sources checkout uses: the manual zones, and the carrier's live rates while on (in their place with `only`). */
export function shippingSources(settings: CheckoutSettings, unit: string, currency: string): ShippingSource[] {
  const carrier = activeCarrier();
  const live = carrier && settings.carrier.rates && !carrierProblem(settings.carrier) ? carrierSource(carrier, settings.carrier, unit, currency) : null;
  if (!live) return [manualSource(settings)];
  return settings.carrier.only ? [live] : [manualSource(settings), live];
}

export { trackingLink, carrierName } from './tracking';
