// The Comments screen (the admin bar's Comments, /admin/comments/): every page's and newsletter's comments
// (src/lib/share/comments.ts, listComments, through GET /api/admin/share-comments?all), open ones by
// default, newest first, searched by their words, author or block, 50 a page. Each names what it is on, with
// links to its editor and (a page's) preview; Resolve, Reopen and Delete as in the page editor's Comments
// panel. Add a comment: find a page (GET ?pages=) and comment on the whole of it; @handles email the
// editors and admins they name (src/lib/share/mentions.ts). Comments on one block are made in the editor's
// panel or the preview.
import { useEffect, useRef, useState } from 'react';
import ConfirmModal from './ConfirmModal';
import MentionTextarea, { withMentions } from './MentionTextarea';

type Status = 'open' | 'resolved' | 'all';

interface Row {
  id: number;
  block: string;
  block_type: string;
  quote: string;
  body: string;
  author: string;
  guest: boolean;
  status: 'open' | 'resolved';
  resolved_at: string | null;
  resolved_by_name: string;
  created_at: string;
  on: { kind: 'entry' | 'campaign'; id: number; title: string; type: string; editor: string; preview: string | null; trashed: boolean };
}
interface PageHit {
  id: number;
  title: string;
  type: string;
  type_label: string;
  status: string;
}

const PER_PAGE = 50;
/** A block type as the editor names it (as the page editor's Comments panel does). */
const LABELS: Record<string, string> = { text: 'Paragraph', 'media-text': 'Media and text', 'entry-content': 'Page content', 'video-gallery': 'Video gallery' };
const typeLabel = (t: string, whole: string) => (t ? (LABELS[t] ?? t.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase())) : whole);
const when = (s: string) => new Date(s).toLocaleString('en-US', { timeZone: (globalThis as any).__siteTz || undefined, dateStyle: 'medium', timeStyle: 'short' });

const button = 'rounded bg-admin-ink px-3 py-1.5 text-xs font-medium text-white hover:bg-admin-accent disabled:opacity-50';
const card = 'rounded bg-white shadow-[0_0_0_1px_rgba(26,26,46,0.08)]';

export default function CommentsScreen({ types }: { types: Record<string, string> }) {
  const [status, setStatus] = useState<Status>('open');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ comments: Row[]; total: number; open: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<Row | null>(null);

  const load = async () => {
    const p = new URLSearchParams({ all: '1', status, q: search, page: String(page) });
    const res = await fetch(`/api/admin/share-comments?${p}`).catch(() => null);
    if (!res?.ok) return setError((res && (await res.text())) || 'Couldn’t load the comments.');
    setError('');
    setData(await res.json());
  };
  useEffect(() => {
    load();
  }, [status, search, page]);

  const act = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError('');
    const res = await fetch('/api/admin/share-comments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setError((res && (await res.text())) || 'Couldn’t do that. Try again.');
      return false;
    }
    await load();
    return true;
  };

  const pages = data ? Math.max(1, Math.ceil(data.total / PER_PAGE)) : 1;
  const tab = (s: Status, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={status === s}
      onClick={() => {
        setStatus(s);
        setPage(1);
      }}
      className={`border-b-2 px-3 py-2 text-sm ${status === s ? 'border-admin-accent font-medium text-admin-ink' : 'border-transparent text-admin-muted hover:text-admin-ink'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="min-w-0">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-admin-ink/10">
          <div role="tablist" aria-label="Which comments" className="flex">
            {tab('open', `Open${data ? ` (${data.open})` : ''}`)}
            {tab('resolved', 'Resolved')}
            {tab('all', 'All')}
          </div>
          <form
            className="mb-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(q.trim());
              setPage(1);
            }}
          >
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search comments" aria-label="Search comments" className="w-48 rounded border border-admin-ink/20 px-2 py-1 text-sm outline-none focus:border-admin-accent" />
            <button className={button}>Search</button>
          </form>
        </div>
        {error && (
          <p role="alert" className="mt-3 text-sm text-[#c4592a]">
            {error}
          </p>
        )}
        {!data && !error && <p className="mt-4 text-sm text-admin-muted">Loading…</p>}
        {data && !data.comments.length && (
          <p className="mt-6 text-sm text-admin-muted">
            {search ? 'No comments match.' : status === 'open' ? 'No open comments.' : 'No comments yet.'} People with a link that views a page can comment on it, and so can editors, here, in the page editor's Comments panel or on a preview.
          </p>
        )}
        <ol className="m-0 mt-4 list-none space-y-3 p-0">
          {data?.comments.map((r) => (
            <li key={r.id} className={`${card} p-4 text-sm ${r.status === 'open' ? '' : 'opacity-70'}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <a href={r.on.editor} className="font-medium text-admin-ink hover:text-admin-accent">
                    {r.on.title}
                  </a>
                  <span className="text-xs text-admin-muted">
                    {' '}
                    · {r.on.kind === 'campaign' ? 'Newsletter' : (types[r.on.type] ?? r.on.type)}
                    {r.on.trashed ? ' (in the trash)' : ''}
                  </span>
                </div>
                <span className="flex gap-3 text-xs">
                  <a href={r.on.editor} className="underline hover:text-admin-accent">
                    {r.on.kind === 'campaign' ? 'Open the campaign' : 'Open in the editor'}
                  </a>
                  {r.on.preview && !r.on.trashed && (
                    <a href={r.on.preview} target="_blank" rel="noopener" className="underline hover:text-admin-accent">
                      Preview
                    </a>
                  )}
                </span>
              </div>
              <div className="mt-1 text-xs text-admin-muted">
                <span className="font-medium text-admin-ink">{typeLabel(r.block_type, r.on.kind === 'campaign' ? 'Whole email' : 'Whole page')}</span>
                {r.quote && <span>: {r.quote.slice(0, 100)}</span>}
              </div>
              <p className="my-2 whitespace-pre-wrap">{withMentions(r.body)}</p>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-admin-muted">
                <span>
                  {r.author}
                  {r.guest ? ' (share link)' : ''} · {when(r.created_at)}
                  {r.status === 'resolved' && r.resolved_at ? ` · resolved ${when(r.resolved_at)}${r.resolved_by_name ? ` by ${r.resolved_by_name}` : ''}` : ''}
                </span>
                <span className="flex gap-3">
                  <button type="button" disabled={busy} className="underline hover:text-admin-accent" onClick={() => act({ action: r.status === 'open' ? 'resolve' : 'reopen', id: r.id })}>
                    {r.status === 'open' ? 'Resolve' : 'Reopen'}
                  </button>
                  <button type="button" disabled={busy} className="text-[#c4592a] underline" onClick={() => setDeleting(r)}>
                    Delete
                  </button>
                </span>
              </div>
            </li>
          ))}
        </ol>
        {data && pages > 1 && (
          <nav aria-label="Pages" className="mt-4 flex items-center gap-3 text-sm">
            <button type="button" disabled={page <= 1} className="underline disabled:no-underline disabled:opacity-40" onClick={() => setPage(page - 1)}>
              Previous
            </button>
            <span className="text-admin-muted">
              Page {page} of {pages}
            </span>
            <button type="button" disabled={page >= pages} className="underline disabled:no-underline disabled:opacity-40" onClick={() => setPage(page + 1)}>
              Next
            </button>
          </nav>
        )}
      </section>
      <AddComment
        onAdd={async (entry, body) => {
          const ok = await act({ action: 'add', entry, body });
          if (ok && status === 'resolved') setStatus('open');
          return ok;
        }}
        busy={busy}
      />
      {deleting && (
        <ConfirmModal
          title="Delete this comment?"
          confirmLabel="Delete"
          busy={busy}
          onConfirm={async () => {
            await act({ action: 'delete', id: deleting.id });
            setDeleting(null);
          }}
          onCancel={() => setDeleting(null)}
        >
          {deleting.author}’s comment goes for good. To keep it but mark it done, use Resolve.
        </ConfirmModal>
      )}
    </div>
  );
}

