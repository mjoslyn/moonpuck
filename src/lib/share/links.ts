// Share links (server only): a private address for one entry or newsletter draft (a campaign;
// /share/<token>/), to view it as it is saved (an entry's unpublished changes included) or to edit it as
// a draft. Each is protected one of three ways
// (`access`): login (signed-in editors and admins only), password, or anyone with the link. Guests
// (password and anyone links) get a signed cookie naming the link, one per entry or campaign
// (`site.share.<entry id>`, `site.share.c<campaign id>`, so several links work side by side), which the
// middleware turns into the `guest` role for that one entry or campaign (src/lib/db/policies.ts). Revoking a link, its expiry,
// a new password or a changed protection ends every guest's access at once: the cookie is signed over
// the link's token, protection and password hash, and the link is read again on each request.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { hashPassword, verifyPassword } from 'better-auth/crypto';
import { siteDb } from '../db/site';
import { env } from '../env';

export type ShareMode = 'view' | 'edit';
export type ShareAccess = 'login' | 'password' | 'anyone';

/** What a link is for: an entry (a page), or a campaign (a newsletter draft). */
export type ShareSubject = { kind: 'entry' | 'campaign'; id: number };

export interface ShareLink {
  id: number;
  token: string;
  entry_id: number | null;
  campaign_id: number | null;
  mode: ShareMode;
  access: ShareAccess;
  password_hash: string | null;
  label: string;
  expires_at: string | null;
  revoked_at: string | null;
  uses: number;
  last_used_at: string | null;
  created_by: string | null;
  created_at: string;
}

export const SHARE_MODES: ShareMode[] = ['view', 'edit'];
export const SHARE_ACCESS: ShareAccess[] = ['login', 'password', 'anyone'];
/** The shortest password a link takes. */
export const SHARE_PASSWORD_MIN = 6;
/** How long a guest's cookie lasts (less when the link expires sooner). */
const COOKIE_DAYS = 7;

const COLUMNS = 'id, token, entry_id, campaign_id, mode, access, password_hash, label, expires_at, revoked_at, uses, last_used_at, created_by, created_at';

export const SHARE_COOKIE = 'site.share';
/** What a link is for. */
export const subjectOf = (link: Pick<ShareLink, 'entry_id' | 'campaign_id'>): ShareSubject => (link.campaign_id ? { kind: 'campaign', id: link.campaign_id } : { kind: 'entry', id: link.entry_id ?? 0 });
const sameSubject = (a: ShareSubject, b: ShareSubject) => a.kind === b.kind && a.id === b.id;
/** A cookie's name for a subject, without the prefix: `site.share.<entry id>`, `site.share.c<campaign id>`. */
const cookieBase = (s: ShareSubject) => `${SHARE_COOKIE}.${s.kind === 'campaign' ? 'c' : ''}${s.id}`;
/** A guest's cookie for a subject, as set: __Secure- outside astro dev, as the session cookie (src/lib/auth). */
export const shareCookieName = (s: ShareSubject) => `${import.meta.env?.DEV ? '' : '__Secure-'}${cookieBase(s)}`;

/** The path a link opens at. */
export const sharePath = (token: string) => `/share/${token}/`;

/** A new link's secret: 24 random bytes, base64url (32 characters). */
export const newToken = () => randomBytes(24).toString('base64url');

const TOKEN = /^[A-Za-z0-9_-]{20,64}$/;

/** Whether a link is open now: not revoked and not past its expiry. */
export function isLive(link: Pick<ShareLink, 'revoked_at' | 'expires_at'>, now = Date.now()): boolean {
  return !link.revoked_at && (!link.expires_at || Date.parse(link.expires_at) > now);
}

/** A live link by its token, or null (unknown, revoked, expired, its entry in the trash, or its campaign
 * no longer a draft: a newsletter is shared while it is being written). */
export async function liveLink(token: string | null | undefined): Promise<ShareLink | null> {
  if (!token || !TOKEN.test(token)) return null;
  const { data } = await siteDb().from('share_links').select(`${COLUMNS}, entries(status), campaigns(status)`).eq('token', token).maybeSingle();
  if (!data || !isLive(data)) return null;
  const open = data.campaign_id ? data.campaigns?.status === 'draft' : !!data.entries && data.entries.status !== 'trash';
  if (!open) return null;
  const { entries: _e, campaigns: _c, ...link } = data;
  return link as ShareLink;
}

const key = () => createHmac('sha256', env('AUTH_SECRET') ?? '').update('share-link').digest();

