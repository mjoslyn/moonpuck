// The Share dialog of the page editor and of a newsletter draft (the campaign editor): its private links
// (src/lib/share/links.ts, /api/admin/shares). A new link: who can open it, as three cards, which decides what
// it does: signed-in editors and admins get the editor (an edit link); a password or anyone with the link
// view the page or email and comment on it (a view link). Under More options a name and an expiry (30 days unless changed: 1, 7 or 30 days, never, or a date). The link made is shown and
// copied. Links already made are listed to copy or turn off (asked in ConfirmModal, not the browser's box).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import ConfirmModal from './ConfirmModal';

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

const ACCESS: Record<Access, { label: string; note: string; icon: ReactNode }> = {
  login: {
    label: 'Editors and admins',
    note: 'Signed in; opens the editor',
    icon: <path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3z" />,
  },
  password: {
    label: 'With a password',
    note: 'View and comment',
    icon: (
      <>
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </>
    ),
  },
  anyone: {
    label: 'Anyone with the link',
    note: 'View and comment, no password',
    icon: (
      <>
        <path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
        <path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
      </>
    ),
  },
};
const MIN_PASSWORD = 6;
/** How long a link lasts unless changed (SHARE_DEFAULT_DAYS on the server). */
const DEFAULT_DAYS = 30;
const EXPIRY_CHOICES: { days: number | null; label: string }[] = [
  { days: 1, label: '1 day' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: null, label: 'Never' },
];

/** A date and time `days` from now as a datetime-local input takes it (the browser's own time). */
function inDays(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });

