// Settings > Donations (settings.site.donations; src/lib/donations/config.ts): on or off, the currency, who
// takes the payments, the amounts offered, monthly gifts, covering the fees, what the form asks, the
// receipt's details, the Email me news tick, fundraising goals and the emails. Saved with the other settings.
import { useState } from 'react';
import { Row, Segmented, Select, Text, Toggle, inputClass } from '../puck/fields';
import { PriceInput } from '../puck/TicketsForm';
import type { PaymentProvider, ProviderStatus } from '../lib/payments';
import { CURRENCIES, formatMoney } from '../lib/payments/money';
import { coverFee, coversFees, DEFAULT_NEWS_LABEL, DEFAULT_RECEIPT_NOTE, donationSettings, MAX_GOALS, type DonationEmail, type DonationEmailKind, type DonationGoal } from '../lib/donations/config';
import { DEFAULT_DONATION_EMAILS, DONATION_EMAIL_KINDS } from '../lib/donations/email';
import type { MailList } from '../lib/mailing/config';
import { site } from '../lib/site';
import { EmailCard } from './EmailCard';
import { donationEmailKit } from './donation-email';

type Raw = Record<string, any>;

const heading = 'mt-5 mb-1 block text-xs font-semibold tracking-wider text-admin-muted uppercase';
const small = 'rounded-sm border border-admin-ink/20 px-2 py-1 text-xs font-semibold hover:border-admin-ink/50';
const card = 'mb-2 rounded border border-admin-ink/10 bg-admin-bg p-2';
const help = (text: React.ReactNode) => <p className="-mt-2 mb-3 text-xs text-admin-muted">{text}</p>;

const EMAIL_HELP: Record<DonationEmailKind, string> = {
  receipt: 'To the donor when a one-time gift is paid. Keep the Donation details block’s Receipt details in it: donors use it for their taxes.',
  monthly: 'To a monthly donor when their gift starts and each month it is paid, with the link to change or cancel it.',
  failed: 'To a monthly donor when a month’s payment fails (once, until it is paid again), with the link to update their card.',
  cancelled: 'To a monthly donor when their gift is cancelled, by them, by you or by Stripe after payments kept failing.',
  refunded: 'To the donor when you refund a gift on its page, all or part.',
  admin: 'The copy of each gift to the organization: DONATIONS_NOTIFY_EMAIL, else the site’s admin address.',
};

/** The amounts as typed ("10, 25, 50"), kept as minor units on leaving the field. */
function AmountsInput({ value, currency, onChange }: { value: number[]; currency: string; onChange: (v: number[] | undefined) => void }) {
  const [text, setText] = useState(value.map((n) => (n % 100 ? (n / 100).toFixed(2) : String(n / 100))).join(', '));
  return (
    <Row title={`Amounts offered (${currency}, separated by commas)`}>
      <input
        className={inputClass}
        value={text}
        inputMode="decimal"
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const cents = text
            .split(/[,\s]+/)
            .map((x) => Math.round(Number(x.replace(/[^\d.]/g, '')) * 100))
            .filter((n) => Number.isFinite(n) && n > 0);
          onChange(cents.length ? cents : undefined);
        }}
      />
    </Row>
  );
}