/** What a guest's cookie is signed over: the link, its protection and its password, so changing either ends it. */
const signature = (link: Pick<ShareLink, 'token' | 'access' | 'password_hash'>) => createHmac('sha256', key()).update(`${link.token}:${link.access}:${link.password_hash ?? ''}`).digest('base64url');

/** The cookie value letting a guest in through a link. */
export const cookieValue = (link: Pick<ShareLink, 'token' | 'access' | 'password_hash'>) => `${link.token}.${signature(link)}`;

/** The token a guest's cookie for a subject names, if it has one (not yet checked). */
export function cookieToken(request: Request, subject: ShareSubject): { token: string; sig: string } | null {
  const name = `${cookieBase(subject)}=`;
  const raw = (request.headers.get('cookie') ?? '').split(/;\s*/).find((c) => c.startsWith(name) || c.startsWith(`__Secure-${name}`));
  const value = raw?.slice(raw.indexOf('=') + 1) ?? '';
  const dot = value.lastIndexOf('.');
  return dot > 0 ? { token: value.slice(0, dot), sig: value.slice(dot + 1) } : null;
}

/** Whether a cookie's signature fits the link as it is now. */
export function cookieFits(link: Pick<ShareLink, 'token' | 'access' | 'password_hash'>, sig: string): boolean {
  if (link.access === 'login') return false;
  const want = Buffer.from(signature(link));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}

const ENTRY_PATH = /^\/(?:admin\/(?:edit|preview)|api\/admin\/entries)\/(\d+)\/?$/;
const CAMPAIGN_PATH = /^\/(?:api\/)?admin\/shared-email\/(\d+)\/?$/;
const pathSubject = (path: string): ShareSubject | null => {
  const e = path.match(ENTRY_PATH);
  if (e) return { kind: 'entry', id: Number(e[1]) };
  const c = path.match(CAMPAIGN_PATH);
  return c ? { kind: 'campaign', id: Number(c[1]) } : null;
};

/**
 * What a guest's request is about: the entry or campaign in its address (the editor, the preview, the
 * save), else, for the editor's other calls (its queries, previews, who is signed in), the one in the
 * address of the editor page that made them (its Referer, sent for the site's own requests:
 * Referrer-Policy same-origin).
 */
export function requestSubject(request: Request, pathname: string): ShareSubject | null {
  const own = pathSubject(pathname);
  if (own) return own;
  try {
    const from = new URL(request.headers.get('referer') ?? '');
    if (from.origin !== new URL(request.url).origin || from.pathname.startsWith('/api/')) return null;
    return pathSubject(from.pathname);
  } catch {
    return null;
  }
}

/** The live link a guest's cookie lets them use for what the request is about, or null. */
export async function guestLink(request: Request, pathname = new URL(request.url).pathname): Promise<ShareLink | null> {
  const subject = requestSubject(request, pathname);
  if (!subject) return null;
  const c = cookieToken(request, subject);
  if (!c) return null;
  const link = await liveLink(c.token);
  return link && sameSubject(subjectOf(link), subject) && cookieFits(link, c.sig) ? link : null;
}

/** The Set-Cookie header letting a guest in through `link`, for a week or until the link expires. */
export function guestCookie(link: ShareLink): string {
  const week = COOKIE_DAYS * 86400;
  const left = link.expires_at ? Math.floor((Date.parse(link.expires_at) - Date.now()) / 1000) : week;
  const secure = import.meta.env?.DEV ? '' : '; Secure';
  return `${shareCookieName(subjectOf(link))}=${cookieValue(link)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(60, Math.min(week, left))}${secure}`;
}

/** Whether a password opens a link. */
export async function passwordOpens(link: ShareLink, password: string): Promise<boolean> {
  if (link.access !== 'password' || !link.password_hash || !password) return false;
  return verifyPassword({ hash: link.password_hash, password }).catch(() => false);
}

/**
 * The addresses a guest may reach with an edit or view link, beside /share/<token>/. An entry's: its
 * preview, and for edit links its editor and the APIs the editor uses (its queries, read as the guest
 * role; the entry's own save, which checks what a guest may save; who is signed in; the canvas's data). A
 * campaign's (edit links only; a view link's email is shown at /share/<token>/): its guest editor and save,
 * the email builder's queries (media), previews, and Entries and Events blocks.
 */
