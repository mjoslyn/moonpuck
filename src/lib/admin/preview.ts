// A page rendered as it will look (the /admin/preview route and share links, src/pages/share/): its
// saved version (unpublished changes of a live page included), or a version handed to it (the editor's
// unsaved state, a revision), with a bar saying what it is, noindex and never cached.
import { Loader } from '../data';
import { permalink } from '../permalink';
import { renderRequest } from '../../render/page';
import { eventDates, mediaIdForUrl, renderedExcerpt, renderedTitle } from './save';
import { esc } from '../../render/html';
import type { Entry } from '../types';
import type { PuckItem } from '../puck/types';
import type { Db } from '../db/query';
import { siteDb } from '../db/site';

export interface PreviewOptions {
  /** Someone with a share link: the page as visitors see it (no members-only content), and a bar of its own. */
  guest?: boolean;
  /** A guest's link edits: the bar links to the editor. */
  editLink?: boolean;
  /** The bar's words in place of the editor's. */
  note?: string;
}

const BAR_STYLE = 'position:sticky;top:0;z-index:100000;display:flex;gap:1rem;align-items:center;justify-content:center;padding:.5rem 1rem;background:#b87333;color:#fff;font:600 13px/1.4 system-ui,sans-serif';

export async function renderPreview(db: Db, id: number, origin: string, override?: { content?: any; entry?: any; template?: PuckItem[] }, what?: string, opts: PreviewOptions = {}): Promise<Response> {
  const loader = new Loader(db);
  const settings = await loader.settings();
  const base = await loader.entryById(id, true);
  if (!base) return new Response('Not found', { status: 404 });
  const { data: d } = await db.from('entry_drafts').select('draft').eq('entry_id', id).maybeSingle();
  const e: Entry = { ...base };
  const content = override?.content ?? d?.draft?.content;
  const form = override?.entry ?? d?.draft?.entry;
  if (content) e.content = content;
  if (form) {
    Object.assign(e, {
      title: form.title ?? e.title,
      title_rendered: renderedTitle(form.title ?? e.title),
      excerpt: form.excerpt ?? e.excerpt,
      excerpt_rendered: renderedExcerpt(form.excerpt ?? '', e.content?.content as PuckItem[]),
      template: form.template ?? e.template,
      fields: form.fields ?? e.fields,
      featured_media_id: form.featured_image !== undefined ? await mediaIdForUrl(db, form.featured_image) : e.featured_media_id,
    });
    if (e.type === 'event' && form.event_start) Object.assign(e, eventDates(form, e.fields));
  }
  const path = settings.site?.front_page_id === e.id ? '/' : permalink(e);
  // Shown as an editor sees the site: members-only pages and blocks included; to a guest as visitors see it.
  const viewer = { id: '', email: '', name: '', editor: !opts.guest, member: null };
  // A guest's page reads the rest of the site as the server, as visitors see it (published entries, forms,
  // totals), since the guest role reads only what its editor needs; the page itself is the one loaded above.
  const { status, html } = opts.guest
    ? await renderRequest(new URL(path, origin), siteDb(), undefined, { entry: e, template: override?.template, asVisitor: true }, viewer)
    : await renderRequest(new URL(path, origin), db, undefined, { entry: e, template: override?.template }, viewer);
  const live = base.status === 'publish';
  const bar = opts.guest
    ? `<div style="${BAR_STYLE}"><span>${esc(opts.note ?? `Shared preview${d?.draft || base.status !== 'publish' ? ' of unpublished changes' : ''}: only people with this link can see it`)}</span>` +
      (opts.editLink ? `<a href="/admin/edit/${e.id}/" style="color:#fff;text-decoration:underline">Edit this page</a>` : '') +
      `</div>`
    : `<div style="${BAR_STYLE}">` +
      `<span>Preview${what ? ` of ${what}` : override ? ' of unsaved changes' : d?.draft ? ' of unpublished changes' : ''}: ${live ? 'the live page is unchanged until you publish' : 'this page is not published'}</span>` +
      `<a href="/admin/edit/${e.id}/" style="color:#fff;text-decoration:underline">Back to the editor</a></div>`;
  const out = html
    .replace('<head>', '<head>\n\t<meta name="robots" content="noindex, nofollow" />')
    .replace(/<title>/, '<title>Preview · ')
    .replace(/(<body[^>]*>)/, `$1\n${bar}`);
  return new Response(out, { status: status === 404 ? 200 : status, headers: { 'Content-Type': 'text/html; charset=UTF-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', ...(opts.guest ? { 'Referrer-Policy': 'same-origin' } : {}) } });
}

