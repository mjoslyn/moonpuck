// Targeted edits: Claude sees the selected block as the site's component data and returns replacement
// blocks (edit_block tool). They are checked here before they reach the page: known component types
// only, ids kept for blocks that already existed, fresh ids for new ones, material references
// ("image-2", "video-1") resolved to library media.
import type { PuckItem } from '../puck/types';
import { isRegistered } from '../../render/engine';
import '../../render/blocks';
import type { BuildMaterials } from './build';
import { cardTemplate, CARD_IDS, DEFAULT_CARD } from '../content/card-presets';
import { LISTABLE_TYPES } from '../site';
import { cleanInlineHtml, isSafeUrl } from './safe-html';


export const EDIT_SCHEMA = {
  type: 'object',
  required: ['blocks'],
  properties: {
    blocks: {
      type: 'array',
      description: 'The blocks that replace the selected block, in order (usually one block of the same type). Same shape as the selected block: {"type", "props": {"id"?, "attrs", "children"?}}.',
      items: {
        type: 'object',
        required: ['type', 'props'],
        properties: {
          type: { type: 'string', description: 'Component type, e.g. section, heading, text, image, buttons, button, list, list-item, columns, column, cover, gallery, video-gallery, quote, separator, embed, video, collection.' },
          props: { type: 'object', description: '{"id": keep the id of blocks you keep, omit for new blocks; "attrs": {...}; "children": [blocks] for containers}.' },
        },
      },
    },
  },
} as const;

/** How the components are described to Claude (it also sees the real data of the selected block). */
/** How components are written, with the site's palette names (its theme's colours, Settings > Theme). */
export const componentGuide = (colors: string[]) => `Component data: {"type", "props": {"id", "attrs", "children"?}}. Containers (section, columns, column, buttons, quote, cover, gallery, video-gallery, media-text, collection) hold blocks in "children"; gallery holds image blocks and video-gallery embed/video blocks, both with "display" ("grid", "masonry", "slider"), "columns" and "gap"; a gallery may set "ratio" (e.g. "3/2", images cropped to it; not with masonry) and, as a slider, "autoplay": true.
A hero is one block with no children: attrs {"material" (an image id) or "mediaId"/"src", "eyebrow", "title", "text" (plain text, no HTML), "primaryLabel", "primaryHref", "secondaryLabel", "secondaryHref", "height": "screen"|"large"|"medium", "level": 1|2}.
A list is one block: attrs {"items": [{"content": inline HTML, "icon"?}], "marker": "bullet"|"number"|"icon"|"none", "icon" (check, check-circle, arrow-right, chevron, dot, dash, plus, star, heart, map-pin, clock, calendar, phone, mail, info, snowflake, sun, mountain, leaf), "iconColor", "itemGap", "style"}.
Common attrs: text/heading "content" (inline HTML: <strong>, <em>, <a href>); heading "level" (1-6); button "text", "href", "variant" ("outline"); image/cover "material" (an image id like "image-2") or keep "mediaId"/"src"; embed/video "material" (a video id); section "layout" ({"type": "flow"|"constrained"|"row"|"stack"|"grid", "contentSize"}) and "gap"; "style" holds CSS values with the site's tokens: colors var(--color-${colors.join('|') || 'name'}), spacing var(--space-10..80), font sizes var(--text-small|medium|large|x-large|xx-large|heading-2|heading-1|hero), fonts var(--font-display|body); style keys like color, background, fontSize, fontFamily, fontWeight, lineHeight, textAlign, padding {top,right,bottom,left}, margin, radius.
A collection lists site content: attrs {"query": {"postType": ${LISTABLE_TYPES.map((t) => `"${t}"`).join('|')}, "perPage", "include": [entry ids], "upcoming"}, "display": "grid"|"list"|"slider", "columns" (also "columnsTablet", "columnsMobile"), "itemGap", "shuffle": true (a random selection on each visit), "card": ${CARD_IDS.map((c) => `"${c}"`).join('|')}} with no children (the card design fills them); columns and spacing always go on the collection, never on its items.
Match the styles of the block and page you are editing.`;

const CONTAINERS = new Set(['section', 'columns', 'column', 'buttons', 'quote', 'cover', 'gallery', 'video-gallery', 'media-text', 'collection', 'collection-items', 'collection-empty', 'pagination']);

/** Ids used anywhere in a tree. */
function ids(items: PuckItem[] | undefined, out = new Set<string>()) {
  for (const i of items ?? []) {
    if (i?.props?.id) out.add(i.props.id);
    ids(i?.props?.children, out);
  }
  return out;
}

