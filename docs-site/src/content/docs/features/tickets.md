---
title: Tickets
description: Selling tickets and taking registrations for events, with Stripe or Square, waitlists and ticket emails.
sidebar:
  order: 6
---

With [Events](../events/) on, events sell **tickets** (or take free registrations). A ticket is its own
record under **People > Tickets**, with its ticket types, capacity, questions, waitlist, emails and
attendee list. You can attach any number of events to it, and they all sell from its one pool. Free
tickets need nothing else. Paid ones go through Stripe or Square, whichever has its keys set. When both
do, you choose one under **Settings > Tickets**.

## A ticket

You make a ticket with **New ticket** on the Tickets list, or **New ticket for this event…** in an
event's settings (**Sells**, which also attaches an existing one). On the ticket's page
(`/admin/tickets/<id>/`), **Ticket types and settings** has:

- its name
- the events selling it (**Attach**, **Detach**)
- the setup, stored in the ticket's `fields.tickets` (`src/lib/tickets/config.ts`,
  `src/lib/tickets/setup.ts`)
- **Delete ticket**, for a ticket without orders

An event's `fields.ticket` names its ticket, and the editor's saves keep it. Detaching an event leaves
the ticket and its orders.

- **Dates**: a ticket for one event follows its dates. For one recurring event, it sells each date
  separately, with the same capacity for each. A ticket for several events is one pool for all of
  them. Reminders go before the first, and sales close when the last ends.
- **Ticket types**: name, description, price (empty or 0 is free), how many there are, the most in one
  order, and when they're on sale (empty: now, until the event ends). A type no longer offered stays for
  past orders. To stop selling, mark every type no longer offered or remove them.
- **Capacity**: all types together (empty: no limit, 0: sold out, as for a type's own number).
- **Waitlist**: off, on and emailing people as tickets free up, or on and notified by hand from the
  attendee list.
- **Members** (when Members is on): a price per membership level, and members-only types. See
  [Members](../members/).
- **Buyers are asked**: name and email always, phone (optional or required), address (for paid orders,
  or always), and questions of your own (short or long text, a choice, a checkbox, a number).

The ticket form shows on each attached event's page, below its content in the Event details block, with the prices in its
sidebar.

The **Tickets** block puts an event's ticket on any page or template. Choose the event in its
settings, and for a recurring event a date (empty: its next date). The block then shows that event's
name and date over the form. With no event chosen, it shows the tickets of the event whose page it is
on. So an event template can place it instead of relying on Event details, which then leaves its own
form out. A page can have several. For an event that doesn't sell tickets (no ticket types, or Events
off), the block shows nothing. So a template's Tickets block appears only on events that sell them.
In the editor, the block shows the whole form. Without an event that sells tickets, it shows sample
ticket types and a note saying why. A template's block on such an event's page shows nothing there, as
on the site. Buyers come back to the page they ordered on, and their emails link there. People on a
waitlist are sent back to where they joined.

## Buying

1. The form posts to `/api/tickets/checkout`. The server checks the order (what's on sale, quantities,
   the required fields). It holds the tickets in one database call (`ticket_order_create`). That call
   locks the ticket and date, so two buyers can't both take the last ticket. One buyer (by address and by email)
   gets at most 5 unpaid orders an hour per ticket, and can hold at most twice the most per order at once.
2. A free order is confirmed at once. A paid one is held (30 minutes by default) and the buyer goes to
   Stripe Checkout or a Square payment link.
3. When the buyer comes back from paying (`/api/tickets/return`), the site checks the payment with the
   provider. The page the order was placed on then shows it (`?order=<token>`, never cached). The
   provider's webhook confirms it too, whichever comes first.
4. The confirmation goes to the buyer, with a copy to the site's admin address.

Cancelling at Stripe gives the tickets back at once. An unpaid hold expires on its own. Square's
payment links don't expire, so the hourly function closes them.

## The attendee list

**Tickets** in the admin (under People) lists the tickets, with their events and what each has sold. A
ticket's attendee list is at `/admin/tickets/<id>/` (an event's id there leads to its ticket). It has:

- orders by status, searchable, with a checkbox to check people in at the door
- for a ticket of several events, the event each order was bought at, and a filter by event
- each order's details: phone, address, answers, payment, emails sent
- **Resend confirmation**
- **Cancel order**, for unpaid or free orders. The site checks an unpaid one with the provider first.
  If it was paid after all, the site marks it paid instead.
- **Refund** (admins): all or part of a paid order, at Stripe or Square. Refunding all of it puts its
  tickets back on sale. A refund the provider refuses isn't recorded.
- the waitlist, with **Notify selected** and **Notify as many as tickets allow**
- the ticket's own **Emails**
- **Export CSV** and **Print**

The webhook records refunds made in the Stripe or Square dashboard too. A refund that fails later
comes off the order again. An order paid after it was cancelled or expired is marked paid
with a note in its details, so you can refund it if you need to.

## Emails

There are five emails, each designed in the same email builder as form notifications: the
**confirmation**, a **reminder** before the event, a **follow-up** after it, the **waitlist** notice, and
the **copy to the admin** of each order. If nobody has designed one (for the event or the site), the
site sends it from the default template for that email, if one is set (see Email templates in Forms).
Else it sends the built-in email. Besides the usual blocks, they have:

- merge tags such as `{first_name}`, `{event}`, `{date}`, `{code}`, `{order_link}` (the order, on the
  page it was placed on, or in the waitlist email, the tickets where they joined), `{attendee_link}`
- an **Order details** block: the order summary as a table, or one detail (date, venue, code, tickets,
  total, answers, the buyer's contact details)
- the **Payment** block, as in form notifications: the order's tickets, total, provider, payment ID and
  date (nothing for free orders)
- the **Events** block, as in form notifications: upcoming or picked events (in a follow-up, say, what's
  on next)
- a Preview filled in with a sample order

Settings > Tickets holds the site's emails, when the reminder (hours before the event) and follow-up
(hours after it) go out, and whether the admin gets a copy. An event can have its own emails on its attendee
list's **Emails** tab, and turn the reminder or follow-up off. The Worker's hourly run (`src/worker.ts`)
sends reminders and follow-ups on the deployed site, over the same SMTP settings as form
notifications.

## Setting up payments

Tickets and forms share the payment settings and webhooks. See [Forms](../forms/#setting-up-the-providers).

Orders, waitlists and events' own emails aren't part of sync, backups or snapshots. They stay on the copy where they were made.
