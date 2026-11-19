// The Donate block (src/render/c/donations.ts): shows the Other field only when Other is chosen, the fee
// a donor would cover and the button's amount as they choose, sends the visit's campaign (kept by
// stats.js) with the gift, asks before cancelling a monthly gift, and focuses a thank-you or message. The
// form works without it: the server works out the amount and the fee itself.
(() => {
  const money = (cents, currency) => {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100).replace(/\.00(?=\D*$)/, '');
    } catch {
      return `${(cents / 100).toFixed(2)} ${currency}`;
    }
  };
  const typed = (v) => {
    const s = String(v || '').replace(/[\s,$£€]/g, '');
    return /^\d+(\.\d{1,2})?$/.test(s) ? Math.round(Number(s) * 100) : 0;
  };

  document.querySelectorAll('.c-donate__form[data-donate]').forEach((form) => {
    let o = {};
    try {
      o = JSON.parse(form.dataset.donate || '{}');
    } catch {}
    const other = form.querySelector('.c-donate__other');
    const otherInput = other?.querySelector('input');
    const feeText = form.querySelector('[data-fee]');
    const cover = form.querySelector('input[name="cover"]');
    const submit = form.querySelector('.c-donate__submit');
    const amount = () => {
      const picked = form.querySelector('input[name="amount"]:checked');
      if (!picked) return 0;
      return picked.value === 'other' ? typed(otherInput?.value) : Number(picked.value) || 0;
    };
    const fee = (n) => (n > 0 && (o.feePercent > 0 || o.feeFixed > 0) ? Math.ceil((n + (o.feeFixed || 0)) / (1 - (o.feePercent || 0) / 100)) - n : 0);
    const update = () => {
      const isOther = form.querySelector('input[name="amount"]:checked')?.value === 'other';
      if (other) other.hidden = !isOther;
      if (otherInput) otherInput.required = isOther;
      const n = amount();
      const f = fee(n);
      if (feeText) feeText.textContent = n ? money(f, o.currency) : `${o.feePercent}%`;
      const total = n + (cover?.checked ? f : 0);
      const monthly = form.querySelector('input[name="frequency"]:checked')?.value === 'monthly';
      if (submit) submit.textContent = total ? `${o.button || 'Donate'} ${money(total, o.currency)}${monthly ? ' a month' : ''}` : o.button || 'Donate';
    };
    // Typing an amount chooses Other.
    otherInput?.addEventListener('input', () => {
      const o = form.querySelector('input[name="amount"][value="other"]');
      if (o) o.checked = true;
    });
    form.addEventListener('input', update);
    form.addEventListener('change', update);
    form.addEventListener('submit', () => {
      try {
        const c = sessionStorage.getItem('site.campaign');
        const field = form.querySelector('input[name="campaign"]');
        if (c && field) field.value = c;
      } catch {}
      if (submit) submit.disabled = true;
    });
    update();
  });

  // Asks first (Cancel a monthly gift), in a box on the page in the site's style rather than the browser's:
  // Keep it has the focus first, Escape keeps it.
  const ask = (message, yes) =>
    new Promise((resolve) => {
      const d = document.createElement('dialog');
      d.className = 'c-donate__confirm';
      d.setAttribute('aria-labelledby', 'c-donate-confirm-t');
      d.style.cssText = 'max-width:24rem;width:calc(100% - 32px);border:0;border-radius:12px;padding:20px;color:var(--color-text);background:var(--color-surface,#fff);box-shadow:0 20px 50px rgb(0 0 0/.25)';
      const p = document.createElement('p');
      p.id = 'c-donate-confirm-t';
      p.style.cssText = 'margin:0 0 16px;font-weight:600';
      p.textContent = message;
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap';
      const keep = document.createElement('button');
      keep.type = 'button';
      const btn = 'border-radius:var(--form-button-radius,4px);padding:.55rem 1rem;font:inherit;font-weight:600;cursor:pointer;';
      keep.style.cssText = `${btn}border:1px solid currentColor;background:transparent;color:var(--color-text)`;
      keep.textContent = 'Keep it';
      const go = document.createElement('button');
      go.type = 'button';
      go.style.cssText = `${btn}border:1px solid transparent;background:var(--color-accent-fill,var(--color-accent));color:var(--color-on-accent,#fff)`;
      go.textContent = yes;
      row.append(keep, go);
      d.append(p, row);
      document.body.append(d);
      const done = (v) => {
        d.close();
        d.remove();
        resolve(v);
      };
      keep.addEventListener('click', () => done(false));
      go.addEventListener('click', () => done(true));
      d.addEventListener('cancel', (e) => {
        e.preventDefault();
        done(false);
      });
      d.showModal();
      keep.focus();
    });
  document.querySelectorAll('.c-donate__action[data-confirm]').forEach((f) => {
    let asked = false;
    f.addEventListener('submit', async (e) => {
      if (asked) return;
      e.preventDefault();
      if (!(await ask(f.dataset.confirm, f.querySelector('button')?.textContent?.trim() || 'Yes'))) return;
      asked = true;
      f.requestSubmit ? f.requestSubmit() : f.submit();
    });
  });

  // Back from the payment page (the browser's page cache): the button works again.
  window.addEventListener('pageshow', () => document.querySelectorAll('.c-donate__submit').forEach((b) => (b.disabled = false)));

  const focus = document.querySelector('.c-donate [data-focus], .c-donate [role="alert"]');
  if (focus) {
    focus.setAttribute('tabindex', '-1');
    focus.focus();
  }
})();
