// A campaign's email as a sample subscriber would get it, rendered by the code that sends it: the email
// builder's Preview tab (/api/admin/mailing/preview) and a newsletter's share link (src/pages/share/).
import type { Db } from '../db/query';
import { emailEvents } from '../events/email';
import { emailEntries } from './entries';
import { loadMailing } from './contacts';
import { recipientValues, renderCampaign } from './render';

const fill = (s: string, v: Record<string, string>) => s.replace(/%recipient\.([a-z0-9_]+)%/gi, (_, k) => v[k] ?? '');

export interface CampaignPreview {
  to: string[];
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
}

/** `since`: what an Entries block set to "only new" lists from (default a week ago). */
export async function previewCampaign(db: Db, c: { id: number; design: any; text: string; subject: string; since?: string }, origin: string): Promise<CampaignPreview> {
  const since = c.since ?? new Date(Date.now() - 7 * 86_400_000).toISOString();
  const design = c.design?.content ? c.design : { root: { props: {} }, content: [] };
  const { name, settings } = await loadMailing(db);
  const [events, entries] = await Promise.all([emailEvents(db, design, origin), emailEntries(db, design, origin, since)]);
  const week = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const subject = String(c.subject ?? '').replace(/\{week_of\}/g, week).replace(/\{date\}/g, week);
  const r = renderCampaign({ campaignId: c.id || 0, subject, design, text: c.text, siteName: name, address: settings.address ?? '(your postal address, from Settings > Mailing Lists)', origin, events, entries, fields: settings.fields?.map((f) => f.key) });
  // A sample subscriber; each of the site's fields shows its name in brackets.
  const values = recipientValues(r.vars, { email: 'sam@example.com', first_name: 'Sam', last_name: 'Sample', attributes: Object.fromEntries((settings.fields ?? []).map((f) => [f.key, `[${f.label}]`])) }, { t: 'sample', ct: 'sample' });
  return { to: ['Sam Sample <sam@example.com>'], replyTo: settings.replyTo, subject: fill(r.subject, values), html: fill(r.html, values), text: fill(r.text, values) };
}
