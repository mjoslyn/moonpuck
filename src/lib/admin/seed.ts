// Starter content for a new install: the header and footer parts, the base templates (index, page,
// single, search), a home page set as the front page, an About page and the site settings; with Events on
// (Settings > Events), the event templates, a sample event and venue, and events on the home page and in
// the header; with the shop on (Settings > Shop), the shop's templates. Anything that already exists is
// left alone, so it is safe to run again. Run by `npm run seed` (scripts/seed.ts) and by the first-run
// screen (/admin/setup/), as the server. Turning Events on makes its templates (`ensureEventTemplates`).
import type { Db } from '../db/query';
import { buildPage } from '../compose/build';
import { site } from '../site';
import type { PuckItem } from '../puck/types';
import { eventDates } from './save';
import { SEARCH_TEMPLATE } from '../content/search-template';
import { eventsOn } from '../events/on';
import { shopOn } from '../shop/config';
import { ensureShopTemplates } from '../shop/templates';

type Log = (line: string) => void;

let n = 0;
const node = (type: string, attrs: Record<string, any> = {}, children?: PuckItem[]): PuckItem =>
  ({ type, props: { id: `seed-${type}-${n++}`, attrs, ...(children ? { children } : {}) } }) as PuckItem;
const doc = (content: PuckItem[]) => ({ root: { props: {} }, content, zones: {} });
const pad = (top: string, bottom = top) => ({ top, right: 'var(--space-50)', bottom, left: 'var(--space-50)' });
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const part = (slug: string) => node('part', { slug });
const main = (children: PuckItem[], top = 'var(--space-70)') =>
  node('section', { tag: 'main', style: { padding: pad(top, 'var(--space-80)') }, layout: { type: 'constrained', contentSize: '1280px' } }, children);
const page = (children: PuckItem[]) => [part('header'), ...children, part('footer')];

const header = (events: boolean) => [
  node('section', { tag: 'header', style: { background: 'var(--color-dark)', padding: pad('var(--space-40)') }, layout: { type: 'constrained', contentSize: '1280px' } }, [
    node('section', { layout: { type: 'row', justify: 'space-between', align: 'center' } }, [
      node('text', { content: `<a href="/">${esc(site.name)}</a>`, style: { color: 'var(--color-on-dark)', linkColor: 'var(--color-on-dark)', fontFamily: 'var(--font-display)', fontSize: 'var(--text-x-large)' } }),
      node('text', { content: `${events ? '<a href="/events/">Events</a> &nbsp; ' : ''}<a href="/about/">About</a> &nbsp; <a href="/search/">Search</a>`, style: { color: 'var(--color-on-dark)', linkColor: 'var(--color-on-dark)' } }),
    ]),
  ]),
];

const footer = () => [
  node('section', { tag: 'footer', style: { background: 'var(--color-dark)', padding: pad('var(--space-70)') }, layout: { type: 'constrained', contentSize: '1280px' } }, [
    node('text', { content: `&copy; ${esc(site.organization)}`, style: { color: 'var(--color-on-dark)', fontSize: 'var(--text-small)' } }),
  ]),
];

const baseTemplates = (): Record<string, PuckItem[]> => ({
  index: page([
    main([
      node('archive-title', { kind: 'archive', level: 1 }),
      node('collection', { query: { perPage: 10, postType: 'post', order: 'desc', orderBy: 'date', inherit: true }, display: 'list', pagination: 'numbers', card: 'custom' }, [
        node('collection-items', { layout: { type: 'flow' } }, [
          node('section', { style: { padding: { bottom: 'var(--space-60)' }, margin: { bottom: 'var(--space-60)' }, borderBottom: { width: '1px', color: 'var(--color-surface-alt)' } }, layout: { type: 'flow' } }, [
            node('entry-title', { level: 2, link: true, style: { fontFamily: 'var(--font-display)' } }),
            node('entry-date', { style: { color: 'var(--color-muted)', fontSize: '0.875rem' } }),
            node('entry-excerpt', { length: 30, moreText: 'Read more' }),
          ]),
        ]),
      ]),
    ], 'var(--space-80)'),
  ]),
  page: page([node('section', { tag: 'main', layout: { type: 'flow' } }, [node('entry-content', { layout: { type: 'constrained', contentSize: '1280px', wideSize: '1280px' } })])]),
  single: page([
    main([
      node('entry-title', { level: 1 }),
      node('entry-date', { style: { color: 'var(--color-muted)', fontSize: '0.875rem' } }),
      node('entry-image', { width: 'wide', style: { radius: '6px' } }),
      node('entry-content', { layout: { type: 'constrained', contentSize: '720px' } }),
    ]),
  ]),
  search: SEARCH_TEMPLATE,
});

