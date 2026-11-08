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

  document.querySelectorAll('.c-donate__action[data-confirm]').forEach((f) =>
    f.addEventListener('submit', (e) => {
      if (!confirm(f.dataset.confirm)) e.preventDefault();
    }),
  );

  // Back from the payment page (the browser's page cache): the button works again.
  window.addEventListener('pageshow', () => document.querySelectorAll('.c-donate__submit').forEach((b) => (b.disabled = false)));

  const focus = document.querySelector('.c-donate [data-focus], .c-donate [role="alert"]');
  if (focus) {
    focus.setAttribute('tabindex', '-1');
    focus.focus();
  }
})();
