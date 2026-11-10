// The first admin (/admin/setup/, POST /api/auth/setup): while the site has no admin, the sign-in page
// sends visitors to a form that makes one, and can add the starter content (src/lib/admin/seed.ts).
// Under astro dev anyone may; on a deployed site the form also asks for the setup code, `SETUP_CODE`
// when it is set, else the site's `AUTH_SECRET` (both set by whoever deployed it), so a stranger who
// finds a new site first can't claim it.
import { createHash, timingSafeEqual } from 'node:crypto';
import { siteDb } from '../db/site';
import { env } from '../env';

/** Whether the site has no admin yet. */
export async function needsFirstAdmin(): Promise<boolean> {
  const { data } = await siteDb().from('profiles').select('id').eq('role', 'admin').limit(1);
  return !data?.length;
}

/** Whether the form asks for the setup code: everywhere but astro dev. */
export const setupCodeNeeded = (dev = !!import.meta.env?.DEV) => !dev;

/** Whether `code` is the setup code (`SETUP_CODE`, else `AUTH_SECRET`), compared in constant time. */
export function setupCodeMatches(code: string, want = env('SETUP_CODE') || env('AUTH_SECRET') || ''): boolean {
  if (!want || !code) return false;
  const hash = (s: string) => createHash('sha256').update(s.trim()).digest();
  return timingSafeEqual(hash(code), hash(want));
}

export const MIN_PASSWORD = 10;

/** What is wrong with the form, or null. */
export function firstAdminProblem(f: { email: string; password: string; code: string }, codeNeeded: boolean): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) return 'Enter an email address.';
  if (f.password.length < MIN_PASSWORD) return `The password needs at least ${MIN_PASSWORD} characters.`;
  if (codeNeeded && !setupCodeMatches(f.code)) return 'That setup code is not right.';
  return null;
}
