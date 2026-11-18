// Editor guide: Events and tickets (docs-site/src/content/docs/editors/events-and-tickets.md): adding an
// event (title, dates, venue, picture), publishing it, and seeing it on the site's calendar.
import type { SceneDef } from '../lib';

/** A date about four weeks out, as the datetime-local box wants it. */
const inWeeks = (weeks: number, time: string) => new Date(Date.now() + weeks * 7 * 864e5).toISOString().slice(0, 10) + 'T' + time;

export default {
  name: 'events-and-tickets',
  start: '/admin/',
  async run(s) {
    const p = s.page;
    await s.caption('Click Content, then Events.', { hold: 1800 });
    await s.click(s.menu('Content'), { after: 800 });
    await s.click(p.locator('header nav[aria-label=Admin] details[open]').getByRole('link', { name: 'Events', exact: true }), { after: 0 });
    await p.waitForURL(/type=event/);
    await p.waitForLoadState('networkidle');
    await s.caption('The list shows when each event starts. Click New Event.', { hold: 2400 });
    await s.click(p.getByRole('button', { name: 'New Event' }), { after: 0 });
    await p.waitForURL(/\/admin\/edit\//);
    await p.waitForLoadState('networkidle');
    await s.wait(1200);

    await s.caption('Give it a title on the right.', { mid: true, hold: 1200 });
    await s.type(p.getByRole('textbox', { name: 'Title', exact: true }), 'Holiday market', { delay: 60 });
    await s.caption('Set when it starts and ends.', { mid: true, hold: 1000 });
    const starts = p.locator('input[type=datetime-local]:visible').nth(0);
    await s.click(starts, { after: 300 });
    await starts.fill(inWeeks(4, '10:00'));
    await starts.press('Tab');
    await s.wait(700);
    const ends = p.locator('input[type=datetime-local]:visible').nth(1);
    await s.click(ends, { after: 300 });
    await ends.fill(inWeeks(4, '15:00'));
    await ends.press('Tab');
    await s.wait(1000);

    await s.caption('Under Details, choose where it is held.', { mid: true, hold: 1200 });
    await s.click(p.getByRole('button', { name: 'Choose venue' }), { after: 1000 });
    await s.click(p.getByText('Town Hall', { exact: true }).filter({ visible: true }).first(), { after: 1200 });

    await s.caption('Add a picture: it shows at the top of the event, on the calendar and in lists.', { mid: true, hold: 1200 });
    await s.click(p.getByRole('button', { name: 'Choose', exact: true }).first(), { after: 1200 });
    await s.click(p.getByText('farmers-market.jpg', { exact: true }).filter({ visible: true }).first(), { after: 1600 });

    await s.caption('Describe it on the page as with any page, then click Publish.', { mid: true, hold: 1800 });
    await s.click(p.getByRole('button', { name: 'Publish', exact: true }), { after: 0 });
    await p.getByText(/Published \d/).first().waitFor({ timeout: 20_000 });
    await s.wait(1500);

    await s.caption('It appears on the site\'s calendar straight away.', { hold: 1200 });
    await s.goto('/events/');
    await s.wait(800);
    await s.hover(p.getByRole('link', { name: 'Holiday market' }).first(), 2600);
    await s.caption('To sell tickets or take sign-ups, pick a ticket under Tickets in the event\'s settings.', { hold: 3600 });
  },
} satisfies SceneDef;
