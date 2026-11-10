// Settings' sections, in the groups of its side menu, each at its own address (/admin/settings/<id>/).
// Safe in the browser: the screen (src/puck/SiteSettings.tsx) and its page both read it.

export interface SettingsSection {
  id: string;
  label: string;
  /** Other words it is found by in Settings' search, beside its label and its settings' labels. */
  keywords?: string;
}

export const SETTINGS_GROUPS: { label: string; sections: SettingsSection[] }[] = [
  {
    label: 'Site',
    sections: [
      { id: 'general', label: 'General', keywords: 'name tagline front page home page not found 404 icon favicon' },
      { id: 'menu', label: 'Menu', keywords: 'navigation links header' },
      { id: 'theme', label: 'Theme', keywords: 'appearance colors colours palette fonts sizes spacing logo admin look' },
      { id: 'social', label: 'Social', keywords: 'profiles share image share cards facebook instagram' },
      { id: 'search', label: 'Search' },
      { id: 'types', label: 'Types', keywords: 'content types templates listing pages featured seo fields' },
      { id: 'site', label: 'Site options' },
      { id: 'popups', label: 'Popups', keywords: 'cookie consent banner dialog' },
      { id: 'stats', label: 'Stats', keywords: 'statistics analytics cookie visitors' },
      { id: 'code', label: 'Code snippets', keywords: 'analytics scripts head tracking verification' },
    ],
  },
  {
    label: 'Features',
    sections: [
      { id: 'events', label: 'Events', keywords: 'calendar time zone timezone' },
      { id: 'tickets', label: 'Tickets', keywords: 'payments currency ticket emails reminder' },
      { id: 'members', label: 'Members', keywords: 'membership levels sign-ups' },
      { id: 'mailing-lists', label: 'Mailing Lists', keywords: 'newsletter email campaigns subscribers mailgun' },
      { id: 'shop', label: 'Shop', keywords: 'products shipping tax checkout orders stock discounts' },
      { id: 'donations', label: 'Donations', keywords: 'gifts fundraising goals receipts' },
    ],
  },
  { label: 'Services', sections: [{ id: 'connections', label: 'Connections', keywords: 'keys api key claude anthropic compose stripe square mailgun shippo webhooks' }] },
  {
    label: 'Admin',
    sections: [{ id: 'accessibility', label: 'Accessibility', keywords: 'a11y publish check' }],
  },
  {
    label: 'Upkeep',
    sections: [
      { id: 'redirects', label: 'Redirects', keywords: 'not found 404 moved addresses urls' },
      { id: 'email-log', label: 'Email log', keywords: 'mail sent' },
      { id: 'sync', label: 'Sync', keywords: 'copy production local' },
      { id: 'backups', label: 'Backups', keywords: 'snapshots restore' },
    ],
  },
];

export const SETTINGS_SECTIONS = SETTINGS_GROUPS.flatMap((g) => g.sections);

/** Sections that save as they go (their own buttons), with no use for Save settings. */
export const SAVES_AS_IT_GOES = new Set(['connections', 'redirects', 'sync', 'backups']);

/** Old names of sections (the admin's colors and logo are under Theme now). */
const RENAMED: Record<string, string> = { admin: 'theme', appearance: 'theme' };

export const settingsPath = (id: string) => (id === 'general' ? '/admin/settings/' : `/admin/settings/${id}/`);

/**
 * The section an address names: /admin/settings/<id>/, or a link from before sections had addresses
 * (/admin/settings/#<id>). Null for an address under Settings that names none; '' for Settings itself.
 */
export function sectionOf(pathname: string, hash = ''): string | null {
  const rest = pathname.replace(/^\/admin\/settings\/?/, '').replace(/\/+$/, '');
  const named = rest || hash.replace(/^#/, '');
  if (!named) return '';
  const id = RENAMED[named] ?? named;
  return SETTINGS_SECTIONS.some((s) => s.id === id) ? id : rest ? null : '';
}

/** A section's search keywords. */
export const keywordsOf = (id: string) => SETTINGS_SECTIONS.find((s) => s.id === id)?.keywords ?? '';

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/**
 * Settings' search: whether every word typed is found in the section's texts (its label, keywords and
 * the labels of its settings), ignoring case and accents. An empty search matches every section.
 */
export function sectionMatches(query: string, texts: string[]): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const hay = fold(texts.join(' '));
  return words.every((w) => hay.includes(w));
}
