// A newsletter's comments on the campaign screen (src/lib/share/comments.ts, GET and POST
// /api/admin/share-comments): left by guests on its share page and by editors, open ones first, each naming
// the block of the email it is on. Resolve, Reopen and Delete; Add a comment on one block or the whole email,
// whose @handles email the editors and admins they name (src/lib/share/mentions.ts).
import { useEffect, useMemo, useState } from 'react';
import MentionTextarea, { withMentions } from './MentionTextarea';

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

/** The email's blocks to choose from: those with something of their own to show (not Sections, Columns, Spacers or Dividers). */
function emailBlocks(design: any): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  const walk = (items: unknown) => {
    if (!Array.isArray(items)) return;
    for (const item of items as { type: string; props?: Record<string, any> }[]) {
      const p = item?.props;
      if (!p) continue;
      if (!['Section', 'Columns', 'Spacer', 'Divider'].includes(item.type) && p.id) {
        const words = String(p.text ?? p.html ?? p.label ?? p.heading ?? '').replace(/<[^>]*>?/g, ' ').replace(/\s+/g, ' ').trim();
        out.push({ id: String(p.id), label: `${item.type}${words ? `: ${words.slice(0, 60)}` : ''}` });
      }
      for (const v of Object.values(p)) walk(v);
    }
  };
  walk(design?.content);
  return out;
}

export default function CampaignComments({ campaignId, design, tz }: { campaignId: number; design: unknown; tz: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [block, setBlock] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const blocks = useMemo(() => emailBlocks(design), [design]);
  const when = (s: string) => new Date(s).toLocaleString('en-US', { timeZone: tz, dateStyle: 'medium', timeStyle: 'short' });

  const load = async () => {
    const res = await fetch(`/api/admin/share-comments?campaign=${campaignId}`).catch(() => null);
    if (res?.ok) setRows(await res.json());
  };
  useEffect(() => {
    load();
  }, [campaignId]);

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

  const open = (rows ?? []).filter((r) => r.status === 'open');
  const resolved = (rows ?? []).filter((r) => r.status !== 'open');
  const shown = showResolved ? [...open, ...resolved] : open;
  const field = 'w-full rounded border border-admin-ink/15 bg-white px-2 py-1.5 text-sm outline-none focus:border-admin-accent';
  return (
    <section className="mt-8">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="text-xl">Comments {rows ? <span className="text-sm text-admin-muted">({open.length} open)</span> : null}</h2>
        {resolved.length > 0 && (
          <label className="flex items-center gap-1 text-xs text-admin-muted">
            <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} /> Show resolved ({resolved.length})
          </label>
        )}
      </div>
      <div className="rounded bg-white text-sm shadow-[0_0_0_1px_rgba(26,26,46,0.08)]">
        <form
          className="space-y-2 border-b border-admin-ink/10 p-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await act({ action: 'add', campaign: campaignId, block, body: text })) setText('');
          }}
        >
          <div className="flex flex-wrap gap-2">
            <select className={`${field} max-w-xs`} value={block} onChange={(e) => setBlock(e.target.value)} aria-label="About">
              <option value="">The whole email</option>
              {blocks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
            <MentionTextarea className={`${field} min-w-60`} rows={2} maxLength={2000} placeholder="Add a comment (type @ to mention someone)" ariaLabel="Comment" value={text} onChange={setText} />
            <button disabled={busy || !text.trim()} className="self-start rounded-sm bg-admin-ink px-3 py-1.5 text-xs font-semibold text-white hover:bg-admin-accent disabled:opacity-50">
              Add
            </button>
          </div>
          {error && (
            <p role="alert" className="text-xs text-[#c4592a]">
              {error}
            </p>
          )}
        </form>
        {rows && !shown.length && <p className="p-3 text-admin-muted">No open comments. People with a link that views this newsletter can leave them on its share page.</p>}
        <ol className="m-0 list-none divide-y divide-admin-ink/10 p-0">
          {shown.map((r) => (
            <li key={r.id} className={`px-3 py-2.5 ${r.status === 'open' ? '' : 'opacity-60'}`}>
              <div className="text-xs text-admin-muted">
                <span className="font-medium text-admin-ink">{r.block_type || 'The whole email'}</span>
                {r.quote && <span>: {r.quote.slice(0, 80)}</span>}
              </div>
              <p className="my-1 whitespace-pre-wrap">{withMentions(r.body)}</p>
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-admin-muted">
                <span>
                  {r.author}
                  {r.guest ? ' (share link)' : ''} · {when(r.created_at)}
                  {r.status === 'resolved' && r.resolved_at ? ` · resolved ${when(r.resolved_at)}${r.resolved_by_name ? ` by ${r.resolved_by_name}` : ''}` : ''}
                </span>
                <span className="flex gap-3">
                  <button type="button" disabled={busy} className="underline hover:text-admin-accent" onClick={() => act({ action: r.status === 'open' ? 'resolve' : 'reopen', id: r.id })}>
                    {r.status === 'open' ? 'Resolve' : 'Reopen'}
                  </button>
                  <button type="button" disabled={busy} className="text-[#c4592a] underline" onClick={() => confirm('Delete this comment?') && act({ action: 'delete', id: r.id })}>
                    Delete
                  </button>
                </span>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
