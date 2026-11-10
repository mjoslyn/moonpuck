import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminOnlyIn, checkPlugins, emitEvent, navLinksOf, runJobOf, runSchedule, sitePlugins, type ServerPlugin } from '../src/lib/site/plugins';
import { adminNav, isGroup } from '../src/lib/admin/nav';
import { POLICIES, withSitePolicies } from '../src/lib/db/policies';
import { editors, readOnly } from '../src/lib/db/access';
import { copyPluginMigrations, isSiteMigration, siteTables, tablesMadeBy } from '../scripts/lib/site-migrations';

afterEach(() => vi.restoreAllMocks());

describe('plugins', () => {
  it("checks the site's list: names, repeats, admin-only paths", async () => {
    expect(() => checkPlugins([{ name: 'Square Sync' }])).toThrow(/lower case/);
    expect(() => checkPlugins([{ name: 'a' }, { name: 'a' }])).toThrow(/twice/);
    expect(() => checkPlugins([{ name: 'a', adminOnly: ['/shop/'] }])).toThrow(/outside/);
    expect(checkPlugins([{ name: 'square-sync', adminOnly: ['/admin/square-sync', '/api/admin/square-sync'] }])).toHaveLength(1);
    expect(await sitePlugins()).toEqual([]);
  });

  it('runs every plugin in a schedule slot, one failing not stopping the rest', async () => {
    const ran: string[] = [];
    const plugins: ServerPlugin[] = [
      { name: 'a', schedules: { hourly: async () => { ran.push('a'); throw new Error('down'); } } },
      { name: 'b', schedules: { hourly: async () => { ran.push('b'); return '3 items'; }, daily: async () => { ran.push('b daily'); } } },
      { name: 'c' },
    ];
    expect(await runSchedule(plugins, 'hourly')).toBe('a failed: down; b: 3 items');
    expect(ran).toEqual(['a', 'b']);
    expect(await runSchedule(plugins, 'daily')).toBe('b: done');
    expect(await runSchedule(plugins, 'every5Minutes')).toBe('');
  });

  it('tells every plugin of an event, a failing handler logged', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const got: unknown[] = [];
    const plugins: ServerPlugin[] = [
      { name: 'a', on: { shopOrderPaid: async () => { throw new Error('nope'); } } },
      { name: 'b', on: { shopOrderPaid: async (e) => { got.push(e); } } },
    ];
    await emitEvent(plugins, 'shopOrderPaid', { orderId: 7, stockTaken: true });
    expect(got).toEqual([{ orderId: 7, stockTaken: true }]);
    expect(error).toHaveBeenCalledWith('plugin a, shopOrderPaid: nope');
  });

  it("runs a plugin's job by name, refusing one that isn't there", async () => {
    const got: unknown[] = [];
    const plugins: ServerPlugin[] = [{ name: 'a', jobs: { sync: async (d) => { got.push(d); } } }];
    await runJobOf(plugins, 'a', 'sync', { full: true });
    expect(got).toEqual([{ full: true }]);
    await expect(runJobOf(plugins, 'a', 'other', null)).rejects.toThrow(/no job other/);
    await expect(runJobOf(plugins, 'b', 'sync', null)).rejects.toThrow(/plugin b/);
  });

  it('adds links to the admin bar: in a group, a new one or on their own; admins only and while on', () => {
    const plugins: ServerPlugin[] = [
      {
        name: 'a',
        nav: [
          { href: '/admin/square-sync/', label: 'Square', group: 'Shop', admins: true },
          { href: '/admin/a/', label: 'Reports', group: 'Reports', when: (site) => !!site?.reports },
          { href: '/admin/b/', label: 'Bookings' },
        ],
      },
    ];
    expect(navLinksOf(plugins, { isAdmin: false, site: {} })).toEqual([{ href: '/admin/b/', label: 'Bookings' }]);
    const links = navLinksOf(plugins, { isAdmin: true, site: { reports: true } });
    const nav = adminNav({ isAdmin: true, ticketsOn: false, mailOn: false, membersOn: false, shopOn: true, plugins: links, types: [], composable: [] });
    const labels = nav.map((n) => (isGroup(n) ? `${n.label}: ${n.items.map((i) => i.label).join(', ')}` : n.label));
    expect(labels.slice(-4)).toEqual(['Users', 'Shop: Orders, Discounts, Stock, Stats, Square', 'Reports', 'Bookings']);
  });

  it("guards the plugins' admin-only paths", () => {
    const plugins: ServerPlugin[] = [{ name: 'a', adminOnly: ['/api/admin/square-sync'] }];
    expect(adminOnlyIn(plugins, '/api/admin/square-sync/run')).toBe(true);
    expect(adminOnlyIn(plugins, '/api/admin/media')).toBe(false);
  });

  it("takes the site's table policies, never over a core table's", () => {
    const mine = readOnly(editors);
    const merged = withSitePolicies(POLICIES, { square_items: mine, entries: readOnly(() => false) });
    expect(merged.square_items).toBe(mine);
    expect(merged.entries).toBe(POLICIES.entries);
  });
});

describe('site migrations', () => {
  it("tells the site's from the core's, and finds the tables they make", () => {
    expect(isSiteMigration('20261201000000_site_square_items.sql')).toBe(true);
    expect(isSiteMigration('20261028200000_site_keys.sql')).toBe(false);
    expect(isSiteMigration('20261201000000_shop_orders.sql')).toBe(false);
    expect(tablesMadeBy('-- create table nope\nCREATE TABLE IF NOT EXISTS "square_items" (id INTEGER);\ncreate table square_runs(id INTEGER);')).toEqual(['square_items', 'square_runs']);
    expect(siteTables('db/migrations').size).toBe(0);
  });

  it("copies plugins' migrations once, keeping one already there and refusing a core-looking name", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plugins-'));
    const dir = path.join(root, 'db');
    const mig = path.join(root, 'plugins', 'square-sync', 'migrations');
    fs.mkdirSync(dir);
    fs.mkdirSync(mig, { recursive: true });
    fs.writeFileSync(path.join(mig, '20261201000000_site_square_items.sql'), 'create table square_items (id INTEGER);');
    expect(copyPluginMigrations(path.join(root, 'plugins'), dir)).toEqual({ copied: ['20261201000000_site_square_items.sql'], changed: [] });
    expect(copyPluginMigrations(path.join(root, 'plugins'), dir)).toEqual({ copied: [], changed: [] });
    fs.writeFileSync(path.join(mig, '20261201000000_site_square_items.sql'), 'create table square_items (id INTEGER, sku TEXT);');
    expect(copyPluginMigrations(path.join(root, 'plugins'), dir).changed).toEqual(['20261201000000_site_square_items.sql']);
    expect(fs.readFileSync(path.join(dir, '20261201000000_site_square_items.sql'), 'utf8')).toBe('create table square_items (id INTEGER);');
    fs.writeFileSync(path.join(mig, '20261202000000_shop_orders.sql'), '');
    expect(() => copyPluginMigrations(path.join(root, 'plugins'), dir)).toThrow(/named/);
    expect(copyPluginMigrations(path.join(root, 'none'), dir)).toEqual({ copied: [], changed: [] });
  });
});
