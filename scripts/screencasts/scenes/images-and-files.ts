// Editor guide: Images and files (docs-site/src/content/docs/editors/images-and-files.md): the Media
// screen, uploading, finding a file, and a picture's details (alt text, caption, focal point).
import sharp from 'sharp';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SceneDef } from '../lib';

/** A picture to upload: the bandstand in Riverside Park. */
async function bandstand() {
  const file = join(mkdtempSync(join(tmpdir(), 'upload-')), 'bandstand.jpg');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1280 800">
  <defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7b787"/><stop offset="1" stop-color="#fde5cc"/></linearGradient></defs>
  <rect width="1280" height="800" fill="url(#s)"/><circle cx="260" cy="170" r="80" fill="#fff3d6" opacity=".9"/>
  <path d="M0 520 C 300 450 700 500 1280 470 L1280 800 L0 800 Z" fill="#7aa45a"/>
  <polygon points="760,250 960,330 560,330" fill="#9c3d2e"/><rect x="590" y="330" width="340" height="18" fill="#efe6d6"/>
  ${[600, 680, 760, 840, 910].map((x) => `<rect x="${x}" y="348" width="12" height="150" fill="#efe6d6"/>`).join('')}
  <rect x="570" y="495" width="380" height="30" fill="#d9cbb3"/>
  <path d="M0 610 C 400 570 800 650 1280 600 L1280 800 L0 800 Z" fill="#5c8a42"/></svg>`;
  await sharp(Buffer.from(svg)).jpeg({ quality: 86 }).toFile(file);
  return file;
}

export default {
  name: 'images-and-files',
  start: '/admin/',
  async run(s) {
    const p = s.page;
    const file = await bandstand();
    await s.caption('Pictures, videos and documents are kept under Media.', { hold: 2400 });
    await s.click(s.barLink('Media'), { after: 0 });
    await p.waitForURL(/\/admin\/media\//);
    await p.waitForLoadState('networkidle');
    await s.wait(1000);

    await s.caption('To add files, click Choose File, pick them on your computer, then click Upload.');
    await s.hover(p.getByRole('button', { name: 'Choose File' }), 500);
    await p.locator('input[type=file][name=file]').setInputFiles(file);
    await s.wait(800);
    await s.click(p.getByRole('button', { name: 'Upload' }), { after: 0 });
    await p.getByText('7 files').waitFor({ timeout: 60_000 });
    await p.waitForLoadState('networkidle');
    await s.wait(1600);
    await s.caption('The site makes smaller, faster copies of each picture for you.', { hold: 2600 });

    await s.caption('To find a file, search by its name or its alt text and press Enter.');
    await s.type(p.getByRole('textbox', { name: 'Search by name or alt text' }), 'park', { delay: 110, after: 300 });
    await s.press('Enter', 0);
    await p.waitForURL(/q=park/);
    await p.waitForLoadState('networkidle');
    await s.wait(1600);

    await s.caption('Click a picture to see its details.', { hold: 1800 });
    await s.click(p.getByRole('button', { name: 'Riverside Park on a summer morning' }), { after: 1200 });
    await s.caption('Alt text describes the picture for people who can\'t see it. Write what it shows.', { top: true });
    await s.hover(p.getByRole('textbox', { name: /Alt text/ }), 1200);

    await s.caption('Click the most important part of the picture. Every crop keeps it in view.', { top: true, hold: 2000 });
    const picture = p.locator('img').filter({ visible: true }).nth(0);
    const big = p.getByText('Click the image to set the focal point for').locator('xpath=following::img[1]');
    await s.click((await big.count()) ? big : picture, { after: 0 }).catch(() => {});
    await s.wait(300);
    // The trees on the right: move the point there with a second click.
    const box = await big.boundingBox();
    if (box) {
      await s.page.mouse.move(box.x + box.width * 0.83, box.y + box.height * 0.5, { steps: 20 });
      await s.wait(300);
      await s.page.mouse.down();
      await s.page.mouse.up();
    }
    await s.wait(2600);

    await s.caption('Add a caption if you like, then click Save.', { top: true, hold: 1000 });
    await s.type(p.getByRole('textbox', { name: 'Caption' }), 'The oak trees by the river path', { delay: 45 });
    await s.click(p.getByRole('button', { name: 'Save', exact: true }), { after: 1800 });
    await s.click(p.getByRole('button', { name: 'Close' }), { after: 1200 });
  },
} satisfies SceneDef;
