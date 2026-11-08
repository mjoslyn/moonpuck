# Shop plan

The shop is built in phases on the preview branch (`claude/dazzling-euler-p0tfxa`) and isn't merged to
`main` or the sites until the owner says so. Phase 1 is done (commit `288083f`; CORE.md, Shop). This
file is the plan for the rest, with the decisions already made.

## Decisions

- Shipping: manual rates and pickup now; a carrier API may come later, so rates come through one
  interface a carrier can plug into.
- Tax: the shop's own rates (one rate, optionally per state) always work, with either provider. With
  Stripe, the admin can switch on Stripe Tax instead for exact local rates (Stripe works the tax out at
  checkout; it charges about 0.5% a sale, and the store must still register where it owes tax). Square's
  payment links have no automatic tax, so a Square shop uses the shop's own rates.
- Variants are in the first release (done in phase 1).
- Discounts are in the first usable release (phase 2).
- Restocking on a refund or cancel is the admin's choice each time; nothing restocks on its own.
- Orders and stock are synced and backed up, with the rules below.
- Snowbelt keeps the shop off (card processors don't take cannabis); it has its own `product` type,
  which the shop leaves alone.

## Phase 1 (done)

Feature switch (Settings > Shop: on, currency, weight unit), the core's `product` type and
`product_category` taxonomy, the product's Shop settings (price, compare-at price, SKU, weight, shipped,
pickup only, taxed, most per order, count stock, up to 3 options, a variant per combination with its own
price, SKU, weight and image, or not sold), stock per variant in `shop_stock` (saved as it changes),
the Product price, Add to cart, Cart and Cart link blocks, the product card, the cart in the browser
with the server's quote (`/api/shop/quote`) and availability (`/api/shop/availability`), the built-in
`/cart/` page, and the `single-product` and `archive-product` templates made when the shop is turned on.

## Phase 2: checkout (the first usable release)

