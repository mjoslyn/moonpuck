// The Product gallery block (src/render/c/shop.ts): a thumbnail shows its picture large in place of
// following its link, the arrow keys move between thumbnails, and a variant chosen in Add to cart for the
// same product (cart.js's c-product:variant event, sent only when the choice changes) shows that variant's
// picture, or the first again. One listener serves every gallery on the page.
(() => {
  const galleries = new Map();
  for (const g of document.querySelectorAll('[data-product-gallery]')) {
    const slides = [...g.querySelectorAll('.c-product-gallery__slide')];
    const thumbs = [...g.querySelectorAll('.c-product-gallery__thumb')];
    const show = (id) => {
      const slide = (id && slides.find((s) => s.dataset.media === String(id))) || slides[0];
      if (!slide) return;
      for (const s of slides) s.hidden = s !== slide;
      for (const t of thumbs) {
        if (t.dataset.media === slide.dataset.media) t.setAttribute('aria-current', 'true');
        else t.removeAttribute('aria-current');
      }
    };
    thumbs.forEach((t, i) => {
      t.addEventListener('click', (e) => {
        e.preventDefault();
        show(t.dataset.media);
      });
      t.addEventListener('keydown', (e) => {
        const by = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
        if (!by) return;
        e.preventDefault();
        const next = thumbs[(i + by + thumbs.length) % thumbs.length];
        next.focus();
        show(next.dataset.media);
      });
    });
    const list = galleries.get(g.dataset.product) ?? [];
    list.push(show);
    galleries.set(g.dataset.product, list);
    // Add to cart chose a variant before this script started: its picture.
    const picked = document.querySelector(`[data-add-to-cart][data-product="${g.dataset.product}"][data-variant-image]`)?.dataset.variantImage;
    if (picked) show(picked);
  }
  if (!galleries.size) return;
  document.addEventListener('c-product:variant', (e) => {
    for (const show of galleries.get(String(e.detail?.product)) ?? []) show(e.detail.image);
  });
})();
