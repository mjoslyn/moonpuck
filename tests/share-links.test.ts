// Share links (src/lib/share): the links themselves, what a guest (a view link) may reach and see, comments
// on shared pages' and newsletters' blocks, and newsletters' history and conflicting saves.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sessionDb, siteDb } from '../src/lib/db/site';
import { cookieFits, cookieValue, countUse, createShare, guestCookie, guestLink, guestMay, isLive, liveLink, passwordOpens, revokeShare, shareProblem, sharesOf } from '../src/lib/share/links';
import { addComment, blocksOf, commentErrorText, commentsOf, GUEST_COMMENTS_PER_HOUR } from '../src/lib/share/comments';

const block = (type: string, id: string, attrs: Record<string, any> = {}, extra: Record<string, any> = {}) => ({ type, props: { id, attrs, ...extra } });
const doc = (...content: any[]) => ({ root: { props: {} }, content });

describe('links', () => {
  let entry = 0;
  const svc = siteDb();
  beforeAll(async () => {
    entry = (await svc.from('entries').insert({ type: 'page', slug: 'share-link', title: 'Share', status: 'draft' }).select('id').single()).data!.id;
  });
  afterAll(async () => {
    await svc.from('entries').delete().eq('id', entry);
  });
  const withCookie = (value: string, path = `/admin/preview/${entry}/`) => new Request(`https://site.test${path}`, { headers: { cookie: `site.share.${entry}=${value}` } });

  it('checks a new link’s settings: an edit link is for signed-in editors only', () => {
    expect(shareProblem({ entry: 1, mode: 'view', access: 'password', password: '123' })).toMatch(/at least 6/);
    expect(shareProblem({ entry: 1, mode: 'view', access: 'anyone', expires: '2000-01-01T00:00:00Z' })).toMatch(/future/);
    expect(shareProblem({ entry: 1, mode: 'view', access: 'nobody' as any })).toMatch(/who can open/);
    expect(shareProblem({ entry: 1, mode: 'edit', access: 'anyone' })).toMatch(/signed-in editors/);
    expect(shareProblem({ entry: 1, mode: 'edit', access: 'password', password: 'secret-pass' })).toMatch(/signed-in editors/);
    expect(shareProblem({ entry: 1, mode: 'edit', access: 'login' })).toBeNull();
    expect(shareProblem({ entry: 1, mode: 'view', access: 'anyone' })).toBeNull();
  });

  it('opens with its password, and a guest cookie stops fitting when the password changes', async () => {
    const link = await createShare({ entry, mode: 'view', access: 'password', password: 'secret-pass', label: 'Board' }, null);
    expect(await passwordOpens(link, 'secret-pass')).toBe(true);
    expect(await passwordOpens(link, 'wrong')).toBe(false);
    const value = cookieValue(link);
    expect((await guestLink(withCookie(value)))?.id).toBe(link.id);
    expect(guestCookie(link)).toMatch(/HttpOnly; SameSite=Lax; Max-Age=604800/);
    await svc.from('share_links').update({ password_hash: 'other' }).eq('id', link.id);
    expect(await guestLink(withCookie(value))).toBeNull();
    expect(cookieFits(link, value.split('.')[1] + 'x')).toBe(false);
  });

  it('an edit link made for guests before the rule doesn’t open', async () => {
    const { data } = await svc.from('share_links').insert({ token: 'legacy-edit-token-0000000001', entry_id: entry, mode: 'edit', access: 'anyone' }).select('token').single();
    expect(await liveLink(data!.token)).toBeNull();
  });

  it('keeps a cookie per page; a cookie for one page opens only its preview', async () => {
    const other = (await svc.from('entries').insert({ type: 'page', slug: 'share-other-page', title: 'Other', status: 'draft' }).select('id').single()).data!.id as number;
    const a = await createShare({ entry, mode: 'view', access: 'anyone' }, null);
    const b = await createShare({ entry: other, mode: 'view', access: 'anyone' }, null);
    expect(guestCookie(a)).toMatch(new RegExp(`^site\\.share\\.${entry}=`));
    const both = `site.share.${entry}=${cookieValue(a)}; site.share.${other}=${cookieValue(b)}`;
    const req = (path: string, referer?: string) => new Request(`https://site.test${path}`, { headers: { cookie: both, ...(referer ? { referer } : {}) } });
    expect((await guestLink(req(`/admin/preview/${entry}/`)))?.id).toBe(a.id);
    expect((await guestLink(req(`/admin/preview/${other}/`)))?.id).toBe(b.id);
    // No other address, whatever page sent the request.
    expect(await guestLink(req(`/admin/edit/${entry}/`))).toBeNull();
    expect(await guestLink(req('/api/admin/db', `https://site.test/admin/preview/${other}/`))).toBeNull();
    expect(await guestLink(new Request(`https://site.test/admin/preview/${other}/`, { headers: { cookie: `site.share.${other}=${cookieValue(a)}` } }))).toBeNull();
    await svc.from('entries').delete().eq('id', other);
  });

  it('counts every open when several come at once', async () => {
    const link = await createShare({ entry, mode: 'view', access: 'anyone' }, null);
    await Promise.all(Array.from({ length: 5 }, () => countUse(link)));
    expect((await svc.from('share_links').select('uses').eq('id', link.id).single()).data!.uses).toBe(5);
  });

  it('never lets a guest in through a login link', async () => {
    const link = await createShare({ entry, mode: 'view', access: 'login' }, null);
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
    expect((await sharesOf({ kind: 'entry', id: entry })).find((l) => l.id === link.id)).toMatchObject({ live: false });
    expect((await sharesOf({ kind: 'entry', id: entry }))[0]).not.toHaveProperty('password_hash');
  });

  it('lets a guest reach only its page’s preview, by GET', () => {
    const view = { entry_id: 7, campaign_id: null, mode: 'view' as const, access: 'anyone' as const };
    expect(guestMay(view, 'GET', '/admin/preview/7/')).toBe(true);
    expect(guestMay(view, 'POST', '/admin/preview/7/')).toBe(false);
    expect(guestMay(view, 'GET', '/admin/preview/8/')).toBe(false);
    for (const [method, path] of [['GET', '/admin/edit/7/'], ['PUT', '/api/admin/entries/7'], ['POST', '/api/admin/db'], ['GET', '/api/admin/me'], ['POST', '/api/admin/shares'], ['POST', '/api/admin/share-comments']]) expect(guestMay(view, method, path)).toBe(false);
    expect(guestMay({ ...view, mode: 'edit' }, 'GET', '/admin/preview/7/')).toBe(false);
    expect(guestMay({ ...view, access: 'login' }, 'GET', '/admin/preview/7/')).toBe(false);
    expect(guestMay({ entry_id: null, campaign_id: 7, mode: 'view', access: 'anyone' }, 'GET', '/admin/preview/7/')).toBe(false);
  });

  it('the guest role reads nothing itself', async () => {
    const guest = sessionDb({ role: 'guest' });
    for (const table of ['entries', 'entry_drafts', 'settings', 'media', 'templates', 'revisions', 'share_comments', 'form_submissions']) expect((await guest.from(table).select('*').limit(1)).data).toEqual([]);
    expect((await guest.from('entries').insert({ type: 'page', slug: 'g', title: 'g' })).error).not.toBeNull();
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
    page = (await svc.from('entries').insert({ type: 'page', slug: 'guest-form', title: 'Form page', status: 'draft', template: 'guest-test', content: doc(block('heading', 'h1', { content: 'Welcome', level: 2 }), block('form', 'fm1', { formId: form }), block('html', 'hb', { html: '<!-- note -->Plain words' })) }).select('id').single()).data!.id;
  });
  afterAll(async () => {
    await svc.from('entries').delete().eq('id', page);
    await svc.from('forms').delete().eq('id', form);
    await svc.from('templates').delete().eq('slug', 'guest-test');
  });

  it('a guest’s preview shows the page as visitors would, its blocks marked for comments', async () => {
    const res = await renderPreview(sessionDb({ role: 'guest' }), page, 'https://site.test', undefined, undefined, { guest: true, label: 'Board' });
    const html = await res.text();
    expect(html).toContain('Your guest name');
    expect(html).toMatch(/<h2 data-block="h1" data-block-type="heading"/);
    expect(html).toContain(`<script src="/assets/js/share-comments.js" data-kind="entry" data-id="${page}" data-guest="1" defer>`);
    expect(html).toContain('(Board)');
    // A block whose output doesn't start with an element is wrapped, so it can take comments too.
    expect(html).toContain('<div data-block="hb" data-block-type="html"><!-- note -->Plain words</div>');
    // The template's own blocks aren't the page's: not marked.
    expect(html).not.toContain('data-block="pc"');
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

  it('won’t make an edit link a guest could open', async () => {
    const res = await shares({ request: new Request('https://x/api/admin/shares', { method: 'POST', body: JSON.stringify({ action: 'create', entry: page, mode: 'edit', access: 'anyone' }) }), url: new URL('https://x/api/admin/shares'), locals: { db: sessionDb({ role: 'editor', uid: '00000000-0000-0000-0000-000000000001' }), user: { id: '' } } } as any);
    expect(res.status).toBe(400);
  });
});

describe('comments', async () => {
  const { POST: comment } = await import('../src/pages/api/share/comment');
  const { GET: list, POST: manage } = await import('../src/pages/api/admin/share-comments');
  const svc = siteDb();
  const editorId = '00000000-0000-0000-0000-0000000000c1';
  let page = 0;
  let other = 0;
  beforeAll(async () => {
    await svc.from('users').insert({ id: editorId, email: 'comment-editor@example.org', name: 'Cora Editor' });
    await svc.from('profiles').upsert({ id: editorId, display_name: 'Cora Editor', role: 'editor' });
    page = (await svc.from('entries').insert({ type: 'page', slug: 'commented', title: 'Commented', status: 'publish', content: doc(block('section', 's1', {}, { children: [block('text', 't1', { content: 'Opening <b>hours</b> are long' })] })) }).select('id').single()).data!.id;
    other = (await svc.from('entries').insert({ type: 'page', slug: 'commented-other', title: 'Other', status: 'draft' }).select('id').single()).data!.id;
    await svc.from('entry_drafts').insert({ entry_id: page, draft: { content: doc(block('heading', 'h-draft', { content: 'New heading' })) } });
  });
  afterAll(async () => {
    await svc.from('entries').delete().in('id', [page, other]);
    await svc.from('users').delete().eq('id', editorId);
  });
  const post = (body: Record<string, any>, cookie = '') => comment({ request: new Request('https://site.test/api/share/comment', { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) }) } as any);

  it('finds a page’s blocks, nested and in its unpublished changes, with a few plain words', () => {
    const b = blocksOf(doc(block('section', 's1', {}, { children: [block('text', 't1', { content: 'Opening <b>hours</b>' })] })));
    expect([...b.keys()]).toEqual(['s1', 't1']);
    expect(b.get('t1')).toEqual({ type: 'text', words: 'Opening hours' });
  });

  it('takes a guest’s comment on a block through a view link’s cookie, with their name', async () => {
    const link = await createShare({ entry: page, mode: 'view', access: 'anyone', label: 'Board' }, null);
    const cookie = `site.share.${page}=${cookieValue(link)}`;
    const res = await post({ kind: 'entry', id: page, block: 't1', body: 'Say which days', name: 'Gina' }, cookie);
    expect(res.status).toBe(200);
    const { comment: c } = await res.json();
    expect(c).toMatchObject({ entry_id: page, block: 't1', block_type: 'text', quote: 'Opening hours are long', body: 'Say which days', author: 'Gina', link_id: link.id, author_id: null, status: 'open' });
    // A block only in the unpublished changes counts too.
    expect((await post({ kind: 'entry', id: page, block: 'h-draft', body: 'Shorter?', name: 'Gina' }, cookie)).status).toBe(200);
  });

  it('refuses a comment without a fitting cookie, from an edit or login link, on another page, or on a block that isn’t there', async () => {
    const view = await createShare({ entry: page, mode: 'view', access: 'anyone' }, null);
    const good = `site.share.${page}=${cookieValue(view)}`;
    expect((await post({ kind: 'entry', id: page, block: 't1', body: 'x', name: 'G' })).status).toBe(403);
    expect((await post({ kind: 'entry', id: page, block: 't1', body: 'x', name: 'G' }, `site.share.${page}=${cookieValue(view)}x`)).status).toBe(403);
    expect((await post({ kind: 'entry', id: other, block: '', body: 'x', name: 'G' }, good.replace(`.${page}=`, `.${other}=`))).status).toBe(403);
    const login = await createShare({ entry: page, mode: 'view', access: 'login' }, null);
    expect((await post({ kind: 'entry', id: page, body: 'x', name: 'G' }, `site.share.${page}=${cookieValue(login)}`)).status).toBe(403);
    expect((await post({ kind: 'entry', id: page, block: 'nope', body: 'x', name: 'G' }, good)).status).toBe(400);
    expect((await post({ kind: 'entry', id: page, block: 't1', body: 'x', name: '' }, good)).status).toBe(400);
    expect((await post({ kind: 'entry', id: page, block: 't1', body: '', name: 'G' }, good)).status).toBe(400);
  });

  it('limits how many comments one link takes an hour', async () => {
    const link = await createShare({ entry: page, mode: 'view', access: 'anyone' }, null);
    const rows = Array.from({ length: GUEST_COMMENTS_PER_HOUR }, () => ({ entry_id: page, link_id: link.id, body: 'x', author: 'G' }));
    await svc.from('share_comments').insert(rows);
    const r = await addComment({ subject: { kind: 'entry', id: page }, body: 'one more', name: 'G' }, { link });
    expect(r).toMatchObject({ ok: false, status: 429 });
  });

  it('keeps the hourly limit when many comments come at once', async () => {
    const link = await createShare({ entry: page, mode: 'view', access: 'anyone' }, null);
    const all = await Promise.all(Array.from({ length: GUEST_COMMENTS_PER_HOUR + 10 }, (_, i) => addComment({ subject: { kind: 'entry', id: page }, body: `c${i}`, name: 'G' }, { link })));
    expect(all.filter((r) => r.ok)).toHaveLength(GUEST_COMMENTS_PER_HOUR);
    const { count } = await svc.from('share_comments').select('id', { count: 'exact', head: true }).eq('link_id', link.id);
    expect(count).toBe(GUEST_COMMENTS_PER_HOUR);
  });

  it('lets an editor comment, list, resolve, reopen and delete', async () => {
    const locals = { db: sessionDb({ role: 'editor', uid: editorId }), user: { id: editorId, email: 'comment-editor@example.org', role: 'editor', name: 'Cora Editor' } };
    const call = (body: Record<string, any>) => manage({ request: new Request('https://x/api/admin/share-comments', { method: 'POST', body: JSON.stringify(body) }), locals } as any);
    const added = await call({ action: 'add', entry: page, block: 's1', body: 'Tighter spacing' });
    expect(added.status).toBe(200);
    const c = await added.json();
    expect(c).toMatchObject({ author: 'Cora Editor', author_id: editorId, link_id: null, block_type: 'section' });
    expect((await call({ action: 'resolve', id: c.id })).status).toBe(200);
    const rows = await (await list({ url: new URL(`https://x/api/admin/share-comments?entry=${page}`), locals } as any)).json();
    expect(rows.find((r: any) => r.id === c.id)).toMatchObject({ status: 'resolved', resolved_by_name: 'Cora Editor', guest: false });
    // Open ones come first.
    expect(rows[0].status).toBe('open');
    expect((await call({ action: 'reopen', id: c.id })).status).toBe(200);
    expect((await call({ action: 'delete', id: c.id })).status).toBe(200);
    expect((await commentsOf({ kind: 'entry', id: page })).some((r) => r.id === c.id)).toBe(false);
    // The guest role can't use the editors' API's data either way.
    expect((await sessionDb({ role: 'guest' }).from('share_comments').select('id')).data).toEqual([]);
  });
});

/** Mailing Lists on or off (settings.site.mailing.enabled), keeping the site's other settings. */
async function setMailing(enabled: boolean) {
  const { data } = await siteDb().from('settings').select('value').eq('key', 'site').maybeSingle();
  const value = (data?.value ?? {}) as Record<string, any>;
  await siteDb().from('settings').upsert({ key: 'site', value: { ...value, mailing: { ...(value.mailing ?? {}), enabled } } });
}

describe('newsletter drafts', async () => {
  const { POST: campaigns } = await import('../src/pages/api/admin/mailing/campaigns');
  const { POST: comment } = await import('../src/pages/api/share/comment');
  const svc = siteDb();
  const editorId = '00000000-0000-0000-0000-0000000000e1';
  const design = { root: { props: { preheader: 'Old line' } }, content: [{ type: 'Section', props: { id: 'Section-1', content: [{ type: 'Text', props: { id: 'Text-1', html: '<p>Hi there</p>' } }] } }] };
  let id = 0;
  beforeAll(async () => {
    await svc.from('users').insert({ id: editorId, email: 'news-editor@example.org', name: 'Nell Editor' });
    await svc.from('profiles').update({ display_name: 'Nell Editor', role: 'editor' }).eq('id', editorId);
    id = (await svc.from('campaigns').insert({ name: 'November news', subject: 'Hello', design, text: '', status: 'draft' }).select('id').single()).data!.id;
    await setMailing(true);
  });
  afterAll(async () => {
    await svc.from('campaigns').delete().eq('id', id);
    await svc.from('users').delete().eq('id', editorId);
  });

  it('a view link’s guest comments on a block of the email, by form from the share page', async () => {
    const link = await createShare({ campaign: id, mode: 'view', access: 'anyone' }, null);
    const form = new URLSearchParams({ kind: 'campaign', id: String(id), block: 'Text-1', body: 'Friendlier?', name: 'Gus', back: `/share/${link.token}/` });
    const res = await comment({ request: new Request('https://site.test/api/share/comment', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: `site.share.c${id}=${cookieValue(link)}` }, body: form }) } as any);
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(`/share/${link.token}/?commented=1#comments`);
    expect((await commentsOf({ kind: 'campaign', id }))[0]).toMatchObject({ block: 'Text-1', block_type: 'Text', quote: 'Hi there', author: 'Gus' });
    // A refusal goes back with a code, never words of the request's own.
    const bad = await comment({ request: new Request('https://site.test/api/share/comment', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: `site.share.c${id}=${cookieValue(link)}` }, body: new URLSearchParams({ kind: 'campaign', id: String(id), body: 'x', name: '', back: `/share/${link.token}/` }) }) } as any);
    expect(bad.headers.get('location')).toBe(`/share/${link.token}/?comment_error=name#comments`);
    expect(commentErrorText('name')).toMatch(/your name/);
    expect(commentErrorText('Your account is locked, sign in at evil.example')).toBe('');
    expect(commentErrorText('constructor')).toBe('');
    // A back address elsewhere isn't followed: the answer is JSON.
    const off = await comment({ request: new Request('https://site.test/api/share/comment', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: `site.share.c${id}=${cookieValue(link)}` }, body: new URLSearchParams({ kind: 'campaign', id: String(id), body: 'x', name: 'G', back: 'https://evil.example/' }) }) } as any);
    expect(off.headers.get('location')).toBeNull();
  });

  it('an editor’s save keeps a version with its author, and an unchanged save adds none', async () => {
    const save = (subject: string) =>
      campaigns({ request: new Request('http://x/api/admin/mailing/campaigns', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'save', id, campaign: { name: 'November news', subject, design, text: '' } }) }), locals: { db: sessionDb({ role: 'editor', uid: editorId }), user: { id: editorId, email: 'news-editor@example.org', role: 'editor', name: 'Nell Editor' } }, redirect: () => new Response(null) } as any);
    const count = async () => (await svc.from('campaign_revisions').select('id', { count: 'exact', head: true }).eq('campaign_id', id)).count;
    expect((await save('Editor subject')).status).toBe(200);
    const before = await count();
    expect((await save('Editor subject')).status).toBe(200);
    expect(await count()).toBe(before);
    const { data: rev } = await svc.from('campaign_revisions').select('subject, author_id, note').eq('campaign_id', id).order('id', { ascending: false }).limit(1).single();
    expect(rev).toEqual({ subject: 'Editor subject', author_id: editorId, note: null });
  });

  it('links for a newsletter are made only for drafts', async () => {
    const { POST: shares } = await import('../src/pages/api/admin/shares');
    const make = () => shares({ request: new Request('http://x/api/admin/shares', { method: 'POST', body: JSON.stringify({ action: 'create', campaign: id, mode: 'view', access: 'anyone' }) }), url: new URL('http://x/api/admin/shares'), locals: { db: sessionDb({ role: 'editor', uid: editorId }), user: { id: editorId } } } as any);
    expect((await make()).status).toBe(200);
    await svc.from('campaigns').update({ status: 'sent' }).eq('id', id);
    expect(await (await make()).text()).toMatch(/drafts/);
    await svc.from('campaigns').update({ status: 'draft' }).eq('id', id);
  });
});

