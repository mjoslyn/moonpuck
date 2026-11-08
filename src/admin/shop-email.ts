// The email builder's kit for the shop's order emails (src/forms/EmailBuilder.tsx): an Order details block,
// the order's merge tags, the Payment block, and a preview filled in with a sample order, rendered in the
// browser by the same code that sends the emails (src/lib/shop/email.ts).
import type { EmailKit } from '../forms/EmailBuilder';
import { fetchEmailEvents } from '../forms/email-events';
import { SAMPLE_SHOP_ORDER, SHOP_MERGE_TAGS, SHOP_ORDER_DETAILS, orderPayment, shopEmail, shopEmailContext, type OrderForEmail, type ShopEmailKind } from '../lib/shop/email';

/** The plain text made from a design: each Order details block as its merge tags. */
const DETAIL_TAGS: Record<string, [string, string]> = {
  all: ['Order', '{order_summary}'],
  items: ['Items', '{items}'],
  totals: ['Total', '{total}'],
  delivery: ['Delivery', '{delivery}'],
  code: ['Order number', '{code}'],
  tracking: ['Tracking number', '{tracking}'],
  refund: ['Refund', '{refund}'],
  downloads: ['Downloads', '{downloads}'],
  contact: ['Buyer', '{name}<br>{email}<br>{phone}'],
};

/** `subject`: read when the preview renders, so it shows the subject as it is then. */
export function shopEmailKit(kind: ShopEmailKind, subject: () => string, siteName: string): EmailKit {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  // Each kind's sample as it would be when sent.
  const order: OrderForEmail =
    kind === 'shipped' ? { ...SAMPLE_SHOP_ORDER, tracking: '1Z999AA10123456784' } : kind === 'refunded' ? { ...SAMPLE_SHOP_ORDER, refunded_amount: 1200 } : SAMPLE_SHOP_ORDER;
  const extras = { order: `${origin}/cart/?order=sample`, admin: `${origin}/admin/shop/`, siteName, refund: kind === 'refunded' ? 1200 : undefined, downloads: kind === 'admin' ? undefined : [{ name: 'Harbour pattern.pdf', url: `${origin}/api/shop/download?order=sample&line=0` }] };
  const sample = shopEmailContext(order, extras, origin);
  return {
    dataBlock: { label: 'Order details', options: SHOP_ORDER_DETAILS },
    templates: 'shop',
    tags: SHOP_MERGE_TAGS,
    // Tags show as written; Order details blocks show the sample order.
    canvas: { merge: (text) => text, field: sample.field, origin, payment: orderPayment(order) },
    payment: { note: 'Shows the order’s payment: its items, total, provider and payment ID. Free orders show nothing.' },
    textField: (id, showLabel) => {
      const [label, tags] = DETAIL_TAGS[id] ?? DETAIL_TAGS.all;
      return `<p>${showLabel ? `${label}: ` : ''}${tags}</p>`;
    },
    preview: {
      pickLabel: 'Filled in with',
      sampleLabel: 'A sample order',
      render: async ({ design, text }) => {
        const mail = shopEmail({ subject: subject(), design, text }, order, extras, origin, await fetchEmailEvents(design));
        return { to: [kind === 'admin' ? 'The shop’s address' : order.email], replyTo: kind === 'admin' ? order.email : undefined, ...mail };
      },
    },
  };
}
