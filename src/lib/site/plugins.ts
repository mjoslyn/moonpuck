// Plugins (server only): features a site installs in src/site/plugins/<name>/ and lists in its
// src/site/server.ts. This file is the core's side: the hooks a plugin's server part can use (scheduled
// runs, background jobs, shop events, admin menu links, admin-only paths) and the functions the core
// calls to run them. A plugin's blocks, editor panels and table policies are wired in by the site's
// render.ts, editor.tsx and db.ts like the site's own (see CORE.md, Plugins).
//
// The site's list is imported only when a hook runs (`sitePlugins`), never at module load, so plugin
// code can import any core module (the shop's orders, the database) without an import cycle. Each hook
// runs on its own: one that throws is logged and the core, and every other plugin, carries on.
import type { NavLink } from '../admin/nav';
import { enqueue } from '../jobs';
import { afterAnswer } from '../platform';

/** The scheduled runs a plugin can join: every 5 minutes, hourly, and daily at 07:00 UTC. */
export type ScheduleSlot = 'every5Minutes' | 'hourly' | 'daily';

/** What the core tells plugins, and what each event carries. */
export interface PluginEvents {
  /** A shop order was paid (once per order). `stockTaken`: its counted lines were just taken off `shop_stock`. */
  shopOrderPaid: { orderId: number; stockTaken: boolean };
  /** Lines of a shop order were put back in stock: what went back, by line index. */
  shopOrderRestocked: { orderId: number; lines: Record<string, number> };
}
export type PluginEvent = keyof PluginEvents;

/** A link a plugin adds to the admin bar. */
export interface PluginNavLink {
  href: string;
  label: string;
  /** The dropdown it goes in (an existing one, such as `Shop` or `People`, or a new one); none: a link of its own. */
  group?: string;
  /** Shown to admins only (guard the address with `adminOnly` too). */
  admins?: boolean;
  /** Shown only while this holds, given the site settings (`settings.site`). */
  when?: (site: Record<string, any> | null | undefined) => boolean;
}

/** A plugin's server part. */
export interface ServerPlugin {
  /** Unique, lower case letters, digits and dashes ("square-sync"). */
  name: string;
  /** Work joined to the Worker's scheduled runs; the answer (if any) is logged. */
  schedules?: Partial<Record<ScheduleSlot, () => Promise<string | void>>>;
  /** Background jobs by name, started with `startPluginJob`; each gets up to 15 minutes on the jobs queue. */
  jobs?: Record<string, (data: any) => Promise<void>>;
  /** Handlers for the core's events, run after the core's own work and after the answer. */
  on?: { [K in PluginEvent]?: (e: PluginEvents[K]) => Promise<void> };
  /** Links in the admin bar. */
  nav?: PluginNavLink[];
  /** Admin address prefixes only admins may open (`/admin/square-sync`, `/api/admin/square-sync`). */
  adminOnly?: string[];
}

export interface SiteServer {
  plugins: ServerPlugin[];
}

export const definePlugin = (p: ServerPlugin): ServerPlugin => p;
export const defineServer = (s: SiteServer): SiteServer => s;

const NAME = /^[a-z][a-z0-9-]{0,39}$/;

/** The plugins as listed, or an error naming what is wrong (a bad or repeated name, an admin path outside /admin or /api/admin). */
export function checkPlugins(plugins: ServerPlugin[]): ServerPlugin[] {
  const seen = new Set<string>();
  for (const p of plugins) {
    if (!NAME.test(p.name)) throw new Error(`plugin name "${p.name}": use lower case letters, digits and dashes`);
    if (seen.has(p.name)) throw new Error(`plugin "${p.name}" is listed twice`);
    seen.add(p.name);
    for (const path of p.adminOnly ?? []) if (!/^\/(admin|api\/admin)\//.test(path)) throw new Error(`plugin "${p.name}": admin-only path ${path} is outside /admin/ and /api/admin/`);
  }
  return plugins;
}

/** The scheduled work of every plugin in `slot`, one after another; a failure is reported and the rest run. */
export async function runSchedule(plugins: ServerPlugin[], slot: ScheduleSlot): Promise<string> {
  const out: string[] = [];
  for (const p of plugins) {
    const run = p.schedules?.[slot];
    if (!run) continue;
    out.push(await run().then((r) => `${p.name}: ${r || 'done'}`, (e: Error) => `${p.name} failed: ${e?.message ?? e}`));
  }
  return out.join('; ');
}

/** Tell every plugin of an event; a handler that throws is logged and the others still run. */
export async function emitEvent<K extends PluginEvent>(plugins: ServerPlugin[], event: K, payload: PluginEvents[K]): Promise<void> {
  for (const p of plugins) {
    const handler = p.on?.[event] as ((e: PluginEvents[K]) => Promise<void>) | undefined;
    if (!handler) continue;
    await handler(payload).catch((e: Error) => console.error(`plugin ${p.name}, ${event}: ${e?.message ?? e}`));
  }
}

/** Run a plugin's job. Throws when the plugin or job isn't there (a message left from a plugin since removed). */
export async function runJobOf(plugins: ServerPlugin[], plugin: string, job: string, data: unknown): Promise<void> {
  const run = plugins.find((p) => p.name === plugin)?.jobs?.[job];
  if (!run) throw new Error(`no job ${job} in plugin ${plugin}`);
  await run(data);
}

/** The plugins' admin bar links this person sees, with the dropdown each goes in. */
export function navLinksOf(plugins: ServerPlugin[], o: { isAdmin: boolean; site: Record<string, any> | null | undefined }): (NavLink & { group?: string })[] {
  return plugins.flatMap((p) => (p.nav ?? []).filter((l) => (o.isAdmin || !l.admins) && (!l.when || l.when(o.site))).map(({ href, label, group }) => ({ href, label, ...(group ? { group } : {}) })));
}

/** Whether a path is one only admins may open, by the plugins' `adminOnly` prefixes. */
export const adminOnlyIn = (plugins: ServerPlugin[], path: string) => plugins.some((p) => (p.adminOnly ?? []).some((prefix) => path.startsWith(prefix)));

// ---- The site's plugins ------------------------------------------------------------------------

let loaded: ServerPlugin[] | undefined;

/** The plugins the site lists in src/site/server.ts, checked once. */
export async function sitePlugins(): Promise<ServerPlugin[]> {
  return (loaded ??= checkPlugins((await import('../../site/server')).default.plugins ?? []));
}

/** The site's plugins' scheduled work in `slot`. */
export const runPluginSchedule = async (slot: ScheduleSlot) => runSchedule(await sitePlugins(), slot);

/** Tell the site's plugins of an event, after the answer (a plugin's slow call never holds up a checkout or webhook). */
export function emitPluginEvent<K extends PluginEvent>(event: K, payload: PluginEvents[K]): void {
  afterAnswer(sitePlugins().then((plugins) => emitEvent(plugins, event, payload)));
}

/** Run one of the site's plugins' jobs (the jobs queue's consumer, src/worker.ts). */
export const runPluginJob = async (plugin: string, job: string, data: unknown) => runJobOf(await sitePlugins(), plugin, job, data);

/** Start a plugin's job: on the jobs queue, else (no queue: scripts, astro dev without one) after the answer. */
export async function startPluginJob(plugin: string, job: string, data?: unknown): Promise<void> {
  if (await enqueue({ kind: 'plugin', plugin, job, data })) return;
  afterAnswer(runPluginJob(plugin, job, data));
}
