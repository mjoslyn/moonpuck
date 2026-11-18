// Demo content for the screencasts, on the local example site only: turns on the optional features
// (Events, Members, Mailing Lists, Shop, Donations) as the admin, adds the starter content those bring
// (seedSite), uploads a few pictures through the Media screen, and adds posts, pages and events so lists
// aren't empty. Safe to run again: what already exists is left alone.
//   npx tsx --env-file=.env scripts/screencasts/demo-setup.ts
import sharp from 'sharp';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { siteDb } from '../../src/lib/db/site';
import { seedSite } from '../../src/lib/admin/seed';
import { buildPage } from '../../src/lib/compose/build';
import { eventDates } from '../../src/lib/admin/save';
import { closeLocalBindings } from '../../src/lib/local-bindings';
import { admin, launch, ORIGIN, signedInState, SIZE } from './lib';

const FEATURES: [string, string][] = [
  ['events', 'Events on'],
  ['members', 'Members on'],
  ['mailing-lists', 'Mailing on'],
  ['shop', 'Shop on'],
  ['donations', 'Donations on'],
];

// Flat illustrations (sky, sun, hills, a few shapes) so the pictures read as places, not test patterns.
const PICTURES: { file: string; alt: string; sky: [string, string]; hills: [string, string]; extra: string }[] = [
  { file: 'fall-festival.jpg', alt: 'Tents and bunting at the fall festival', sky: ['#f6c28b', '#f9e3c4'], hills: ['#c26a2b', '#8f4a1c'],
    extra: '<path d="M0 380 Q 320 330 640 380 T 1280 380" stroke="#7a3b12" stroke-width="3" fill="none"/>' + [180, 420, 660, 900, 1100].map((x, i) => `<polygon points="${x},520 ${x + 80},430 ${x + 160},520" fill="${['#e94f37', '#f6f7eb', '#393e41', '#3f88c5', '#e94f37'][i]}"/>`).join('') },
  { file: 'riverside-park.jpg', alt: 'Riverside Park on a summer morning', sky: ['#9fd3f0', '#e6f5fc'], hills: ['#5f9e4f', '#3d6e33'],
    extra: '<path d="M0 640 C 300 590 600 690 1280 610 L1280 800 L0 800 Z" fill="#4a90c2"/>' + [140, 340, 980, 1140].map((x) => `<rect x="${x + 18}" y="430" width="14" height="90" fill="#5b3a1e"/><circle cx="${x + 25}" cy="410" r="60" fill="#2f6b2a"/>`).join('') },
  { file: 'library.jpg', alt: 'The public library front steps', sky: ['#b8c6db', '#eef1f6'], hills: ['#8a9a5b', '#6b7a45'],
    extra: '<rect x="380" y="300" width="520" height="260" fill="#e8e1d3"/><polygon points="360,300 640,200 920,300" fill="#cfc6b4"/>' + [420, 520, 620, 720, 820].map((x) => `<rect x="${x}" y="320" width="28" height="240" fill="#f6f2ea"/>`).join('') + '<rect x="600" y="470" width="80" height="90" fill="#5a4632"/>' },
  { file: 'farmers-market.jpg', alt: 'Stalls at the Saturday farmers market', sky: ['#ffd98e', '#fff4d6'], hills: ['#9bbf5a', '#7a9c3f'],
    extra: [120, 440, 760, 1080].map((x, i) => `<rect x="${x}" y="420" width="220" height="120" fill="#f4efe6"/><rect x="${x - 10}" y="390" width="240" height="40" fill="${['#d1495b', '#00798c', '#edae49', '#30638e'][i]}"/>` + [0, 1, 2, 3, 4].map((j) => `<circle cx="${x + 30 + j * 40}" cy="520" r="16" fill="${['#e4572e', '#f3a712', '#76b041', '#a8201a', '#ffc914'][(i + j) % 5]}"/>`).join('')).join('') },
  { file: 'town-hall.jpg', alt: 'Town Hall with its clock tower', sky: ['#c9d6e8', '#f2f5fa'], hills: ['#7d8f69', '#5c6b4b'],
    extra: '<rect x="420" y="330" width="440" height="230" fill="#b5654a"/><rect x="590" y="190" width="100" height="160" fill="#a3573e"/><circle cx="640" cy="250" r="30" fill="#f6f2ea"/><line x1="640" y1="250" x2="640" y2="232" stroke="#333" stroke-width="4"/><line x1="640" y1="250" x2="654" y2="256" stroke="#333" stroke-width="4"/>' + [460, 540, 700, 780].map((x) => `<rect x="${x}" y="380" width="40" height="60" fill="#f2e8d5"/>`).join('') },
  { file: 'winter-street.jpg', alt: 'Main Street after the first snow', sky: ['#aab7c4', '#e9eef2'], hills: ['#f4f6f8', '#dfe6ec'],
    extra: [100, 360, 620, 880, 1120].map((x, i) => `<rect x="${x}" y="${330 + (i % 2) * 30}" width="200" height="${230 - (i % 2) * 30}" fill="${['#6b4f4f', '#4f6b6b', '#6b6b4f', '#4f5a6b', '#6b4f60'][i]}"/><rect x="${x}" y="${320 + (i % 2) * 30}" width="200" height="16" fill="#fff"/>`).join('') },
];

