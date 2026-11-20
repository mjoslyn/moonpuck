// Cloudflare Turnstile (https://developers.cloudflare.com/turnstile/): a check that a form was sent by a
// person, used by a demo's Try the editor form (src/lib/demo/invite.ts). The site key is public and goes on
// the page (TURNSTILE_SITE_KEY, a variable); the secret checks the answer on the server
// (TURNSTILE_SECRET_KEY, a secret). Without both, nothing is asked and nothing is checked. Server only.
import { env } from './env';

/** The widget's keys, or null while either isn't set. */
export function turnstileKeys(): { siteKey: string; secret: string } | null {
  const siteKey = env('TURNSTILE_SITE_KEY')?.trim();
  const secret = env('TURNSTILE_SECRET_KEY')?.trim();
  return siteKey && secret ? { siteKey, secret } : null;
}

/** Whether Cloudflare accepts the token the widget put in the form (`cf-turnstile-response`). */
export async function verifyTurnstile(secret: string, token: string, ip?: string | null): Promise<boolean> {
  if (!token || token.length > 2048) return false;
  const body = new FormData();
  body.append('secret', secret);
  body.append('response', token);
  if (ip) body.append('remoteip', ip);
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
    const data = (await res.json()) as { success?: boolean; 'error-codes'?: string[] };
    if (data?.success === true) return true;
    // Cloudflare's reason, such as timeout-or-duplicate (over 5 minutes old, or already used).
    console.warn(`turnstile: check failed: ${(data?.['error-codes'] ?? []).join(', ') || 'no reason given'}`);
    return false;
  } catch (e) {
    console.error(`turnstile: check failed: ${(e as Error).message}`);
    return false;
  }
}
