// A product's shop settings, in its settings under Shop (fields.shop; src/lib/shop/config.ts): its price,
// compare-at price, SKU, weight, whether it ships, is collected or taxed, the most per order, and its
// options (Size, Color...) with a variant per combination, each with its own price, SKU, weight and
// image. Stock is kept apart (table shop_stock) and saves as it changes, so saving the product never
// overwrites a count someone else set.
import { useEffect, useRef, useState } from 'react';
import { Num, Row, Select, Toggle, inputClass, MediaModal } from './fields';
import { PriceInput } from './TicketsForm';
import { browserClient } from '../lib/db/browser';
import { mediaUrl } from '../lib/media/image';
import { useMemberSettings, useSite } from './member-settings';
import type { MemberLevel } from '../lib/members/config';
import { DEFAULT_VARIANT, MAX_OPTIONS, SHOP_KEY, cleanOptions, newVariantId, shopSettings, variantsFor, type ProductOption, type Variant } from '../lib/shop/config';
import { formatMoney } from '../lib/payments/money';

const small = 'rounded-sm border border-admin-ink/20 px-2 py-1 text-xs font-semibold hover:border-admin-ink/50';

/** The raw settings as edited (options kept as typed until a value list is left). */
type Raw = Record<string, any> & { options?: ProductOption[]; variants?: Variant[] };

