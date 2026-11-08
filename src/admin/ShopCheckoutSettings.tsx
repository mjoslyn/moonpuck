// Settings > Shop's checkout settings (settings.site.shop; src/lib/shop/checkout-settings.ts): who takes
// payments, how long an unpaid order holds its stock, shipping zones with their rates, pickup locations
// and tax, and the order emails. Saved with the other settings.
import { useState } from 'react';
import { Num, Row, Segmented, Select, Text, Toggle, inputClass } from '../puck/fields';
import { PriceInput } from '../puck/TicketsForm';
import type { PaymentProvider, ProviderStatus } from '../lib/payments';
import { formatMoney } from '../lib/payments/money';
import { checkoutSettings, DEFAULT_HOLD, DEFAULT_TAX_CODE, newId, type PickupLocation, type RateBand, type ShippingRate, type ShippingZone, type TaxSettings } from '../lib/shop/checkout-settings';
import { countryChoices, ELSEWHERE, placeName, US_STATES } from '../lib/shop/places';
import { DEFAULT_SHOP_EMAILS, SHOP_EMAIL_KINDS, type ShopEmail, type ShopEmailKind } from '../lib/shop/email';
import { site } from '../lib/site';
import { EmailCard } from './EmailCard';
import type { MailList } from '../lib/mailing/config';
import { DEFAULT_DOWNLOAD_DAYS, DEFAULT_DOWNLOAD_LIMIT, DEFAULT_LOW_STOCK, DEFAULT_NEWS_LABEL } from '../lib/shop/checkout-settings';
import { shopEmailKit } from './shop-email';

const EMAIL_HELP: Record<ShopEmailKind, string> = {
  confirmation: 'To the buyer when an order is paid, or at once when there is nothing to pay. Resend confirmation on an order sends it again.',
  shipped: 'To the buyer when an order is marked shipped, with its tracking number.',
  refunded: 'To the buyer when you refund an order on its page, all or part.',
  admin: 'The copy of each paid order to the shop: SHOP_NOTIFY_EMAIL, else the site’s admin address.',
};

const small = 'rounded-sm border border-admin-ink/20 px-2 py-1 text-xs font-semibold hover:border-admin-ink/50';
const heading = 'mt-5 mb-1 block text-xs font-semibold tracking-wider text-admin-muted uppercase';
const card = 'mb-2 rounded border border-admin-ink/10 bg-admin-bg';
const remove = 'text-xs text-[#c4592a]';

type Raw = Record<string, any>;

