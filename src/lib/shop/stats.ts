// Shop > Stats: what the shop sold over a range of days (the Stats screen's ranges, src/lib/stats.ts),
// from its paid orders (and those refunded since) by the day they were paid in the site's time zone:
// sales, refunds, orders, items, the average order, discounts, shipping and tax, a bar a day (a week past
// 90 days), the products that sold most, the discounts used, sales by campaign (the utm_ values of the
// buyer's visit), how orders were sent, and checkouts that weren't paid. Server only.
import type { Db } from '../db/query';
import { daysBefore, statsDay, type StatsRange } from '../stats';
import type { ShopOrder } from './orders';

/** Orders read for one range at most: past it the screen says the numbers are cut short. */
export const SHOP_STATS_MAX_ORDERS = 20_000;

type StatsOrder = Pick<ShopOrder, 'id' | 'status' | 'email' | 'lines' | 'subtotal' | 'discount' | 'discount_code' | 'shipping_total' | 'tax' | 'total' | 'refunded_amount' | 'currency' | 'fulfilment' | 'paid_at' | 'created_at' | 'campaign'>;

export interface ShopStats {
  from: string;
  to: string;
  currency: string;
  totals: {
    /** Paid orders (refunded ones included: they were sales once). */
    orders: number;
    /** What buyers paid, before refunds. */
    sales: number;
    refunds: number;
    /** Sales less refunds. */
    net: number;
    items: number;
    average: number;
    discounts: number;
    shipping: number;
    tax: number;
    buyers: number;
    /** Buyers with more than one order in the range. */
    repeat: number;
    /** Checkouts started in the range and never paid (expired or cancelled). */
    unpaid: number;
  };
  /** Every day of the range, oldest first. */
  daily: { day: string; orders: number; sales: number }[];
  /** The products that sold most, by what they brought in (after their share of discounts). */
  products: { product: number; title: string; quantity: number; sales: number }[];
  discounts: { code: string; orders: number; amount: number }[];
  /** Sales by the campaign the buyer's visit came from (utm_ values), most first; orders without one aren't listed. */
  campaigns: { campaign: string; source: string; medium: string; orders: number; sales: number }[];
  /** Orders with a campaign, of `totals.orders`. */
  fromCampaigns: number;
  fulfilment: { ship: number; pickup: number; none: number };
  /** Paid orders in another currency (the shop's was changed): left out of the sums. */
  otherCurrency: number;
  /** More orders than SHOP_STATS_MAX_ORDERS: the numbers are of the first ones. */
  cut: boolean;
}

/** The numbers for a range from its orders (paid and unpaid, any day near it): what the screen shows. */
export function summarizeOrders(orders: StatsOrder[], range: Pick<StatsRange, 'from' | 'to'>, currency: string, tz?: string): Omit<ShopStats, 'cut'> {
  const inRange = (iso: string | null) => {
    if (!iso) return false;
    const d = statsDay(new Date(iso), tz);
    return d >= range.from && d <= range.to;
  };
  const daily = new Map<string, { orders: number; sales: number }>();
  for (let d = range.from; d <= range.to; d = daysBefore(d, -1)) daily.set(d, { orders: 0, sales: 0 });
  const t = { orders: 0, sales: 0, refunds: 0, net: 0, items: 0, average: 0, discounts: 0, shipping: 0, tax: 0, buyers: 0, repeat: 0, unpaid: 0 };
  const products = new Map<string, { product: number; title: string; quantity: number; sales: number }>();
  const discounts = new Map<string, { code: string; orders: number; amount: number }>();
  const fulfilment = { ship: 0, pickup: 0, none: 0 };
  const campaigns = new Map<string, ShopStats['campaigns'][number]>();
  const buyers = new Map<string, number>();
  let otherCurrency = 0;
  for (const o of orders) {
    const paid = (o.status === 'paid' || o.status === 'refunded') && inRange(o.paid_at);
    if (!paid) {
      if ((o.status === 'expired' || o.status === 'cancelled') && !o.paid_at && inRange(o.created_at)) t.unpaid++;
      continue;
    }
    if (o.currency.toUpperCase() !== currency.toUpperCase()) {
      otherCurrency++;
      continue;
    }
    t.orders++;
    t.sales += o.total;
    t.refunds += o.refunded_amount;
    t.discounts += o.discount;
    t.shipping += o.shipping_total;
    t.tax += o.tax;
    const day = daily.get(statsDay(new Date(o.paid_at!), tz));
    if (day) (day.orders++, (day.sales += o.total));
    for (const l of o.lines ?? []) {
      t.items += l.quantity;
      const key = String(l.product);
      const p = products.get(key) ?? { product: l.product, title: l.title, quantity: 0, sales: 0 };
      p.quantity += l.quantity;
      p.sales += l.total - (l.discount ?? 0);
      products.set(key, p);
    }
    if (o.discount) {
      const code = o.discount_code || 'Automatic';
      const d = discounts.get(code) ?? { code, orders: 0, amount: 0 };
      d.orders++;
      d.amount += o.discount;
      discounts.set(code, d);
    }
    fulfilment[o.fulfilment in fulfilment ? o.fulfilment : 'none']++;
    if (o.campaign) {
      const [campaign = '', source = '', medium = ''] = o.campaign.split('|');
      const c = campaigns.get(o.campaign) ?? { campaign, source, medium, orders: 0, sales: 0 };
      c.orders++;
      c.sales += o.total;
      campaigns.set(o.campaign, c);
    }
    const who = o.email.trim().toLowerCase();
    buyers.set(who, (buyers.get(who) ?? 0) + 1);
  }
  t.net = t.sales - t.refunds;
  t.average = t.orders ? Math.round(t.sales / t.orders) : 0;
  t.buyers = buyers.size;
  t.repeat = [...buyers.values()].filter((n) => n > 1).length;
  return {
    from: range.from,
    to: range.to,
    currency,
    totals: t,
    daily: [...daily].map(([day, v]) => ({ day, ...v })),
    products: [...products.values()].sort((a, b) => b.sales - a.sales || b.quantity - a.quantity).slice(0, 50),
    discounts: [...discounts.values()].sort((a, b) => b.amount - a.amount),
    campaigns: [...campaigns.values()].sort((a, b) => b.sales - a.sales || b.orders - a.orders),
    fromCampaigns: [...campaigns.values()].reduce((n, c) => n + c.orders, 0),
    fulfilment,
    otherCurrency,
  };
}

/** The shop's numbers for a range, read as the signed-in editor. */
export async function shopStats(db: Db, range: Pick<StatsRange, 'from' | 'to'>, currency: string, tz?: string): Promise<ShopStats> {
  // A day either side, so every order paid or made on the range's days (in any time zone) is read.
  const start = new Date(`${daysBefore(range.from, 1)}T00:00:00Z`).toISOString();
  const end = new Date(`${daysBefore(range.to, -2)}T00:00:00Z`).toISOString();
  const { data, error } = await db
    .from('shop_orders')
    .select('id, status, email, lines, subtotal, discount, discount_code, shipping_total, tax, total, refunded_amount, currency, fulfilment, paid_at, created_at, campaign')
    .or(`and(paid_at.gte.${start},paid_at.lt.${end}),and(paid_at.is.null,created_at.gte.${start},created_at.lt.${end})`)
    .order('id')
    .limit(SHOP_STATS_MAX_ORDERS + 1);
  if (error) throw error;
  const rows = (data ?? []) as StatsOrder[];
  return { ...summarizeOrders(rows.slice(0, SHOP_STATS_MAX_ORDERS), range, currency, tz), cut: rows.length > SHOP_STATS_MAX_ORDERS };
}
