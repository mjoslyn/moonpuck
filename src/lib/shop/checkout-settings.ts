// The shop's checkout settings (Settings > Shop, under settings.site.shop): the payment provider, how long
// an unpaid order holds its stock, shipping zones and their rates, pickup locations and tax. Prices and
// band limits are in minor units (cents), weights in the shop's weight unit, tax rates in percent. Each
// is cleaned to known shapes on read and saved only when it isn't the default. Safe in the browser.
import { cleanPlace } from './places';

export const DEFAULT_HOLD = 60;
export const MAX_ZONES = 30;
export const MAX_RATES = 10;
export const MAX_BANDS = 10;
export const MAX_PICKUP = 10;
export const MAX_TAX_REGIONS = 80;
/** Stripe's tax code for general goods. */
export const DEFAULT_TAX_CODE = 'txcd_99999999';

/** A band of a rate by subtotal or weight: from `min` (inclusive) to `max` (exclusive; null: no limit). */
export interface RateBand {
  min: number;
  max: number | null;
  price: number;
}

/** How a rate is priced: one price, or by the order's subtotal or total weight (its bands). */
export type RateRule = 'flat' | 'subtotal' | 'weight';

export interface ShippingRate {
  /** Stable: an order and a buyer's choice name it. */
  id: string;
  name: string;
  rule: RateRule;
  /** The price of a flat rate. */
  price: number;
  /** A subtotal or weight rate's bands; a cart in none of them isn't offered the rate. */
  bands: RateBand[];
  /** Free when the subtotal is at least this. */
  freeOver: number | null;
}

/** Places it covers (src/lib/shop/places.ts: "US", "US-NY", "*" for everywhere else) and their rates. */
export interface ShippingZone {
  id: string;
  name: string;
  places: string[];
  rates: ShippingRate[];
}

export interface PickupLocation {
  id: string;
  name: string;
  address: string;
  hours: string;
  fee: number;
  /** Where it is, for tax ("US-NY"); empty: the store's tax rate. */
  place: string;
}

export interface TaxRegion {
  place: string;
  /** Percent. */
  rate: number;
}

export interface TaxSettings {
  /** Rates set here, or Stripe Tax (while Stripe is the provider). */
  mode: 'rates' | 'stripe';
  /** The store's rate, in percent. */
  rate: number;
  /** Rates replacing the store's where the address is in their place (the most specific wins). */
  regions: TaxRegion[];
  /** Shipping is taxed too (at the address's rate). */
  onShipping: boolean;
  /** Stripe Tax's code for products without their own. */
  taxCode: string;
}

/** The checkout's "Email me news" tick: the mailing lists it signs the buyer up to (none: no tick). */
export interface NewsTick {
  lists: number[];
  label?: string;
}
export const DEFAULT_NEWS_LABEL = 'Email me news and offers';

export interface CheckoutSettings {
  provider?: 'stripe' | 'square';
  /** Minutes an unpaid order holds its stock (30-120). */
  hold: number;
  zones: ShippingZone[];
  pickup: PickupLocation[];
  tax: TaxSettings;
  news: NewsTick;
  /** At or under this many left a variant is low (a product can set its own); 0: never. */
  lowStock: number;
  /** Email the shop when a sale takes a variant to its low-stock mark. */
  lowStockAlerts: boolean;
}

export const DEFAULT_LOW_STOCK = 3;

const text = (v: unknown, max = 120) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const lines = (v: unknown, max = 400) => String(v ?? '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim().slice(0, max);
const minor = (v: unknown): number => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.min(Math.round(Number(v)), 100_000_000) : 0);
const limit = (v: unknown): number | null => (v === '' || v == null || !Number.isFinite(Number(v)) || Number(v) < 0 ? null : Number(v));
const percent = (v: unknown): number => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.min(Math.round(Number(v) * 10000) / 10000, 100) : 0);

/** Ids: kept when they are one, else made from the position; never two the same in one list. */
function ids<T extends { id: string }>(items: T[], prefix: string): T[] {
  const seen = new Set<string>();
  return items.map((it, i) => {
    let id = /^[\w-]{1,40}$/.test(it.id) ? it.id : `${prefix}${i + 1}`;
    while (seen.has(id)) id = `${id}-${i + 1}`;
    seen.add(id);
    return { ...it, id };
  });
}

function cleanBands(raw: unknown, weight: boolean): RateBand[] {
  const bands = (Array.isArray(raw) ? raw : [])
    .slice(0, MAX_BANDS)
    .map((b: any) => {
      const min = limit(b?.min) ?? 0;
      const max = limit(b?.max);
      // Subtotals are cents, weights any number.
      return { min: weight ? min : Math.round(min), max: max == null ? null : weight ? max : Math.round(max), price: minor(b?.price) };
    })
    .filter((b) => b.max == null || b.max > b.min);
  return bands.sort((a, b) => a.min - b.min);
}

