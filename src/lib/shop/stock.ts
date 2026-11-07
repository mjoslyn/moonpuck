// A product's stock (table shop_stock): how many of each variant are left, on hand less what orders
// hold (src/lib/shop/orders.ts). Read by the shop's blocks
// as the page is made, by the availability endpoint for pages that may be a minute old, and by the cart.
// Safe in the browser (the editor reads it too).
import type { Db } from '../db/query';
import type { Product } from './config';

const chunks = (ids: number[], size = 200) => Array.from({ length: Math.ceil(ids.length / size) }, (_, i) => ids.slice(i * size, (i + 1) * size));

/** On-hand counts by product id, then variant id. */
export type StockMap = Map<number, Record<string, number>>;

/**
 * What's left of some products (each one asked for is in the map, with no counts when it has none): on
 * hand less what orders hold (unexpired holds, and paid orders whose stock isn't taken off yet), as
 * shop_order_create counts it.
 */
export async function loadStock(db: Db, ids: number[]): Promise<StockMap> {
  const want = [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))];
  const out: StockMap = new Map(want.map((id) => [id, {}]));
  for (const chunk of chunks(want)) {
    const { data, error } = await db.from('shop_stock').select('product_id, variant, on_hand').in('product_id', chunk);
    if (error) throw error;
    for (const r of data ?? []) out.set(r.product_id, { ...(out.get(r.product_id) ?? {}), [r.variant]: Number(r.on_hand) || 0 });
  }
  if (!want.length) return out;
  const held = await loadHeld(db);
  for (const [id, variants] of held) {
    const counts = out.get(id);
    if (!counts) continue;
    for (const [variant, n] of Object.entries(variants)) counts[variant] = (counts[variant] ?? 0) - n;
  }
  return out;
}

/** What orders hold now, by product and variant: lines whose stock is counted, of unexpired holds and of paid orders not yet taken off. */
export async function loadHeld(db: Db): Promise<Map<number, Record<string, number>>> {
  const { data, error } = await db.from('shop_orders').select('lines').or(`and(status.eq.pending,expires_at.gt.${new Date().toISOString()}),and(status.eq.paid,stock_taken.eq.false)`);
  if (error) throw error;
  const held = new Map<number, Record<string, number>>();
  for (const o of (data ?? []) as { lines: { product: number; variant: string; quantity: number; track?: boolean }[] }[]) {
    for (const l of o.lines ?? []) {
      if (!l.track) continue;
      const v = held.get(Number(l.product)) ?? {};
      v[l.variant] = (v[l.variant] ?? 0) + (Number(l.quantity) || 0);
      held.set(Number(l.product), v);
    }
  }
  return held;
}

/** How many of a variant are left: null when the product doesn't count stock (no limit). */
export function leftOf(p: Product, stock: Record<string, number> | undefined, variant: string): number | null {
  return p.trackStock ? Math.max(0, stock?.[variant] ?? 0) : null;
}