export function guestMay(link: Pick<ShareLink, 'entry_id' | 'campaign_id' | 'mode'>, method: string, pathname: string): boolean {
  const read = method === 'GET' || method === 'HEAD';
  if (link.campaign_id) {
    if (link.mode !== 'edit') return false;
    const id = link.campaign_id;
    if (new RegExp(`^/admin/shared-email/${id}/?$`).test(pathname)) return read;
    if (new RegExp(`^/api/admin/shared-email/${id}/?$`).test(pathname)) return method === 'PUT';
    if (pathname === '/api/admin/db' || pathname === '/api/admin/mailing/preview' || pathname === '/api/admin/email-events') return method === 'POST';
    return pathname === '/api/admin/me' && read;
  }
  const id = link.entry_id;
  if (new RegExp(`^/admin/preview/${id}/?$`).test(pathname)) return read || method === 'POST';
  if (link.mode !== 'edit') return false;
  if (new RegExp(`^/admin/edit/${id}/?$`).test(pathname)) return read;
  if (new RegExp(`^/api/admin/entries/${id}/?$`).test(pathname)) return method === 'PUT';
  if (pathname === '/api/admin/db') return method === 'POST';
  if (pathname === '/api/admin/me' || pathname === '/api/admin/share-data') return read;
  return false;
}

/** Count a link's use (opening its address): written only over the count it read, so two opens at once
 * both count (the loser reads again; a few tries). */
export async function countUse(link: Pick<ShareLink, 'id' | 'uses'>): Promise<void> {
  let uses = link.uses;
  for (let i = 0; i < 5; i++) {
    const { data } = await siteDb().from('share_links').update({ uses: uses + 1, last_used_at: new Date().toISOString() }).eq('id', link.id).eq('uses', uses).select('id');
    if (data?.length) return;
    const { data: now } = await siteDb().from('share_links').select('uses').eq('id', link.id).maybeSingle();
    if (!now) return;
    uses = now.uses;
  }
}

export interface NewShare {
  /** An entry, or (`campaign`) a newsletter draft: one of the two. */
  entry?: number;
  campaign?: number;
  mode: ShareMode;
  access: ShareAccess;
  password?: string;
  label?: string;
  /** ISO date and time, or empty for none. */
  expires?: string | null;
}

/** A link's settings checked: what's wrong with them, or null. */
export function shareProblem(s: Partial<NewShare>): string | null {
  const ok = (n: unknown) => Number.isInteger(n) && (n as number) > 0;
  if (ok(s.entry) === ok(s.campaign)) return 'Choose a page or newsletter to share.';
  if (!SHARE_MODES.includes(s.mode as ShareMode)) return 'Choose View or Edit.';
  if (!SHARE_ACCESS.includes(s.access as ShareAccess)) return 'Choose who can open the link.';
  if (s.access === 'password' && (s.password ?? '').length < SHARE_PASSWORD_MIN) return `The password needs at least ${SHARE_PASSWORD_MIN} characters.`;
  if (s.expires && (Number.isNaN(Date.parse(s.expires)) || Date.parse(s.expires) <= Date.now())) return 'The expiry must be in the future.';
  return null;
}

/** Make a link. */
export async function createShare(s: NewShare, by: string | null): Promise<ShareLink> {
  const problem = shareProblem(s);
  if (problem) throw new Error(problem);
  const row = {
    token: newToken(),
    entry_id: s.entry ?? null,
    campaign_id: s.campaign ?? null,
    mode: s.mode,
    access: s.access,
    password_hash: s.access === 'password' ? await hashPassword(s.password!) : null,
    label: String(s.label ?? '').trim().slice(0, 120),
    expires_at: s.expires ? new Date(s.expires).toISOString() : null,
    created_by: by || null,
  };
  const { data, error } = await siteDb().from('share_links').insert(row).select(COLUMNS).single();
  if (error) throw new Error(error.message);
  return data as ShareLink;
}

/** Revoke a link of an entry: it stops working at once. */
export async function revokeShare(id: number): Promise<void> {
  const { error } = await siteDb().from('share_links').update({ revoked_at: new Date().toISOString() }).eq('id', id).is('revoked_at', null);
  if (error) throw new Error(error.message);
}

/** An entry's or campaign's links, newest first, without their password hashes. */
export async function sharesOf(subject: ShareSubject): Promise<(Omit<ShareLink, 'password_hash'> & { live: boolean })[]> {
  const { data, error } = await siteDb().from('share_links').select(COLUMNS).eq(subject.kind === 'campaign' ? 'campaign_id' : 'entry_id', subject.id).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(({ password_hash: _p, ...l }: ShareLink) => ({ ...l, live: isLive(l) }));
}
