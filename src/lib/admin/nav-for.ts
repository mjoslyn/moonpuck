// The admin bar's menu for a signed-in person, as the admin layout (src/layouts/Admin.astro) shows it and
// the command palette's endpoint (/api/admin/commands) lists it: content types shown, features on, the
// site's plugins' links, admin screens to admins. Server only.
import type { Db } from '../db/query';
import { COMPOSABLE_TYPES, CONTENT_TYPES } from '../site';
import { memberSettings } from '../members/config';
import { eventsOn } from '../events/on';
import { featuresOf, showsType } from '../features';
import { mailingOn } from '../mailing/config';
import { donationsOn } from '../donations/config';
import { adminNav } from './nav';
import { navLinksOf, sitePlugins } from '../site/plugins';

export async function adminNavFor(db: Db, isAdmin: boolean) {
  const siteSettings = (await db.from('settings').select('value').eq('key', 'site').maybeSingle()).data?.value;
  const features = featuresOf(siteSettings);
  const types = CONTENT_TYPES.filter((c) => showsType(c.type, features)).map((c) => ({ type: c.type, label: c.label }));
  const composable = COMPOSABLE_TYPES.filter((c) => showsType(c.type, features)).map((c) => ({ type: c.type, singular: c.singular }));
  const plugins = navLinksOf(await sitePlugins(), { isAdmin, site: siteSettings });
  const nav = adminNav({ isAdmin, ticketsOn: eventsOn(siteSettings), mailOn: mailingOn(siteSettings), membersOn: isAdmin && !!memberSettings(siteSettings).enabled, shopOn: features.shop, donationsOn: donationsOn(siteSettings), plugins, types, composable });
  return { nav, types, siteSettings };
}
