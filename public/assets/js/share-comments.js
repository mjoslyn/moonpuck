// Comments on a page's blocks, in its preview (src/lib/admin/preview.ts adds this script, and marks each
// of the page's blocks with data-block and data-block-type). A Comment button turns comment mode on: the
// block under the pointer is outlined, and a click on it (or Enter on a focused one) opens a small form.
// A guest gives a name (kept in this browser), an editor comments as themselves. Comments go to
// POST /api/share/comment (src/lib/share/comments.ts). Without this script the preview is just a preview.
// On a live page in comment mode (src/render/page.ts, `?comment`) it starts on (data-start) and the editor
// bar's Comment on blocks switch drives it (data-bar: no button of its own; the `c-comments:mode` event,
// { on }, turns it on or off, and it tells the bar `c-comments:changed` with its mode and
// `c-comments:sent` after a comment).
(() => {
  const me = document.currentScript;
  if (!me) return;
  const kind = me.dataset.kind;
  const id = me.dataset.id;
  const guest = me.dataset.guest === '1';
  const fromBar = me.dataset.bar === '1';
  // @mention suggestions (mentions.js), loaded the first time a box wants them, from beside this script
  // (with its ?v= version).
  let mentionsLoading = null;
  const mentionsIn = (box) => {
    if (window.siteMentions) return window.siteMentions(box);
    mentionsLoading ??= new Promise((done) => {
      const s = document.createElement('script');
      s.src = (me?.src || '/assets/js/share-comments.js').replace(/\/[^/?#]+(?=\?|$)/, '/mentions.js');
      s.onload = done;
      s.onerror = done;
      document.head.append(s);
    });
    mentionsLoading.then(() => window.siteMentions?.(box));
  };
  const NAME_KEY = 'share-comments-name';
  const LABELS = { text: 'Paragraph', heading: 'Heading', image: 'Image', section: 'Section', columns: 'Columns', column: 'Column', buttons: 'Buttons', button: 'Button', list: 'List', quote: 'Quote', cover: 'Cover', hero: 'Hero', gallery: 'Gallery', 'media-text': 'Media and text', collection: 'Collection', form: 'Form', embed: 'Embed', video: 'Video', file: 'File' };
  const label = (type) => LABELS[type] || (type ? type.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase()) : 'Block');
  const readName = () => {
    try {
      return localStorage.getItem(NAME_KEY) || '';
    } catch {
      return '';
    }
  };
  const keepName = (v) => {
    try {
      localStorage.setItem(NAME_KEY, v);
    } catch {}
  };

  const css = document.createElement('style');
  css.textContent = `
.sc-on [data-block]{cursor:pointer}
.sc-hover{outline:2px dashed #b87333 !important;outline-offset:2px}
.sc-picked{outline:3px solid #b87333 !important;outline-offset:2px}
.sc-button{position:fixed;right:16px;bottom:16px;z-index:100001;border:0;border-radius:999px;padding:10px 16px;background:#1c2331;color:#fff;font:600 14px/1.2 system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer}
.sc-button[aria-pressed=true]{background:#b87333}
.sc-panel{position:fixed;right:16px;bottom:68px;z-index:100001;width:min(340px,calc(100vw - 32px));background:#fff;color:#1c2331;border-radius:8px;box-shadow:0 8px 30px rgba(0,0,0,.25);padding:14px;font:14px/1.45 system-ui,sans-serif}
.sc-panel p{margin:0 0 8px}
.sc-panel .sc-quote{color:#555f6d;font-size:12px;border-left:3px solid #b87333;padding-left:8px;max-height:3.6em;overflow:hidden}
.sc-panel label{display:block;margin:8px 0 4px;font-weight:600;font-size:12px}
.sc-panel input,.sc-panel textarea{box-sizing:border-box;width:100%;border:1px solid #c9ccd1;border-radius:4px;padding:6px 8px;font:inherit}
.sc-panel textarea{min-height:90px;resize:vertical}
.sc-row{display:flex;gap:8px;justify-content:flex-end;margin-top:10px}
.sc-row button{border:1px solid #c9ccd1;background:#fff;border-radius:4px;padding:6px 12px;font:inherit;cursor:pointer}
.sc-row button.sc-send{background:#1c2331;color:#fff;border-color:#1c2331}
.sc-error{color:#b3261e;font-size:12px}
.sc-panel .sc-hint{margin:4px 0 0;color:#555f6d;font-size:12px}
.sc-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}`;
  document.head.append(css);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'sc-button';
  button.setAttribute('aria-pressed', 'false');
  button.textContent = 'Comment';
  const status = document.createElement('div');
  status.className = 'sc-sr';
  status.setAttribute('role', 'status');
  if (fromBar) button.hidden = true;
  document.body.append(button, status);

  let on = false;
  let hovered = null;
  let panel = null;
  const blocks = () => [...document.querySelectorAll('[data-block]')];

  const setMode = (v) => {
    on = v;
    button.setAttribute('aria-pressed', String(v));
    button.textContent = v ? 'Done commenting' : 'Comment';
    document.documentElement.classList.toggle('sc-on', v);
    for (const b of blocks()) {
      if (v) {
        b.setAttribute('tabindex', b.getAttribute('tabindex') ?? '0');
        b.dataset.scTab = '1';
      } else if (b.dataset.scTab) {
        b.removeAttribute('tabindex');
        delete b.dataset.scTab;
      }
    }
    if (!v) {
      hovered?.classList.remove('sc-hover');
      hovered = null;
      closePanel();
    }
    status.textContent = v ? 'Comment mode on: choose a block to comment on it.' : 'Comment mode off.';
    document.dispatchEvent(new CustomEvent('c-comments:changed', { detail: { on: v } }));
  };

  const closePanel = () => {
    document.querySelector('.sc-picked')?.classList.remove('sc-picked');
    panel?.remove();
    panel = null;
  };

  const open = (block) => {
    closePanel();
    block.classList.add('sc-picked');
    const type = block.dataset.blockType || '';
    const words = (block.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    panel = document.createElement('form');
    panel.className = 'sc-panel';
    panel.setAttribute('aria-label', 'Comment on this block');
    const quote = document.createElement('p');
    quote.className = 'sc-quote';
    quote.textContent = `${label(type)}${words ? `: ${words}` : ''}`;
    panel.append(quote);
    let name = null;
    if (guest) {
      const l = document.createElement('label');
      l.textContent = 'Your name';
      name = document.createElement('input');
      name.required = true;
      name.maxLength = 80;
      name.autocomplete = 'name';
      name.value = readName();
      l.append(name);
      panel.append(l);
    }
    const l2 = document.createElement('label');
    l2.textContent = 'Comment';
    const body = document.createElement('textarea');
    body.required = true;
    body.maxLength = 2000;
    l2.append(body);
    // Editors can @mention editors and admins; guests' comments notify nobody.
    let hint = null;
    if (!guest) {
      mentionsIn(body);
      hint = document.createElement('p');
      hint.className = 'sc-hint';
      hint.textContent = 'Type @ and a name to mention an editor or admin: pick them from the list, and they get an email with the comment.';
    }
    const error = document.createElement('p');
    error.className = 'sc-error';
    error.setAttribute('role', 'alert');
    const row = document.createElement('div');
    row.className = 'sc-row';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    const send = document.createElement('button');
    send.type = 'submit';
    send.className = 'sc-send';
    send.textContent = 'Send';
    row.append(cancel, send);
    panel.append(l2, ...(hint ? [hint] : []), error, row);
    document.body.append(panel);
    (name && !name.value ? name : body).focus();
    cancel.addEventListener('click', () => (closePanel(), block.focus()));
    panel.addEventListener('keydown', (e) => e.key === 'Escape' && (closePanel(), block.focus()));
    panel.addEventListener('submit', async (e) => {
      e.preventDefault();
      send.disabled = true;
      error.textContent = '';
      if (name) keepName(name.value.trim());
      const res = await fetch('/api/share/comment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, id, block: block.dataset.block, body: body.value, name: name ? name.value : undefined }) }).catch(() => null);
      const out = res ? await res.json().catch(() => null) : null;
      send.disabled = false;
      if (!res?.ok || !out?.ok) {
        error.textContent = out?.error || 'Couldn’t send your comment. Try again.';
        return;
      }
      closePanel();
      document.dispatchEvent(new CustomEvent('c-comments:sent'));
      status.textContent = 'Comment sent. Thank you.';
      button.textContent = 'Comment sent ✓';
      setTimeout(() => on && (button.textContent = 'Done commenting'), 2000);
      block.focus();
    });
  };

  button.addEventListener('click', () => setMode(!on));
  document.addEventListener('c-comments:mode', (e) => setMode(!!e.detail?.on));
  window.__commentMode = true;
  if (me.dataset.start === 'on') setMode(true);
  // The innermost block under the pointer: comments go on the block, not the section around it, unless the
  // section itself is pointed at.
  const blockAt = (target) => (target instanceof Element ? target.closest('[data-block]') : null);
  document.addEventListener('mouseover', (e) => {
    if (!on) return;
    const b = blockAt(e.target);
    if (b === hovered) return;
    hovered?.classList.remove('sc-hover');
    hovered = b;
    b?.classList.add('sc-hover');
  });
  // In comment mode a click comments instead of following a link or pressing a button on the page.
  document.addEventListener(
    'click',
    (e) => {
      if (!on || button.contains(e.target) || panel?.contains(e.target)) return;
      const b = blockAt(e.target);
      if (!b) return;
      e.preventDefault();
      e.stopPropagation();
      open(b);
    },
    true,
  );
  document.addEventListener('keydown', (e) => {
    if (!on || e.key !== 'Enter' || panel?.contains(e.target)) return;
    const b = e.target instanceof Element && e.target.matches('[data-block]') ? e.target : null;
    if (b) {
      e.preventDefault();
      open(b);
    }
  });
})();
