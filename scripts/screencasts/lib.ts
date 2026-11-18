// Screencasts for the Editor guide: silent clips with captions, recorded from the example site with
// Playwright at 1280 by 800 (the size of the guide's screenshots), then made into MP4 with ffmpeg.
//   npx tsx --env-file=.env scripts/screencasts/run.ts [name ...]
// Needs the dev server (http://localhost:4321) and an editor account: SCREENCAST_EDITOR_EMAIL and
// SCREENCAST_EDITOR_PASSWORD (scripts/create-editor.ts ... editor). Output: docs-site/public/video/editors/.
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from 'playwright';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { join } from 'node:path';

export const ORIGIN = process.env.ASTRO_ORIGIN ?? 'http://localhost:4321';
export const SIZE = { width: 1280, height: 800 };
export const OUT_DIR = 'docs-site/public/video/editors';

export const admin = { email: process.env.LOCAL_ADMIN_EMAIL ?? "", password: process.env.LOCAL_ADMIN_PASSWORD ?? "" };

export const editor = {
  email: process.env.SCREENCAST_EDITOR_EMAIL ?? '',
  password: process.env.SCREENCAST_EDITOR_PASSWORD ?? '',
};

// Runs in the page before its own scripts, on every navigation: hides Astro's dev toolbar, draws a cursor
// (headless Chromium records none) and the caption bar. The caption is kept in sessionStorage so it stays
// on screen across a page load.
const overlay = () => {
  const install = () => {
    if (document.getElementById('sc-cursor')) return;
    const style = document.createElement('style');
    style.textContent = `
      astro-dev-toolbar { display: none !important; }
      #sc-cursor { position: fixed; z-index: 2147483647; left: 0; top: 0; width: 22px; height: 22px;
        pointer-events: none; transform: translate(-3px, -2px); transition: none; }
      #sc-cursor.down svg { transform: scale(0.85); transform-origin: 3px 2px; }
      #sc-ring { position: fixed; z-index: 2147483646; width: 36px; height: 36px; margin: -18px 0 0 -18px;
        border-radius: 50%; border: 3px solid rgba(37, 99, 235, 0.8); pointer-events: none; opacity: 0;
        transform: scale(0.4); }
      #sc-ring.on { animation: sc-ring 450ms ease-out; }
      @keyframes sc-ring { 0% { opacity: 1; transform: scale(0.4); } 100% { opacity: 0; transform: scale(1.4); } }
      #sc-caption { position: fixed; z-index: 2147483645; left: 50%; bottom: 28px; transform: translateX(-50%);
        max-width: 900px; padding: 12px 22px; border-radius: 8px; background: rgba(17, 24, 39, 0.92);
        color: #fff; font: 600 20px/1.35 system-ui, -apple-system, 'Segoe UI', sans-serif; text-align: center;
        pointer-events: none; opacity: 0; transition: opacity 200ms; box-shadow: 0 6px 24px rgba(0,0,0,.25); }
      #sc-caption.top { bottom: auto; top: 76px; }
      #sc-caption.mid { bottom: auto; top: 210px; }
      #sc-caption.left { left: 24px; transform: none; max-width: 560px; text-align: left; }
      #sc-caption.on { opacity: 1; }`;
    document.documentElement.append(style);
    const cursor = document.createElement('div');
    cursor.id = 'sc-cursor';
    cursor.innerHTML = `<svg width="22" height="22" viewBox="0 0 22 22"><path d="M3 2 L3 18 L7.5 14 L10.5 20.5 L13 19.4 L10.1 13 L16 13 Z" fill="#111" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
    const ring = document.createElement('div');
    ring.id = 'sc-ring';
    const caption = document.createElement('div');
    caption.id = 'sc-caption';
    document.documentElement.append(ring, cursor, caption);
    const pos = JSON.parse(sessionStorage.getItem('sc-pos') ?? '[1040,640]');
    cursor.style.left = pos[0] + 'px';
    cursor.style.top = pos[1] + 'px';
    const saved = JSON.parse(sessionStorage.getItem('sc-caption') ?? 'null');
    if (saved) {
      caption.textContent = saved.text;
      caption.className = 'on' + (saved.at ? ' ' + saved.at : '');
    }
    addEventListener('mousemove', (e) => {
      cursor.style.left = e.clientX + 'px';
      cursor.style.top = e.clientY + 'px';
      sessionStorage.setItem('sc-pos', JSON.stringify([e.clientX, e.clientY]));
    }, true);
    addEventListener('mousedown', (e) => {
      cursor.classList.add('down');
      ring.style.left = e.clientX + 'px';
      ring.style.top = e.clientY + 'px';
      ring.classList.remove('on');
      void ring.offsetWidth;
      ring.classList.add('on');
    }, true);
    addEventListener('mouseup', () => cursor.classList.remove('down'), true);
  };
  if (document.documentElement) install();
  document.addEventListener('DOMContentLoaded', install);
};

export class Scene {
  private mouse = { x: 1040, y: 640 };
  /** Stretches of clip time, [from, to] in seconds, cut from the finished clip (see skip). */
  readonly cuts: [number, number][] = [];
  /** `zero`: Date.now() at the clip's first frame. */
  constructor(public page: Page, private zero = Date.now()) {}

  /** Run `wait` (a long wait, such as Claude writing a page) and cut it from the clip, keeping `keep` ms
   * of its start and end so the change is visible. */
  async skip(wait: () => Promise<unknown>, keep = 1200) {
    const from = (Date.now() - this.zero + keep) / 1000;
    await wait();
    const to = (Date.now() - this.zero - keep) / 1000;
    if (to > from) this.cuts.push([from, to]);
  }

  async goto(path: string) {
    await this.page.goto(ORIGIN + path, { waitUntil: 'networkidle' });
  }

  /** Show a caption, then wait: at the bottom of the screen, or `top` (under the admin bar) or `mid` (lower,
   * clear of the page editor's toolbars) when the bottom has something to see; `left` puts it at the left. */
  async caption(text: string, { hold = readTime(text), top = false, mid = false, left = false } = {}) {
    const at = [mid ? 'mid' : top ? 'top' : '', left ? 'left' : ''].filter(Boolean).join(' ');
    await this.page.evaluate(({ text, at }) => {
      const el = document.getElementById('sc-caption')!;
      el.textContent = text;
      el.className = 'on' + (at ? ' ' + at : '');
      sessionStorage.setItem('sc-caption', JSON.stringify({ text, at }));
    }, { text, at });
    await this.wait(hold);
  }

  async clearCaption() {
    await this.page.evaluate(() => {
      document.getElementById('sc-caption')!.className = '';
      sessionStorage.removeItem('sc-caption');
    });
    await this.wait(250);
  }

  /** A menu in the admin bar (its <summary>), or the account menu with `Account`. */
  menu(name: string) {
    if (name === 'Account') return this.page.locator('summary[aria-label=Account]');
    return this.page.locator('header nav[aria-label=Admin] summary').filter({ hasText: new RegExp(`^\\s*${name}\\s*$`) }).first();
  }

  /** A link in the admin bar. */
  barLink(name: string) {
    return this.page.locator('header nav[aria-label=Admin]').first().getByRole('link', { name, exact: true });
  }

  wait(ms: number) {
    return this.page.waitForTimeout(ms);
  }

  /** Glide the cursor to the middle of `target` with an ease-in-out path. */
  async moveTo(target: Locator, dx = 0, dy = 0) {
    await target.scrollIntoViewIfNeeded({ timeout: 10_000 }).catch((e) => {
      throw new Error(`can't reach ${target}: ${String(e.message).split('\n')[0]}`);
    });
    const box = await target.boundingBox();
    if (!box) throw new Error(`not visible: ${target}`);
    const x = box.x + box.width / 2 + dx;
    const y = box.y + box.height / 2 + dy;
    const dist = Math.hypot(x - this.mouse.x, y - this.mouse.y);
    const steps = Math.max(8, Math.min(40, Math.round(dist / 18)));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      await this.page.mouse.move(this.mouse.x + (x - this.mouse.x) * e, this.mouse.y + (y - this.mouse.y) * e);
      await this.page.waitForTimeout(12);
    }
    this.mouse = { x, y };
  }

  async hover(target: Locator, pause = 500) {
    await this.moveTo(target);
    await this.wait(pause);
  }

  async click(target: Locator, { pause = 350, after = 600 } = {}) {
    await this.moveTo(target);
    await this.wait(pause);
    await this.page.mouse.down();
    await this.wait(90);
    await this.page.mouse.up();
    await this.wait(after);
  }

  /** Drag `from` and drop it on `to` (offset by dx, dy from its middle), slowly enough for drag-and-drop libraries. */
  async drag(from: Locator, to: Locator, { dx = 0, dy = 0, after = 900 } = {}) {
    await this.moveTo(from);
    await this.wait(300);
    await this.page.mouse.down();
    // A first small move starts the drag (dnd-kit waits for some distance before it does).
    await this.page.mouse.move(this.mouse.x + 6, this.mouse.y + 6, { steps: 4 });
    this.mouse = { x: this.mouse.x + 6, y: this.mouse.y + 6 };
    await this.moveTo(to, dx, dy);
    await this.page.mouse.move(this.mouse.x, this.mouse.y + 2, { steps: 3 });
    await this.wait(500);
    await this.page.mouse.up();
    await this.wait(after);
  }

  /** Click into a field and type at a readable speed. */
  async type(target: Locator, text: string, { delay = 45, after = 400 } = {}) {
    await this.click(target, { after: 150 });
    await this.page.keyboard.type(text, { delay });
    await this.wait(after);
  }

  async press(key: string, after = 600) {
    await this.page.keyboard.press(key);
    await this.wait(after);
  }
}