export function ProductForm({ entryId, fields, onChange }: { entryId: number | null; fields: Record<string, any>; onChange: (fields: Record<string, any>) => void }) {
  const raw: Raw = fields?.[SHOP_KEY] ?? {};
  const site = useSite();
  const members = useMemberSettings();
  const s = shopSettings(site);
  const set = (patch: Raw) => onChange({ ...fields, [SHOP_KEY]: { ...raw, ...patch } });
  const options: ProductOption[] = raw.options ?? [];
  // Stored variants, else those the options make, with ids made from their values (comboId: the same
  // on every render, as productOf reads them) until a change stores them.
  const variants: Variant[] = raw.variants?.length ? raw.variants : variantsFor(cleanOptions(options), []);
  // The variants follow the options' values when a value list is left (not on each key, which would
  // lose a variant's price and stock while a value is half typed).
  const regroup = (opts: ProductOption[]) => set({ options: opts, variants: variantsFor(cleanOptions(opts), variants, newVariantId) });
  const setVariant = (id: string, patch: Partial<Variant>) => set({ variants: variants.map((v) => (v.id === id ? { ...v, ...patch } : v)) });
  const stock = useStock(entryId);
  const hasOptions = cleanOptions(options).length > 0;
  const fmt = (c: number | null | undefined) => (c == null ? '' : formatMoney(c, s.currency));
  return (
    <div>
      <PriceInput title="Price" optional value={raw.price ?? undefined} onChange={(price) => set({ price: price ?? null })} />
      <PriceInput title="Compare-at price (struck through; optional)" optional value={raw.compareAt ?? undefined} onChange={(compareAt) => set({ compareAt: compareAt ?? null })} />
      {raw.price == null && <p className="-mt-2 mb-3 text-xs text-admin-muted">With no price (here or on a variant) it isn't for sale.</p>}
      <Row title="SKU">
        <input className={inputClass} value={raw.sku ?? ''} onChange={(e) => set({ sku: e.target.value || undefined })} />
      </Row>
      <Num title={`Weight (${s.weightUnit})`} min={0} value={raw.weight ?? undefined} onChange={(weight) => set({ weight: weight ?? null })} />
      <Toggle title="Shipped" value={raw.ships !== false} onChange={(v) => set({ ships: v ? undefined : false })} />
      {raw.ships !== false && <Toggle title="Pickup only (never shipped)" value={raw.pickupOnly} onChange={(v) => set({ pickupOnly: v || undefined })} />}
      <Toggle title="Taxed" value={raw.taxable !== false} onChange={(v) => set({ taxable: v ? undefined : false })} />
      <Num title="Most per order (empty: no limit)" min={1} value={raw.maxPerOrder ?? undefined} onChange={(maxPerOrder) => set({ maxPerOrder: maxPerOrder || null })} />
      {members?.enabled && members.levels.length > 0 && <MemberPricing raw={raw} levels={members.levels} onChange={set} />}
      <Toggle title="Count stock" value={raw.trackStock} onChange={(v) => set({ trackStock: v || undefined })} />
      {raw.trackStock && !hasOptions && <StockInput label="In stock" value={stock.counts[DEFAULT_VARIANT]} disabled={!entryId} onSave={(n) => stock.save(DEFAULT_VARIANT, n)} />}
      {raw.trackStock && <p className="-mt-2 mb-3 text-xs text-admin-muted" role="status">{stock.status || 'Stock saves as you change it, apart from the product.'}</p>}
      {raw.trackStock && <Num title="Low stock at (empty: the shop's, under Settings > Shop)" min={0} value={raw.lowStock ?? undefined} onChange={(v) => set({ lowStock: v ?? undefined })} />}

      <h4 className="mt-4 mb-1 text-xs font-semibold tracking-wider text-admin-muted uppercase">Options</h4>
      <p className="mb-2 text-xs text-admin-muted">Such as Size or Color, each with its values. Every combination becomes a variant with its own price, stock, SKU and image.</p>
      {options.map((o, i) => (
        <div key={i} className="mb-2 rounded border border-admin-ink/10 bg-admin-bg p-2">
          <div className="flex items-center gap-2">
            <input className={inputClass} aria-label={`Option ${i + 1} name`} placeholder="Size" value={o.name} onChange={(e) => set({ options: options.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
            <button type="button" className="text-xs text-[#c4592a]" onClick={() => regroup(options.filter((_, j) => j !== i))}>
              Remove
            </button>
          </div>
          <ValuesInput values={o.values} onDone={(values) => regroup(options.map((x, j) => (j === i ? { ...x, values } : x)))} />
        </div>
      ))}
      {options.length < MAX_OPTIONS && (
        <button type="button" className={small} onClick={() => set({ options: [...options, { name: '', values: [] }] })}>
          Add an option
        </button>
      )}

      {hasOptions && (
        <>
          <h4 className="mt-4 mb-1 text-xs font-semibold tracking-wider text-admin-muted uppercase">Variants ({variants.length})</h4>
          <BulkSet trackStock={!!raw.trackStock} onPrice={(price) => set({ variants: variants.map((v) => ({ ...v, price })) })} onStock={(n) => stock.save(variants.map((v) => v.id), n)} />
          {variants.map((v) => (
            <details key={v.id} className="mb-1 rounded border border-admin-ink/10 bg-admin-bg">
              <summary className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-sm">
                <span className={`truncate ${v.off ? 'text-admin-muted line-through' : ''}`}>{v.values.join(' / ')}</span>
                <span className="ml-auto shrink-0 text-xs text-admin-muted">
                  {fmt(v.price ?? raw.price)}
                  {raw.trackStock ? ` · ${stock.counts[v.id] ?? 0} left` : ''}
                </span>
              </summary>
              <div className="border-t border-admin-ink/10 bg-white p-2">
                <PriceInput title="Price (empty: the product's)" optional value={v.price ?? undefined} onChange={(price) => setVariant(v.id, { price: price ?? null })} />
                <PriceInput title="Compare-at price (empty: the product's)" optional value={v.compareAt ?? undefined} onChange={(compareAt) => setVariant(v.id, { compareAt: compareAt ?? null })} />
                {members?.enabled && members.levels.length > 0 && <VariantMemberPrices variant={v} levels={members.levels} onChange={(memberPrices) => setVariant(v.id, { memberPrices })} />}
                {raw.trackStock && <StockInput label="In stock" value={stock.counts[v.id]} disabled={!entryId} onSave={(n) => stock.save(v.id, n)} />}
                <Row title="SKU">
                  <input className={inputClass} value={v.sku ?? ''} placeholder={raw.sku ?? ''} onChange={(e) => setVariant(v.id, { sku: e.target.value || undefined })} />
                </Row>
                <Num title={`Weight (${s.weightUnit}; empty: the product's)`} min={0} value={v.weight ?? undefined} onChange={(weight) => setVariant(v.id, { weight: weight ?? null })} />
                <VariantImage id={v.image ?? null} onChange={(image) => setVariant(v.id, { image })} />
                <Toggle title="Not sold (this combination doesn't exist)" value={v.off} onChange={(off) => setVariant(v.id, { off: off || undefined })} />
              </div>
            </details>
          ))}
        </>
      )}
    </div>
  );
}

/** What members pay, by level: a percent off every variant's price or a fixed price; and members only. */
function MemberPricing({ raw, levels, onChange }: { raw: Raw; levels: MemberLevel[]; onChange: (patch: Raw) => void }) {
  const off: Record<string, number> = raw.memberDiscounts ?? {};
  const fixed: Record<string, number> = raw.memberPrices ?? {};
  const setLevel = (level: string, kind: 'none' | 'percent' | 'fixed', amount?: number) => {
    const o = { ...off };
    const f = { ...fixed };
    delete o[level];
    delete f[level];
    if (kind === 'percent' && amount) o[level] = Math.min(100, amount);
    if (kind === 'fixed' && amount != null) f[level] = amount;
    onChange({ memberDiscounts: Object.keys(o).length ? o : undefined, memberPrices: Object.keys(f).length ? f : undefined });
  };
  // A level being set up: its kind shows before an amount is typed.
  const [kinds, setKinds] = useState<Record<string, 'none' | 'percent' | 'fixed'>>({});
  const kindOf = (id: string) => (fixed[id] != null ? 'fixed' : off[id] ? 'percent' : (kinds[id] ?? 'none'));
  const chosen: string[] = raw.levels ?? [];
  return (
    <div className="mb-3 rounded border border-admin-ink/10 p-2">
      <span className="mb-1 block text-xs font-medium text-admin-muted">Members</span>
      {levels.map((l) => {
        const kind = kindOf(l.id);
        return (
          <div key={l.id} className="mb-1">
            <Select
              title={`${l.name} members pay`}
              value={kind}
              options={[
                ['none', 'The usual price'],
                ['percent', 'A percent off'],
                ['fixed', 'A price of their own'],
              ]}
              onChange={(v) => {
                const k = (v ?? 'none') as 'none' | 'percent' | 'fixed';
                setKinds((x) => ({ ...x, [l.id]: k }));
                setLevel(l.id, k, k === 'percent' ? off[l.id] : k === 'fixed' ? fixed[l.id] : undefined);
              }}
            />
            {kind === 'percent' && <Num title="Percent off" min={0} max={100} value={off[l.id]} onChange={(pct) => setLevel(l.id, 'percent', pct)} />}
            {kind === 'fixed' && <PriceInput title="Their price (every variant's, unless a variant has its own)" optional value={fixed[l.id]} onChange={(c) => setLevel(l.id, 'fixed', c)} />}
          </div>
        );
      })}
      <p className="-mt-2 mb-2 text-xs text-admin-muted">For signed-in members of that level; never more than the usual price. The product's page says what members pay; the cart charges their price.</p>
      <Toggle title="Members only" value={raw.membersOnly} onChange={(membersOnly) => onChange({ membersOnly: membersOnly || undefined })} />
      {raw.membersOnly && levels.length > 1 && (
        <fieldset className="mb-2">
          <legend className="mb-1 text-xs text-admin-muted">Levels that may buy it (none ticked: all)</legend>
          {levels.map((l) => (
            <label key={l.id} className="mr-3 inline-flex items-center gap-1 text-sm">
              <input type="checkbox" checked={chosen.includes(l.id)} onChange={(e) => onChange({ levels: e.target.checked ? [...chosen, l.id] : chosen.filter((x) => x !== l.id) })} />
              {l.name}
            </label>
          ))}
        </fieldset>
      )}
    </div>
  );
}

/** A variant's own price for each member level (empty: the product's member pricing). */
function VariantMemberPrices({ variant, levels, onChange }: { variant: Variant; levels: MemberLevel[]; onChange: (memberPrices: Record<string, number> | undefined) => void }) {
  const prices = variant.memberPrices ?? {};
  return (
    <>
      {levels.map((l) => (
        <PriceInput
          key={l.id}
          title={`${l.name} members' price (empty: the product's member pricing)`}
          optional
          value={prices[l.id]}
          onChange={(c) => {
            const next = { ...prices };
            if (c == null) delete next[l.id];
            else next[l.id] = c;
            onChange(Object.keys(next).length ? next : undefined);
          }}
        />
      ))}
    </>
  );
}

/** An option's values, typed with commas between them, applied when the field is left. */
function ValuesInput({ values, onDone }: { values: string[]; onDone: (values: string[]) => void }) {
  const [text, setText] = useState(values.join(', '));
  const parse = (t: string) => t.split(',').map((v) => v.trim()).filter(Boolean);
  return (
    <label className="mt-2 block">
      <span className="mb-1 block text-xs text-admin-muted">Values, with commas between them</span>
      <input className={inputClass} placeholder="Small, Medium, Large" value={text} onChange={(e) => setText(e.target.value)} onBlur={() => onDone(parse(text))} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), onDone(parse(text)))} />
    </label>
  );
}

/** Set every variant's price or stock at once. */
function BulkSet({ trackStock, onPrice, onStock }: { trackStock: boolean; onPrice: (cents: number | null) => void; onStock: (n: number) => void }) {
  const [price, setPrice] = useState<number | undefined>(undefined);
  const [count, setCount] = useState('');
  return (
    <div className="mb-2 rounded border border-dashed border-admin-ink/15 p-2">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <PriceInput title="Every variant's price" optional value={price} onChange={setPrice} />
        </div>
        <button type="button" className={`${small} mb-3`} onClick={() => onPrice(price ?? null)}>
          Set
        </button>
      </div>
      {trackStock && (
        <div className="flex items-end gap-2">
          <Row title="Every variant's stock">
            <input type="number" min={0} className={inputClass} value={count} onChange={(e) => setCount(e.target.value)} />
          </Row>
          <button type="button" className={`${small} mb-3`} disabled={count === ''} onClick={() => onStock(Math.max(0, Math.floor(Number(count)) || 0))}>
            Set
          </button>
        </div>
      )}
    </div>
  );
}

/** A stock count, saved when the field is left. */
function StockInput({ label, value, disabled, onSave }: { label: string; value: number | undefined; disabled?: boolean; onSave: (n: number) => void }) {
  const [text, setText] = useState(value == null ? '' : String(value));
  const shown = useRef(value);
  // A count saved from elsewhere (Set for every variant) shows here.
  if (value !== shown.current) {
    shown.current = value;
    setText(value == null ? '' : String(value));
  }
  const save = () => {
    const n = Math.max(0, Math.floor(Number(text)) || 0);
    if (n !== value) onSave(n);
  };
  return (
    <Row title={label}>
      <input type="number" min={0} className={inputClass} value={text} disabled={disabled} placeholder="0" onChange={(e) => setText(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), save())} />
    </Row>
  );
}

