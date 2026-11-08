// The discounts a buyer may take (server only): the code they typed, or, without one, the automatic
// discounts running now, each checked for its uses (paid orders and unexpired holds, against its limit and,
// once per email, the buyer's own) and its members. Categories are widened to the categories under them.
// What fits the cart is decided by pickDiscount (src/lib/shop/discounts.ts); shop_order_create counts the
// uses again in the statement that makes the order.
import type { Db } from '../db/query';
import { categoryOf } from '../site';
import { isActive, type MemberRow } from '../members/config';
import { cleanCode, running, type Discount } from './discounts';

/** A discount row as the query layer answers it. */
export const asDiscount = (r: any): Discount => ({
  ...r,
  products: Array.isArray(r.products) ? r.products.map(Number) : [],
  categories: Array.isArray(r.categories) ? r.categories.map(Number) : [],
  levels: Array.isArray(r.levels) ? r.levels.map(String) : [],
  value: Number(r.value) || 0,
  min_subtotal: Number(r.min_subtotal) || 0,
});

/** Orders that count as a discount's uses: paid ones and holds not yet expired. */
const usesOf = (db: Db, id: number) =>
  db.from('shop_orders').select('id', { count: 'exact', head: true }).eq('discount_id', id).or(`status.eq.paid,and(status.eq.pending,expires_at.gt.${new Date().toISOString()})`);

/** Why a buyer may not use a discount now (members, uses), or null. */
async function blocked(db: Db, d: Discount, email: string | null, member: MemberRow | null | undefined): Promise<string | null> {
  if (d.members_only && !(isActive(member) && (!d.levels.length || d.levels.includes(member.level)))) return 'This code is for members only. Sign in to use it.';
  if (d.max_uses != null) {
    const { count } = await usesOf(db, d.id);
    if ((count ?? 0) >= d.max_uses) return 'This code has been used up.';
  }
  if (d.once_per_email && email) {
    const { count } = await usesOf(db, d.id).ilike('email', email);
    if (count) return 'You’ve already used this code.';
  }
  return null;
}

/** The product categories' children, to widen a discount's categories to those under them. */
async function widen(db: Db, list: Discount[]): Promise<Discount[]> {
  if (!list.some((d) => d.applies === 'categories')) return list;
  const tax = categoryOf('product')?.[0];
  const { data } = tax ? await db.from('terms').select('id, parent_id').eq('taxonomy', tax) : { data: [] };
  const children = new Map<number, number[]>();
  for (const t of (data ?? []) as { id: number; parent_id: number | null }[]) if (t.parent_id) children.set(t.parent_id, [...(children.get(t.parent_id) ?? []), t.id]);
  return list.map((d) => {
    if (d.applies !== 'categories') return d;
    const all = new Set(d.categories);
    for (const id of [...all]) for (const queue = [id]; queue.length; ) for (const c of children.get(queue.pop()!) ?? []) if (!all.has(c)) (all.add(c), queue.push(c));
    return { ...d, categories: [...all] };
  });
}

/**
 * The discounts this buyer may take: the code's (or why not), else the automatic ones running now. `email`
 * is known at checkout (once-per-email codes are checked then); `member` is the buyer's membership.
 */
export async function discountCandidates(db: Db, input: { code?: string | null; email?: string | null; member?: MemberRow | null }): Promise<{ discounts: Discount[]; code: string | null; problem?: string }> {
  const code = cleanCode(input.code);
  const email = input.email?.trim().toLowerCase() || null;
  if (code) {
    const { data } = await db.from('shop_discounts').select('*').ilike('code', code).maybeSingle();
    if (!data) return { discounts: [], code, problem: 'This code isn’t valid.' };
    const d = asDiscount(data);
    if (!running(d)) return { discounts: [], code, problem: 'This code has expired or isn’t on yet.' };
    const why = await blocked(db, d, email, input.member);
    return why ? { discounts: [], code, problem: why } : { discounts: await widen(db, [d]), code };
  }
  const now = new Date().toISOString();
  const { data } = await db.from('shop_discounts').select('*').is('code', null).eq('active', true);
  const ok: Discount[] = [];
  for (const d of (data ?? []).map(asDiscount)) if (running(d, now) && !(await blocked(db, d, email, input.member))) ok.push(d);
  return { discounts: await widen(db, ok), code: null };
}
