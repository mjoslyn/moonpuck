---
title: Site configuration
description: config.ts, the file that declares a site's identity, content types, fields and taxonomies.
sidebar:
  order: 1
---

Everything that differs between sites lives in `src/site/`. Its entry point is `config.ts`, which
calls `defineSite` (types in `src/lib/site/types.ts`).

| File | What it holds |
| --- | --- |
| `config.ts` | Name, organization, timezone, mail sender, admin email, the Compose brief, content types and taxonomies |
| `render.ts` | The site's own blocks, card designs, listing filters, `<head>` markup, footer scripts, old-URL redirects ([Blocks and hooks](../extending/)) |
| `editor.tsx` | Settings panels for the site's blocks, site-wide options ([Blocks and hooks](../extending/)) |
| `styles/tokens.css`, `styles/theme.css` | Extra tokens and the site's styles. The theme is in `render.ts` ([Styling](../styling/)) |
| `lib/content/cards.ts` | Card designs for collections |
| `migrations/` | Content migrations for the site's own data changes |
| `pages/api/`, `routes.json` | The site's own endpoints |
| `public/` | Static files, served at the same paths as the core's `public/`. A site file wins |
| `scripts/` | Checks that need this site's content |
| `moved-paths.json` | URL prefixes that moved, answered with a 301 |

Inside `src/site/`, files sit where their core counterparts do (`render/c/`, `lib/`, `pages/api/`,
`styles/`, `public/`, `scripts/`), so each maps onto the core.

After you change `config.ts`, run `npm run check`.

## Identity

```ts
export default defineSite({
  name: 'Example Town',
  organization: 'Example Town Council',
  timezone: 'America/New_York',
  mailFrom: 'Example Town <noreply@example.org>',
  adminEmail: 'info@example.org',
  brief: 'The Example Town site: things to do, events and news for visitors and the businesses that serve them.',
  types: [ /* ... */ ],
  taxonomies: [ /* ... */ ],
});
```

| Option | Meaning |
| --- | --- |
| `name` | The site's name as visitors see it |
| `organization` | Who runs it: admin sign-in, mail sender name |
| `timezone` | IANA timezone for event times. This is the default, and admins can change it under Settings |
| `mailFrom` | Default From for outgoing mail, overridden by `MAIL_FROM` |
| `adminEmail` | Where form notifications go when a form doesn't say (`FORMS_ADMIN_EMAIL` overrides it) |
| `brief` | What Compose knows about the site: who it is for, what it covers, its voice |
| `compose` | Compose's house style, when it differs from the defaults ([Styling](../styling/#compose-house-style)) |

## Content types

