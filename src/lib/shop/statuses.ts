// The shop's own order statuses (Settings > Shop, Order statuses; settings.site.shop.statuses): names the
// shop gives the steps an order goes through (Being made, Ready, On hold...), set on an order's page
// beside its payment status (shop_orders.custom_status). Each can email the buyer when an order is moved
// to it, with an email designed in the email builder. Safe in the browser.
import type { EmailDoc } from '../forms/email';
import { ticketEmailFrom } from '../tickets/config';
import type { ShopEmail } from './email';

export interface ShopStatus {
  /** Stable: orders keep it. */
  id: string;
  name: string;
  /** Email the buyer when an order is moved to it. */
  notify?: boolean;
  /** Its email (subject, design, plain text); empty, the built-in one (`statusEmail`). */
  email?: ShopEmail;
}

export const MAX_STATUSES = 30;

/** The statuses as stored, cleaned: named, with distinct ids, at most MAX_STATUSES. */
export function orderStatusesFrom(v: unknown): ShopStatus[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: ShopStatus[] = [];
  for (const raw of v) {
    const id = String(raw?.id ?? '');
    const name = String(raw?.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (!/^[\w-]{1,40}$/.test(id) || !name || seen.has(id)) continue;
    seen.add(id);
    const e = ticketEmailFrom(raw?.email);
    const email = Object.fromEntries(Object.entries(e).filter(([, x]) => x !== undefined)) as ShopEmail;
    out.push({ id, name, ...(raw?.notify === true ? { notify: true } : {}), ...(Object.keys(email).length ? { email } : {}) });
    if (out.length >= MAX_STATUSES) break;
  }
  return out;
}

const block = (type: string, id: string, props: Record<string, unknown>) => ({ type, props: { id: `${type}-${id}`, ...props } });

/** The built-in email for a status: the order moved to it, and the order's details. */
export const STATUS_EMAIL: { subject: string; design: EmailDoc } = {
  subject: 'Your order {code} from {site_name}: {order_status}',
  design: {
    root: { props: {} },
    content: [
      block('Heading', 'h', { text: 'Your order: {order_status}', level: 2 }),
      block('Text', 't', { html: '<p>Hi {first_name},</p><p>Your order <strong>{code}</strong> is now: <strong>{order_status}</strong>.</p>' }),
      block('FormField', 'f', { field: 'all', showLabel: true }),
      block('Button', 'b', { label: 'View your order', url: '{order_link}' }),
    ],
  },
};

/** The email a status sends: its own subject and design, else the built-in ones. */
export function statusEmail(s: ShopStatus): { subject: string; design: EmailDoc; text?: string } {
  return { subject: s.email?.subject?.trim() || STATUS_EMAIL.subject, design: s.email?.design ?? STATUS_EMAIL.design, text: s.email?.design ? s.email.text : undefined };
}

/** A new status id. */
export const newStatusId = () => `s${Math.random().toString(36).slice(2, 8)}`;
