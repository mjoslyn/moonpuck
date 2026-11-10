// The first admin (src/lib/admin/first-run.ts), starter content (src/lib/admin/seed.ts) and the env file
// npm run setup writes (scripts/lib/setup-env.ts).
import { afterEach, describe, expect, it } from 'vitest';
import { firstAdminProblem, needsFirstAdmin, setupCodeMatches, setupCodeNeeded } from '../src/lib/admin/first-run';
import { ensureEventTemplates, hasNoTemplates, seedSite } from '../src/lib/admin/seed';
import { siteDb } from '../src/lib/db/site';
import { withAuthSecret } from '../scripts/lib/setup-env';

describe('the first admin', () => {
  afterEach(() => {
    delete process.env.SETUP_CODE;
    delete process.env.AUTH_SECRET;
  });

  it('is needed until a profile is an admin', async () => {
    expect(await needsFirstAdmin()).toBe(true);
    const id = crypto.randomUUID();
    await siteDb().from('users').insert({ id, email: 'first@example.org', name: 'First' });
    await siteDb().from('profiles').insert({ id, role: 'editor' });
    expect(await needsFirstAdmin()).toBe(true);
    await siteDb().from('profiles').update({ role: 'admin' }).eq('id', id);
    expect(await needsFirstAdmin()).toBe(false);
    await siteDb().from('users').delete().eq('id', id);
  });

  it('asks for the setup code everywhere but astro dev', () => {
    expect(setupCodeNeeded(true)).toBe(false);
    expect(setupCodeNeeded(false)).toBe(true);
  });

  it('takes SETUP_CODE, else AUTH_SECRET, and nothing without either', () => {
    expect(setupCodeMatches('anything')).toBe(false);
    expect(setupCodeMatches('')).toBe(false);
    process.env.AUTH_SECRET = 'the-auth-secret';
    expect(setupCodeMatches(' the-auth-secret ')).toBe(true);
    process.env.SETUP_CODE = 'the-setup-code';
    expect(setupCodeMatches('the-auth-secret')).toBe(false);
    expect(setupCodeMatches('the-setup-code')).toBe(true);
  });

  it('checks the form', () => {
    process.env.AUTH_SECRET = 'the-auth-secret';
    const ok = { email: 'a@example.org', password: 'long enough!', code: 'the-auth-secret' };
    expect(firstAdminProblem(ok, true)).toBeNull();
    expect(firstAdminProblem({ ...ok, email: 'nope' }, true)).toMatch(/email/);
    expect(firstAdminProblem({ ...ok, password: 'short' }, true)).toMatch(/10 characters/);
    expect(firstAdminProblem({ ...ok, code: 'wrong' }, true)).toMatch(/setup code/);
    expect(firstAdminProblem({ ...ok, code: '' }, false)).toBeNull();
  });
});

describe('starter content', () => {
  it('adds the templates, pages and front page once', async () => {
    const db = siteDb();
    expect(await hasNoTemplates(db)).toBe(true);
    await seedSite(db);
    expect(await hasNoTemplates(db)).toBe(false);
    const { data: templates } = await db.from('templates').select('kind, slug');
    expect(templates!.map((t) => `${t.kind}:${t.slug}`).sort()).toEqual(['part:footer', 'part:header', 'template:index', 'template:page', 'template:search', 'template:single']);
    const lines: string[] = [];
    await seedSite(db, (l) => lines.push(l));
    expect(lines.filter((l) => l.endsWith(': added'))).toEqual([]);
    const { data: home } = await db.from('entries').select('id').eq('slug', 'home').single();
    const { data: settings } = await db.from('settings').select('value').eq('key', 'site').single();
    expect(settings!.value.front_page_id).toBe(home!.id);
  });

  it('makes the event templates once, keeping one already there', async () => {
    const db = siteDb();
    await db.from('templates').insert({ kind: 'template', slug: 'single-event', title: 'Mine', content: { root: { props: {} }, content: [], zones: {} } });
    expect(await ensureEventTemplates(db)).toEqual(['archive-events']);
    expect(await ensureEventTemplates(db)).toEqual([]);
    const { data } = await db.from('templates').select('title').eq('slug', 'single-event').single();
    expect(data!.title).toBe('Mine');
  });
});

describe('npm run setup', () => {
  it('fills an empty or missing AUTH_SECRET and keeps one that is set', () => {
    expect(withAuthSecret('A=1\nAUTH_SECRET=\nB=2\n', 'new')).toBe('A=1\nAUTH_SECRET=new\nB=2\n');
    expect(withAuthSecret('AUTH_SECRET=""\n', 'new')).toBe('AUTH_SECRET=new\n');
    expect(withAuthSecret('AUTH_SECRET=old\n', 'new')).toBe('AUTH_SECRET=old\n');
    expect(withAuthSecret('A=1', 'new')).toBe('A=1\nAUTH_SECRET=new\n');
  });
});