/** About how long it takes to read a caption: 1.6 s plus 60 ms a character. */
const readTime = (text: string) => 1600 + text.length * 60;

/** Sign in once, outside any recording, and keep the session for the scenes. */
export async function signedInState(browser: Browser, who = editor) {
  if (!who.email || !who.password) throw new Error('set SCREENCAST_EDITOR_EMAIL and SCREENCAST_EDITOR_PASSWORD');
  const ctx = await browser.newContext({ viewport: SIZE });
  const page = await ctx.newPage();
  await page.goto(`${ORIGIN}/admin/login/`);
  await page.fill('input[name=email]', who.email);
  await page.fill('input[name=password]', who.password);
  await Promise.all([page.waitForURL(/\/admin\/(?!login)/), page.click('button:has-text("Sign in")')]);
  const state = await ctx.storageState();
  await ctx.close();
  return state;
}

export type SceneFn = (s: Scene) => Promise<void>;
export interface SceneDef {
  name: string;
  /** Start signed in (default) or signed out. */
  signedIn?: boolean;
  /** Where the recording starts; the page loads before recording time counts. */
  start: string;
  run: SceneFn;
}

/** Record one scene to OUT_DIR/<name>.mp4. */
export async function record(browser: Browser, def: SceneDef, state?: Awaited<ReturnType<typeof signedInState>>) {
  const dir = mkdtempSync(join(tmpdir(), 'screencast-'));
  const ctx: BrowserContext = await browser.newContext({
    viewport: SIZE,
    deviceScaleFactor: 1,
    storageState: def.signedIn === false ? undefined : state,
    recordVideo: { dir, size: SIZE },
  });
  // As source text: tsx wraps named functions in a `__name` helper that the page doesn't have.
  await ctx.addInitScript({ content: `var __name = (f) => f; (${overlay})();` });
  const page = await ctx.newPage();
  const started = Date.now();
  // The address bar's text over time: [seconds from the start of the recording, address].
  const urls: [number, string][] = [];
  page.on('framenavigated', (f) => {
    if (f === page.mainFrame()) urls.push([(Date.now() - started) / 1000, f.url()]);
  });
  await page.goto(ORIGIN + def.start, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  // Everything before this point (a blank frame, the first load) is cut from the clip.
  const lead = (Date.now() - started) / 1000;
  const scene = new Scene(page, started + lead * 1000);
  try {
    await def.run(scene).catch(async (e) => {
      const shot = join(tmpdir(), `screencast-${def.name}-failed.png`);
      await page.screenshot({ path: shot }).catch(() => {});
      console.error(`${def.name} failed; the screen then: ${shot}`);
      throw e;
    });
    await scene.clearCaption();
    await scene.wait(800);
  } finally {
    await ctx.close();
  }
  const webm = readdirSync(dir).find((f) => f.endsWith('.webm'));
  if (!webm) throw new Error('no video recorded');
  mkdirSync(OUT_DIR, { recursive: true });
  const out = join(OUT_DIR, `${def.name}.mp4`);
  const tmp = out + '.part.mp4';
  // The clip sits in a plain browser window, its address bar showing where the editor is; a frame per
  // address, each shown from its navigation (in clip time) to the next.
  // Clip time after the cuts: a moment inside a cut moves to where the cut starts.
  const cut = (t: number) => t - scene.cuts.reduce((sum, [a, b]) => sum + Math.max(0, Math.min(t, b) - a), 0);
  const spans = urls
    .map(([t, url]) => [cut(Math.max(0, t - lead)), url] as const)
    .filter(([, url], i, all) => i === all.length - 1 || all[i + 1][0] > 0 || all[i + 1][1] !== url)
    .filter((s, i, all) => i === all.length - 1 || all[i + 1][0] > s[0]);
  const frames: string[] = [];
  for (const [i, [, url]] of spans.entries()) {
    const file = join(dir, `frame-${i}.png`);
    await sharp(Buffer.from(windowFrame(url))).png().toFile(file);
    frames.push(file);
  }
  const inputs = frames.flatMap((f) => ['-loop', '1', '-framerate', '25', '-i', f]);
  const keep = scene.cuts.length
    ? `fps=25,select='not(${scene.cuts.map(([a, b]) => `between(t,${a.toFixed(2)},${b.toFixed(2)})`).join('+')})',setpts=N/25/TB`
    : 'setpts=PTS-STARTPTS';
  const graph = [`[${frames.length}:v]${keep}[clip]`];
  let last = '0:v';
  for (let i = 1; i < frames.length; i++) {
    graph.push(`[${last}][${i}:v]overlay=0:0:enable='gte(t,${spans[i][0].toFixed(2)})'[b${i}]`);
    last = `b${i}`;
  }
  graph.push(`[${last}][clip]overlay=${FRAME.x}:${FRAME.y}:shortest=1,format=yuv420p[out]`);
  const r = spawnSync('ffmpeg', [
    '-y', '-loglevel', 'error', ...inputs, '-ss', lead.toFixed(2), '-i', join(dir, webm),
    '-filter_complex', graph.join(';'), '-map', '[out]',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-r', '25',
    '-movflags', '+faststart', '-an', tmp,
  ], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('ffmpeg failed');
  renameSync(tmp, out);
  rmSync(dir, { recursive: true, force: true });
  poster(out);
  return out;
}

// The window around the page: a margin, a title bar with an address field, then the page at (x, y).
const MARGIN = 32;
const BAR = 44;
export const FRAME = { x: MARGIN, y: MARGIN + BAR, width: SIZE.width + 2 * MARGIN, height: SIZE.height + BAR + 2 * MARGIN };

/** The address as a reader would see it on their own site: www.yoursite.org instead of localhost. */
const shown = (url: string) => {
  const u = new URL(url);
  return 'www.yoursite.org' + u.pathname + u.search;
};

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function windowFrame(url: string) {
  const { width: W, height: H } = FRAME;
  const w = SIZE.width;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs><filter id="sh" x="-5%" y="-5%" width="110%" height="110%"><feDropShadow dx="0" dy="6" stdDeviation="10" flood-color="#0f172a" flood-opacity=".18"/></filter></defs>
  <rect width="${W}" height="${H}" fill="#e3e7ec"/>
  <rect x="${MARGIN}" y="${MARGIN}" width="${w}" height="${SIZE.height + BAR}" rx="10" fill="#fff" filter="url(#sh)"/>
  <path d="M${MARGIN} ${MARGIN + BAR} V${MARGIN + 10} a10 10 0 0 1 10 -10 H${MARGIN + w - 10} a10 10 0 0 1 10 10 V${MARGIN + BAR} Z" fill="#f1f3f5"/>
  <line x1="${MARGIN}" y1="${MARGIN + BAR - 0.5}" x2="${MARGIN + w}" y2="${MARGIN + BAR - 0.5}" stroke="#d6dbe1"/>
  ${['#ff5f57', '#febc2e', '#28c840'].map((c, i) => `<circle cx="${MARGIN + 22 + i * 20}" cy="${MARGIN + BAR / 2}" r="6" fill="${c}"/>`).join('')}
  <rect x="${MARGIN + 260}" y="${MARGIN + 9}" width="${w - 520}" height="${BAR - 18}" rx="13" fill="#fff" stroke="#d6dbe1"/>
  <text x="${MARGIN + w / 2}" y="${MARGIN + BAR / 2 + 5}" text-anchor="middle" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="14" fill="#334155">${xml(shown(url))}</text>
</svg>`;
}

/** The clip's poster (<name>.jpg beside it): the frame 40% of the way in, shown before it plays. */
export function poster(mp4: string) {
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp4], { encoding: 'utf8' });
  const at = (Number(probe.stdout) * 0.4).toFixed(2);
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', at, '-i', mp4, '-frames:v', '1', '-q:v', '4', mp4.replace(/\.mp4$/, '.jpg')], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('ffmpeg (poster) failed');
}

export async function launch() {
  return chromium.launch();
}