`page`, `post` and `global` are required. Events (the `event` and `venue` types and the
`event_category` taxonomy) come with the core. Admins turn them on under Settings > Events. To extend
them, use `events` (fields added, replaced or left out, labels, URLs). See
[Events](../../features/events/#extending-the-event-types).

```ts
{
  type: 'event',
  label: 'Events',
  singular: 'Event',
  base: 'event',
  archive: '/events/',
  category: 'event_category',
  describe: 'an event on the calendar (/events/)',
  card: 'event',
  fields: [
    { key: 'venue', label: 'Venue', type: 'entry', entryType: 'venue' },
    { key: 'cost', label: 'Cost', type: 'text', compose: 'price as written, e.g. "$25, kids free"' },
  ],
}
```

| Option | Meaning |
| --- | --- |
| `type` | Stored in `entries.type` |
| `label`, `singular` | Plural and singular names |
| `base` | URL segment for single entries: `base: 'directory'` serves `/directory/<slug>/`. Without it, entries live at the root |
| `archive` | The type's listing page (`/directory/`) |
| `record` | Data only, with no page. Editors edit it with a plain form (venues) |
| `pageless` | No public page (globals) |
| `hidden` | Left out of the admin's Content menu |
| `category` | The type's main taxonomy: card labels, and the first offered to filter by |
| `taxonomies` | Its other taxonomies. Each gets a term picker in an entry's settings. Collections, filters and bulk actions offer them. Tags apply to every type |
| `fields` | The type's own fields, shown in the editor's Details |
| `describe` | For Compose: what an entry of this type is |
| `logoField` | An image field used as the entry's logo, before the featured image |
| `card` | The default card design for listings of this type (default `image`) |
| `order` | Default listing order: `date` (newest first, default) or `title` |

## Fields

A field definition (`FieldDef`, `src/lib/site/types.ts`) works in three places, with the same types:

- A content type's `fields`: shown in the editor's Details, stored in `entries.fields`.
- A taxonomy's `fields`: shown in each term's Details (Content > Taxonomies), stored in `terms.fields`.
- A site block's settings panel: drawn by `FieldsForm` and stored in the block's `attrs` (see
  [Examples](../examples/)).

Every field has a `key` (where its value is stored), a `label` (what the editor shows) and a `type`.

```ts
fields: [
  { key: 'phone', label: 'Phone', type: 'text', compose: 'phone number' },
  { key: 'website', label: 'Website', type: 'url', compose: 'website address' },
  { key: 'logo', label: 'Logo', type: 'image', compose: 'logo (image id)' },
  { key: 'level', label: 'Membership level', type: 'select', options: [['gold', 'Gold'], ['silver', 'Silver']] },
  { key: 'featured', label: 'Featured', type: 'bool' },
],
```

### Field types

| `type` | In the editor | Stored as | Options |
| --- | --- | --- | --- |
| `text` | A one-line box | A string | |
| `textarea` | A box of a few lines | A string, line breaks kept | |
| `html` | A code box | A string of HTML, put on the page as written | |
| `url` | A box with **Find** (the link picker: the site's pages, files, typed addresses) | A string: a web address, a path on the site, `mailto:` or `tel:` | |
| `email` | A one-line box | A string | |
| `number` | A number box | A number, or `""` when cleared | |
| `bool` | A tick box | `true` or `false` | |
| `select` | A dropdown | The chosen value, a string | `options`: `[value, label]` pairs |
| `image` | A media picker (Choose, Replace, Edit) | The image's address as picked, or a media id (imports and Compose write ids) | |
| `entry` | A search for one entry, with Clear and an inline Add | The entry's id, a number | `entryType`: the type to pick from. `create`: the fields asked for when adding one inline |
| `entries` | A search that adds entries to a list, with ↑ and ↓ to reorder | An array of entry ids, in order | `types`: the types to pick from |
| `repeater` | A list of items, each its own small form that folds away, with Up, Down, Remove and Add | An array of objects, one per item, keyed by its fields | `fields`: the item's fields (any of these types). `itemLabel`: the field shown as an item's title. `itemName`: what one item is called ("Add day"). Else the label made singular |

Notes:

- Code that reads an `image` field takes either kind of value, as the Featured image block's `field`
  setting and the Field block shown as an image do. A number is a media id, and anything else is an
  address. The page loads the media ids in a type's top-level image fields (and so do a collection's
  cards, `loadEntryMedia`), so their sizes and alt text are there. An address is used as it is.
- `bool` values from older imports can be `"1"` or `1`. The tick box reads those as ticked.
- Values aren't checked against the type on save. A renderer escapes what it shows (`esc`, `escAttr`)
  and treats a missing or odd value as empty.
- Admins can add types of their own under Settings > Types, with the field types `text`, `textarea`,
  `html`, `url`, `email`, `number`, `bool`, `image` and `select`. `entry`, `entries` and `repeater` are
  for code only.

### Compose

Compose may fill a field that has a `compose` hint, from an editor's materials. The hint tells
Claude what the field holds (`"phone number"`, `"logo (image id)"`). Compose leaves fields without one
to the editor. Only `text`, `textarea`, `html`, `url`, `email`, `number`, `bool`, `image` and `select`
take a hint. Compose writes a `select` field's values only from its `options`. It writes an `image`
field as the media id of an image among the materials, and writes `""` to clear a field.

### Showing a field

- The **Field** block (`entry-field`) shows any field as text, a link, an email address, a phone number or
  an image, with an optional label before it. In a collection's card it shows the card's entry. On a
  term page, it shows the term's.
- The **Featured image** block's `field` shows an image field in place of the featured image (a logo, a
  banner), and `linkField` links it to a `url` field.
- A site's own blocks read the page's fields from `env.post.fields`. Set `types` on the block so the
  editor offers it only on those entry types (see [Blocks and hooks](../extending/)).

### Reserved keys

The core keeps these keys in `entries.fields` for itself, so a site's fields can't use them: `seo`,
`access`, `template`, `featured`, `tickets`, `ticket`, `recurrence`, `timezone` and `imported_from`
(`RESERVED_FIELD_KEYS`). A type whose config has its own `featured` field keeps it, in place of the
one Settings > Types adds. On terms, `template`, `image`, `seo` and `memberDiscounts` are reserved.
Event fields the core reads are listed under [Events](../../features/events/).

## Taxonomies

```ts
taxonomies: [
  { name: 'category', label: 'Category', base: 'category' },
  { name: 'tag', label: 'Tag', base: 'tag' },
  { name: 'event_category', label: 'Event category', base: 'events/category' },
],
```

`category` and `tag` are required.

| Option | Meaning |
| --- | --- |
| `name` | Stored in `terms.taxonomy` |
| `label`, `singular` | Names. `singular` defaults to the label |
| `base` | URL base for term pages: `directory/category` serves `/directory/category/<slug>/` |
| `lists` | The type a term page lists. Default: the one type with this taxonomy as its `category`, else every type |
| `fields` | Its terms' own fields, edited in each term's Details and shown by the Field block on term pages. `template`, `image` and `seo` are reserved |

## How the core reads it

Core code reads the config only through `src/lib/site`: `CONTENT_TYPES`, `COMPOSABLE_TYPES`,
`LISTABLE_TYPES`, `RECORD_TYPES`, `PAGELESS_TYPES`, `TYPE_BASES`, `ARCHIVE_PATHS`, `TAXONOMY_BASES`,
`fieldsFor`, `categoryOf`, `taxonomiesOf`, `termPageType`, `SITE_TZ`. The editor's Details, Compose's
fields and prompt, permalinks, URL routing (archives, term pages, records), collection filters and the
admin tabs all follow it.