const svg = (p: (typeof PICTURES)[number]) => `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1280 800">
<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.sky[0]}"/><stop offset="1" stop-color="${p.sky[1]}"/></linearGradient></defs>
<rect width="1280" height="800" fill="url(#s)"/><circle cx="1040" cy="150" r="70" fill="#fff6d5" opacity=".85"/>
<path d="M0 520 C 250 430 450 470 700 500 S 1100 450 1280 490 L1280 800 L0 800 Z" fill="${p.hills[0]}"/>
${p.extra}
<path d="M0 600 C 300 560 700 640 1280 580 L1280 800 L0 800 Z" fill="${p.hills[1]}" opacity=".9"/></svg>`;

const db = siteDb();
const browser = await launch();
try {
  const ctx = await browser.newContext({ viewport: SIZE, storageState: await signedInState(browser, admin) });
  const page = await ctx.newPage();

  for (const [path, label] of FEATURES) {
    await page.goto(`${ORIGIN}/admin/settings/${path}/`, { waitUntil: 'networkidle' });
    const box = page.getByRole('checkbox', { name: label });
    if (await box.isChecked()) {
      console.log(`${label}: already`);
      continue;
    }
    await box.check();
    await page.getByRole('button', { name: 'Save settings' }).click();
    await page.getByRole('status').filter({ hasText: /Saved/ }).waitFor({ timeout: 30_000 });
    console.log(`${label}: turned on`);
  }

  const { data: existing } = await db.from('media').select('id');
  if (!existing?.length) {
    const dir = mkdtempSync(join(tmpdir(), 'demo-pictures-'));
    const files = [];
    for (const p of PICTURES) {
      const file = join(dir, p.file);
      writeFileSync(file, await sharp(Buffer.from(svg(p))).jpeg({ quality: 86 }).toBuffer());
      files.push(file);
    }
    await page.goto(`${ORIGIN}/admin/media/`, { waitUntil: 'networkidle' });
    await page.locator('input[type=file][name=file]').setInputFiles(files);
    await page.getByRole('button', { name: 'Upload' }).click();
    await page.waitForFunction((n) => document.body.innerText.includes(`${n} files`), PICTURES.length, { timeout: 120_000 });
    console.log(`media: uploaded ${files.length}`);
  } else console.log(`media: ${existing.length} already`);

  // A newsletter popup (Settings > Popups), on, so its template part is there to edit.
  await page.goto(`${ORIGIN}/admin/settings/popups/`, { waitUntil: 'networkidle' });
  const popups = page.getByRole('region', { name: 'Popups' });
  if (!(await popups.getByRole('textbox', { name: /^Name/ }).count())) {
    await popups.getByRole('button', { name: 'Add a popup' }).click();
    await page.waitForTimeout(800);
    const name = popups.getByRole('textbox', { name: /^Name/ }).first();
    await name.fill('Newsletter sign-up');
    await popups.getByRole('checkbox', { name: 'Off' }).first().check();
    await page.getByRole('button', { name: 'Save settings' }).click();
    await page.getByRole('status').filter({ hasText: /Saved/ }).waitFor({ timeout: 30_000 });
    console.log('popup: added');
  } else console.log('popup: already');
  await ctx.close();
} finally {
  await browser.close();
}

await seedSite(db, (line) => console.log(line));

