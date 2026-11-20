// Editor bar: for signed-in editors and admins, a bar above the page with links to the dashboard and to
// edit what the page shows (body data-edit-entry / data-edit-template, set by the renderer), and the
// command palette (Go to, or Ctrl+K / ⌘K): the admin's screens, Settings' sections (admins) and entries
// by title, from GET /api/admin/commands; and, on an entry's page, Comments: the page's comments (its count
// open on the button), to resolve, reopen, delete or add one on the whole page (GET and POST
// /api/admin/share-comments, as the page editor's Comments panel). Pages are cached and shared, so this runs in the browser: only
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
          background: none; color: #fff; font: inherit; text-decoration: none; white-space: nowrap; cursor: pointer; }
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
        .c-editor-bar__count { margin-left: 6px; padding: 0 6px; border-radius: 9px; background: #c87d37; color: #0f0f1c; font-size: 11px; font-weight: 700; line-height: 18px; }
        .c-comments { position: absolute; top: 100%; right: 12px; z-index: 1001; box-sizing: border-box; width: min(26rem, calc(100vw - 24px)); max-height: min(70vh, 40rem);
          overflow-y: auto; border: 1px solid rgba(15,15,28,.12); border-radius: 8px; background: #fff; color: #0f0f1c; box-shadow: 0 20px 50px rgba(0,0,0,.25);
          font: 14px/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; text-align: left; }
        .c-comments[hidden] { display: none; }
        .c-comments h2 { margin: 0; padding: 12px 16px 0; color: inherit; font: 600 15px/1.3 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; letter-spacing: normal; text-transform: none; }
        .c-comments form { padding: 8px 16px 12px; border-bottom: 1px solid rgba(15,15,28,.1); }
        .c-comments textarea { box-sizing: border-box; width: 100%; min-height: 4.5em; margin: 4px 0; padding: 6px 8px; border: 1px solid rgba(15,15,28,.2); border-radius: 4px;
          font: inherit; color: inherit; background: #fff; resize: vertical; }
        .c-comments textarea:focus { outline: 2px solid #c87d37; outline-offset: 0; }
        .c-comments small, .c-comments .is-muted { color: #6b6b78; font-size: 12px; }
        .c-comments .is-error { color: #c4592a; font-size: 12px; }
        .c-comments button, .c-comments a { padding: 0; border: 0; background: none; color: inherit; font: inherit; font-size: 12px; text-decoration: underline; cursor: pointer; }
        .c-comments button:hover, .c-comments a:hover { color: #c87d37; }
        .c-comments button.is-primary { padding: 5px 12px; border-radius: 4px; background: #0f0f1c; color: #fff; font-weight: 600; text-decoration: none; }
        .c-comments button.is-primary:hover { background: #c87d37; color: #0f0f1c; }
        .c-comments button:disabled { opacity: .5; cursor: default; }
        .c-comments button.is-danger { color: #c4592a; }
        .c-comments__head { display: flex; justify-content: space-between; gap: 8px; padding: 8px 16px; border-bottom: 1px solid rgba(15,15,28,.1); color: #6b6b78; font-size: 12px; }
        .c-comments__head label { display: flex; align-items: center; gap: 4px; }
        .c-comments ol { margin: 0; padding: 0; list-style: none; }
        .c-comments li { padding: 10px 16px; border-bottom: 1px solid rgba(15,15,28,.08); }
        .c-comments li.is-resolved { opacity: .6; }
        .c-comments li p { margin: 4px 0; white-space: pre-wrap; overflow-wrap: anywhere; }
        .c-comments__on { color: #6b6b78; font-size: 12px; }
        .c-comments__on b { color: #0f0f1c; font-weight: 600; }
        .c-comments__actions { display: flex; gap: 12px; margin-top: 4px; }
        .c-comments__empty { margin: 0; padding: 12px 16px; color: #6b6b78; }
        @media (max-width: 599px) { .c-editor-bar kbd { display: none; } }
        @media (max-width: 599px) { .c-editor-bar { flex-wrap: wrap; padding-block: 6px; } .c-editor-bar__who { display: none; } .c-editor-bar form { margin-left: auto; } }`;
      document.head.appendChild(style);

      const bar = document.createElement('nav');
      bar.className = 'c-editor-bar';
      bar.setAttribute('aria-label', 'Editor');
      const mac = /Mac|iPhone|iPad/.test(navigator.platform);
      bar.innerHTML =
        links.join('') +
        (entry ? '<button type="button" data-comments aria-expanded="false" aria-controls="c-comments">Comments<span class="c-editor-bar__count" hidden></span></button>' : '') +
        `<button type="button" data-palette title="Go to a screen, setting or entry">Go to<kbd>${mac ? '⌘K' : 'Ctrl K'}</kbd></button>` +
        `<span class="c-editor-bar__who">Signed in as ${esc(me.name)}</span>` +
        '<form method="post" action="/api/auth/logout"><button type="submit">Sign out</button></form>';
      // After the skip link, which stays the first thing to tab to.
      const skip = body.querySelector(':scope > .c-skip-link');
      if (skip) skip.after(bar);
      else body.prepend(bar);
      palette(bar.querySelector('[data-palette]'), esc);
      if (entry) comments(bar, bar.querySelector('[data-comments]'), esc);
    })
    .catch(() => {});

  // Comments: a panel under the bar listing the page's comments, open ones first, with a box to add one on
  // the whole page. The live page doesn't mark its blocks (it is cached for everyone), so a block's comment
  // shows its type and words, and Comment on a block opens the preview, which does.
  function comments(bar, button, esc) {
    if (!button) return;
    const panel = document.createElement('div');
    panel.className = 'c-comments';
    panel.id = 'c-comments';
    panel.hidden = true;
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'Comments on this page');
    bar.appendChild(panel);
    const count = button.querySelector('.c-editor-bar__count');
    const api = '/api/admin/share-comments';
    const preview = `/admin/preview/${encodeURIComponent(entry)}/`;
    let rows = null;
    let showResolved = false;
    let error = '';
    let draft = '';
    let busy = false;
    let confirming = 0;
    // A block type as the editor names it (as the page editor's Comments panel does).
    const LABELS = { text: 'Paragraph', 'media-text': 'Media and text', 'entry-content': 'Page content', 'video-gallery': 'Video gallery' };
    const typeLabel = (t) => (t ? (LABELS[t] ?? t.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase())) : 'Whole page');
    const when = (s) => new Date(s).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
    // @handles in bold, the rest escaped.
    const mentions = (s) => esc(s).replace(/(^|[^\w@.])(@[a-z0-9._-]+)/gi, '$1<b>$2</b>');

    const draw = () => {
      const open = (rows || []).filter((r) => r.status === 'open');
      const resolved = (rows || []).filter((r) => r.status !== 'open');
      count.textContent = String(open.length);
      count.hidden = !open.length;
      button.setAttribute('aria-label', `Comments, ${open.length} open`);
      if (panel.hidden) return;
      const shown = showResolved ? [...open, ...resolved] : open;
      const focused = document.activeElement?.closest?.('.c-comments') ? document.activeElement.name || '' : '';
      panel.innerHTML =
        '<h2>Comments on this page</h2>' +
        '<form><label><small>Comment on the whole page</small><textarea name="body" maxlength="2000" required></textarea></label>' +
        `<small>Type @ and someone's handle to email them. To comment on one block, use <a href="${preview}" target="_blank" rel="noopener">the preview</a>.</small>` +
        (error ? `<p class="is-error" role="alert">${esc(error)}</p>` : '') +
        `<p style="margin:8px 0 0"><button type="submit" class="is-primary"${busy ? ' disabled' : ''}>Add comment</button></p></form>` +
        `<div class="c-comments__head"><span>${rows ? `${open.length} open` : 'Loading…'}</span>` +
        (resolved.length ? `<label><input type="checkbox" name="resolved"${showResolved ? ' checked' : ''}> Show resolved (${resolved.length})</label>` : '') +
        '</div>' +
        (rows && !shown.length ? '<p class="c-comments__empty">No open comments.</p>' : '') +
        '<ol>' +
        shown
          .map(
            (r) =>
              `<li class="${r.status === 'open' ? '' : 'is-resolved'}"><div class="c-comments__on"><b>${esc(typeLabel(r.block_type))}</b>${r.quote ? `: ${esc(r.quote.slice(0, 80))}` : ''}</div>` +
              `<p>${mentions(r.body)}</p>` +
              `<small>${esc(r.author)}${r.guest ? ' (share link)' : ''} · ${when(r.created_at)}${r.status === 'resolved' && r.resolved_at ? ` · resolved ${when(r.resolved_at)}${r.resolved_by_name ? ` by ${esc(r.resolved_by_name)}` : ''}` : ''}</small>` +
              `<div class="c-comments__actions"><button type="button" data-act="${r.status === 'open' ? 'resolve' : 'reopen'}" data-id="${r.id}"${busy ? ' disabled' : ''}>${r.status === 'open' ? 'Resolve' : 'Reopen'}</button>` +
              (confirming === r.id
                ? `<button type="button" class="is-danger" data-act="delete" data-id="${r.id}"${busy ? ' disabled' : ''}>Delete for good</button><button type="button" data-act="keep">Keep it</button>`
                : `<button type="button" class="is-danger" data-act="ask" data-id="${r.id}">Delete</button>`) +
              '</div></li>',
          )
          .join('') +
        '</ol>';
      const box = panel.querySelector('textarea');
      box.value = draft;
      box.addEventListener('input', () => (draft = box.value));
      if (focused === 'body') box.focus();
    };
    const load = () =>
      fetch(`${api}?entry=${encodeURIComponent(entry)}`, { credentials: 'same-origin', cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : Promise.reject(r)))
        .then((d) => {
          rows = d;
          draw();
        })
        .catch(() => {
          error = 'Couldn’t load the comments.';
          draw();
        });
    const act = (data) => {
      busy = true;
      error = '';
      draw();
      return fetch(api, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(async (r) => {
          if (!r.ok) throw new Error((await r.text()) || 'Couldn’t do that. Try again.');
          return true;
        })
        .catch((e) => {
          error = e.message || 'Couldn’t do that. Try again.';
          return false;
        })
        .finally(() => {
          busy = false;
          confirming = 0;
          return load();
        });
    };
    const toggle = (show) => {
      panel.hidden = !show;
      button.setAttribute('aria-expanded', String(show));
      if (show) {
        draw();
        panel.querySelector('textarea')?.focus();
        load();
      }
    };
    button.addEventListener('click', () => toggle(panel.hidden));
    panel.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!draft.trim() || busy) return;
      act({ action: 'add', entry: Number(entry), body: draft }).then((ok) => ok && ((draft = ''), draw()));
    });
    panel.addEventListener('change', (e) => {
      if (e.target.name === 'resolved') (showResolved = e.target.checked), draw();
    });
    panel.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-act]');
      if (!b) return;
      const id = Number(b.dataset.id);
      if (b.dataset.act === 'ask') return (confirming = id), draw();
      if (b.dataset.act === 'keep') return (confirming = 0), draw();
      act({ action: b.dataset.act, id });
    });
    document.addEventListener('click', (e) => {
      // The path, not the target: a click inside redraws the panel, taking its target out of the page.
      const path = e.composedPath();
      if (!panel.hidden && !path.includes(panel) && !path.includes(button)) toggle(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !panel.hidden) (toggle(false), button.focus());
    });
    load();
  }

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
