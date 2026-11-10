# moonpuck

An opinionated, batteries-included CMS for small businesses and organizations, built on Cloudflare.
It has Astro rendering on a Worker, content in D1, files in R2, the Puck visual editor, and Compose.
Compose writes pages with Claude from the documents, images and links an editor adds. Everything a
small organization runs on is in the box, and admins turn it on under Settings. There is nothing to
install and there are no plugins to keep up to date.

The core is everything outside `src/site/`. `src/site/` is an example site called Example Town, with
its own content types, taxonomies, card designs and starting theme. A real site is a copy of this
repository that replaces `src/site/` and keeps this one as its `upstream`. `CORE.md` documents the
code. `docs-site/` is the project's website, https://moonpuck.com/, with its home page, the developer docs
and the Editor and Admin guides.

What you get:

- **Editing:** a visual page editor with drafts, autosave, preview, revisions, templates, patterns
  (copied or linked), copy and paste of styles, and an accessibility check that can hold a publish
- **Content:** types, fields and taxonomies from one config file, and more that admins
  make under Settings. Also tags, collections (grids, lists, sliders, load more), filters, maps and
  site search
- **Look:** the theme as settings (Settings > Theme): palette, the colors each role uses, dark bands,
  buttons, fonts from a built-in library, text sizes, spacing, widths and a logo. The admin screens match it or take their own colors
- **Media:** a library with focal points per crop and screen size, AVIF and WebP copies, documents,
  video, and alt text written by Claude
- **Compose:** pages, edits, forms and campaigns written by Claude from your materials
- **Forms:** conditional logic, payments (Stripe or Square), and notification emails built in the
  email builder
- **Events** (optional): recurrence, a calendar (list, month, day) and `.ics` feeds
- **Tickets** (with Events): paid or free, ticket types with capacities and sales windows, one ticket
  for several events, a waitlist, check-in, refunds, and confirmation, reminder and follow-up emails
- **Members** (optional): levels, sign-ups, members-only pages and blocks, member prices on tickets and
  in the shop
- **Mailing lists** (optional, through Mailgun): confirmed sign-ups, campaigns and a weekly digest,
  segments, one-click unsubscribe, and opens and clicks with mail scanners told apart from people
- **Shop** (optional): products with options, variants, sales and stock, a cart and checkout, shipping
  zones, pickup, carrier rates and labels (Shippo), tax or Stripe Tax, discounts, downloads, order
  emails and stats
- **Donations** (optional): one-time and monthly gifts, covering the fees, fundraising goals with a
  progress bar, receipts and totals
- **Site upkeep:** SEO settings and share cards, redirects and a log of missing addresses, cookie-free
  stats, popups and a cookie consent banner, code snippets, an email log, sync between copies, daily
  snapshots and restores
- **Accounts:** editors and admins with invitations. The server checks what each may read
  and change. You paste service keys (Claude, Stripe, Square, Mailgun, Shippo) in under Settings >
  Connections. The site keeps them encrypted and sets up their webhooks for you

## Requirements

- Node 22.12 or later
- Optional: a local mail catcher to see the site's email (Mailpit, through Docker or Homebrew)
- For hosting: a Cloudflare account (Workers paid plan: the jobs queue and CPU time)
- Optional: an Anthropic API key (Compose), a domain onboarded for Cloudflare Email Service (or an SMTP
  account) for the site's email (form notifications, tickets, orders, account emails), a Stripe or
  Square account (paid forms, tickets, the shop and donations, but monthly gifts need Stripe), a Mailgun
  account (mailing lists) and a Shippo account (carrier rates and labels)

