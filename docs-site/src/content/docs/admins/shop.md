---
title: Setting up the shop
description: "Turning the shop on, payments, shipping, pickup, tax, order emails and statuses, stock alerts, downloads, carrier labels and refunds."
sidebar:
  order: 8
---

If your site has a shop, products appear under **Content**, **Products**, and on your site at `/shop/`.
Adding products, showing them on pages, and handling orders, discounts and stock are in the Editor
guide: see [The shop](/editors/shop/). This page covers what only admins set up.

## Turning the shop on

**Settings**, **Shop** (admins): tick **Shop on**, choose the **Currency** and the unit **Weights** are
in, and click **Save settings**. Turning it on the first time adds three templates under **Templates**:
**Product** (a product's page), **Shop** (the `/shop/` listing) and **Product category** (a category's
page). Change them like any template.
Turning the shop off deletes nothing; products are hidden until it is on again.

## Checkout settings

While the shop is on, the same screen sets up checkout.

**Payments**:

- **Payments go through**: Stripe or Square, when both are connected under **Settings**, **Connections**.
- **Minutes an unpaid order holds its stock**: 30 to 120 (60 if left empty).

**Shipping**: click **Add a shipping zone**, name it, and add the places it covers (a country, a US
state, or **Everywhere else**). Zones are checked in order: the first that names the buyer's country or
state gives its rates, and **Everywhere else** is used only when no zone names it. Without it, other
addresses can't be shipped to. Each zone's rates:

- **Name**: what the buyer sees, such as Standard or Express.
- **Price**: One price, By the order's subtotal, or By the order's weight. By subtotal or weight, add
  bands, each with a **From**, an **Up to** (empty: no limit) and a **Price**. An order that falls in no
  band isn't offered the rate.
- **Free when the subtotal is at least**: leave empty for never.

**Pickup**: click **Add a pickup location** for each place buyers can collect from:

- **Name**, **Address** and **Hours**: shown to the buyer.
- **Fee**: empty for free.
- **Where it is, for tax**: the country or state whose tax rate applies.

**Tax**:

- **Tax is**: Worked out from the rates here, or Worked out by Stripe Tax (only when payments go through
  Stripe; turn Stripe Tax on in Stripe first). Until Stripe Tax is active, Stripe refuses every checkout
  and buyers can't pay: the setting shows a warning saying so, and what Stripe still needs (such as your
  business address, in Stripe's dashboard under Settings > Tax).
- **Store's tax rate (%)**: used where no other rate applies.
- **Rates for places**: a rate for a country or US state, replacing the store's. A state's rate wins
  over its country's.
- **Tax shipping too**: on or off.

Each product's **Taxed** switch decides whether it is taxed. The shop adds the tax you set up; it
doesn't register for or file tax for you.

**Email me news** (while Mailing Lists is on): tick the mailing lists a box at checkout signs buyers
up to, and change its words if you like. The box starts unticked. A buyer who ticks it gets an email to
confirm, as with a Subscribe block, and is on the lists only once they do. With no list ticked here,
checkout has no box.

**Emails**: the emails an order sends, each with a **Subject** and **Edit email**, which opens the email
builder:

- **Order confirmation**: to the buyer when the order is paid.
- **Shipped**: to the buyer when you mark the order shipped, with its tracking number.
- **Delivered**: to the buyer when the carrier says the parcel arrived (with Shippo connected).
- **Refunded**: to the buyer when you refund the order on its page, all or part.
- **Copy to the shop**: each paid order, to the shop. **Send the shop a copy of each order** turns it off.

In the builder, the **Order details** block shows the order (what was bought and the totals), or one part
of it: the items, the totals, where it goes, the order number, the tracking number, the refund or the
buyer's details. Merge tags such as `{first_name}`, `{code}`, `{total}` and `{tracking}` fill in the
order's details; the builder lists them all. **Preview** shows the email with a sample order.
**Templates** saves a design to start others from; a template set as the default for one of these emails
is sent until you design your own here. **Reset to the default** goes back to it.

## Order statuses

