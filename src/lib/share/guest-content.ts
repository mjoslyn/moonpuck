// What a guest editing through a share link (src/lib/share/links.ts) may save. Guests have no account,
// so they are not trusted with markup the way editors are: they can't add or change the blocks that put
// raw HTML on the page (HTML, Embed) or a block's imported markup (props.html, props.saved), and every
// text they change is cleaned to inline formatting and safe links (cleanInlineHtml), every address to a
// web, mail, phone or site link (isSafeUrl). What they leave as it was stays as an editor made it.
import { cleanInlineHtml, isSafeUrl } from '../compose/safe-html';
import { fieldsFor } from '../site';
import type { PuckItem } from '../puck/types';

/** Blocks whose markup goes on the page as written: never added or changed by a guest. */
export const GUEST_BLOCKED = new Set(['html', 'embed']);

export const GUEST_BLOCKED_MESSAGE = 'HTML and Embed blocks can’t be added or changed through a share link.';
export const GUEST_ID_MESSAGE = 'A block’s id can only have letters, digits, dashes and underscores.';

/** A block id a guest may give a new block: renderers put ids in markup (a field's id, a label's for). */
const GUEST_ID = /^[A-Za-z0-9_-]{1,100}$/;

/** Settings keys holding an address (href, url, src, link, poster, website...). */
const URL_KEY = /(href|url|src|link|poster|website)$/i;

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Every block in a document: its content, and the blocks in its root's slots (other content areas). */
function eachItem(doc: any, visit: (item: PuckItem) => void) {
  const walk = (items: unknown) => {
    if (!Array.isArray(items)) return;
    for (const item of items as PuckItem[]) {
      if (!item || typeof item !== 'object') continue;
      visit(item);
      walk(item.props?.children);
      // Slot fields other than children (a container's own slots) hold blocks too.
      for (const v of Object.values(item.props?.attrs ?? {})) if (Array.isArray(v) && v.some((x) => x && typeof x === 'object' && 'type' in x && 'props' in x)) walk(v);
    }
  };
  walk(doc?.content);
  for (const v of Object.values(doc?.root?.props ?? {})) walk(v);
}

/** A value a guest wrote, cleaned where it changed from `before` (the same setting as it was saved). */
export function cleanGuestValue(value: unknown, before: unknown, key = ''): unknown {
  if (same(value, before)) return value;
  if (typeof value === 'string') {
    if (URL_KEY.test(key) && value.trim() && !isSafeUrl(value)) return '';
    return /[<>&]/.test(value) ? cleanInlineHtml(value) : value;
  }
  if (Array.isArray(value)) {
    // Blocks in a slot are cleaned as blocks (by id), not by position.
    if (value.some((x) => x && typeof x === 'object' && 'type' in x && 'props' in x)) return value;
    const old = Array.isArray(before) ? before : [];
    return value.map((v, i) => cleanGuestValue(v, old[i], key));
  }
  if (value && typeof value === 'object') {
    const old = before && typeof before === 'object' && !Array.isArray(before) ? (before as Record<string, unknown>) : {};
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, cleanGuestValue(v, old[k], k)]));
  }
  return value;
}

export type GuestCheck = { ok: true; content: any } | { ok: false; error: string };

/**
 * A guest's content checked against the content as it was (`before`: the draft kept aside, else the
 * entry's): refused when it adds or changes an HTML or Embed block or imported markup; otherwise the
 * content with what the guest changed cleaned.
 */
export function guestContent(after: any, before: any): GuestCheck {
  if (after == null) return { ok: true, content: after };
  if (typeof after !== 'object') return { ok: false, error: 'Not page content.' };
  const old = new Map<string, PuckItem>();
  eachItem(before, (i) => i.props?.id && old.set(String(i.props.id), i));
  const content = structuredClone(after);
  let refused = false;
  let badId = false;
  eachItem(content, (item) => {
    // An id the page already had stays; any other must be a plain one.
    if (item.props?.id != null && !old.has(String(item.props.id)) && !GUEST_ID.test(String(item.props.id))) badId = true;
    const was = item.props?.id ? old.get(String(item.props.id)) : undefined;
    const kept = was && was.type === item.type;
    if (GUEST_BLOCKED.has(item.type) && !(kept && same(item.props.attrs, was!.props.attrs))) refused = true;
    if ((item.props?.html?.length || item.props?.saved?.length) && !(kept && same(item.props.html, was!.props.html) && same(item.props.saved, was!.props.saved))) refused = true;
    if (item.props && !GUEST_BLOCKED.has(item.type)) item.props.attrs = cleanGuestValue(item.props.attrs ?? {}, kept ? was!.props.attrs : undefined) as Record<string, any>;
  });
  if (badId) return { ok: false, error: GUEST_ID_MESSAGE };
  return refused ? { ok: false, error: GUEST_BLOCKED_MESSAGE } : { ok: true, content };
}

/** Entry settings a guest may change; the others stay as they were. */
export const GUEST_ENTRY_KEYS = ['title', 'excerpt', 'featured_image', 'fields', 'event_start', 'event_end', 'event_all_day'] as const;

/** Fields only editors change, whatever the type: SEO, who may see the page, its ticket, a product's
 * prices, stock and download, Featured, and the core's own keys. */
const KEPT_FIELDS = new Set(['seo', 'access', 'ticket', 'tickets', 'shop', 'featured', 'template', 'imported_from']);

/** The fields a guest may change on an entry of `type`: the type's own (its Details), and an event's time
 * zone and repeat rule, which go with its dates. */
export function guestFieldKeys(type: string): Set<string> {
  const keys = fieldsFor(type).map((f) => f.key).filter((k) => !KEPT_FIELDS.has(k));
  if (type === 'event') keys.push('timezone', 'recurrence');
  return new Set(keys);
}

/**
 * The page settings a guest's save stores: `base` (the settings kept aside, else none) with the guest's
 * changes to GUEST_ENTRY_KEYS and to the fields they may change (guestFieldKeys), cleaned like content;
 * the address and every other field always as they were.
 */
export function guestEntry(given: any, base: Record<string, any> | null, current: { type: string; slug: string; title: string; excerpt: string | null; fields: Record<string, any> | null }): Record<string, any> {
  const from = base ?? {};
  const out: Record<string, any> = { ...from, slug: from.slug ?? current.slug };
  if (!given || typeof given !== 'object') return out;
  for (const k of GUEST_ENTRY_KEYS) {
    if (k === 'fields' || !(k in given)) continue;
    const before = k === 'title' ? (from.title ?? current.title) : k === 'excerpt' ? (from.excerpt ?? current.excerpt) : from[k];
    out[k] = k === 'title' && typeof given.title === 'string' ? given.title.slice(0, 500) : cleanGuestValue(given[k], before, k);
  }
  if (given.fields && typeof given.fields === 'object') {
    const was: Record<string, any> = from.fields ?? current.fields ?? {};
    const fields: Record<string, any> = { ...was };
    for (const k of guestFieldKeys(current.type)) {
      if (k in given.fields) fields[k] = cleanGuestValue(given.fields[k], was[k], k);
      else delete fields[k];
    }
    out.fields = fields;
  }
  return out;
}
