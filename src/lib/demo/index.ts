// Demo mode (DEMO_MODE=1 or true in the Worker's variables; not a setting, so nobody turns it on or off
// from the admin): a public copy of a site where anyone can try the editor. Visitors ask for an editor's
// invitation on the sign-in page (`/api/demo/invite`); everything they make, and their accounts, goes
// when the demo resets to its starting point, every DEMO_RESET_HOURS (default 12) hours (`resetDemo`,
// src/lib/demo/reset.ts, from the Worker's hourly run). Meanwhile:
//   - Stripe, Square, Shippo and Mailgun are never set up (`DEMO_OFF_KEYS`, src/lib/env.ts);
//   - only account emails go out (sendMail, src/lib/forms/mail.ts);
//   - uploads are images only, up to DEMO_IMAGE_MB (the media API);
//   - the HTML and Embed blocks aren't offered, and render no markup of their own (src/render/c/content.ts);
//   - Claude answers each account DEMO_CLAUDE_TURNS times a day, the whole demo DEMO_CLAUDE_DAILY times
//     (`claudeAllowed`, src/lib/demo/guard.ts);
//   - what visitors save is refused when it holds script or offensive words (`blockedText`,
//     src/lib/demo/content.ts).
// Admins (the demo's owners) aren't limited. Server only, but for `demoOn`, which the browser reads too.
import { hostEnv, isDemo } from '../env';

export { isDemo };

/** Images a visitor may upload, and how large. */
export const DEMO_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
export const DEMO_IMAGE_MB = 10;

const num = (k: string, fallback: number, min = 0) => {
  const n = Number(hostEnv(k));
  return Number.isFinite(n) && n >= min ? Math.floor(n) : fallback;
};

/** Hours between resets (1 to 24, dividing the day: a reset falls on the UTC hours divisible by it). */
export const resetHours = () => {
  const h = num('DEMO_RESET_HOURS', 12, 1);
  return 24 % h === 0 ? h : 12;
};
/** Claude's answers per account a day, and for the whole demo. */
export const claudeTurns = () => num('DEMO_CLAUDE_TURNS', 10);
export const claudeDaily = () => num('DEMO_CLAUDE_DAILY', 150);

/** Whether the hourly run at `now` is a reset's: on the hour that divides by the reset hours. */
export const resetDue = (now: Date, hours = resetHours()) => now.getUTCHours() % hours === 0;

/** When the next reset comes after `now`. */
export function nextReset(now: Date, hours = resetHours()): Date {
  const t = new Date(now);
  t.setUTCMinutes(0, 0, 0);
  do t.setUTCHours(t.getUTCHours() + 1);
  while (t.getUTCHours() % hours !== 0);
  return t;
}
