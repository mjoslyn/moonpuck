// A demo's invitations (src/lib/demo): a visitor gives an address on the sign-in page and is emailed an
// editor's invitation (src/lib/admin/invite.ts), which the next reset deletes with the account. The answer
// is the same whether or not the address has an account; an account waiting for its password gets its
// invitation again, one that has signed in gets nothing. Limited per address (3 a day), per visitor (5 a
// day) and for the whole demo (DEMO_INVITES_DAILY, default 200), so the demo can't be used to email
// people over and over. With Turnstile's keys set (src/lib/turnstile.ts) the form carries its check, which
// is verified before anything else is counted or sent. Each new invitation emails the demo's owners
// (`notifyOwners`: DEMO_NOTIFY_EMAIL, else every admin's address). Server only.
import { invite, resendInvite } from '../admin/invite';
import { awaitingPassword, userByEmail } from '../auth';
import { serviceClient } from '../db/site';
import { clientIp } from '../mailing/request';
import { hostEnv } from '../env';
import { underDailyLimit } from './guard';
import { turnstileKeys, verifyTurnstile } from '../turnstile';
import { sendMail } from '../forms/mail';
import { esc as escHtml } from '../../render/html';
import { site } from '../site';

export type DemoInviteCode = 'sent' | 'limit' | 'bad' | 'check';

/** What the sign-in page says for each answer (`?demo=<code>`); fixed words, so a link can't put text there. */
export const DEMO_INVITE_MESSAGES: Record<string, { ok: boolean; text: string }> = {
  sent: { ok: true, text: 'Check your email for the invitation. It has a link to choose your password.' },
  limit: { ok: false, text: 'That address, or this connection, has asked for enough invitations today. Try again tomorrow.' },
  bad: { ok: false, text: "That doesn't look like an email address." },
  check: { ok: false, text: "We couldn't confirm you're a person. Please try again." },
};

const EMAIL = /^[^\s@<>"']{1,64}@[^\s@<>"']{1,190}\.[a-z]{2,}$/i;

/** Invite an address to edit the demo (a honeypot field filled in counts as sent, and sends nothing). */
export async function demoInvite(email: string, request: Request, origin: string, honeypot = '', token = ''): Promise<DemoInviteCode> {
  const address = email.trim().toLowerCase();
  if (!EMAIL.test(address)) return 'bad';
  if (honeypot) return 'sent';
  const ip = clientIp(request);
  const turnstile = turnstileKeys();
  if (turnstile && !(await verifyTurnstile(turnstile.secret, token, ip))) return 'check';
  const daily = Number(hostEnv('DEMO_INVITES_DAILY')) || 200;
  const ok = await underDailyLimit('invite', [{ key: `email:${address}`, max: 3 }, ...(ip ? [{ key: `ip:${ip}`, max: 5 }] : []), { key: 'all', max: daily }]);
  if (!ok) return 'limit';
  const user = await userByEmail(address);
  if (user) {
    if ((await awaitingPassword()).has(user.id)) await resendInvite(user.id, 'admin', origin);
    return 'sent';
  }
  const res = await invite(address, 'admin', origin);
  if ('error' in res) {
    console.error(`[demo] invitation for ${address} failed: ${res.error}`);
    return 'sent';
  }
  // The profile is made with the account; a demo's visitors edit, they don't administer.
  const { error } = await serviceClient().from('profiles').update({ role: 'editor' }).eq('id', res.user.id);
  if (error) console.error(`[demo] could not make ${address} an editor: ${error.message}`);
  await notifyOwners(address, request);
  return 'sent';
}

/** Where the demo's notices go: DEMO_NOTIFY_EMAIL (one or more, comma-separated), else every admin's address. */
async function ownerAddresses(): Promise<string[]> {
  const set = (hostEnv('DEMO_NOTIFY_EMAIL') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (set.length) return set;
  const db = serviceClient();
  const { data: admins } = await db.from('profiles').select('id').eq('role', 'admin');
  const ids = (admins ?? []).map((a: { id: string }) => a.id);
  if (!ids.length) return [];
  const { data: users } = await db.from('users').select('email').in('id', ids);
  return (users ?? []).map((u: { email: string }) => u.email).filter(Boolean);
}

/** Tell the demo's owners someone asked to try the editor: the address, when, and the visitor's country. */
export async function notifyOwners(address: string, request: Request): Promise<void> {
  try {
    const to = await ownerAddresses();
    if (!to.length) return;
    const country = request.headers.get('cf-ipcountry') ?? '';
    const when = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
    const lines = [`${address} asked to try the editor.`, `When: ${when}`, ...(country && country !== 'XX' ? [`Country: ${country}`] : [])];
    await sendMail({
      to,
      subject: `Demo: ${address} asked to try the editor`,
      html: lines.map((l) => `<p>${escHtml(l)}</p>`).join(''),
      text: lines.join('\n'),
      fromName: site.name,
      kind: 'admin',
      owner: true,
    });
  } catch (e) {
    console.error(`[demo] could not tell the owners about ${address}: ${(e as Error).message}`);
  }
}
