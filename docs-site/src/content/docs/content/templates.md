---
title: Templates and types
description: Templates per type, content areas, patterns, linked patterns and globals.
sidebar:
  order: 5
---

## Templates per type

**Settings > Types** sets, for each type, the template for its entries and for its listing page
(`settings.site.templates`, `src/lib/templates.ts`). An entry's own template (in its settings) comes
before its type's.

The screen marks templates without a **Page content** block. If you choose one, it warns that the
entry's content won't show. A page whose template has no Page content block opens in layout mode. In layout mode, you edit the
template document itself.

Each listing page also has its own featured image and SEO there (see
[SEO and social](../../features/seo-and-social/#listing-pages)).

Listing pages can be turned off (`settings.site.listings_off`). The address then serves a page with
that address, if any, or 404. For events, the calendar views go too.

Templates and layout mode have no drafts: **Save & apply** changes every page that uses them.

## Renaming

**Rename** is in the templates list and in a template's, part's or pattern's editor header
(`src/admin/RenameTemplate.tsx`, POST `/api/admin/templates` with `{ action: 'rename', kind, slug, title,
newSlug }`, `renameTemplate` in `src/lib/admin/rename-template.ts`). It changes the name
(`templates.title`, up to 120 characters) and the address (slug). The dialog's Address follows the name
until someone edits it. The row keeps its `updated_at`, so an editor who has it open isn't asked about a
newer version.

With the server's access, the site writes the new address wherever it names the old one:

- For a part or pattern: the blocks that place it in entries, their unpublished changes and other
  templates (`renameInDoc`). A `header` or `footer` part keeps its role as `attrs.area`, which the part
  renderer reads before its slug.
- For a template: the entries that chose it, their unpublished changes, Settings > Types
  (`settings.site.templates`, `taxonomy_templates`) and terms (`fields.template`).
- Compose conversations about it.

Those rows keep their `updated_at` too. The old address goes into `templates.former_slugs`.
`Loader.template` falls back to it when no template has that address. So a template that the hierarchy
found by its name (`single-post`, `archive`) still serves those pages. Revisions, a site's code and
copies that haven't synced still find it too. A template given a former address takes it over. The old
editor address redirects to the new one. A save to an address that has gone answers 404 rather than
saving nothing. Sync carries `former_slugs` with the row.

## Trash

**Trash** is in the templates list (`src/admin/TrashTemplate.tsx`, POST `/api/admin/templates` with
`{ action: 'uses' }` then `{ action: 'trash' }`, `src/lib/admin/template-trash.ts`). It first shows what
uses the template (`templateUses`: entries that place or chose it, templates that place it, Settings >
Types, terms). Then it sets `templates.trashed_at`. A trashed template, part or pattern keeps its
address, content and `updated_at`. `Loader.template` treats it (and its former addresses) as missing.
So pages use the next template in line or leave the part or pattern out, and the pickers leave it out.
Its editor address opens the Trash at the bottom of the list. There, **Restore** clears `trashed_at` and
**Delete permanently** removes the row (form posts with `action=restore` or `delete`). Deleting only
works from the trash. Its address stays taken while it's in the trash. A part that is missing or has no blocks renders nothing
(no empty `<header>`). Sync carries `trashed_at` with the row.

## Content areas

A template can have several Page content blocks, each naming a content area (`attrs.area`). `main`,
the default, is the entry's content. Each entry fills in the other areas (`sidebar`, `intro`...). They are
stored as slots on its content's root (`root.props["area-<name>"]`, `src/lib/content/areas.ts`). The
editor shows each where the template places it.

Saving a template gives a Page content block that repeats an area the next free name (`area-2`,
`area-3`..., `uniqueAreas`), so two never show the same content.

## Patterns

Patterns (`templates` of type `pattern`) are reusable groups of blocks, inserted from the editor's
Patterns tab. Their thumbnails come from `/admin/pattern-preview?slug=`.

Any block's settings end with **Save as pattern** (the block and everything in it).

- **Copy pattern**: inserts its own blocks, which the page changes freely.
- **Linked pattern** (`root.props.linked`): placed as a reference. Layout and style stay the
  pattern's, so editing the pattern changes every page. Each page changes only its content.

A linked pattern is stored as:

```json
{
  "type": "pattern",
  "attrs": {
    "slug": "visit-cta",
    "linked": true,
    "overrides": { "<pattern block id>": { "content": "..." } }
  }
}
```

In the editor a linked pattern opens as its blocks (`expandLinked`). They are locked against moving,
removing and adding. Each block's panel shows only its content fields (`CONTENT_FIELDS`,
`src/lib/content/linked-patterns.ts`, `src/puck/LinkedPatterns.tsx`). Saving stores the reference and
the changed content (`collapseAll`), or an ordinary copy if its blocks no longer match the pattern.
**Detach** makes the copy on purpose.

## Globals

Globals (the `global` type, placed with the Global block) share content and style alike: one edit
changes every place it appears.

## Template parts

Parts (`part` block) such as the header and footer are shared regions of templates.
