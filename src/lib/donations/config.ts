// Donations: an optional feature (Settings > Donations, settings.site.donations), off until an admin
// turns it on. The Donate block takes one-time gifts through the site's payment provider (Stripe or
// Square) and, through Stripe, monthly gifts; the Donation progress block shows a fundraising goal's
// total. Amounts are in minor units (cents). Safe in the browser.
import type { PaymentProvider } from '../payments';
import { MIN_CHARGE } from '../payments/money';
import { ticketEmailFrom, type TicketEmail } from '../tickets/config';

/** The donation blocks: offered in the editor, and shown on the site, only while donations are on. */
export const DONATION_BLOCKS = ['donate', 'donation-progress'];

/** The donation page (a page with that address, else a built-in one holding a Donate block). */
export const DONATE_PATH = '/donate/';

/** The largest gift the form takes (in minor units), against typing mistakes. */
export const MAX_GIFT = 10_000_000;
/** The most preset amounts the Donate block offers. */
export const MAX_AMOUNTS = 8;
/** The most fundraising goals kept. */
export const MAX_GOALS = 50;

export type DonationEmailKind = 'receipt' | 'monthly' | 'failed' | 'cancelled' | 'refunded' | 'admin';
export type DonationEmail = TicketEmail;

/** A fundraising goal: what gifts made towards it add up to, against its target, between its dates. */
export interface DonationGoal {
  /** Made from its name and kept, so gifts stay counted under it when it is renamed. */
  id: string;
  name: string;
  /** The target, in minor units. */
  target: number;
  /** Local dates (YYYY-MM-DD), either open: only gifts paid on or between them count. */
  start?: string;
  end?: string;
}

export interface DonationSettings {
  enabled: boolean;
  /** ISO 4217, upper case. */
  currency: string;
  /** The payment provider for one-time gifts (monthly gifts are Stripe's): the one chosen if its keys are set. */
  provider?: PaymentProvider;
  /** The preset amounts the Donate block offers, in minor units. */
  amounts: number[];
  /** The smallest gift, in minor units (at least the providers' smallest charge). */
  minimum: number;
  /** Offer monthly gifts (Stripe only). */
  monthly: boolean;
  /** "Cover the fees": a percent and a fixed amount (minor units) added on top when the donor ticks it; 0 and 0: not offered. */
  feePercent: number;
  feeFixed: number;
  /** Ask for an "in honor or memory of" dedication. */
  dedication: boolean;
  /** Offer giving anonymously (left out of public lists; the site still keeps the name). */
  anonymous: boolean;
  /** For the receipt: the organization's legal name, its tax or charity number, and a note (what is deductible). */
  legalName: string;
  taxId: string;
  receiptNote: string;
  /** The Email me news tick: the mailing lists it signs up to and its words (while Mailing is on). */
  news: { lists: number[]; label: string };
  goals: DonationGoal[];
  /** Send the organization a copy of each gift. */
  notify: boolean;
  emails: Partial<Record<DonationEmailKind, DonationEmail>>;
}

export const DEFAULT_AMOUNTS = [2500, 5000, 10000, 25000];
export const DEFAULT_NEWS_LABEL = 'Email me news and updates';
export const DEFAULT_RECEIPT_NOTE = 'No goods or services were provided in exchange for this gift.';

const num = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A goal's id from its name: lower case, hyphens for spaces, at most 40 characters. */
export const goalId = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'goal';

/** The goals as saved: named, with a target, unique ids (a new one made from its name), at most MAX_GOALS. */
export function cleanGoals(raw: unknown): DonationGoal[] {
  const out: DonationGoal[] = [];
  for (const g of Array.isArray(raw) ? raw : []) {
    const name = text(g?.name, 120);
    const target = num(g?.target, 0, MAX_GIFT * 100, 0);
    if (!name || out.length >= MAX_GOALS) continue;
    let id = /^[a-z0-9-]{1,40}$/.test(String(g?.id ?? '')) ? String(g.id) : goalId(name);
    for (let n = 2; out.some((o) => o.id === id); n++) id = `${goalId(name).slice(0, 36)}-${n}`;
    out.push({ id, name, target, ...(DATE.test(String(g?.start ?? '')) ? { start: g.start } : {}), ...(DATE.test(String(g?.end ?? '')) ? { end: g.end } : {}) });
  }
  return out;
}

const KINDS: DonationEmailKind[] = ['receipt', 'monthly', 'failed', 'cancelled', 'refunded', 'admin'];

