// Shop: an optional feature (Settings > Shop, settings.site.shop), off until an admin turns it on. A
// product (the `product` type, src/lib/shop/types.ts) keeps what it sells in its fields under the
// reserved key `shop`: its price, options (Size, Color...) and variants, each with its own price, SKU,
// weight and image. Its stock is kept apart (table shop_stock, per variant), so saving a product never
// overwrites a count. Prices are in minor units (cents). Safe in the browser.
import { checkoutSettingsFrom, type CheckoutSettings } from './checkout-settings';
import { shopEmailsFrom, type ShopEmail, type ShopEmailKind } from './email';
import { orderStatusesFrom, type ShopStatus } from './statuses';
import { byLevel, isActive, type MemberRow } from '../members/config';

/** The shop's blocks: offered in the editor, and shown on the site, only while the shop is on. */
export const SHOP_BLOCKS = ['product-price', 'add-to-cart', 'product-gallery', 'cart', 'cart-link'];

/** The reserved field key a product's shop settings live under. */
export const SHOP_KEY = 'shop';
/** The cart page (a page with that address, else a built-in one). */
export const CART_PATH = '/cart/';
/** The variant of a product with no options. */
export const DEFAULT_VARIANT = 'default';
export const MAX_OPTIONS = 3;
export const MAX_VALUES = 30;
export const MAX_VARIANTS = 100;
/** The most of one line a cart takes, whatever the product allows. */
export const MAX_QUANTITY = 99;
/** The most lines a cart takes. */
export const MAX_LINES = 50;

export const WEIGHT_UNITS: [string, string][] = [
  ['lb', 'Pounds'],
  ['oz', 'Ounces'],
  ['kg', 'Kilograms'],
  ['g', 'Grams'],
];

export interface ShopSettings {
  enabled: boolean;
  /** ISO 4217, upper case (src/lib/payments/money.ts CURRENCIES). */
  currency: string;
  weightUnit: string;
}

/** The shop's settings with their defaults. */
export function shopSettings(site: Record<string, any> | null | undefined): ShopSettings {
  const s = site?.shop ?? {};
  return {
    enabled: s.enabled === true,
    currency: /^[A-Za-z]{3}$/.test(String(s.currency ?? '')) ? String(s.currency).toUpperCase() : 'USD',
    weightUnit: WEIGHT_UNITS.some(([u]) => u === s.weightUnit) ? s.weightUnit : 'lb',
  };
}

type SavedShop = Partial<ShopSettings> & Partial<CheckoutSettings> & { emails?: Partial<Record<ShopEmailKind, ShopEmail>>; notify?: false; statuses?: ShopStatus[] };

/** The shop's settings as saved (Settings > Shop): only what differs from the defaults, the checkout's
 *  (src/lib/shop/checkout-settings.ts) and the emails with them. */
export function shopSettingsFrom(raw: unknown): SavedShop | undefined {
  const s = shopSettings({ shop: raw });
  const out: SavedShop = { ...checkoutSettingsFrom(raw as Record<string, any>) };
  // The order emails (src/lib/shop/email.ts) and whether the shop gets a copy of each order.
  const emails = shopEmailsFrom((raw as any)?.emails);
  if (Object.keys(emails).length) out.emails = emails;
  if ((raw as any)?.notify === false) out.notify = false;
  // The shop's own order statuses (src/lib/shop/statuses.ts).
  const statuses = orderStatusesFrom((raw as any)?.statuses);
  if (statuses.length) out.statuses = statuses;
  if (s.enabled) out.enabled = true;
  if (s.currency !== 'USD') out.currency = s.currency;
  if (s.weightUnit !== 'lb') out.weightUnit = s.weightUnit;
  return Object.keys(out).length ? out : undefined;
}

/** Whether the shop is on. */
export const shopOn = (site: Record<string, any> | null | undefined): boolean => site?.shop?.enabled === true;

export interface ProductOption {
  name: string;
  values: string[];
}

/** One combination of a product's option values. Its own price, compare-at price, SKU, weight and image
 *  replace the product's; empty, the product's are used. */
