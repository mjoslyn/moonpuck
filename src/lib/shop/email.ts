// The shop's order emails: the buyer's confirmation, the shipped notice (with tracking), the refund notice
// and the shop's copy of each order. Each is designed in the email builder (Settings > Shop, Emails; the
// kit in src/admin/shop-email.ts) and rendered by the forms' renderer (src/lib/forms/email.ts) with the
// order's merge tags, an Order details block and the Payment block. What is sent: the site's design, else
// the default template for that kind (`shop:<kind>`), else the built-in one (`shopEmailToSend`). Safe in
// the browser (the builder's preview).
import { formatMoney } from '../payments/money';
import { paymentTable, renderEmail, textVersion, type EmailContext, type EmailDoc, type EmailEvent, type EmailPayment } from '../forms/email';
import { ticketEmailFrom, type TicketEmail } from '../tickets/config';
import { placeName } from './places';
import type { ShopAddress, ShopOrder } from './orders';

export type ShopEmailKind = 'confirmation' | 'shipped' | 'refunded' | 'admin';
export type ShopEmail = TicketEmail;

export const SHOP_EMAIL_KINDS: [ShopEmailKind, string][] = [
  ['confirmation', 'Order confirmation'],
  ['shipped', 'Shipped'],
  ['refunded', 'Refunded'],
  ['admin', 'Copy to the shop'],
];

export const SHOP_MERGE_TAGS: [string, string][] = [
  ['{name}', "Buyer's name"],
  ['{first_name}', 'First name'],
  ['{email}', "Buyer's email"],
  ['{phone}', "Buyer's phone"],
  ['{code}', 'Order number'],
  ['{items}', 'What was bought'],
  ['{subtotal}', 'Subtotal'],
  ['{discount}', 'Discount'],
  ['{discount_code}', 'Discount code'],
  ['{shipping}', 'Shipping or pickup fee'],
  ['{tax}', 'Tax'],
  ['{total}', 'Total'],
  ['{shipping_method}', 'Shipping method or pickup location'],
  ['{delivery}', 'Where it goes: the address, or where to pick it up'],
  ['{tracking}', 'Tracking number (shipped)'],
  ['{refund}', 'This refund (refunded)'],
  ['{refunded}', 'Refunded in all'],
  ['{order_summary}', 'Order summary'],
  ['{payment_summary}', 'Payment: items, total and details'],
  ['{downloads}', 'Download links (paid orders with downloads)'],
  ['{order_link}', 'Link to the order'],
  ['{admin_link}', "Link to the order's admin page (for the shop)"],
  ['{site_name}', "The site's name"],
];

/** What the Order details block can show ('all': the order as a table). */
export const SHOP_ORDER_DETAILS: [string, string][] = [
  ['all', 'Order summary (a table)'],
  ['items', 'What was bought'],
  ['totals', 'Discount, shipping, tax and total'],
  ['delivery', 'Shipping address or pickup location'],
  ['code', 'Order number'],
  ['tracking', 'Tracking number'],
  ['refund', 'Refund'],
  ['downloads', 'Download links'],
  ['contact', "The buyer's name, email and phone"],
];

const block = (type: string, id: string, props: Record<string, unknown>) => ({ type, props: { id: `${type}-${id}`, ...props } });
const doc = (...content: ReturnType<typeof block>[]): EmailDoc => ({ root: { props: {} }, content });

/** Each email as it is until someone designs their own. */
export const DEFAULT_SHOP_EMAILS: Record<ShopEmailKind, Required<Omit<ShopEmail, 'text'>>> = {
  confirmation: {
    subject: 'Your order {code} from {site_name}',
    design: doc(
      block('Heading', 'h', { text: 'Thank you for your order', level: 2 }),
      block('Text', 't', { html: '<p>Hi {first_name},</p><p>We have your order <strong>{code}</strong>.</p>' }),
      block('FormField', 'f', { field: 'all', showLabel: true }),
      block('FormField', 'w', { field: 'downloads', showLabel: true }),
      block('FormField', 'd', { field: 'delivery', showLabel: true }),
      block('Button', 'b', { label: 'View your order', url: '{order_link}' }),
    ),
  },
  shipped: {
    subject: 'Your order {code} from {site_name} has shipped',
    design: doc(
      block('Heading', 'h', { text: 'Your order is on its way', level: 2 }),
      block('Text', 't', { html: '<p>Hi {first_name},</p><p>Good news: your order <strong>{code}</strong> has shipped.</p>' }),
      block('FormField', 'k', { field: 'tracking', showLabel: true }),
      block('FormField', 'f', { field: 'all', showLabel: true }),
      block('FormField', 'd', { field: 'delivery', showLabel: true }),
      block('Button', 'b', { label: 'View your order', url: '{order_link}' }),
    ),
  },
  refunded: {
    subject: 'A refund for your order {code}',
    design: doc(
      block('Heading', 'h', { text: 'Your refund', level: 2 }),
      block('Text', 't', { html: '<p>Hi {first_name},</p><p>We have refunded {refund} for your order <strong>{code}</strong>, to the card you paid with. It can take a few days to show.</p>' }),
      block('FormField', 'r', { field: 'refund', showLabel: true }),
      block('Button', 'b', { label: 'View your order', url: '{order_link}' }),
    ),
  },
  admin: {
    subject: 'New order {code}: {total}',
    design: doc(
      block('Heading', 'h', { text: 'New order {code}', level: 2 }),
      block('Text', 't', { html: '<p>{name} placed an order for {total}.</p>' }),
      block('FormField', 'c', { field: 'contact', showLabel: true }),
      block('FormField', 'f', { field: 'all', showLabel: true }),
      block('FormField', 'd', { field: 'delivery', showLabel: true }),
      block('Button', 'b', { label: 'Open the order', url: '{admin_link}' }),
    ),
  },
};

