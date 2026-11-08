// A parcel's tracking as the shop shows it, safe in the browser: the carrier's own tracking page for a
// number, and what a carrier's status means to a buyer (src/lib/shop/carrier.ts reads the status).
import { CARRIERS } from './checkout-settings';

/** The carrier's own tracking page for a number, when it is one of CARRIERS. */
export function trackingLink(carrier: string, number: string): string {
  const n = encodeURIComponent(number);
  switch (carrier) {
    case 'usps':
      return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}`;
    case 'ups':
      return `https://www.ups.com/track?tracknum=${n}`;
    case 'fedex':
      return `https://www.fedex.com/fedextrack/?trknbr=${n}`;
    case 'dhl_express':
      return `https://www.dhl.com/global-en/home/tracking/tracking-express.html?tracking-id=${n}`;
  }
  return '';
}

/** A carrier's name: CARRIERS' own (or Shippo's test numbers' `shippo`), else its code made readable (`canada_post`: Canada Post). */
export const carrierName = (token: string) => (token === 'shippo' ? 'Shippo test numbers' : undefined) ?? CARRIERS.find(([k]) => k === token)?.[1] ?? token.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** A carrier's tracking status in words (Shippo's: PRE_TRANSIT, TRANSIT, DELIVERED, RETURNED, FAILURE, UNKNOWN). */
export const TRACKING_WORDS: Record<string, string> = {
  PRE_TRANSIT: 'Label made, waiting for the carrier',
  TRANSIT: 'On its way',
  DELIVERED: 'Delivered',
  RETURNED: 'Returned to the shop',
  FAILURE: 'A problem with the delivery',
  UNKNOWN: 'No news from the carrier yet',
};
