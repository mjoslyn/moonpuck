// @mention suggestions for comment boxes on the site's own pages (the editor bar's Comments,
// editor-bar.js, and a block's comment form in comment mode, share-comments.js), as the admin's
// MentionTextarea (src/admin/MentionTextarea.tsx) does: typing @ and the start of a handle or name lists
// the editors and admins who match (GET /api/admin/share-comments?people, read once per page); arrows
// choose, Enter or Tab puts the @handle in, Escape closes the list. For signed-in editors only: the list
// is empty for anyone else. `window.siteMentions(textarea)` attaches it to a box.
(() => {
  if (window.siteMentions) return;
  let people = null;
  const load = () =>
    (people ??= fetch('/api/admin/share-comments?people=1', { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => []));

  const css = document.createElement('style');
  css.textContent = `
.c-mentions{position:fixed;z-index:100002;box-sizing:border-box;min-width:220px;max-width:min(320px,calc(100vw - 16px));max-height:224px;margin:0;padding:4px 0;overflow-y:auto;list-style:none;border:1px solid rgba(15,15,28,.15);border-radius:6px;background:#fff;color:#0f0f1c;box-shadow:0 10px 30px rgba(0,0,0,.2);font:13px/1.35 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;text-align:left}
.c-mentions li{padding:6px 12px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.c-mentions li[aria-selected="true"]{background:#f1efe9}
.c-mentions b{font-weight:600}
.c-mentions span{color:#6b6b78}`;
  document.head.append(css);

  /** The @ being typed just before the caret: where it starts and what follows it. */
  const typing = (text, caret) => {
    const m = text.slice(0, caret).match(/(^|[^\w@.])@([a-z0-9._-]*)$/i);
    return m ? { start: caret - m[2].length - 1, query: m[2].toLowerCase() } : null;
  };
  let seq = 0;

  window.siteMentions = (box) => {
    if (!box || box.dataset.mentions) return;
    box.dataset.mentions = '1';
    const id = `c-mentions-${++seq}`;
    box.setAttribute('role', 'combobox');
    box.setAttribute('aria-autocomplete', 'list');
    box.setAttribute('aria-expanded', 'false');
    box.setAttribute('aria-controls', id);
    let list = null;
    let at = null;
    let matches = [];
    let active = 0;

    const close = () => {
      list?.remove();
      list = null;
      at = null;
      matches = [];
      box.setAttribute('aria-expanded', 'false');
      box.removeAttribute('aria-activedescendant');
    };
    const draw = () => {
      if (!matches.length) return close();
      if (!list) {
        list = document.createElement('ul');
        list.className = 'c-mentions';
        list.id = id;
        list.setAttribute('role', 'listbox');
        // A press on the list mustn't take the focus from the box.
        list.addEventListener('mousedown', (e) => {
          e.preventDefault();
          const li = e.target.closest('li[data-i]');
          if (li) pick(matches[Number(li.dataset.i)]);
        });
        document.body.append(list);
      }
      list.textContent = '';
      matches.forEach((p, i) => {
        const li = document.createElement('li');
        li.id = `${id}-${i}`;
        li.dataset.i = String(i);
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', String(i === active));
        const handle = document.createElement('b');
        handle.textContent = `@${p.handle}`;
        const name = document.createElement('span');
        name.textContent = p.name ? ` ${p.name}` : '';
        li.append(handle, name);
        list.append(li);
      });
      const r = box.getBoundingClientRect();
      const below = window.innerHeight - r.bottom > 230;
      list.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - list.offsetWidth - 8))}px`;
      list.style.top = below ? `${r.bottom + 4}px` : '';
      list.style.bottom = below ? '' : `${window.innerHeight - r.top + 4}px`;
      box.setAttribute('aria-expanded', 'true');
      box.setAttribute('aria-activedescendant', `${id}-${active}`);
      list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
    };
    const look = async () => {
      at = typing(box.value, box.selectionStart ?? box.value.length);
      if (!at) return close();
      const all = await load();
      // The box may have moved on while the list loaded.
      const now = typing(box.value, box.selectionStart ?? box.value.length);
      if (!now || now.start !== at.start) return close();
      at = now;
      matches = all.filter((p) => p.handle.startsWith(at.query) || (p.name || '').toLowerCase().includes(at.query)).slice(0, 6);
      active = 0;
      draw();
    };
    const pick = (p) => {
      if (!p || !at) return;
      const caret = box.selectionStart ?? box.value.length;
      box.value = `${box.value.slice(0, at.start)}@${p.handle} ${box.value.slice(caret)}`;
      const pos = at.start + p.handle.length + 2;
      close();
      box.focus();
      box.setSelectionRange(pos, pos);
      // Whoever keeps the box's text (the editor bar's draft) hears of it.
      box.dispatchEvent(new Event('input', { bubbles: true }));
    };

    box.addEventListener('input', look);
    box.addEventListener('click', look);
    box.addEventListener('blur', () => setTimeout(close, 150));
    box.addEventListener('keydown', (e) => {
      if (!list) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        active = (active + (e.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length;
        draw();
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        pick(matches[active]);
      } else if (e.key === 'Escape') {
        // Only the list closes, not the panel or form around the box.
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    });
  };
})();
