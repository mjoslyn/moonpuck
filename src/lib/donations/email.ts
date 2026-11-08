// The donation emails: the donor's receipt (a one-time gift, or a monthly gift's first payment), each
// later month's receipt, a monthly payment that failed, a monthly gift cancelled, a refund, and the
// organization's copy of each gift. Each is designed in the email builder (Settings > Donations, Emails;
// the kit in src/admin/donation-email.ts) and rendered by the forms' renderer (src/lib/forms/email.ts)
// with the gift's merge tags, a Donation details block and the Payment block. What is sent: the site's
// design, else the default template for its kind (`donation:<kind>`), else the built-in one. Safe in the
// browser (the builder's preview).
import { formatMoney } from '../payments/money';
import { paymentTable, renderEmail, textVersion, type EmailContext, type EmailDoc, type EmailEvent, type EmailPayment } from '../forms/email';
import type { DonationEmail, DonationEmailKind } from './config';
import type { Donation } from './donations';

export const DONATION_EMAIL_KINDS: [DonationEmailKind, string][] = [
  ['receipt', 'Receipt'],
  ['monthly', 'Monthly receipt'],
  ['failed', 'Monthly payment failed'],
  ['cancelled', 'Monthly gift cancelled'],
  ['refunded', 'Refunded'],
  ['admin', 'Copy to the organization'],
];

export const DONATION_MERGE_TAGS: [string, string][] = [
  ['{name}', "Donor's name"],
  ['{first_name}', 'First name'],
  ['{email}', "Donor's email"],
  ['{amount}', 'The gift'],
  ['{fee}', 'Fees covered'],
  ['{total}', 'Charged'],
  ['{frequency}', 'One-time or Monthly'],
  ['{code}', 'Receipt number'],
  ['{date}', 'Date paid'],
  ['{dedication}', 'In honor or memory of'],
  ['{goal}', 'The fundraising goal it went to'],
  ['{refund}', 'This refund (refunded)'],
  ['{legal_name}', "The organization's legal name"],
  ['{tax_id}', 'Tax or charity number'],
  ['{receipt_note}', 'The receipt note (Settings > Donations)'],
  ['{manage_link}', 'Link to change or cancel a monthly gift'],
  ['{admin_link}', "Link to the gift's admin page (for the organization)"],
  ['{payment_summary}', 'Payment: the gift, total and details'],
  ['{site_name}', "The site's name"],
];

/** What the Donation details block can show ('all': the gift as a table). */
export const DONATION_DETAILS: [string, string][] = [
  ['all', 'The gift (a table)'],
  ['receipt', 'Receipt details: number, date, organization, tax number and note'],
  ['amount', 'The gift and what was charged'],
  ['dedication', 'In honor or memory of'],
  ['refund', 'Refund'],
  ['contact', "The donor's name and email"],
];

const block = (type: string, id: string, props: Record<string, unknown>) => ({ type, props: { id: `${type}-${id}`, ...props } });
const doc = (...content: ReturnType<typeof block>[]): EmailDoc => ({ root: { props: {} }, content });

/** Each email as it is until someone designs their own. */
export const DEFAULT_DONATION_EMAILS: Record<DonationEmailKind, Required<Omit<DonationEmail, 'text'>>> = {
  receipt: {
    subject: 'Thank you for your gift to {site_name}',
    design: doc(
      block('Heading', 'h', { text: 'Thank you, {first_name}', level: 2 }),
      block('Text', 't', { html: '<p>Your gift of <strong>{amount}</strong> means a great deal to us. Please keep this email as your receipt.</p>' }),
      block('FormField', 'f', { field: 'all', showLabel: true }),
      block('FormField', 'r', { field: 'receipt', showLabel: true }),
    ),
  },
  monthly: {
    subject: 'Your monthly gift to {site_name}',
    design: doc(
      block('Heading', 'h', { text: 'Thank you for giving every month', level: 2 }),
      block('Text', 't', { html: '<p>Hi {first_name},</p><p>We received this month’s gift of <strong>{amount}</strong>. Please keep this email as your receipt.</p>' }),
      block('FormField', 'f', { field: 'all', showLabel: true }),
      block('FormField', 'r', { field: 'receipt', showLabel: true }),
      block('Button', 'b', { label: 'Change or cancel your monthly gift', url: '{manage_link}' }),
    ),
  },
  failed: {
    subject: 'Your monthly gift to {site_name} didn’t go through',
    design: doc(
      block('Heading', 'h', { text: 'Your monthly gift didn’t go through', level: 2 }),
      block('Text', 't', { html: '<p>Hi {first_name},</p><p>This month’s gift of {amount} couldn’t be charged to your card. The card may have expired. You can update it below; the payment will be tried again over the next few days.</p>' }),
      block('Button', 'b', { label: 'Update your card', url: '{manage_link}' }),
    ),
  },
  cancelled: {
    subject: 'Your monthly gift to {site_name} has stopped',
    design: doc(
      block('Heading', 'h', { text: 'Your monthly gift has stopped', level: 2 }),
      block('Text', 't', { html: '<p>Hi {first_name},</p><p>Your monthly gift of {amount} has been cancelled, and you won’t be charged again. Thank you for all you have given.</p>' }),
    ),
  },
  refunded: {
    subject: 'A refund of your gift to {site_name}',
    design: doc(
      block('Heading', 'h', { text: 'Your refund', level: 2 }),
      block('Text', 't', { html: '<p>Hi {first_name},</p><p>We have refunded {refund} of your gift <strong>{code}</strong> to the card you paid with. It can take a few days to show.</p>' }),
      block('FormField', 'r', { field: 'refund', showLabel: true }),
    ),
  },
  admin: {
    subject: 'New gift {code}: {amount} ({frequency})',
    design: doc(
      block('Heading', 'h', { text: 'New gift {code}', level: 2 }),
      block('Text', 't', { html: '<p>{name} gave {amount} ({frequency}).</p>' }),
      block('FormField', 'c', { field: 'contact', showLabel: true }),
      block('FormField', 'f', { field: 'all', showLabel: true }),
      block('Button', 'b', { label: 'Open the gift', url: '{admin_link}' }),
    ),
  },
};

