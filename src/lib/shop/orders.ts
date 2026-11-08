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
import { buyerAddress, newCode, newToken, siteOrigin } from '../tickets/orders';
import { CART_PATH, shopOn, shopSettings } from './config';
import { quoteCart, type QuoteLine } from './cart';
import { CARRIERS, checkoutSettings, DEFAULT_NEWS_LABEL, taxInForce } from './checkout-settings';
import { mailingOn } from '../mailing/config';
import { signUp } from '../mailing/contacts';
import { cleanPlace, placeName, US_STATES } from './places';
import { cartTotals, type ShipOption } from './totals';
import { discountCandidates } from './discount-lookup';
import { alertLowStock } from './low-stock';
import { orderDownloads } from './downloads';
import { activeCarrier, shippingSources } from './carrier';
import { addressLines, shopEmail, shopEmailsFrom, shopEmailToSend, type ShopEmailKind } from './email';
import { defaultTemplate } from '../email-templates';
import { emailEvents } from '../events/email';
import { SITE_TZ } from '../site';
import { campaignKey } from '../stats';

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
  /** The product's download as it was bought (src/lib/shop/downloads.ts), and how often it was downloaded. */
  download?: { path: string; name: string } | null;
  downloads?: number;
  /** Each item's weight in the shop's unit, when shipped (for a carrier's label). */
  weight?: number | null;
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
  /** The discount it took (Shop > Discounts) and its code ('' for an automatic one). */
  discount_id: number | null;
  discount_code: string;
  /** The campaign the buyer's visit came from: `campaign|source|medium` (src/lib/stats.ts), '' for none. */
  campaign: string;
  /** The carrier a shipped order went with (`usps`, `ups`, `fedex`, `dhl_express`, or '' when not known). */
  carrier: string;
  /** A label bought for it through the carrier service (src/lib/shop/carrier.ts). */
  label: { id: string; url: string; carrier: string; service: string; amount: number; currency: string; at: string } | null;
  /** The parcel's latest tracking, from the carrier service, and whether the buyer was told it arrived. */
  tracking_status: { status: string; details: string; at: string | null; checked_at: string } | null;
  /** When the carrier said it was delivered (the buyer's Delivered email went then). */
  delivered_at: string | null;
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

export type CheckoutError = 'closed' | 'invalid' | 'empty' | 'changed' | 'sold-out' | 'shipping' | 'address' | 'discount' | 'below-minimum' | 'payments-off' | 'limit' | 'busy' | 'payment-error';

