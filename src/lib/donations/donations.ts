// Donations (tables donations, donation_plans): a gift from the Donate block (POST /api/donations/checkout),
// the donor coming back from paying (/api/donations/return), the providers' webhooks (donationsWebhook),
// monthly gifts (Stripe subscriptions: each month's invoice makes a donation row), refunds and
// cancellations from the Donations screen, unpaid checkouts expiring (the hourly run), the emails, and the
// numbers the screen and the Donation progress block show. Server only.
import type { Db } from '../db/query';
import { serviceClient } from '../db/site';
import { PROVIDERS, closeCheckout, pickProvider, providerOf, type CheckoutState, type PaymentEvent, type PaymentProvider } from '../payments';
import { cancelSubscription, checkSubscriptionCheckout, createSubscriptionCheckout, invoicePayment, portalUrl, subscriptionStatus } from '../payments/stripe';
import { formatMoney } from '../payments/money';
import { sendMail } from '../forms/mail';
import { site, SITE_TZ } from '../site';
import { env } from '../env';
import { buyerAddress, newCode, newToken, siteOrigin } from '../tickets/orders';
import { mailingOn } from '../mailing/config';
import { signUp } from '../mailing/contacts';
import { campaignKey, statsDay } from '../stats';
import { defaultTemplate } from '../email-templates';
import { emailEvents } from '../events/email';
import { DEFAULT_NEWS_LABEL, DONATE_PATH, MAX_GIFT, coverFee, coversFees, donationSettings, donationsOn, goalOf, type DonateError, type DonationEmailKind, type DonationGoal, type DonationSettings } from './config';
import { donationEmail, donationEmailToSend } from './email';
import { raised } from './totals';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Checkouts started in a minute (all donors together), against floods. */
const MAX_PER_MINUTE = 30;
/** Checkouts not paid for in an hour by one donor (by address and by email). */
const DONOR_PER_HOUR = 5;
/** An unpaid checkout is let go after a day (Stripe's close then; Square's payment links don't). */
const PENDING_HOURS = 24;

export type DonationStatus = 'pending' | 'paid' | 'cancelled' | 'expired' | 'refunded';
export type PlanStatus = 'incomplete' | 'active' | 'past_due' | 'cancelled';

export interface Donation {
  id: number;
  token: string;
  code: string;
  status: DonationStatus;
  kind: 'once' | 'monthly';
  plan_id: number | null;
  provider: PaymentProvider;
  provider_ref: string | null;
  provider_order: string | null;
  provider_payment: string | null;
  invoice: string | null;
  amount: number;
  fee: number;
  total: number;
  currency: string;
  refunded_amount: number;
  refund_attempt?: { key: string; amount: number; from: number } | null;
  name: string;
  email: string;
  anonymous: boolean;
  dedication: string;
  goal: string;
  page: string;
  campaign: string;
  note: string;
  paid_at: string | null;
  emailed_at: string | null;
  created_at: string;
}

export interface DonationPlan {
  id: number;
  token: string;
  status: PlanStatus;
  provider: 'stripe';
  customer: string | null;
  subscription: string | null;
  amount: number;
  fee: number;
  total: number;
  currency: string;
  name: string;
  email: string;
  anonymous: boolean;
  dedication: string;
  goal: string;
  page: string;
  campaign: string;
  /** The copy of the site it started on (its address): only that copy acts on its Stripe events. */
  home: string;
  started_at: string | null;
  cancelled_at: string | null;
  failed_at: string | null;
  created_at: string;
}

export type { DonateError } from './config';

export type DonateResult = { redirect: string } | { error: DonateError };
const fail = (error: DonateError): DonateResult => ({ error });

const text = (v: unknown, max = 300) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const yes = (v: unknown) => v === true || v === 'on' || v === '1' || v === 'true';

async function siteSettings(db: Db) {
  const { data } = await db.from('settings').select('value').eq('key', 'site').maybeSingle();
  return (data?.value ?? {}) as Record<string, any>;
}

/** An amount typed in the currency ("25", "25.50", "$1,000") in minor units; NaN when it isn't one. */
export function typedAmount(v: unknown): number {
  const s = String(v ?? '').replace(/[\s,$£€]/g, '');
  return /^\d+(\.\d{1,2})?$/.test(s) ? Math.round(Number(s) * 100) : NaN;
}

