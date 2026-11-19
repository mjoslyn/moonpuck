// Share links (server only): a private address for one entry (/share/<token>/), to view it as it is
// saved (unpublished changes included) or to edit it as a draft. Each is protected one of three ways
// (`access`): login (signed-in editors and admins only), password, or anyone with the link. Guests
// (password and anyone links) get a signed cookie naming the link, one per entry (`site.share.<entry id>`,
// so links to several pages work side by side), which the middleware turns into the `guest` role for that
// one entry (src/lib/db/policies.ts). Revoking a link, its expiry,
// a new password or a changed protection ends every guest's access at once: the cookie is signed over
// the link's token, protection and password hash, and the link is read again on each request.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { hashPassword, verifyPassword } from 'better-auth/crypto';
import { siteDb } from '../db/site';
import { env } from '../env';

export type ShareMode = 'view' | 'edit';
export type ShareAccess = 'login' | 'password' | 'anyone';

export interface ShareLink {
  id: number;
  token: string;
  entry_id: number;
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

const COLUMNS = 'id, token, entry_id, mode, access, password_hash, label, expires_at, revoked_at, uses, last_used_at, created_by, created_at';

export const SHARE_COOKIE = 'site.share';
/** A guest's cookie for an entry, as set: __Secure- outside astro dev, as the session cookie (src/lib/auth). */
export const shareCookieName = (entryId: number) => `${import.meta.env?.DEV ? '' : '__Secure-'}${SHARE_COOKIE}.${entryId}`;

/** The path a link opens at. */
export const sharePath = (token: string) => `/share/${token}/`;

/** A new link's secret: 24 random bytes, base64url (32 characters). */
export const newToken = () => randomBytes(24).toString('base64url');

const TOKEN = /^[A-Za-z0-9_-]{20,64}$/;

/** Whether a link is open now: not revoked and not past its expiry. */
export function isLive(link: Pick<ShareLink, 'revoked_at' | 'expires_at'>, now = Date.now()): boolean {
  return !link.revoked_at && (!link.expires_at || Date.parse(link.expires_at) > now);
}

/** A live link by its token, or null (unknown, revoked, expired, or its entry in the trash). */
export async function liveLink(token: string | null | undefined): Promise<ShareLink | null> {
  if (!token || !TOKEN.test(token)) return null;
  const { data } = await siteDb().from('share_links').select(`${COLUMNS}, entries(status)`).eq('token', token).maybeSingle();
  if (!data || !isLive(data) || !data.entries || data.entries.status === 'trash') return null;
  const { entries: _e, ...link } = data;
  return link as ShareLink;
}

const key = () => createHmac('sha256', env('AUTH_SECRET') ?? '').update('share-link').digest();

/** What a guest's cookie is signed over: the link, its protection and its password, so changing either ends it. */
const signature = (link: Pick<ShareLink, 'token' | 'access' | 'password_hash'>) => createHmac('sha256', key()).update(`${link.token}:${link.access}:${link.password_hash ?? ''}`).digest('base64url');

/** The cookie value letting a guest in through a link. */
export const cookieValue = (link: Pick<ShareLink, 'token' | 'access' | 'password_hash'>) => `${link.token}.${signature(link)}`;

/** The token a guest's cookie for an entry names, if it has one (not yet checked). */
export function cookieToken(request: Request, entryId: number): { token: string; sig: string } | null {
  const name = `${SHARE_COOKIE}.${entryId}=`;
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

/**
 * The entry a guest's request is about: the one in its address (the editor, the preview, the save), else,
 * for the editor's other calls (its queries, who is signed in), the one in the address of the editor page
 * that made them (its Referer, sent for the site's own requests: Referrer-Policy same-origin).
 */
export function requestEntry(request: Request, pathname: string): number | null {
  const own = pathname.match(ENTRY_PATH);
  if (own) return Number(own[1]);
  try {
    const from = new URL(request.headers.get('referer') ?? '');
    if (from.origin !== new URL(request.url).origin) return null;
    const m = from.pathname.match(/^\/admin\/(?:edit|preview)\/(\d+)\/?$/);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

/** The live link a guest's cookie lets them use for the entry the request is about, or null. */
export async function guestLink(request: Request, pathname = new URL(request.url).pathname): Promise<ShareLink | null> {
  const entry = requestEntry(request, pathname);
  if (!entry) return null;
  const c = cookieToken(request, entry);
  if (!c) return null;
  const link = await liveLink(c.token);
  return link && link.entry_id === entry && cookieFits(link, c.sig) ? link : null;
}

/** The Set-Cookie header letting a guest in through `link`, for a week or until the link expires. */
export function guestCookie(link: ShareLink): string {
  const week = COOKIE_DAYS * 86400;
  const left = link.expires_at ? Math.floor((Date.parse(link.expires_at) - Date.now()) / 1000) : week;
  const secure = import.meta.env?.DEV ? '' : '; Secure';
  return `${shareCookieName(link.entry_id)}=${cookieValue(link)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(60, Math.min(week, left))}${secure}`;
}

/** Whether a password opens a link. */
export async function passwordOpens(link: ShareLink, password: string): Promise<boolean> {
  if (link.access !== 'password' || !link.password_hash || !password) return false;
  return verifyPassword({ hash: link.password_hash, password }).catch(() => false);
}

/**
 * The addresses a guest may reach with an edit or view link, beside /share/<token>/: the entry's editor
 * and preview, and the APIs the editor uses (its queries, read as the guest role; the entry's own save,
 * which checks what a guest may save; who is signed in).
 */
export function guestMay(link: Pick<ShareLink, 'entry_id' | 'mode'>, method: string, pathname: string): boolean {
  const id = link.entry_id;
  const read = method === 'GET' || method === 'HEAD';
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
  entry: number;
  mode: ShareMode;
  access: ShareAccess;
  password?: string;
  label?: string;
  /** ISO date and time, or empty for none. */
  expires?: string | null;
}

/** A link's settings checked: what's wrong with them, or null. */
export function shareProblem(s: Partial<NewShare>): string | null {
  if (!Number.isInteger(s.entry) || (s.entry as number) <= 0) return 'Choose a page to share.';
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
    entry_id: s.entry,
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

/** An entry's links, newest first, without their password hashes. */
export async function sharesOf(entryId: number): Promise<(Omit<ShareLink, 'password_hash'> & { live: boolean })[]> {
  const { data, error } = await siteDb().from('share_links').select(COLUMNS).eq('entry_id', entryId).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(({ password_hash: _p, ...l }: ShareLink) => ({ ...l, live: isLive(l) }));
}
