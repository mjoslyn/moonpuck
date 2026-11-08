// The product gallery: a product's gallery images as stored, and the pictures the Product gallery block
// shows (the featured image, the gallery, then variants' own, each once).
import { describe, expect, it } from 'vitest';
import { MAX_GALLERY, productImages, productOf } from '../src/lib/shop/config';

describe('product gallery', () => {
  it('keeps distinct media ids, at most MAX_GALLERY', () => {
    expect(productOf({ shop: { price: 100, gallery: [3, '4', 3, 0, -1, 'x'] } })!.gallery).toEqual([3, 4]);
    expect(productOf({ shop: { price: 100, gallery: Array.from({ length: 40 }, (_, i) => i + 1) } })!.gallery).toHaveLength(MAX_GALLERY);
    expect(productOf({ shop: { price: 100 } })!.gallery).toBeUndefined();
  });
  it('shows the featured image, the gallery, then variants’ own pictures, each once', () => {
    const p = productOf({
      shop: {
        price: 100,
        gallery: [2, 3],
        options: [{ name: 'Color', values: ['Red', 'Blue', 'Green'] }],
        variants: [
          { id: 'r', values: ['Red'], image: 2 },
          { id: 'b', values: ['Blue'], image: 5 },
          { id: 'g', values: ['Green'], image: 6, off: true },
        ],
      },
    })!;
    expect(productImages(p, 1)).toEqual([1, 2, 3, 5]);
    expect(productImages(p, null)).toEqual([2, 3, 5]);
    expect(productImages(null, 7)).toEqual([7]);
  });
});

import { siteDb } from '../src/lib/db/site';
import { renderRequest } from '../src/render/page';
import { mediaRefs } from '../src/lib/sync';

describe('the gallery’s pictures', () => {
  it('leaves out the pictures of variants without a price', () => {
    const p = productOf({ shop: { options: [{ name: 'Color', values: ['Red', 'Green'] }], variants: [{ id: 'r', values: ['Red'], price: 100, image: 2 }, { id: 'g', values: ['Green'], image: 3 }] } })!;
    expect(productImages(p, 1)).toEqual([1, 2]);
  });
  it('counts a product’s gallery and variants’ pictures as media it uses (Sync)', () => {
    expect(mediaRefs({ type: 'product', featured_media_id: 1, fields: { shop: { gallery: [2, 3], variants: [{ id: 'a', values: [], image: 4 }] } } }).sort()).toEqual([1, 2, 3, 4]);
  });
  it('shows a card’s product pictures in a collection', async () => {
    const db = siteDb();
    const { data: site } = await db.from('settings').select('value').eq('key', 'site').maybeSingle();
    await db.from('settings').upsert({ key: 'site', value: { ...((site?.value as object) ?? {}), shop: { enabled: true } } });
    const media = [];
    for (const n of [1, 2]) media.push((await db.from('media').insert({ path: `2026/11/card-${n}.png`, mime_type: 'image/png', width: 800, height: 600, title: `card ${n}` }).select('id').single()).data!.id as number);
    const made = await db.from('entries').insert({ type: 'product', slug: 'card-lamp', title: 'Card lamp', status: 'publish', featured_media_id: media[0], fields: { shop: { price: 1000, gallery: [media[1]] } } });
    expect(made.error).toBeNull();
    const content = { root: { props: {} }, content: [{ type: 'collection', props: { id: 'shop-list', attrs: { query: { postType: 'product', perPage: 10 } }, children: [{ type: 'collection-items', props: { id: 'shop-items', attrs: {}, children: [{ type: 'product-gallery', props: { id: 'card-gallery', attrs: {} } }] } }] } }] };
    await db.from('entries').insert({ type: 'page', slug: 'gallery-cards', title: 'Cards', status: 'publish', content });
    await db.from('templates').insert({ kind: 'template', slug: 'page', title: 'Page', content: { content: [{ type: 'entry-content', props: { id: 'pc', attrs: {} } }], root: { props: {} } } });
    const { html } = await renderRequest(new URL('http://localhost/gallery-cards/'), db);
    expect(html).toContain('data-product-gallery');
    expect(html).toContain(`data-media="${media[1]}"`);
    expect(html).toContain('/assets/js/product-gallery.js');
  });
});
