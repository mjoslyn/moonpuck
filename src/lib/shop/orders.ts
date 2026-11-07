// Shop orders (table shop_orders): a checkout from the cart (POST /api/shop/checkout), the buyer coming
// back from paying (/api/shop/return), the providers' webhooks (shopWebhook), holds expiring (the hourly
// run) and the order emails. The cart is priced again here, as the visitor sees the site, with the
// address and shipping option they chose (src/lib/shop/cart.ts, totals.ts): what the cart showed is what
// is charged. Server only.
import type { Db } from '../db/query';
import { serviceClient } from '../db/site';
import { isActive, type Viewer } from '../members/config';
import { offTypes, featuresOf } from '../features';
import { PROVIDERS, closeCheckout, pickProvider, providerOf, type CheckoutState, type PaymentEvent, type PaymentProvider } from '../payments';
import { MIN_CHARGE, formatMoney } from '../payments/money';
import { sendMail } from '../forms/mail';
import { site } from '../site';
import { env } from '../env';
import { esc } from '../../render/html';
import { buyerAddress, newCode, newToken, siteOrigin } from '../tickets/orders';
import { CART_PATH, shopOn, shopSettings } from './config';
import { quoteCart, type QuoteLine } from './cart';
import { checkoutSettings, taxInForce } from './checkout-settings';
import { cleanPlace, placeName, US_STATES } from './places';
import { cartTotals, type ShipOption } from './totals';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Orders the shop takes in a minute (all buyers together), against floods. */
const MAX_PER_MINUTE = 30;
/** Orders not paid for in an hour by one buyer (by address and by email): holds need no payment. */
const BUYER_ORDERS_PER_HOUR = 5;
/** Stripe's tax code for shipping. */
const SHIPPING_TAX_CODE = 'txcd_92010001';
/** Stripe's tax code for what isn't taxed. */
const NONTAXABLE_TAX_CODE = 'txcd_00000000';

export type OrderStatus = 'pending' | 'paid' | 'cancelled' | 'expired' | 'refunded';

/** A line as an order keeps it: what was bought, at what price. */
export interface OrderLine {
  product: number;
  variant: string;
  title: string;
  label: string;
  sku: string;
  unit: number;
  quantity: number;
  total: number;
  discount: number;
  tax: number;
  /** Its stock is counted (held, then taken off when paid). */
  track: boolean;
  /** How many went back to stock (refunds, cancels). */
  restocked: number;
}

export interface ShopAddress {
  line1: string;
  line2?: string;
  city: string;
  /** A US state's code, or a region's name elsewhere. */
  state?: string;
  zip: string;
  /** ISO 3166-1 alpha-2. */
  country: string;
}

export interface ShopOrder {
  id: number;
  token: string;
  code: string;
  status: OrderStatus;
  provider: 'free' | PaymentProvider;
  provider_ref: string | null;
  provider_order: string | null;
  provider_payment: string | null;
  name: string;
  email: string;
  phone: string;
  address: ShopAddress | null;
  fulfilment: 'none' | 'ship' | 'pickup';
  shipping: ShipOption | null;
  lines: OrderLine[];
  quantity: number;
  subtotal: number;
  discount: number;
  shipping_total: number;
  tax: number;
  tax_by: 'site' | 'stripe';
  total: number;
  currency: string;
  refunded_amount: number;
  stock_taken: boolean;
  fulfilled: '' | 'shipped' | 'picked_up';
  tracking: string;
  notes: string;
  note: string;
  member_id: string | null;
  expires_at: string | null;
  paid_at: string | null;
  emailed_at: string | null;
  created_at: string;
}

/** What a checkout answers the cart's script: where to go next, or why not (with the cart priced again). */
export type CheckoutResult = { redirect: string } | { error: CheckoutError; message: string; line?: { product: number; variant: string; left: number } };

export type CheckoutError = 'closed' | 'invalid' | 'empty' | 'changed' | 'sold-out' | 'shipping' | 'address' | 'below-minimum' | 'payments-off' | 'limit' | 'busy' | 'payment-error';

const MESSAGES: Record<CheckoutError, string> = {
  closed: 'The shop is closed.',
  invalid: 'Check your name and email.',
  empty: 'Your cart is empty.',
  changed: 'Your cart changed: some items are sold out, no longer sold or fewer are left. Check it and try again.',
  'sold-out': 'Something in your cart sold out just now. Check it and try again.',
  shipping: 'Choose how to get your order.',
  address: 'Check your address.',
  'below-minimum': `An order has to come to at least ${formatMoney(MIN_CHARGE)} to be paid online.`,
  'payments-off': "The shop can't take payments right now.",
  limit: 'Too many orders were started from here. Try again in an hour.',
  busy: 'The shop is busy. Try again in a minute.',
  'payment-error': "The payment page couldn't be opened. Try again.",
};
const fail = (error: CheckoutError, extra: Partial<Extract<CheckoutResult, { error: string }>> = {}): CheckoutResult => ({ error, message: MESSAGES[error], ...extra });