function Icon({ children, className = 'h-4 w-4' }: { children: ReactNode; className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

/** What is shared: an entry (a page) or a campaign (a newsletter draft). */
export type ShareTarget = { entry: number } | { campaign: number };

export default function ShareDialog({ target, title, onClose }: { target: ShareTarget; title: string; onClose: () => void }) {
  const email = 'campaign' in target;
  const what = email ? 'email' : 'page';
  const query = email ? `campaign=${target.campaign}` : `entry=${target.entry}`;
  const [links, setLinks] = useState<Link[] | null>(null);
  const [access, setAccess] = useState<Access>('anyone');
  /** What a link does follows who opens it: editors edit, everyone else views and comments. */
  const mode: Mode = access === 'login' ? 'edit' : 'view';
  const [password, setPassword] = useState('');
  const [label, setLabel] = useState('');
  const [expires, setExpires] = useState(() => inDays(DEFAULT_DAYS));
  const [expiryDays, setExpiryDays] = useState<number | null | 'custom'>(DEFAULT_DAYS);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [made, setMade] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [turningOff, setTurningOff] = useState<Link | null>(null);
  const [offBusy, setOffBusy] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  const passwordBox = useRef<HTMLInputElement>(null);
  const chooseAccess = (a: Access) => {
    setAccess(a);
    if (a === 'password') requestAnimationFrame(() => passwordBox.current?.focus());
  };
  const chooseExpiry = (days: number | null) => {
    setExpiryDays(days);
    setExpires(days === null ? '' : inDays(days));
  };

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
      setMade(url);
    }
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (access === 'password' && password.length < MIN_PASSWORD) {
      passwordBox.current?.focus();
      return setError(`The password needs at least ${MIN_PASSWORD} characters.`);
    }
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
    chooseExpiry(DEFAULT_DAYS);
    copy(url);
    load();
  };

  const turnOff = async () => {
    if (!turningOff) return;
    setOffBusy(true);
    const res = await fetch('/api/admin/shares', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'revoke', id: turningOff.id }) }).catch(() => null);
    setOffBusy(false);
    if (!res?.ok) setError((res && (await res.text())) || 'Couldn’t turn the link off.');
    else if (made === turningOff.url) setMade(null);
    setTurningOff(null);
    load();
  };

  const field = 'w-full rounded-md border border-admin-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-admin-accent focus:ring-2 focus:ring-admin-accent/15';
  const live = (links ?? []).filter((l) => l.live);
  const ended = (links ?? []).filter((l) => !l.live);
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-admin-ink/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && !turningOff && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-title"
        className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-xl bg-white text-sm shadow-2xl"
        onKeyDown={(e) => e.key === 'Escape' && !turningOff && onClose()}
      >
        <header className="flex items-center justify-between gap-3 bg-admin-bar px-6 py-4 text-admin-on-bar">
          <div className="flex min-w-0 items-center gap-3">
            <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-admin-accent text-white">
              <Icon className="h-4.5 w-4.5">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
              </Icon>
            </span>
            <div className="min-w-0">
              <h2 id="share-title" className="m-0 text-lg font-semibold leading-tight">
                Share
              </h2>
              <p className="m-0 truncate text-sm text-admin-on-bar/70">{title}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-admin-on-bar/40 px-3 text-sm font-medium text-admin-on-bar hover:border-admin-on-bar hover:bg-admin-on-bar/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-admin-on-bar"
            aria-label="Close"
          >
            <Icon className="h-4 w-4">
              <path d="M6 6l12 12M18 6 6 18" />
            </Icon>
            Close
          </button>
        </header>

        <div className="overflow-y-auto px-6 pt-5 pb-6">
          <form onSubmit={create} className="rounded-lg border border-admin-ink/10 bg-admin-ink/[0.02] p-4">
            <fieldset className="m-0 border-0 p-0">
              <legend className="mb-2 p-0 text-xs font-semibold tracking-wide text-admin-muted uppercase">Who can open it</legend>
              <div className="grid grid-cols-3 gap-2 max-sm:grid-cols-1">
                {(Object.keys(ACCESS) as Access[]).map((a) => (
                  <label
                    key={a}
                    className={`flex cursor-pointer flex-col gap-1 rounded-lg border bg-white p-3 transition focus-within:ring-2 focus-within:ring-admin-accent/30 ${access === a ? 'border-admin-accent shadow-[inset_0_0_0_1px_var(--color-admin-accent)]' : 'border-admin-ink/15 hover:border-admin-ink/35'}`}
                  >
                    <input ref={access === a ? first : undefined} type="radio" name="share-access" className="sr-only" checked={access === a} onChange={() => chooseAccess(a)} />
                    <span className={access === a ? 'text-admin-accent' : 'text-admin-muted'}>
                      <Icon className="h-5 w-5">{ACCESS[a].icon}</Icon>
                    </span>
                    <span className="font-medium leading-tight text-admin-ink">{ACCESS[a].label}</span>
                    <span className="text-xs leading-tight text-admin-muted">{ACCESS[a].note}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {access === 'password' && (
              <label className="mt-3 block">
                <span className="mb-1 block text-xs font-medium text-admin-muted">Password (at least {MIN_PASSWORD} characters; give it to them separately)</span>
                <input ref={passwordBox} className={field} type="text" autoComplete="off" spellCheck={false} value={password} onChange={(e) => setPassword(e.target.value)} />
              </label>
            )}

            <p className="mt-3 flex items-start gap-2 rounded-md bg-white px-3 py-2 text-xs text-admin-muted">
              <Icon className="mt-px h-3.5 w-3.5 shrink-0">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8h.01M11 12h1v4h1" />
              </Icon>
              <span>
                {mode === 'edit'
                  ? `They sign in and get ${email ? 'the campaign screen' : 'the editor'}, as usual.`
                  : `They see the ${what}${email ? ' as a subscriber would' : ' as visitors will'} and can comment on its ${email ? 'blocks' : 'blocks and sections'}; comments show under Comments.`}
                {email ? ' Works while the newsletter is a draft.' : ''}
              </span>
            </p>

            <button type="button" aria-expanded={more} onClick={() => setMore((m) => !m)} className="mt-4 flex items-center gap-1 text-xs font-medium text-admin-muted hover:text-admin-ink">
              <Icon className={`h-3.5 w-3.5 transition ${more ? 'rotate-90' : ''}`}>
                <path d="m9 6 6 6-6 6" />
              </Icon>
              More options
              <span className="font-normal">
                · {label ? `“${label}”, ` : ''}
                {expires ? `expires ${day(new Date(expires).toISOString())}` : 'never expires'}
              </span>
            </button>
            {more && (
              <div className="mt-3 space-y-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-admin-muted">Name (only you see it)</span>
                  <input className={field} value={label} maxLength={120} placeholder="e.g. Board review" onChange={(e) => setLabel(e.target.value)} />
                </label>
                <div>
                  <span className="mb-1 block text-xs font-medium text-admin-muted">Expires</span>
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Expires">
                    {EXPIRY_CHOICES.map((c) => (
                      <button
                        key={c.label}
                        type="button"
                        aria-pressed={expiryDays === c.days}
                        onClick={() => chooseExpiry(c.days)}
                        className={`rounded-full border px-3 py-1 text-xs ${expiryDays === c.days ? 'border-admin-accent bg-admin-accent text-white' : 'border-admin-ink/15 bg-white hover:border-admin-ink/40'}`}
                      >
                        {c.label}
                      </button>
                    ))}
                    <input
                      type="datetime-local"
                      aria-label="Expires on"
                      className={`rounded-full border px-3 py-0.5 text-xs outline-none ${expiryDays === 'custom' ? 'border-admin-accent' : 'border-admin-ink/15'}`}
                      value={expires}
                      onChange={(e) => {
                        setExpires(e.target.value);
                        setExpiryDays(e.target.value ? 'custom' : null);
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {error && (
              <p role="alert" className="mt-3 rounded-md bg-[#c4592a]/10 px-3 py-2 text-[#a8481f]">
                {error}
              </p>
            )}
            <div className="mt-4 flex justify-end">
              <button disabled={busy} className="rounded-md bg-admin-ink px-4 py-2 font-medium text-white hover:bg-admin-accent disabled:opacity-50">
                {busy ? 'Making…' : 'Create link'}
              </button>
            </div>
          </form>

          {made && (
            <div className="mt-4 rounded-lg border border-[#6b8f71]/30 bg-[#6b8f71]/5 p-3" role="status">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-[#4d6b52]">
                <Icon className="h-3.5 w-3.5">
                  <path d="m5 12 5 5L20 7" />
                </Icon>
                {copied === made ? 'Link created and copied. Paste it into an email or message.' : 'Link created.'}
              </p>
              <div className="flex gap-2">
                <input readOnly className={`${field} font-mono text-xs`} value={made} onFocus={(e) => e.target.select()} />
                <button type="button" onClick={() => copy(made)} className="shrink-0 rounded-md border border-admin-ink/20 bg-white px-3 font-medium hover:border-admin-accent hover:text-admin-accent">
                  {copied === made ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          )}

          <h3 className="mt-6 mb-2 text-xs font-semibold tracking-wide text-admin-muted uppercase">Links on now {links ? `(${live.length})` : ''}</h3>
          {!links && <p className="text-admin-muted">Loading…</p>}
          {links && !live.length && <p className="rounded-lg border border-dashed border-admin-ink/15 p-4 text-center text-admin-muted">No links yet. Create one above.</p>}
          <ul className="m-0 list-none space-y-2 p-0">
            {live.map((l) => (
              <li key={l.id} className="rounded-lg border border-admin-ink/10 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium text-admin-ink">{l.label || (l.mode === 'edit' ? 'Editor link' : 'Comment link')}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${l.mode === 'edit' ? 'bg-admin-accent/10 text-admin-accent' : 'bg-admin-ink/5 text-admin-muted'}`}>{l.mode === 'edit' ? 'Opens the editor' : 'View and comment'}</span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-admin-ink/5 px-2 py-0.5 text-[11px] text-admin-muted">
                        <Icon className="h-3 w-3">{ACCESS[l.access].icon}</Icon>
                        {ACCESS[l.access].label}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-admin-muted">
                      {l.expires_at ? `Expires ${day(l.expires_at)}` : 'Never expires'} · opened {l.uses} time{l.uses === 1 ? '' : 's'}
                      {l.last_used_at ? `, last ${when(l.last_used_at)}` : ''}
                    </div>
                    <div className="text-xs text-admin-muted">
                      Made {day(l.created_at)}
                      {l.created_by_name ? ` by ${l.created_by_name}` : ''}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <button type="button" onClick={() => copy(l.url)} className="rounded-md border border-admin-ink/15 px-2.5 py-1 text-xs font-medium hover:border-admin-accent hover:text-admin-accent">
                      {copied === l.url ? 'Copied' : 'Copy'}
                    </button>
                    <button type="button" onClick={() => setTurningOff(l)} className="rounded-md border border-admin-ink/15 px-2.5 py-1 text-xs font-medium text-[#a8481f] hover:border-[#c4592a]">
                      Turn off
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {ended.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-admin-muted hover:text-admin-ink">Turned off or expired ({ended.length})</summary>
              <ul className="m-0 mt-2 list-none space-y-1 p-0 text-xs text-admin-muted">
                {ended.map((l) => (
                  <li key={l.id}>
                    {l.label || (l.mode === 'edit' ? 'Editor link' : 'Comment link')}: {l.revoked_at ? `turned off ${when(l.revoked_at)}` : `expired ${when(l.expires_at!)}`}, opened {l.uses} time{l.uses === 1 ? '' : 's'}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>
      {turningOff && (
        <ConfirmModal title="Turn this link off?" confirmLabel="Turn off" busy={offBusy} onConfirm={turnOff} onCancel={() => setTurningOff(null)}>
          {turningOff.label ? <strong className="text-admin-ink">{turningOff.label}</strong> : 'This link'} stops working at once: anyone using it loses access to the {what}. This can’t be undone, but you can create a new link.
        </ConfirmModal>
      )}
    </div>
  );
}
