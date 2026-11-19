// Server-side reads for share links' guests (src/lib/share/links.ts), as the server: the guest role reads
// only what its editor needs, so what the page renders with besides (forms, totals, lists, stock) and the
// page's full settings come from here.
import { siteDb } from '../db/site';
import { Loader, PUBLIC_SCOPE } from '../data';
import { taxonomiesOf } from '../site';
import { mediaUrl } from '../media/image';
import { donationSettings } from '../donations/config';
import { goalTotals } from '../donations/totals';
import { loadStock } from '../shop/stock';
import { mailingOn } from '../mailing/config';

/**
 * The page's settings as the editor's form holds them (Editor.tsx): the base a guest's changes go on when
 * a published page has no unpublished changes kept aside, so an editor opening the guest's draft finds its
 * template, tags, terms and featured image as they were.
 */
export async function entryState(id: number): Promise<Record<string, any> | null> {
  const db = siteDb();
  const { data: e } = await db.from('entries').select('id, type, title, slug, status, excerpt, template, featured_media_id, fields, event_start, event_end, event_all_day').eq('id', id).maybeSingle();
  if (!e) return null;
  const [{ data: links }, { data: media }] = await Promise.all([
    db.from('entry_terms').select('term_id').eq('entry_id', id),
    e.featured_media_id ? db.from('media').select('id, path').eq('id', e.featured_media_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const ids = (links ?? []).map((l: any) => l.term_id as number);
  const { data: terms } = ids.length ? await db.from('terms').select('id, taxonomy, name').in('id', ids) : { data: [] };
  const all = (terms ?? []) as { id: number; taxonomy: string; name: string }[];
  return {
    title: e.title,
    slug: e.slug,
    status: e.status === 'trash' ? 'draft' : e.status,
    excerpt: e.excerpt ?? '',
    template: e.template,
    featured_image: media ? mediaUrl(media.path) : null,
    featured_media_id: media?.id ?? null,
    fields: e.fields ?? {},
    event_start: e.event_start,
    event_end: e.event_end,
    event_all_day: !!e.event_all_day || e.fields?.all_day === true,
    tags: all.filter((t) => t.taxonomy === 'tag').map((t) => t.name),
    terms: Object.fromEntries(taxonomiesOf(e.type).map((tax) => [tax, ids.filter((tid) => all.find((t) => t.id === tid)?.taxonomy === tax)])),
  };
}

/** What a guest's editor canvas renders with that the guest role can't read: active forms (definitions
 * only), fundraising goals' totals, public mailing lists, products' stock. */
export async function guestCanvasData() {
  const db = siteDb();
  const loader = new Loader(db, undefined, PUBLIC_SCOPE);
  const settings = await loader.settings();
  // Definitions only: a form's notifications are a column of their own, which Loader.forms leaves out.
  const forms = await loader.forms();
  const goals = donationSettings(settings.site).goals;
  const { data: lists } = mailingOn(settings.site) ? await db.from('mail_lists').select('*').eq('public', true).order('sort').order('id') : { data: [] };
  const { data: products } = await db.from('entries').select('id').eq('type', 'product').eq('status', 'publish');
  const stock = await loadStock(db, (products ?? []).map((p: any) => p.id as number));
  return { forms, goals: goals.length ? await goalTotals(db, goals).catch(() => ({})) : {}, lists: lists ?? [], stock: [...stock] };
}
