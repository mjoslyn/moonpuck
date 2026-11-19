// Share links (src/lib/share): what a guest may save, what the guest role reads, and the links themselves.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sessionDb, siteDb } from '../src/lib/db/site';
import { guestContent, guestEntry, GUEST_BLOCKED_MESSAGE, GUEST_ID_MESSAGE } from '../src/lib/share/guest-content';
import { cookieFits, cookieValue, countUse, createShare, guestCookie, guestLink, guestMay, isLive, liveLink, passwordOpens, revokeShare, shareProblem, sharesOf } from '../src/lib/share/links';

const block = (type: string, id: string, attrs: Record<string, any> = {}, extra: Record<string, any> = {}) => ({ type, props: { id, attrs, ...extra } });
const doc = (...content: any[]) => ({ root: { props: {} }, content });

describe('guestContent', () => {
  const before = doc(block('text', 't1', { content: 'Hello <span class="has-accent">there</span>' }), block('html', 'h1', { html: '<script>ok()</script>' }));

  it('keeps what the guest left as it was, editor markup and HTML blocks included', () => {
    const r = guestContent(doc(before.content[1], before.content[0]), before);
    expect(r.ok && r.content.content).toEqual([before.content[1], before.content[0]]);
  });

  it('lets a guest remove an HTML block', () => {
    expect(guestContent(doc(before.content[0]), before).ok).toBe(true);
  });

  it('refuses a new HTML or Embed block, a changed one, and a block turned into one', () => {
    for (const after of [
      doc(...before.content, block('html', 'h2', { html: '<img src=x onerror=alert(1)>' })),
      doc(...before.content, block('embed', 'e1', { html: '<iframe src="https://evil.example"></iframe>' })),
      doc(before.content[0], block('html', 'h1', { html: '<script>evil()</script>' })),
      doc(block('html', 't1', { html: '<script>evil()</script>' })),
    ]) expect(guestContent(after, before)).toEqual({ ok: false, error: GUEST_BLOCKED_MESSAGE });
  });

  it('refuses imported markup a guest added or changed, in content areas too', () => {
    expect(guestContent(doc(block('section', 's1', {}, { html: ['<div onclick="x()">', '</div>'] })), before).ok).toBe(false);
    expect(guestContent({ root: { props: { 'area-sidebar': [block('html', 'x', { html: '<script></script>' })] } }, content: [] }, before).ok).toBe(false);
  });

  it('cleans what a guest changed: markup to inline formatting, addresses to safe ones', () => {
    const r = guestContent(doc(block('text', 't1', { content: 'Hi <img src=x onerror=alert(1)><b>bold</b> <a href="javascript:alert(1)">x</a>' }), block('button', 'b1', { url: 'javascript:alert(1)', text: 'Go' }), block('image', 'i1', { href: 'https://example.org/' })), before);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.content.content[0].props.attrs.content).toBe('Hi <b>bold</b> <a>x</a>');
    expect(r.content.content[1].props.attrs.url).toBe('');
    expect(r.content.content[2].props.attrs.href).toBe('https://example.org/');
  });

  it('refuses a new block whose id isn’t plain, and keeps an id the page already had', () => {
    for (const id of ['x"><img src=x onerror=alert(1)>', 'a b', 'x'.repeat(101)]) expect(guestContent(doc(block('subscribe', id)), before)).toEqual({ ok: false, error: GUEST_ID_MESSAGE });
    const odd = doc(block('text', 'old:id', { content: 'Hi' }));
    expect(guestContent(odd, odd).ok).toBe(true);
    expect(guestContent(doc(block('text', 'text-1a2B_3'), block('donate', 'donate-9')), before).ok).toBe(true);
  });

  it('cleans blocks inside containers', () => {
    const r = guestContent(doc(block('section', 's1', {}, { children: [block('text', 'n1', { content: '<script>x()</script>Hi' })] })), before);
    expect(r.ok && r.content.content[0].props.children[0].props.attrs.content).toBe('Hi');
  });
});