// Alt text, and an id per picture for featured images.
const { data: media } = await db.from('media').select('*');
const mediaId: Record<string, number> = {};
for (const m of media ?? []) {
  const pic = PICTURES.find((p) => String(m.filename ?? m.name ?? m.title ?? '').includes(p.file.replace(/\.jpg$/, '')));
  if (!pic) continue;
  mediaId[pic.file] = m.id;
  if ('alt' in m && !m.alt) await db.from('media').update({ alt: pic.alt }).eq('id', m.id);
}

const materials = () => ({ images: new Map(), videos: new Map(), tags: new Map() });
const ago = (days: number) => new Date(Date.now() - days * 864e5).toISOString();
const entry = async (row: Record<string, any>) => {
  const { data } = await db.from('entries').select('id').eq('type', row.type).eq('slug', row.slug).maybeSingle();
  if (data) return console.log(`${row.type} ${row.slug}: exists`), data.id as number;
  const { data: made, error } = await db.from('entries').insert(row).select('id').single();
  if (error) throw error;
  console.log(`${row.type} ${row.slug}: added`);
  return made.id as number;
};
const body = (title: string, sections: any[], seed: string) => ({ root: { props: {} }, content: buildPage({ title, sections } as any, materials(), seed), zones: {} });

const POSTS = [
  { slug: 'fall-festival-returns', title: 'The fall festival returns on October 18th', excerpt: 'Music, food stalls and a pumpkin contest at Riverside Park.', pic: 'fall-festival.jpg', days: 3 },
  { slug: 'riverside-park-cleanup', title: 'Volunteers clean up Riverside Park', excerpt: 'Forty neighbours turned out on Saturday morning.', pic: 'riverside-park.jpg', days: 9 },
  { slug: 'new-library-hours', title: 'New library hours from November', excerpt: 'The library opens late on Thursdays.', pic: 'library.jpg', days: 16 },
  { slug: 'farmers-market-winter', title: 'The farmers market moves indoors for winter', excerpt: 'Find the stalls in the Town Hall from December.', pic: 'farmers-market.jpg', days: 24 },
  { slug: 'snow-plow-schedule', title: 'This winter\'s snow plow schedule', excerpt: 'Which streets are cleared first, and when.', pic: 'winter-street.jpg', days: 31 },
];
for (const p of POSTS) {
  await entry({
    type: 'post', slug: p.slug, title: p.title, excerpt: p.excerpt, status: 'publish', published_at: ago(p.days),
    featured_media_id: mediaId[p.pic] ?? null,
    content: body(p.title, [{ kind: 'text', body: `${p.excerpt} More details will follow here.` }], `demo-${p.slug}`),
  });
}
await entry({ type: 'post', slug: 'council-meeting-notes', title: 'Notes from the November council meeting', excerpt: 'What was decided, in brief.', status: 'draft', content: body('Notes', [{ kind: 'text', body: 'Draft notes.' }], 'demo-council') });
for (const [slug, title, text] of [
  ['visit', 'Visiting Example Town', 'Where to park, where to eat and what to see.'],
  ['contact', 'Contact us', 'Call the Town Hall or send us a message.'],
  ['parks', 'Parks and trails', 'Riverside Park, the river trail and the playgrounds.'],
]) {
  await entry({ type: 'page', slug, title, status: 'publish', published_at: ago(40), content: body(title, [{ kind: 'hero', heading: title, body: text }, { kind: 'text', heading: 'More to come', body: text }], `demo-${slug}`) });
}

// Two more events, at a second venue.
const park = await entry({ type: 'venue', slug: 'riverside-park', title: 'Riverside Park', status: 'publish', fields: { address: '200 River Road' }, content: { root: { props: {} }, content: [], zones: {} } });
const day = (d: number) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
for (const e of [
  { slug: 'fall-festival', title: 'Fall festival', excerpt: 'Music, food stalls and a pumpkin contest.', d: 10, from: '11:00', to: '17:00', venue: park, pic: 'fall-festival.jpg' },
  { slug: 'park-cleanup', title: 'Park cleanup morning', excerpt: 'Gloves and bags provided.', d: 21, from: '09:00', to: '12:00', venue: park, pic: 'riverside-park.jpg' },
]) {
  await entry({
    type: 'event', slug: e.slug, title: e.title, excerpt: e.excerpt, status: 'publish', published_at: ago(2), featured_media_id: mediaId[e.pic] ?? null,
    content: body(e.title, [{ kind: 'text', body: e.excerpt }], `demo-${e.slug}`),
    ...eventDates({ event_start: `${day(e.d)}T${e.from}`, event_end: `${day(e.d)}T${e.to}`, event_all_day: false }, { venue: e.venue, cost: 'Free' }),
  });
}

