// The shop's discounts (table shop_discounts; Shop > Discounts): a code a buyer types, or automatic; percent
// off, an amount off or free shipping; on the whole order or some products or product categories (and the
// categories under them); with a minimum subtotal, dates, a total number of uses, once per email, and
// members only. One per order: a code that fits, else the automatic one that saves the most. Which one fits
// a cart, and what it takes off, is worked out here (safe in the browser); finding them and counting uses
// is the server's (src/lib/shop/orders.ts, shop_order_create).
import { formatMoney } from '../payments/money';

export type DiscountKind = 'percent' | 'amount' | 'free_shipping';
export type DiscountApplies = 'all' | 'products' | 'categories';

export interface Discount {
  id: number;
  /** Null: automatic. */
  code: string | null;
  name: string;
  kind: DiscountKind;
  /** Percent off (0-100), or an amount off in cents; unused for free shipping. */
  value: number;
  applies: DiscountApplies;
  /** Product ids, for `products`. */
  products: number[];
  /** Product category term ids, for `categories` (with the categories under them, once expanded). */
  categories: number[];
  /** The cart's subtotal it needs, in cents. */
  min_subtotal: number;
  starts_at: string | null;
  ends_at: string | null;
  /** Uses in all (paid orders and unexpired holds); null: no limit. */
  max_uses: number | null;
  once_per_email: boolean;
  members_only: boolean;
  /** Levels that may use a members-only one; none: any level. */
  levels: string[];
  active: boolean;
}

/** What a discount needs of a cart line. */
export interface DiscountLine {
  product: number;
  total: number;
  /** The product's terms (its categories among them). */
  terms?: number[];
}

/** A discount as it applies to a cart. */
export interface AppliedDiscount {
  discount: Discount;
  /** What it takes off the lines (0 for free shipping). */
  amount: number;
  /** The lines it applies to. */
  lines: boolean[];
  freeShipping: boolean;
  /** What it saves, shipping included: how automatic ones are compared. */
  saving: number;
}

const ints = (v: unknown, max = 500) => [...new Set((Array.isArray(v) ? v : []).map((x) => Math.trunc(Number(x))).filter((n) => n > 0))].slice(0, max);
const when = (v: unknown) => {
  const s = String(v ?? '').trim();
  return s && !Number.isNaN(Date.parse(s)) ? new Date(s).toISOString() : null;
};

