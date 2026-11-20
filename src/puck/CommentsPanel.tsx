// The page editor's Comments panel (the left rail): the page's comments (src/lib/share/comments.ts, GET and
// POST /api/admin/share-comments), left by guests with a share link that views it and by editors, open ones
// first. Each names the block it is on, with a few of its words; Show selects that block, Resolve and Reopen
// change its state, Delete removes it. Add a comment: on the selected block, or on the whole page; @handles
// email the editors and admins they name (src/lib/share/mentions.ts).
import { createContext, useContext, useEffect, useState } from 'react';
import { createUsePuck, useGetPuck } from '@puckeditor/core';
import ConfirmModal from '../admin/ConfirmModal';
import MentionTextarea, { withMentions } from '../admin/MentionTextarea';

const usePuck = createUsePuck();

/** The page the panel is for (the editor's entry), or null (a template: no comments). */
export const CommentsContext = createContext<{ entryId: number | null }>({ entryId: null });

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
}

/** A block type as the editor names it (as share-comments.js does on the preview). */
const LABELS: Record<string, string> = { text: 'Paragraph', 'media-text': 'Media and text', 'entry-content': 'Page content', 'video-gallery': 'Video gallery' };
const typeLabel = (t: string) => (t ? (LABELS[t] ?? t.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase())) : 'Whole page');
/** A time in the site's time zone (as the campaign screen's comments show it). */
const when = (s: string) => new Date(s).toLocaleString('en-US', { timeZone: (globalThis as any).__siteTz || undefined, dateStyle: 'medium', timeStyle: 'short' });

export function CommentsPanel() {
  const { entryId } = useContext(CommentsContext);
  const getPuck = useGetPuck();
  // Plain values (a new object each time would re-render the panel without end).
  const selectedId = usePuck((s) => (s.selectedItem ? String((s.selectedItem.props as any)?.id ?? '') : ''));
  const selectedType = usePuck((s) => (s.selectedItem ? String(s.selectedItem.type) : ''));
  const selected = selectedId ? { id: selectedId, type: selectedType } : null;
  const [rows, setRows] = useState<Row[] | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [error, setError] = useState('');

  const load = async () => {
    if (!entryId) return;
    const res = await fetch(`/api/admin/share-comments?entry=${entryId}`).catch(() => null);
    if (!res?.ok) return setError((res && (await res.text())) || 'Couldn’t load the comments.');
    setRows(await res.json());
  };
  useEffect(() => {
    load();
  }, [entryId]);

  if (!entryId) return <p className="p-4 text-sm text-admin-muted">Templates have no comments.</p>;

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
  const show = (r: Row) => {
    const { dispatch, getSelectorForId } = getPuck();
    const selector = r.block ? getSelectorForId(r.block) : null;
    if (r.block && !selector) return setError('That block is no longer on the page.');
    setError('');
    dispatch({ type: 'setUi', ui: { itemSelector: selector ?? null } });
  };
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await act({ action: 'add', entry: entryId, block: selected?.id ?? '', body: text })) setText('');
  };

  const open = (rows ?? []).filter((r) => r.status === 'open');
  const resolved = (rows ?? []).filter((r) => r.status !== 'open');
  const shown = showResolved ? [...open, ...resolved] : open;
  return (
    <div className="text-sm">
      <form onSubmit={add} className="border-b border-admin-ink/10 p-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-admin-muted">Comment on {selected ? `the selected ${typeLabel(selected.type).toLowerCase()}` : 'the whole page'}</span>
          <MentionTextarea className="w-full rounded border border-admin-ink/15 px-2 py-1.5 text-sm outline-none focus:border-admin-accent" rows={3} maxLength={2000} value={text} onChange={setText} />
        </label>
        <p className="mt-1 text-xs text-admin-muted">Select a block on the page to comment on it. Comments on new blocks need the page saved first. Type @ and a name to mention an editor or admin: pick them from the list, and they get an email with the comment.</p>
        {error && (
          <p role="alert" className="mt-1 text-xs text-[#c4592a]">
            {error}
          </p>
        )}
        <button disabled={busy || !text.trim()} className="mt-2 rounded bg-admin-ink px-3 py-1 text-xs font-medium text-white hover:bg-admin-accent disabled:opacity-50">
          Add comment
        </button>
      </form>
      <div className="flex items-center justify-between border-b border-admin-ink/10 px-3 py-2 text-xs text-admin-muted">
        <span>{rows ? `${open.length} open` : 'Loading…'}</span>
        <span className="flex gap-3">
          {resolved.length > 0 && (
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} /> Show resolved ({resolved.length})
            </label>
          )}
          <button type="button" className="underline hover:text-admin-accent" onClick={load}>
            Refresh
          </button>
        </span>
      </div>
      {rows && !shown.length && <p className="p-4 text-admin-muted">No open comments. People with a link that views this page can comment on its blocks, and so can editors here or in the preview.</p>}
      <ol className="m-0 list-none divide-y divide-admin-ink/10 p-0">
        {shown.map((r) => (
          <li key={r.id} className={`px-3 py-2.5 ${r.status === 'open' ? '' : 'opacity-60'}`}>
            <div className="text-xs text-admin-muted">
              <span className="font-medium text-admin-ink">{typeLabel(r.block_type)}</span>
              {r.quote && <span>: {r.quote.slice(0, 80)}</span>}
            </div>
            <p className="my-1 whitespace-pre-wrap">{withMentions(r.body)}</p>
            <div className="text-xs text-admin-muted">
              {r.author}
              {r.guest ? ' (share link)' : ''} · {when(r.created_at)}
              {r.status === 'resolved' && r.resolved_at ? ` · resolved ${when(r.resolved_at)}${r.resolved_by_name ? ` by ${r.resolved_by_name}` : ''}` : ''}
            </div>
            <div className="mt-1 flex gap-3 text-xs">
              {r.block && (
                <button type="button" className="underline hover:text-admin-accent" onClick={() => show(r)}>
                  Show
                </button>
              )}
              <button type="button" disabled={busy} className="underline hover:text-admin-accent" onClick={() => act({ action: r.status === 'open' ? 'resolve' : 'reopen', id: r.id })}>
                {r.status === 'open' ? 'Resolve' : 'Reopen'}
              </button>
              <button type="button" disabled={busy} className="text-[#c4592a] underline" onClick={() => setDeleting(r)}>
                Delete
              </button>
            </div>
          </li>
        ))}
      </ol>
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