/** Attrs of each block in a tree, by id. */
function attrsById(items: PuckItem[] | undefined, out = new Map<string, Record<string, any>>()) {
  for (const i of items ?? []) {
    if (i?.props?.id) out.set(i.props.id, (i.props as any).attrs ?? {});
    attrsById(i?.props?.children, out);
  }
  return out;
}

const URL_KEY = /^(?:href|url|src|poster)$|(?:Href|Url|Src)$/;

/** An attr value from Claude: addresses must be safe, markup is cleaned to inline formatting and links. */
function cleanValue(key: string, v: unknown): unknown {
  if (typeof v === 'string') return URL_KEY.test(key) ? (isSafeUrl(v) ? v : undefined) : v.includes('<') ? cleanInlineHtml(v) : v;
  if (Array.isArray(v)) return v.map((x) => cleanValue(key, x)).filter((x) => x !== undefined);
  if (v && typeof v === 'object') return cleanAttrs(v as Record<string, unknown>);
  return v;
}

function cleanAttrs(attrs: Record<string, unknown>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(attrs)) {
    const c = cleanValue(k, v);
    if (c !== undefined) out[k] = c;
  }
  return out;
}

export interface SanitizeResult {
  items: PuckItem[];
  dropped: string[];
}

/** Claude's replacement blocks, made safe to put on the page. */
export function sanitizeBlocks(raw: unknown, original: PuckItem, m: BuildMaterials, prefix: string): SanitizeResult {
  const keep = ids([original]);
  const before = attrsById([original]);
  const used = new Set<string>();
  const dropped: string[] = [];
  let n = 0;
  const fresh = (type: string) => `${prefix}-${type}-${Date.now().toString(36)}${n++}`;

  const clean = (list: unknown): PuckItem[] =>
    (Array.isArray(list) ? list : []).flatMap((b: any): PuckItem[] => {
      if (!b || typeof b !== 'object' || typeof b.type !== 'string') return [];
      if (!isRegistered(b.type)) {
        dropped.push(b.type);
        return [];
      }
      const props = b.props && typeof b.props === 'object' ? b.props : {};
      const attrs: Record<string, any> = props.attrs && typeof props.attrs === 'object' && !Array.isArray(props.attrs) ? { ...props.attrs } : {};
      // Materials -> library media.
      const ref = typeof attrs.material === 'string' ? attrs.material : null;
      delete attrs.material;
      if (ref && (b.type === 'image' || b.type === 'cover' || b.type === 'media-text' || b.type === 'hero')) {
        const img = m.images.get(ref);
        if (img) Object.assign(attrs, { mediaId: img.mediaId, src: img.src }, b.type === 'hero' ? {} : { alt: attrs.alt ?? img.alt }, b.type === 'image' && !attrs.size ? { size: 'large' } : {});
      }
      if (ref && (b.type === 'embed' || b.type === 'video')) {
        const v = m.videos.get(ref);
        if (v?.kind === 'embed') return [{ type: 'embed', props: { id: fresh('embed'), attrs: { ...cleanAttrs(attrs), url: v.url, provider: v.provider, html: v.html, ratio: attrs.ratio ?? 16 / 9 } } } as PuckItem];
        if (v?.kind === 'file') return [{ type: 'video', props: { id: fresh('video'), attrs: { ...cleanAttrs(attrs), src: v.src, mediaId: v.mediaId, controls: true } } } as PuckItem];
      }
      const id = typeof props.id === 'string' && keep.has(props.id) && !used.has(props.id) ? props.id : fresh(b.type);
      used.add(id);
      // Raw HTML (html and embed blocks) is never taken from Claude: a kept block keeps what it had.
      const html = before.get(id)?.html;
      const safe = cleanAttrs({ ...attrs, html: undefined });
      if (html !== undefined) safe.html = html;
      const item: PuckItem = { type: b.type, props: { id, attrs: safe } } as PuckItem;
      if (b.type === 'collection' && !props.children?.length) {
        // A new collection: its card design supplies the item template.
        const card = typeof safe.card === 'string' && safe.card !== 'custom' ? safe.card : DEFAULT_CARD;
        Object.assign(safe, { card, appliedCard: card });
        (item.props as any).children = [{ type: 'collection-items', props: { id: fresh('collection-items'), attrs: {}, children: cardTemplate(card, fresh('card')) } }];
      } else if (CONTAINERS.has(b.type)) (item.props as any).children = clean(props.children);
      return [item];
    });

  return { items: clean((raw as any)?.blocks ?? raw), dropped };
}

export { findBlock, replaceBlock } from '../puck/tree';
