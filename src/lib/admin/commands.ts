// The command palette's places (Ctrl+K or ⌘K: src/admin/CommandPalette.tsx on admin screens, the editor
// bar's on the site's pages, public/assets/js/editor-bar.js): every screen of the admin bar (`adminNav`),
// Settings' sections for admins, and the entries found by title (`entryCommands`, through
// GET /api/admin/commands). Safe in the browser but for `entryCommands`, which takes a Db.
import type { Db } from '../db/query';
import { isGroup, type NavItem } from './nav';
import { SETTINGS_SECTIONS, keywordsOf, settingsPath } from './settings-sections';

export interface Command {
  label: string;
  href: string;
  /** Where it is (Content, Compose, Settings...), shown beside it and searched with it. */
  group: string;
  /** Other words it is found by. */
  keywords?: string;
}

/** The admin bar's screens, each under its dropdown's name (links of their own under "Go to"). */
export function navCommands(nav: NavItem[]): Command[] {
  return nav.flatMap((n) => (isGroup(n) ? n.items.map((i) => ({ label: i.label, href: i.href, group: n.label })) : [{ label: n.label, href: n.href, group: 'Go to' }]));
}

/** Settings' sections (admins). */
export const settingsCommands = (): Command[] => SETTINGS_SECTIONS.map((s) => ({ label: s.label, href: settingsPath(s.id), group: 'Settings', keywords: keywordsOf(s.id) }));

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * The commands with every word typed in their label, group or keywords, best first: a label starting with
 * what was typed, then one with a word starting with it, then the rest, each in their own order. Nothing
 * typed: all of them, as they are.
 */
export function matchCommands(query: string, commands: Command[], limit = 8): Command[] {
  const q = fold(query.trim());
  if (!q) return commands.slice(0, limit);
  const words = q.split(/\s+/);
  const rank = (c: Command) => {
    const label = fold(c.label);
    return label.startsWith(q) ? 0 : label.split(/\s+/).some((w) => w.startsWith(words[0])) ? 1 : 2;
  };
  return commands
    .filter((c) => {
      const hay = fold(`${c.label} ${c.group} ${c.keywords ?? ''}`);
      return words.every((w) => hay.includes(w));
    })
    .map((c, i) => ({ c, i, r: rank(c) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.c);
}

/** Entries of the types shown whose title has what was typed (two characters at least), latest edited first. */
export async function entryCommands(db: Db, query: string, types: { type: string; label: string }[], limit = 6): Promise<Command[]> {
  const term = query.trim();
  if (term.length < 2 || !types.length) return [];
  const label = new Map(types.map((t) => [t.type, t.label]));
  const { data } = await db.from('entries').select('id, title, type, status').in('type', [...label.keys()]).in('status', ['publish', 'draft', 'future', 'private']).ilike('title', `%${term}%`).order('updated_at', { ascending: false }).limit(limit);
  return ((data ?? []) as { id: number; title: string; type: string; status: string }[]).map((e) => ({
    label: e.title || '(untitled)',
    href: `/admin/edit/${e.id}/`,
    group: `${label.get(e.type) ?? e.type}${e.status === 'publish' ? '' : ' (draft)'}`,
  }));
}
