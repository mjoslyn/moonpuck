// The shop's cart (src/render/c/shop.ts). The cart lives in this browser (localStorage), so pages stay
// cached and shared: Add to cart forms add to it, Cart links show how many items are in it, and the
// Cart block lists it with the server's prices (POST /api/shop/quote), which also says what is left.
// What's left of each variant on the page is asked again (GET /api/shop/availability), since a cached
// page can be a minute old.
(() => {
  const KEY = 'site.cart';
  const CHECKOUT_KEY = 'site.checkout';
  const MAX = 99;

  const read = () => {
    try {
      const lines = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(lines) ? lines.filter((l) => l && l.product > 0 && typeof l.variant === 'string' && l.quantity > 0) : [];
    } catch {
      return [];
    }
  };
  // The campaign this visit came from (kept by stats.js), sent with the order.
  const visitCampaign = () => {
    try {
      return JSON.parse(sessionStorage.getItem('site.campaign') || 'null');
    } catch {
      return null;
    }
  };
  const write = (lines) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(lines));
    } catch {}
    document.dispatchEvent(new CustomEvent('c-cart:change', { detail: { lines } }));
  };
  const count = (lines) => lines.reduce((n, l) => n + l.quantity, 0);
  const money = (cents, currency) => {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
    } catch {
      return `${(cents / 100).toFixed(2)} ${currency}`;
    }
  };
  const el = (tag, props = {}, children = []) => {
    const e = Object.assign(document.createElement(tag), props);
    for (const c of [].concat(children)) if (c != null) e.append(c);
    return e;
  };

  // Cart links: the number of items, hidden when there are none.
  const showCount = () => {
    const n = count(read());
    for (const c of document.querySelectorAll('[data-cart-count]')) {
      c.textContent = String(n);
      c.hidden = n === 0;
      c.closest('[data-cart-link]')?.setAttribute('aria-label', `${c.closest('[data-cart-link]').querySelector('.c-cart-link__label')?.textContent || 'Cart'}: ${n} ${n === 1 ? 'item' : 'items'}`);
    }
  };

  // Add to cart.
  const forms = [...document.querySelectorAll('form[data-add-to-cart]')];
  const states = forms.map((form) => {
    let variants = [];
    try {
      variants = JSON.parse(form.dataset.variants || '[]');
    } catch {}
    const selects = [...form.querySelectorAll('select[name^="option-"]')];
    // Begin on the first variant left.
    for (const s of selects) if (s.dataset.value) s.value = s.dataset.value;
    const qty = form.querySelector('input[name="quantity"]');
    const button = form.querySelector('button[type="submit"]');
    const price = form.querySelector('.c-add-to-cart__price');
    const status = form.querySelector('.c-add-to-cart__status');
    const label = form.dataset.label || 'Add to cart';
    const currency = form.dataset.currency || 'USD';
    const product = Number(form.dataset.product);
    // The product's image, swapped for a variant's own: in a card, the card's; for the page's own product
    // (not one an Add to cart block names), the page's Featured image outside any card. Else none.
    const card = form.closest('.c-collection__items > li');
    const outside = () => [...document.querySelectorAll('.c-entry-image img')].find((i) => !i.closest('.c-collection__items'));
    const img = card ? card.querySelector('.c-entry-image img') : form.hasAttribute('data-own') ? outside() : null;
    const original = img && { src: img.getAttribute('src'), srcset: img.getAttribute('srcset'), sources: [...(img.closest('picture')?.querySelectorAll('source') ?? [])] };
    const chosen = () => {
      const values = selects.map((s) => s.value);
      return variants.find((v) => v.values.every((x, i) => x === values[i]));
    };
    // A members-only product this visitor may not buy (the availability check says): the button says so.
    let buyable = true;
    const inCart = (v) => read().find((l) => l.product === product && l.variant === v.id)?.quantity ?? 0;
    const refresh = () => {
      const v = chosen();
      // Mark the values that lead to nothing left, given the other choices.
      selects.forEach((s, i) => {
        for (const o of s.options) {
          const values = selects.map((x) => x.value);
          values[i] = o.value;
          const match = variants.find((v) => v.values.every((x, j) => x === values[j]));
          const base = o.dataset.label ?? (o.dataset.label = o.textContent);
          o.textContent = !match ? `${base} (not available)` : match.left <= 0 ? `${base} (sold out)` : base;
        }
      });
      if (!v) {
        button.disabled = true;
        button.textContent = 'Not available';
        return;
      }
      const room = buyable ? Math.max(0, v.left - inCart(v)) : 0;
      button.disabled = room <= 0;
      button.textContent = !buyable ? 'Members only' : v.left <= 0 ? 'Sold out' : room <= 0 ? 'All in your cart' : label;
      if (qty && qty.type === 'number') {
        qty.max = String(Math.max(1, room));
        if (Number(qty.value) > room && room > 0) qty.value = String(room);
      }
      if (price) {
        price.innerHTML = '';
        if (v.compareAt && v.compareAt > v.price) price.append(el('s', { className: 'c-price__was', textContent: money(v.compareAt, currency) }), ' ');
        price.append(el('span', { className: 'c-price__now', textContent: money(v.price, currency) }));
      }
      if (img && original) {
        if (v.image) {
          img.src = v.image;
          img.removeAttribute('srcset');
          original.sources.forEach((s) => s.remove());
        } else if (img.getAttribute('src') !== original.src) {
          img.src = original.src;
          if (original.srcset) img.setAttribute('srcset', original.srcset);
          const pic = img.closest('picture');
          if (pic) original.sources.forEach((s) => pic.insertBefore(s, img));
        }
      }
    };
    selects.forEach((s) => s.addEventListener('change', refresh));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = chosen();
      if (!v || !buyable) return;
      const room = Math.max(0, v.left - inCart(v));
      const n = Math.min(room, Math.max(1, Math.floor(Number(qty?.value) || 1)));
      if (n <= 0) return refresh();
      const lines = read();
      const line = lines.find((l) => l.product === product && l.variant === v.id);
      if (line) line.quantity = Math.min(MAX, line.quantity + n);
      else lines.push({ product, variant: v.id, quantity: n });
      write(lines);
      status.innerHTML = '';
      const what = [form.dataset.title, v.values.join(' / ')].filter(Boolean).join(', ');
      status.append(`Added ${n} × ${what} to your cart. `, el('a', { href: form.dataset.cartPath || '/cart/', textContent: 'View cart' }));
      refresh();
    });
    refresh();
    return { product, variants, refresh, setBuyable: (b) => (buyable = b) };
  });

  // What's left now (the page may be cached).
  if (states.length) {
    const ids = [...new Set(states.map((s) => s.product))];
    fetch(`/api/shop/availability?ids=${ids.join(',')}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((left) => {
        if (!left) return;
        for (const s of states) {
          const own = left[s.product];
          if (!own) continue;
          for (const v of s.variants) v.left = v.id in own.left ? Math.min(MAX, own.left[v.id]) : 0;
          s.setBuyable(own.buyable !== false);
          s.refresh();
        }
      })
      .catch(() => {});
  }

  // The cart, and its checkout. A cart page showing an order (?order=) shows it as the server made it;
  // once that order is paid, the cart it was bought from is emptied.
  const orderPage = document.querySelector('[data-cart][data-order]');
  if (orderPage && ['paid', 'refunded'].includes(orderPage.dataset.order)) {
    try {
      localStorage.removeItem(KEY);
      sessionStorage.removeItem(CHECKOUT_KEY);
    } catch {}
  }
  const carts = [...document.querySelectorAll('[data-cart]:not([data-order])')];
  let quoting = 0;
  // What the buyer has entered at checkout, kept for this visit (so a re-priced cart keeps it).
  const co = (() => {
    try {
      return JSON.parse(sessionStorage.getItem(CHECKOUT_KEY) || '{}') || {};
    } catch {
      return {};
    }
  })();
  const keepCo = () => {
    try {
      sessionStorage.setItem(CHECKOUT_KEY, JSON.stringify(co));
    } catch {}
  };
  let checkoutError = '';
  let paying = false;
  const renderCart = async () => {
    if (!carts.length) return;
    const lines = read();
    const ticket = ++quoting;
    let quote = null;
    if (lines.length) {
      try {
        const offer = offerOf(carts[0]);
        if (!co.country && offer.country) co.country = offer.country;
        const r = await fetch('/api/shop/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // The rest of the address, once typed: a carrier's live rates need the ZIP code.
          body: JSON.stringify({ lines, destination: co.country ? { country: co.country, state: co.country === 'US' ? co.state || '' : co.region || '', zip: co.zip || '', city: co.city || '', line1: co.line1 || '', line2: co.line2 || '' } : null, option: co.option || null, code: co.code || null }),
          cache: 'no-store',
        });
        quote = r.ok ? await r.json() : null;
      } catch {}
      if (ticket !== quoting) return;
      if (!quote) {
        for (const c of carts) c.querySelector('.c-cart__body').textContent = 'Your cart couldn’t be loaded. Try again in a moment.';
        return;
      }
      // Keep what the server allows: lines no longer sold go, quantities fit what's left.
      // Lines that can't be had now (sold out, members only) leave the stored cart, so its count is what can be bought; this render still shows why.
      const kept = quote.lines.filter((l) => l.problem !== 'gone' && l.quantity > 0).map((l) => ({ product: l.product, variant: l.variant, quantity: l.quantity }));
      if (JSON.stringify(kept) !== JSON.stringify(lines)) {
        try {
          localStorage.setItem(KEY, JSON.stringify(kept));
        } catch {}
        showCount();
      }
    }
    for (const c of carts) {
      const body = c.querySelector('.c-cart__body');
      body.innerHTML = '';
      const currency = quote?.currency || c.dataset.currency || 'USD';
      const shown = (quote?.lines ?? []).filter((l) => l.problem !== 'gone');
      const gone = (quote?.lines ?? []).filter((l) => l.problem === 'gone');
      if (gone.length) body.append(el('p', { className: 'c-cart__notice', textContent: `${gone.length === 1 ? 'An item' : `${gone.length} items`} in your cart ${gone.length === 1 ? 'is' : 'are'} no longer sold, and ${gone.length === 1 ? 'was' : 'were'} taken out.` }));
      if (!shown.length) {
        body.append(el('p', { className: 'c-cart__empty', textContent: c.dataset.empty || 'Your cart is empty.' }), el('p', {}, el('a', { className: 'c-shop-button', href: c.dataset.shop || '/', textContent: 'Keep shopping' })));
        continue;
      }
      const rows = shown.map((l) => {
        const input = el('input', { type: 'number', min: '0', max: String(l.max || 0), value: String(l.quantity), inputMode: 'numeric', className: 'c-cart__qty' });
        input.setAttribute('aria-label', `Quantity of ${l.title}${l.label ? `, ${l.label}` : ''}`);
        input.addEventListener('change', () => setQuantity(l, Math.floor(Number(input.value) || 0)));
        const remove = el('button', { type: 'button', className: 'c-cart__remove', textContent: 'Remove' });
        remove.addEventListener('click', () => setQuantity(l, 0));
        const note = l.problem === 'sold-out' ? 'Sold out' : l.problem === 'fewer' ? `Only ${l.max} left` : l.problem === 'members-only' ? 'For members only: sign in to buy it' : l.listUnit ? 'Member price' : '';
        return el('tr', {}, [
          el('td', { className: 'c-cart__image' }, l.image ? el('img', { src: l.image, alt: '', width: 64, height: 64, loading: 'lazy' }) : null),
          el('td', { className: 'c-cart__item' }, [el('a', { href: l.url, textContent: l.title }), l.label ? el('small', { textContent: l.label }) : null, note ? el('small', { className: 'c-cart__problem', textContent: note }) : null]),
          el('td', { className: 'c-cart__unit', textContent: money(l.unit, currency) }),
          el('td', {}, l.problem === 'sold-out' || l.problem === 'members-only' ? null : input),
          el('td', { className: 'c-cart__total', textContent: l.total ? money(l.total, currency) : '' }),
          el('td', {}, remove),
        ]);
      });
      const head = el('thead', {}, el('tr', {}, ['', 'Item', 'Price', 'Quantity', 'Total', ''].map((t) => el('th', { scope: 'col', textContent: t }))));
      if (c.hasAttribute('data-cancelled')) body.append(el('p', { className: 'c-cart__notice', textContent: 'Checkout was cancelled: nothing was charged, and your cart is as you left it.' }));
      body.append(
        el('table', { className: 'c-cart__table' }, [head, el('tbody', {}, rows)]),
        el('p', { className: 'c-cart__subtotal' }, [el('span', { textContent: 'Subtotal' }), ' ', el('strong', { textContent: money(quote.subtotal, currency) })]),
        checkoutForm(c, quote, currency, shown.some((l) => l.problem && l.problem !== 'fewer')),
      );
    }
  };
  const offerOf = (c) => {
    try {
      return JSON.parse(c?.dataset.checkout || '{}') || {};
    } catch {
      return {};
    }
  };
  const field = (label, input, hint) => el('label', { className: 'c-checkout__field' }, [el('span', { textContent: label }), input, hint ? el('small', { textContent: hint }) : null]);
  const textInput = (key, props = {}) => {
    const input = el('input', { type: 'text', value: co[key] || '', ...props });
    input.addEventListener('input', () => {
      co[key] = input.value;
      keepCo();
    });
    return input;
  };
  // A field whose change prices the cart again (a carrier's rates follow the address).
  const requote = (input) => {
    input.addEventListener('change', () => renderCart());
    return input;
  };
  const select = (key, options, onChange) => {
    const s = el('select', {}, options.map(([v, label]) => el('option', { value: v, textContent: label })));
    s.value = co[key] || '';
    s.addEventListener('change', () => {
      co[key] = s.value;
      keepCo();
      onChange?.();
    });
    return s;
  };

  // The checkout: the buyer's details, how the order reaches them (shipping to an address, or pickup),
  // the totals as the server priced them, and Pay. The server prices it all again when it is sent.
  const checkoutForm = (c, quote, currency, blocked) => {
    const offer = offerOf(c);
    const shipping = quote.shipping || { needs: 'none', options: [] };
    const live = (input) => (offer.carrier ? requote(input) : input);
    const chosen = quote.chosen;
    const totals = quote.totals || { total: quote.subtotal, tax: 0, shipping: 0, discount: 0 };
    const form = el('form', { className: 'c-checkout', noValidate: true });
    form.append(el('h2', { className: 'c-checkout__heading', textContent: 'Checkout' }));

    const details = el('fieldset', { className: 'c-checkout__group' }, [el('legend', { textContent: 'Your details' })]);
    details.append(
      field('Name', textInput('name', { required: true, autocomplete: 'name' })),
      field('Email', textInput('email', { type: 'email', required: true, autocomplete: 'email' })),
      field('Phone (optional)', textInput('phone', { type: 'tel', autocomplete: 'tel' })),
    );
    // Email me news (Settings > Shop): unticked until the buyer ticks it; confirmed by email.
    if (offer.news) {
      const tick = el('input', { type: 'checkbox', checked: !!co.news });
      tick.addEventListener('change', () => {
        co.news = tick.checked;
        keepCo();
      });
      details.append(el('label', { className: 'c-checkout__news' }, [tick, ' ', el('span', { textContent: offer.news })]));
    }
    form.append(details);

    if (shipping.needs !== 'none') {
      const how = el('fieldset', { className: 'c-checkout__group' }, [el('legend', { textContent: 'Shipping method' })]);
      if (shipping.needs === 'any' && (offer.countries || []).length) {
        const row = el('div', { className: 'c-checkout__row' }, [field('Country', select('country', offer.countries, () => ((co.state = ''), renderCart())))]);
        if (co.country === 'US') row.append(field('State', select('state', [['', 'Choose…'], ...(offer.states || [])], renderCart)));
        // Live carrier rates (Settings > Shop) come once the ZIP is in: asked for here, before the options.
        if (offer.carrier) row.append(field(co.country === 'US' ? 'ZIP code' : 'Postal code', requote(textInput('zip', { required: true, autocomplete: 'postal-code' }))));
        how.append(row);
        if (offer.carrier && !co.zip) how.append(el('p', { className: 'c-checkout__hint', textContent: `Enter your ${co.country === 'US' ? 'ZIP' : 'postal'} code to see the carriers' rates.` }));
      }
      if (shipping.problem === 'no-pickup') how.append(el('p', { className: 'c-cart__problem', textContent: "Something in your cart can only be collected, and there's nowhere to collect it from yet." }));
      else if (shipping.problem === 'no-rates') how.append(el('p', { className: 'c-cart__problem', textContent: "We don't ship there." + (offer.pickup ? ' You can pick up your order instead.' : '') }));
      else if (chosen?.kind === 'ship' && co.country === 'US' && !co.state) how.append(el('p', { className: 'c-checkout__hint', textContent: 'Choose your state.' }));
      const name = `ship-${Math.random().toString(36).slice(2, 8)}`;
      for (const o of shipping.options) {
        const radio = el('input', { type: 'radio', name, value: o.id, checked: chosen?.id === o.id });
        radio.addEventListener('change', () => {
          co.option = o.id;
          keepCo();
          renderCart();
        });
        const where = o.kind === 'pickup' ? [o.address, o.hours].filter(Boolean).join(' · ') : '';
        how.append(el('label', { className: 'c-checkout__option' }, [radio, el('span', {}, [el('strong', { textContent: o.name }), where ? el('small', { textContent: where }) : null]), el('span', { className: 'c-checkout__price', textContent: o.price ? money(o.price, currency) : 'Free' })]));
      }
      if (chosen?.kind === 'ship') {
        how.append(
          field('Address', live(textInput('line1', { required: true, autocomplete: 'address-line1' }))),
          field('Apartment, suite… (optional)', textInput('line2', { autocomplete: 'address-line2' })),
          el('div', { className: 'c-checkout__row' }, [
            field('City', live(textInput('city', { required: true, autocomplete: 'address-level2' }))),
            co.country !== 'US' ? field('State or region (optional)', textInput('region', { autocomplete: 'address-level1' })) : null,
            offer.carrier ? null : field(co.country === 'US' ? 'ZIP code' : 'Postal code', textInput('zip', { required: true, autocomplete: 'postal-code' })),
          ]),
        );
      }
      form.append(how);
    }

    // A discount code: applied by pricing the cart again with it; the server says what it takes off, or why not.
    const codeBox = el('div', { className: 'c-checkout__code' });
    const codeInput = el('input', { type: 'text', value: co.code || '', autocomplete: 'off', placeholder: 'Code' });
    codeInput.setAttribute('aria-label', 'Discount code');
    const apply = el('button', { type: 'button', className: 'c-checkout__apply', textContent: co.code ? 'Change' : 'Apply' });
    apply.addEventListener('click', () => {
      co.code = codeInput.value.trim();
      keepCo();
      renderCart();
    });
    codeInput.addEventListener('keydown', (e) => e.key === 'Enter' && (e.preventDefault(), apply.click()));
    codeBox.append(field('Discount code', codeInput), apply);
    if (co.code) {
      const remove = el('button', { type: 'button', className: 'c-cart__remove', textContent: 'Remove code' });
      remove.addEventListener('click', () => {
        co.code = '';
        keepCo();
        renderCart();
      });
      codeBox.append(remove);
    }
    form.append(codeBox);
    if (quote.discountProblem) form.append(el('p', { className: 'c-cart__problem', role: 'alert', textContent: quote.discountProblem }));

    const sum = el('div', { className: 'c-checkout__totals' });
    const line = (label, value, strong) => sum.append(el('p', { className: 'c-cart__subtotal' }, [el('span', { textContent: label }), ' ', strong ? el('strong', { textContent: value }) : el('span', { textContent: value })]));
    const d = quote.discount;
    // Its name, with the code when the name isn't the code.
    const named = d ? `${d.label}${d.code && d.label !== d.code ? ` (${d.code})` : ''}` : '';
    if (d && totals.discount) line(named, `−${money(totals.discount, currency)}`);
    else if (d?.freeShipping && chosen) line(named, '✓');
    if (chosen) line(chosen.kind === 'pickup' ? 'Pickup' : 'Shipping', totals.shipping ? money(totals.shipping, currency) : 'Free');
    if (totals.tax === null) line('Tax', 'Worked out at payment');
    else if (totals.tax) line('Tax', money(totals.tax, currency));
    line('Total', money(totals.total, currency), true);
    form.append(sum);

    const status = el('p', { className: 'c-checkout__error', role: 'alert', textContent: checkoutError });
    const pay = el('button', { type: 'submit', className: 'c-shop-button c-checkout__pay', textContent: paying ? 'One moment…' : totals.total > 0 ? `Pay ${money(totals.total, currency)}` : 'Place order' });
    const ready = !blocked && (shipping.needs === 'none' || (chosen && !shipping.problem));
    pay.disabled = paying || !ready;
    form.append(status, pay);
    if (blocked) form.append(el('p', { className: 'c-checkout__hint', textContent: 'Take out what can’t be bought to check out.' }));

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      checkoutError = '';
      const missing = [...form.querySelectorAll('input[required]')].find((i) => !i.value.trim());
      if (missing) {
        status.textContent = 'Fill in the boxes marked as needed.';
        missing.focus();
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(co.email || '')) {
        status.textContent = 'Check your email address.';
        return;
      }
      paying = true;
      pay.disabled = true;
      pay.textContent = 'One moment…';
      const address = chosen?.kind === 'ship' ? { line1: co.line1, line2: co.line2, city: co.city, state: co.country === 'US' ? co.state : co.region, zip: co.zip, country: co.country } : null;
      try {
        const r = await fetch('/api/shop/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lines: read(), name: co.name, email: co.email, phone: co.phone, option: co.option, address, code: co.code || null, campaign: visitCampaign(), news: !!(offer.news && co.news) }),
          cache: 'no-store',
        });
        const answer = await r.json().catch(() => null);
        if (answer?.redirect) {
          location.href = answer.redirect;
          return;
        }
        checkoutError = answer?.message || 'The checkout could not start. Try again.';
      } catch {
        checkoutError = 'The checkout could not start. Check your connection and try again.';
      }
      paying = false;
      renderCart();
    });
    return form;
  };

  const setQuantity = (line, n) => {
    const lines = read()
      .map((l) => (l.product === line.product && l.variant === line.variant ? { ...l, quantity: Math.min(MAX, Math.max(0, n)) } : l))
      .filter((l) => l.quantity > 0);
    write(lines);
  };

  document.addEventListener('c-cart:change', () => {
    showCount();
    renderCart();
    states.forEach((s) => s.refresh());
  });
  // Another tab changed the cart.
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    showCount();
    renderCart();
    states.forEach((s) => s.refresh());
  });
  showCount();
  renderCart();
})();