/** The gift a form asks for: a preset (`amount`, in minor units) or Other (`other`, typed). */
export function askedAmount(body: Record<string, unknown>): number {
  const preset = String(body.amount ?? '');
  if (preset && preset !== 'other' && /^\d+$/.test(preset)) return Number(preset);
  return typedAmount(body.other);
}

/** The page a gift was made on: a path on this site, else the donation page. */
const pageOf = (v: unknown) => {
  const p = String(v ?? '');
  return /^\/[\w\-/.%]*$/.test(p) && !p.startsWith('//') && p.length < 300 ? p : DONATE_PATH;
};

/** A path with ?<key>=<value> (and the anchor of the Donate block). */
const withParam = (path: string, key: string, value: string) => `${path}${path.includes('?') ? '&' : '?'}${key}=${encodeURIComponent(value)}#donate`;

/**
 * A gift from the Donate block: the amount checked against the settings, the donor's details, then the
 * provider's checkout (a one-time payment, or for a monthly gift a Stripe subscription). `body`: the form's
 * fields (amount or other, frequency, cover, name, email, anonymous, dedication, goal, page, campaign, news).
 */
export async function startDonation(body: Record<string, unknown>, origin: string, ip = ''): Promise<DonateResult> {
  const db = serviceClient();
  const siteValue = await siteSettings(db);
  if (!donationsOn(siteValue)) return fail('closed');
  if (text(body._hp)) return fail('invalid');
  const s = donationSettings(siteValue);
  const name = text(body.name, 200);
  const email = text(body.email, 254);
  if (!name || !EMAIL.test(email)) return fail('invalid');
  const amount = askedAmount(body);
  if (!Number.isFinite(amount) || amount <= 0) return fail('amount');
  if (amount < s.minimum) return fail('too-small');
  if (amount > MAX_GIFT) return fail('too-large');
  const monthly = String(body.frequency ?? '') === 'monthly';
  if (monthly && (!s.monthly || !PROVIDERS.stripe.configured())) return fail('monthly-off');
  const providerName: PaymentProvider | undefined = monthly ? 'stripe' : pickProvider(s.provider);
  if (!providerName) return fail('payments-off');
  const fee = yes(body.cover) && coversFees(s) ? coverFee(amount, s) : 0;
  const total = amount + fee;

  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count: recent } = await db.from('donations').select('id', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 60_000).toISOString());
  if ((recent ?? 0) >= MAX_PER_MINUTE) return fail('busy');
  const address = buyerAddress(ip);
  const byEmail = await db.from('donations').select('id', { count: 'exact', head: true }).eq('email', email).eq('status', 'pending').gte('created_at', since);
  const byIp = address ? await db.from('donations').select('id', { count: 'exact', head: true }).eq('ip', address).eq('status', 'pending').gte('created_at', since) : { count: 0 };
  if ((byEmail.count ?? 0) >= DONOR_PER_HOUR || (byIp.count ?? 0) >= DONOR_PER_HOUR) return fail('limit');
  await expireDonations(db).catch((e) => console.warn(`donations: expiring: ${(e as Error).message}`));

  const goal = goalOf(s, text(body.goal, 40))?.id ?? '';
  const details = {
    name, email, anonymous: s.anonymous && yes(body.anonymous), dedication: s.dedication ? text(body.dedication, 200) : '', goal, page: pageOf(body.page),
    campaign: campaignKey(typeof body.campaign === 'string' ? (() => { try { return JSON.parse(body.campaign as string); } catch { return null; } })() : body.campaign),
  };
  const token = newToken();
  const code = newCode();
  let planId: number | null = null;
  if (monthly) {
    const { data: plan, error } = await db.from('donation_plans').insert({ token: newToken(), amount, fee, total, currency: s.currency, home: siteOrigin(origin), ...details }).select('id').single();
    if (error) throw error;
    planId = plan.id as number;
  }
  const { data: made, error } = await db
    .from('donations')
    .insert({ token, code, kind: monthly ? 'monthly' : 'once', plan_id: planId, provider: providerName, amount, fee, total, currency: s.currency, ip: address, ...details })
    .select('id')
    .single();
  if (error) throw error;

  // Email me news, ticked: a sign-up to the lists chosen in Settings > Donations, confirmed by email as any.
  if (yes(body.news) && mailingOn(siteValue) && s.news.lists.length) {
    await signUp(db, { email, name, lists: s.news.lists, source: 'donation', consentText: s.news.label || DEFAULT_NEWS_LABEL, ip, origin: siteOrigin(origin) }).catch((e) => console.error(`donations: news sign-up failed: ${(e as Error).message}`));
  }

  const returnUrl = `${origin}/api/donations/return?d=${token}`;
  const description = `${monthly ? 'Monthly gift' : 'Gift'} to ${site.name} (${code})`;
  try {
    if (monthly) {
      const checkout = await createSubscriptionCheckout({ reference: code, idempotencyKey: `donation-${token}`, unit: total, name: `Monthly gift to ${site.name}`, currency: s.currency, email, description, returnUrl, cancelUrl: `${returnUrl}&cancel=1`, metadata: { donation: code } });
      await db.from('donations').update({ provider_ref: checkout.ref }).eq('id', made.id);
      return { redirect: checkout.url };
    }
    const items = [{ name: `Gift to ${site.name}`, unit: amount, quantity: 1 }, ...(fee ? [{ name: 'Fees covered', unit: fee, quantity: 1 }] : [])];
    const checkout = await PROVIDERS[providerName].create({ reference: code, idempotencyKey: `donation-${token}`, email, currency: s.currency, items, description, returnUrl, cancelUrl: `${returnUrl}&cancel=1`, expiresAt: new Date(Date.now() + PENDING_HOURS * 3600_000) });
    await db.from('donations').update({ provider_ref: checkout.ref, provider_order: checkout.order ?? null }).eq('id', made.id);
    return { redirect: checkout.url };
  } catch (e) {
    console.error(`donations: checkout for ${code} failed: ${(e as Error).message}`);
    await db.from('donations').update({ status: 'cancelled' }).eq('id', made.id).eq('status', 'pending');
    if (planId) await db.from('donation_plans').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', planId);
    return fail('payment-error');
  }
}