Wrangler (Cloudflare's CLI) is a dev dependency, so `npx wrangler` needs no install.

## Local setup

1. **Install**

   ```
   git clone https://github.com/mjoslyn/moonpuck.git my-site
   cd my-site
   npm install
   ```

2. **Make the local database.** This makes the local D1 database from `db/migrations/`, in
   `.wrangler/state`, where the local file bucket also lives. Nothing else needs to run.

   ```
   npm run db:migrate
   ```

   To see the site's email, run a mail catcher and set `SMTP_URL=smtp://127.0.0.1:1025` in `.env`
   (its inbox is at http://127.0.0.1:8025):

   ```
   docker run -d -p 1025:1025 -p 8025:8025 axllent/mailpit
   ```

3. **Configure.** Copy the example env file:

   ```
   cp .env.example .env
   ```

   Then set `AUTH_SECRET` to any long random value (`openssl rand -hex 32`).

4. **Add starter content.** This adds the header, footer, base templates, a home page, an About page
   and a sample event. It skips anything that already exists, so it is safe to run again.

   ```
   npm run seed
   ```

5. **Create an admin.** This makes an admin user you can sign in with:

   ```
   npx tsx --env-file=.env scripts/create-editor.ts you@example.org 'a-password' admin
   ```

6. **Run it.**

   ```
   npx astro dev
   ```

   The site is at http://localhost:4321 and the editor at http://localhost:4321/admin/. It runs as the
   Worker does in production (workerd), with local bindings: the database is the local D1, the same
   file the scripts above use.

### Optional features

Most features are off until an admin turns them on under Settings > Features. Admins connect
the services they use under Settings > Connections. Paste a key, and the site checks it and keeps it
encrypted. On the deployed site, it also sets up the service's webhook. You can also set keys as
environment variables (`.env.example`). These win over saved ones.

- **Theme.** Settings > Theme starts from the site's code (`theme` in `src/site/render.ts`). A theme
  saved there replaces it: colors, fonts, sizes, spacing, widths, the logo, and the admin screens' look.
- **Compose.** Connect Claude under Settings > Connections, or set `ANTHROPIC_API_KEY` (and optionally
  `ANTHROPIC_MODEL`, default claude-sonnet-5-5) and restart the dev server.
- **Email** (form notifications, ticket emails, account emails and mailing-list confirmations, but
  not campaigns, which go through Mailgun). On the deployed site, mail goes through Cloudflare Email
  Service. To set it up, add
  `"send_email": [{ "name": "EMAIL" }]` to `wrangler.jsonc`, onboard the sender's domain under Email
  Service > Email Sending in the Cloudflare dashboard, and set `MAIL_FROM` to an address on it. Without
  that binding the site sends over SMTP instead: either `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
  `SMTP_PASS` and `SMTP_SECURE`, or a single `SMTP_URL` such as `smtp://user:pass@host:587` (port 587 or
  465, because Workers can't use port 25). With neither, the site stores submissions but sends no mail.
  Notifications go to each form's addresses, or to `FORMS_ADMIN_EMAIL`, or to `adminEmail` in the
  site config. Locally, `SMTP_URL=smtp://127.0.0.1:1025` sends to a mail catcher such as Mailpit (inbox
  at http://127.0.0.1:8025).
- **Events.** Turn them on under Settings > Events (admins): event and venue types, the calendar at
  `/events/`, event categories, `.ics` feeds and the event blocks, plus the default time zone (an event
  can choose its own). Run `npm run seed` again afterwards for the event templates and a sample
  event. The site config needs nothing for them. To add fields or change labels and URLs, extend them
  with `events` in `src/site/config.ts`:

  ```ts
  events: {
    event: { fields: [{ key: 'ages', label: 'Ages', type: 'text' }], removeFields: ['schedule'] },
    venue: { fields: [{ key: 'parking', label: 'Parking', type: 'textarea' }] },
    category: { label: 'Kind of event' },
  },
  ```
- **Tickets.** With Events on, make a ticket under People > Tickets (New ticket). Give it ticket
  types and attach the events it is for. You can also pick or make one in an event's settings. The
  Event details block shows its form, or you can place a Tickets block on any page or template. Free tickets need nothing else.
  For paid ones, connect Stripe or Square under Settings > Connections, or set one provider's keys:
  - Stripe: `STRIPE_SECRET_KEY` (`sk_test_...` to test) and `STRIPE_WEBHOOK_SECRET`.
  - Square: `SQUARE_ACCESS_TOKEN`, `SQUARE_LOCATION_ID`, `SQUARE_ENVIRONMENT=sandbox` to test,
    `SQUARE_WEBHOOK_SIGNATURE_KEY` and `SQUARE_WEBHOOK_URL`.

  With both connected, choose one under Settings > Tickets, which also has the currency, how long an
  unpaid order holds its tickets, and the emails. Ticket emails need email set up (see Email above). Their links use
  `SITE_URL` (default the request's address). The copy of each order goes to `TICKETS_NOTIFY_EMAIL`
  (default `FORMS_ADMIN_EMAIL`, then `adminEmail`). Orders and the waitlist are at `/admin/tickets/`.
  The same keys take payments on forms (a form's Payment tab), in the shop and for donations.
- **Members.** Turn it on under Settings > Members (admins): membership levels, how people join
  (admins add them, sign up and wait for approval, or sign up and join at once) and the message
  shown to visitors who can't see something. Then:
  - Make a page members only in its settings (Members), or wrap blocks in a **Members only** block.
  - Give ticket types member prices or make them members only (a ticket's settings). Give products
    member prices (a product's Shop settings).
  - Manage members at `/admin/members/`. Members sign in, sign up and reset their password at
    `/account/`. To design that page, make a page with that address and put the **Member account**
    block on it.

  The site sends members' emails (confirming an address, resetting a password, invitations) like its
  other email (see Email above). Locally they arrive in the mail catcher.
- **Mailing.** Turn it on under Settings > Mailing Lists (admins) and fill in the postal address every email
  carries (nothing sends without it). Add lists on the Mailing Lists screen (Lists tab). Put a **Subscribe** block where
  people should sign up (or link to `/subscribe/`). Then write campaigns or set up a weekly digest there. Segments (tags, fields, sign-up date, opens and clicks) send to part of a list, members or not.
  The site's own email confirms sign-ups (see Email above). Sending campaigns needs Mailgun (see Hosting): `MAILGUN_API_KEY`,
  `MAILGUN_DOMAIN`, `MAILGUN_REGION` (`eu` for EU accounts) and `MAILGUN_WEBHOOK_SIGNING_KEY`, plus
  `MAIL_LINK_SECRET` for the signed links in emails. Locally, without Mailgun, campaigns go to the mail
  catcher one address at a time. With Members on, member sign-up and the account page offer the lists
  chosen under Settings > Mailing Lists.

- **Shop.** Turn it on under Settings > Shop (admins), with the currency and weight unit. That adds
  products under Content, the shop at `/shop/`, product categories, the cart at `/cart/` and the shop
  blocks, with starter templates. Connect Stripe or Square for payments. Settings > Shop also has the
  checkout: shipping zones and rates, pickup locations, tax (your rates, or Stripe Tax), how long an
  unpaid order holds its stock, order statuses, the order emails and, with Shippo connected, live
  carrier rates and labels. Orders, discounts, stock and stats are under Shop in the admin bar. The shop's copy of each order goes to `SHOP_NOTIFY_EMAIL` (default `FORMS_ADMIN_EMAIL`, then
  `adminEmail`).
- **Donations.** Turn them on under Settings > Donations (admins): the currency, preset amounts, the
  minimum, monthly gifts (Stripe only), covering the fees, fundraising goals, receipt details and the
  emails. Put a **Donate** block on a page (or link to `/donate/`), and a **Donation progress** block for
  a goal. Gifts and monthly donors are at `/admin/donations/`. The organization's copy of each gift goes
  to `DONATIONS_NOTIFY_EMAIL` (default `FORMS_ADMIN_EMAIL`, then `adminEmail`).

## Make it your site

Replace `AGENTS.md` with your site's own notes (its content types, blocks, hosting, rules). Keep its
first line, `@CORE.md`, which brings in the core's reference. The core's `AGENTS.md` is about working
on the core itself.

Everything site-specific lives in `src/site/`:

| File | What it holds |
| --- | --- |
| `config.ts` | Name, organization, timezone, mail sender, admin email, a short brief for Compose, content types (labels, URLs, fields), taxonomies, and changes to the core's event types (`events`) |
| `render.ts` `theme` | The starting theme: palette, the role colors the core's styles use (`--color-text`, `--color-accent`, `--color-dark`, ...), fonts, type sizes, spacing and widths. Admins change it under Settings > Theme |
| `styles/tokens.css` | Any tokens the theme doesn't cover |
| `styles/theme.css` | Your own styles |
| `lib/content/cards.ts` | Card designs for collections |
| `render.ts`, `editor.tsx` | Your own blocks (their markup in `render/c/`), and their settings panels |
| `migrations/` | Content migrations for your own data changes |
| `pages/api/`, `routes.json` | Your own endpoints |
| `public/` | Your own static files (scripts, images), served at the same paths as `public/` |
| `scripts/` | Your own checks |

Inside `src/site/`, files sit where their core counterparts do (`render/c/`, `lib/`, `pages/api/`,
`styles/`, `public/`, `scripts/`), so each maps onto the core.

After you change `config.ts`, run `npm run check`. The editor, URLs, Compose and admin tabs all
follow the config. `CORE.md` describes each option.

## Hosting

1. **Cloudflare resources.** Give the Worker, its database, bucket and queue names of the site's own
   in `wrangler.jsonc` (`name`, `database_name`, `bucket_name`, the queue's), then:
   ```
   npx wrangler login
   npx wrangler d1 create <site>
   npx wrangler d1 migrations apply DB --remote
   npx wrangler r2 bucket create <site>
   npx wrangler queues create <site>-jobs
   ```
   Put the database's id in `wrangler.jsonc` (`database_id`). Images needs Cloudflare Images turned on
   for the account.
2. **Scripts on the deployed site** (optional) reach its database through Cloudflare's API and its
   files over R2's S3 API. They need an API token with D1 edit (`CLOUDFLARE_API_TOKEN`, with
   `CLOUDFLARE_ACCOUNT_ID` and `D1_DATABASE_ID`) and an R2 API token (R2 > Manage API tokens:
   `STORAGE_ENDPOINT` `https://<account-id>.r2.cloudflarestorage.com`, `STORAGE_BUCKET`,
   `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`). Put them in a copy of `.env` such as
   `.env.production`.
3. **Seed and create an admin**, with the database settings above, by the same two commands as locally:
   ```
   npx tsx --env-file=.env.production scripts/seed.ts
   npx tsx --env-file=.env.production scripts/create-editor.ts you@example.org 'a-password' admin
   ```
4. **The Worker.**
   Set the secrets (`npx wrangler secret put <NAME>`): `AUTH_SECRET` (a long random value of its own,
   e.g. `openssl rand -hex 32`), `SYNC_SECRET` (to sync with another copy: the same long random value on
   both) and the optional Compose, payment and Mailgun keys. Set the rest (`MAIL_FROM`,
   `SITE_URL`...) as `vars` in `wrangler.jsonc`, or as secrets too. For email (invitations, password links, form
   notifications), add the `EMAIL` binding to `wrangler.jsonc` and onboard `MAIL_FROM`'s domain under
   Email Service > Email Sending. Without the binding, set `SMTP_PASS` as a secret and the other
   `SMTP_*` values as `vars` instead. Deploy with
   `npm run deploy`, then add your domain to the Worker (Workers > the Worker > Domains & Routes).
   - Deploying from git (Workers Builds: the Worker > Settings > Build, connected to the repository):
     build command `npm run build`, deploy command `npm run deploy:remote`, which applies new
     migrations before deploying. Give the build's API token D1 Edit (My Profile > API Tokens). The token Cloudflare makes for builds doesn't have it.
   - Taking payments (forms, tickets, the shop, donations): connecting Stripe or Square under
     Settings > Connections on the deployed site makes its webhook. By hand, one endpoint per provider
     serves them all:
     - Stripe: `https://<your-domain>/api/payments/stripe`, with the `checkout.session.*`,
       `charge.refunded`, `charge.refund.updated`, `refund.updated`, `refund.failed`, `invoice.paid`,
       `invoice.payment_failed`, `customer.subscription.updated` and `customer.subscription.deleted`
       events.
     - Square: `https://<your-domain>/api/payments/square`, with `payment.created`,
       `payment.updated`, `refund.created` and `refund.updated`. Set `SQUARE_WEBHOOK_URL` to that
       exact address.

   - Using Mailing: in Mailgun, add a sending domain for marketing (a subdomain such as
     `news.<your-domain>`, separate from the domain your other mail uses) and add its SPF, DKIM and
     tracking CNAME records. Publish a DMARC record (`p=none` at first, `quarantine` once reports are
     clean). Turn on open tracking for that domain. Leave click and unsubscribe tracking off (the site
     does both). Connecting Mailgun under Settings > Connections adds the webhook. By hand, add one for
     delivered, opened, permanent failure, spam complaint and unsubscribed events to
     `https://<your-domain>/api/mailgun/webhook`, and set its signing key as
     `MAILGUN_WEBHOOK_SIGNING_KEY`. Set `MAILGUN_TEST_MODE=true` to try it without delivering anything.
     Before the first real campaign, send tests to Gmail, Outlook and Yahoo addresses and check the
     unsubscribe link Gmail shows next to the sender.

   The Worker does the background work itself. Its jobs queue runs Compose turns, backup restores and
   campaigns' sending runs. Its Cron Triggers run Mailing's scheduled campaigns and digests (every 5
   minutes) and upkeep (nightly), and snapshots (daily). Every hour they run ticket reminders,
   follow-ups and waitlists, the shop's expired holds and parcels' tracking and donations' unpaid
   checkouts, and they prune the stats and the email log.
5. **Invite editors** from `/admin/users/`.

## Updating the core

A site keeps this repository as its `upstream` remote. To set that up after cloning:

```
git remote rename origin upstream
git remote add origin git@github.com:<you>/my-site.git
```

To take core updates:

```
npm run core:update                                # fetch upstream/main, check for conflicts, merge
npm run core:update -- --check                     # only check: what would come in, and any conflicts
npm run db:migrate                                 # if there are new migrations (the deployed database: deploy:remote)
npx tsx --env-file=.env scripts/migrate-content.ts # if stored content needs migrating
```

`core:update` (`scripts/update-core.mjs`) stops before changing anything if there is no `upstream` remote,
uncommitted changes or a merge under way. It tries the merge first (`git merge-tree`, git 2.38 or later)
and lists every file that would conflict. Conflicts in `AGENTS.md`, `README.md`, `.env.example` and
`wrangler.jsonc` keep the site's version. Any other conflict stops it with the branch as it was, and it
names the files. These are core files the site has changed: move the change into `src/site/` or send it
to the core. It then merges, lists the new migrations, runs `npm install` when the dependencies changed (`--no-install`
skips it) and says what to run next. `--remote` and `--branch` name another remote or branch. By hand:
`git fetch upstream && git merge upstream/main`.

The merges stay clean as long as the site only changes `src/site/`, its own migrations
(`db/migrations/*_site_*.sql`), `AGENTS.md`, `README.md` and its local settings. If you fix a core bug while working on a site,
commit the fix on its own and `git cherry-pick` it into the core repository.

## Checks

```
npm run check                                   # typecheck
npm run build                                   # parses the .astro pages, which the typecheck doesn't
npm test                                        # unit tests, with D1's limits checked on every statement
npx tsx scripts/checks/formatting.ts            # autop and texturize
npx tsx scripts/checks/recurrence.ts            # recurrence rules and DST
npx tsx scripts/checks/private-address.ts       # private addresses refused for Compose's links
npx tsx scripts/checks/mailing.ts               # mailing emails, signed links, click verdicts, digest times
npx tsx --env-file=.env scripts/publishing-e2e.ts   # drafts, preview, publish (needs LOCAL_ADMIN_* in .env)
```