export interface Variant {
  /** Stable: stock and carts name it. */
  id: string;
  /** One value per option, in the options' order. */
  values: string[];
  price?: number | null;
  compareAt?: number | null;
  sku?: string;
  weight?: number | null;
  /** A media id. */
  image?: number | null;
  /** Not sold (a combination that doesn't exist). */
  off?: boolean;
  /** Its price for active members, by level id (over the product's member price and discount). */
  memberPrices?: Record<string, number>;
  /** Its price while the product's sale runs (over the sale's price and percent off). */
  salePrice?: number | null;
  /** Its members' price while the sale runs, by level id (over the sale's member prices). */
  memberSalePrices?: Record<string, number>;
}

/**
 * A sale: from `start` to `end` (ISO times; either may be empty), every variant sells at its sale price
 * (its own, else `price`, else `percent` off its price) and members of a level at their sale price (the
 * variant's, else `memberPrices`, else `memberDiscounts` percent off its price), each only when lower.
 */
export interface Sale {
  start?: string | null;
  end?: string | null;
  price?: number | null;
  percent?: number | null;
  memberPrices?: Record<string, number>;
  memberDiscounts?: Record<string, number>;
}

export interface Product {
  /** Null: no price yet, not for sale. */
  price: number | null;
  compareAt?: number | null;
  sku?: string;
  weight?: number | null;
  /** Sent by post (default), or not (a service, a gift card picked up). */
  ships: boolean;
  /** Only collected (pickup), never posted. */
  pickupOnly?: boolean;
  /** Taxed (default). */
  taxable: boolean;
  /** The most one order takes; empty: MAX_QUANTITY. */
  maxPerOrder?: number | null;
  /** Count stock (shop_stock); off, there's no limit. */
  trackStock: boolean;
  /** A file buyers download once they have paid (src/lib/shop/downloads.ts), kept privately in the store. */
  download?: ProductDownload | null;
  /** Its low-stock mark: at or under this many left, it is low (the Stock screen, alerts); empty: the shop's. */
  lowStock?: number | null;
  options: ProductOption[];
  variants: Variant[];
  /** Percent off every variant's price for active members, by level id. */
  memberDiscounts?: Record<string, number>;
  /** A fixed price for active members, by level id: every variant's, unless it has its own (over the
   *  level's percent off). */
  memberPrices?: Record<string, number>;
  /** Only active members (of `levels`, or any level when none) may buy it. */
  membersOnly?: boolean;
  levels?: string[];
  sale?: Sale;
  /** More pictures of it (media ids), shown after its featured image by the Product gallery block. */
  gallery?: number[];
}

export const MAX_GALLERY = 30;

/** A product's download: where it is kept (under the store's shop-downloads/ folder), its name and size. */
export interface ProductDownload {
  path: string;
  name: string;
  size: number;
  type: string;
}