export default function DonationSettingsPanel({ value, providers, mailLists, onChange }: { value: Raw; providers: Record<PaymentProvider, ProviderStatus>; mailLists: MailList[] | null; onChange: (v: Raw) => void }) {
  const set = (patch: Raw) => onChange({ ...value, ...patch });
  const s = donationSettings({ donations: value });
  const ready = (Object.keys(providers) as PaymentProvider[]).filter((p) => providers[p].configured);
  const provider = s.provider && ready.includes(s.provider) ? s.provider : ready[0];
  const label = (p: PaymentProvider) => `${providers[p].label}${providers[p].sandbox ? ' (test mode)' : ''}`;
  const money = (n: number) => formatMoney(n, s.currency);
  // As edited (the server cleans them on save, giving a new goal its id from its name).
  const goals: Partial<DonationGoal>[] = Array.isArray(value.goals) ? value.goals : [];
  const setGoal = (i: number, patch: Partial<DonationGoal>) => set({ goals: goals.map((g, j) => (j === i ? { ...g, ...patch } : g)) });
  const emails = (value.emails ?? {}) as Partial<Record<DonationEmailKind, DonationEmail>>;
  const news: { lists: number[]; label?: string } = { lists: [], ...(value.news ?? {}) };
  const example = s.amounts[1] ?? s.amounts[0] ?? 5000;

  return (
    <>
      <Toggle title="Donations on" value={s.enabled} onChange={(on) => set({ enabled: on })} />
      <p className="mb-3 text-xs text-admin-muted">
        {s.enabled
          ? 'The Donate and Donation progress blocks, the donation page (/donate/), and Donations in the admin bar with every gift, monthly donor and the totals.'
          : 'Turn on to take one-time and monthly gifts with a Donate block, show a fundraising goal’s progress, and see every gift under Donations in the admin bar. Turning it off later deletes nothing.'}
      </p>
      <Select title="Currency" value={s.currency} options={CURRENCIES} onChange={(v) => set({ currency: v || undefined })} />

      <span className={heading}>Payments</span>
      {ready.length > 1 && <Segmented title="One-time gifts go through" value={provider!} options={ready.map((p) => [p, label(p)] as [string, string])} onChange={(v) => set({ provider: v })} />}
      {ready.length === 1 && <p className="mb-3 text-xs text-admin-muted">Gifts go through {label(ready[0])}.</p>}
      {!ready.length && (
        <p className="mb-3 rounded bg-admin-soft p-2 text-xs text-admin-muted">
          To take gifts, connect Stripe or Square under <a className="underline" href="/admin/settings/connections/">Settings &gt; Connections</a>.
        </p>
      )}
      <Toggle title="Offer monthly gifts" value={s.monthly} onChange={(monthly) => set({ monthly: monthly ? undefined : false })} />
      {s.monthly &&
        help(
          providers.stripe?.configured ? (
            <>Monthly gifts go through Stripe as subscriptions, whichever provider takes one-time gifts. Donors change or cancel them from the link in their receipts. To let them update their card too, turn on Stripe’s customer portal (in Stripe: Settings &gt; Billing &gt; Customer portal). If Stripe was connected before donations were on, connect it again under Settings &gt; Connections so its webhook sends monthly payments.</>
          ) : (
            'Monthly gifts need Stripe: connect it under Settings > Connections. Until then the Donate block offers one-time gifts only, and a monthly gift is refused.'
          ),
        )}

      <span className={heading}>Amounts</span>
      <AmountsInput value={s.amounts} currency={s.currency} onChange={(amounts) => set({ amounts })} />
      {help('Up to 8. A Donate block can offer its own. Donors can always enter another amount.')}
      <PriceInput title="Smallest gift" value={s.minimum} onChange={(minimum) => set({ minimum })} />

      <span className={heading}>Covering the fees</span>
      <div className="flex gap-2">
        <div className="flex-1">
          <Row title="Percent">
            <input className={inputClass} inputMode="decimal" value={value.feePercent ?? ''} placeholder="0" onChange={(e) => set({ feePercent: e.target.value === '' ? undefined : e.target.value })} />
          </Row>
        </div>
        <div className="flex-1">
          <PriceInput title="Plus a fixed amount" part value={s.feeFixed || undefined} onChange={(feeFixed) => set({ feeFixed })} />
        </div>
      </div>
      {help(
        coversFees(s)
          ? `Donors can tick a box to add the fees, so you receive their whole gift: on ${money(example)}, they would add ${money(coverFee(example, s))}. Match your provider’s rate (Stripe’s card rate in the US is 2.9% plus $0.30).`
          : 'Set your provider’s rate to let donors add the fees to their gift. Both empty: not offered.',
      )}

      <span className={heading}>The form</span>
      <Toggle title="Ask for a dedication (in honor or memory of)" value={s.dedication} onChange={(v) => set({ dedication: v ? undefined : false })} />
      <Toggle title="Let donors give anonymously" value={s.anonymous} onChange={(v) => set({ anonymous: v ? undefined : false })} />
      {help('Anonymous gifts still keep the donor’s name and email here, for their receipt.')}

      <span className={heading}>Receipts</span>
      <Text title="Organization’s legal name" value={value.legalName ?? ''} placeholder={site.name} onChange={(legalName) => set({ legalName: legalName || undefined })} />
      <Text title="Tax or charity number (such as an EIN)" value={value.taxId ?? ''} onChange={(taxId) => set({ taxId: taxId || undefined })} />
      <Row title="Receipt note">
        <textarea className={inputClass} rows={2} value={value.receiptNote ?? DEFAULT_RECEIPT_NOTE} onChange={(e) => set({ receiptNote: e.target.value })} />
      </Row>
      {help('Shown on receipts with the gift’s number and date. Check the wording your country requires with your accountant.')}

      <span className={heading}>Email me news</span>
      {mailLists === null ? (
        help('With Mailing Lists on (Settings > Mailing Lists), the Donate block can offer donors a tick to sign up to your lists.')
      ) : !mailLists.length ? (
        help('Make a mailing list under People > Mailing Lists to offer it to donors.')
      ) : (
        <>
          <fieldset className="mb-3">
            <legend className="mb-1 text-xs text-admin-muted">Lists it signs up to (none: no tick). Donors confirm by email, as with a Subscribe block.</legend>
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

      <span className={heading}>Fundraising goals</span>
      <p className="mb-2 text-xs text-admin-muted">A Donate block can count its gifts towards a goal, and a Donation progress block shows how far it has come. Only gifts paid between the goal’s dates count.</p>
      {goals.map((g, i) => (
        <div key={i} className={card}>
          <Text title="Name" value={g.name ?? ''} onChange={(name) => setGoal(i, { name })} />
          <PriceInput title="Target" part value={g.target || undefined} onChange={(target) => setGoal(i, { target: target ?? 0 })} />
          <div className="flex gap-2">
            <div className="flex-1">
              <Row title="Starts (optional)">
                <input className={inputClass} type="date" value={g.start ?? ''} onChange={(e) => setGoal(i, { start: e.target.value || undefined })} />
              </Row>
            </div>
            <div className="flex-1">
              <Row title="Ends (optional)">
                <input className={inputClass} type="date" value={g.end ?? ''} onChange={(e) => setGoal(i, { end: e.target.value || undefined })} />
              </Row>
            </div>
          </div>
          <button type="button" className="text-xs text-[#c4592a]" onClick={() => confirm(`Delete the goal ${g.name || ''}? Its gifts stay, no longer counted towards it.`) && set({ goals: goals.filter((_, j) => j !== i) })}>
            Delete goal
          </button>
        </div>
      ))}
      {goals.length < MAX_GOALS && (
        <button type="button" className={`${small} mb-3`} onClick={() => set({ goals: [...goals, { name: '', target: 0 }] })}>
          Add a goal
        </button>
      )}
      {goals.some((g) => !g.name?.trim()) && <p className="mb-2 text-xs text-[#c4592a]">A goal without a name isn't saved.</p>}

      <span className={heading}>Emails</span>
      <p className="mb-2 text-xs text-admin-muted">Designed in the email builder, with the gift’s details as merge tags and a Donation details block.</p>
      {DONATION_EMAIL_KINDS.map(([kind, title]) => (
        <EmailCard
          key={kind}
          label={title}
          help={EMAIL_HELP[kind]}
          value={emails[kind] ?? {}}
          fallback={DEFAULT_DONATION_EMAILS[kind]}
          templateKey={`donation:${kind}`}
          makeKit={(subject) => donationEmailKit(kind, subject, site.name, () => donationSettings({ donations: value }))}
          note="Saved with the settings."
          onChange={(patch) => set({ emails: { ...emails, [kind]: { ...(emails[kind] ?? {}), ...patch } } })}
          onReset={() => set({ emails: { ...emails, [kind]: { ...(emails[kind] ?? {}), design: undefined, text: undefined } } })}
        >
          {kind === 'admin' && <Toggle title="Send the organization a copy of each gift" value={value.notify !== false} onChange={(notify) => set({ notify: notify ? undefined : false })} />}
        </EmailCard>
      ))}
    </>
  );
}