/** The emails as Settings > Shop stores them (only those with something set). */
export function shopEmailsFrom(v: unknown): Partial<Record<ShopEmailKind, ShopEmail>> {
  const out: Partial<Record<ShopEmailKind, ShopEmail>> = {};
  for (const [kind] of SHOP_EMAIL_KINDS) {
    const e = ticketEmailFrom((v as any)?.[kind]);
    if (e.subject || e.design || e.text) out[kind] = Object.fromEntries(Object.entries(e).filter(([, x]) => x !== undefined)) as ShopEmail;
  }
  return out;
}

/** The email that is sent: the site's design, else the default template for its kind, else the built-in one. */
export function shopEmailToSend(kind: ShopEmailKind, site: ShopEmail | undefined, template?: { design: EmailDoc; text: string } | null): { subject: string; design: EmailDoc; text?: string } {
  const from = site?.design ? site : template ? { design: template.design, text: template.text || undefined } : undefined;
  return { subject: site?.subject?.trim() || DEFAULT_SHOP_EMAILS[kind].subject, design: from?.design ?? DEFAULT_SHOP_EMAILS[kind].design, text: from?.text };
}

/** An address as lines: street, city with state and ZIP, country. */
export const addressLines = (a: ShopAddress | null | undefined): string[] =>
  a ? [a.line1, a.line2, [a.city, [a.state, a.zip].filter(Boolean).join(' ')].filter(Boolean).join(', '), placeName(a.country)].filter((x): x is string => !!x) : [];

/** What an email needs of an order. */
export type OrderForEmail = Pick<
  ShopOrder,
  'code' | 'name' | 'email' | 'phone' | 'lines' | 'subtotal' | 'discount' | 'discount_code' | 'shipping_total' | 'tax' | 'total' | 'currency' | 'refunded_amount' | 'fulfilment' | 'shipping' | 'address' | 'tracking' | 'provider' | 'provider_payment' | 'paid_at' | 'status'
>;

