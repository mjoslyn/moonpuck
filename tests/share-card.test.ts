// Share cards (src/lib/share-card): which pages get one, what it shows, its address, and the head tags.
import { describe, expect, it } from 'vitest';
import { cardPath, cardStamp, cardsOn, entryCard, listingCard, parseCardPath, termCard, termHasShareImage } from '../src/lib/share-card/card';
import { coreCard, h, titleSize } from '../src/lib/share-card/design';
import { headMeta } from '../src/render/meta';
import type { Entry, Term } from '../src/lib/types';

const entry = (over: Partial<Entry> = {}): Entry =>
  ({ id: 7, type: 'page', slug: 'about', title: 'About &amp; us', title_rendered: null, status: 'publish', featured_media_id: 12, fields: {}, excerpt: '', updated_at: '2026-01-01T00:00:00Z', ...over }) as Entry;
const term: Term = { id: 3, taxonomy: 'category', slug: 'news', name: 'News', description: '', parent_id: null, fields: {} };
const site = { name: 'Example Town', description: 'A town', front_page_id: 1, share_image: 40, icons: { '192': '/media/2026/01/icon-192x192.png?v=abc' } };

const meta = async (queried: Record<string, any>, settings: Record<string, any> = { site }) =>
  headMeta({ queried: { page: 1, url: new URL('https://example.org/about/'), ...queried }, settings, loader: { loadMedia: async () => {}, mediaById: () => undefined } } as any, 'About');
const ogImage = (html: string) => html.match(/og:image" content="([^"]+)"/)?.[1];

describe('share cards', () => {
  it('describe an entry from its title, type and featured image', () => {
    const card = entryCard(entry(), site)!;
    expect(card).toMatchObject({ kind: 'entry', key: '7', title: 'About & us', label: '', siteName: 'Example Town', imageId: 12, iconPath: '2026/01/icon-192x192.png', isFront: false, tagline: '' });
    expect(entryCard(entry({ featured_media_id: null }), site)!.imageId).toBe(40);
    expect(entryCard(entry({ id: 1 }), site)).toMatchObject({ isFront: true, tagline: 'A town' });
  });

  it('are made only for what anyone may see', () => {
    expect(entryCard(entry({ status: 'draft' }), site)).toBeNull();
    expect(entryCard(entry({ locked: true }), site)).toBeNull();
    expect(entryCard(entry({ fields: { access: { members: true } } }), site)).toBeNull();
    expect(entryCard(entry({ id: -5 }), site)).toBeNull();
  });

  it('get a new address when what they show changes', () => {
    const a = entryCard(entry(), site)!;
    expect(cardStamp(entryCard(entry(), site)!)).toBe(cardStamp(a));
    expect(cardStamp(entryCard(entry({ title: 'Changed' }), site)!)).not.toBe(cardStamp(a));
    expect(cardStamp(entryCard(entry({ featured_media_id: 13 }), site)!)).not.toBe(cardStamp(a));
    expect(cardStamp(entryCard(entry(), { ...site, name: 'Other' })!)).not.toBe(cardStamp(a));
    expect(cardPath(a)).toBe(`/share-card/entry/7.png?v=${cardStamp(a)}`);
  });

  it('read only addresses of their own shape', () => {
    expect(parseCardPath('entry/7.png')).toEqual({ kind: 'entry', key: '7' });
    expect(parseCardPath('listing/event.png')).toEqual({ kind: 'listing', key: 'event' });
    for (const bad of ['entry/abc.png', 'entry/0.png', 'entry/7.jpg', 'page/7.png', 'entry/../7.png', 'listing/a b.png']) expect(parseCardPath(bad)).toBeNull();
  });

  it('describe term pages and listings', () => {
    expect(termCard(term, site)).toMatchObject({ kind: 'term', key: '3', title: 'News', imageId: 40 });
    expect(termCard({ ...term, fields: { image: 9 } }, site).imageId).toBe(9);
    expect(termHasShareImage({ ...term, fields: { seo: { image: 5 } } }, site)).toBe(true);
    expect(termHasShareImage({ ...term, fields: { image: 9 } }, site)).toBe(false);
    expect(listingCard('post', site)).toMatchObject({ kind: 'listing', key: 'post' });
    expect(listingCard('nothing', site)).toBeNull();
  });

  it("are the share image of a page without one set, unless they're turned off", async () => {
    expect(ogImage(await meta({ kind: 'singular', entry: entry() }))).toMatch(/^https:\/\/example\.org\/share-card\/entry\/7\.png\?v=/);
    const html = await meta({ kind: 'singular', entry: entry() });
    expect(html).toContain('og:image:width" content="1200"');
    expect(html).toContain('twitter:card" content="summary_large_image"');
    expect(ogImage(await meta({ kind: 'singular', entry: entry({ fields: { seo: { image: 5 } } }) }))).toBeUndefined(); // its own (not loaded here)
    expect(ogImage(await meta({ kind: 'singular', entry: entry() }, { site: { ...site, share_cards: false } }))).toBeUndefined();
    expect(ogImage(await meta({ kind: 'taxonomy', term }))).toMatch(/\/share-card\/term\/3\.png/);
    expect(ogImage(await meta({ kind: 'singular', entry: entry(), notFound: true }))).toBeUndefined();
    expect(ogImage(await meta({ kind: 'search' }))).toBeUndefined();
    expect(cardsOn({})).toBe(true);
  });

  it("lay out the core's design", () => {
    const tree = coreCard({ title: 'About', label: 'Event', siteName: 'Example Town', isFront: false, tagline: '', image: { src: 'data:image/png;base64,', width: 10, height: 10 } });
    expect(tree.props.style).toMatchObject({ width: 1200, height: 630 });
    expect(JSON.stringify(tree)).toContain('"Event"');
    expect(h('img', {}, { src: 'x', width: 1, height: 1 }).props).toMatchObject({ src: 'x', width: 1 });
    expect(titleSize('a'.repeat(80))).toBeLessThan(titleSize('short'));
  });
});