/** Gifts not paid for (yet) whose checkout can still turn out paid. */
const UNPAID: DonationStatus[] = ['pending', 'expired', 'cancelled'];

/** Where a gift's checkout stands at its provider (a monthly gift's at Stripe, with its subscription). */
async function paymentState(d: Pick<Donation, 'kind' | 'provider' | 'provider_ref' | 'provider_order'>): Promise<CheckoutState & { subscription?: string; customer?: string; invoice?: string }> {
  if (!d.provider_ref) return { status: 'pending' };
  if (d.kind === 'monthly') return checkSubscriptionCheckout(d.provider_ref);
  const p = providerOf(d.provider);
  return p ? p.check({ ref: d.provider_ref, order: d.provider_order }) : { status: 'pending' };
}

/**
 * Mark a gift paid, once (a webhook and the donor's return can both get here), only once its provider
 * says so; a monthly gift's plan becomes active with its subscription. Then the receipt and the
 * organization's copy, each once.
 */
export async function markDonationPaid(db: Db, d: Pick<Donation, 'id' | 'plan_id'>, state: { paymentId?: string; subscription?: string; customer?: string; invoice?: string } = {}, origin?: string) {
  const at = new Date().toISOString();
  for (const was of UNPAID) {
    const { data } = await db
      .from('donations')
      .update({ status: 'paid', paid_at: at, ...(state.paymentId ? { provider_payment: state.paymentId } : {}), ...(state.invoice ? { invoice: state.invoice } : {}), ...(was !== 'pending' ? { note: `Paid after the checkout was ${was}.` } : {}) })
      .eq('id', d.id)
      .eq('status', was)
      .select('id')
      .maybeSingle();
    if (data) {
      // The plan starts with its subscription, also when its checkout was given up (cancelled or expired
      // here) and then paid all the same: its monthly payments, receipts and Cancel need it.
      if (d.plan_id) await db.from('donation_plans').update({ status: 'active', started_at: at, cancelled_at: null, ...(state.subscription ? { subscription: state.subscription } : {}), ...(state.customer ? { customer: state.customer } : {}) }).eq('id', d.plan_id).in('status', ['incomplete', 'cancelled']).is('subscription', null);
      // A monthly gift's receipt carries the link to change or cancel it.
      await afterPaid(db, d.id, d.plan_id ? 'monthly' : 'receipt', origin);
      return;
    }
  }
}

