---
title: Sync
description: Copy content, files and settings between this site and another copy of it, either way.
sidebar:
  order: 11
---

**Settings > Sync** (admins) copies content between this site and another copy of it, such as
production and a local copy, in either direction.

## Setting it up

Give both copies the same secret, a long random value of at least 32 characters. On a deployed copy,
use `npx wrangler secret put SYNC_SECRET`. On the copy you sync from, set the other copy's name and
address, then restart it:

```sh
SYNC_SECRET=<the same long random value on both copies>
SYNC_REMOTE_NAME=Production
SYNC_REMOTE_URL=https://<its address>
```

Both copies need the same version of the core. Each request is signed with its route and a one-time
value, and an older copy doesn't check or send that value. So update both before syncing again.

The sync sends its queries and file calls to the other copy's `/api/sync/remote` and `/api/sync/files`,
signed with the secret. The other copy answers only signed requests, and only for the tables and
folders a sync uses. So the sync runs from the copy that has the address set. A local copy can push to
and pull from production, but production can't reach a local copy. Apply the migrations on both copies.

## What can sync

| Group | Matched by | Includes |
| --- | --- | --- |
| Each content type | id | The entry, its terms (those that exist on the target) and unpublished changes |
| Each taxonomy | id | Its terms, parents first |
| Files | id | The media row and every storage object: sizes, the kept original, AVIF and WebP copies |
| Templates, parts and patterns | kind and slug | Title and content |
| Forms | id | Title, fields, notifications, active |
| Settings and menu | key | `site` and `options`, and the site icon's files |
| Redirects | old address | Target, status, note |
| Shop discounts | id | The whole discount |
| Shop orders | the order | The whole order, without its member or discount id (the target's discount with the same code) |
| Shop stock counts | product and option | The count on hand. Left out of **All**, ticked only on purpose |

Copies of one site share ids, and a sync keeps them. Rows added later take ids past the largest, so they
don't collide.

## Running a sync

1. Pick a direction and what to sync, and **Compare**.
2. Each group lists its new, changed and unchanged rows, and its conflicts. The sync leaves conflicts
   alone. A conflict is an id that is a different row on the target, an address another row has, or a
   parent or featured image that isn't on the target (include Files to bring images).
3. **Show differences** opens a line diff of a row: the target's version against what the sync would
   write. Untick any row you want left as it is.
4. The warning names the site being written to and how many of its rows will be overwritten. Tick it
   and sync. Rows are written in batches, with progress shown.

A sync adds and overwrites. It never deletes.

The sync copies the shop's orders as they are. No emails go and no stock changes. An order never goes
backwards. An order further along on the target (paid, refunded, sent, its stock taken off), or changed
there since, is a conflict, and the sync leaves it alone. Stock counts replace the target's counts,
which its own orders have been taking off. So tick them only to set the counts there.

## Backups and snapshots

:::caution[Images aren't backed up]
Backups and snapshots hold the site's content as database rows. Stored images, the files of the media
library, are not backed up. A restore brings back a file's library row, not its image. Keep a copy of
the store's `media/` folder (the R2 bucket) some other way if you need one.
:::

What protects images instead: the CMS never deletes or overwrites a stored image. The media library has
no delete. A restore that removes a file's library row leaves its images in storage, so undoing the
restore finds them again. An upload never takes a name whose files are still in storage. Images are
lost only if someone deletes them from the bucket directly.

**Settings > Backups** has a panel for this site, and one for the copy it syncs with when one is set
up. Each lists that site's backups and snapshots, newest first, to download, restore or delete.

### Sync backups

Before writing anything, a sync checks that the target can take it: it isn't protected, and it has its
migrations. Without them, the target refuses the sync. Then, with **Save a backup first** ticked (the
default), the sync saves a backup on the target. The backup holds every row the sync is about to
overwrite, whole and as it is now, and a list of the rows it adds. If the backup can't be saved, nothing is synced. If a row the sync means to
add now exists on the target (someone made it there since Compare), the sync stops and asks you to
compare again. As each batch is written, the rows it really added are recorded beside the backup.

### Snapshots

A snapshot is everything a sync covers on one site, as it is: entries with their terms and unpublished
changes, terms, library rows, templates, forms, settings, redirects, and the shop's discounts, orders and
stock counts.

- **Back up now** takes one at once.
- **Take one every day / every week** takes them on a schedule: the Worker's daily run at 07:00 UTC
  (`src/worker.ts`) on the deployed site.
- Restoring a snapshot takes one of the current state first.

### What a site keeps

Each site sets how many sync backups (10 by default) and snapshots (14) it keeps. 0 keeps all. Older ones
are deleted after each new one, and when you lower a number. These settings, and the snapshot schedule,
belong to each site. Syncing or restoring settings never changes them.

### Restoring

- **A sync backup** undoes that sync on the site that holds it. The rows the sync overwrote go back to
  how they were (entries with their terms and unpublished changes). The rows it added are deleted, but
  only those it really wrote. So a sync that stopped halfway doesn't take later rows with it.
- **A snapshot** writes every row it holds back as it was. The panel first shows, per table, how many
  rows it puts back and how many were made since. Those are deleted only if you tick **Also delete the
  rows made since the snapshot**.

Either way, changes made to those rows since are lost. The restore saves the current state first (named
`before-restore`), so you can undo a restore with the same button. Deleting a file deletes its library
row only. Its stored images stay, so undoing the restore brings the file back whole. A restore never
deletes a form that has submissions, because its submissions would be cut loose from it. It also never
deletes a row other rows came to depend on: an event with ticket orders or waitlists, a page with pages
under it, a term entries still use, a file entries feature. The report names what was kept.

A restore never deletes the shop's orders, because money was taken for them. Orders also never go
backwards. An order further along now, or changed since the backup, stays as it is, and the report
names it. Stock comes back as the backup has it, less what orders paid since then took off. So sold
stock isn't put back.

:::caution[Backups hold buyers' details]
With the shop on, backups and snapshots hold its orders, with buyers' names, emails, phone numbers and
addresses. They stay in the store's private `sync-backups/` folder, and only admins can download them.
:::

A restore runs as a job (on the Worker's jobs queue, up to 15 minutes), so a large one isn't cut off
halfway. The screen waits for it and then shows the result.

## Protecting a site

**Protect this site from syncs** (in each copy's own Settings > Sync, `settings.site.sync_protected`) makes
that copy refuse every sync into it, whichever copy starts it. Syncing settings never changes the
target's protection.