const text = (v: unknown, max = 300) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** An address as posted, cleaned: a country code, a US state's code; null when it lacks a line, city or postal code. */
export function cleanAddress(raw: any): ShopAddress | null {
  const country = /^[A-Za-z]{2}$/.test(String(raw?.country ?? '')) ? cleanPlace(raw.country) : null;
  if (!country || country === '*') return null;
  const state = text(raw?.state, 100);
  const a: ShopAddress = { line1: text(raw?.line1), line2: text(raw?.line2) || undefined, city: text(raw?.city, 100), state: state || undefined, zip: text(raw?.zip, 20), country };
  if (country === 'US') {
    const code = state.toUpperCase();
    if (!US_STATES.some(([c]) => c === code)) return null;
    a.state = code;
  }
  return a.line1 && a.city && a.zip ? a : null;
}

/** An address on lines, for emails and the order page. */
export const addressLines = (a: ShopAddress | null | undefined): string[] =>
  a ? [a.line1, a.line2, [a.city, [a.state, a.zip].filter(Boolean).join(' ')].filter(Boolean).join(', '), placeName(a.country)].filter((x): x is string => !!x) : [];

async function siteSettings(db: Db) {
  const { data } = await db.from('settings').select('value').eq('key', 'site').maybeSingle();
  return (data?.value ?? {}) as Record<string, any>;
}

/** Expired holds: marked expired, and their checkouts closed (Square's payment links don't expire). */
export async function expireShopHolds(db: Db = serviceClient()) {
  const { data } = await db.from('shop_orders').update({ status: 'expired' }).eq('status', 'pending').lt('expires_at', new Date().toISOString()).select('id, provider, provider_ref');
  for (const o of data ?? []) await closeCheckout(o.provider, o.provider_ref).catch((e) => console.warn(`shop: closing checkout of order ${o.id}: ${(e as Error).message}`));
}

/**
 * A checkout from the cart: the cart priced again, the shipping option and address checked, the order
 * made against the stock (shop_order_create), then the provider's checkout (or, for nothing to pay,
 * paid at once). `body`: { lines, name, email, phone, option, address }.
 */