/** A paid gift's emails: the donor's (receipt or monthly receipt) and the organization's copy, once. */
async function afterPaid(db: Db, id: number, kind: 'receipt' | 'monthly', origin?: string) {
  const { data: claimed } = await db.from('donations').update({ emailed_at: new Date().toISOString() }).eq('id', id).is('emailed_at', null).select('*').maybeSingle<Donation>();
  if (!claimed) return;
  const o = siteOrigin(origin);
  await sendDonationEmail(kind, claimed, o).catch((e) => console.error(`donations: ${kind} for ${claimed.code}: ${(e as Error).message}`));
  await sendDonationEmail('admin', claimed, o).catch((e) => console.error(`donations: admin copy for ${claimed.code}: ${(e as Error).message}`));
}

/** The donor back from the provider: the gift checked, and the address of the page it was made on, with its thank-you. */
export async function returnFromDonation(token: string, cancelled: boolean, origin?: string): Promise<string | null> {
  const db = serviceClient();
  const d = await donationByToken(db, token);
  if (!d) return null;
  if (cancelled && d.status === 'pending') {
    const state = await paymentState(d).catch((e): null => (console.warn(`donations: checking ${d.code}: ${(e as Error).message}`), null));
    if (state?.status === 'paid') await markDonationPaid(db, d, state, origin);
    else if (state && state.status !== 'processing') {
      // A monthly gift's checkout too: left open, it could still start the subscription.
      await closeCheckout(d.provider, d.provider_ref);
      await db.from('donations').update({ status: 'cancelled' }).eq('id', d.id).eq('status', 'pending');
      if (d.plan_id) await db.from('donation_plans').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', d.plan_id).eq('status', 'incomplete');
      return withParam(d.page || DONATE_PATH, 'donate', 'cancelled');
    }
  } else if (UNPAID.includes(d.status)) {
    try {
      const state = await paymentState(d);
      if (state.status === 'paid') await markDonationPaid(db, d, state, origin);
    } catch (e) {
      console.warn(`donations: checking ${d.code}: ${(e as Error).message}`);
    }
  }
  return withParam(d.page || DONATE_PATH, 'donation', token);
}

/** Refunds the provider reports: `refunded` is the payment's total refunded as the provider has it now. */
async function recordRefund(db: Db, d: Donation, refunded: number) {
  const status = refunded >= d.total ? (d.status === 'paid' ? 'refunded' : d.status) : d.status === 'refunded' ? 'paid' : d.status;
  if (refunded === d.refunded_amount && status === d.status) return;
  await db.from('donations').update({ refunded_amount: refunded, status }).eq('id', d.id).eq('status', d.status);
}

const donationBy = async (db: Db, column: string, value: unknown) => (value ? (await db.from('donations').select('*').eq(column, String(value)).maybeSingle<Donation>()).data : null);
const planBy = async (db: Db, column: string, value: unknown) => (value ? (await db.from('donation_plans').select('*').eq(column, String(value)).maybeSingle<DonationPlan>()).data : null);

/** A gift by its token (its thank-you, the return). */
export async function donationByToken(db: Db, token: string): Promise<Donation | null> {
  return /^[\w-]{24,64}$/.test(token) ? donationBy(db, 'token', token) : null;
}

/** A monthly gift by its token (its page to change or cancel it). */
export async function planByToken(db: Db, token: string): Promise<DonationPlan | null> {
  return /^[\w-]{24,64}$/.test(token) ? planBy(db, 'token', token) : null;
}

/**
 * Whether this copy looks after a monthly gift: the copy it started on (or any copy, for one from before
 * that was kept). A copy that has the plan through a sync, and a webhook of its own on the same Stripe
 * account, leaves it alone: no gifts recorded, no emails, no changes at Stripe.
 */
export const atHome = (plan: Pick<DonationPlan, 'home'>, origin?: string) => !plan.home || plan.home === siteOrigin(origin);

const NOT_HOME = (plan: Pick<DonationPlan, 'home'>) => `This monthly gift started on ${plan.home}; change it there.`;

/**
 * A provider's webhook (signature checked by the route): a checkout's payment asked of the provider, its
 * refunds recorded, and a monthly gift's invoices (a later month paid makes a gift; a failed one marks the
 * plan behind and tells the donor once) and the subscription's end. Gifts not found are another feature's.
 */
