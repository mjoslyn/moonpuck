---
title: Local setup
description: Run the example site on your machine.
sidebar:
  order: 1
---

## Requirements

- Node 22.12 or later
- Optional: a local mail catcher to see the site's email (Mailpit, through Docker or Homebrew)
- For hosting: a Cloudflare account (Workers paid plan)
- Optional: an Anthropic API key (Compose), a domain onboarded for Cloudflare Email Service (or an SMTP
  account) for the site's email, and a Stripe or Square account (paid forms and tickets)

Wrangler (Cloudflare's CLI) is a dev dependency, so `npx wrangler` needs no install.

## Steps

1. **Install and set up.**

   ```sh
   git clone https://github.com/mjoslyn/moonpuck.git my-site
   cd my-site
   npm install
   npm run setup
   ```

   `npm run setup` makes `.env` from `.env.example` with a new `AUTH_SECRET` (an existing `.env` is
   kept; only an empty `AUTH_SECRET` is filled in), makes the local D1 database from `db/migrations/`
   and starts the dev server. The database goes in `.wrangler/state`, where the local file bucket also
   lives; the dev server and the scripts share both. Add `-- --no-dev` to stop before the server.

2. **Make your admin.** Open http://localhost:4321/admin/. While the site has no admin, it asks you to
   make one: your name, email and a password (at least 10 characters). **Add starter content**, ticked on
   a new site, adds the header, footer, base templates, a home page and an About page. You are signed in.

   The site is at http://localhost:4321.

### By hand

The same steps one at a time:

```sh
cp .env.example .env                    # then set AUTH_SECRET to a long random value (openssl rand -hex 32)
npm run db:migrate
npm run seed                            # the starter content; skips what exists, so safe to run again
npx tsx --env-file=.env scripts/create-editor.ts you@example.org 'a-password' admin
npx astro dev
```

`scripts/create-editor.ts` also makes more editors, and makes an existing account an admin.

## Optional features

### Compose

Connect Claude under Settings > Connections, or set `ANTHROPIC_API_KEY` (and optionally
`ANTHROPIC_MODEL`, default `claude-sonnet-5-5`) and restart the dev server. See [Compose](../../features/compose/).

### Email

The site's own email (form notifications, ticket emails, account emails and mailing-list
confirmations) goes through Cloudflare Email Service when the Worker has its `EMAIL` binding. For
that, put `"send_email": [{ "name": "EMAIL" }]` in `wrangler.jsonc`, onboard the sender's domain under
Email Service > Email Sending, and set `MAIL_FROM` to an address on it (see Hosting). Without the
binding, email goes over SMTP: either `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and
`SMTP_SECURE`, or a single `SMTP_URL` such as `smtp://user:pass@host:587`. With neither, the site
stores submissions but sends no mail. Notifications go to each form's addresses, or to `FORMS_ADMIN_EMAIL`, or to `adminEmail` in the
site config.

Locally, run a mail catcher such as Mailpit (`docker run -d -p 1025:1025 -p 8025:8025 axllent/mailpit`)
and set `SMTP_URL=smtp://127.0.0.1:1025`. Its inbox is at http://127.0.0.1:8025.

### Events

Turn them on under **Settings > Events** (admins). The default time zone is set there too. Turning
them on adds the event templates (an event's page and the calendar) if they aren't there; `npm run seed`
adds a sample event and venue. The site's config needs nothing. To
add fields or change labels and URLs, see [Extending the event types](../../features/events/#extending-the-event-types).

### Payments and tickets

Turn Events on under Settings > Events, then add ticket types in an event's settings (under
Tickets). The Event details block shows the form, or you can place a Tickets block on any page or template. Free tickets need nothing else. For paid ones, set one provider's keys:

- Stripe: `STRIPE_SECRET_KEY` (`sk_test_...` to test) and `STRIPE_WEBHOOK_SECRET`.
- Square: `SQUARE_ACCESS_TOKEN`, `SQUARE_LOCATION_ID`, `SQUARE_ENVIRONMENT=sandbox` to test,
  `SQUARE_WEBHOOK_SIGNATURE_KEY` and `SQUARE_WEBHOOK_URL`.

With both set, choose one under **Settings > Tickets**. That screen also has the currency, how long an
unpaid order holds its tickets, and the emails. Ticket emails need email set up (see Email). Their links use `SITE_URL`
(default the request's address). The copy of each order goes to `TICKETS_NOTIFY_EMAIL` (default
`FORMS_ADMIN_EMAIL`, then `adminEmail`). The same keys take payments on forms. See
[Tickets](../../features/tickets/) and [Forms](../../features/forms/).

### Members

Turn it on under **Settings > Members** (admins): the levels, how people join and the message
visitors see. Members sign in at `/account/`. The site's email sends their emails (confirming an
address, resetting a password, invitations). Locally, they arrive in the mail catcher. See
[Members](../../features/members/).

## Troubleshooting

- After merges that change dependencies, restart the dev server. Stale Vite dependency caches show
  as "Outdated Optimize Dep" and islands that don't hydrate.
- `astro dev` runs the site in workerd, as the Worker runs in production. Code that only works in Node
  fails there too. Locally, image crops are centered (Miniflare's Images ignores crop rectangles).
