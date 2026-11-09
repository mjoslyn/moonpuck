// Share cards: the image social networks and chat apps show for a page that has no share image of its
// own (its SEO settings), made from its title, what it is and its featured image (src/lib/share-card/
// render.ts draws it; src/pages/share-card/[...path].ts serves it). This file decides what a card shows
// and its address, whose `v` changes with anything the card shows, so an edited page gets a new image.
import type { Entry, Term } from '../types';
import { summary, seoOf } from '../seo';
import { site as config, taxonomyLabel, typeDef } from '../site';
import { SITE_RENDER } from '../site/render';
import { listingImageId, taxonomyMeta, termImageId } from '../page-meta';

/** Changes when the core's card design does, so every card is made again. */
const CORE_DESIGN = '1';

export type CardKind = 'entry' | 'term' | 'listing';

/** What a card shows, without the image bytes (they are read when it is drawn). */
export interface ShareCardData {
  kind: CardKind;
  /** The entry's or term's id, or the listing's type. */
  key: string;
  title: string;
  label: string;
  siteName: string;
  isFront: boolean;
  /** The site's tagline (Settings), on the home page's card. */
  tagline: string;
  /** Media id of the photo: the page's featured image, else the default share image. */
  imageId?: number;
  /** The site icon's path in the media folder (192px). */
  iconPath?: string;
}

/** Whether pages without a share image get a card (Settings > Social; on unless turned off). */
export const cardsOn = (site: Record<string, any> | undefined) => site?.share_cards !== false;

const id = (n: unknown) => [n].map(Number).find((x) => x > 0);

/** The site icon's path under /media/ (its 192px file), if it has one. */
function iconPath(site: Record<string, any> | undefined): string | undefined {
  const url = String(site?.icons?.['192'] ?? site?.icon_192 ?? '');
  const m = url.match(/^\/media\/([^?#]+)/);
  return m ? decodeURIComponent(m[1]) : undefined;
}

const base = (site: Record<string, any> | undefined, isFront = false) => ({ siteName: summary(site?.name ?? config.name, 120), tagline: isFront ? summary(site?.description, 160) : '', iconPath: iconPath(site) });

/** An entry's card: published, not members-only, with a page. */
export function entryCard(entry: Entry, site: Record<string, any> | undefined): ShareCardData | null {
  if (entry.status !== 'publish' || entry.locked || entry.fields?.access?.members || entry.id <= 0) return null;
  const isFront = entry.id === Number(site?.front_page_id);
  return {
    kind: 'entry',
    key: String(entry.id),
    title: summary(entry.title_rendered ?? entry.title, 140),
    label: isFront || entry.type === 'page' ? '' : (typeDef(entry.type)?.singular ?? ''),
    isFront,
    imageId: id(entry.featured_media_id) ?? id(site?.share_image),
    ...base(site, isFront),
  };
}

/** A term page's card: the term's name, its taxonomy and its featured image (else its taxonomy's). */
export function termCard(term: Term, site: Record<string, any> | undefined): ShareCardData {
  return {
    kind: 'term',
    key: String(term.id),
    title: summary(term.name, 140),
    label: taxonomyLabel(term.taxonomy),
    isFront: false,
    imageId: termImageId(term, site) ?? id(site?.share_image),
    ...base(site),
  };
}

/** A type listing's card: the type's name and the listing's featured image. */
export function listingCard(type: string, site: Record<string, any> | undefined): ShareCardData | null {
  const t = typeDef(type);
  if (!t) return null;
  return {
    kind: 'listing',
    key: type,
    title: summary(t.label, 140),
    label: '',
    isFront: false,
    imageId: listingImageId(site, type) ?? id(site?.share_image),
    ...base(site),
  };
}

/** Whether a term has a share image set: its own SEO's, or its taxonomy's default. */
export const termHasShareImage = (term: Term, site: Record<string, any> | undefined) => !!(id(seoOf(term.fields).image) ?? id(taxonomyMeta(site, term.taxonomy).seo?.image));

/** A short hash of what the card shows and its design (FNV-1a, base 36). */
export function cardStamp(card: ShareCardData): string {
  const text = JSON.stringify([card.kind, card.key, card.title, card.label, card.siteName, card.isFront, card.tagline, card.imageId ?? 0, card.iconPath ?? '', CORE_DESIGN, SITE_RENDER.shareCard?.version ?? '']);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** The card's address (on the site). */
export const cardPath = (card: ShareCardData) => `/share-card/${card.kind}/${encodeURIComponent(card.key)}.png?v=${cardStamp(card)}`;

/** Where a card is kept in the store: share-cards/<kind>/<key>-<stamp>.png. */
export const cardKey = (card: ShareCardData) => `${cardPrefix(card.kind, card.key)}${cardStamp(card)}.png`;
export const cardPrefix = (kind: CardKind, key: string) => `share-cards/${kind}/${key}-`;

/** A card address's kind and key (`<kind>/<key>.png`), or null. */
export function parseCardPath(path: string): { kind: CardKind; key: string } | null {
  const m = path.match(/^(entry|term|listing)\/([a-z0-9_-]{1,64})\.png$/i);
  if (!m) return null;
  const kind = m[1] as CardKind;
  if (kind !== 'listing' && !/^[1-9]\d{0,9}$/.test(m[2])) return null;
  return { kind, key: m[2] };
}