export async function startShopCheckout(body: any, origin: string, viewer: Viewer | null = null, ip = ''): Promise<CheckoutResult> {
  const db = serviceClient();
  const siteValue = await siteSettings(db);
  if (!shopOn(siteValue)) return fail('closed');
  if (text(body?._hp)) return fail('invalid');
  const name = text(body?.name, 200);
  const email = text(body?.email, 254);
  const phone = text(body?.phone, 40);
  if (!name || !EMAIL.test(email)) return fail('invalid');

  const quote = await quoteCart(db, body?.lines, { published: true, viewer, off: offTypes(featuresOf(siteValue)) }, siteValue);
  if (!quote.lines.length) return fail('empty');
  // Anything the cart showed differently (gone, sold out, fewer, members only): the buyer looks again.
  if (quote.lines.some((l) => l.problem)) return fail('changed');
  if (!quote.count) return fail('empty');

  const settings = checkoutSettings(siteValue.shop);
  const providerName = pickProvider(settings.provider);
  const tax = taxInForce(settings.tax, providerName);
  const address = body?.address ? cleanAddress(body.address) : null;
  // Rates and tax come from the country and state even when the rest of the address is missing, so a
  // half-written address says so rather than seeming to have no rates.
  const country = /^[A-Za-z]{2}$/.test(String(body?.address?.country ?? '')) ? String(body.address.country).toUpperCase() : '';
  const destination = address ?? (country ? { country, state: String(body?.address?.state ?? '').toUpperCase() || undefined } : null);
  const { shipping, chosen, totals } = await cartTotals(quote, { ...settings, tax }, { destination, option: typeof body?.option === 'string' ? body.option : null });
  if (shipping.problem) return fail('shipping');
  if (shipping.needs !== 'none' && !chosen) return fail('shipping');
  if (chosen?.kind === 'ship' && !address) return fail('address');

  const total = totals.total;
  if (total > 0 && total < MIN_CHARGE) return fail('below-minimum');
  if (total > 0 && !providerName) return fail('payments-off');
  const { count } = await db.from('shop_orders').select('id', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 60_000).toISOString());
  if ((count ?? 0) >= MAX_PER_MINUTE) return fail('busy');
  await expireShopHolds(db).catch((e) => console.warn(`shop: expiring holds: ${e.message}`));

  const free = total === 0;
  const token = newToken();
  const code = newCode();
  const hold = settings.hold * 60_000;
  const currency = shopSettings(siteValue).currency;
  const member = viewer?.member ?? null;
  const lines: OrderLine[] = quote.lines.map((l: QuoteLine, i) => ({
    product: l.product, variant: l.variant, title: l.title, label: l.label, sku: l.sku, unit: l.unit, quantity: l.quantity, total: l.total,
    discount: totals.lineDiscounts[i] ?? 0, tax: totals.lineTax[i] ?? 0, track: l.track, restocked: 0,
  }));
  const { data: made, error } = await db.rpc('shop_order_create', {
    p_order: {
      token, code, status: free ? 'paid' : 'pending', provider: free ? 'free' : providerName, name, email, phone,
      // An address only when the order is posted.
      address: chosen?.kind === 'ship' ? address : null, fulfilment: chosen ? chosen.kind : 'none', shipping: chosen, lines,
      subtotal: totals.subtotal, discount: totals.discount, shipping_total: totals.shipping, tax: totals.tax ?? 0, total,
      currency, member_id: isActive(member) ? member.user_id : null, ip: buyerAddress(ip),
      // A paid order holds its stock a little longer than its checkout takes payment.
      expires_at: free ? null : new Date(Date.now() + hold + 2 * 60_000).toISOString(),
      paid_at: free ? new Date().toISOString() : null,
    },
    p_limits: { client: { orders: BUYER_ORDERS_PER_HOUR } },
  });
  if (error) throw error;
  if (made?.client) return fail('limit');
  if (!made?.ok) return fail('sold-out', made?.line ? { line: made.line } : {});
  if (tax.mode === 'stripe') await db.from('shop_orders').update({ tax_by: 'stripe' }).eq('id', made.id);
  const orderPage = `${CART_PATH}?order=${token}`;
  if (free) {
    await afterPaid(db, made.id, origin);
    return { redirect: orderPage };
  }
  try {
    const returnUrl = `${origin}/api/shop/return?order=${token}`;
    const items = lines.map((l) => ({ name: l.label ? `${l.title} (${l.label})` : l.title, unit: l.unit, quantity: l.quantity, ...(tax.mode === 'stripe' && !quote.lines.find((q) => q.product === l.product && q.variant === l.variant)?.taxable ? { taxCode: NONTAXABLE_TAX_CODE } : {}) }));
    if (totals.shipping > 0) items.push({ name: `${chosen?.kind === 'pickup' ? 'Pickup' : 'Shipping'}: ${chosen?.name ?? ''}`, unit: totals.shipping, quantity: 1, ...(tax.mode === 'stripe' ? { taxCode: SHIPPING_TAX_CODE } : {}) });
    if ((totals.tax ?? 0) > 0) items.push({ name: 'Tax', unit: totals.tax!, quantity: 1 });
    const checkout = await PROVIDERS[providerName!].create({
      reference: code,
      idempotencyKey: `shop-checkout-${token}`,
      email,
      currency,
      items: items.filter((i) => i.unit > 0),
      description: `${site.name} order ${code}`,
      returnUrl,
      cancelUrl: `${returnUrl}&cancel=1`,
      expiresAt: new Date(Date.now() + hold),
      ...(tax.mode === 'stripe' ? { taxCode: tax.taxCode } : {}),
    });
    await db.from('shop_orders').update({ provider_ref: checkout.ref, provider_order: checkout.order ?? null }).eq('id', made.id);
    return { redirect: checkout.url };
  } catch (e) {
    console.error(`shop: checkout for order ${code} failed: ${(e as Error).message}`);
    await db.from('shop_orders').update({ status: 'cancelled' }).eq('id', made.id).eq('status', 'pending');
    return fail('payment-error');
  }
}

/** Where an order's payment stands at its provider. */
async function paymentState(o: Pick<ShopOrder, 'provider' | 'provider_ref' | 'provider_order'>): Promise<CheckoutState> {
  const p = providerOf(o.provider);
  return p && o.provider_ref ? p.check({ ref: o.provider_ref, order: o.provider_order }) : { status: 'pending' };
}

