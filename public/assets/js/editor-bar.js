// Editor bar: for signed-in editors and admins, a bar above the page with links to the dashboard and to
// edit what the page shows (body data-edit-entry / data-edit-template, set by the renderer), and the
// command palette (Go to, or Ctrl+K / ⌘K): the admin's screens, Settings' sections (admins) and entries
// by title, from GET /api/admin/commands. Pages are cached and shared, so this runs in the browser: only
// visitors with a sign-in cookie ask who they are.
(() => {
  // site.signed_in: set beside the session's own cookie, which scripts can't read (src/lib/auth).
  if (!document.cookie.split('; ').some((c) => c.startsWith('site.signed_in='))) return;
  const body = document.body;
  const entry = body.dataset.editEntry;
  const template = body.dataset.editTemplate;

  fetch('/api/admin/me', { credentials: 'same-origin', cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((me) => {
      if (!me) return;
      const link = (href, text, primary) => `<a href="${href}"${primary ? ' class="is-primary"' : ''}>${text}</a>`;
      const links = [link('/admin/', 'Dashboard')];
      if (entry) links.push(link(`/admin/edit/${encodeURIComponent(entry)}/`, 'Edit page', true));
      if (template && me.role === 'admin') links.push(link(`/admin/templates/template/${encodeURIComponent(template)}/`, 'Edit template', !entry));
      const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

      const style = document.createElement('style');
      style.textContent = `
        .c-editor-bar { position: relative; z-index: 1000; display: flex; align-items: center; gap: 4px; min-height: 40px; padding: 0 12px;
          background: #0f0f1c; color: #fff; font: 500 13px/1.2 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
        .c-editor-bar a, .c-editor-bar button { display: inline-flex; align-items: center; min-height: 28px; padding: 0 10px; border: 0; border-radius: 4px;
          background: none; color: #fff; font: inherit; text-decoration: none; cursor: pointer; }
        .c-editor-bar a:hover, .c-editor-bar button:hover { background: rgba(255,255,255,.12); }
        .c-editor-bar a.is-primary { background: #c87d37; color: #0f0f1c; font-weight: 600; }
        .c-editor-bar a.is-primary:hover { background: #e0a66b; }
        .c-editor-bar a:focus-visible, .c-editor-bar button:focus-visible { outline: 2px solid #e0a66b; outline-offset: 2px; }
        .c-editor-bar__who { margin-left: auto; color: #b8c0cc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .c-editor-bar form { margin: 0; }
        .c-editor-bar kbd { margin-left: 6px; padding: 0 4px; border: 1px solid rgba(255,255,255,.3); border-radius: 3px; font-size: 11px; line-height: 1.4; }
        .c-palette { width: min(36rem, calc(100vw - 2rem)); margin: 12vh auto auto; padding: 0; border: 1px solid rgba(15,15,28,.12); border-radius: 8px;
          background: #fff; color: #0f0f1c; box-shadow: 0 20px 50px rgba(0,0,0,.25); font: 14px/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
        .c-palette::backdrop { background: rgba(0,0,0,.3); }
        .c-palette input { box-sizing: border-box; width: 100%; margin: 0; padding: 12px 16px; border: 0; border-bottom: 1px solid rgba(15,15,28,.1); font-family: inherit; font-size: 16px; line-height: 1.4; color: inherit; background: #fff; outline: none; }
        .c-palette ul { max-height: 50vh; margin: 0; padding: 4px; overflow-y: auto; list-style: none; }
        .c-palette li a { display: flex; gap: 12px; padding: 8px 12px; border-radius: 4px; color: inherit; text-decoration: none; }
        .c-palette li a[aria-selected="true"] { background: #f1efe9; }
        .c-palette li span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .c-palette li small { flex: none; color: #6b6b78; font-size: 12px; }
        .c-palette p { margin: 0; padding: 8px 16px; border-top: 1px solid rgba(15,15,28,.1); color: #6b6b78; font-size: 12px; }
        @media (max-width: 599px) { .c-editor-bar kbd { display: none; } }
        @media (max-width: 599px) { .c-editor-bar__who { display: none; } .c-editor-bar form { margin-left: auto; } }`;
      document.head.appendChild(style);

      const bar = document.createElement('nav');
      bar.className = 'c-editor-bar';
      bar.setAttribute('aria-label', 'Editor');
      const mac = /Mac|iPhone|iPad/.test(navigator.platform);
      bar.innerHTML =
        links.join('') +
        `<button type="button" data-palette title="Go to a screen, setting or entry">Go to<kbd>${mac ? '⌘K' : 'Ctrl K'}</kbd></button>` +
        `<span class="c-editor-bar__who">Signed in as ${esc(me.name)}</span>` +
        '<form method="post" action="/api/auth/logout"><button type="submit">Sign out</button></form>';
      // After the skip link, which stays the first thing to tab to.
      const skip = body.querySelector(':scope > .c-skip-link');
      if (skip) skip.after(bar);
      else body.prepend(bar);
      palette(bar.querySelector('[data-palette]'), esc);
    })
    .catch(() => {});

  // The command palette: a dialog with a search box; what it lists comes from the server, as you type.
  function palette(button, esc) {
    const dialog = document.createElement('dialog');
    dialog.className = 'c-palette';
    dialog.setAttribute('aria-label', 'Go to');
    dialog.innerHTML =
      '<input type="search" role="combobox" aria-expanded="true" aria-controls="c-palette-list" aria-label="Go to a screen, setting or entry" placeholder="Go to a screen, setting or entry…" autocomplete="off">' +
      '<ul id="c-palette-list" role="listbox"></ul><p>↑ ↓ to choose · Enter to open · Esc to close</p>';
    body.appendChild(dialog);
    const box = dialog.querySelector('input');
    const list = dialog.querySelector('ul');
    let found = [];
    let at = 0;
    let asked = 0;
    let timer;
    const draw = () => {
      list.innerHTML = found.length
        ? found.map((c, i) => `<li role="option" id="c-palette-${i}" aria-selected="${i === at}"><a href="${esc(c.href)}" data-i="${i}" aria-selected="${i === at}"><span>${esc(c.label)}</span><small>${esc(c.group)}</small></a></li>`).join('')
        : '<li><small>Nothing matches.</small></li>';
      box.setAttribute('aria-activedescendant', found.length ? `c-palette-${at}` : '');
      list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
    };
    const ask = () => {
      const n = ++asked;
      fetch(`/api/admin/commands?q=${encodeURIComponent(box.value.trim())}`, { credentials: 'same-origin', cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : { commands: [] }))
        .then((d) => {
          if (n !== asked) return;
          found = d.commands || [];
          at = 0;
          draw();
        })
        .catch(() => {});
    };
    const open = () => {
      if (dialog.open) return;
      box.value = '';
      dialog.showModal();
      box.focus();
      ask();
    };
    const go = (c, newTab) => {
      if (!c) return;
      if (newTab) window.open(c.href, '_blank', 'noopener');
      else location.href = c.href;
      dialog.close();
    };
    button?.addEventListener('click', open);
    box.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(ask, 120);
    });
    box.addEventListener('keydown', (e) => {
      const n = Math.max(found.length, 1);
      if (e.key === 'ArrowDown') (e.preventDefault(), (at = (at + 1) % n), draw());
      if (e.key === 'ArrowUp') (e.preventDefault(), (at = (at - 1 + n) % n), draw());
      if (e.key === 'Enter') (e.preventDefault(), go(found[at], e.metaKey || e.ctrlKey));
      // A search field's Escape would only clear it: close at once.
      if (e.key === 'Escape') (e.preventDefault(), dialog.close());
    });
    list.addEventListener('mousemove', (e) => {
      const i = Number(e.target.closest('a[data-i]')?.dataset.i);
      if (!Number.isNaN(i) && i !== at) (at = i), draw();
    });
    dialog.addEventListener('click', (e) => e.target === dialog && dialog.close());
    document.addEventListener('keydown', (e) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.key.toLowerCase() !== 'k' || e.defaultPrevented) return;
      if (e.target?.closest?.('[contenteditable="true"]')) return;
      e.preventDefault();
      if (dialog.open) dialog.close();
      else open();
    });
  }
})();
