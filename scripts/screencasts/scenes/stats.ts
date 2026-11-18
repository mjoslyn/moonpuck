// Editor guide: Stats (docs-site/src/content/docs/editors/stats.md): the dates, the totals, the chart,
// pages, links and where visits came from.
import type { SceneDef } from '../lib';

export default {
  name: 'stats',
  start: '/admin/',
  async run(s) {
    const p = s.page;
    await s.caption('Click Stats in the top bar.', { hold: 1400 });
    await s.click(s.barLink('Stats'), { after: 0 });
    await p.waitForURL(/stats/);
    await p.waitForLoadState('networkidle');
    await s.wait(800);

    await s.caption('At the top: page views, visitors and links clicked over the dates you choose.');
    await s.hover(p.getByText('Page views', { exact: true }).first(), 900);
    await s.hover(p.getByText('Visitors', { exact: true }).first(), 900);
    await s.caption('Pick a range, or your own dates and Show.', { hold: 1200 });
    await s.click(p.getByRole('navigation', { name: 'Range' }).getByRole('link', { name: '7 days' }), { after: 1800 });
    await s.click(p.getByRole('navigation', { name: 'Range' }).getByRole('link', { name: '30 days' }), { after: 1800 });
    await s.caption('The chart shows each day. Hover over it for the numbers.', { hold: 1000 });
    const chart = p.getByRole('img', { name: /Page views a day/ });
    await s.moveTo(chart, -300, 0);
    for (const dx of [-150, 0, 150, 300]) {
      await s.moveTo(chart, dx, 0);
      await s.wait(500);
    }
    await s.wait(600);

    await s.caption('Below: the most visited pages and the links people followed from them.');
    await s.hover(p.getByRole('heading', { name: /^Pages/ }), 2400);
    await s.caption('And where visits came from: search engines, social media, other sites.');
    await s.hover(p.getByText(/came from/i).first(), 2600);
  },
} satisfies SceneDef;