/** A code as kept: letters, digits, dashes and underscores, upper case. */
export const cleanCode = (v: unknown) => String(v ?? '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 40);

/** A discount as saved from Shop > Discounts, cleaned to known shapes; an error message when it can't be. */
export function cleanDiscount(raw: any): Omit<Discount, 'id'> | string {
  const kind: DiscountKind = raw?.kind === 'amount' || raw?.kind === 'free_shipping' ? raw.kind : 'percent';
  const applies: DiscountApplies = raw?.applies === 'products' || raw?.applies === 'categories' ? raw.applies : 'all';
  const automatic = raw?.automatic === true;
  const code = automatic ? null : cleanCode(raw?.code);
  if (!automatic && !code) return 'Give the discount a code, or make it automatic.';
  const n = Number(raw?.value);
  const value = kind === 'free_shipping' ? 0 : kind === 'percent' ? Math.min(100, Math.max(0, Math.round(n * 100) / 100 || 0)) : Math.max(0, Math.round(n) || 0);
  if (kind !== 'free_shipping' && !value) return kind === 'percent' ? 'Give the percent off.' : 'Give the amount off.';
  const products = applies === 'products' ? ints(raw?.products) : [];
  const categories = applies === 'categories' ? ints(raw?.categories) : [];
  if (applies === 'products' && !products.length) return 'Choose the products it applies to.';
  if (applies === 'categories' && !categories.length) return 'Choose the categories it applies to.';
  const starts_at = when(raw?.starts_at);
  const ends_at = when(raw?.ends_at);
  if (starts_at && ends_at && ends_at <= starts_at) return 'It has to end after it starts.';
  const max = Math.trunc(Number(raw?.max_uses));
  return {
    code,
    name: String(raw?.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 120),
    kind,
    value,
    applies,
    products,
    categories,
    min_subtotal: Math.max(0, Math.round(Number(raw?.min_subtotal)) || 0),
    starts_at,
    ends_at,
    max_uses: max > 0 ? max : null,
    once_per_email: raw?.once_per_email === true,
    members_only: raw?.members_only === true,
    levels: raw?.members_only === true ? [...new Set((Array.isArray(raw?.levels) ? raw.levels : []).map((l: unknown) => String(l)).filter((l: string) => /^[\w-]{1,40}$/.test(l)))].slice(0, 50) as string[] : [],
    active: raw?.active !== false,
  };
}

/** What a discount is called to the buyer: its name, else its code, else what it does. */
export const discountLabel = (d: Pick<Discount, 'name' | 'code' | 'kind' | 'value'>) => d.name || d.code || (d.kind === 'free_shipping' ? 'Free shipping' : d.kind === 'percent' ? `${d.value}% off` : 'Discount');

/** Whether a discount is running at `now` (active, and within its dates). */
export const running = (d: Pick<Discount, 'active' | 'starts_at' | 'ends_at'>, now = new Date().toISOString()) => d.active && (!d.starts_at || d.starts_at <= now) && (!d.ends_at || d.ends_at > now);

/** The lines a discount applies to. */
export function eligible(d: Discount, lines: DiscountLine[]): boolean[] {
  if (d.applies === 'products') return lines.map((l) => d.products.includes(l.product));
  if (d.applies === 'categories') return lines.map((l) => (l.terms ?? []).some((t) => d.categories.includes(t)));
  return lines.map(() => true);
}

/**
 * What a discount takes off a cart, or why it doesn't: `subtotal` is the cart's, `shipping` the price of
 * the shipping option chosen (what free shipping saves).
 */
export function applyDiscount(d: Discount, lines: DiscountLine[], subtotal: number, shipping: number, now = new Date().toISOString(), currency = 'USD'): AppliedDiscount | { problem: string } {
  if (!running(d, now)) return { problem: 'This code has expired or isn’t on yet.' };
  if (subtotal < d.min_subtotal) return { problem: `This code needs an order of at least ${formatMoney(d.min_subtotal, currency)}.` };
  const mask = eligible(d, lines);
  if (d.kind === 'free_shipping') return { discount: d, amount: 0, lines: mask, freeShipping: true, saving: shipping };
  const base = lines.reduce((n, l, i) => n + (mask[i] ? Math.max(0, l.total) : 0), 0);
  if (!base) return { problem: 'This code doesn’t apply to anything in your cart.' };
  const amount = d.kind === 'percent' ? Math.round((base * d.value) / 100) : Math.min(Math.round(d.value), base);
  return { discount: d, amount, lines: mask, freeShipping: false, saving: amount };
}

/**
 * The discount an order takes: the code's, when it fits (else its problem), and without one the automatic
 * discount that saves the most. `candidates`: the code's discount, or the automatic ones, as the server
 * found them for this buyer (uses and membership already checked).
 */
export function pickDiscount(candidates: Discount[], code: string | null, lines: DiscountLine[], subtotal: number, shipping: number, now?: string, currency?: string): { applied: AppliedDiscount | null; problem?: string } {
  if (code) {
    const d = candidates.find((c) => c.code && c.code.toUpperCase() === code.toUpperCase());
    if (!d) return { applied: null };
    const r = applyDiscount(d, lines, subtotal, shipping, now, currency);
    return 'problem' in r ? { applied: null, problem: r.problem } : { applied: r };
  }
  let best: AppliedDiscount | null = null;
  for (const d of candidates.filter((c) => !c.code)) {
    const r = applyDiscount(d, lines, subtotal, shipping, now);
    if (!('problem' in r) && r.saving > 0 && (!best || r.saving > best.saving)) best = r;
  }
  return { applied: best };
}
