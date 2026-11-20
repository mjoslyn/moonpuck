// Demo mode (src/lib/demo): what it refuses in visitors' saves, the keys and mail it keeps off, the blocks
// it renders without markup, Claude's and invitations' daily limits, and when it resets.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { blockedText, offensive, stringsOf, unsafeMarkup, wordHash } from '../src/lib/demo/content';
import { claudeAllowed, demoGuard, publishes, readableText } from '../src/lib/demo/guard';
import { nextReset, resetDue } from '../src/lib/demo';
import { scheduledDemoReset } from '../src/lib/demo/reset';
import { demoInvite } from '../src/lib/demo/invite';
import { env } from '../src/lib/env';
import { sendMail } from '../src/lib/forms/mail';
import { embed, html } from '../src/render/c/content';
import { siteDb } from '../src/lib/db/site';

// Accounts are signed with it (src/lib/auth).
process.env.AUTH_SECRET ??= 'test-secret-for-demo-invitations-0123456789';
const on = () => (process.env.DEMO_MODE = '1');
beforeEach(() => {
  delete process.env.DEMO_MODE;
  delete process.env.DEMO_CLAUDE_TURNS;
});
afterEach(() => {
  delete process.env.DEMO_MODE;
  delete process.env.DEMO_CLAUDE_TURNS;
});

describe('offensive words', () => {
  it('catches words however they are spelled', () => {
    for (const s of ['What the fuck', 'FUUUUCK', 'sh1t happens', 'you b!tch', 'Fucking hell', 'Ásshole']) expect(offensive(s), s).toBe(true);
  });
  it('leaves ordinary words alone, those containing a blocked word and near misses included', () => {
    for (const s of ['Scunthorpe', 'Nigeria', 'the pros and cons', 'Bobs Burgers', 'class assessment', 'a cocktail', 'Dickens', 'Analysis', 'Population 412. Gravity one sixth.']) expect(offensive(s), s).toBe(false);
  });
  it('keeps the words as hashes, not text', () => {
    expect(wordHash('fuck')).toMatch(/^[0-9a-f]{14}$/);
    expect(wordHash('a')).not.toBe(wordHash('b'));
  });
});

describe('markup that runs script', () => {
  it('is refused, however it is written', () => {
    for (const s of [
      '<script>alert(1)</script>',
      '<img src=x onerror=alert(1)>',
      '<svg/onload=alert(1)>',
      '<a href="jav&#x61;script:alert(1)">x</a>',
      '<a href="java\tscript:alert(1)">x</a>',
      '<iframe src="https://example.org"></iframe>',
      '<a href="data:text/html,<b>">x</a>',
      '<p srcdoc="x">',
    ]) expect(unsafeMarkup(s), s).toBe(true);
  });
  it('sees a handler after a > inside a quoted attribute, which does not end the tag', () => {
    expect(unsafeMarkup('<p><code><img alt=">" onerror="fetch(1)" src=x></code></p>')).toBe(true);
    expect(unsafeMarkup('<img alt=\'a>b\' onload=x()>')).toBe(true);
  });
  it('lets ordinary rich text through', () => {
    for (const s of ['<p><strong>Hi</strong> <a href="https://example.org" target="_blank" rel="noopener">there</a></p>', 'Turn it on=off', '<em>onwards</em>', 'var(--color-sky)']) expect(unsafeMarkup(s), s).toBe(false);
  });
  it('reads every string in a body, keys too', () => {
    expect(blockedText(stringsOf({ content: [{ props: { attrs: { content: '<p>Hello</p>' } } }] }))).toBeNull();
    expect(blockedText(stringsOf({ content: [{ props: { attrs: { content: '<img src=x onerror=alert(1)>' } } }] }))).toBe('markup');
    expect(blockedText(stringsOf({ title: 'Shit list' }))).toBe('words');
  });
});