export async function donationsWebhook(provider: PaymentProvider, event: PaymentEvent, origin?: string) {
  const db = serviceClient();
  if (event.kind === 'refund') {
    const d = await donationBy(db, 'provider_payment', event.payment);
    if (d?.provider === provider) await recordRefund(db, d, event.refunded);
    return;
  }
  if (event.kind === 'invoice') return invoiceEvent(db, event, origin);
  if (event.kind === 'subscription') {
    const plan = await planBy(db, 'subscription', event.subscription);
    if (!plan || !atHome(plan, origin)) return;
    if (event.status === 'canceled' || event.status === 'incomplete_expired') await planEnded(db, plan, origin);
    else if (event.status === 'past_due' || event.status === 'unpaid') await db.from('donation_plans').update({ status: 'past_due' }).eq('id', plan.id).eq('status', 'active');
    else if (event.status === 'active') await db.from('donation_plans').update({ status: 'active' }).eq('id', plan.id).eq('status', 'past_due');
    return;
  }
  const d = event.ref ? await donationBy(db, 'provider_ref', event.ref) : await donationBy(db, 'provider_order', event.order);
  if (!d || d.provider !== provider || !UNPAID.includes(d.status)) return;
  if (event.failed || event.expired) {
    await db.from('donations').update({ status: 'expired' }).eq('id', d.id).eq('status', 'pending');
    return;
  }
  const state = await paymentState(d);
  if (state.status === 'paid') await markDonationPaid(db, d, state, origin);
}

/**
 * A monthly gift's invoice. The first (`subscription_create`) is the checkout's, recorded by it. A later
 * one paid makes a donation row of its own (once per invoice) and sends the monthly receipt; one that
 * failed marks the plan behind and emails the donor, once until it is paid again.
 */
async function invoiceEvent(db: Db, event: Extract<PaymentEvent, { kind: 'invoice' }>, origin?: string) {
  const plan = await planBy(db, 'subscription', event.subscription);
  if (!plan || plan.status === 'cancelled' || !atHome(plan, origin)) return;
  if (event.failed) {
    const { data } = await db.from('donation_plans').update({ status: 'past_due', failed_at: new Date().toISOString() }).eq('id', plan.id).eq('status', 'active').select('id');
    if (data?.length) await sendPlanEmail('failed', plan, siteOrigin(origin)).catch((e) => console.error(`donations: failed-payment email for plan ${plan.id}: ${(e as Error).message}`));
    return;
  }
  if (event.reason === 'subscription_create') return;
  if (await donationBy(db, 'invoice', event.invoice)) return;
  const pay = await invoicePayment(event.invoice);
  // Nothing charged (paid from the customer's balance or a full coupon): no gift, no receipt.
  if (!pay.paid || pay.amount <= 0) return;
  const at = new Date().toISOString();
  const { data: made, error } = await db
    .from('donations')
    .insert({
      token: newToken(), code: newCode(), status: 'paid', kind: 'monthly', plan_id: plan.id, provider: 'stripe', provider_ref: event.invoice, invoice: event.invoice, provider_payment: pay.paymentId ?? null,
      // What Stripe charged this month (less than the plan with a coupon or the customer's balance).
      amount: Math.min(plan.amount, pay.amount), fee: Math.max(0, pay.amount - plan.amount), total: pay.amount, currency: plan.currency, name: plan.name, email: plan.email, anonymous: plan.anonymous, dedication: plan.dedication, goal: plan.goal, page: plan.page, campaign: plan.campaign, paid_at: at,
    })
    .select('id')
    .maybeSingle();
  // Another delivery of the same event made it meanwhile (invoice is unique): done. Any other failure
  // answers the webhook with an error, so Stripe sends it again.
  if (error?.code === '23505' || /UNIQUE/i.test(error?.message ?? '')) return;
  if (error) throw new Error(`recording invoice ${event.invoice}: ${error.message}`);
  if (!made) return;
  await db.from('donation_plans').update({ status: 'active', failed_at: null }).eq('id', plan.id).in('status', ['active', 'past_due']);
  await afterPaid(db, made.id as number, 'monthly', origin);
}

/** A monthly gift ended (cancelled here or at Stripe): marked so, and the donor told, once. */
async function planEnded(db: Db, plan: DonationPlan, origin?: string) {
  const { data } = await db.from('donation_plans').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', plan.id).neq('status', 'cancelled').select('id');
  if (data?.length && plan.status !== 'incomplete') await sendPlanEmail('cancelled', plan, siteOrigin(origin)).catch((e) => console.error(`donations: cancelled email for plan ${plan.id}: ${(e as Error).message}`));
}