describe('guestEntry', () => {
  const current = { type: 'page', slug: 'about', title: 'About', excerpt: '', fields: { access: { members: true }, ticket: 4, seo: { noindex: false }, shop: { price: 1000 } } };
  it('takes the title and excerpt, keeps the address and every field a guest may not change', () => {
    const e = guestEntry({ title: 'A <new> title', slug: 'evil', template: 'other', excerpt: '<script>x</script>Short', fields: { access: null, ticket: 9, seo: { noindex: true }, shop: { price: 1 }, color: 'blue' }, tags: ['x'] }, null, current);
    expect(e).toEqual({ slug: 'about', title: 'A <new> title', excerpt: 'Short', fields: current.fields });
  });
  it('takes an event’s own fields, time zone and repeat rule, cleaned', () => {
    const ev = { ...current, type: 'event', fields: { cost: 'Free', website: 'https://example.org/', timezone: 'Europe/Paris', seo: { title: 'kept' } } };
    const e = guestEntry({ fields: { cost: '<b>£5</b><img src=x onerror=y>', website: 'javascript:alert(1)', recurrence: { freq: 'weekly' }, seo: { title: 'changed' } } }, null, ev);
    expect(e.fields).toEqual({ cost: '<b>£5</b>', website: '', recurrence: { freq: 'weekly' }, seo: { title: 'kept' } });
  });
  it('keeps the settings an editor kept aside', () => {
    const e = guestEntry({ title: 'Guest' }, { slug: 'renamed', template: 'wide', title: 'Editor' }, current);
    expect(e).toEqual({ slug: 'renamed', template: 'wide', title: 'Guest' });
  });
});

describe('the guest role', () => {
  const svc = siteDb();
  const ids = { own: 0, other: 0, live: 0, members: 0 };
  beforeAll(async () => {
    const add = async (slug: string, status: string, fields: Record<string, any> = {}) => (await svc.from('entries').insert({ type: 'page', slug, title: slug, status, fields }).select('id').single()).data!.id as number;
    ids.own = await add('share-own', 'draft');
    ids.other = await add('share-other', 'draft');
    ids.live = await add('share-live', 'publish');
    ids.members = await add('share-members', 'publish', { access: { members: true } });
  });
  afterAll(async () => {
    await svc.from('entries').delete().in('id', Object.values(ids));
  });

  it('reads its own entry and the published open ones, not other drafts or members-only pages', async () => {
    const guest = sessionDb({ role: 'guest', entryId: ids.own });
    const { data } = await guest.from('entries').select('id').in('id', Object.values(ids));
    expect(data!.map((r: any) => r.id).sort()).toEqual([ids.own, ids.live].sort());
  });

  it('writes nothing and reads no private tables', async () => {
    const guest = sessionDb({ role: 'guest', entryId: ids.own });
    expect((await guest.from('entries').update({ title: 'x' }).eq('id', ids.own).select('id')).data).toEqual([]);
    expect((await guest.from('entries').insert({ type: 'page', slug: 'g', title: 'g' })).error).not.toBeNull();
    await svc.from('settings').upsert({ key: 'mailing', value: { paused: false } });
    const { data: settings } = await guest.from('settings').select('key');
    expect(settings!.every((r: any) => ['site', 'options'].includes(r.key))).toBe(true);
    for (const table of ['form_submissions', 'profiles', 'contacts', 'shop_orders', 'forms']) expect((await guest.from(table).select('*')).data).toEqual([]);
    expect((await guest.rpc('ticket_sold', { p_entry: ids.own })).error).not.toBeNull();
  });

  it('without an entry reads nothing', async () => {
    expect((await sessionDb({ role: 'guest' }).from('entries').select('id')).data).toEqual([]);
  });
});

