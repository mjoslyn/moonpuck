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
