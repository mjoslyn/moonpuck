// A campaign's saved versions (table campaign_revisions): one per save that changed its name, subject,
// email or plain text, by an editor (the campaigns API) or a share link's guest (src/lib/share). The newest
// KEEP_VERSIONS are kept. Written as the server; editors read them on the campaign's screen.
import type { Db } from '../db/query';

/** The most versions kept per campaign. */
export const KEEP_VERSIONS = 100;

export interface CampaignVersion {
  name: string;
  subject: string;
  design: unknown;
  text: string;
}

/** JSON with every object's keys in order: the database gives back a design's keys in its own order. */
export function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v as object).filter((k) => (v as Record<string, unknown>)[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stableJson((v as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}

const sameVersion = (a: CampaignVersion, b: CampaignVersion) => a.name === b.name && a.subject === b.subject && a.text === b.text && stableJson(a.design) === stableJson(b.design);

/** Keep a version of a campaign, unless it is the same as the last one kept; then drop those past KEEP_VERSIONS. */
export async function recordCampaignRevision(db: Db, campaignId: number, v: CampaignVersion, by: { author: string | null; note?: string | null }): Promise<{ error: { message: string } | null }> {
  const { data: last } = await db.from('campaign_revisions').select('name, subject, design, text').eq('campaign_id', campaignId).order('id', { ascending: false }).limit(1).maybeSingle();
  if (last && sameVersion(last as CampaignVersion, v)) return { error: null };
  const { error } = await db.from('campaign_revisions').insert({ campaign_id: campaignId, name: v.name, subject: v.subject, design: v.design ?? null, text: v.text, author_id: by.author || null, note: by.note ?? null });
  if (error) return { error };
  const { data: old } = await db.from('campaign_revisions').select('id').eq('campaign_id', campaignId).order('id', { ascending: false }).range(KEEP_VERSIONS, KEEP_VERSIONS + 500);
  if (old?.length) await db.from('campaign_revisions').delete().in('id', old.map((r: { id: number }) => r.id));
  return { error: null };
}
