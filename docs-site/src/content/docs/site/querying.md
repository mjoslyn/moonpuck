---
title: Querying data
description: The Loader, a page's one way to read entries, terms, media and settings, and how a block's prepare hook uses it.
sidebar:
  order: 3
---

Renderers are synchronous: they turn a block's `attrs` into HTML and load nothing. The page reads
everything it shows before it renders. It does this in `prepare` hooks (a block's `prepare`, the site's
`archiveQuery`), through the page's **Loader** (`src/lib/data.ts`), `ctx.loader`. What a hook loads goes
on `ctx.data`, and the renderer reads it from there (see [A block that loads data](../examples/#a-block-that-loads-data)).

There is one Loader per request. It keeps what it has read, so a second lookup of the same entry, term,
media row or setting costs nothing, and blocks that need the same things can each ask for them.

## What it can see

A Loader reads as the site's visitors see it (its **scope**, `LoaderScope`):

- Published entries only.
- Members-only entries only for members of their levels and for editors (see
  [Members](../../features/members/)). When the site renders the page again for someone signed in,
  that visitor is in the scope.
- No entries of a feature that is off (events while Events is off, products while the Shop is off).

The editor's canvas and previews read without a scope, as the signed-in editor, so drafts show there.

Sometimes a list or lookup leaves out a members-only entry that the visitor may not see. Then it marks
the page as depending on its visitor (`loader.hidMembersOnly`). So the page isn't cached for everyone,
and members see their entries. A hook that reads through the Loader gets this for nothing.

## Entries

```ts
// The newest three posts in a category, then the entries themselves.
const term = await ctx.loader.termBySlug('category', 'news');
const { ids, total, pages } = await ctx.loader.query({
  postType: 'post',
  perPage: 3,
  terms: term ? { category: [term.id] } : undefined,
});
const posts = await ctx.loader.entriesByIds(ids);
```

`query()` answers with ids (in order), the total and the number of pages. It keeps the rows it read, so
`entriesByIds(ids)` afterwards reads nothing more.

| Method | Answers |
| --- | --- |
| `query(args)` | `{ ids, total, pages }`: the entries matching `args` (below), in order, one page of them |
| `entriesByIds(ids)` | Those entries (the ones it may see), in the order asked, without their content |
| `entryById(id, withContent = true)` | One entry, or null |
| `entry(type, slug, withContent = true)` | The published entry of a type (or the first of several types) at an address, or null |
| `hasRecurring()` | Whether any published event repeats |

An `Entry` (`src/lib/types.ts`) has `id`, `type`, `slug`, `title`, `excerpt`, `status`, `template`,
`parent_id`, `menu_order`, `featured_media_id`, `fields` (its own fields, see
[Fields](../configuration/#fields)), `content` (its blocks, when asked for), `event_start`, `event_end`,
`event_all_day`, `published_at`, `updated_at` and `term_ids`. An occurrence of a recurring event also has
`occurrence` (its date) and `series_id`. Its `id` is negative. Link to an entry with `permalink(entry)`
(`src/lib/permalink.ts`).

### query() arguments

`QueryArgs`:

| Argument | What it does |
| --- | --- |
| `postType` | A type or a list of types (needed) |
| `perPage` | Entries per page (needed) |
| `page` | Which page, from 1 |
| `offset` | Entries to skip before the first page |
| `orderBy` | `date` (published, the default), `modified`, `title`, `menu_order`, `menu_order_title`, `event_start`, `rand` (shuffled), `include` (the order of `include`) or `relevance` (with `search`) |
| `order` | `desc` (the default) or `asc` |
| `search` | Words that must each start a word of the title, excerpt or text |
| `terms` | `{ taxonomy: [term ids] }`: an entry must have one of each taxonomy's terms, and every taxonomy listed. Children aren't included: widen with `tools.descendantTermIds(ids)` |
| `include` | Only these ids (hand-picked) |
| `exclude` | Not these ids |
| `parents` | Only entries under these parents |
| `featuredOnly` | Only entries whose Featured switch is on (`fields.featured`) |
| `upcoming` | Events still to start, soonest first (ordering and `order` ignored) |

Events that repeat are listed as their occurrences, each at its own date, up to two years ahead.

## Terms

| Method | Answers |
| --- | --- |
| `allTerms()` | Every term of every taxonomy, read once per page |
| `termById(id)` | A term, or undefined |
| `termBySlug(taxonomy, slug)` | A term, or undefined |
| `termCounts(taxonomy)` | A map of term id to its number of published entries (members-only ones left out) |

A `Term` has `id`, `taxonomy`, `slug`, `name`, `description`, `parent_id`, `sort` and `fields` (the
taxonomy's own fields). An entry's terms are its `term_ids`. Find them with `termById`.

## Media

`loadMedia(ids)` reads media rows by id (numbers or numeric strings, and it skips others), with the
images they use for other crop shapes. `mediaById(id)` then gives a row, from a renderer too. For
entries, `tools.loadEntryMedia(ids)` (the hook's third argument) reads their featured images and image
fields at once. A renderer turns a row into markup with `mediaImgTag(mediaImage(media, size, { alt }))`
(`src/lib/media/image.ts`).

## Settings, templates and forms

- `settings()`: every settings row by key (`site`, `options`). `ctx.settings` already holds them.
- `template(kind, slug)`: a template, part or pattern's document by address, or null. A trashed one
  counts as missing. A renamed one is found by its old address too.
- `forms()`: the active forms' definitions.

## The page itself

`ctx.queried` says what the address is:

- `kind`: `singular`, `archive`, `taxonomy`, `search` or `404`.
- `entry`: the entry, on its own page.
- `postType`: the type, on a listing.
- `term`: the term, on a term page.
- `search`: the search words, on `/search/`.
- `page`: the page number, `url`, `isFront` (the home page).

On an entry's own page, a block of the site's reads its fields from `env.post.fields` in the renderer
(set `types` on the block so the editor offers it only there).

## A listing page: archiveQuery

`archiveQuery` in `render.ts` changes the query of a listing, term or search page before it runs, by
changing `args` in place:

```ts
// render.ts
export default defineRender({
  async archiveQuery(args, ctx) {
    // The directory by name, 50 a page.
    if (ctx.queried.postType === 'member') {
      args.orderBy = 'title';
      args.order = 'asc';
      args.perPage = 50;
    }
  },
});
```

The core applies a Filters block on the page first, so `args.search` and `args.terms` already hold what the
visitor chose.

## Below the Loader

`ctx.loader.db` is the query layer, a chained query builder on D1
(`db.from('entries').select(...).eq(...)`, `src/lib/db`). It reads as the server and isn't limited to
what visitors may see. So a query of `entries` through it should go through
`visibleTo(query, ctx.loader.scope)` (`src/lib/data.ts`), which adds the Loader's limits. Use it only
for what the Loader doesn't read: a table of the site's own, or a count. Each statement stays within
D1's limits (100 bound values). Lists are bound as one value, so `in()` takes any length.
