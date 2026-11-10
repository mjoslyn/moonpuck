---
title: Search
description: The search page, live results and the search API.
sidebar:
  order: 6
---

## The search page

`/search/?q=` lists the entries whose title, excerpt or body text (`entries.body_text`) have every
word of the search at the start of a word. For example, "tow" finds "town". Case and accents don't
matter. The search reads the full-text index (`entries_fts`, FTS5 in D1), which triggers keep in step.
Results are ranked by relevance (`Loader.queryRanked`, the `entry_search` function). The ranking is
BM25: words in the title weigh most, then the excerpt, then the text. On ties, the newest comes first.
The best 1,000 matches are ranked.

It searches the types chosen under Settings > Search (`settings.site.search_types`, `searchTypes`).
By default, it searches all types with a page. Entries whose SEO settings say **Leave out of this site's search**
(`fields.seo.nosearch`) never match. It renders the `search` template (`src/lib/content/search-template.ts`),
else `index`. The page is noindex.

## The search form

The `search-form` block is a GET form to `/search/`. On any page with a `.c-search-form`, the page
shell adds `public/assets/js/search.js`: live results under the field as an ARIA combobox. The arrows and
Enter work in it, and Escape closes only the list.

A form sets these as data attributes:

| Attribute | Effect |
| --- | --- |
| `data-types` | Narrows the types (any with a page of its own) |
| `data-taxonomy` | Adds that taxonomy's terms in use to the suggestions |
| `data-input` | The field's name (default `q`) |
| `data-all` | `false` leaves out the link to all results |

Picking a term fires a cancelable `c-search:term` event on the form.

## API

`GET /api/search?q=&limit=&types=&taxonomy=` returns JSON, cached at the CDN for a minute.