describe('newsletter drafts: editors and links', async () => {
  const { POST: campaigns } = await import('../src/pages/api/admin/mailing/campaigns');
  const { stableJson } = await import('../src/lib/mailing/revisions');
  const svc = siteDb();
  const adminId = '00000000-0000-0000-0000-0000000000a9';
  const design = { root: { props: {} }, content: [{ type: 'Text', props: { id: 'Text-1', html: '<p>Hi</p>' } }] };
  let id = 0;
  beforeAll(async () => {
    await svc.from('users').insert({ id: adminId, email: 'news-admin@example.org', name: 'Ada Admin' });
    await svc.from('profiles').update({ display_name: 'Ada Admin', role: 'admin' }).eq('id', adminId);
    id = (await svc.from('campaigns').insert({ name: 'December news', subject: 'Hi', design, text: '', status: 'draft' }).select('id').single()).data!.id;
    await setMailing(true);
  });
  afterAll(async () => {
    await svc.from('campaigns').delete().eq('id', id);
    await svc.from('users').delete().eq('id', adminId);
  });
  const call = (body: Record<string, any>) =>
    campaigns({ request: new Request('http://x/api/admin/mailing/campaigns', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, ...body }) }), locals: { db: sessionDb({ role: 'admin', uid: adminId }), user: { id: adminId, email: 'news-admin@example.org', role: 'admin', name: 'Ada Admin' } }, redirect: () => new Response(null) } as any);
  const stamp = async () => (await svc.from('campaigns').select('updated_at').eq('id', id).single()).data!.updated_at;

  it('refuses an editor’s save based on a version someone else has saved over', async () => {
    const base = await stamp();
    await new Promise((r) => setTimeout(r, 5));
    await svc.from('campaigns').update({ subject: 'Guest subject' }).eq('id', id);
    const res = await call({ action: 'save', base, campaign: { name: 'December news', subject: 'Editor subject', design, text: '' } });
    expect(res.status).toBe(409);
    expect((await svc.from('campaigns').select('subject').eq('id', id).single()).data!.subject).toBe('Guest subject');
    expect((await call({ action: 'save', base: await stamp(), campaign: { name: 'December news', subject: 'Editor subject', design, text: '' } })).status).toBe(200);
  });

  it('adds no version for the same email with its keys in another order', async () => {
    const count = async () => (await svc.from('campaign_revisions').select('id', { count: 'exact', head: true }).eq('campaign_id', id)).count;
    const before = await count();
    const reordered = { content: [{ props: { html: '<p>Hi</p>', id: 'Text-1' }, type: 'Text' }], root: { props: {} } };
    expect((await call({ action: 'save', campaign: { name: 'December news', subject: 'Editor subject', design: reordered, text: '' } })).status).toBe(200);
    expect(await count()).toBe(before);
    expect(stableJson({ b: 1, a: [{ d: 2, c: 3 }] })).toBe(stableJson({ a: [{ c: 3, d: 2 }], b: 1 }));
  });

  it('a newsletter’s links stop while Mailing Lists is off', async () => {
    const link = await createShare({ campaign: id, mode: 'view', access: 'anyone' }, null);
    expect(await liveLink(link.token)).not.toBeNull();
    await setMailing(false);
    expect(await liveLink(link.token)).toBeNull();
    await setMailing(true);
    expect(await liveLink(link.token)).not.toBeNull();
  });

  it('cancelling turns its links off, so going back to a draft doesn’t bring them back', async () => {
    const link = await createShare({ campaign: id, mode: 'view', access: 'anyone' }, null);
    expect((await call({ action: 'cancel' })).status).toBe(200);
    await svc.from('campaigns').update({ status: 'draft' }).eq('id', id);
    expect(await liveLink(link.token)).toBeNull();
    expect((await svc.from('share_links').select('revoked_at').eq('id', link.id).single()).data!.revoked_at).not.toBeNull();
  });
});
