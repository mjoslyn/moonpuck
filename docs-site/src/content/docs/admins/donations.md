---
title: Donations
description: "Turning donations on, amounts, monthly gifts, covering fees, receipts, fundraising goals, emails, refunds and monthly donors."
sidebar:
  order: 8.5
---

Donations let people give to your organization from your site, once or every month, with a Donate block
on a page. Editors place the blocks (see [Donations](/editors/donations/) in the Editor guide); this
page covers the settings, refunds and monthly donors.

## Before you start

- Connect a payment provider under [Connections](/admins/connections/): Stripe or Square for one-time
  gifts.
- Monthly gifts need **Stripe**, whichever provider takes one-time gifts.
- If Stripe was connected before you turned donations on, connect it again (press **Connect** with the
  same key) so Stripe also sends the site its monthly payments.
- To let monthly donors update their card themselves, turn on Stripe's customer portal: in Stripe, go
  to **Settings**, **Billing**, **Customer portal**.

## Settings > Donations

Open **Settings** (the gear), then **Donations** under **Features**. Change what you need and press
**Save settings**.

- **Donations on**: turns on the Donate and Donation progress blocks, the `/donate/` page and
  **Donations** in the top bar. Turning it off later deletes nothing, and monthly gifts already started
  keep going.
- **Currency**: the currency gifts are taken in.

**Payments**

- **One-time gifts go through**: Stripe or Square, when both are connected.
- **Offer monthly gifts**: on by default. Monthly gifts go through Stripe.

**Amounts**

- **Amounts offered**: up to 8, separated by commas, such as `25, 50, 100, 250`. A Donate block can offer
  its own.
- **Smallest gift**: gifts below it are refused (default 5.00).

**Covering the fees**

- **Percent** and **Plus a fixed amount**: your provider's rate. Donors can then tick a box to add the
  fees to their gift, so you receive all of it. Both empty: not offered.

**The form**

- **Ask for a dedication (in honor or memory of)**.
- **Let donors give anonymously**: anonymous gifts still keep the donor's name and email, for their
  receipt.

**Receipts**

- **Organization's legal name**: empty, the site's name.
- **Tax or charity number (such as an EIN)**.
- **Receipt note**: such as "No goods or services were provided in exchange for this gift." Check the
  wording your country requires with your accountant.

**Email me news** (while mailing lists are on)

- **Lists it signs up to**: none ticked, no tick on the form. Donors who tick it confirm by email, as with
  any sign-up.
- **The tick's words**.

**Fundraising goals**

- **Add a goal** for each appeal, with its **Name**, **Target**, and optional **Starts** and **Ends**
  dates. Only gifts paid between the dates count.
- A Donate block's **Counts towards** setting adds its gifts to a goal; a Donation progress block shows
  the goal's total.
- Deleting a goal keeps its gifts; they are just no longer counted towards it.

**Emails**

Each email has a **Subject** and **Edit email**, which opens the email builder with the gift's merge
tags and a **Donation details** block:

- **Receipt**: to the donor when a one-time gift is paid.
- **Monthly receipt**: to a monthly donor when their gift starts and each month, with the link to change
  or cancel it.
- **Monthly payment failed**: once, when a month's payment fails, with a link to update their card.
  Stripe tries the card again over the following days.
- **Monthly gift cancelled**: when a monthly gift ends.
- **Refunded**: when you refund a gift.
- **Copy to the organization**: each gift, to the site's admin address (or `DONATIONS_NOTIFY_EMAIL`).
  Turn off **Send the organization a copy of each gift** to stop them.

## Refunding a gift

1. Click **Donations** in the top bar and find the gift (search by receipt number, email or name).
2. Click its receipt number.
3. Under **Refund**, the amount left is filled in; change it for part of the gift.
4. Press **Refund** and confirm.

The money goes back to the donor's card at Stripe or Square, the donor is emailed, and the refund comes
off any goal's total. A refund made in Stripe's or Square's own dashboard is recorded too.

## Monthly donors

The **Monthly donors** tab lists everyone giving monthly, with what they give, since when and their
status:

- **Active**: paid this month.
- **Payment failed**: the latest payment didn't go through; Stripe tries again. If it keeps failing,
  Stripe cancels the gift.
- **Cancelled**: no more payments.

Click a donor to see each month's gift and:

- **Check at Stripe**: reads the gift's status again from Stripe.
- **Cancel monthly gift**: stops it at Stripe at once and emails the donor.

Donors can cancel their own gift from the link in their receipts.

## Good to know

- Gifts and monthly donors stay on the copy of the site where they were made: they aren't synced or
  backed up with your content. Use **Export CSV** to keep a copy.
- The site doesn't file tax returns or send year-end statements for you. Export the year's gifts as CSV
  for that.
