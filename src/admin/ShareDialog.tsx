// The Share dialog of the page editor and of a newsletter draft (the campaign editor): its private links
// (src/lib/share/links.ts, /api/admin/shares), to view the page or email, or edit it as a draft, each opened by signed-in editors only, with a password, or by
// anyone with the link; with an optional name and expiry. Links already made are listed to copy or turn off.
import { useEffect, useRef, useState } from 'react';

type Mode = 'view' | 'edit';
type Access = 'login' | 'password' | 'anyone';

interface Link {
  id: number;
  url: string;
  mode: Mode;
  access: Access;
  label: string;
  expires_at: string | null;
  revoked_at: string | null;
  uses: number;
  last_used_at: string | null;
  created_at: string;
  created_by_name: string;
  live: boolean;
}

const ACCESS_LABEL: Record<Access, string> = {
  login: 'Signed-in editors and admins',
  password: 'Anyone with the link and the password',
  anyone: 'Anyone with the link',
};
const MIN_PASSWORD = 6;
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** What is shared: an entry (a page) or a campaign (a newsletter draft). */
export type ShareTarget = { entry: number } | { campaign: number };

export default function ShareDialog({ target, title, onClose }: { target: ShareTarget; title: string; onClose: () => void }) {
  const email = 'campaign' in target;
  const query = email ? `campaign=${target.campaign}` : `entry=${target.entry}`;
  const [links, setLinks] = useState<Link[] | null>(null);
  const [mode, setMode] = useState<Mode>('view');
  const [access, setAccess] = useState<Access>('login');
  const [password, setPassword] = useState('');
  const [label, setLabel] = useState('');
  const [expires, setExpires] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [made, setMade] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const first = useRef<HTMLInputElement>(null);

  const load = async () => {
    const res = await fetch(`/api/admin/shares?${query}`).catch(() => null);
    if (!res?.ok) return setError((res && (await res.text())) || 'Couldn’t load the links.');
    setLinks(await res.json());
  };
  useEffect(() => {
    load();
    first.current?.focus();
  }, []);

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      window.setTimeout(() => setCopied((c) => (c === url ? null : c)), 2000);
    } catch {
      window.prompt('Copy the link:', url);
    }
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (access === 'password' && password.length < MIN_PASSWORD) return setError(`The password needs at least ${MIN_PASSWORD} characters.`);
    setBusy(true);
    setError('');
    const body = { action: 'create', ...target, mode, access, password: access === 'password' ? password : undefined, label, expires: expires ? new Date(expires).toISOString() : null };
    const res = await fetch('/api/admin/shares', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError((res && (await res.text())) || 'Couldn’t make the link. Try again.');
    const { url } = (await res.json()) as { url: string };
    setMade(url);
    setPassword('');
    setLabel('');
    setExpires('');
    copy(url);
    load();
  };

  const revoke = async (link: Link) => {
    if (!window.confirm('Turn this link off? Anyone using it loses access at once.')) return;
    const res = await fetch('/api/admin/shares', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'revoke', id: link.id }) }).catch(() => null);
    if (!res?.ok) return setError((res && (await res.text())) || 'Couldn’t turn the link off.');
    if (made === link.url) setMade(null);
    load();
  };

  const field = 'w-full rounded border border-admin-ink/15 bg-white px-2 py-1.5 text-sm outline-none focus:border-admin-accent';
  const live = (links ?? []).filter((l) => l.live);
  const ended = (links ?? []).filter((l) => !l.live);
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-admin-ink/40 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="share-title" className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded bg-white text-sm shadow-xl" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <div className="flex items-baseline justify-between gap-3 border-b border-admin-ink/10 px-5 py-3">
          <h2 id="share-title" className="truncate text-base font-medium">Share “{title}”</h2>
          <button type="button" onClick={onClose} className="text-admin-muted hover:text-admin-ink" aria-label="Close">
            ×
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">
          <form onSubmit={create} className="space-y-3">
            <fieldset>
              <legend className="mb-1 text-xs font-medium text-admin-muted">People with the link can</legend>
              <label className="mr-4 inline-flex items-center gap-1.5">
                <input ref={first} type="radio" name="share-mode" checked={mode === 'view'} onChange={() => setMode('view')} /> {email ? 'View the email' : 'View the page'}
              </label>
              <label className="inline-flex items-center gap-1.5">
                <input type="radio" name="share-mode" checked={mode === 'edit'} onChange={() => setMode('edit')} /> Edit it as a draft
              </label>
              {mode === 'edit' && !email && <p className="mt-1 text-xs text-admin-muted">Their changes are saved as a draft for you to publish. People without an account can’t add or change HTML or Embed blocks.</p>}
              {mode === 'edit' && email && <p className="mt-1 text-xs text-admin-muted">They change the subject, the preview line, the email and its plain text. Only editors choose who it goes to and send it.</p>}
              {email && <p className="mt-1 text-xs text-admin-muted">Links work while the newsletter is a draft.</p>}
            </fieldset>
            <fieldset>
              <legend className="mb-1 text-xs font-medium text-admin-muted">Who can open it</legend>
              {(Object.keys(ACCESS_LABEL) as Access[]).map((a) => (
                <label key={a} className="flex items-center gap-1.5">
                  <input type="radio" name="share-access" checked={access === a} onChange={() => setAccess(a)} /> {ACCESS_LABEL[a]}
                </label>
              ))}
            </fieldset>
            {access === 'password' && (
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-admin-muted">Password (at least {MIN_PASSWORD} characters)</span>
                <input className={field} type="text" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
              </label>
            )}
            <div className="flex gap-3">
              <label className="block flex-1">
                <span className="mb-1 block text-xs font-medium text-admin-muted">Name (optional)</span>
                <input className={field} value={label} maxLength={120} placeholder="e.g. Board review" onChange={(e) => setLabel(e.target.value)} />
              </label>
              <label className="block flex-1">
                <span className="mb-1 block text-xs font-medium text-admin-muted">Expires (optional)</span>
                <input className={field} type="datetime-local" value={expires} onChange={(e) => setExpires(e.target.value)} />
              </label>
            </div>
            {error && <p role="alert" className="text-[#c4592a]">{error}</p>}
            <button disabled={busy} className="rounded bg-admin-ink px-4 py-1.5 font-medium text-white hover:bg-admin-accent disabled:opacity-50">
              {busy ? 'Making…' : 'Make link'}
            </button>
          </form>
          {made && (
            <div className="mt-4 rounded border border-[#6b8f71]/30 bg-[#6b8f71]/5 p-3">
              <p className="mb-1 text-xs text-[#4d6b52]">{copied === made ? 'Link made and copied.' : 'Link made.'}</p>
              <div className="flex gap-2">
                <input readOnly className={`${field} font-mono text-xs`} value={made} onFocus={(e) => e.target.select()} />
                <button type="button" onClick={() => copy(made)} className="rounded border border-admin-ink/20 px-3 hover:border-admin-accent hover:text-admin-accent">
                  Copy
                </button>
              </div>
            </div>
          )}
          <h3 className="mt-6 mb-2 text-xs font-semibold tracking-wider text-admin-muted uppercase">Links</h3>
          {!links && <p className="text-admin-muted">Loading…</p>}
          {links && !live.length && <p className="text-admin-muted">No links on now.</p>}
          <ul className="divide-y divide-admin-ink/10">
            {live.map((l) => (
              <li key={l.id} className="py-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">
                    {l.label || (l.mode === 'edit' ? 'Edit link' : 'View link')}
                    <span className="ml-2 rounded-full bg-admin-accent/10 px-1.5 text-[11px] font-normal text-admin-accent">{l.mode === 'edit' ? 'Edit' : 'View'}</span>
                  </span>
                  <span className="flex shrink-0 gap-3">
                    <button type="button" onClick={() => copy(l.url)} className="text-admin-muted underline hover:text-admin-accent">
                      {copied === l.url ? 'Copied' : 'Copy'}
                    </button>
                    <button type="button" onClick={() => revoke(l)} className="text-admin-muted underline hover:text-[#c4592a]">
                      Turn off
                    </button>
                  </span>
                </div>
                <div className="text-xs text-admin-muted">
                  {ACCESS_LABEL[l.access]} · {l.expires_at ? `expires ${when(l.expires_at)}` : 'no expiry'} · opened {l.uses} time{l.uses === 1 ? '' : 's'}
                  {l.last_used_at ? `, last ${when(l.last_used_at)}` : ''}
                </div>
                <div className="text-xs text-admin-muted">
                  Made {when(l.created_at)}
                  {l.created_by_name ? ` by ${l.created_by_name}` : ''}
                </div>
              </li>
            ))}
          </ul>
          {ended.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-admin-muted">Turned off or expired ({ended.length})</summary>
              <ul className="mt-1 divide-y divide-admin-ink/10 text-xs text-admin-muted">
                {ended.map((l) => (
                  <li key={l.id} className="py-1.5">
                    {l.label || (l.mode === 'edit' ? 'Edit link' : 'View link')}: {l.revoked_at ? `turned off ${when(l.revoked_at)}` : `expired ${when(l.expires_at!)}`}, opened {l.uses} time{l.uses === 1 ? '' : 's'}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
