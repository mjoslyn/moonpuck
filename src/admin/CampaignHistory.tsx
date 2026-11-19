// A campaign's saved versions (src/lib/mailing/revisions.ts, table campaign_revisions), newest first, on
// its screen: when, who saved it (or the share link it came through), View (the email as a sample
// subscriber gets it, /api/admin/mailing/preview) and, while the campaign can be changed, Restore (its name,
// subject, email and plain text into the form, kept when Save is clicked; the latest too while the form has
// unsaved changes).
import { useEffect, useState } from 'react';
import { browserClient } from '../lib/db/browser';

export interface CampaignVersionRow {
  id: number;
  name: string;
  subject: string;
  design: unknown;
  text: string;
  author_id: string | null;
  note: string | null;
  created_at: string;
}

/** `dirty`: the form has unsaved changes, so the latest version can be restored too (to drop them). */
export default function CampaignHistory({ campaignId, version, tz, editable, dirty = false, onRestore }: { campaignId: number; version: number; tz: string; editable: boolean; dirty?: boolean; onRestore: (v: CampaignVersionRow) => void }) {
  const [rows, setRows] = useState<CampaignVersionRow[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [viewing, setViewing] = useState<{ row: CampaignVersionRow; html?: string; error?: string } | null>(null);
  useEffect(() => {
    (async () => {
      const db = browserClient();
      const { data } = await db.from('campaign_revisions').select('id, name, subject, design, text, author_id, note, created_at').eq('campaign_id', campaignId).order('id', { ascending: false }).limit(100);
      const list = (data ?? []) as CampaignVersionRow[];
      setRows(list);
      const ids = [...new Set(list.map((r) => r.author_id).filter(Boolean))] as string[];
      if (ids.length) {
        const { data: people } = await db.from('profiles').select('id, display_name').in('id', ids);
        setNames(Object.fromEntries((people ?? []).map((p: any) => [p.id, p.display_name ?? ''])));
      }
    })();
  }, [campaignId, version]);
  const when = (s: string) => new Date(s).toLocaleString('en-US', { timeZone: tz, dateStyle: 'medium', timeStyle: 'short' });
  const view = async (row: CampaignVersionRow) => {
    setViewing({ row });
    const res = await fetch('/api/admin/mailing/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: campaignId, design: row.design, text: row.text, subject: row.subject }) }).catch(() => null);
    if (!res?.ok) return setViewing({ row, error: (res && (await res.text())) || 'Couldn’t show this version.' });
    setViewing({ row, html: (await res.json()).html });
  };
  if (!rows?.length) return null;
  return (
    <section className="mt-8">
      <h2 className="mb-2 text-xl">History</h2>
      <ol className="divide-y divide-admin-ink/10 rounded bg-white text-sm shadow-[0_0_0_1px_rgba(26,26,46,0.08)]">
        {rows.map((r, i) => (
          <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2">
            <span>
              <span className="font-medium">{when(r.created_at)}</span>
              {i === 0 && <span className="ml-2 text-xs text-admin-muted">latest</span>}
              <span className="ml-2 text-admin-muted">{r.note ?? (r.author_id ? names[r.author_id] || 'An editor' : 'Someone')}</span>
              <span className="block text-xs text-admin-muted">{r.subject || '(no subject)'}</span>
            </span>
            <span className="flex gap-3 text-xs">
              <button type="button" className="underline hover:text-admin-accent" onClick={() => view(r)}>
                View
              </button>
              {editable && (i > 0 || dirty) && (
                <button type="button" className="underline hover:text-admin-accent" onClick={() => onRestore(r)}>
                  Restore
                </button>
              )}
            </span>
          </li>
        ))}
      </ol>
      {viewing && (
        <div className="fixed inset-0 z-[950] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="A saved version" onClick={(e) => e.target === e.currentTarget && setViewing(null)} onKeyDown={(e) => e.key === 'Escape' && setViewing(null)}>
          <div className="flex h-[90vh] w-full max-w-3xl flex-col rounded bg-white shadow-xl">
            <div className="flex items-baseline justify-between gap-3 border-b border-admin-ink/10 px-4 py-2 text-sm">
              <span className="truncate">
                <strong>{viewing.row.subject || '(no subject)'}</strong> <span className="text-admin-muted">· saved {when(viewing.row.created_at)}</span>
              </span>
              <button type="button" autoFocus className="text-admin-muted hover:text-admin-ink" onClick={() => setViewing(null)} aria-label="Close">
                ×
              </button>
            </div>
            {viewing.error ? <p className="p-4 text-[#c4592a]">{viewing.error}</p> : viewing.html ? <iframe title="The email as it was saved" srcDoc={viewing.html} sandbox="" className="min-h-0 flex-1 border-0" /> : <p className="p-4 text-admin-muted">Loading…</p>}
          </div>
        </div>
      )}
    </section>
  );
}
