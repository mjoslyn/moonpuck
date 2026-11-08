// Shop > Stock and low-stock alerts: every variant of the products that count stock, with what is on
// hand, what orders hold and what is left, against its low-stock mark (the product's own, else Settings >
// Shop's, `lowStock`; 0: never low). A sale that takes a variant to its mark emails the shop once
// (`shop_stock.low_alerted_at`); raising the count re-arms it (a trigger, migration
// `*_shop_stock_low.sql`). Server only.
import type { Db } from '../db/query';
import { allRows } from '../rows';
import { sendMail } from '../forms/mail';
import { env } from '../env';
import { site } from '../site';
import { PRODUCT_TYPE } from './types';
import { productOf, resolveVariant } from './config';
import { checkoutSettings } from './checkout-settings';
import { loadHeld, stateOf, type StockRow } from './stock';

export type { StockRow };

/** Every counted variant (of products not in the trash), or those of some products. */
export async function stockRows(db: Db, opts: { products?: number[] } = {}): Promise<StockRow[]> {
  const { data: siteRow } = await db.from('settings').select('value').eq('key', 'site').maybeSingle();
  const settings = checkoutSettings((siteRow?.value as any)?.shop);
  let q = db.from('entries').select('id, title, status, fields').eq('type', PRODUCT_TYPE.type).neq('status', 'trash').order('title').order('id');
  if (opts.products) q = q.in('id', opts.products.length ? opts.products : [0]);
  const { data: entries, error } = await allRows<{ id: number; title: string; status: string; fields: any }>(q);
  if (error) throw error;
  const counted = entries.map((e) => ({ e, p: productOf(e.fields) })).filter((x) => x.p?.trackStock);
  const ids = counted.map((x) => x.e.id);
  const stock = new Map<string, { on_hand: number; low_alerted_at: string | null }>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error: e } = await db.from('shop_stock').select('product_id, variant, on_hand, low_alerted_at').in('product_id', ids.slice(i, i + 200));
    if (e) throw e;
    for (const r of data ?? []) stock.set(`${r.product_id}/${r.variant}`, { on_hand: Number(r.on_hand) || 0, low_alerted_at: r.low_alerted_at });
  }
  const held = await loadHeld(db);
  const rows: StockRow[] = [];
  for (const { e, p } of counted) {
    const mark = p!.lowStock ?? settings.lowStock;
    for (const v of p!.variants) {
      const r = resolveVariant(p!, v);
      const s = stock.get(`${e.id}/${v.id}`);
      const onHand = s?.on_hand ?? 0;
      const h = held.get(e.id)?.[v.id] ?? 0;
      const left = onHand - h;
      rows.push({ product: e.id, title: e.title || '(untitled)', status: e.status, variant: v.id, label: r.label, sku: r.sku ?? '', off: !!r.off, onHand, held: h, left, mark, state: r.off ? 'ok' : stateOf(left, mark), alerted: !!s?.low_alerted_at });
    }
  }
  return rows;
}

const notifyAddress = () => env('SHOP_NOTIFY_EMAIL') || env('FORMS_ADMIN_EMAIL') || site.adminEmail;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * After a sale took stock off (`products`: the order's counted lines' products): the variants now at or
 * under their mark that the shop hasn't been told about, claimed (so two sales at once tell it once) and
 * emailed to the shop. Off under Settings > Shop, nothing is sent. Returns the rows it told the shop of.
 */
export async function alertLowStock(db: Db, products: number[], origin: string): Promise<StockRow[]> {
  if (!products.length) return [];
  const { data: siteRow } = await db.from('settings').select('value').eq('key', 'site').maybeSingle();
  if (!checkoutSettings((siteRow?.value as any)?.shop).lowStockAlerts) return [];
  const low = (await stockRows(db, { products: [...new Set(products)] })).filter((r) => r.state !== 'ok' && !r.alerted && !r.off);
  const told: StockRow[] = [];
  for (const r of low) {
    // Claimed only where it isn't yet (a variant with no row has none to claim: it was never stocked).
    const { data } = await db.from('shop_stock').update({ low_alerted_at: new Date().toISOString() }).eq('product_id', r.product).eq('variant', r.variant).is('low_alerted_at', null).select('product_id');
    if (data?.length) told.push(r);
  }
  const to = notifyAddress();
  if (!told.length || !to) return told;
  const name = (r: StockRow) => `${r.title}${r.label ? ` (${r.label})` : ''}`;
  const rows = told.map((r) => `<tr><td style="padding:6px 12px 6px 0;border-bottom:1px solid #e5e1dc">${esc(name(r))}${r.sku ? ` <span style="color:#64748b">${esc(r.sku)}</span>` : ''}</td><td style="padding:6px 0;border-bottom:1px solid #e5e1dc;text-align:right">${r.state === 'out' ? '<strong>Out of stock</strong>' : `${r.left} left`}</td></tr>`).join('');
  await sendMail({
    to: [to],
    subject: told.length === 1 ? `Low stock: ${name(told[0])}` : `Low stock: ${told.length} items`,
    html: `<p>${told.length === 1 ? 'This is' : 'These are'} at or under ${told.length === 1 ? 'its' : 'their'} low-stock mark after a sale:</p><table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table><p><a href="${esc(`${origin}/admin/shop/stock/?show=low`)}">Open the Stock screen</a></p>`,
    kind: 'shop',
  }).catch((e) => console.error(`shop: low-stock email failed: ${(e as Error).message}`));
  return told;
}
