// /share-card/<entry|term|listing>/<id or type>.png?v=<stamp>: a page's share card (src/lib/share-card).
// It is drawn once for what the page shows now (`v`), kept in the store (share-cards/), and cached a year
// at the CDN; an address with another `v` is sent on to the current one. Only for what anyone may see:
// published entries that aren't members-only, term pages and listings that are on.
import type { APIRoute } from 'astro';
import { siteDb } from '../../lib/db/site';
import { Loader } from '../../lib/data';
import { siteStorage } from '../../lib/storage';
import { afterAnswer } from '../../lib/platform';
import { featuresOf, offTypes } from '../../lib/features';
import { LISTABLE_TYPES, termPageType } from '../../lib/site';
import { listingOn, termPagesOn } from '../../lib/templates';
import { cardKey, cardPath, cardPrefix, cardStamp, cardsOn, entryCard, listingCard, parseCardPath, termCard, type ShareCardData } from '../../lib/share-card/card';

const KEPT = { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable', 'Cloudflare-CDN-Cache-Control': 'public, max-age=31536000, immutable' };
const BRIEF = { 'Cache-Control': 'public, max-age=60', 'Cloudflare-CDN-Cache-Control': 'public, max-age=60' };
const notFound = () => new Response('Not found', { status: 404, headers: BRIEF });

async function cardOf(kind: string, key: string, loader: Loader, site: Record<string, any> | undefined, off: string[]): Promise<ShareCardData | null> {
  if (kind === 'entry') {
    const entry = await loader.entryById(Number(key), false);
    return entry && !off.includes(entry.type) ? entryCard(entry, site) : null;
  }
  if (kind === 'term') {
    const term = await loader.termById(Number(key));
    return term && termPagesOn(site, term.taxonomy) && !off.includes(termPageType(term.taxonomy)) ? termCard(term, site) : null;
  }
  return LISTABLE_TYPES.includes(key) && listingOn(site, key) && !off.includes(key) ? listingCard(key, site) : null;
}

export const GET: APIRoute = async ({ params, url }) => {
  const at = parseCardPath(params.path ?? '');
  if (!at) return notFound();
  const db = siteDb();
  const site = (await new Loader(db).settings()).site;
  if (!cardsOn(site)) return notFound();
  const off = offTypes(featuresOf(site));
  const loader = new Loader(db, undefined, { published: true, off });
  const card = await cardOf(at.kind, at.key, loader, site, off);
  if (!card) return notFound();
  // An old address (the page changed since it was shared): the card it shows now.
  if (url.searchParams.get('v') !== cardStamp(card)) return new Response(null, { status: 302, headers: { Location: cardPath(card), ...BRIEF } });

  const store = siteStorage();
  const key = cardKey(card);
  const kept = await store.get(key);
  if (kept.ok) return new Response(kept.body, { headers: KEPT });

  if (card.imageId) await loader.loadMedia([card.imageId]);
  const { renderCard } = await import('../../lib/share-card/render');
  const png = await renderCard(card, card.imageId ? loader.mediaById(card.imageId) : undefined);
  const prefix = cardPrefix(card.kind, card.key);
  afterAnswer(
    (async () => {
      await store.put(key, png, { contentType: 'image/png' });
      // The page's earlier cards.
      const { keys } = await store.listKeys(prefix, false);
      await Promise.all(keys.filter((k) => k.key !== key).map((k) => store.delete(k.key)));
    })(),
  );
  return new Response(png as Uint8Array<ArrayBuffer>, { headers: KEPT });
};