/** The event templates: an event's page and the calendar. */
const eventTemplates = (): Record<string, { title: string; content: PuckItem[] }> => ({
  'single-event': { title: 'Event', content: page([node('event-details')]) },
  'archive-events': { title: 'Events', content: page([node('events-calendar')]) },
});

const materials = () => ({ images: new Map(), videos: new Map(), tags: new Map() });

async function ensureTemplate(db: Db, kind: string, slug: string, content: PuckItem[], title = slug): Promise<boolean> {
  const { data } = await db.from('templates').select('id').eq('kind', kind).eq('slug', slug).maybeSingle();
  if (data) return false;
  const { error } = await db.from('templates').insert({ kind, slug, title, content: doc(content) });
  if (error) throw error;
  return true;
}

/** Make the event templates that aren't there yet (Settings > Events turning Events on). The slugs made. */
export async function ensureEventTemplates(db: Db): Promise<string[]> {
  const made: string[] = [];
  for (const [slug, t] of Object.entries(eventTemplates())) if (await ensureTemplate(db, 'template', slug, t.content, t.title)) made.push(slug);
  return made;
}

/** Whether the site has none of its templates yet: a new install, which the first-run screen offers to seed. */
export async function hasNoTemplates(db: Db): Promise<boolean> {
  const { data } = await db.from('templates').select('id').limit(1);
  return !data?.length;
}

/** Add the starter content that isn't there yet, as the server. */
export async function seedSite(db: Db, log: Log = () => {}): Promise<void> {
  const { data: current } = await db.from('settings').select('value').eq('key', 'site').maybeSingle();
  const events = eventsOn(current?.value);

  const template = async (kind: string, slug: string, content: PuckItem[], title?: string) =>
    log(`${kind} ${slug}: ${(await ensureTemplate(db, kind, slug, content, title)) ? 'added' : 'exists'}`);
  const entry = async (type: string, slug: string, title: string, content: PuckItem[], extra: Record<string, any> = {}): Promise<number> => {
    const { data } = await db.from('entries').select('id').eq('type', type).eq('slug', slug).maybeSingle();
    if (data) {
      log(`${type} ${slug}: exists`);
      return data.id;
    }
    const { data: row, error } = await db.from('entries').insert({ type, slug, title, status: 'publish', content: doc(content), ...extra }).select('id').single();
    if (error) throw error;
    log(`${type} ${slug}: added`);
    return row.id;
  };

  await template('part', 'header', header(events));
  await template('part', 'footer', footer());
  for (const [slug, content] of Object.entries(baseTemplates())) await template('template', slug, content);
  if (events) for (const [slug, t] of Object.entries(eventTemplates())) await template('template', slug, t.content, t.title);
  // With the shop on (Settings > Shop): a product's page and the shop's listing.
  if (shopOn(current?.value)) for (const slug of await ensureShopTemplates(db)) log(`template ${slug}: added`);

  const home = buildPage(
    {
      title: 'Home',
      sections: [
        { kind: 'hero', eyebrow: site.organization, heading: `Welcome to ${site.name}`, body: 'Edit this page in the editor, or ask Compose to write a new one.', buttons: events ? [{ label: 'Upcoming events', url: '/events/' }] : [] },
        { kind: 'text', heading: 'About us', body: 'Say who you are and what visitors will find here.' },
        ...(events ? [{ kind: 'listing', heading: 'Upcoming events', listing: { content_type: 'event', count: 3 }, background: 'tint' }] : []),
      ],
    } as any,
    materials(),
    'seed-home',
  );
  const homeId = await entry('page', 'home', 'Home', home);
  await entry('page', 'about', 'About', buildPage({ title: 'About', sections: [{ kind: 'text', heading: 'About', body: 'Tell visitors about the organisation.' }] } as any, materials(), 'seed-about'));

  // With Events on: a sample event two weeks out, at a sample venue, so the listing and the calendar show something.
  if (events) {
    const venue = await entry('venue', 'town-hall', 'Town Hall', [], { fields: { address: '1 Main Street' } });
    const day = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
    await entry('event', 'welcome-evening', 'Welcome evening', [node('text', { content: 'Meet your neighbours. Replace this sample event with your own.' })], {
      excerpt: 'Meet your neighbours.',
      ...eventDates({ event_start: `${day}T18:00`, event_end: `${day}T20:00`, event_all_day: false }, { venue, cost: 'Free' }),
    });
  } else log('events: off (turning them on under Settings > Events adds their templates; run this again for a sample event)');

  const value = { name: site.name, description: site.organization, ...(current?.value ?? {}) };
  if (!value.front_page_id) value.front_page_id = homeId;
  const { error } = await db.from('settings').upsert({ key: 'site', value });
  if (error) throw error;
  log(`settings site: front page ${value.front_page_id}`);
}
