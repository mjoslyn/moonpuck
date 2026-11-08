// The cart, priced by the server (POST /api/shop/quote): the visitor's browser keeps the cart (its
// products, variants and quantities: public/assets/js/cart.js), so pages stay cached and shared, and
// the server says what each line costs now, what is left and what can no longer be had. What it says
// is what a checkout will charge. Server only.
import type { Db } from '../db/query';
import { Loader, type LoaderScope } from '../data';
import { downsize, mediaUrl } from '../media/image';
import { permalink } from '../permalink';
import { MAX_LINES, MAX_QUANTITY, categoryDiscounts, mayBuyProduct, maxQuantity, productOf, shopSettings, unitFor, variantOf } from './config';
import { categoryOf } from '../site';
import { leftOf, loadStock } from './stock';

/** A line of the cart as the browser keeps it. */
export interface CartLine {
  product: number;
  variant: string;
  quantity: number;
}

/** A line as priced now. `problem`: gone (no longer sold), sold-out, or fewer (cut to what is left). */
export interface QuoteLine extends CartLine {
  title: string;
  /** The variant's options ("Large / Blue"), or ''. */
  label: string;
  url: string;
  image: string | null;
  sku: string;
  unit: number;
  total: number;
  /** The most this line can take now. */
  max: number;
  /** The price before the buyer's member discount, when they have one. */
  listUnit?: number;
  /** For totals (src/lib/shop/totals.ts). */
  ships: boolean;
  pickupOnly: boolean;
  taxable: boolean;
  weight: number | null;
  /** Its stock is counted (an order holds it). */
  track: boolean;
  /** The product's terms (its categories among them), for discounts on categories. */
  terms: number[];
  /** The product's download, if it has one (src/lib/shop/downloads.ts). */
  download?: { path: string; name: string } | null;
  /** gone: no longer sold; sold-out; fewer: cut to what is left; members-only: not for this buyer. */
  problem?: 'gone' | 'sold-out' | 'fewer' | 'members-only';
}

export interface Quote {
  lines: QuoteLine[];
  /** Items in the cart (lines that can be had). */
  count: number;
  subtotal: number;
  currency: string;
}

/** A cart as the browser sent it, cleaned: known shapes, one line per variant, quantities 1-99. */
export function cleanCart(raw: unknown): CartLine[] {
  const lines = new Map<string, CartLine>();
  for (const l of Array.isArray(raw) ? raw : []) {
    const product = Math.floor(Number(l?.product));
    const variant = String(l?.variant ?? '');
    const quantity = Math.floor(Number(l?.quantity));
    if (!(product > 0) || !/^[\w-]{1,40}$/.test(variant) || !(quantity > 0)) continue;
    const key = `${product}:${variant}`;
    const had = lines.get(key);
    lines.set(key, { product, variant, quantity: Math.min(MAX_QUANTITY, (had?.quantity ?? 0) + quantity) });
    if (lines.size >= MAX_LINES) break;
  }
  return [...lines.values()];
}

/**
 * The cart priced now, as `scope`'s viewer sees the site (members-only products only for their
 * members). Lines that can't be had keep their place with a problem and no total.
 */
export async function quoteCart(db: Db, raw: unknown, scope: LoaderScope, site: Record<string, any> | null | undefined): Promise<Quote> {
  const cart = cleanCart(raw);
  // Editors see members-only products but pay as anyone does.
  const member = scope.viewer?.member;
  const loader = new Loader(db, undefined, scope);
  const entries = new Map((await loader.entriesByIds(cart.map((l) => l.product))).filter((e) => e.type === 'product').map((e) => [e.id, e]));
  const stock = await loadStock(db, [...entries.keys()]);
  const products = new Map([...entries].map(([id, e]) => [id, productOf(e.fields)]));
  // The member discounts of the products' categories, read only for a member.
  const categories = member ? await categoryTerms(db) : null;
  const fromCategories = (id: number) => (categories ? categoryDiscounts(entries.get(id)?.term_ids?.filter((t) => categories.has(t)), categories) : undefined);
  const images = cart.map((l) => {
    const p = products.get(l.product);
    return (p && variantOf(p, l.variant)?.image) || entries.get(l.product)?.featured_media_id || 0;
  });
  await loader.loadMedia(images.filter((n) => n > 0));
  const lines: QuoteLine[] = cart.map((l, i) => {
    const e = entries.get(l.product);
    const p = products.get(l.product);
    const v = p ? variantOf(p, l.variant) : undefined;
    const m = images[i] ? loader.media.get(images[i]) : undefined;
    const unit = p && v ? unitFor(p, v, member, fromCategories(l.product)) : 0;
    const base = {
      ...l,
      title: e?.title ?? '',
      label: v?.label ?? '',
      url: e ? permalink(e) : '',
      image: m ? mediaUrl(downsize(m, 'thumbnail').path) : null,
      sku: v?.sku ?? '',
      unit,
      ...(v && unit !== v.price ? { listUnit: v.price! } : {}),
      total: 0,
      max: 0,
      ships: !!p?.ships,
      pickupOnly: !!p?.pickupOnly,
      taxable: !!p?.taxable,
      weight: v?.weight ?? null,
      track: !!p?.trackStock,
      terms: e?.term_ids ?? [],
      ...(p?.download ? { download: { path: p.download.path, name: p.download.name } } : {}),
    };
    if (!e || !p || !v) return { ...base, quantity: 0, problem: 'gone' };
    if (!mayBuyProduct(p, member)) return { ...base, quantity: 0, problem: 'members-only' };
    const max = maxQuantity(p, leftOf(p, stock.get(l.product), l.variant));
    if (!max) return { ...base, quantity: 0, problem: 'sold-out' };
    const quantity = Math.min(l.quantity, max);
    return { ...base, quantity, max, total: quantity * unit, ...(quantity < l.quantity ? { problem: 'fewer' as const } : {}) };
  });
  return {
    lines,
    count: lines.reduce((n, l) => n + l.quantity, 0),
    subtotal: lines.reduce((n, l) => n + l.total, 0),
    currency: shopSettings(site).currency,
  };
}

/** The products' category terms (the product type's main taxonomy), with their parents and fields. */
async function categoryTerms(db: Db) {
  const tax = categoryOf('product')?.[0];
  if (!tax) return new Map();
  const { data } = await db.from('terms').select('id, parent_id, fields').eq('taxonomy', tax);
  return new Map((data ?? []).map((t: any) => [t.id as number, t]));
}