/** Stop a monthly gift (the donor's page, or the Donations screen): its subscription cancelled at Stripe, then marked so. */
export async function cancelPlan(db: Db, plan: DonationPlan, origin?: string) {
  if (plan.status === 'cancelled') return;
  if (!atHome(plan, origin)) throw new Error(NOT_HOME(plan));
  if (plan.subscription) {
    const status = await cancelSubscription(plan.subscription);
    if (status && status !== 'canceled') throw new Error(`Stripe answered ${status}; the monthly gift was not cancelled.`);
  }
  await planEnded(db, plan, origin);
}

/** A Stripe page where the donor updates their card (needs Stripe's customer portal set up). */
export async function planCardUrl(plan: DonationPlan, returnUrl: string, origin?: string): Promise<string> {
  if (!atHome(plan, origin)) throw new Error(NOT_HOME(plan));
  if (!plan.customer) throw new Error('This monthly gift has no card on file yet.');
  return portalUrl(plan.customer, returnUrl);
}

/** A plan's status read again from Stripe (the Donations screen's Check at Stripe). */
export async function refreshPlan(db: Db, plan: DonationPlan, origin?: string) {
  if (!plan.subscription) return plan.status;
  if (!atHome(plan, origin)) throw new Error(NOT_HOME(plan));
  const status = await subscriptionStatus(plan.subscription);
  await donationsWebhook('stripe', { kind: 'subscription', subscription: plan.subscription, status }, origin);
  return status;
}

/** Unpaid checkouts older than a day: marked expired, and their checkouts closed (Square's payment links don't expire). */
export async function expireDonations(db: Db = serviceClient()) {
  const before = new Date(Date.now() - PENDING_HOURS * 3600_000).toISOString();
  const { data } = await db.from('donations').update({ status: 'expired' }).eq('status', 'pending').lt('created_at', before).select('id, kind, provider, provider_ref, plan_id');
  for (const d of data ?? []) {
    await closeCheckout(d.provider, d.provider_ref);
    if (d.plan_id) await db.from('donation_plans').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', d.plan_id).eq('status', 'incomplete');
  }
  return data?.length ?? 0;
}

// ---- Emails --------------------------------------------------------------------------------

/** Where the organization's copies go: DONATIONS_NOTIFY_EMAIL, else the forms' admin address, else the config's. */
const notifyAddress = () => env('DONATIONS_NOTIFY_EMAIL') || env('FORMS_ADMIN_EMAIL') || site.adminEmail;

/** The link a monthly donor changes or cancels their gift at. */
export const manageLink = (origin: string, plan: Pick<DonationPlan, 'token'>) => `${origin}${DONATE_PATH}?plan=${plan.token}#donate`;

/** One of a gift's emails: the site's design, else the default template for its kind, else the built-in one. */
export async function sendDonationEmail(kind: DonationEmailKind, d: Donation, origin: string, x: { refund?: number; plan?: DonationPlan | null } = {}) {
  const db = serviceClient();
  const s = donationSettings(await siteSettings(db));
  if (kind === 'admin' && (!s.notify || !notifyAddress())) return false;
  const own = s.emails[kind];
  const email = donationEmailToSend(kind, own, own?.design ? null : await defaultTemplate(db, `donation:${kind}`));
  const plan = x.plan ?? (d.plan_id ? (await db.from('donation_plans').select('*').eq('id', d.plan_id).maybeSingle<DonationPlan>()).data : null);
  const extras = { siteName: site.name, admin: `${origin}/admin/donations/${d.id}/`, manage: plan ? manageLink(origin, plan) : undefined, goal: goalOf(s, d.goal)?.name, legalName: s.legalName, taxId: s.taxId, receiptNote: s.receiptNote, refund: x.refund, timeZone: SITE_TZ };
  const mail = donationEmail(email, d, extras, origin, await emailEvents(db, email.design, origin));
  const to = kind === 'admin' ? [notifyAddress()!] : [d.email];
  return sendMail({ to, ...(kind === 'admin' ? { replyTo: d.email } : {}), ...mail, kind: 'donation' });
}

/** A monthly gift's notice (failed, cancelled), from its latest gift (or the plan itself when none was paid). */
async function sendPlanEmail(kind: 'failed' | 'cancelled', plan: DonationPlan, origin: string) {
  const db = serviceClient();
  const { data: last } = await db.from('donations').select('*').eq('plan_id', plan.id).order('id', { ascending: false }).limit(1).maybeSingle<Donation>();
  const d: Donation = last ?? ({ ...plan, id: 0, code: '', kind: 'monthly', provider: 'stripe', provider_payment: null, paid_at: null, status: 'pending', refunded_amount: 0, plan_id: plan.id } as unknown as Donation);
  return sendDonationEmail(kind, d, origin, { plan });
}

