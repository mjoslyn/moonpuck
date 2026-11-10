// The command palette's answers (src/lib/admin/commands.ts): the admin's screens, Settings' sections
// (admins) and entries found by title, for `q`. The admin's palette (src/admin/CommandPalette.tsx) asks it
// for entries; the one on the site's own pages (public/assets/js/editor-bar.js) for everything.
import type { APIRoute } from 'astro';
import { adminNavFor } from '../../../lib/admin/nav-for';
import { entryCommands, matchCommands, navCommands, settingsCommands } from '../../../lib/admin/commands';

export const GET: APIRoute = async ({ locals, url }) => {
  const q = (url.searchParams.get('q') ?? '').slice(0, 100);
  const only = url.searchParams.get('only');
  const isAdmin = locals.user.role === 'admin';
  const { nav, types } = await adminNavFor(locals.db, isAdmin);
  const screens = only === 'entries' ? [] : matchCommands(q, [...navCommands(nav), ...(isAdmin ? settingsCommands() : [])]);
  const entries = await entryCommands(locals.db, q, types);
  return Response.json({ commands: [...screens, ...entries] }, { headers: { 'Cache-Control': 'private, no-store' } });
};