export function cleanRates(raw: unknown): ShippingRate[] {
  const rates = (Array.isArray(raw) ? raw : []).slice(0, MAX_RATES).map((r: any): ShippingRate => {
    const rule: RateRule = r?.rule === 'subtotal' || r?.rule === 'weight' ? r.rule : 'flat';
    const free = limit(r?.freeOver);
    return {
      id: String(r?.id ?? ''),
      name: text(r?.name, 80) || 'Shipping',
      rule,
      price: minor(r?.price),
      bands: rule === 'flat' ? [] : cleanBands(r?.bands, rule === 'weight'),
      freeOver: free == null ? null : Math.round(free),
    };
  });
  return ids(rates, 'r');
}

export function cleanZones(raw: unknown): ShippingZone[] {
  const zones = (Array.isArray(raw) ? raw : []).slice(0, MAX_ZONES).map((z: any): ShippingZone => {
    const places = [...new Set((Array.isArray(z?.places) ? z.places : []).map(cleanPlace).filter((p: string | null): p is string => !!p))] as string[];
    return { id: String(z?.id ?? ''), name: text(z?.name, 80) || 'Zone', places: places.slice(0, 300), rates: cleanRates(z?.rates) };
  });
  return ids(zones, 'z');
}

export function cleanPickup(raw: unknown): PickupLocation[] {
  const locs = (Array.isArray(raw) ? raw : []).slice(0, MAX_PICKUP).map(
    (p: any): PickupLocation => ({
      id: String(p?.id ?? ''),
      name: text(p?.name, 80) || 'Pickup',
      address: lines(p?.address),
      hours: lines(p?.hours, 200),
      fee: minor(p?.fee),
      place: cleanPlace(p?.place) ?? '',
    }),
  );
  return ids(
    locs.map((l) => (l.place === '*' ? { ...l, place: '' } : l)),
    'p',
  );
}

export function cleanTax(raw: any): TaxSettings {
  const seen = new Set<string>();
  const regions: TaxRegion[] = [];
  for (const r of Array.isArray(raw?.regions) ? raw.regions : []) {
    const place = cleanPlace(r?.place);
    if (!place || place === '*' || seen.has(place) || regions.length >= MAX_TAX_REGIONS) continue;
    seen.add(place);
    regions.push({ place, rate: percent(r?.rate) });
  }
  const code = String(raw?.taxCode ?? '').trim();
  return {
    mode: raw?.mode === 'stripe' ? 'stripe' : 'rates',
    rate: percent(raw?.rate),
    regions,
    onShipping: raw?.onShipping === true,
    taxCode: /^txcd_\d{8}$/.test(code) ? code : DEFAULT_TAX_CODE,
  };
}

/** The checkout settings with their defaults, from settings.site.shop. */
export function checkoutSettings(shop: Record<string, any> | null | undefined): CheckoutSettings {
  const s = shop ?? {};
  const hold = Math.round(Number(s.hold));
  return {
    provider: s.provider === 'stripe' || s.provider === 'square' ? s.provider : undefined,
    hold: Number.isFinite(hold) && hold > 0 ? Math.min(120, Math.max(30, hold)) : DEFAULT_HOLD,
    zones: cleanZones(s.zones),
    pickup: cleanPickup(s.pickup),
    tax: cleanTax(s.tax),
    lowStock: s.lowStock === undefined || s.lowStock === null || s.lowStock === '' || !Number.isFinite(Number(s.lowStock)) ? DEFAULT_LOW_STOCK : Math.max(0, Math.min(100_000, Math.trunc(Number(s.lowStock)))),
    lowStockAlerts: s.lowStockAlerts !== false,
    news: {
      lists: [...new Set((Array.isArray(s.news?.lists) ? s.news.lists : []).map((x: unknown) => Math.trunc(Number(x))).filter((n: number) => n > 0))].slice(0, 20) as number[],
      ...(text(s.news?.label, 200) ? { label: text(s.news?.label, 200) } : {}),
    },
  };
}

/**
 * The tax settings in force: Stripe Tax only while payments go through Stripe (`provider`, the one
 * pickProvider resolves to), else the rates set here.
 */
export const taxInForce = (tax: TaxSettings, provider: string | null | undefined): TaxSettings => (tax.mode === 'stripe' && provider !== 'stripe' ? { ...tax, mode: 'rates' } : tax);

/** The checkout settings as saved: only what differs from the defaults. */
export function checkoutSettingsFrom(raw: Record<string, any> | null | undefined): Partial<CheckoutSettings> {
  const c = checkoutSettings(raw);
  const out: Partial<CheckoutSettings> = {};
  if (c.provider) out.provider = c.provider;
  if (c.hold !== DEFAULT_HOLD) out.hold = c.hold;
  if (c.zones.length) out.zones = c.zones;
  if (c.pickup.length) out.pickup = c.pickup;
  const t = c.tax;
  if (t.mode !== 'rates' || t.rate || t.regions.length || t.onShipping || t.taxCode !== DEFAULT_TAX_CODE) out.tax = t;
  if (c.news.lists.length) out.news = c.news;
  if (c.lowStock !== DEFAULT_LOW_STOCK) out.lowStock = c.lowStock;
  if (!c.lowStockAlerts) out.lowStockAlerts = false;
  return out;
}

/** A new id for a zone, rate or location made in the settings screen. */
export const newId = (prefix: string) => `${prefix}${Math.random().toString(36).slice(2, 8)}`;
