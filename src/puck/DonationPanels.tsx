// The donation blocks' settings (src/render/c/donations.ts): the Donate block's words, amounts, frequency
// and goal, and the Donation progress block's goal. The goals and the defaults are Settings > Donations'.
import { Select, Text, Toggle, type Attrs } from './fields';
import { FormStylePanel } from './FormStyle';
import { useSite } from './member-settings';
import { donationSettings } from '../lib/donations/config';
import { formatMoney } from '../lib/payments/money';

function useGoals() {
  const site = useSite();
  return site ? donationSettings(site) : null;
}

const note = (text: string) => <p className="-mt-2 mb-3 text-xs text-admin-muted">{text}</p>;

export function DonatePanel({ a, set }: { a: Attrs; set: (p: Attrs) => void }) {
  const s = useGoals();
  const goals = s?.goals ?? [];
  return (
    <>
      <Text title="Heading" value={a.heading} onChange={(v) => set({ heading: v || undefined })} />
      <Text title="Text" value={a.text} onChange={(v) => set({ text: v || undefined })} />
      <Text title="Amounts" value={a.amounts} placeholder={s ? s.amounts.map((n) => n / 100).join(', ') : ''} onChange={(v) => set({ amounts: v || undefined })} />
      {note(`In ${s?.currency ?? 'the currency'}, separated by commas. Empty: the amounts under Settings > Donations. Donors can also enter their own.`)}
      <Select title="Chosen at first" value={String(a.selected ?? 1)} options={[['0', 'The first amount'], ['1', 'The second amount'], ['2', 'The third amount'], ['3', 'The fourth amount']]} onChange={(v) => set({ selected: v === '1' ? undefined : Number(v) })} />
      {s?.monthly !== false && (
        <>
          <Toggle title="Offer monthly gifts" value={a.monthly !== false} onChange={(v) => set({ monthly: v ? undefined : false })} />
          {a.monthly !== false && <Select title="Starts on" value={a.frequency === 'monthly' ? 'monthly' : 'once'} options={[['once', 'Give once'], ['monthly', 'Monthly']]} onChange={(v) => set({ frequency: v === 'monthly' ? 'monthly' : undefined })} />}
        </>
      )}
      <Toggle title="Cover the fees ticked at first" value={!!a.coverChecked} onChange={(v) => set({ coverChecked: v || undefined })} />
      {s && !(s.feePercent > 0 || s.feeFixed > 0) && note('Offered once Settings > Donations has a fee to cover.')}
      <Toggle title="Ask for a dedication" value={a.dedication !== false} onChange={(v) => set({ dedication: v ? undefined : false })} />
      <Select title="Counts towards" value={a.goal ?? ''} options={[['', 'No goal'], ...goals.map((g) => [g.id, `${g.name}${g.target ? ` (${formatMoney(g.target, s!.currency)})` : ''}`] as [string, string])]} onChange={(v) => set({ goal: v || undefined })} />
      {note('Gifts made here count towards this fundraising goal (Settings > Donations, Goals).')}
      <Text title="Button" value={a.button} placeholder="Donate" onChange={(v) => set({ button: v || undefined })} />
      <Text title="Thank-you heading" value={a.thanksHeading} placeholder="Thank you, (first name)" onChange={(v) => set({ thanksHeading: v || undefined })} />
      <Text title="Thank-you text" value={a.thanksText} onChange={(v) => set({ thanksText: v || undefined })} />
      {note('Shown after the donor pays. The site’s /donate/ page shows this block on its own; a page with that address needs it, since monthly donors’ receipts link there.')}
      <FormStylePanel a={a} set={set} />
    </>
  );
}

export function DonationProgressPanel({ a, set }: { a: Attrs; set: (p: Attrs) => void }) {
  const s = useGoals();
  const goals = s?.goals ?? [];
  return (
    <>
      <Select title="Goal" value={a.goal ?? ''} options={[['', 'Choose a goal'], ...goals.map((g) => [g.id, g.name] as [string, string])]} onChange={(v) => set({ goal: v || undefined })} />
      {!goals.length && note('Add a fundraising goal under Settings > Donations first.')}
      <Text title="Heading" value={a.heading} placeholder="The goal’s name" onChange={(v) => set({ heading: v || undefined })} />
      <Toggle title="Show how many donors" value={a.showDonors !== false} onChange={(v) => set({ showDonors: v ? undefined : false })} />
      <Toggle title="Show the percent" value={a.showPercent !== false} onChange={(v) => set({ showPercent: v ? undefined : false })} />
      <Text title="Button label" value={a.button} placeholder="Donate" onChange={(v) => set({ button: v || undefined })} />
      <Text title="Button link" value={a.buttonUrl} placeholder="/donate/" onChange={(v) => set({ buttonUrl: v || undefined })} />
      {note('No link, no button. The total counts paid gifts made towards the goal between its dates, less refunds; it updates within a minute.')}
    </>
  );
}