/** A variant's own image (shown when a buyer picks it), from the media library. */
function VariantImage({ id, onChange }: { id: number | null; onChange: (id: number | null) => void }) {
  const [url, setUrl] = useState('');
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!id) return setUrl('');
    browserClient().from('media').select('path').eq('id', id).maybeSingle().then(({ data }) => setUrl(data?.path ? mediaUrl(data.path) : ''));
  }, [id]);
  return (
    <div className="mb-3">
      <span className="mb-1 block text-xs text-admin-muted">Image (empty: the product's)</span>
      <div className="flex items-center gap-2">
        {url ? <img src={url} alt="" className="h-12 w-12 rounded border border-admin-ink/10 object-cover" /> : <div className="h-12 w-12 rounded border border-dashed border-admin-ink/20" />}
        <button type="button" className={small} onClick={() => setOpen(true)}>
          {id ? 'Replace' : 'Choose'}
        </button>
        {id && (
          <button type="button" className="text-xs text-admin-muted underline" onClick={() => onChange(null)}>
            Remove
          </button>
        )}
      </div>
      {open && <MediaModal onClose={() => setOpen(false)} onSelect={(m) => { onChange(m.mediaId ?? m.id ?? null); setUrl(m.url); setOpen(false); }} />}
    </div>
  );
}

/** The product's stock counts, read once and saved one at a time as they change. */
function useStock(entryId: number | null) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [status, setStatus] = useState('');
  useEffect(() => {
    if (!entryId) return;
    browserClient()
      .from('shop_stock')
      .select('variant, on_hand')
      .eq('product_id', entryId)
      .then(({ data }) => setCounts(Object.fromEntries((data ?? []).map((r: any) => [r.variant, Number(r.on_hand) || 0]))));
  }, [entryId]);
  /** One variant's count, or several set to the same. */
  const save = async (variant: string | string[], n: number) => {
    const ids = Array.isArray(variant) ? variant : [variant];
    if (!entryId || !ids.length) return;
    setCounts((c) => ({ ...c, ...Object.fromEntries(ids.map((id) => [id, n])) }));
    setStatus('Saving stock…');
    const { error } = await browserClient().from('shop_stock').upsert(ids.map((id) => ({ product_id: entryId, variant: id, on_hand: n })), { onConflict: 'product_id,variant' });
    setStatus(error ? `Stock not saved: ${error.message}` : 'Stock saved.');
  };
  return { counts, status, save };
}
