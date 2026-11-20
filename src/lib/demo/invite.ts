// A demo's invitations (src/lib/demo): a visitor gives an address on the sign-in page and is emailed an
// editor's invitation (src/lib/admin/invite.ts), which the next reset deletes with the account. The answer
// is the same whether or not the address has an account; an account waiting for its password gets its
// invitation again, one that has signed in gets nothing. Limited per address (3 a day), per visitor (5 a
// day) and for the whole demo (DEMO_INVITES_DAILY, default 200), so the demo can't be used to email
// people over and over. Server only.
import { invite, resendInvite } from '../admin/invite';
import { awaitingPassword, userByEmail } from '../auth';
import { serviceClient } from '../db/site';
import { clientIp } from '../mailing/request';
import { hostEnv } from '../env';
import { underDailyLimit } from './guard';

export type DemoInviteCode = 'sent' | 'limit' | 'bad';

/** What the sign-in page says for each answer (`?demo=<code>`); fixed words, so a link can't put text there. */
export const DEMO_INVITE_MESSAGES: Record<string, { ok: boolean; text: string }> = {
  sent: { ok: true, text: 'Check your email for the invitation. It has a link to choose your password.' },
  limit: { ok: false, text: 'That address, or this connection, has asked for enough invitations today. Try again tomorrow.' },
  bad: { ok: false, text: "That doesn't look like an email address." },
};

const EMAIL = /^[^\s@<>"']{1,64}@[^\s@<>"']{1,190}\.[a-z]{2,}$/i;

/** Invite an address to edit the demo (a honeypot field filled in counts as sent, and sends nothing). */
export async function demoInvite(email: string, request: Request, origin: string, honeypot = ''): Promise<DemoInviteCode> {
  const address = email.trim().toLowerCase();
  if (!EMAIL.test(address)) return 'bad';
  if (honeypot) return 'sent';
  const daily = Number(hostEnv('DEMO_INVITES_DAILY')) || 200;
  const ip = clientIp(request);
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
  return 'sent';
}
