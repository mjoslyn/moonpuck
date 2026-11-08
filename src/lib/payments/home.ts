// Which copy of the site looks after a payment (a gift, a monthly gift, a shop order): the one it was made
// on, its address kept as `home` (SITE_URL then, else the request's). Copies of a site sync these rows, and
// a copy with a webhook of its own on the same provider account gets the same events, so only the home
// copy acts on them: marks them paid, records monthly payments, sends their emails, and closes, cancels or
// refunds them at the provider. A row without one (made before this) is looked after by any copy. Server only.
import { siteOrigin } from '../tickets/orders';

/** Where new rows are made: this copy's address. */
export const homeHere = (origin?: string) => siteOrigin(origin);

/** Whether this copy looks after the row. */
export const atHome = (row: { home?: string | null }, origin?: string) => !row.home || row.home === siteOrigin(origin);

/** Why another copy refuses to change it. */
export const notHome = (row: { home?: string | null }, what = 'This') => `${what} was made on ${row.home}; change it there.`;
