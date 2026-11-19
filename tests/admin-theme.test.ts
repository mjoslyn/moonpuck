// The admin screens' look (src/lib/admin-theme.ts): matched to the site's theme unless they have their own.
import { describe, expect, it } from 'vitest';
import { adminThemeFrom, effectiveAdminTheme, matchedAdminTheme } from '../src/lib/admin-theme';
import { cleanTheme } from '../src/lib/theme/theme';

const theme = cleanTheme({
  colors: [
    { slug: 'ink', name: 'Ink', color: '#0d0f12', dark: true },
    { slug: 'blue', name: 'Blue', color: '#1f5fa8' },
    { slug: 'sky', name: 'Sky', color: '#9cc6ee' },
  ],
  roles: { accent: 'blue', dark: 'ink' },
  logo: 7,
  logo_url: '/media/logo.png',
})!;

describe('admin screens', () => {
  it("take the site's accent, dark color and logo", () => {
    expect(matchedAdminTheme(theme)).toEqual({ accent: '#1f5fa8', bar: '#0d0f12', logo: 7, logo_url: '/media/logo.png' });
  });

  it('leave out an accent white text would be hard to read on', () => {
    expect(matchedAdminTheme({ ...theme, roles: { accent: 'sky' } }).accent).toBeUndefined();
  });

  it('use their own look once an admin gives them one, even all defaults', () => {
    expect(effectiveAdminTheme({ theme, admin_theme: { own: true, accent: '#123456' } })).toEqual({ own: true, accent: '#123456' });
    expect(effectiveAdminTheme({ theme, admin_theme: { own: true } })).toEqual({ own: true });
    expect(effectiveAdminTheme({ theme })?.accent).toBe('#1f5fa8');
  });

  it('keep a look saved before matching as their own', () => {
    expect(adminThemeFrom({ accent: '#123456' })).toEqual({ accent: '#123456' });
    expect(effectiveAdminTheme({ theme, admin_theme: { accent: '#123456' } })?.accent).toBe('#123456');
  });
});

describe('admin pages', () => {
  it("link the site icon in the browser tab, and nothing without one", async () => {
    const { siteDb } = await import('../src/lib/db/site');
    const { adminIconLinks, loadAdminTheme } = await import('../src/lib/admin-theme');
    const db = siteDb();
    await db.from('settings').upsert({ key: 'site', value: { name: 'S' } });
    await loadAdminTheme(db, true);
    expect(await adminIconLinks(db)).toBe('');
    await db.from('settings').upsert({ key: 'site', value: { name: 'S', icons: { '32': '/media/site-icon/9-32.png?v=a', '180': '/media/site-icon/9-180.png?v=a', '192': '/media/site-icon/9-192.png?v=a' } } });
    await loadAdminTheme(db, true);
    const links = await adminIconLinks(db);
    expect(links).toContain('<link rel="icon" href="/media/site-icon/9-32.png?v=a" sizes="32x32" />');
    expect(links).toContain('<link rel="apple-touch-icon" href="/media/site-icon/9-180.png?v=a" />');
  });
});
