// The command palette's places and matching (src/lib/admin/commands.ts), and Settings' search
// (sectionMatches in src/lib/admin/settings-sections.ts).
import { describe, expect, it } from 'vitest';
import { entryCommands, matchCommands, navCommands, settingsCommands } from '../src/lib/admin/commands';
import { siteDb } from '../src/lib/db/site';
import { adminNav } from '../src/lib/admin/nav';
import { sectionMatches } from '../src/lib/admin/settings-sections';

const nav = adminNav({ isAdmin: true, ticketsOn: false, mailOn: false, membersOn: false, types: [{ type: 'page', label: 'Pages' }, { type: 'post', label: 'Posts' }], composable: [{ type: 'page', singular: 'Page' }] });
const all = [...navCommands(nav), ...settingsCommands()];

describe('command palette', () => {
  it('lists every screen of the bar under its dropdown, and Settings for admins', () => {
    expect(navCommands(nav)).toContainEqual({ label: 'Pages', href: '/admin/?type=page', group: 'Content' });
    expect(navCommands(nav)).toContainEqual({ label: 'Media', href: '/admin/media/', group: 'Go to' });
    expect(settingsCommands()).toContainEqual(expect.objectContaining({ label: 'Theme', href: '/admin/settings/theme/', group: 'Settings' }));
  });

  it('matches every word in the label, group or keywords, labels starting with it first', () => {
    expect(matchCommands('media', all)[0].href).toBe('/admin/media/');
    expect(matchCommands('compose page', all).map((c) => c.href)).toEqual(['/admin/compose/?type=page']);
    expect(matchCommands('stripe', all).map((c) => c.label)).toEqual(['Connections']);
    expect(matchCommands('st', all)[0].label).toBe('Stats');
    expect(matchCommands('nothing like this', all)).toEqual([]);
    expect(matchCommands('', all, 3)).toHaveLength(3);
  });
});

describe('settings search', () => {
  it('finds a section by its label, keywords or settings, ignoring case and accents', () => {
    expect(sectionMatches('', ['Theme'])).toBe(true);
    expect(sectionMatches('THEME', ['Theme'])).toBe(true);
    expect(sectionMatches('font', ['Theme', 'colors fonts'])).toBe(true);
    expect(sectionMatches('cafe hours', ['General', 'Café opening hours'])).toBe(true);
    expect(sectionMatches('font shipping', ['Theme', 'fonts'])).toBe(false);
  });
});

describe('entries in the palette', () => {
  it('finds entries of the types shown by title, drafts marked and trash left out', async () => {
    const db = siteDb();
    await db.from('entries').insert([
      { type: 'page', slug: 'garden-tour', title: 'Garden tour', status: 'publish' },
      { type: 'page', slug: 'garden-draft', title: 'Garden plans', status: 'draft' },
      { type: 'page', slug: 'garden-old', title: 'Garden old', status: 'trash' },
      { type: 'post', slug: 'garden-post', title: 'Garden post', status: 'publish' },
    ]);
    const found = await entryCommands(db, 'garden', [{ type: 'page', label: 'Pages' }]);
    expect(found.map((c) => `${c.label} | ${c.group}`).sort()).toEqual(['Garden plans | Pages (draft)', 'Garden tour | Pages']);
    expect(found[0].href).toMatch(/^\/admin\/edit\/\d+\/$/);
    expect(await entryCommands(db, 'g', [{ type: 'page', label: 'Pages' }])).toEqual([]);
  });
});