function emailsFrom(v: unknown): Partial<Record<DonationEmailKind, DonationEmail>> {
  const out: Partial<Record<DonationEmailKind, DonationEmail>> = {};
  for (const kind of KINDS) {
    const e = ticketEmailFrom((v as any)?.[kind]);
    if (e.subject || e.design || e.text) out[kind] = Object.fromEntries(Object.entries(e).filter(([, x]) => x !== undefined)) as DonationEmail;
  }
  return out;
}

/** The settings with their defaults. */
export function donationSettings(site: Record<string, any> | null | undefined): DonationSettings {
  const s = site?.donations ?? {};
  const amounts = (Array.isArray(s.amounts) ? s.amounts : DEFAULT_AMOUNTS)
    .map((a: unknown) => num(a, 0, MAX_GIFT, 0))
    .filter((a: number) => a >= MIN_CHARGE);
  return {
    enabled: s.enabled === true,
    currency: /^[A-Za-z]{3}$/.test(String(s.currency ?? '')) ? String(s.currency).toUpperCase() : 'USD',
    provider: s.provider === 'stripe' || s.provider === 'square' ? s.provider : undefined,
    amounts: [...new Set<number>(amounts)].sort((a, b) => a - b).slice(0, MAX_AMOUNTS),
    minimum: num(s.minimum, MIN_CHARGE, MAX_GIFT, 500),
    monthly: s.monthly !== false,
    feePercent: Math.min(20, Math.max(0, Math.round((Number(s.feePercent) || 0) * 100) / 100)),
    feeFixed: num(s.feeFixed, 0, 1000, 0),
    dedication: s.dedication !== false,
    anonymous: s.anonymous !== false,
    legalName: text(s.legalName, 200),
    taxId: text(s.taxId, 60),
    receiptNote: typeof s.receiptNote === 'string' ? s.receiptNote.trim().slice(0, 1000) : DEFAULT_RECEIPT_NOTE,
    news: { lists: (Array.isArray(s.news?.lists) ? s.news.lists : []).map(Number).filter((n: number) => Number.isInteger(n) && n > 0), label: text(s.news?.label, 200) },
    goals: cleanGoals(s.goals),
    notify: s.notify !== false,
    emails: emailsFrom(s.emails),
  };
}

/** The settings as saved: what differs from the defaults. */
export function donationSettingsFrom(raw: unknown): Record<string, unknown> | undefined {
  const s = donationSettings({ donations: raw });
  const d = donationSettings({});
  const out: Record<string, unknown> = {};
  if (s.enabled) out.enabled = true;
  if (s.currency !== d.currency) out.currency = s.currency;
  if (s.provider) out.provider = s.provider;
  if (JSON.stringify(s.amounts) !== JSON.stringify(d.amounts)) out.amounts = s.amounts;
  if (s.minimum !== d.minimum) out.minimum = s.minimum;
  if (!s.monthly) out.monthly = false;
  if (s.feePercent) out.feePercent = s.feePercent;
  if (s.feeFixed) out.feeFixed = s.feeFixed;
  if (!s.dedication) out.dedication = false;
  if (!s.anonymous) out.anonymous = false;
  if (s.legalName) out.legalName = s.legalName;
  if (s.taxId) out.taxId = s.taxId;
  if (s.receiptNote !== d.receiptNote) out.receiptNote = s.receiptNote;
  if (s.news.lists.length || s.news.label) out.news = s.news;
  if (s.goals.length) out.goals = s.goals;
  if (!s.notify) out.notify = false;
  if (Object.keys(s.emails).length) out.emails = s.emails;
  return Object.keys(out).length ? out : undefined;
}

/** Whether donations are on. */
export const donationsOn = (site: Record<string, any> | null | undefined): boolean => site?.donations?.enabled === true;

/** Whether the fees can be covered (a percent or a fixed amount is set). */
export const coversFees = (s: Pick<DonationSettings, 'feePercent' | 'feeFixed'>) => s.feePercent > 0 || s.feeFixed > 0;

/**
 * What a donor adds to cover the fees on `amount`, so the organization receives the whole gift: the
 * charge is (amount + fixed) / (1 − percent), and the fee what that adds.
 */
export function coverFee(amount: number, s: Pick<DonationSettings, 'feePercent' | 'feeFixed'>): number {
  if (!coversFees(s) || amount <= 0) return 0;
  return Math.ceil((amount + s.feeFixed) / (1 - s.feePercent / 100)) - amount;
}

/** A goal by id. */
export const goalOf = (s: Pick<DonationSettings, 'goals'>, id: string | null | undefined) => (id ? s.goals.find((g) => g.id === id) : undefined);