/** Where an email's links go, and the rest it says that isn't on the order. */
export interface ShopEmailExtras {
  /** The buyer's order page. */
  order: string;
  /** The order's admin page. */
  admin: string;
  siteName: string;
  /** This refund's amount (the refund email). */
  refund?: number;
  /** The site's time zone, for the payment's date. */
  timeZone?: string;
  /** A paid order's downloads: each file's name and link (src/lib/shop/downloads.ts). */
  downloads?: { name: string; url: string }[];
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const lineName = (l: OrderForEmail['lines'][number]) => `${l.title}${l.label ? ` (${l.label})` : ''}`;

/** The rows of the order's totals: [label, amount], the total last. */
function totalRows(o: OrderForEmail): [string, string][] {
  const m = (n: number) => formatMoney(n, o.currency);
  return [
    ['Subtotal', m(o.subtotal)],
    ...(o.discount ? [[`Discount${o.discount_code ? ` (${o.discount_code})` : ''}`, `−${m(o.discount)}`] as [string, string]] : []),
    ...(o.shipping ? [[`${o.shipping.kind === 'pickup' ? 'Pickup' : 'Shipping'}: ${o.shipping.name}`, o.shipping_total ? m(o.shipping_total) : 'Free'] as [string, string]] : []),
    ...(o.tax ? [['Tax', m(o.tax)] as [string, string]] : []),
    ['Total', m(o.total)],
  ];
}

/** Where the order goes, as lines: "Shipping to" and the address, or "Pick up at" with the place and hours. */
function deliveryLines(o: OrderForEmail): [string, string[]] | null {
  if (o.fulfilment === 'pickup' && o.shipping) return [`Pick up at ${o.shipping.name}`, [...String(o.shipping.address ?? '').split('\n'), o.shipping.hours ?? ''].filter(Boolean)];
  if (o.fulfilment === 'ship' && o.address) return ['Shipping to', [o.name, ...addressLines(o.address)]];
  return null;
}

/** A paid order's payment, for the Payment block and {payment_summary}; none for free or unpaid ones. */
export function orderPayment(o: OrderForEmail, timeZone?: string): EmailPayment | null {
  if (o.provider === 'free' || !o.paid_at) return null;
  const items = o.lines.map((l) => (l.discount ? { name: `${lineName(l)} × ${l.quantity}`, unit: l.total - l.discount, quantity: 1 } : { name: lineName(l), unit: l.unit, quantity: l.quantity }));
  if (o.shipping_total) items.push({ name: o.shipping?.kind === 'pickup' ? 'Pickup' : 'Shipping', unit: o.shipping_total, quantity: 1 });
  if (o.tax) items.push({ name: 'Tax', unit: o.tax, quantity: 1 });
  return {
    items,
    amount: o.total,
    currency: o.currency,
    status: o.refunded_amount >= o.total ? 'Refunded' : o.refunded_amount ? `Paid, ${formatMoney(o.refunded_amount, o.currency)} refunded` : 'Paid',
    method: o.provider === 'stripe' ? 'Stripe' : o.provider === 'square' ? 'Square' : undefined,
    id: o.provider_payment ?? undefined,
    date: new Date(o.paid_at).toLocaleDateString('en-US', { timeZone, month: 'long', day: 'numeric', year: 'numeric' }),
  };
}

/** The merge tags' values, as text. */
export function shopTagValues(o: OrderForEmail, x: ShopEmailExtras): Record<string, string> {
  const m = (n: number) => formatMoney(n, o.currency);
  const where = deliveryLines(o);
  const pay = orderPayment(o, x.timeZone);
  return {
    '{name}': o.name,
    '{first_name}': o.name.split(/\s+/)[0] ?? o.name,
    '{email}': o.email,
    '{phone}': o.phone ?? '',
    '{code}': o.code,
    '{items}': o.lines.map((l) => `${l.quantity} × ${lineName(l)}`).join(', '),
    '{subtotal}': m(o.subtotal),
    '{discount}': o.discount ? m(o.discount) : '',
    '{discount_code}': o.discount_code ?? '',
    '{shipping}': o.shipping ? (o.shipping_total ? m(o.shipping_total) : 'Free') : '',
    '{tax}': o.tax ? m(o.tax) : '',
    '{total}': m(o.total),
    '{shipping_method}': o.shipping?.name ?? '',
    '{delivery}': where ? [where[0], ...where[1]].join('\n') : '',
    '{tracking}': o.tracking ?? '',
    '{refund}': x.refund ? m(x.refund) : '',
    '{refunded}': o.refunded_amount ? m(o.refunded_amount) : '',
    '{order_summary}': [...o.lines.map((l) => `${l.quantity} × ${lineName(l)}: ${m(l.total)}`), ...totalRows(o).map(([k, v]) => `${k}: ${v}`)].join('\n'),
    '{payment_summary}': pay ? textVersion(paymentTable(pay)) : '',
    '{downloads}': (x.downloads ?? []).map((d) => `${d.name}: ${d.url}`).join('\n'),
    '{order_link}': x.order,
    '{admin_link}': x.admin,
    '{site_name}': x.siteName,
  };
}

/** Merge tags filled in, in one pass: HTML-escaped values (line breaks kept) when `html`, or the HTML in `rich`. */
const merge = (text: string, values: Record<string, string>, html = false, rich: Record<string, string> = {}) =>
  text.replace(/\{[a-z_]+\}/g, (tag) => (html && tag in rich ? rich[tag] : tag in values ? (html ? esc(values[tag]).replace(/\n/g, '<br>') : values[tag]) : tag));

const cell = 'padding:6px 0;border-bottom:1px solid #e5e1dc;vertical-align:top';
const table = (rows: string) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;font-size:14px;line-height:1.5">${rows}</table>`;
const amountRow = (label: string, value: string, strong = false) =>
  `<tr><td style="${cell}${strong ? ';font-weight:700' : ''}">${esc(label)}</td><td align="right" style="${cell};padding-left:12px;text-align:right;white-space:nowrap${strong ? ';font-weight:700' : ''}">${esc(value)}</td></tr>`;

/** The Order details block: the order as a table, or one part of it, with or without its label. */
function orderDetail(id: string, showLabel: boolean, o: OrderForEmail, x: ShopEmailExtras): string {
  const p = (label: string, value: string) => (value ? `${showLabel ? `<p style="margin:0 0 4px 0;font-weight:600">${esc(label)}</p>` : ''}<p style="margin:0">${value}</p>` : '');
  const m = (n: number) => formatMoney(n, o.currency);
  const items = o.lines.map((l) => amountRow(`${l.quantity} × ${lineName(l)}`, m(l.total))).join('');
  const totals = totalRows(o)
    .map(([k, v], i, all) => amountRow(k, v, i === all.length - 1))
    .join('');
  switch (id) {
    case 'items':
      return table(items);
    case 'totals':
      return table(totals);
    case 'delivery': {
      const where = deliveryLines(o);
      return where ? `${showLabel ? `<p style="margin:0 0 4px 0;font-weight:600">${esc(where[0])}</p>` : ''}<p style="margin:0">${where[1].map(esc).join('<br>')}</p>` : '';
    }
    case 'code':
      return p('Order number', `<strong style="font-size:20px;letter-spacing:0.08em">${esc(o.code)}</strong>`);
    case 'tracking':
      return o.tracking ? p('Tracking number', `<strong>${esc(o.tracking)}</strong>`) : '';
    case 'refund':
      return x.refund || o.refunded_amount
        ? table(`${x.refund ? amountRow('This refund', m(x.refund)) : ''}${amountRow('Refunded in all', m(o.refunded_amount))}${amountRow('Order total', m(o.total))}`)
        : '';
    case 'downloads':
      return x.downloads?.length ? p(x.downloads.length === 1 ? 'Your download' : 'Your downloads', x.downloads.map((d) => `<a href="${esc(d.url)}">${esc(d.name)}</a>`).join('<br>')) : '';
    case 'contact':
      return [p('Name', esc(o.name)), p('Email', `<a href="mailto:${esc(o.email)}">${esc(o.email)}</a>`), o.phone ? p('Phone', esc(o.phone)) : ''].filter(Boolean).join('<div style="height:8px"></div>');
  }
  return `${showLabel ? `<p style="margin:0 0 4px 0;font-weight:600">Order ${esc(o.code)}</p>` : ''}${table(items + totals)}`;
}

/** How the email builder's renderer fills in an order's email. */
export function shopEmailContext(o: OrderForEmail, x: ShopEmailExtras, origin: string): EmailContext {
  const values = shopTagValues(o, x);
  const payment = orderPayment(o, x.timeZone);
  const rich: Record<string, string> = payment ? { '{payment_summary}': paymentTable(payment) } : {};
  return { merge: (text, html) => merge(text, values, html, rich), field: (id, showLabel) => orderDetail(id, showLabel, o, x), origin, payment };
}

/** An order's email: subject, HTML and text (its own plain text, else made from the HTML). */
export function shopEmail(email: { subject: string; design: EmailDoc; text?: string }, o: OrderForEmail, x: ShopEmailExtras, origin: string, events?: Record<string, EmailEvent[]>) {
  const ctx = { ...shopEmailContext(o, x, origin), events };
  const values = shopTagValues(o, x);
  const subject = merge(email.subject, values);
  const html = renderEmail(email.design, ctx, subject);
  return { subject, html, text: email.text?.trim() ? merge(email.text, values) : textVersion(html) };
}

/** A made-up order, for the builder's preview. */
export const SAMPLE_SHOP_ORDER: OrderForEmail = {
  code: 'H4TQ-8ZMB',
  name: 'Alex Sample',
  email: 'alex@example.com',
  phone: '(716) 555-0100',
  lines: [
    { product: 0, variant: 'default', title: 'Harbour mug', label: 'Blue', sku: 'MUG-1', unit: 1800, quantity: 2, total: 3600, discount: 360, tax: 0, track: true, restocked: 0 },
    { product: 0, variant: 'default', title: 'Tea towel', label: '', sku: 'TT-1', unit: 1200, quantity: 1, total: 1200, discount: 120, tax: 0, track: true, restocked: 0 },
  ],
  subtotal: 4800,
  discount: 480,
  discount_code: 'SUMMER10',
  shipping_total: 600,
  tax: 0,
  total: 4920,
  currency: 'usd',
  refunded_amount: 0,
  fulfilment: 'ship',
  shipping: { id: 'manual:us:std', kind: 'ship', name: 'Standard', price: 600, source: 'manual' } as OrderForEmail['shipping'],
  address: { line1: '12 Elm Street', city: 'Example Town', state: 'NY', zip: '14731', country: 'US' },
  tracking: '',
  provider: 'stripe',
  provider_payment: 'the payment ID',
  paid_at: '2026-10-15T15:00:00.000Z',
  status: 'paid',
};