export default function ShopCheckoutSettings({ value, currency, weightUnit, providers, mailLists, onChange }: { value: Raw; currency: string; weightUnit: string; providers: Record<PaymentProvider, ProviderStatus>; mailLists: MailList[] | null; onChange: (v: Raw) => void }) {
  const set = (patch: Raw) => onChange({ ...value, ...patch });
  // As typed (the server cleans it on save, so text keeps its spaces while typed); the defaults where
  // nothing is set. Every zone, rate and location has an id: made here, or by the cleaning on save.
  const clean = checkoutSettings(value);
  const c = {
    provider: clean.provider,
    zones: (Array.isArray(value.zones) ? value.zones : []) as ShippingZone[],
    pickup: (Array.isArray(value.pickup) ? value.pickup : []) as PickupLocation[],
    tax: { ...clean.tax, ...(value.tax ?? {}), regions: Array.isArray(value.tax?.regions) ? value.tax.regions : [] } as TaxSettings,
  };
  const ready = (Object.keys(providers) as PaymentProvider[]).filter((p) => providers[p].configured);
  const provider = c.provider && ready.includes(c.provider) ? c.provider : ready[0];
  const label = (p: PaymentProvider) => `${providers[p].label}${providers[p].sandbox ? ' (test mode)' : ''}`;
  const money = (n: number) => formatMoney(n, currency);
  const setZone = (id: string, patch: Partial<ShippingZone>) => set({ zones: c.zones.map((z) => (z.id === id ? { ...z, ...patch } : z)) });
  const setPickup = (id: string, patch: Partial<PickupLocation>) => set({ pickup: c.pickup.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  const setTax = (patch: Partial<TaxSettings>) => set({ tax: { ...c.tax, ...patch } });
  const stripeTax = provider === 'stripe';
  const emails = (value.emails ?? {}) as Partial<Record<ShopEmailKind, ShopEmail>>;
  const news: { lists: number[]; label?: string } = { lists: [], ...(value.news ?? {}) };

  return (
    <>
      <span className={heading}>Payments</span>
      {ready.length > 1 && <Segmented title="Payments go through" value={provider!} options={ready.map((p) => [p, label(p)] as [string, string])} onChange={(v) => set({ provider: v })} />}
      {ready.length === 1 && <p className="mb-3 text-xs text-admin-muted">Payments go through {label(ready[0])}.</p>}
      {!ready.length && (
        <p className="mb-3 rounded bg-admin-soft p-2 text-xs text-admin-muted">
          To take payments, connect Stripe or Square under <a className="underline" href="/admin/settings/connections/">Settings &gt; Connections</a>.
        </p>
      )}
      <Num title={`Minutes an unpaid order holds its stock (30 to 120, default ${DEFAULT_HOLD})`} value={value.hold} min={30} max={120} onChange={(hold) => set({ hold })} />

      <span className={heading}>Shipping</span>
      <p className="mb-2 text-xs text-admin-muted">
        Zones are checked in order and the first that covers the buyer's address gives its rates. A zone for Everywhere else is used only when no other zone names the address's country or state. Without one, other addresses can't be shipped to. Only products marked Shipped need an address.
      </p>
      {c.zones.map((z, i) => (
        <details key={z.id} className={card} open={!z.places.length}>
          <summary className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-sm">
            <span className="font-semibold">{z.name}</span>
            <span className="truncate text-xs text-admin-muted">{z.places.map(placeName).join(', ') || 'No places yet'}</span>
            <span className="ml-auto shrink-0 text-xs text-admin-muted">{z.rates.length} {z.rates.length === 1 ? 'rate' : 'rates'}</span>
          </summary>
          <div className="border-t border-admin-ink/10 bg-white p-2">
            <Text title="Zone name" value={z.name} onChange={(name) => setZone(z.id, { name })} />
            <PlacesInput places={z.places} onChange={(places) => setZone(z.id, { places })} />
            <span className="mb-1 block text-xs font-medium text-admin-muted">Rates</span>
            {z.rates.map((r) => (
              <RateEditor key={r.id} rate={r} money={money} weightUnit={weightUnit} onChange={(patch) => setZone(z.id, { rates: z.rates.map((x) => (x.id === r.id ? { ...x, ...patch } : x)) })} onRemove={() => setZone(z.id, { rates: z.rates.filter((x) => x.id !== r.id) })} />
            ))}
            <div className="flex flex-wrap gap-2">
              <button type="button" className={small} onClick={() => setZone(z.id, { rates: [...z.rates, { id: newId('r'), name: z.rates.length ? 'Express' : 'Standard', rule: 'flat', price: 0, bands: [], freeOver: null }] })}>
                Add a rate
              </button>
              {i > 0 && (
                <button type="button" className={small} onClick={() => set({ zones: [...c.zones.slice(0, i - 1), z, c.zones[i - 1], ...c.zones.slice(i + 1)] })}>
                  Move up
                </button>
              )}
              <button type="button" className={`${remove} ml-auto`} onClick={() => confirm(`Delete the zone ${z.name}?`) && set({ zones: c.zones.filter((x) => x.id !== z.id) })}>
                Delete zone
              </button>
            </div>
          </div>
        </details>
      ))}
      <button type="button" className={`${small} mb-3`} onClick={() => set({ zones: [...c.zones, { id: newId('z'), name: c.zones.length ? 'Zone' : 'Domestic', places: [], rates: [{ id: newId('r'), name: 'Standard', rule: 'flat', price: 0, bands: [], freeOver: null }] }] })}>
        Add a shipping zone
      </button>

      <span className={heading}>Pickup</span>
      <p className="mb-2 text-xs text-admin-muted">Places buyers can collect their order, offered beside the shipping rates whatever their address. Products marked Pickup only can only be collected.</p>
      {c.pickup.map((p) => (
        <details key={p.id} className={card} open={!p.address}>
          <summary className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-sm">
            <span className="font-semibold">{p.name}</span>
            <span className="ml-auto text-xs text-admin-muted">{p.fee ? money(p.fee) : 'Free'}</span>
          </summary>
          <div className="border-t border-admin-ink/10 bg-white p-2">
            <Text title="Name" value={p.name} onChange={(name) => setPickup(p.id, { name })} />
            <Row title="Address">
              <textarea className={inputClass} rows={3} value={p.address} onChange={(e) => setPickup(p.id, { address: e.target.value })} />
            </Row>
            <Text title="Hours (shown to the buyer)" value={p.hours} placeholder="Mon to Fri, 10am to 5pm" onChange={(hours) => setPickup(p.id, { hours })} />
            <PriceInput part title="Fee (empty: free)" optional value={p.fee || undefined} onChange={(fee) => setPickup(p.id, { fee: fee ?? 0 })} />
            <PlaceSelect title="Where it is, for tax (empty: the store's rate)" value={p.place} onChange={(place) => setPickup(p.id, { place })} />
            <button type="button" className={remove} onClick={() => set({ pickup: c.pickup.filter((x) => x.id !== p.id) })}>
              Delete pickup location
            </button>
          </div>
        </details>
      ))}
      <button type="button" className={`${small} mb-3`} onClick={() => set({ pickup: [...c.pickup, { id: newId('p'), name: 'Pickup in store', address: '', hours: '', fee: 0, place: '' }] })}>
        Add a pickup location
      </button>

      <span className={heading}>Tax</span>
      {stripeTax && (
        <Segmented
          title="Tax is"
          value={c.tax.mode}
          options={[
            ['rates', 'Worked out from the rates here'],
            ['stripe', 'Worked out by Stripe Tax'],
          ]}
          onChange={(mode) => setTax({ mode: mode as TaxSettings['mode'] })}
        />
      )}
      {c.tax.mode === 'stripe' && stripeTax ? (
        <>
          <p className="mb-2 text-xs text-admin-muted">Stripe works out tax from the buyer's address at checkout. Turn on Stripe Tax and add your registrations in Stripe's dashboard first. The cart says tax is added at checkout.</p>
          <Text title={`Tax code for products (default ${DEFAULT_TAX_CODE}, general goods)`} value={c.tax.taxCode === DEFAULT_TAX_CODE ? '' : c.tax.taxCode} placeholder={DEFAULT_TAX_CODE} onChange={(taxCode) => setTax({ taxCode: taxCode || DEFAULT_TAX_CODE })} />
        </>
      ) : (
        <>
          <PercentInput title="Store's tax rate (%)" value={c.tax.rate} onChange={(rate) => setTax({ rate })} />
          <span className="mb-1 block text-xs font-medium text-admin-muted">Rates for places (replace the store's rate where the address or pickup location is in them; a state's over its country's)</span>
          {c.tax.regions.map((r, i) => (
            <div key={`${i}-${c.tax.regions.length}`} className="mb-2">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <PlaceSelect title="Place" value={r.place} onChange={(place) => setTax({ regions: c.tax.regions.map((x, j) => (j === i ? { ...x, place } : x)) })} />
              </div>
              <div className="w-28">
                <PercentInput title="Rate (%)" value={r.rate} onChange={(rate) => setTax({ regions: c.tax.regions.map((x, j) => (j === i ? { ...x, rate } : x)) })} />
              </div>
              <button type="button" className={`${remove} mb-4`} onClick={() => setTax({ regions: c.tax.regions.filter((_, j) => j !== i) })}>
                Remove
              </button>
            </div>
            {/* What saving would drop (cleanTax), said here rather than lost. */}
            {!r.place && <p className="-mt-2 mb-2 text-xs text-[#b3261e]">Choose a place: a rate without one isn't saved.</p>}
            {r.place && c.tax.regions.findIndex((x) => x.place === r.place) < i && <p className="-mt-2 mb-2 text-xs text-[#b3261e]">{placeName(r.place)} already has a rate above: this one isn't saved.</p>}
            </div>
          ))}
          <button type="button" className={`${small} mb-3`} onClick={() => setTax({ regions: [...c.tax.regions, { place: firstFree(c.tax.regions.map((r) => r.place)), rate: 0 }] })}>
            Add a rate for a place
          </button>
          <Toggle title="Tax shipping too" value={c.tax.onShipping} onChange={(onShipping) => setTax({ onShipping })} />
        </>
      )}
      <p className="mb-3 text-xs text-admin-muted">Each product's Taxed switch decides whether it is taxed. The shop adds the tax you set up; it doesn't register for or file tax for you.</p>

      <span className={heading}>Stock</span>
      <Num title={`Low stock at (or fewer left; 0: never; default ${DEFAULT_LOW_STOCK})`} min={0} value={value.lowStock} onChange={(lowStock) => set({ lowStock })} />
      <Toggle title="Email the shop when a sale takes something to low stock" value={value.lowStockAlerts !== false} onChange={(lowStockAlerts) => set({ lowStockAlerts })} />
      <p className="-mt-2 mb-3 text-xs text-admin-muted">A product can set its own mark in its Shop settings. Each variant is emailed about once, until its count is raised again. <a className="underline" href="/admin/shop/stock/">Shop &gt; Stock</a> lists them.</p>

      <span className={heading}>Downloads</span>
      <Num title={`Times a buyer can download each file (0: no limit; default ${DEFAULT_DOWNLOAD_LIMIT})`} min={0} value={value.downloadLimit} onChange={(downloadLimit) => set({ downloadLimit })} />
      <Num title={`Days after paying a download works (0: always; default ${DEFAULT_DOWNLOAD_DAYS})`} min={0} value={value.downloadDays} onChange={(downloadDays) => set({ downloadDays })} />
      <p className="-mt-2 mb-3 text-xs text-admin-muted">For products with a Download in their Shop settings: buyers get the link on their order and in its confirmation.</p>

      <span className={heading}>Email me news</span>
      {mailLists === null ? (
        <p className="mb-3 text-xs text-admin-muted">With Mailing Lists on (Settings &gt; Mailing Lists), checkout can offer buyers a tick to sign up to your lists.</p>
      ) : !mailLists.length ? (
        <p className="mb-3 text-xs text-admin-muted">Make a mailing list under People &gt; Mailing Lists to offer it at checkout.</p>
      ) : (
        <>
          <p className="mb-2 text-xs text-admin-muted">A tick at checkout, unticked to begin with. Ticked, the buyer is signed up to the lists chosen here once they confirm by email, as with a Subscribe block.</p>
          <fieldset className="mb-3">
            <legend className="mb-1 text-xs text-admin-muted">Lists it signs up to (none: no tick)</legend>
            {mailLists.map((l) => (
              <label key={l.id} className="mr-4 inline-flex items-center gap-1 text-sm">
                <input type="checkbox" checked={news.lists.includes(l.id)} onChange={(e) => set({ news: { ...news, lists: e.target.checked ? [...news.lists, l.id] : news.lists.filter((x) => x !== l.id) } })} />
                {l.name}
              </label>
            ))}
          </fieldset>
          {news.lists.length > 0 && <Text title="The tick's words" value={value.news?.label ?? ''} placeholder={DEFAULT_NEWS_LABEL} onChange={(label) => set({ news: { ...news, label: label || undefined } })} />}
        </>
      )}

      <span className={heading}>Emails</span>
      <p className="mb-2 text-xs text-admin-muted">Designed in the email builder, with the order's details as merge tags and an Order details block.</p>
      {SHOP_EMAIL_KINDS.map(([kind, label]) => (
        <EmailCard
          key={kind}
          label={label}
          help={EMAIL_HELP[kind]}
          value={emails[kind] ?? {}}
          fallback={DEFAULT_SHOP_EMAILS[kind]}
          templateKey={`shop:${kind}`}
          makeKit={(subject) => shopEmailKit(kind, subject, site.name)}
          note="Saved with the settings."
          onChange={(patch) => set({ emails: { ...emails, [kind]: { ...(emails[kind] ?? {}), ...patch } } })}
          onReset={() => set({ emails: { ...emails, [kind]: { ...(emails[kind] ?? {}), design: undefined, text: undefined } } })}
        >
          {kind === 'admin' && <Toggle title="Send the shop a copy of each order" value={value.notify !== false} onChange={(notify) => set({ notify })} />}
        </EmailCard>
      ))}
    </>
  );
}

/** The first US state not yet given a rate, for a new place row. */
const firstFree = (taken: string[]) => US_STATES.map(([s]) => `US-${s}`).find((p) => !taken.includes(p)) ?? 'US';

/** A country, or a US state, from two dropdowns. */
function PlaceSelect({ title, value, onChange, elsewhere }: { title: string; value: string; onChange: (place: string) => void; elsewhere?: boolean }) {
  const [country, state] = value === ELSEWHERE ? [ELSEWHERE, ''] : (value || '').split('-');
  const countries = countryChoices();
  return (
    <div className="flex gap-2">
      <div className="flex-1">
        <Select title={title} value={country || ''} options={[['', '—'], ...(elsewhere ? [[ELSEWHERE, 'Everywhere else'] as [string, string]] : []), ...countries]} onChange={(c) => onChange(c ?? '')} />
      </div>
      {country === 'US' && (
        <div className="flex-1">
          <Select title="State" value={state ?? ''} options={[['', 'All of the US'], ...US_STATES]} onChange={(s) => onChange(s ? `US-${s}` : 'US')} />
        </div>
      )}
    </div>
  );
}

/** A zone's places: chips to remove, and a picker to add one. */
function PlacesInput({ places, onChange }: { places: string[]; onChange: (places: string[]) => void }) {
  const [adding, setAdding] = useState('');
  return (
    <div className="mb-3">
      <span className="mb-1 block text-xs font-medium text-admin-muted">Places it covers</span>
      <div className="mb-2 flex flex-wrap gap-1">
        {places.map((p) => (
          <span key={p} className="inline-flex items-center gap-1 rounded bg-admin-soft px-2 py-0.5 text-xs">
            {placeName(p)}
            <button type="button" aria-label={`Remove ${placeName(p)}`} onClick={() => onChange(places.filter((x) => x !== p))}>
              ×
            </button>
          </span>
        ))}
        {!places.length && <span className="text-xs text-admin-muted">None yet: add a country, a US state or Everywhere else.</span>}
      </div>
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <PlaceSelect title="Add a place" value={adding} elsewhere onChange={setAdding} />
        </div>
        <button
          type="button"
          className={`${small} mb-3`}
          disabled={!adding || places.includes(adding)}
          onClick={() => {
            onChange([...places, adding]);
            setAdding('');
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}

function RateEditor({ rate, money, weightUnit, onChange, onRemove }: { rate: ShippingRate; money: (n: number) => string; weightUnit: string; onChange: (patch: Partial<ShippingRate>) => void; onRemove: () => void }) {
  const weight = rate.rule === 'weight';
  const setBand = (i: number, patch: Partial<RateBand>) => onChange({ bands: rate.bands.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  const summary = rate.rule === 'flat' ? money(rate.price) : `${rate.bands.length} ${rate.bands.length === 1 ? 'band' : 'bands'} by ${weight ? 'weight' : 'subtotal'}`;
  return (
    <details className="mb-2 rounded border border-admin-ink/10">
      <summary className="flex cursor-pointer items-center gap-2 px-2 py-1 text-sm">
        <span>{rate.name}</span>
        <span className="ml-auto text-xs text-admin-muted">
          {summary}
          {rate.freeOver != null ? `, free over ${money(rate.freeOver)}` : ''}
        </span>
      </summary>
      <div className="border-t border-admin-ink/10 p-2">
        <Text title="Name (shown to the buyer)" value={rate.name} onChange={(name) => onChange({ name })} />
        <Select
          title="Price"
          value={rate.rule}
          options={[
            ['flat', 'One price'],
            ['subtotal', "By the order's subtotal"],
            ['weight', `By the order's weight (${weightUnit})`],
          ]}
          onChange={(rule) => onChange({ rule: (rule as ShippingRate['rule']) ?? 'flat', bands: rate.bands.length ? rate.bands : [{ min: 0, max: null, price: rate.price }] })}
        />
        {rate.rule === 'flat' ? (
          <PriceInput part title="Price (empty: free)" optional value={rate.price || undefined} onChange={(price) => onChange({ price: price ?? 0 })} />
        ) : (
          <>
            <p className="mb-2 text-xs text-admin-muted">
              Each band from (inclusive) up to (not inclusive); an empty up to has no limit. An order in no band isn't offered this rate.
            </p>
            {/* Keyed by position and count: removing a row remounts the rest, so their inputs show their own values. */}
            {rate.bands.map((b, i) => (
              <div key={`${i}-${rate.bands.length}`} className="flex items-end gap-2">
                {weight ? (
                  <>
                    <Num title="From" min={0} value={b.min} onChange={(min) => setBand(i, { min: min ?? 0 })} />
                    <Num title="Up to" min={0} value={b.max ?? undefined} onChange={(max) => setBand(i, { max: max ?? null })} />
                  </>
                ) : (
                  <>
                    <PriceInput part title="From" optional value={b.min || undefined} onChange={(min) => setBand(i, { min: min ?? 0 })} />
                    <PriceInput part title="Up to" optional value={b.max ?? undefined} onChange={(max) => setBand(i, { max: max ?? null })} />
                  </>
                )}
                <PriceInput part title="Price" optional value={b.price || undefined} onChange={(price) => setBand(i, { price: price ?? 0 })} />
                <button type="button" className={`${remove} mb-4`} onClick={() => onChange({ bands: rate.bands.filter((_, j) => j !== i) })}>
                  Remove
                </button>
              </div>
            ))}
            <button type="button" className={`${small} mb-3`} onClick={() => onChange({ bands: [...rate.bands, { min: rate.bands.at(-1)?.max ?? 0, max: null, price: 0 }] })}>
              Add a band
            </button>
          </>
        )}
        <PriceInput part title="Free when the subtotal is at least (empty: never)" optional value={rate.freeOver ?? undefined} onChange={(freeOver) => onChange({ freeOver: freeOver ?? null })} />
        <button type="button" className={remove} onClick={onRemove}>
          Delete rate
        </button>
      </div>
    </details>
  );
}

/** A percentage with decimals (8.875). */
function PercentInput({ title, value, onChange }: { title: string; value: number; onChange: (v: number) => void }) {
  const [text, setText] = useState(value ? String(value) : '');
  return (
    <Row title={title}>
      <input
        className={inputClass}
        inputMode="decimal"
        value={text}
        placeholder="0"
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value.replace(',', '.').replace('%', ''));
          if (Number.isFinite(n) && n >= 0) onChange(Math.min(100, n));
        }}
      />
    </Row>
  );
}