describe('the guard', () => {
  const put = (body: unknown) => new Request('https://demo.example/api/admin/entries/3', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  it('refuses a visitor’s save with script or offensive words, and lets admins and clean saves through', async () => {
    const bad = await demoGuard(put({ action: 'draft', content: { content: [{ type: 'text', props: { attrs: { content: '<img src=x onerror=alert(1)>' } } }] } }), '/api/admin/entries/3', { id: 'u1', role: 'editor' });
    expect(bad?.status).toBe(422);
    expect(await bad!.text()).toMatch(/scripts/);
    expect(await demoGuard(put({ action: 'draft', entry: { title: 'Bullshit' } }), '/api/admin/entries/3', { id: 'u1', role: 'editor' })).not.toBeNull();
    expect(await demoGuard(put({ action: 'draft', entry: { title: 'Bullshit' } }), '/api/admin/entries/3', { id: 'u1', role: 'admin' })).toBeNull();
    expect(await demoGuard(put({ action: 'draft', entry: { title: 'Visiting the Moon' } }), '/api/admin/entries/3', { id: 'u1', role: 'editor' })).toBeNull();
  });
  it('reads the body whatever its Content-Type says, as the routes parse JSON regardless', async () => {
    const payload = JSON.stringify({ action: 'draft', content: { content: [{ type: 'text', props: { attrs: { content: '<img src=x onerror=alert(1)>' } } }] } });
    const editor = { id: 'u1', role: 'editor' };
    const as = (type: string, body: string, path = '/api/admin/entries/3', method = 'PUT') =>
      demoGuard(new Request(`https://demo.example${path}`, { method, headers: { 'content-type': type }, body }), path, editor);
    // A form type with a JSON body, which a form parser refuses to read.
    expect((await as('text/plain; form', payload))?.status).toBe(422);
    expect((await as('multipart/form-data', payload, '/api/admin/db', 'POST'))?.status).toBe(422);
    // JSON escapes that only the route's JSON parse turns back into markup.
    expect((await as('application/x-www-form-urlencoded', payload.replace(/</g, '\\u003c')))?.status).toBe(422);
    // Media routes other than the upload take JSON, and are read.
    expect((await as('multipart/form-data; boundary=x', JSON.stringify({ caption: '<svg onload=alert(1)>' }), '/api/admin/media/5'))?.status).toBe(422);
  });
  it('sends publishing and comments to the model, not drafts', () => {
    expect(publishes('PUT', '/api/admin/entries/3', [], { action: 'publish' })).toBe(true);
    expect(publishes('PUT', '/api/admin/entries/3', [], { action: 'draft', autosave: true })).toBe(false);
    expect(publishes('PUT', '/api/admin/templates', [], {})).toBe(true);
    expect(publishes('POST', '/api/share/comment', [], {})).toBe(true);
  });
  it('gives the model the words people read, not markup or code', () => {
    expect(readableText(['<p>Hello <b>moon</b></p>', 'var(--color-sky)', 'c-hero', 'https://example.org', 'Hello moon'])).toBe('Hello moon');
  });
  it('counts Claude’s answers per account a day', async () => {
    process.env.DEMO_CLAUDE_TURNS = '2';
    expect((await claudeAllowed('limit-1')).ok).toBe(true);
    expect((await claudeAllowed('limit-1')).ok).toBe(true);
    const third = await claudeAllowed('limit-1');
    expect(third.ok).toBe(false);
    expect((await claudeAllowed('limit-2')).ok).toBe(true);
    const asked = new Request('https://demo.example/api/admin/seo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    expect((await demoGuard(asked, '/api/admin/seo', { id: 'limit-1', role: 'editor' }))?.status).toBe(429);
  });
});

describe('what a demo keeps off', () => {
  it('reads no payment, carrier or Mailgun keys', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-x';
    expect(env('STRIPE_SECRET_KEY')).toBe('sk_test_x');
    on();
    expect(env('STRIPE_SECRET_KEY')).toBeUndefined();
    expect(env('ANTHROPIC_API_KEY')).toBe('sk-ant-x');
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });
  it('answers with Claude Haiku 5.5, Compose and quick asks alike', () => {
    process.env.ANTHROPIC_MODEL = 'claude-opus-5-5';
    expect(env('ANTHROPIC_MODEL')).toBe('claude-opus-5-5');
    on();
    expect(env('ANTHROPIC_MODEL')).toBe('claude-haiku-5-5');
    expect(env('ANTHROPIC_SEO_MODEL')).toBe('claude-haiku-5-5');
    delete process.env.ANTHROPIC_MODEL;
  });
  it('sends no email but account emails', async () => {
    on();
    expect(await sendMail({ to: ['someone@example.org'], subject: 'Form', html: '<p>Hi</p>', kind: 'form' })).toBe(false);
    const { data } = await siteDb().from('mail_log').select('status, via').eq('subject', 'Form');
    expect(data?.every((r) => r.status === 'not-sent')).toBe(true);
  });
  it('renders no HTML block markup, and an Embed block only as its link', () => {
    const b = (attrs: Record<string, unknown>) => ({ type: 'x', attrs, id: 'b' }) as any;
    expect(html(b({ html: '<b>hi</b>' }), {} as any, (() => '') as any)).toBe('<b>hi</b>');
    expect(embed(b({ html: '<iframe></iframe>', url: 'https://example.org/v' }), {} as any, (() => '') as any)).toContain('<iframe>');
    on();
    expect(html(b({ html: '<b>hi</b>' }), {} as any, (() => '') as any)).toBe('');
    const shown = embed(b({ html: '<iframe></iframe>', url: 'https://example.org/v' }), {} as any, (() => '') as any);
    expect(shown).not.toContain('<iframe>');
    expect(shown).toContain('href="https://example.org/v"');
  });
});

describe('invitations', () => {
  it('makes an editor’s account, and limits one address to 3 a day', async () => {
    on();
    const req = () => new Request('https://demo.example/api/demo/invite', { method: 'POST', headers: { 'cf-connecting-ip': '203.0.113.9' } });
    expect(await demoInvite('not an address', req(), 'https://demo.example')).toBe('bad');
    expect(await demoInvite('Visitor@Example.org', req(), 'https://demo.example')).toBe('sent');
    const { data: user } = await siteDb().from('users').select('id').eq('email', 'visitor@example.org').single();
    const { data: profile } = await siteDb().from('profiles').select('role').eq('id', user!.id).single();
    expect(profile?.role).toBe('editor');
    expect(await demoInvite('visitor@example.org', req(), 'https://demo.example')).toBe('sent');
    expect(await demoInvite('visitor@example.org', req(), 'https://demo.example')).toBe('sent');
    expect(await demoInvite('visitor@example.org', req(), 'https://demo.example')).toBe('limit');
  });
  it('sends nothing when the hidden field is filled in', async () => {
    on();
    expect(await demoInvite('bot@example.org', new Request('https://demo.example/'), 'https://demo.example', 'spam')).toBe('sent');
    const { data } = await siteDb().from('users').select('id').eq('email', 'bot@example.org');
    expect(data).toEqual([]);
  });
});

describe('resets', () => {
  it('fall on the hours dividing by the reset hours, in UTC', () => {
    expect(resetDue(new Date('2026-11-20T12:00:00Z'), 12)).toBe(true);
    expect(resetDue(new Date('2026-11-20T13:00:00Z'), 12)).toBe(false);
    expect(nextReset(new Date('2026-11-20T05:30:00Z'), 12).toISOString()).toBe('2026-11-20T12:00:00.000Z');
    expect(nextReset(new Date('2026-11-20T12:00:00Z'), 12).toISOString()).toBe('2026-11-21T00:00:00.000Z');
    expect(nextReset(new Date('2026-11-20T05:30:00Z'), 6).toISOString()).toBe('2026-11-20T06:00:00.000Z');
  });
  it('run only on a demo, when due', async () => {
    expect(await scheduledDemoReset(new Date('2026-11-20T12:00:00Z'))).toBe('not a demo');
    on();
    expect(await scheduledDemoReset(new Date('2026-11-20T13:00:00Z'))).toBe('demo reset not due');
  });
});
