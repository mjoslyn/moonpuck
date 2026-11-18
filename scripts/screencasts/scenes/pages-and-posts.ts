// Editor guide: Pages and posts (docs-site/src/content/docs/editors/pages-and-posts.md): the content list,
// its status tabs and search, doing something to several at once, making a copy and adding a new post.
import type { SceneDef } from '../lib';

export default {
  name: 'pages-and-posts',
  start: '/admin/',
  async run(s) {
    const p = s.page;
    await s.caption('Click Content, then the kind of thing you want: here, Posts.', { hold: 2600 });
    await s.click(s.menu('Content'), { after: 900 });
    await s.click(p.locator('header nav[aria-label=Admin] details[open]').getByRole('link', { name: 'Posts', exact: true }), { after: 0 });
    await p.waitForURL(/type=post/);
    await p.waitForLoadState('networkidle');

    await s.caption('Each row shows the title, its address, whether it is published, and when it last changed.');
    await s.hover(p.getByRole('link', { name: 'New library hours from November' }), 900);
    await s.hover(p.getByRole('cell', { name: 'Draft', exact: true }), 1200);

    await s.caption('The tabs show what is published, what is still a draft, and what is in the trash.');
    await s.click(p.getByRole('navigation', { name: 'Status' }).getByRole('link', { name: /^Drafts/ }), { after: 1600 });
    await s.click(p.getByRole('navigation', { name: 'Status' }).getByRole('link', { name: /^All/ }), { after: 900 });

    await s.caption('To find something, type a few words of its title and click Filter.');
    await s.type(p.getByRole('textbox', { name: 'Search posts' }), 'winter', { delay: 90 });
    await s.click(p.getByRole('button', { name: 'Filter' }), { after: 2000 });

    await s.caption('Tick several rows to publish, unpublish or trash them together.');
    const rows = p.getByRole('row').filter({ has: p.getByRole('button', { name: /^Duplicate/ }) });
    await s.click(rows.nth(0).getByRole('checkbox'), { after: 500 });
    await s.click(rows.nth(1).getByRole('checkbox'), { after: 700 });
    await s.hover(p.getByRole('combobox', { name: 'Bulk action' }), 1600);
    await s.click(rows.nth(0).getByRole('checkbox'), { after: 200 });
    await s.click(rows.nth(1).getByRole('checkbox'), { after: 400 });

    await s.caption('Duplicate makes a draft copy, titled "(copy)", and opens it in the editor.');
    await s.click(rows.nth(0).getByRole('button', { name: /^Duplicate/ }), { after: 0 });
    await p.waitForURL(/\/admin\/edit\//);
    await p.waitForLoadState('networkidle');
    await s.wait(2600);
    await s.clearCaption();

    await s.goto('/admin/?type=post');
    await s.caption('To start something new, click New Post (or New Page).');
    await s.click(p.getByRole('button', { name: 'New Post' }), { after: 0 });
    await p.waitForURL(/\/admin\/edit\//);
    await p.waitForLoadState('networkidle');
    await s.wait(1200);
    await s.caption('The editor opens with an empty draft. Give it a title on the right.', { top: true });
    await s.type(p.getByRole('textbox', { name: 'Title', exact: true }), 'Holiday lights on Main Street', { delay: 60 });
    await s.caption('It saves itself as you work, and stays a private draft until you click Publish.', { top: true });
    await s.hover(p.getByRole('button', { name: 'Publish' }), 2000);
  },
} satisfies SceneDef;
