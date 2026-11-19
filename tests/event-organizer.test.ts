// Organizers (src/lib/events/types.ts ORGANIZER_TYPE): a core Events type, chosen in an event's Organizer
// field and shown in the Event details block with how to reach them.
import { describe, expect, it } from 'vitest';
import { siteDb } from '../src/lib/db/site';
import { renderRequest } from '../src/render/page';
import { withEvents, EVENT_TYPES } from '../src/lib/events/types';

const doc = (content: unknown[]) => ({ root: { props: {} }, content, zones: {} });

describe('event organizers', () => {
  it('adds the organizer type and the event field, unless the site has its own', () => {
    const { types } = withEvents([{ type: 'page', label: 'Pages', singular: 'Page' }], []);
    const organizer = types.find((t) => t.type === 'organizer');
    expect(organizer?.record).toBe(true);
    expect(types.find((t) => t.type === 'event')?.fields?.some((f) => f.key === 'organizer')).toBe(true);
    expect(EVENT_TYPES).toContain('organizer');
    const own = withEvents([{ type: 'organizer', label: 'Hosts', singular: 'Host' }], []).types.filter((t) => t.type === 'organizer');
    expect(own).toHaveLength(1);
    expect(own[0].label).toBe('Hosts');
  });

  it('shows the organizer in Event details', async () => {
    const db = siteDb();
    const { data } = await db.from('settings').select('value').eq('key', 'site').maybeSingle();
    await db.from('settings').upsert({ key: 'site', value: { ...((data?.value as object) ?? {}), events: { enabled: true } } });
    await db.from('templates').insert({ kind: 'template', slug: 'details-event', title: 'Details event', content: doc([{ type: 'event-details', props: { id: 'ed', attrs: {} } }]) });
    const { data: org } = await db
      .from('entries')
      .insert({ type: 'organizer', slug: 'jo', title: 'Jo Smith', status: 'publish', fields: { email: 'jo@example.org', phone: '(716) 555-0100' } })
      .select('id')
      .single();
    await db.from('entries').insert({
      type: 'event',
      slug: 'class',
      title: 'Class',
      status: 'publish',
      template: 'details-event',
      fields: { start: '2099-06-01T19:00', end: '2099-06-01T21:00', organizer: org!.id },
      content: doc([]),
    });
    const html = (await renderRequest(new URL('http://localhost/event/class/'), db)).html;
    expect(html).toContain('>Organizer</h2>');
    expect(html).toContain('Jo Smith');
    expect(html).toContain('href="mailto:jo@example.org"');
    expect(html).toContain('href="tel:7165550100"');
  });
});
