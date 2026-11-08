// moonpuck.com's Worker: the built site (./dist) is served as static files (the ASSETS binding), and one
// route runs here, POST /api/contact, the home page's "We'll build it for you" form. It checks the
// Turnstile token with Cloudflare (siteverify, TURNSTILE_SECRET_KEY), then emails the message to
// CONTACT_TO through Email Routing (the CONTACT send_email binding), replying to the visitor.
//
// Set up once (see wrangler.jsonc): `npx wrangler secret put TURNSTILE_SECRET_KEY`; the site key is
// PUBLIC_TURNSTILE_SITE_KEY at build time; Email Routing on moonpuck.com with CONTACT_TO, set in the
// dashboard, a verified destination address (not one that only forwards).
import { EmailMessage } from 'cloudflare:email';

const LIMITS = { name: 100, email: 200, organization: 150, site: 300, message: 5000 };
const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/contact') return contact(request, env);
    return env.ASSETS.fetch(request);
  },
};

/** One line of a form field, trimmed and cut to its limit (no line breaks, so it can't add headers). */
const line = (v, max) => String(v ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);

async function contact(request, env) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
  // The page's own script asks for JSON; a form posted without it gets the page back with the outcome.
  const wantsJson = (request.headers.get('accept') ?? '').includes('application/json');
  const answer = (status, outcome, message) =>
    wantsJson
      ? Response.json({ ok: outcome === 'sent', outcome, message }, { status, headers: { 'Cache-Control': 'no-store' } })
      : Response.redirect(new URL(`/?contact=${outcome}#build`, request.url).toString(), 303);

  let form;
  try {
    form = await request.formData();
  } catch {
    return answer(400, 'invalid', 'The form could not be read. Please try again.');
  }
  // Filled in only by robots (the field is hidden from people).
  if (line(form.get('nickname'), 200)) return answer(200, 'sent', 'Thank you: we will be in touch.');
  // Only the email address is needed; the rest helps.
  const email = line(form.get('email'), LIMITS.email);
  const name = line(form.get('name'), LIMITS.name);
  const organization = line(form.get('organization'), LIMITS.organization);
  const site = line(form.get('site'), LIMITS.site);
  const message = String(form.get('message') ?? '').replace(/\r\n?/g, '\n').trim().slice(0, LIMITS.message);
  if (!EMAIL.test(email)) return answer(400, 'invalid', 'Please give a valid email address.');

  // CONTACT_TO is set in the dashboard: a verified destination address under Email Routing.
  if (!env.TURNSTILE_SECRET_KEY || !env.CONTACT || !env.CONTACT_TO) {
    console.error('contact: TURNSTILE_SECRET_KEY, CONTACT_TO or the CONTACT email binding is not set up');
    return answer(503, 'unavailable', 'The form is not working just now. Please email info@moonpuck.com.');
  }
  const verified = await verifyTurnstile(env.TURNSTILE_SECRET_KEY, String(form.get('cf-turnstile-response') ?? ''), request.headers.get('CF-Connecting-IP'));
  if (!verified) return answer(403, 'check', 'The check that you are a person did not pass. Please try again.');

  const from = env.CONTACT_FROM || 'form@moonpuck.com';
  const to = env.CONTACT_TO;
  const body = [
    `From: ${name ? `${name} <${email}>` : email}`,
    ...(organization ? [`Organization: ${organization}`] : []),
    ...(site ? [`Their site: ${site}`] : []),
    '',
    message || '(No message.)',
    '',
    '--',
    'Sent from the "We\'ll build it for you" form on moonpuck.com.',
  ].join('\n');
  try {
    await env.CONTACT.send(new EmailMessage(from, to, mime({ from, to, replyTo: email, replyName: name, subject: `Build my moonpuck site: ${organization || name || site || email}`, text: body })));
  } catch (e) {
    console.error(`contact: sending failed: ${e?.message ?? e}`);
    return answer(502, 'unavailable', 'Your message could not be sent just now. Please email info@moonpuck.com.');
  }
  return answer(200, 'sent', 'Thank you: we will be in touch.');
}

/** Cloudflare's answer for a Turnstile token (https://developers.cloudflare.com/turnstile/get-started/server-side-validation/). */
async function verifyTurnstile(secret, token, ip) {
  if (!token || token.length > 2048) {
    console.warn('contact: Turnstile check failed: no token was sent');
    return false;
  }
  const body = new FormData();
  body.append('secret', secret);
  body.append('response', token);
  if (ip) body.append('remoteip', ip);
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
    const data = await res.json();
    if (data?.success === true) return true;
    // Cloudflare's reason, such as invalid-input-secret (the secret isn't this widget's) or
    // timeout-or-duplicate (the pass was over 5 minutes old, or already used).
    console.warn(`contact: Turnstile check failed: ${(data?.['error-codes'] ?? []).join(', ') || 'no reason given'}${data?.hostname ? ` (hostname ${data.hostname})` : ''}`);
    return false;
  } catch (e) {
    console.error(`contact: Turnstile check failed: ${e?.message ?? e}`);
    return false;
  }
}

/** A header's words, as UTF-8 base64 when they aren't plain ASCII. */
const word = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode(s)))}?=`);
/** A display name, quoted. */
const named = (name, address) => (!name ? address : `${/^[\x20-\x7e]*$/.test(name) ? `"${name.replace(/["\\]/g, '')}"` : word(name)} <${address}>`);

/** A plain-text email as Email Routing takes it (raw MIME). */
function mime({ from, to, replyTo, replyName, subject, text }) {
  const bytes = new TextEncoder().encode(text);
  // Base64 in 76-character lines, so any text and line length is safe.
  const b64 = btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join('')).replace(/.{76}/g, '$&\r\n');
  return [
    `From: ${named('moonpuck.com', from)}`,
    `To: ${to}`,
    `Reply-To: ${named(replyName, replyTo)}`,
    `Subject: ${word(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@moonpuck.com>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64,
  ].join('\r\n');
}