Your own steps for orders, such as Being made, Ready to collect or On hold, beside whether an order is
paid. Under **Settings**, **Shop**, **Order statuses**, click **Add a status**, then set:

- **Name**: what it is called on the order's page and the Orders screen.
- **Email the buyer when an order is moved to it**: on or off.
- Its email (when on): a **Subject** and **Edit email**, designed like the other order emails. The merge
  tag {order_status} is the status's name.

Use the arrows to put them in order, and **Delete** to remove one (orders with it then show none). Click
**Save settings**.

## Low stock

The low-stock mark is set under **Settings**, **Shop**, **Stock**:

- **Low stock at**: how few left counts as low (3 to begin with; 0 for never).
- **Email the shop when a sale takes something to low stock**: on or off. Each one is emailed about once,
  until you raise its count again.

A product can have its own mark: **Low stock at** in its Shop settings, under **Count stock**.

## Downloads

Under **Settings**, **Shop**, **Downloads**:

- **Times a buyer can download each file**: 5 to begin with; 0 for no limit.
- **Days after paying a download works**: 30 to begin with; 0 for always.

An order's page shows how many times each file was downloaded. Download files aren't copied by Sync or
kept in backups.

## Carrier rates, labels and tracking

With Shippo, checkout can offer live USPS, UPS, FedEx and DHL rates, and you can buy a label on each
order's page. To set it up:

1. Make an account at Shippo and connect your carriers there (USPS comes with it).
2. Under **Settings**, **Connections**, **Shippo**, paste Shippo's API token (Settings > API in Shippo; a
   test token starts with `shippo_test_`) and click **Connect**. The site sets up Shippo's tracking
   updates itself.
3. Under **Settings**, **Shop**, **Carrier rates and labels**, fill in the settings below.
4. Give your products a weight (in their Shop settings).

The settings:

- **Offer live carrier rates at checkout**: on or off.
- **In place of the shipping zones' rates**: on, only the carriers' rates are offered; off, they're
  offered beside your own.
- **Parcels go from**: your address, as the carriers need it (a phone number helps).
- **The box**: its length, width and height, and the empty box's weight.
- **Carriers offered**: tick the ones to offer; none ticked offers every carrier on your Shippo account.

At checkout, the buyer types their ZIP or postal code and the carriers' rates appear, cheapest first.

On a paid order's page, under **Shipping**:

- **Buy a label…** lists the rates for the parcel (the buyer's choice is marked). Click one and confirm:
  Shippo charges your account, the label is ready to print (**Print the label**), and the order is marked
  shipped with its tracking number, which emails the buyer.
- Typing a tracking number yourself, choose its **Carrier** too: the buyer's email links to the
  carrier's tracking page, and with Shippo connected the parcel is followed.
- The latest tracking news shows on the order, and on the buyer's order page. **Check the tracking
  now** asks Shippo at once; otherwise it comes in by itself, and is checked hourly.
- When the carrier says the parcel was delivered, the buyer gets the **Delivered** email, once.

With a test token, labels are test labels (nothing is charged or sent) and Shippo tracks only its own
test numbers. To try tracking, mark the order shipped with one of them:

- **Tracking number**: `SHIPPO_PRE_TRANSIT`, `SHIPPO_TRANSIT`, `SHIPPO_DELIVERED`, `SHIPPO_RETURNED` or
  `SHIPPO_FAILURE`.
- **Carrier**: Shippo test numbers (offered only while the token is a test one).

A test label's own tracking number can't be checked: **Check the tracking now** says so, and the hourly
check leaves it out.

## Refunds

Only admins refund. On a paid order's page, under **Refund**, type how much to give back, all or part,
and fill in **Put back in stock** for anything going back on the shelf. The money goes back to the
buyer's card through Stripe or Square, and the buyer gets an email saying how much. Refunding all of it
marks the order refunded. A refund gives back what was paid, after any discount.

A refund made in Stripe's or Square's own dashboard shows on the order too, but puts nothing back in
stock and sends no email: put things back on the order's page.
