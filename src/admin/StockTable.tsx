// Shop > Stock (src/lib/shop/low-stock.ts): every variant of the products that count stock, with what is
// on hand (changed here, saved as it changes, as in a product's own settings), what orders hold, what is
// left and its low-stock mark, filtered by All / Low / Out of stock and searched by name or SKU.
import { useMemo, useState } from 'react';
import { browserClient } from '../lib/db/browser';
import { stateOf, type StockRow, type StockState } from '../lib/shop/stock';
import { inputClass } from '../puck/fields';

const SHOWS: [string, string][] = [
  ['all', 'All'],
  ['low', 'Low or out'],
  ['out', 'Out of stock'],
];
const BADGE: Record<StockState, [string, string] | null> = {
  out: ['Out of stock', 'bg-[#fef2f2] text-[#b91c1c]'],
  low: ['Low', 'bg-[#fffbeb] text-[#b45309]'],
  ok: null,
};
const key = (r: StockRow) => `${r.product}/${r.variant}`;

export default function StockTable({ rows: initial, show: initialShow }: { rows: StockRow[]; show: string }) {
  const [rows, setRows] = useState(initial);
  const [show, setShow] = useState(SHOWS.some(([k]) => k === initialShow) ? initialShow : 'all');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<Record<string, string>>({});
  const counts = useMemo(() => ({ all: rows.length, low: rows.filter((r) => r.state !== 'ok').length, out: rows.filter((r) => r.state === 'out').length }), [rows]);
  const shown = rows.filter((r) => (show === 'all' || (show === 'low' ? r.state !== 'ok' : r.state === 'out')) && (!q.trim() || `${r.title} ${r.label} ${r.sku}`.toLowerCase().includes(q.trim().toLowerCase())));

  const pick = (k: string) => {
    setShow(k);
    const url = new URL(location.href);
    k === 'all' ? url.searchParams.delete('show') : url.searchParams.set('show', k);
    history.replaceState(null, '', url);
  };
  const save = async (r: StockRow, n: number) => {
    if (n === r.onHand) return;
    setStatus((s) => ({ ...s, [key(r)]: 'Saving…' }));
    const { error } = await browserClient().from('shop_stock').upsert({ product_id: r.product, variant: r.variant, on_hand: n }, { onConflict: 'product_id,variant' });
    if (error) return setStatus((s) => ({ ...s, [key(r)]: `Not saved: ${error.message}` }));
    setRows((all) => all.map((x) => (key(x) === key(r) ? { ...x, onHand: n, left: n - x.held, state: x.off ? 'ok' : stateOf(n - x.held, x.mark), alerted: n > x.onHand ? false : x.alerted } : x)));
    setStatus((s) => ({ ...s, [key(r)]: 'Saved.' }));
  };

  return (
    <>
      <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
        <nav className="flex flex-wrap gap-1 border-b border-admin-ink/10 text-sm" aria-label="Show">
          {SHOWS.map(([k, label]) => (
            <button key={k} type="button" onClick={() => pick(k)} aria-current={k === show ? 'page' : undefined} className={`-mb-px border-b-2 px-3 py-2 ${k === show ? 'border-admin-accent text-admin-ink' : 'border-transparent text-admin-muted hover:text-admin-ink'}`}>
              {label} <span className="text-xs text-admin-muted">({counts[k as keyof typeof counts]})</span>
            </button>
          ))}
        </nav>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Product or SKU" aria-label="Search stock" className="w-56 rounded border border-admin-ink/15 bg-white px-2 py-1.5 text-sm" />
      </div>
      <div className="mt-4 overflow-x-auto rounded bg-white shadow-[0_0_0_1px_rgba(26,26,46,0.08)]">
        <table className="w-full text-sm">
          <thead className="border-b border-admin-ink/10 text-left text-xs text-admin-muted">
            <tr>
              <th className="px-4 py-2 font-medium">Product</th>
              <th className="px-4 py-2 font-medium">SKU</th>
              <th className="px-4 py-2 font-medium">On hand</th>
              <th className="px-4 py-2 text-right font-medium">Held by orders</th>
              <th className="px-4 py-2 text-right font-medium">Left</th>
              <th className="px-4 py-2 text-right font-medium">Low at</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const badge = BADGE[r.state];
              return (
                <tr key={key(r)} className="border-b border-admin-ink/5 last:border-0">
                  <td className="px-4 py-2">
                    <a href={`/admin/edit/${r.product}/`} className="font-medium hover:text-admin-accent">{r.title}</a>
                    {r.label && <span className="text-admin-muted"> · {r.label}</span>}
                    {(r.status !== 'publish' || r.off) && <div className="text-xs text-admin-muted">{r.off ? 'Not sold' : 'Not published'}</div>}
                  </td>
                  <td className="px-4 py-2 text-admin-muted">{r.sku}</td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      defaultValue={r.onHand}
                      aria-label={`On hand: ${r.title}${r.label ? ` (${r.label})` : ''}`}
                      className={`${inputClass} !w-24`}
                      onBlur={(e) => e.target.value !== '' && save(r, Math.max(0, Math.trunc(Number(e.target.value))))}
                      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                    />
                    {status[key(r)] && <div role="status" className="text-xs text-admin-muted">{status[key(r)]}</div>}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-admin-muted">{r.held || ''}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.left}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-admin-muted">{r.mark || 'Never'}</td>
                  <td className="px-4 py-2">{badge && <span className={`rounded px-2 py-0.5 text-xs ${badge[1]}`}>{badge[0]}</span>}</td>
                </tr>
              );
            })}
            {!shown.length && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-admin-muted">
                  {rows.length ? 'Nothing here.' : 'No products count stock yet. Turn on Count stock in a product’s Shop settings.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