describe('links', () => {
  let entry = 0;
  const svc = siteDb();
  beforeAll(async () => {
    entry = (await svc.from('entries').insert({ type: 'page', slug: 'share-link', title: 'Share', status: 'draft' }).select('id').single()).data!.id;
  });
  afterAll(async () => {
    await svc.from('entries').delete().eq('id', entry);
  });
  const withCookie = (value: string, path = `/admin/edit/${entry}/`, headers: Record<string, string> = {}) => new Request(`https://site.test${path}`, { headers: { cookie: `site.share.${entry}=${value}`, ...headers } });

  it('checks a new link’s settings', () => {
    expect(shareProblem({ entry: 1, mode: 'edit', access: 'password', password: '123' })).toMatch(/at least 6/);
    expect(shareProblem({ entry: 1, mode: 'view', access: 'anyone', expires: '2000-01-01T00:00:00Z' })).toMatch(/future/);
    expect(shareProblem({ entry: 1, mode: 'view', access: 'nobody' as any })).toMatch(/who can open/);
    expect(shareProblem({ entry: 1, mode: 'view', access: 'anyone' })).toBeNull();
  });

  it('opens with its password, and a guest cookie stops fitting when the password changes', async () => {
    const link = await createShare({ entry, mode: 'edit', access: 'password', password: 'secret-pass', label: 'Board' }, null);
    expect(await passwordOpens(link, 'secret-pass')).toBe(true);
    expect(await passwordOpens(link, 'wrong')).toBe(false);
    const value = cookieValue(link);
    expect((await guestLink(withCookie(value)))?.id).toBe(link.id);
    expect(guestCookie(link)).toMatch(/HttpOnly; SameSite=Lax; Max-Age=604800/);
    await svc.from('share_links').update({ password_hash: 'other' }).eq('id', link.id);
    expect(await guestLink(withCookie(value))).toBeNull();
    expect(cookieFits(link, value.split('.')[1] + 'x')).toBe(false);
  });

  it('keeps a cookie per page, so a second link leaves the first working', async () => {
    const other = (await svc.from('entries').insert({ type: 'page', slug: 'share-other-page', title: 'Other', status: 'draft' }).select('id').single()).data!.id as number;
    const a = await createShare({ entry, mode: 'edit', access: 'anyone' }, null);
    const b = await createShare({ entry: other, mode: 'edit', access: 'anyone' }, null);
    expect(guestCookie(a)).toMatch(new RegExp(`^site\\.share\\.${entry}=`));
    const both = `site.share.${entry}=${cookieValue(a)}; site.share.${other}=${cookieValue(b)}`;
    const req = (path: string, referer?: string) => new Request(`https://site.test${path}`, { headers: { cookie: both, ...(referer ? { referer } : {}) } });
    expect((await guestLink(req(`/admin/edit/${entry}/`)))?.id).toBe(a.id);
    expect((await guestLink(req(`/api/admin/entries/${other}`)))?.id).toBe(b.id);
    // The editor's other calls belong to the page that made them.
    expect((await guestLink(req('/api/admin/db', `https://site.test/admin/edit/${other}/`)))?.id).toBe(b.id);
    expect(await guestLink(req('/api/admin/db', `https://evil.test/admin/edit/${other}/`))).toBeNull();
    expect(await guestLink(req('/api/admin/db'))).toBeNull();
    // A cookie set for one page doesn't open another.
    expect(await guestLink(new Request(`https://site.test/admin/edit/${other}/`, { headers: { cookie: `site.share.${other}=${cookieValue(a)}` } }))).toBeNull();
    await svc.from('entries').delete().eq('id', other);
  });

  it('counts every open when several come at once', async () => {
    const link = await createShare({ entry, mode: 'view', access: 'anyone' }, null);
    await Promise.all(Array.from({ length: 5 }, () => countUse(link)));
    expect((await svc.from('share_links').select('uses').eq('id', link.id).single()).data!.uses).toBe(5);
  });

  it('never lets a guest in through a login link', async () => {
    const link = await createShare({ entry, mode: 'edit', access: 'login' }, null);
    expect(await guestLink(withCookie(cookieValue(link)))).toBeNull();
  });

  it('stops when revoked, expired or its entry is in the trash', async () => {
    const link = await createShare({ entry, mode: 'view', access: 'anyone', expires: new Date(Date.now() + 3600_000).toISOString() }, null);
    expect(await liveLink(link.token)).not.toBeNull();
    expect(isLive({ revoked_at: null, expires_at: new Date(Date.now() - 1000).toISOString() })).toBe(false);
    await svc.from('entries').update({ status: 'trash' }).eq('id', entry);
    expect(await liveLink(link.token)).toBeNull();
    await svc.from('entries').update({ status: 'draft' }).eq('id', entry);
    await revokeShare(link.id);
    expect(await liveLink(link.token)).toBeNull();
    expect((await sharesOf(entry)).find((l) => l.id === link.id)).toMatchObject({ live: false });
    expect((await sharesOf(entry))[0]).not.toHaveProperty('password_hash');
  });

  it('lets a guest reach only its entry’s editor, preview and the editor’s APIs', () => {
    const edit = { entry_id: 7, mode: 'edit' as const };
    const view = { entry_id: 7, mode: 'view' as const };
    expect(guestMay(edit, 'GET', '/admin/edit/7/')).toBe(true);
    expect(guestMay(edit, 'PUT', '/api/admin/entries/7')).toBe(true);
    expect(guestMay(edit, 'POST', '/api/admin/db')).toBe(true);
    expect(guestMay(edit, 'POST', '/admin/preview/7/')).toBe(true);
    expect(guestMay(edit, 'GET', '/admin/edit/8/')).toBe(false);
    expect(guestMay(edit, 'PUT', '/api/admin/entries/8')).toBe(false);
    expect(guestMay(edit, 'POST', '/api/admin/media')).toBe(false);
    expect(guestMay(edit, 'POST', '/api/admin/shares')).toBe(false);
    expect(guestMay(edit, 'PUT', '/api/admin/a11y')).toBe(false);
    expect(guestMay(edit, 'GET', '/api/admin/share-data')).toBe(true);
    expect(guestMay(view, 'GET', '/api/admin/share-data')).toBe(false);
    expect(guestMay(view, 'GET', '/admin/preview/7/')).toBe(true);
    expect(guestMay(view, 'GET', '/admin/edit/7/')).toBe(false);
    expect(guestMay(view, 'POST', '/api/admin/db')).toBe(false);
  });
});