// Mailing: the postal address every email needs, a list and a few subscribers.
{
  const { data: site } = await db.from('settings').select('value').eq('key', 'site').single();
  const value = site!.value;
  if (!value.mailing?.address) {
    value.mailing = { ...value.mailing, address: 'Example Town Council, 1 Main Street, Example Town' };
    await db.from('settings').upsert({ key: 'site', value });
    console.log('mailing: postal address set');
  }
  let { data: list } = await db.from('mail_lists').select('id').eq('name', 'Town newsletter').maybeSingle();
  if (!list) {
    ({ data: list } = await db.from('mail_lists').insert({ name: 'Town newsletter', description: 'News and events, once or twice a month.' }).select('id').single());
    console.log('mailing: list added');
  }
  const people = [['Ana', 'Lopez'], ['Ben', 'Okafor'], ['Chloe', 'Martin'], ['Dev', 'Patel'], ['Ellen', 'Brooks'], ['Farid', 'Haddad'], ['Grace', 'Kim'], ['Hugo', 'Novak']];
  for (const [first, last] of people) {
    const email = `${first}.${last}@example.org`.toLowerCase();
    const { data: had } = await db.from('contacts').select('id').eq('email', email).maybeSingle();
    if (had) continue;
    const { data: c, error } = await db.from('contacts').insert({ email, first_name: first, last_name: last, status: 'subscribed', consent_source: 'demo', confirmed_at: ago(30) }).select('id').single();
    if (error) throw error;
    await db.from('contact_lists').insert({ contact_id: c!.id, list_id: list!.id, status: 'subscribed', subscribed_at: ago(30) });
  }
  console.log(`mailing: ${people.length} subscribers`);
}

// Stats: sixty days of visits, the same numbers every run (a fixed seed), busier at weekends and rising.
{
  const { data: had } = await db.from('site_stats').select('day').limit(1);
  if (!had?.length) {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const pages: [string, number][] = [['/', 60], ['/events/', 34], ['/fall-festival-returns/', 22], ['/parks/', 14], ['/visit/', 12], ['/new-library-hours/', 11], ['/about/', 8], ['/contact/', 6], ['/snow-plow-schedule/', 9], ['/farmers-market-winter/', 7]];
    const referrers: [string, number][] = [['google.com', 0.35], ['facebook.com', 0.15], ['instagram.com', 0.08], ['bing.com', 0.04], ['nextdoor.com', 0.05]];
    const clicks: [string, string, number][] = [['/', '/events/', 0.18], ['/', '/fall-festival-returns/', 0.08], ['/events/', '/events/fall-festival/', 0.2], ['/visit/', 'https://maps.google.com/', 0.25], ['/contact/', 'mailto:hello@example.org', 0.2]];
    const rows: Record<string, any>[] = [];
    for (let d = 59; d >= 0; d--) {
      const date = new Date(Date.now() - d * 864e5);
      const day = date.toISOString().slice(0, 10);
      const weekend = [0, 6].includes(date.getUTCDay()) ? 1.35 : 1;
      const trend = 0.7 + (0.6 * (59 - d)) / 59;
      let views = 0;
      for (const [path, base] of pages) {
        const hits = Math.max(0, Math.round(base * weekend * trend * (0.75 + rand() * 0.5)));
        views += hits;
        if (hits) rows.push({ day, kind: 'view', path, target: '', hits });
      }
      rows.push({ day, kind: 'visitor', path: '', target: '', hits: Math.round(views * (0.55 + rand() * 0.1)) });
      for (const [host, share] of referrers) rows.push({ day, kind: 'referrer', path: '', target: host, hits: Math.max(1, Math.round(views * share * (0.6 + rand() * 0.4) * 0.5)) });
      for (const [path, target, share] of clicks) {
        const base = pages.find(([p]) => p === path)![1];
        rows.push({ day, kind: 'click', path, target, hits: Math.max(0, Math.round(base * weekend * trend * share * (0.6 + rand() * 0.8))) });
      }
    }
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await db.from('site_stats').insert(rows.slice(i, i + 200));
      if (error) throw error;
    }
    console.log(`stats: ${rows.length} rows`);
  } else console.log('stats: already');
}
await closeLocalBindings();