const MESSAGES: Record<CheckoutError, string> = {
  closed: 'The shop is closed.',
  invalid: 'Check your name and email.',
  empty: 'Your cart is empty.',
  changed: 'Your cart changed: some items are sold out, no longer sold or fewer are left. Check it and try again.',
  'sold-out': 'Something in your cart sold out just now. Check it and try again.',
  shipping: 'Choose how to get your order.',
  address: 'Check your address.',
  discount: 'That discount code can’t be used. Take it out or try another.',
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
export { addressLines };

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
  // The code typed (checked now with the buyer's email), else the automatic discounts they may take.
  const found = await discountCandidates(db, { code: typeof body?.code === 'string' ? body.code : null, email, member: viewer?.member });
  const { shipping, chosen, totals, discount, discountProblem } = await cartTotals(quote, { ...settings, tax }, { destination, option: typeof body?.option === 'string' ? body.option : null, discounts: found.discounts, code: found.code, codeProblem: found.problem, sources: shippingSources(settings, shopSettings(siteValue).weightUnit, shopSettings(siteValue).currency) });
  if (found.code && discountProblem) return { error: 'discount', message: discountProblem };
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
    ...(l.download ? { download: l.download, downloads: 0 } : {}),
    ...(l.ships && !l.pickupOnly && l.weight ? { weight: l.weight } : {}),
  }));
  const { data: made, error } = await db.rpc('shop_order_create', {
    p_order: {
      token, code, status: free ? 'paid' : 'pending', provider: free ? 'free' : providerName, name, email, phone,
      // An address only when the order is posted.
      address: chosen?.kind === 'ship' ? address : null, fulfilment: chosen ? chosen.kind : 'none', shipping: chosen, lines,
      subtotal: totals.subtotal, discount: totals.discount, shipping_total: totals.shipping, tax: totals.tax ?? 0, total,
      currency, member_id: isActive(member) ? member.user_id : null, ip: buyerAddress(ip),
      discount_id: discount?.id ?? null, discount_code: discount?.code ?? '',
      // The campaign the buyer's visit came from (its utm_ values, kept by stats.js), as the site's stats keep it.
      campaign: campaignKey(body?.campaign),
      // A paid order holds its stock a little longer than its checkout takes payment.
      expires_at: free ? null : new Date(Date.now() + hold + 2 * 60_000).toISOString(),
      paid_at: free ? new Date().toISOString() : null,
    },
    p_limits: {
      client: { orders: BUYER_ORDERS_PER_HOUR },
      // The discount's uses, counted again in the statement that makes the order.
      ...(discount ? { discount: { id: discount.id, max: found.discounts.find((d) => d.id === discount.id)?.max_uses ?? null, once: !!found.discounts.find((d) => d.id === discount.id)?.once_per_email } } : {}),
    },
  });
  if (error) throw error;
  if (made?.client) return fail('limit');
  if (made?.discount) return { error: 'discount', message: 'That discount was used up just now. Take it out or try another.' };
  if (!made?.ok) return fail('sold-out', made?.line ? { line: made.line } : {});
  // Email me news, ticked: a sign-up to the lists chosen in Settings > Shop, confirmed by email as any.
  if (body?.news === true && mailingOn(siteValue) && settings.news.lists.length) {
    await signUp(db, { email, name, lists: settings.news.lists, source: 'shop:checkout', consentText: settings.news.label || DEFAULT_NEWS_LABEL, ip, origin: siteOrigin(origin) }).catch((e) => console.error(`shop: news sign-up failed: ${(e as Error).message}`));
  }
  if (tax.mode === 'stripe') await db.from('shop_orders').update({ tax_by: 'stripe' }).eq('id', made.id);
  const orderPage = `${CART_PATH}?order=${token}`;
  if (free) {
    await afterPaid(db, made.id, origin);
    return { redirect: orderPage };
  }
  try {
    const returnUrl = `${origin}/api/shop/return?order=${token}`;
    // A line with a share of a discount goes as one item at its total less that share (the providers take
    // no negative lines, and the share needn't divide by the quantity).
    const items = lines.map((l) => ({ name: `${l.label ? `${l.title} (${l.label})` : l.title}${l.discount ? ` × ${l.quantity}` : ''}`, unit: l.discount ? l.total - l.discount : l.unit, quantity: l.discount ? 1 : l.quantity, ...(tax.mode === 'stripe' && !quote.lines.find((q) => q.product === l.product && q.variant === l.variant)?.taxable ? { taxCode: NONTAXABLE_TAX_CODE } : {}) }));
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
  const { data: took, error } = await db.rpc('shop_take_stock', { p_id: id });
  if (error) console.error(`shop: taking stock for order ${id}: ${error.message}`);
  const { data: claimed } = await db.from('shop_orders').update({ emailed_at: new Date().toISOString() }).eq('id', id).is('emailed_at', null).select('*').maybeSingle<ShopOrder>();
  if (claimed) await sendOrderEmails(claimed, siteOrigin(origin)).catch((e) => console.error(`shop: emails for order ${claimed.code}: ${(e as Error).message}`));
  // Then the stock just taken off: the shop is told of variants it took to their low-stock mark.
  if (took) {
    const { data: o } = await db.from('shop_orders').select('lines').eq('id', id).maybeSingle<Pick<ShopOrder, 'lines'>>();
    const products = (o?.lines ?? []).filter((l) => l.track).map((l) => l.product);
    await alertLowStock(db, products, siteOrigin(origin)).catch((e) => console.error(`shop: low-stock check for order ${id}: ${(e as Error).message}`));
  }
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

/**
 * One of an order's emails (src/lib/shop/email.ts): the design from Settings > Shop, else the default
 * template for its kind, else the built-in one; to the buyer, or (admin) to the shop, replying to the buyer.
 */
export async function sendShopEmail(kind: ShopEmailKind, o: ShopOrder, origin: string, refund?: number) {
  const db = serviceClient();
  const siteValue = await siteSettings(db);
  const own = shopEmailsFrom(siteValue.shop?.emails)[kind];
  const email = shopEmailToSend(kind, own, own?.design ? null : await defaultTemplate(db, `shop:${kind}`));
  const extras = { order: `${origin}${CART_PATH}?order=${o.token}`, admin: `${origin}/admin/shop/${o.id}/`, siteName: site.name, refund, timeZone: SITE_TZ, downloads: orderDownloads(o, origin) };
  const mail = shopEmail(email, o, extras, origin, await emailEvents(db, email.design, origin));
  if (kind !== 'admin') return sendMail({ to: [o.email], ...mail, kind: 'shop' });
  const to = notifyAddress();
  return to && siteValue.shop?.notify !== false ? sendMail({ to: [to], replyTo: o.email, ...mail, kind: 'shop' }) : false;
}

/** The buyer's confirmation and the shop's copy of a paid order. */
async function sendOrderEmails(o: ShopOrder, origin: string) {
  await sendShopEmail('confirmation', o, origin);
  await sendShopEmail('admin', o, origin);
}

// ---- The Orders screen ------------------------------------------------------------------------

/** Lines to put back in stock: { <line index>: quantity }, each at most what it hasn't put back yet. */
export type Restock = Record<string, number>;

async function loadOrder(db: Db, id: number): Promise<ShopOrder> {
  const { data } = await db.from('shop_orders').select('*').eq('id', id).maybeSingle<ShopOrder>();
  if (!data) throw new Error('No such order.');
  return data;
}

/** Put lines back in stock (only an order whose stock was taken off; each line at most once over). What went back, by line. */
export async function restockOrder(db: Db, id: number, lines: Restock): Promise<Restock> {
  const { data, error } = await db.rpc('shop_restock', { p_id: id, p_lines: lines });
  if (error) throw error;
  return (data ?? {}) as Restock;
}

/**
 * Mark a paid order shipped (with its tracking, if any) or picked up. Shipping emails the buyer, with
 * the tracking; picking up doesn't. Marking it again changes the tracking and sends the email again.
 */
export async function fulfilOrder(db: Db, id: number, kind: 'shipped' | 'picked_up' | '', tracking = '', origin?: string, carrier = '', opts: { follow?: boolean } = {}) {
  const o = await loadOrder(db, id);
  if (o.status !== 'paid') throw new Error('Only paid orders can be marked shipped or picked up.');
  const t = text(tracking, 300);
  // Any carrier's code (a label can come from any carrier on the Shippo account, not only CARRIERS'); none
  // given ("Another, or not known") clears it.
  const k = kind === 'shipped' && /^[a-z0-9_]{1,40}$/.test(carrier) ? carrier : '';
  const changed = t !== o.tracking || k !== o.carrier;
  await db
    .from('shop_orders')
    .update({ fulfilled: kind, fulfilled_at: kind ? new Date().toISOString() : null, tracking: kind === 'shipped' ? t : '', carrier: k, ...(changed ? { tracking_status: null, delivered_at: null } : {}) })
    .eq('id', id);
  // A number typed for a known carrier is followed through the carrier service, so its updates come (a
  // label bought there is followed on its own).
  const carrierService = activeCarrier();
  if (kind === 'shipped' && t && k && carrierService && opts.follow !== false && changed) await carrierService.follow(k, t).catch((e) => console.error(`shop: following ${k} ${t}: ${(e as Error).message}`));
  if (kind === 'shipped') await sendShopEmail('shipped', { ...o, tracking: t, carrier: k }, siteOrigin(origin));
}

/** An order's notes for the shop (not shown to the buyer). */
export async function saveNotes(db: Db, id: number, notes: string) {
  const { error } = await db.from('shop_orders').update({ notes: String(notes ?? '').slice(0, 5000) }).eq('id', id);
  if (error) throw error;
}

/** Send a paid order's confirmation to the buyer again. */
export async function resendShopConfirmation(db: Db, id: number, origin?: string) {
  const o = await loadOrder(db, id);
  if (o.status !== 'paid') throw new Error('Only paid orders have a confirmation to send.');
  await sendShopEmail('confirmation', o, siteOrigin(origin));
}

/**
 * Cancel an order that isn't paid for (its stock was only held, and goes back on sale), or a paid one
 * with nothing (left) to pay back: free, or refunded in full; that one's lines go back in stock as
 * `restock` says. An unpaid one is asked of its provider first: paid there after all, it is marked paid
 * and not cancelled (`paid`); a check that fails cancels nothing.
 */
export async function cancelShopOrder(db: Db, id: number, restock: Restock = {}, origin?: string): Promise<{ paid?: boolean; restocked?: Restock }> {
  const o = await loadOrder(db, id);
  if (o.status === 'paid' && o.total > o.refunded_amount) throw new Error('Refund a paid order to cancel it.');
  if (!['pending', 'paid', 'expired', 'refunded'].includes(o.status)) throw new Error('This order is already cancelled.');
  const provider = providerOf(o.provider);
  if ((o.status === 'pending' || o.status === 'expired') && provider && o.provider_ref) {
    const state = await paymentState(o).catch((e) => {
      throw new Error(`Could not check the payment at ${provider.label} (${(e as Error).message}), so the order was not cancelled. Try again in a moment.`);
    });
    if (state.status === 'paid') {
      await markShopPaid(db, o, state, origin);
      return { paid: true };
    }
    if (state.status === 'processing') throw new Error(`Its payment is on its way at ${provider.label} (a bank payment can take days), so the order was not cancelled.`);
    if (o.status === 'pending') await closeCheckout(o.provider, o.provider_ref);
  }
  // As it was when read: an order paid meanwhile isn't cancelled.
  const { data, error } = await db.from('shop_orders').update({ status: 'cancelled' }).eq('id', id).eq('status', o.status).select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('The order changed meanwhile; look at it again.');
  return { restocked: o.stock_taken ? await restockOrder(db, id, restock) : {} };
}

/**
 * Refund `amount` of a paid order at its provider (admins), and put lines back in stock as `restock`
 * says. All of it marks the order refunded. Each refund has its own idempotency key, kept while its
 * outcome is unknown, so a retried one is made once (as ticket refunds).
 */
export async function refundShopOrder(db: Db, id: number, amount: number, restock: Restock = {}, origin?: string): Promise<{ refunded: number; full: boolean; restocked: Restock }> {
  const o = await loadOrder(db, id);
  if (o.status !== 'paid' && o.status !== 'refunded') throw new Error('Only paid orders can be refunded.');
  const left = o.total - o.refunded_amount;
  if (amount < 0 || amount > left) throw new Error('Refund at most what is left of the order.');
  let total = o.refunded_amount;
  if (amount > 0) {
    const provider = providerOf(o.provider);
    if (!provider) throw new Error('Free orders have nothing to refund.');
    if (!o.provider_payment) throw new Error('This order has no payment recorded at the provider; refund it from its dashboard.');
    const last = (o as ShopOrder & { refund_attempt?: { key: string; amount: number; from: number } | null }).refund_attempt;
    const key = last && last.amount === amount && last.from === o.refunded_amount ? last.key : `shop-${o.id}-${newToken().slice(0, 12)}`;
    await db.from('shop_orders').update({ refund_attempt: { key, amount, from: o.refunded_amount, at: new Date().toISOString() } }).eq('id', id);
    const made = await provider.refund(o.provider_payment, amount, o.currency, key);
    await db.from('shop_orders').update({ refund_attempt: null }).eq('id', id);
    if (made.status === 'failed') throw new Error(`${provider.label} did not make the refund${made.reason ? ` (${made.reason})` : ''}. Nothing was recorded.`);
    // The provider's webhook may have recorded it already: the total is what it was plus this one.
    const { data: now } = await db.from('shop_orders').select('refunded_amount').eq('id', id).single();
    total = Math.max(Number(now?.refunded_amount) || 0, o.refunded_amount + amount);
    await db.from('shop_orders').update({ refunded_amount: total, ...(total >= o.total ? { status: 'refunded' } : {}) }).eq('id', id).in('status', ['paid', 'refunded']);
    // The buyer is told; a failed email doesn't undo the refund.
    await sendShopEmail('refunded', { ...o, refunded_amount: total, status: total >= o.total ? 'refunded' : o.status }, siteOrigin(origin), amount).catch((e) => console.error(`shop: refund email for order ${o.code}: ${(e as Error).message}`));
  }
  return { refunded: total, full: total >= o.total, restocked: o.stock_taken ? await restockOrder(db, id, restock) : {} };
}

/** The orders as CSV rows (the Orders screen's export): one row per line. */
export function ordersCsvRows(orders: ShopOrder[]): string[][] {
  const head = ['Order', 'Date', 'Status', 'Name', 'Email', 'Phone', 'Fulfilment', 'Shipping', 'Address', 'Product', 'Options', 'SKU', 'Unit', 'Quantity', 'Line total', 'Subtotal', 'Discount', 'Shipping cost', 'Tax', 'Total', 'Refunded', 'Currency', 'Fulfilled', 'Tracking', 'Campaign'];
  const rows: string[][] = [head];
  const money = (n: number) => (n / 100).toFixed(2);
  for (const o of orders) {
    for (const [i, l] of o.lines.entries()) {
      const first = i === 0;
      rows.push([
        o.code, o.created_at, o.status, o.name, o.email, o.phone, o.fulfilment, o.shipping?.name ?? '', addressLines(o.address).join(', '),
        l.title, l.label, l.sku, money(l.unit), String(l.quantity), money(l.total),
        first ? money(o.subtotal) : '', first ? money(o.discount) : '', first ? money(o.shipping_total) : '', first ? money(o.tax) : '', first ? money(o.total) : '', first ? money(o.refunded_amount) : '',
        o.currency, o.fulfilled, o.tracking, (o.campaign ?? '').split('|').filter(Boolean).join(' / '),
      ]);
    }
  }
  return rows;
}

/** The Orders screen's tabs. */
export const ORDER_TABS: [string, string][] = [
  ['to-fulfil', 'To send or hand over'],
  ['paid', 'Paid'],
  ['pending', 'Awaiting payment'],
  ['closed', 'Cancelled and expired'],
  ['refunded', 'Refunded'],
  ['all', 'All orders'],
];

/** The orders a tab and search show, newest first (the Orders screen and its CSV). */
export function ordersQuery(db: Db, tab: string, search = '') {
  let q = db.from('shop_orders').select('*', { count: 'exact' }).order('created_at', { ascending: false }).order('id', { ascending: false });
  if (tab === 'to-fulfil') q = q.eq('status', 'paid').eq('fulfilled', '').neq('fulfilment', 'none');
  else if (tab === 'paid') q = q.eq('status', 'paid');
  else if (tab === 'pending') q = q.eq('status', 'pending');
  else if (tab === 'closed') q = q.in('status', ['cancelled', 'expired']);
  else if (tab === 'refunded') q = q.eq('status', 'refunded');
  const s = search.trim().replace(/[,()"\\*%]/g, ' ').trim().slice(0, 100);
  if (s) q = q.or(`code.ilike.*${s}*,email.ilike.*${s}*,name.ilike.*${s}*`);
  return q;
}