describe('a guest’s save', async () => {
  const { PUT } = await import('../src/pages/api/admin/entries/[id]');
  const svc = siteDb();
  let id = 0;
  let live = 0;
  const content = doc(block('text', 't1', { content: 'Hi' }), block('html', 'h1', { html: '<script>ok()</script>' }));
  beforeAll(async () => {
    id = (await svc.from('entries').insert({ type: 'page', slug: 'guest-save', title: 'Guest', status: 'draft', content, fields: { access: { members: false } } }).select('id').single()).data!.id;
    live = (await svc.from('entries').insert({ type: 'page', slug: 'guest-live', title: 'Live', status: 'publish', content }).select('id').single()).data!.id;
  });
  afterAll(async () => {
    await svc.from('entries').delete().in('id', [id, live]);
  });
  const put = (entry: number, body: Record<string, any>) =>
    PUT({ params: { id: String(entry) }, request: new Request(`http://x/api/admin/entries/${entry}`, { method: 'PUT', body: JSON.stringify(body) }), locals: { db: sessionDb({ role: 'guest', entryId: entry }), user: { id: '', email: '', role: 'guest', name: 'Guest' }, share: { label: 'Board' } } } as any);

  it('refuses a publish, a layout and an HTML block', async () => {
    expect((await put(id, { action: 'publish', content })).status).toBe(403);
    expect((await put(id, { action: 'draft', content, template: { kind: 'template', slug: 'page', content: {} } })).status).toBe(403);
    expect((await put(id, { action: 'draft', content: doc(...content.content, block('html', 'h2', { html: '<img onerror=x>' })) })).status).toBe(400);
  });

  it('saves a draft as the server, cleaned, its address and access kept, with a note in the history', async () => {
    const res = await put(id, { action: 'draft', content: doc(block('text', 't1', { content: '<img src=x onerror=alert(1)>Hello' }), content.content[1]), entry: { title: 'Guest title', slug: 'moved', status: 'publish', fields: { access: null } } });
    expect(res.status).toBe(200);
    const { data } = await svc.from('entries').select('title, slug, status, content, fields').eq('id', id).single();
    expect(data).toMatchObject({ title: 'Guest title', slug: 'guest-save', status: 'draft', fields: { access: { members: false } } });
    expect(data.content.content[0].props.attrs.content).toBe('Hello');
    const { data: rev } = await svc.from('revisions').select('author_id, note').eq('entry_id', id).single();
    expect(rev).toEqual({ author_id: null, note: 'Saved through a share link (Board)' });
  });

  it('puts a published page’s guest changes on its full settings, so an editor finds its tags and template', async () => {
    const tag = (await svc.from('terms').insert({ taxonomy: 'tag', name: 'Kept tag', slug: 'kept-tag' }).select('id').single()).data!.id;
    const page = (await svc.from('entries').insert({ type: 'page', slug: 'guest-full', title: 'Full', status: 'publish', template: 'wide', content }).select('id').single()).data!.id;
    await svc.from('entry_terms').insert({ entry_id: page, term_id: tag });
    expect((await put(page, { action: 'draft', content, entry: { title: 'Guest title', tags: [] } })).status).toBe(200);
    const { data: kept } = await svc.from('entry_drafts').select('draft').eq('entry_id', page).single();
    expect(kept.draft.entry).toMatchObject({ title: 'Guest title', slug: 'guest-full', template: 'wide', status: 'publish', tags: ['Kept tag'] });
    await svc.from('entries').delete().eq('id', page);
    await svc.from('terms').delete().eq('id', tag);
  });

  it('keeps a published page’s changes aside', async () => {
    expect((await put(live, { action: 'draft', content: doc(block('text', 't1', { content: 'Changed' }), content.content[1]), entry: { title: 'Changed' } })).status).toBe(200);
    expect((await svc.from('entries').select('title, status').eq('id', live).single()).data).toEqual({ title: 'Live', status: 'publish' });
    const { data: kept } = await svc.from('entry_drafts').select('draft').eq('entry_id', live).single();
    expect(kept.draft.entry).toMatchObject({ slug: 'guest-live', title: 'Changed', status: 'publish' });
  });
});