/** Orders not paid for (yet) whose checkout can still turn out paid. */
const UNPAID: OrderStatus[] = ['pending', 'expired', 'cancelled'];

/**
 * Mark an order paid, once (a webhook and the buyer's return can both get here), only once its provider
 * says so: its stock taken off and its emails sent. An order cancelled or expired before the payment came
 * in is marked paid too, since the money was taken, with a note: its stock may have gone to someone else
 * meanwhile (an admin can refund it). With Stripe Tax, the tax Stripe added is recorded.
 */
export async function markShopPaid(db: Db, order: Pick<ShopOrder, 'id'>, state: Pick<CheckoutState, 'paymentId' | 'amount' | 'tax'> = {}, origin?: string) {
  const at = new Date().toISOString();
  for (const was of UNPAID) {
    const note = was === 'pending' ? {} : { note: `Paid after the order was ${was}: its stock had been let go, so it may be oversold. Refund it if it can't be filled.` };
    const { data } = await db
      .from('shop_orders')
      .update({ status: 'paid', paid_at: at, ...(state.paymentId ? { provider_payment: state.paymentId } : {}), ...note })
      .eq('id', order.id)
      .eq('status', was)
      .select('id, code, tax_by, total, tax')
      .maybeSingle<Pick<ShopOrder, 'id' | 'code' | 'tax_by' | 'total' | 'tax'>>();
    if (data) {
      if (was !== 'pending') console.warn(`shop: order ${data.code} paid after it was ${was}`);
      // Stripe Tax: what was charged is the total with the tax Stripe added.
      if (data.tax_by === 'stripe' && state.tax) await db.from('shop_orders').update({ tax: state.tax, total: data.total + state.tax }).eq('id', data.id);
      await afterPaid(db, data.id, origin);
      return;
    }
  }
}

/** A paid order's stock taken off and its emails sent (each once). */
async function afterPaid(db: Db, id: number, origin?: string) {
  const { error } = await db.rpc('shop_take_stock', { p_id: id });
  if (error) console.error(`shop: taking stock for order ${id}: ${error.message}`);
  const { data: claimed } = await db.from('shop_orders').update({ emailed_at: new Date().toISOString() }).eq('id', id).is('emailed_at', null).select('*').maybeSingle<ShopOrder>();
  if (claimed) await sendOrderEmails(claimed, siteOrigin(origin)).catch((e) => console.error(`shop: emails for order ${claimed.code}: ${(e as Error).message}`));
}

/** The buyer back from the provider (/api/shop/return): the order checked, and the address of its page. */
export async function returnFromShopCheckout(token: string, cancelled: boolean, origin?: string): Promise<string | null> {
  const db = serviceClient();
  const { data: order } = await db.from('shop_orders').select('*').eq('token', token).maybeSingle<ShopOrder>();
  if (!order) return null;
  if (cancelled && order.status === 'pending') {
    // Paid after all (back pressed after paying): kept. Cancelled only when the provider says it isn't paid.
    const state = await paymentState(order).catch((e): null => (console.warn(`shop: checking order ${order.code}: ${(e as Error).message}`), null));
    if (state?.status === 'paid') await markShopPaid(db, order, state, origin);
    else if (state && state.status !== 'processing') {
      await closeCheckout(order.provider, order.provider_ref);
      await db.from('shop_orders').update({ status: 'cancelled' }).eq('id', order.id).eq('status', 'pending');
      return `${CART_PATH}?checkout=cancelled`;
    }
  } else if (UNPAID.includes(order.status)) {
    try {
      const state = await paymentState(order);
      if (state.status === 'paid') await markShopPaid(db, order, state, origin);
    } catch (e) {
      console.warn(`shop: checking order ${order.code}: ${(e as Error).message}`);
    }
  }
  return `${CART_PATH}?order=${token}`;
}

/**
 * Refunds the provider reports: `refunded` is the payment's total refunded as the provider has it now.
 * A full refund marks the order refunded (one that then fails makes it paid again). Stock isn't put back
 * on its own: the Orders screen does that, by line.
 */
async function recordRefund(db: Db, order: ShopOrder, refunded: number) {
  const status = refunded >= order.total ? (order.status === 'paid' ? 'refunded' : order.status) : order.status === 'refunded' ? 'paid' : order.status;
  if (refunded === order.refunded_amount && status === order.status) return;
  await db.from('shop_orders').update({ refunded_amount: refunded, status }).eq('id', order.id).eq('status', order.status);
}

const orderBy = async (db: Db, column: string, value: unknown) => (value ? (await db.from('shop_orders').select('*').eq(column, String(value)).maybeSingle<ShopOrder>()).data : null);