/** Send a paid gift's receipt again. */
export async function resendReceipt(db: Db, id: number, origin?: string) {
  const d = await loadDonation(db, id);
  if (d.status !== 'paid' && d.status !== 'refunded') throw new Error('Only paid gifts have a receipt to send.');
  await sendDonationEmail(d.kind === 'monthly' ? 'monthly' : 'receipt', d, siteOrigin(origin));
}

// ---- The Donations screen ---------------------------------------------------------------------

async function loadDonation(db: Db, id: number): Promise<Donation> {
  const { data } = await db.from('donations').select('*').eq('id', id).maybeSingle<Donation>();
  if (!data) throw new Error('No such gift.');
  return data;
}

/**
 * Refund `amount` of a paid gift at its provider (admins). All of it marks the gift refunded. Each refund
 * has its own idempotency key, kept while its outcome is unknown, so a retried one is made once.
 */
export async function refundDonation(db: Db, id: number, amount: number, origin?: string): Promise<{ refunded: number; full: boolean }> {
  const d = await loadDonation(db, id);
  if (d.status !== 'paid' && d.status !== 'refunded') throw new Error('Only paid gifts can be refunded.');
  const left = d.total - d.refunded_amount;
  if (!(amount > 0) || amount > left) throw new Error('Refund at most what is left of the gift.');
  const provider = providerOf(d.provider);
  if (!provider) throw new Error('No payment provider for this gift.');
  if (!d.provider_payment) throw new Error('This gift has no payment recorded at the provider; refund it from its dashboard.');
  const last = d.refund_attempt;
  const key = last && last.amount === amount && last.from === d.refunded_amount ? last.key : `donation-${d.id}-${newToken().slice(0, 12)}`;
  await db.from('donations').update({ refund_attempt: { key, amount, from: d.refunded_amount, at: new Date().toISOString() } }).eq('id', id);
  const made = await provider.refund(d.provider_payment, amount, d.currency, key);
  await db.from('donations').update({ refund_attempt: null }).eq('id', id);
  if (made.status === 'failed') throw new Error(`${provider.label} did not make the refund${made.reason ? ` (${made.reason})` : ''}. Nothing was recorded.`);
  const { data: now } = await db.from('donations').select('refunded_amount').eq('id', id).single();
  const total = Math.max(Number(now?.refunded_amount) || 0, d.refunded_amount + amount);
  await db.from('donations').update({ refunded_amount: total, ...(total >= d.total ? { status: 'refunded' } : {}) }).eq('id', id).in('status', ['paid', 'refunded']);
  await sendDonationEmail('refunded', { ...d, refunded_amount: total }, siteOrigin(origin), { refund: amount }).catch((e) => console.error(`donations: refund email for ${d.code}: ${(e as Error).message}`));
  return { refunded: total, full: total >= d.total };
}

/** The Donations screen's tabs. */
export const DONATION_TABS: [string, string][] = [
  ['paid', 'Paid'],
  ['monthly', 'Monthly donors'],
  ['pending', 'Not completed'],
  ['refunded', 'Refunded'],
  ['all', 'All'],
];