describe('what a guest sees', async () => {
  const { renderPreview } = await import('../src/lib/admin/preview');
  const { POST: shares } = await import('../src/pages/api/admin/shares');
  const svc = siteDb();
  let page = 0;
  let form = 0;
  beforeAll(async () => {
    form = (await svc.from('forms').insert({ title: 'Contact', definition: { fields: [{ id: 'f1', type: 'text', label: 'Your guest name' }] }, notifications: [{ to: 'staff@example.org' }], is_active: true }).select('id').single()).data!.id;
    await svc.from('templates').insert({ kind: 'template', slug: 'guest-test', title: 'Guest test', content: doc(block('entry-content', 'pc')) });
    page = (await svc.from('entries').insert({ type: 'page', slug: 'guest-form', title: 'Form page', status: 'draft', template: 'guest-test', content: doc(block('form', 'fm1', { formId: form })) }).select('id').single()).data!.id;
  });
  afterAll(async () => {
    await svc.from('entries').delete().eq('id', page);
    await svc.from('forms').delete().eq('id', form);
    await svc.from('templates').delete().eq('slug', 'guest-test');
  });

  it('a guest’s preview shows the page’s form, as visitors would', async () => {
    const res = await renderPreview(sessionDb({ role: 'guest', entryId: page }), page, 'https://site.test', undefined, undefined, { guest: true });
    const html = await res.text();
    expect(html).toContain('Your guest name');
  });

  it('the canvas data has the forms without their notifications', async () => {
    const { guestCanvasData } = await import('../src/lib/share/guest-state');
    const data = await guestCanvasData();
    const f = data.forms.find((x: any) => x.id === form);
    expect(f?.definition).toEqual({ fields: [{ id: 'f1', type: 'text', label: 'Your guest name' }] });
    expect(JSON.stringify(data)).not.toContain('staff@example.org');
  });

  it('makes links on the copy answering, not SITE_URL', async () => {
    const was = process.env.SITE_URL;
    process.env.SITE_URL = 'https://production.example';
    try {
      const res = await shares({ request: new Request('https://copy.example/api/admin/shares', { method: 'POST', body: JSON.stringify({ action: 'create', entry: page, mode: 'view', access: 'anyone' }) }), url: new URL('https://copy.example/api/admin/shares'), locals: { db: sessionDb({ role: 'editor', uid: '00000000-0000-0000-0000-000000000001' }), user: { id: '' } } } as any);
      expect((await res.json()).url).toMatch(/^https:\/\/copy\.example\/share\//);
    } finally {
      if (was === undefined) delete process.env.SITE_URL;
      else process.env.SITE_URL = was;
    }
  });
});
