---
title: Plugins
description: Features a site installs in src/site/plugins/, and the hooks the core gives them.
sidebar:
  order: 6
---

A plugin is a feature a site installs that the core doesn't have, such as a sync with another service.
It lives in the site, in `src/site/plugins/<name>/`, so core updates never touch it. A site wires each
plugin in itself, in the same files it uses for its own code.

## Layout

```
src/site/plugins/square-sync/
  server.ts       the server part: schedules, jobs, events, admin links (definePlugin)
  render.ts       its blocks, if any
  editor.tsx      its blocks' settings panels, if any
  db.ts           its tables' policies, if any
  migrations/     its database migrations: YYYYMMDDHHMMSS_site_<name>.sql
  pages/          its admin screens and endpoints, listed in the site's routes.json
```

Only `server.ts` is needed. Server code goes only in `server.ts` and what it imports, never in
`render.ts` or `editor.tsx`: those also run in the editor's browser bundle.

## Wiring it in

Each part goes in the site file of the same kind:

- `src/site/server.ts`: `plugins: [squareSync]`, the plugin's `server.ts`.
- `src/site/render.ts` and `editor.tsx`: its blocks and panels, spread into `blocks` and `panels`.
- `src/site/db.ts`: its policies, spread into `SITE_POLICIES`.
- `src/site/routes.json`: its pages and endpoints.

```ts
// src/site/server.ts
import { defineServer } from '../lib/site/plugins';
import squareSync from './plugins/square-sync/server';

export default defineServer({
  plugins: [squareSync],
});
```

## The server part

```ts
// src/site/plugins/square-sync/server.ts
import { definePlugin, startPluginJob } from '../../../lib/site/plugins';

export default definePlugin({
  name: 'square-sync',
  schedules: {
    hourly: async () => `${await reconcile()} items checked`,
  },
  jobs: {
    'full-sync': async (data) => fullSync(data),
  },
  on: {
    shopOrderPaid: async ({ orderId, stockTaken }) => { if (stockTaken) await pushStock(orderId); },
  },
  nav: [{ href: '/admin/square-sync/', label: 'Square sync', group: 'Shop', admins: true }],
  adminOnly: ['/admin/square-sync/', '/api/admin/square-sync/'],
});
```

Options:

- `name`: unique; lower case letters, digits and dashes.
- `schedules`: work joined to the Worker's scheduled runs: `every5Minutes`, `hourly`, or `daily` (07:00 UTC). What it returns is logged.
- `jobs`: background jobs by name, started with `startPluginJob(plugin, job, data)`. Each gets up to 15 minutes on the jobs queue. Without a queue, a job runs after the answer.
- `on`: handlers for the core's events (below). They run after the answer, so a slow call never holds up a checkout or webhook.
- `nav`: links in the admin bar. `group` puts a link in a dropdown, an existing one (`Shop`, `People`, `Forms`) or a new one. `admins` shows it to admins only. `when(site)` shows it only while the site settings allow.
- `adminOnly`: address prefixes under `/admin/` or `/api/admin/` that only admins may open.

Each hook runs on its own: if one fails, it is logged, and the core and other plugins carry on.

## Events

- `shopOrderPaid` `{ orderId, stockTaken }`: a shop order was paid, once per order. `stockTaken` says its counted lines were just taken off `shop_stock`.
- `shopOrderRestocked` `{ orderId, lines }`: lines of an order were put back in stock, as `{ <line index>: quantity }`.

## Tables

A plugin that needs tables adds migrations in its `migrations/` folder, named
`YYYYMMDDHHMMSS_site_<name>.sql`. Wrangler reads only `db/migrations/`, so `npm run db:migrate` and
`npm run deploy:remote` first copy them there (`scripts/plugin-migrations.ts`). Commit the copies.
A copy is never overwritten: to change a table, write a new migration.

After a migration, `npx tsx scripts/db-schema.ts` writes the site's tables to `src/site/schema.ts`,
apart from the core's. Tables without a policy in `src/site/db.ts` are the server's only. Policies are
written with the helpers in `src/lib/db/access.ts`:

```ts
// src/site/plugins/square-sync/db.ts
import { all, editors, readOnly } from '../../../lib/db/access';

export const policies = {
  square_items: readOnly(editors),
};
```

A site's policy can't replace a core table's.

## Admin screens

A plugin's admin pages are Astro pages in its `pages/` folder that use the core's `Admin` layout, listed
in `routes.json` under `/admin/<name>/`. Endpoints go under `/api/admin/<name>/`. The core signs
people in for both and lets only editors and admins through (only admins for `adminOnly`). A successful
write under `/api/admin/` clears the page cache. Settings and keys can use the core's settings table
and `env()`, which also reads keys saved under Settings > Connections.