/** A provider's webhook (signature checked by the route): the order's payment asked of the provider, or its refunds recorded. Orders not found are another feature's. */
export async function shopWebhook(provider: PaymentProvider, event: PaymentEvent, origin?: string) {
  const db = serviceClient();
  if (event.kind === 'refund') {
    const order = await orderBy(db, 'provider_payment', event.payment);
    if (order?.provider === provider) await recordRefund(db, order, event.refunded);
    return;
  }
  const order = event.ref ? await orderBy(db, 'provider_ref', event.ref) : await orderBy(db, 'provider_order', event.order);
  if (!order || order.provider !== provider || !UNPAID.includes(order.status)) return;
  if (event.failed || event.expired) {
    await db.from('shop_orders').update({ status: 'expired' }).eq('id', order.id).eq('status', 'pending');
    return;
  }
  const state = await paymentState(order);
  if (state.status === 'paid') await markShopPaid(db, order, state, origin);
}

/** An order by its token, for its page (the Cart block with ?order=). */
export async function orderByToken(db: Db, token: string): Promise<ShopOrder | null> {
  if (!/^[\w-]{24,64}$/.test(token)) return null;
  const { data } = await db.from('shop_orders').select('*').eq('token', token).maybeSingle<ShopOrder>();
  return data ?? null;
}

// ---- Emails --------------------------------------------------------------------------------

/** Where the shop's notices go: SHOP_NOTIFY_EMAIL, else the forms' admin address, else the config's. */
const notifyAddress = () => env('SHOP_NOTIFY_EMAIL') || env('FORMS_ADMIN_EMAIL') || site.adminEmail;

/** An order's summary as email HTML: its lines, shipping, tax and total, and where it goes. */
export function orderSummaryHtml(o: ShopOrder, origin: string): string {
  const money = (n: number) => esc(formatMoney(n, o.currency));
  const row = (label: string, value: string, strong = false) => `<tr><td style="padding:6px 0">${strong ? `<strong>${label}</strong>` : label}</td><td style="padding:6px 0;text-align:right">${strong ? `<strong>${value}</strong>` : value}</td></tr>`;
  const lines = o.lines.map((l) => row(`${esc(l.title)}${l.label ? ` <span style="color:#666">(${esc(l.label)})</span>` : ''} × ${l.quantity}`, money(l.total))).join('');
  const ship = o.shipping
    ? row(`${o.shipping.kind === 'pickup' ? 'Pickup' : 'Shipping'}: ${esc(o.shipping.name)}`, o.shipping_total ? money(o.shipping_total) : 'Free')
    : '';
  const where =
    o.fulfilment === 'pickup' && o.shipping
      ? `<p><strong>Pick up at ${esc(o.shipping.name)}</strong><br>${esc(o.shipping.address ?? '').replace(/\n/g, '<br>')}${o.shipping.hours ? `<br>${esc(o.shipping.hours)}` : ''}</p>`
      : o.address
        ? `<p><strong>Shipping to</strong><br>${esc(o.name)}<br>${addressLines(o.address).map(esc).join('<br>')}</p>`
        : '';
  return (
    `<table role="presentation" style="width:100%;border-collapse:collapse">${lines}` +
    (o.discount ? row('Discount', `−${money(o.discount)}`) : '') +
    ship +
    (o.tax ? row('Tax', money(o.tax)) : '') +
    row('Total', money(o.total), true) +
    `</table>${where}<p><a href="${esc(`${origin}${CART_PATH}?order=${o.token}`)}">View your order</a></p>`
  );
}

/** The buyer's confirmation and the shop's copy of a paid order. */
async function sendOrderEmails(o: ShopOrder, origin: string) {
  const summary = orderSummaryHtml(o, origin);
  await sendMail({
    to: [o.email],
    subject: `Your order ${o.code} from ${site.name}`,
    html: `<p>Thank you, ${esc(o.name)}. We have your order <strong>${esc(o.code)}</strong>.</p>${summary}`,
    kind: 'shop',
  });
  const to = notifyAddress();
  if (to) {
    await sendMail({
      to: [to],
      replyTo: o.email,
      subject: `New order ${o.code}: ${formatMoney(o.total, o.currency)}`,
      html: `<p>${esc(o.name)} (${esc(o.email)}${o.phone ? `, ${esc(o.phone)}` : ''}) placed order <strong>${esc(o.code)}</strong>.</p>${summary}`,
      kind: 'shop',
    });
  }
}

