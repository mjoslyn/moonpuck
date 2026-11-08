// The email builder's kit for the donation emails (src/forms/EmailBuilder.tsx): a Donation details block,
// the gift's merge tags, the Payment block, and a preview filled in with a sample gift, rendered in the
// browser by the same code that sends the emails (src/lib/donations/email.ts).
import type { EmailKit } from '../forms/EmailBuilder';
import { fetchEmailEvents } from '../forms/email-events';
import type { DonationEmailKind, DonationSettings } from '../lib/donations/config';
import { DONATION_DETAILS, DONATION_MERGE_TAGS, SAMPLE_DONATION, donationEmail, donationEmailContext, donationPayment, type DonationForEmail } from '../lib/donations/email';

/** The plain text made from a design: each Donation details block as its merge tags. */
const DETAIL_TAGS: Record<string, [string, string]> = {
  all: ['Gift', '{frequency} gift of {amount}, charged {total}'],
  receipt: ['Receipt', '{code}, {date}, {legal_name} {tax_id}<br>{receipt_note}'],
  amount: ['Gift', '{amount}'],
  dedication: ['In honor or memory of', '{dedication}'],
  refund: ['Refund', '{refund}'],
  contact: ['Donor', '{name}<br>{email}'],
};

/** `subject`: read when the preview renders, so it shows the subject as it is then. */
export function donationEmailKit(kind: DonationEmailKind, subject: () => string, siteName: string, settings: () => Pick<DonationSettings, 'legalName' | 'taxId' | 'receiptNote'>): EmailKit {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const gift: DonationForEmail = kind === 'monthly' || kind === 'failed' || kind === 'cancelled' ? { ...SAMPLE_DONATION, kind: 'monthly' } : kind === 'refunded' ? { ...SAMPLE_DONATION, refunded_amount: 5175 } : SAMPLE_DONATION;
  const extras = () => ({ siteName, admin: `${origin}/admin/donations/`, manage: `${origin}/donate/?plan=sample`, goal: 'Spring appeal', refund: kind === 'refunded' ? 5175 : undefined, ...settings() });
  return {
    dataBlock: { label: 'Donation details', options: DONATION_DETAILS },
    templates: 'donation',
    tags: DONATION_MERGE_TAGS,
    // Tags show as written; Donation details blocks show the sample gift.
    canvas: { merge: (text) => text, field: (id, showLabel) => donationEmailContext(gift, extras(), origin).field(id, showLabel), origin, payment: donationPayment(gift) },
    payment: { note: 'Shows the gift’s payment: the gift, fees covered, total, provider and payment ID.' },
    textField: (id, showLabel) => {
      const [label, tags] = DETAIL_TAGS[id] ?? DETAIL_TAGS.all;
      return `<p>${showLabel ? `${label}: ` : ''}${tags}</p>`;
    },
    preview: {
      pickLabel: 'Filled in with',
      sampleLabel: 'A sample gift',
      render: async ({ design, text }) => {
        const mail = donationEmail({ subject: subject(), design, text }, gift, extras(), origin, await fetchEmailEvents(design));
        return { to: [kind === 'admin' ? 'The organization’s address' : gift.email], replyTo: kind === 'admin' ? gift.email : undefined, ...mail };
      },
    },
  };
}
