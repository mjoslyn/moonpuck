// Shop > Discounts: one discount's form (src/lib/shop/discounts.ts): a code or automatic; percent off, an
// amount off or free shipping; on the whole order, some products or some product categories; a minimum
// order, dates, a limit on uses, once per email, members only; on or off. Saved with POST
// /api/admin/shop/discounts.
import { useState } from 'react';
import { Num, Row, Select, Text, Toggle, inputClass } from '../puck/fields';
import { PriceInput } from '../puck/TicketsForm';
import { EntriesField } from '../puck/entry-fields';
import type { Discount } from '../lib/shop/discounts';

type Form = Partial<Discount> & { automatic?: boolean };

/** A date and time as the input shows it (the browser's local time). */
const toLocal = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);

export default function DiscountForm({ discount, categories, levels, membersOn }: { discount: Discount | null; categories: { id: number; name: string }[]; levels: { id: string; name: string }[]; membersOn: boolean }) {
  const [d, setD] = useState<Form>(discount ? { ...discount, automatic: !discount.code } : { kind: 'percent', value: 10, applies: 'all', active: true, products: [], categories: [], levels: [] });
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (patch: Form) => setD((x) => ({ ...x, ...patch }));

  const save = async () => {
    setSaving(true);
    setStatus('Saving…');
    const res = await fetch('/api/admin/shop/discounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save', id: discount?.id, discount: d }) });
    setSaving(false);
    if (!res.ok) return setStatus(await res.text());
    const { id } = await res.json();
    if (!discount) location.href = `/admin/shop/discounts/${id}/`;
    else setStatus('Saved.');
  };
  const remove = async () => {
    if (!discount || !confirm('Delete this discount? Orders that used it keep its code.')) return;
    const res = await fetch('/api/admin/shop/discounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', id: discount.id }) });
    if (res.ok) location.href = '/admin/shop/discounts/';
    else setStatus(await res.text());
  };

  return (
    <div className="grid max-w-2xl gap-1 rounded bg-white p-5 shadow-[0_0_0_1px_rgba(26,26,46,0.08)]">
      <Toggle title="Automatic (no code: it applies by itself to orders it fits)" value={d.automatic} onChange={(automatic) => set({ automatic })} />
      {!d.automatic && <Text title="Code (letters and numbers; buyers type it at checkout)" value={d.code ?? ''} placeholder="SUMMER10" onChange={(code) => set({ code: code.toUpperCase() })} />}
      <Text title="Name (shown in the cart; empty: the code)" value={d.name ?? ''} onChange={(name) => set({ name })} />
      <Select
        title="It gives"
        value={d.kind}
        options={[
          ['percent', 'A percent off'],
          ['amount', 'An amount off'],
          ['free_shipping', 'Free shipping'],
        ]}
        onChange={(kind) => set({ kind: (kind as Discount['kind']) ?? 'percent' })}
      />
      {d.kind === 'percent' && <Num title="Percent off" min={0} max={100} value={d.value} onChange={(value) => set({ value: value ?? 0 })} />}
      {d.kind === 'amount' && <PriceInput title="Amount off" part optional value={d.value || undefined} onChange={(value) => set({ value: value ?? 0 })} />}
      {d.kind !== 'free_shipping' && (
        <>
          <Select
            title="On"
            value={d.applies}
            options={[
              ['all', 'The whole order'],
              ['products', 'Some products'],
              ['categories', 'Some product categories'],
            ]}
            onChange={(applies) => set({ applies: (applies as Discount['applies']) ?? 'all' })}
          />
          {d.applies === 'products' && <EntriesField title="Products" types={['product']} value={d.products ?? []} onChange={(products) => set({ products })} />}
          {d.applies === 'categories' && (
            <fieldset className="mb-3">
              <legend className="mb-1 text-xs font-medium text-admin-muted">Categories (and the categories under them)</legend>
              {categories.map((c) => (
                <label key={c.id} className="mr-4 inline-flex items-center gap-1 text-sm">
                  <input type="checkbox" checked={(d.categories ?? []).includes(c.id)} onChange={(e) => set({ categories: e.target.checked ? [...(d.categories ?? []), c.id] : (d.categories ?? []).filter((x) => x !== c.id) })} />
                  {c.name}
                </label>
              ))}
              {!categories.length && <p className="text-xs text-admin-muted">No product categories yet.</p>}
            </fieldset>
          )}
        </>
      )}
      <PriceInput title="Only on orders of at least (empty: any)" part optional value={d.min_subtotal || undefined} onChange={(min_subtotal) => set({ min_subtotal: min_subtotal ?? 0 })} />
      <Row title="Starts (empty: now)">
        <input type="datetime-local" className={inputClass} value={toLocal(d.starts_at)} onChange={(e) => set({ starts_at: fromLocal(e.target.value) })} />
      </Row>
      <Row title="Ends (empty: never)">
        <input type="datetime-local" className={inputClass} value={toLocal(d.ends_at)} onChange={(e) => set({ ends_at: fromLocal(e.target.value) })} />
      </Row>
      <Num title="Uses in all (empty: no limit)" min={1} value={d.max_uses ?? undefined} onChange={(max_uses) => set({ max_uses: max_uses ?? null })} />
      <Toggle title="Once per email address" value={d.once_per_email} onChange={(once_per_email) => set({ once_per_email })} />
      {membersOn && (
        <>
          <Toggle title="Members only" value={d.members_only} onChange={(members_only) => set({ members_only })} />
          {d.members_only && levels.length > 1 && (
            <fieldset className="mb-3">
              <legend className="mb-1 text-xs text-admin-muted">Levels that may use it (none ticked: all)</legend>
              {levels.map((l) => (
                <label key={l.id} className="mr-3 inline-flex items-center gap-1 text-sm">
                  <input type="checkbox" checked={(d.levels ?? []).includes(l.id)} onChange={(e) => set({ levels: e.target.checked ? [...(d.levels ?? []), l.id] : (d.levels ?? []).filter((x) => x !== l.id) })} />
                  {l.name}
                </label>
              ))}
            </fieldset>
          )}
        </>
      )}
      <Toggle title="On" value={d.active !== false} onChange={(active) => set({ active })} />
      <p className="-mt-2 mb-3 text-xs text-admin-muted">An order takes one discount: a code it fits, else the automatic one that saves the most.</p>
      <div className="flex items-center gap-3">
        <button type="button" disabled={saving} onClick={save} className="rounded bg-admin-accent px-4 py-2 text-sm text-white hover:bg-admin-accent-dark">
          {discount ? 'Save discount' : 'Make discount'}
        </button>
        {discount && (
          <button type="button" onClick={remove} className="text-sm text-[#b91c1c] hover:underline">
            Delete
          </button>
        )}
        <span role="status" className="text-sm text-admin-muted">{status}</span>
      </div>
    </div>
  );
}