/** The gifts a tab and search show, newest first (the Donations screen and its CSV). The Monthly donors tab is plans. */
export function donationsQuery(db: Db, tab: string, search = '', goal = '') {
  let q = db.from('donations').select('*', { count: 'exact' }).order('created_at', { ascending: false }).order('id', { ascending: false });
  if (tab === 'paid') q = q.eq('status', 'paid');
  else if (tab === 'pending') q = q.in('status', ['pending', 'cancelled', 'expired']);
  else if (tab === 'refunded') q = q.eq('status', 'refunded');
  if (/^[a-z0-9-]{1,40}$/.test(goal)) q = q.eq('goal', goal);
  const s = search.trim().replace(/[,()"\\*%]/g, ' ').trim().slice(0, 100);
  if (s) q = q.or(`code.ilike.*${s}*,email.ilike.*${s}*,name.ilike.*${s}*`);
  return q;
}

/** The monthly donors, newest first. */
export function plansQuery(db: Db, search = '') {
  let q = db.from('donation_plans').select('*', { count: 'exact' }).neq('status', 'incomplete').order('created_at', { ascending: false }).order('id', { ascending: false });
  const s = search.trim().replace(/[,()"\\*%]/g, ' ').trim().slice(0, 100);
  if (s) q = q.or(`email.ilike.*${s}*,name.ilike.*${s}*`);
  return q;
}

/** The gifts as CSV rows (the Donations screen's export). */
export function donationsCsvRows(rows: Donation[], goals: DonationGoal[] = []): string[][] {
  const money = (n: number) => (n / 100).toFixed(2);
  return [
    ['Receipt', 'Date', 'Paid', 'Status', 'Frequency', 'Name', 'Email', 'Anonymous', 'Gift', 'Fees covered', 'Charged', 'Refunded', 'Currency', 'Dedication', 'Goal', 'Page', 'Campaign', 'Provider', 'Payment'],
    ...rows.map((d) => [
      d.code, d.created_at, d.paid_at ?? '', d.status, d.kind === 'monthly' ? 'Monthly' : 'One-time', d.name, d.email, d.anonymous ? 'yes' : '', money(d.amount), money(d.fee), money(d.total), money(d.refunded_amount), d.currency,
      d.dedication, goals.find((g) => g.id === d.goal)?.name ?? d.goal, d.page, (d.campaign ?? '').split('|').filter(Boolean).join(' / '), d.provider, d.provider_payment ?? '',
    ]),
  ];
}

export { raised, inGoalDates, goalTotals } from './totals';

export interface DonationStats {
  from: string;
  to: string;
  /** Gifts paid in the range (refunded ones counted at what is left of them). */
  raised: number;
  gifts: number;
  donors: number;
  /** Donors who gave more than once in the range. */
  repeat: number;
  /** Fees donors covered. */
  fees: number;
  /** Monthly gifts active now, and what they bring in a month. */
  monthlyDonors: number;
  monthlyTotal: number;
  byGoal: { goal: string; raised: number; gifts: number }[];
  byCampaign: { campaign: string; raised: number; gifts: number }[];
}

/** The Donations screen's numbers over a range (local days, inclusive), in the donations' currency. */
export async function donationStats(db: Db, range: { from: string; to: string }, s: DonationSettings): Promise<DonationStats> {
  const start = new Date(`${range.from}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 1);
  const end = new Date(`${range.to}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 2);
  const { data } = await db.from('donations').select('status, amount, fee, total, refunded_amount, paid_at, email, goal, campaign, currency').in('status', ['paid', 'refunded']).gte('paid_at', start.toISOString()).lt('paid_at', end.toISOString()).limit(50_000);
  const rows = (data ?? []).filter((d) => d.currency === s.currency && d.paid_at && statsDay(new Date(d.paid_at as string)) >= range.from && statsDay(new Date(d.paid_at as string)) <= range.to) as unknown as Donation[];
  const byDonor = new Map<string, number>();
  for (const d of rows) byDonor.set(d.email.toLowerCase(), (byDonor.get(d.email.toLowerCase()) ?? 0) + 1);
  const group = (key: (d: Donation) => string) => {
    const m = new Map<string, { raised: number; gifts: number }>();
    for (const d of rows) {
      const k = key(d);
      if (!k) continue;
      const g = m.get(k) ?? { raised: 0, gifts: 0 };
      g.raised += raised(d);
      g.gifts++;
      m.set(k, g);
    }
    return [...m].map(([k, v]) => ({ k, ...v })).sort((a, b) => b.raised - a.raised);
  };
  const { data: plans } = await db.from('donation_plans').select('amount, currency').in('status', ['active', 'past_due']).limit(50_000);
  const active = (plans ?? []).filter((p) => p.currency === s.currency);
  return {
    from: range.from,
    to: range.to,
    raised: rows.reduce((a, d) => a + raised(d), 0),
    gifts: rows.length,
    donors: byDonor.size,
    repeat: [...byDonor.values()].filter((n) => n > 1).length,
    fees: rows.filter((d) => d.status === 'paid').reduce((a, d) => a + d.fee, 0),
    monthlyDonors: active.length,
    monthlyTotal: active.reduce((a, p) => a + Number(p.amount), 0),
    byGoal: group((d) => d.goal).map(({ k, raised: r, gifts }) => ({ goal: goalOf(s, k)?.name ?? k, raised: r, gifts })),
    byCampaign: group((d) => d.campaign).map(({ k, raised: r, gifts }) => ({ campaign: k.split('|').filter(Boolean).join(' / '), raised: r, gifts })),
  };
}