Done so far: the checkout settings (provider, hold, zones and rates, pickup, tax), the totals engine
(`src/lib/shop/totals.ts`, returned by the quote endpoint), member pricing, and orders and checkout
(`src/lib/shop/orders.ts`: the Cart's checkout, `shop_order_create` with stock holds, the return, the
webhook, stock taken off when paid, holds expiring, the order's page, plain confirmation emails) and the
Orders screen (tabs, search, CSV; mark shipped with tracking or picked up, notes, resend, cancel, refund
and restock by line), and discounts (`src/lib/shop/discounts.ts`, `discount-lookup.ts`, Shop > Discounts).
An order keeps its lines on the order (`shop_orders.lines`, JSON) rather than in a
table of their own, so the order and its lines are written in one statement with the stock check. Next:
the order emails in the email builder, and sync and backups.

### Settings > Shop

- Payment provider (Stripe or Square, offered as Settings > Tickets does, keys from Connections), how
  long an unpaid order holds its stock (30-120 minutes), the store's address for pickup.
- Shipping zones: a set of countries or US states, each with rates (name, price, and optionally a rule:
  by order subtotal bands, by weight bands, free over an amount). The buyer picks from the rates that
  fit their address and cart.
- Pickup locations: name, address, hours note and a fee (often none). No shipping address asked.
- Tax: **Tax rates set here** (the default) or, with Stripe as the provider, **Stripe Tax** (see Tax
  below). Each product's **Taxed** switch decides which lines are taxed either way.
- Order emails (confirmation, shipped, refunded, the admin's copy).

### Shipping rates

- `ShippingSource.quote(cart, address) => Rate[]`; the manual rates are the first source. A carrier
  (Shippo, EasyPost, USPS) can be a second later, its key under Connections, without changing checkout.
- A cart with a pickup-only item offers only pickup; a cart with nothing shipped asks no address.
- Each order keeps the chosen rate's name, price and source.

### Shipping zones and rates

- Settings > Shop > Shipping (`settings.site.shop.shipping`): zones, each a name and the places it
  covers (countries, or US states within the US), checked in order, the first that covers the address
  wins; a "Rest of the world" zone is optional (without one, other addresses can't be shipped to, and
  checkout says so).
- Each zone's rates: a name ("Standard", "Express"), a price, and optionally a rule: by order subtotal
  bands, by total weight bands (the products' weights, in the shop's weight unit; a product without a
  weight counts as 0), or free over a subtotal. A rate whose rule doesn't fit the cart isn't offered.
- The rates are a `ShippingSource` (`manual`); checkout asks every source on (`quote(cart, address)`)
  and lists their rates together, cheapest first. A source that fails or times out is left out with a
  note in the server's log, never stopping checkout while another source answers.
- Only lines marked **shipped** count toward weight and need an address; a cart with nothing shipped
  (services, downloads) skips the address and shipping.

### Pickup

- Pickup locations (`settings.site.shop.pickup`): name, address, hours note and a fee (often none),
  offered beside the rates whatever the address. Choosing one asks no shipping address.
- A product marked **pickup only** limits a cart holding it to the pickup locations; if there are none,
  checkout says the item can't be ordered online.
- The order keeps the location's name and address, and the confirmation email shows them with the hours.

### Tax

- **Tax rates set here**: one rate for the store and optionally a rate per US state (or per country),
  replacing the store's rate where the address (or the pickup location) is in it; **Tax on shipping**
  on or off. Tax is worked out per line after its share of the discount (`taxFor`, rounded per line, in
  the currency's minor unit), so part refunds give back the right tax.
- **Stripe Tax** (offered only while Stripe is the provider and its key is set): the checkout is made
  with automatic tax on, the address collected by Stripe's checkout, and each product's tax code
  (Settings > Shop's default, `txcd_99999999` general goods, overridable per product in its Shop settings).
  The cart shows "Tax: worked out at checkout"; the order takes the tax Stripe charged from the paid
  session (`total_details.amount_tax`), and refunds take Stripe's refunded tax. Switching the provider to
  Square turns it off, back to the rates set here.
- Prices are tax-exclusive in this release; tax-inclusive prices (VAT) are left out.
- The settings screen says plainly that the shop doesn't register for or file tax.

### Discounts

- Table `shop_discounts`: a code (case-insensitive) or automatic; percent, fixed amount or free shipping;
  the whole order or chosen products or categories; minimum subtotal; start and end; total use limit;
  one per email; members only (by level). One per order in this release.
- Uses counted in the statement that holds the stock (unpaid holds count until they expire), so the last
  use can't be taken twice.
- The discount is spread across the lines (rounding on the last), so tax and part refunds stay right
  and providers that refuse negative lines (Stripe) take it.
- Shop > Discounts screen with uses and sales; merge tags `{discount_code}`, `{discount_total}`.

### Orders and checkout

- Tables `shop_orders` (UUID id, token, status pending/paid/expired/cancelled/refunded, buyer, address,
  shipping rate, subtotal, discount, shipping, tax, total, refunded, currency, provider ref, order and
  payment id, IP, member, fulfilment and tracking, notes, hold until) and `shop_order_lines` (a copy of
  each line: product, variant, name, options, SKU, unit price, quantity, restocked).
- `POST /api/shop/checkout`: the cart re-quoted, the address, rate, tax and discount worked out on the
  server; `shop_order_create` inserts the order and its lines and holds stock in one statement (on hand
  against paid orders and unexpired holds, as `ticket_order_create`), with the same per-buyer limits by
  IP and email. Then the provider's hosted checkout (`pickProvider`, `create` with the items plus
  shipping and tax lines).
- `/api/shop/return` checks with the provider; `shopWebhook` beside `formsWebhook` and `ticketsWebhook`
  in `/api/payments/[provider].ts`; `markPaid` is idempotent, takes the stock off and sends the
  confirmation once. Expired holds are released by the hourly run. A total under `MIN_CHARGE` is refused.
- The Cart block gets Checkout: details, address or pickup, rate, discount code, totals, then Pay.
  The order page (`/cart/?order=<token>`) is personal: never cached, noindex.
- Member prices (a percent off or a fixed price per level, variants with their own; a percent off per
  level on a product category, for its products and those under it) and members-only products: built (product settings, Add to
  cart's note, the quote); checkout charges the quote's price.

### Admin

- A Shop menu while it is on: Orders, Discounts (Stock in phase 3). Products stay under Content.
- Orders (`/admin/shop/`): filter by status and fulfilment; an order's detail with mark shipped or
  picked up (sends the shipped email with tracking), resend, cancel, refund (admins), notes; CSV export.
- Refund and cancel dialogs list the lines, each with an amount and a "Return to stock" quantity
  starting at 0; restocked quantities are recorded per line so nothing restocks twice. A refund made in
  Stripe or Square (reported by the webhook) never restocks on its own: the order gets a note and a
  Restock button. Refunds reuse `refund_attempt` idempotency and the provider's refunded total.
- Order writes don't clear the page cache (availability is fetched live).

### Emails

The email builder with a `shop` kit (merge tags, an Order details block, the Payment block) and default
templates per kind (`shop:<kind>`): confirmation, shipped, refunded, the admin's copy. An optional
"Email me news" tick at checkout signs up through Mailing (double opt-in).

### Sync and backups

- New groups: Orders (`shop_orders`, `shop_order_lines`) and Stock (`shop_stock`); snapshots and sync
  backups hold them too. Stock rows match by product and variant.
- An order's status never goes backwards in a sync: one further along, or changed more recently, on the
  target is a conflict and left alone.
- Stock is unticked by default; ticking it warns and Show differences shows the target's counts.
- Syncing an order sends nothing and changes no stock.
- A restore never deletes orders made since the backup (money taken); restored stock is the backup's
  count minus what orders paid since then took; status never goes backwards.
- Backups now hold buyers' details: they stay in the private `sync-backups/` folder, Download stays
  admins only, and the guide says so.

### Tests and docs

Unit tests for totals (discount spread, tax, shipping), the race for the last item and the last
discount use, webhook idempotency, refund and restock, and the sync and restore rules; a
`scripts/shop-e2e.ts` against the Stripe and Square sandboxes. CORE.md (Shop), the developer page and
the guide's "Selling things" with new screenshots.

## Phase 3

- Stock screen: every product and variant with on-hand counts to edit, and a low-stock mark.
- Low-stock alerts by email.
- Digital downloads: a signed, limited link to a media file after payment.
- A carrier API as a second shipping source: Shippo or EasyPost (one key under Settings > Connections,
  checked on save), live rates for USPS, UPS and FedEx from the store's address, the cart's shipped
  lines' weights and a default box size (Settings > Shop), offered beside the manual rates or instead of
  them; optionally buying the label from the order screen, which fills in the tracking number.
- Tracking through the same carrier API: a label bought there is tracked on its own, and a tracking
  number from elsewhere (typed on the order) can be registered with it. Its tracking webhook updates the
  order's fulfilment (in transit, delivered, a problem) and emails the buyer when it ships and is
  delivered; the order page shows the latest status. Without a carrier key, tracking is the number and a
  link to the carrier's own page.

## Left out

Subscriptions, more than one currency, buyer accounts beyond Members, abandoned-cart emails, a till
system, marketplace sellers.