/** Find a page and comment on the whole of it. */
function AddComment({ onAdd, busy }: { onAdd: (entry: number, body: string) => Promise<boolean>; busy: boolean }) {
  const [find, setFind] = useState('');
  const [hits, setHits] = useState<PageHit[]>([]);
  const [chosen, setChosen] = useState<PageHit | null>(null);
  const [text, setText] = useState('');
  const asked = useRef(0);
  useEffect(() => {
    if (chosen) return;
    const n = ++asked.current;
    const t = setTimeout(async () => {
      const res = await fetch(`/api/admin/share-comments?pages=${encodeURIComponent(find.trim())}`).catch(() => null);
      if (n === asked.current && res?.ok) setHits(await res.json());
    }, 200);
    return () => clearTimeout(t);
  }, [find, chosen]);

  return (
    <aside className={`${card} h-fit p-4 text-sm`}>
      <h2 className="m-0 text-base font-medium">Add a comment</h2>
      <form
        className="mt-3 space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (chosen && (await onAdd(chosen.id, text))) setText('');
        }}
      >
        {chosen ? (
          <div className="flex items-start justify-between gap-2 rounded border border-admin-ink/15 px-2 py-1.5">
            <span>
              <span className="font-medium">{chosen.title || '(untitled)'}</span>
              <span className="block text-xs text-admin-muted">
                {chosen.type_label}
                {chosen.status === 'publish' ? '' : ' (draft)'}
              </span>
            </span>
            <button type="button" className="text-xs underline hover:text-admin-accent" onClick={() => setChosen(null)}>
              Change
            </button>
          </div>
        ) : (
          <div>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-admin-muted">Page</span>
              <input type="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find a page by its title" className="w-full rounded border border-admin-ink/20 px-2 py-1.5 outline-none focus:border-admin-accent" />
            </label>
            <ul className="m-0 mt-1 max-h-60 list-none overflow-y-auto p-0">
              {hits.map((h) => (
                <li key={h.id}>
                  <button type="button" className="w-full rounded px-2 py-1.5 text-left hover:bg-admin-soft" onClick={() => setChosen(h)}>
                    {h.title || '(untitled)'}
                    <span className="text-xs text-admin-muted">
                      {' '}
                      · {h.type_label}
                      {h.status === 'publish' ? '' : ' (draft)'}
                    </span>
                  </button>
                </li>
              ))}
              {!hits.length && <li className="px-2 py-1.5 text-xs text-admin-muted">No pages found.</li>}
            </ul>
          </div>
        )}
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-admin-muted">Comment on the whole page</span>
          <MentionTextarea className="w-full rounded border border-admin-ink/15 px-2 py-1.5 text-sm outline-none focus:border-admin-accent" rows={4} maxLength={2000} value={text} onChange={setText} />
        </label>
        <p className="text-xs text-admin-muted">Type @ to mention an editor or admin: they get an email. To comment on one block, use the Comments panel in the page editor.</p>
        <button disabled={busy || !chosen || !text.trim()} className={button}>
          Add comment
        </button>
      </form>
    </aside>
  );
}