/** A download as stored, or null: a path in the folder (no leaving it), a name to save it as. */
export function downloadOf(v: unknown): ProductDownload | null {
  const d = v as Record<string, unknown> | null;
  const path = typeof d?.path === 'string' ? d.path : '';
  if (!/^[a-f0-9]{16}\/[\w.-]{1,120}$/.test(path)) return null;
  return { path, name: String(d!.name ?? '').replace(/[\u0000-\u001f"\\/]/g, '').trim().slice(0, 150) || path.split('/')[1], size: Math.max(0, Math.trunc(Number(d!.size)) || 0), type: String(d!.type ?? '').slice(0, 100) || 'application/octet-stream' };
}

/** A variant as sold: the product's settings where it has none of its own. */
export interface ResolvedVariant {
  id: string;
  values: string[];
  /** "Large / Blue"; '' for a product with no options. */
  label: string;
  price: number | null;
  compareAt: number | null;
  sku: string;
  weight: number | null;
  image: number | null;
  off: boolean;
  memberPrices?: Record<string, number>;
  /** Its price without the sale (`price` is the sale price while one runs). */
  regular: number | null;
  /** On sale now: `price` is below `regular`. */
  sale: boolean;
  /** Its members' sale prices by level, while the sale runs (the variant's over the sale's). */
  memberSalePrices?: Record<string, number>;
  /** The sale's percent off for members, by level, while it runs. */
  memberSaleDiscounts?: Record<string, number>;
}

const cents = (v: unknown): number | null => (v === '' || v == null || !Number.isFinite(Number(v)) || Number(v) < 0 ? null : Math.round(Number(v)));
const text = (v: unknown, max = 120) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const num = (v: unknown): number | null => (v === '' || v == null || !Number.isFinite(Number(v)) || Number(v) < 0 ? null : Number(v));

/** A new variant id. */
export const newVariantId = () => `v${Math.random().toString(36).slice(2, 9)}`;

/** The key of a combination of values (to match variants when the options change). */
const comboKey = (values: string[]) => values.map((v) => v.toLowerCase()).join('\u0001');

/** A product's options, cleaned: named, with distinct values, at most MAX_OPTIONS. */
export function cleanOptions(raw: unknown): ProductOption[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw
    .map((o) => {
      const values: string[] = [];
      for (const v of Array.isArray(o?.values) ? o.values : []) {
        const t = text(v, 60);
        if (t && !values.some((x) => x.toLowerCase() === t.toLowerCase())) values.push(t);
      }
      return { name: text(o?.name, 40), values: values.slice(0, MAX_VALUES) };
    })
    .filter((o) => {
      const key = o.name.toLowerCase();
      if (!o.name || !o.values.length || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_OPTIONS);
}

/** Every combination of the options' values, in order (the first option varying slowest). */
export function combinations(options: ProductOption[]): string[][] {
  return options.reduce<string[][]>((acc, o) => acc.flatMap((c) => o.values.map((v) => [...c, v])), [[]]).slice(0, MAX_VARIANTS);
}

/**
 * The variants for a set of options: one per combination, each keeping the variant it had (its id,
 * price, stock...) when its values are the same, else a new one. No options: the one default variant.
 */
export function variantsFor(options: ProductOption[], existing: Variant[] = [], makeId?: () => string): Variant[] {
  if (!options.length) {
    const own = existing.find((v) => v.id === DEFAULT_VARIANT);
    return [{ ...(own ?? {}), id: DEFAULT_VARIANT, values: [] }];
  }
  const byKey = new Map(existing.filter((v) => v.values.length === options.length).map((v) => [comboKey(v.values), v]));
  const used = new Set<string>();
  return combinations(options).map((values) => {
    const had = byKey.get(comboKey(values));
    // A new combination: a fresh id in the editor, else one made from its values (stable across reads).
    let id = had && had.id !== DEFAULT_VARIANT ? had.id : makeId ? makeId() : comboId(values);
    while (used.has(id)) id = makeId ? makeId() : `${id}x`;
    used.add(id);
    return { ...(had ?? {}), id, values };
  });
}

/** A product's shop settings as stored (fields.shop), cleaned; null when the entry has none. */
export function productOf(fields: Record<string, any> | null | undefined): Product | null {
  const raw = fields?.[SHOP_KEY];
  if (!raw || typeof raw !== 'object') return null;
  const options = cleanOptions(raw.options);
  const variants = (Array.isArray(raw.variants) ? raw.variants : [])
    .filter((v: any) => v && typeof v.id === 'string' && /^[\w-]{1,40}$/.test(v.id))
    .map((v: any): Variant => ({
      id: v.id,
      values: Array.isArray(v.values) ? v.values.map((x: unknown) => text(x, 60)) : [],
      price: cents(v.price),
      compareAt: cents(v.compareAt),
      sku: text(v.sku, 60) || undefined,
      weight: num(v.weight),
      image: Number(v.image) > 0 ? Number(v.image) : null,
      off: v.off === true || undefined,
      memberPrices: memberPricesOf(v.memberPrices),
      salePrice: cents(v.salePrice),
      memberSalePrices: memberPricesOf(v.memberSalePrices),
    }));
  const max = Math.floor(Number(raw.maxPerOrder));
  return {
    price: cents(raw.price),
    compareAt: cents(raw.compareAt),
    sku: text(raw.sku, 60) || undefined,
    weight: num(raw.weight),
    ships: raw.ships !== false,
    pickupOnly: raw.pickupOnly === true || undefined,
    taxable: raw.taxable !== false,
    maxPerOrder: max > 0 ? Math.min(max, MAX_QUANTITY) : null,
    trackStock: raw.trackStock === true,
    download: downloadOf(raw.download),
    lowStock: Number.isFinite(Number(raw.lowStock)) && raw.lowStock !== null && raw.lowStock !== '' ? Math.max(0, Math.min(100_000, Math.trunc(Number(raw.lowStock)))) : null,
    options,
    // The variants that match the options now (a variant for values no longer offered is dropped).
    variants: variantsFor(options, variants),
    memberDiscounts: memberDiscountsOf(raw.memberDiscounts),
    memberPrices: memberPricesOf(raw.memberPrices),
    membersOnly: raw.membersOnly === true || undefined,
    levels: Array.isArray(raw.levels) ? raw.levels.filter((l: unknown) => typeof l === 'string' && /^[\w-]{1,40}$/.test(l)).slice(0, 50) : undefined,
    sale: saleOf(raw.sale),
    gallery: galleryOf(raw.gallery),
  };
}

/** Gallery media ids: distinct, at most MAX_GALLERY; undefined for none. */
const galleryOf = (v: unknown): number[] | undefined => {
  const ids = [...new Set((Array.isArray(v) ? v : []).map((x) => Math.trunc(Number(x))).filter((n) => n > 0))].slice(0, MAX_GALLERY);
  return ids.length ? ids : undefined;
};

/** The pictures the Product gallery shows: the featured image, then the gallery, then variants' own (each once). */
export const productImages = (p: Product | null, featured: number | null | undefined): number[] => [...new Set([Number(featured) || 0, ...(p?.gallery ?? []), ...(p?.variants ?? []).filter((v) => !v.off).map((v) => Number(v.image) || 0)].filter((n) => n > 0))];

const isoTime = (v: unknown): string | null => (typeof v === 'string' && v && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);

/** A sale as stored, cleaned; undefined when it has no prices. */
export function saleOf(v: unknown): Sale | undefined {
  const r = v as Record<string, unknown> | null;
  if (!r || typeof r !== 'object') return undefined;
  const pct = Number(r.percent);
  const sale: Sale = {
    start: isoTime(r.start),
    end: isoTime(r.end),
    price: cents(r.price),
    percent: Number.isFinite(pct) && pct > 0 ? Math.min(100, Math.round(pct * 100) / 100) : null,
    memberPrices: memberPricesOf(r.memberPrices),
    memberDiscounts: memberDiscountsOf(r.memberDiscounts),
  };
  return sale;
}

/** Whether a product's sale runs at `now`: inside its times (an empty one is open). */
export function saleRuns(sale: Sale | undefined, now: Date = new Date()): boolean {
  if (!sale) return false;
  const t = now.getTime();
  return !(sale.start && t < Date.parse(sale.start)) && !(sale.end && t >= Date.parse(sale.end));
}

/** Percent off by level: above 0, at most 100, to two decimals. */
export const memberDiscountsOf = (v: unknown) =>
  byLevel(v, (raw) => {
    const pct = Number(raw);
    return Number.isFinite(pct) && pct > 0 ? Math.min(100, Math.round(pct * 100) / 100) : null;
  });

/** Prices by level, in cents. */
const memberPricesOf = (v: unknown) => byLevel(v, cents);

/** The member level a buyer counts as (an active member's), else null. Takes a Viewer's `member`. */
type Membership = { level: string; status: string; expires_on?: string | null } | null | undefined;
const activeLevel = (m: Membership): string | null => (isActive(m as MemberRow | null | undefined) ? m!.level : null);

/** The percent off a buyer's level takes on a product (0 for everyone else). */
export const memberDiscount = (p: Product, member: Membership) => {
  const level = activeLevel(member);
  return (level && p.memberDiscounts?.[level]) || 0;
};

/**
 * What one of a variant costs a buyer: for an active member, the variant's member price for their level,
 * else the product's, else its price less the level's percent off (the product's, else its categories',
 * `fromCategories`); for everyone else its price. Never more than its price.
 */
export const unitFor = (p: Product, v: ResolvedVariant, member: Membership, fromCategories?: Record<string, number>) => {
  const level = activeLevel(member);
  if (!level) return v.price!;
  // `price` is the sale price while a sale runs; the member price is worked out from the regular price,
  // and the member's sale price (a sale's own for the level) wins when lower.
  const regular = v.regular ?? v.price!;
  const fixed = v.memberPrices?.[level] ?? p.memberPrices?.[level];
  const pct = p.memberDiscounts?.[level] || fromCategories?.[level] || 0;
  const member$ = fixed != null ? fixed : pct ? Math.round((regular * (100 - pct)) / 100) : regular;
  const saleFixed = v.memberSalePrices?.[level];
  const salePct = v.memberSaleDiscounts?.[level];
  const memberSale = saleFixed != null ? saleFixed : salePct ? Math.round((regular * (100 - salePct)) / 100) : Infinity;
  return Math.min(v.price!, member$, memberSale);
};

/** The reserved term field a product category keeps its member discounts under (percent, by level). */
export const CATEGORY_DISCOUNTS_KEY = 'memberDiscounts';

/**
 * The member discounts a product takes from its categories: each category's and those of the categories
 * it sits under, the largest for each level.
 */
export function categoryDiscounts(termIds: number[] | undefined, terms: Map<number, { parent_id?: number | null; fields?: Record<string, any> | null }>): Record<string, number> | undefined {
  const out: Record<string, number> = {};
  const seen = new Set<number>();
  for (const start of termIds ?? []) {
    for (let id: number | null | undefined = start; id && !seen.has(id); id = terms.get(id)?.parent_id) {
      seen.add(id);
      const t = terms.get(id);
      if (!t) break;
      for (const [level, pct] of Object.entries(memberDiscountsOf(t.fields?.[CATEGORY_DISCOUNTS_KEY]) ?? {})) out[level] = Math.max(out[level] ?? 0, pct);
    }
  }
  return Object.keys(out).length ? out : undefined;
}

/** Whether a buyer may buy a product: anyone, or for a members-only one an active member of its levels. */
export const mayBuyProduct = (p: Product, member: Membership) => {
  if (!p.membersOnly) return true;
  const level = activeLevel(member);
  return !!level && (!p.levels?.length || p.levels.includes(level));
};

/** A stable id for a combination stored without one (the same each time it is read). */
function comboId(values: string[]): string {
  let h = 0;
  for (const ch of comboKey(values)) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
  return `c${(h >>> 0).toString(36)}`;
}

/** A variant with the product's settings where it has none of its own, at its sale price while the
 *  product's sale runs at `now` (the regular price, or its compare-at price when higher, struck through). */
export function resolveVariant(p: Product, v: Variant, now: Date = new Date()): ResolvedVariant {
  const regular = v.price ?? p.price;
  const compareAt = v.compareAt ?? p.compareAt ?? null;
  const out: ResolvedVariant = {
    id: v.id,
    values: v.values,
    label: v.values.join(' / '),
    price: regular,
    regular,
    sale: false,
    compareAt,
    sku: v.sku || p.sku || '',
    weight: v.weight ?? p.weight ?? null,
    image: v.image ?? null,
    off: !!v.off,
    memberPrices: v.memberPrices,
  };
  if (regular == null || !saleRuns(p.sale, now)) return out;
  const sale = p.sale!;
  const own = v.salePrice ?? sale.price ?? (sale.percent ? Math.round((regular * (100 - sale.percent)) / 100) : null);
  const memberSalePrices = { ...(sale.memberPrices ?? {}), ...(v.memberSalePrices ?? {}) };
  if (Object.keys(memberSalePrices).length) out.memberSalePrices = memberSalePrices;
  if (sale.memberDiscounts) out.memberSaleDiscounts = sale.memberDiscounts;
  if (own != null && own < regular) {
    out.price = own;
    out.sale = true;
    out.compareAt = Math.max(regular, compareAt ?? 0);
  }
  return out;
}

/** The variants a product sells (switched-off ones and those with no price left out). */
export const sellable = (p: Product, now: Date = new Date()): ResolvedVariant[] => p.variants.map((v) => resolveVariant(p, v, now)).filter((v) => !v.off && v.price != null);

/** A variant by id, as sold; undefined when it isn't (gone, off or without a price). */
export const variantOf = (p: Product, id: string, now: Date = new Date()): ResolvedVariant | undefined => sellable(p, now).find((v) => v.id === id);

/** The lowest and highest price of what a product sells; null when it sells nothing. */
export function priceRange(p: Product): { min: number; max: number } | null {
  const prices = sellable(p).map((v) => v.price!);
  return prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : null;
}

/** The most of a variant one order may take, given what is in stock (null: not counted). */
export const maxQuantity = (p: Product, left: number | null) => Math.max(0, Math.min(p.maxPerOrder || MAX_QUANTITY, left ?? MAX_QUANTITY));