/** The email that is sent: the site's design, else the default template for its kind, else the built-in one. */
export function donationEmailToSend(kind: DonationEmailKind, site: DonationEmail | undefined, template?: { design: EmailDoc; text: string } | null): { subject: string; design: EmailDoc; text?: string } {
  const from = site?.design ? site : template ? { design: template.design, text: template.text || undefined } : undefined;
  return { subject: site?.subject?.trim() || DEFAULT_DONATION_EMAILS[kind].subject, design: from?.design ?? DEFAULT_DONATION_EMAILS[kind].design, text: from?.text };
}

/** What an email needs of a gift. */
export type DonationForEmail = Pick<Donation, 'code' | 'name' | 'email' | 'kind' | 'amount' | 'fee' | 'total' | 'currency' | 'refunded_amount' | 'dedication' | 'provider' | 'provider_payment' | 'paid_at' | 'status'>;

/** Where an email's links go, and the rest it says that isn't on the gift. */
export interface DonationEmailExtras {
  siteName: string;
  /** The gift's admin page. */
  admin: string;
  /** A monthly gift's page to change or cancel it (none for one-time gifts). */
  manage?: string;
  /** The goal's name it went to. */
  goal?: string;
  legalName?: string;
  taxId?: string;
  receiptNote?: string;
  /** This refund's amount (the refund email). */
  refund?: number;
  /** The site's time zone, for the payment's date. */
  timeZone?: string;
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const frequency = (d: DonationForEmail) => (d.kind === 'monthly' ? 'Monthly' : 'One-time');
const dateOf = (d: DonationForEmail, timeZone?: string) => (d.paid_at ? new Date(d.paid_at).toLocaleDateString('en-US', { timeZone, month: 'long', day: 'numeric', year: 'numeric' }) : '');

/** A paid gift's payment, for the Payment block and {payment_summary}. */
export function donationPayment(d: DonationForEmail, timeZone?: string): EmailPayment | null {
  if (!d.paid_at) return null;
  const items = [{ name: `${frequency(d)} gift`, unit: d.amount, quantity: 1 }, ...(d.fee ? [{ name: 'Fees covered', unit: d.fee, quantity: 1 }] : [])];
  return {
    items,
    amount: d.total,
    currency: d.currency,
    status: d.refunded_amount >= d.total ? 'Refunded' : d.refunded_amount ? `Paid, ${formatMoney(d.refunded_amount, d.currency)} refunded` : 'Paid',
    method: d.provider === 'stripe' ? 'Stripe' : d.provider === 'square' ? 'Square' : undefined,
    id: d.provider_payment ?? undefined,
    date: dateOf(d, timeZone),
  };
}

/** The merge tags' values, as text. */
export function donationTagValues(d: DonationForEmail, x: DonationEmailExtras): Record<string, string> {
  const m = (n: number) => formatMoney(n, d.currency);
  const pay = donationPayment(d, x.timeZone);
  return {
    '{name}': d.name,
    '{first_name}': d.name.split(/\s+/)[0] ?? d.name,
    '{email}': d.email,
    '{amount}': m(d.amount),
    '{fee}': d.fee ? m(d.fee) : '',
    '{total}': m(d.total),
    '{frequency}': frequency(d),
    '{code}': d.code,
    '{date}': dateOf(d, x.timeZone),
    '{dedication}': d.dedication ?? '',
    '{goal}': x.goal ?? '',
    '{refund}': x.refund ? m(x.refund) : '',
    '{legal_name}': x.legalName || x.siteName,
    '{tax_id}': x.taxId ?? '',
    '{receipt_note}': x.receiptNote ?? '',
    '{manage_link}': x.manage ?? '',
    '{admin_link}': x.admin,
    '{payment_summary}': pay ? textVersion(paymentTable(pay)) : '',
    '{site_name}': x.siteName,
  };
}

const merge = (text: string, values: Record<string, string>, html = false, rich: Record<string, string> = {}) =>
  text.replace(/\{[a-z_]+\}/g, (tag) => (html && tag in rich ? rich[tag] : tag in values ? (html ? esc(values[tag]).replace(/\n/g, '<br>') : values[tag]) : tag));

const cell = 'padding:6px 0;border-bottom:1px solid #e5e1dc;vertical-align:top';
const table = (rows: string) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;font-size:14px;line-height:1.5">${rows}</table>`;
const row = (label: string, value: string, strong = false) =>
  `<tr><td style="${cell}${strong ? ';font-weight:700' : ''}">${esc(label)}</td><td align="right" style="${cell};padding-left:12px;text-align:right${strong ? ';font-weight:700' : ''}">${esc(value)}</td></tr>`;

/** The Donation details block: the gift as a table, or one part of it, with or without its label. */
function detail(id: string, showLabel: boolean, d: DonationForEmail, x: DonationEmailExtras): string {
  const p = (label: string, value: string) => (value ? `${showLabel ? `<p style="margin:0 0 4px 0;font-weight:600">${esc(label)}</p>` : ''}<p style="margin:0">${value}</p>` : '');
  const m = (n: number) => formatMoney(n, d.currency);
  const amounts = `${row(`${frequency(d)} gift`, m(d.amount))}${d.fee ? row('Fees covered', m(d.fee)) : ''}${row('Charged', m(d.total), true)}`;
  switch (id) {
    case 'amount':
      return table(amounts);
    case 'receipt':
      return table(
        [
          row('Receipt number', d.code),
          ...(d.paid_at ? [row('Date', dateOf(d, x.timeZone))] : []),
          row('Received by', x.legalName || x.siteName),
          ...(x.taxId ? [row('Tax number', x.taxId)] : []),
        ].join(''),
      ) + (x.receiptNote ? `<p style="margin:8px 0 0 0;font-size:13px">${esc(x.receiptNote)}</p>` : '');
    case 'dedication':
      return p('In honor or memory of', esc(d.dedication));
    case 'refund':
      return x.refund || d.refunded_amount ? table(`${x.refund ? row('This refund', m(x.refund)) : ''}${row('Refunded in all', m(d.refunded_amount))}${row('Gift total', m(d.total))}`) : '';
    case 'contact':
      return [p('Name', esc(d.name)), p('Email', `<a href="mailto:${esc(d.email)}">${esc(d.email)}</a>`)].filter(Boolean).join('<div style="height:8px"></div>');
  }
  const more = `${d.dedication ? row('In honor or memory of', d.dedication) : ''}${x.goal ? row('Towards', x.goal) : ''}`;
  return `${showLabel ? `<p style="margin:0 0 4px 0;font-weight:600">Gift ${esc(d.code)}</p>` : ''}${table(amounts + more)}`;
}

/** How the email builder's renderer fills in a gift's email. */
export function donationEmailContext(d: DonationForEmail, x: DonationEmailExtras, origin: string): EmailContext {
  const values = donationTagValues(d, x);
  const payment = donationPayment(d, x.timeZone);
  const rich: Record<string, string> = payment ? { '{payment_summary}': paymentTable(payment) } : {};
  return { merge: (text, html) => merge(text, values, html, rich), field: (id, showLabel) => detail(id, showLabel, d, x), origin, payment };
}

/** A gift's email: subject, HTML and text (its own plain text, else made from the HTML). */
export function donationEmail(email: { subject: string; design: EmailDoc; text?: string }, d: DonationForEmail, x: DonationEmailExtras, origin: string, events?: Record<string, EmailEvent[]>) {
  const ctx = { ...donationEmailContext(d, x, origin), events };
  const values = donationTagValues(d, x);
  const subject = merge(email.subject, values);
  const html = renderEmail(email.design, ctx, subject);
  return { subject, html, text: email.text?.trim() ? merge(email.text, values) : textVersion(html) };
}

/** A made-up gift, for the builder's preview. */
export const SAMPLE_DONATION: DonationForEmail = {
  code: 'G7KM-2QXP',
  name: 'Alex Sample',
  email: 'alex@example.com',
  kind: 'once',
  amount: 5000,
  fee: 175,
  total: 5175,
  currency: 'USD',
  refunded_amount: 0,
  dedication: 'In memory of Pat Sample',
  provider: 'stripe',
  provider_payment: 'the payment ID',
  paid_at: '2026-10-15T15:00:00.000Z',
  status: 'paid',
};
