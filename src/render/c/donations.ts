// Donations (Settings > Donations, src/lib/donations/): the Donate block (preset amounts and Other, once
// or monthly, covering the fees, a dedication, giving anonymously, the donor's name and email; it posts to
// /api/donations/checkout, which sends the donor to the payment provider) and the Donation progress block
// (a fundraising goal's total against its target). The Donate block also shows a donor their thank-you
// (?donation=<token>, after paying) and a monthly donor their gift to change or cancel (?plan=<token>);
// those pages are never cached. public/assets/js/donate.js shows the fee and the button's amount as the
// donor chooses; the form works without it.
import type { Renderer, RenderCtx } from '../env';
import { esc } from '../html';
import { attrs, escAttr, styleDecls } from './style';
import { formatMoney } from '../../lib/payments/money';
import { coverFee, coversFees, DEFAULT_NEWS_LABEL, donationSettings, goalOf, type DonationSettings } from '../../lib/donations/config';
import type { GoalTotal } from '../../lib/donations/totals';
import { mailingOn } from '../../lib/mailing/config';
import { formStyleClass, formStyleDecls } from '../forms/style';

/** Where the server's hook keeps the gift (?donation=) and monthly gift (?plan=) a Donate block shows. */
export const DONATION_KEY = 'donation';
export const PLAN_KEY = 'donation-plan';
/** Where prepare keeps the goals' totals. */
export const GOALS_KEY = 'donation-goals';
export const DONATE_SCRIPT = '<script src="/assets/js/donate.js" defer></script>';

/** What the thank-you and monthly gift views need of a gift and a plan (src/lib/donations/donations.ts). */
export interface ShownDonation {
  code: string;
  status: string;
  kind: 'once' | 'monthly';
  amount: number;
  total: number;
  currency: string;
  name: string;
  email: string;
}
export interface ShownPlan {
  token: string;
  status: string;
  amount: number;
  total: number;
  currency: string;
  email: string;
  customer: string | null;
  started_at: string | null;
}

const note = (ctx: RenderCtx, text: string) => (ctx.editor ? `<div class="cms-editor-note">${esc(text)}</div>` : '');
const off = (ctx: RenderCtx) => note(ctx, 'Donations are off (Settings > Donations): this block shows nothing.');
const money = (n: number, cur: string) => formatMoney(n, cur);
/** Whole amounts without cents ($25), others with them ($12.50). */
const short = (n: number, cur: string) => money(n, cur).replace(/\.00(?=\D*$)/, '');

const PLAN_MESSAGES: Record<string, string> = {
  cancelled: 'Your monthly gift is cancelled. You won’t be charged again. Thank you for all you have given.',
  error: 'That didn’t work. Try again in a moment, or reply to one of our emails and we’ll help.',
  'no-card': 'Updating your card isn’t available online yet. Reply to one of our emails and we’ll help.',
};

/** The thank-you after paying (or why the gift isn't through yet). */
function thanks(d: ShownDonation, a: Record<string, any>): string {
  const m = money(d.amount, d.currency);
  if (d.status === 'paid' || d.status === 'refunded')
    return `<h2 class="c-donate__heading" tabindex="-1" data-focus>${esc(a.thanksHeading || `Thank you, ${d.name.split(/\s+/)[0]}`)}</h2><p class="c-donate__message" role="status">${d.kind === 'monthly' ? `Your monthly gift of <strong>${esc(m)}</strong> has started.` : `Your gift of <strong>${esc(m)}</strong> is through.`} We’ve emailed your receipt to ${esc(d.email)}.</p>${a.thanksText ? `<p class="c-donate__text">${esc(a.thanksText)}</p>` : ''}`;
  if (d.status === 'pending') return `<p class="c-donate__message" role="status" tabindex="-1" data-focus>Your gift of ${esc(m)} is being confirmed. We’ll email your receipt to ${esc(d.email)} once it is.</p>`;
  return `<p class="c-donate__message is-error" role="status" tabindex="-1" data-focus>Your gift of ${esc(m)} wasn’t completed, and you weren’t charged.</p>`;
}

/** A monthly donor's gift: what it is and how it stands, Update card and Cancel. */
function manage(p: ShownPlan, ctx: RenderCtx): string {
  const said = ctx.queried.url.searchParams.get('plan_msg') ?? '';
  const msg = PLAN_MESSAGES[said] ? `<p class="c-donate__message${said === 'cancelled' ? '' : ' is-error'}" role="status">${esc(PLAN_MESSAGES[said])}</p>` : '';
  const status = p.status === 'active' ? 'Active' : p.status === 'past_due' ? 'The last payment didn’t go through: update your card' : p.status === 'cancelled' ? 'Cancelled' : 'Not started';
  const since = p.started_at ? new Date(p.started_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';
  const live = p.status === 'active' || p.status === 'past_due';
  const form = (action: string, label: string, cls: string, confirm = '') =>
    `<form method="post" action="/api/donations/manage" class="c-donate__action"${confirm ? ` data-confirm="${escAttr(confirm)}"` : ''}><input type="hidden" name="plan" value="${escAttr(p.token)}" /><input type="hidden" name="action" value="${action}" /><button type="submit" class="${cls}">${esc(label)}</button></form>`;
  return (
    `<h2 class="c-donate__heading" tabindex="-1" data-focus>Your monthly gift</h2>${msg}` +
    `<dl class="c-donate__plan"><div><dt>Each month</dt><dd>${esc(money(p.total, p.currency))}</dd></div><div><dt>Status</dt><dd>${esc(status)}</dd></div>${since ? `<div><dt>Since</dt><dd>${esc(since)}</dd></div>` : ''}<div><dt>Receipts go to</dt><dd>${esc(p.email)}</dd></div></dl>` +
    (live
      ? `<div class="c-donate__actions">${p.customer ? form('card', 'Update your card', 'c-button__link') : ''}${form('cancel', 'Cancel my monthly gift', 'c-donate__cancel', 'Cancel your monthly gift? You won’t be charged again.')}</div>`
      : '')
  );
}

/** The amounts offered: the block's own (attrs.amounts, in the currency: "10, 25, 50") else the settings'. */
function amountsOf(a: Record<string, any>, s: DonationSettings): number[] {
  const own = String(a.amounts ?? '')
    .split(/[,\s]+/)
    .map((x) => Math.round(Number(x.replace(/[^\d.]/g, '')) * 100))
    .filter((n) => Number.isFinite(n) && n >= s.minimum);
  return own.length ? [...new Set(own)].slice(0, 8) : s.amounts;
}

const donate: Renderer = (b, env) => {
  const { ctx } = env;
  const a = b.attrs;
  const s = donationSettings(ctx.settings.site);
  if (!s.enabled) return off(ctx);
  const id = `donate-${b.id}`;
  const root = (inner: string) => `<section ${attrs(['c-donate', formStyleClass(a.formStyle), a.className], [...styleDecls(a.style), ...formStyleDecls(a.formStyle)], { id: a.anchor || 'donate' })}>${inner}</section>`;
  const q = ctx.queried.url.searchParams;
  const shown = ctx.data.get(DONATION_KEY) as ShownDonation | undefined;
  if (shown) return root(thanks(shown, a));
  const plan = ctx.data.get(PLAN_KEY) as ShownPlan | undefined;
  if (plan) return root(manage(plan, ctx));
  if (q.has('plan') && !ctx.editor) return root('<p class="c-donate__message is-error" role="status">That link to a monthly gift isn’t right. Use the link in your latest receipt.</p>');

  const cur = s.currency;
  const amounts = amountsOf(a, s);
  const monthly = s.monthly && a.monthly !== false;
  const startMonthly = monthly && a.frequency === 'monthly';
  const goal = goalOf(s, a.goal)?.id ?? '';
  const first = amounts[Math.min(amounts.length - 1, Math.max(0, Number(a.selected ?? 1)))] ?? 0;
  const error = q.get('donate_error')?.slice(0, 300) ?? '';
  const cancelled = q.get('donate') === 'cancelled';
  const heading = a.heading ? `<h2 class="c-donate__heading">${esc(a.heading)}</h2>` : '';
  const intro = a.text ? `<p class="c-donate__text">${esc(a.text)}</p>` : '';
  const msg = error ? `<p class="c-donate__message is-error" role="alert">${esc(error)}</p>` : cancelled ? '<p class="c-donate__message" role="status">Your gift wasn’t completed, and you weren’t charged.</p>' : '';
  const frequency = monthly
    ? `<fieldset class="c-donate__frequency"><legend class="c-sr-only">How often</legend>${[
        ['once', 'Give once'],
        ['monthly', 'Monthly'],
      ]
        .map(([v, l]) => `<label class="c-donate__toggle"><input type="radio" name="frequency" value="${v}"${(v === 'monthly') === startMonthly ? ' checked' : ''} /><span>${l}</span></label>`)
        .join('')}</fieldset>`
    : '<input type="hidden" name="frequency" value="once" />';
  const presets = amounts.map((n) => `<label class="c-donate__amount"><input type="radio" name="amount" value="${n}"${n === first ? ' checked' : ''} /><span>${esc(short(n, cur))}</span></label>`).join('');
  const other = `<label class="c-donate__amount c-donate__amount--other"><input type="radio" name="amount" value="other"${amounts.length ? '' : ' checked'} /><span>Other</span></label>`;
  const otherField = `<div class="c-field c-donate__other"><label class="c-field__label" for="${id}-other">Other amount (${esc(cur)})</label><input class="c-input" id="${id}-other" name="other" type="text" inputmode="decimal" autocomplete="off" placeholder="${escAttr(short(s.minimum, cur))} or more" /></div>`;
  const amountField = `<fieldset class="c-donate__amounts"><legend class="c-field__label">${esc(a.amountLabel || 'Amount')}</legend><div class="c-donate__choices">${presets}${other}</div>${otherField}</fieldset>`;
  const fee = coversFees(s)
    ? `<label class="c-choice c-donate__cover"><input type="checkbox" name="cover" value="on"${a.coverChecked ? ' checked' : ''} /><span>Add <span data-fee>${esc(first ? money(coverFee(first, s), cur) : `${s.feePercent}%`)}</span> to cover the payment fees, so all of my gift goes to the cause</span></label>`
    : '';
  const field = (name: string, label: string, type: string, auto: string, required: boolean, placeholder = '') =>
    `<div class="c-field"><label class="c-field__label" for="${id}-${name}">${label}</label><input class="c-input" id="${id}-${name}" name="${name}" type="${type}" autocomplete="${auto}"${placeholder ? ` placeholder="${escAttr(placeholder)}"` : ''}${required ? ' required' : ''} /></div>`;
  const people = `<div class="c-donate__fields">${field('name', 'Your name', 'text', 'name', true)}${field('email', 'Email', 'email', 'email', true)}</div>`;
  const dedication = s.dedication && a.dedication !== false ? field('dedication', 'In honor or memory of (optional)', 'text', 'off', false, 'In memory of …') : '';
  const anonymous = s.anonymous ? '<label class="c-choice"><input type="checkbox" name="anonymous" value="on" /><span>Don’t show my name if gifts are listed publicly</span></label>' : '';
  const news = mailingOn(ctx.settings.site) && s.news.lists.length ? `<label class="c-choice"><input type="checkbox" name="news" value="on" /><span>${esc(s.news.label || DEFAULT_NEWS_LABEL)}</span></label>` : '';
  const hp = `<div class="c-field is-hp" aria-hidden="true"><label for="${id}-hp">Leave this empty</label><input id="${id}-hp" name="_hp" type="text" tabindex="-1" autocomplete="off" /></div>`;
  const button = a.button || 'Donate';
  const form =
    `<form class="c-donate__form" method="post" action="/api/donations/checkout" data-donate="${escAttr(JSON.stringify({ currency: cur, feePercent: s.feePercent, feeFixed: s.feeFixed, button }))}">` +
    `<input type="hidden" name="page" value="${escAttr(ctx.queried.url.pathname)}" /><input type="hidden" name="goal" value="${escAttr(goal)}" /><input type="hidden" name="campaign" value="" />` +
    frequency + amountField + fee + people + dedication + `<div class="c-donate__ticks">${anonymous}${news}</div>` + hp +
    `<div class="c-donate__footer"><button type="submit" class="c-button__link c-donate__submit">${esc(button)}${first ? ` <span data-total>${esc(short(first, cur))}</span>` : ''}</button></div>` +
    `<p class="c-donate__secure">You’ll pay on a secure page. ${monthly ? 'A monthly gift can be cancelled at any time from the link in your receipt.' : ''}</p>` +
    `</form>`;
  return root(heading + intro + msg + form);
};

const progress: Renderer = (b, env) => {
  const { ctx } = env;
  const a = b.attrs;
  const s = donationSettings(ctx.settings.site);
  if (!s.enabled) return off(ctx);
  const goal = goalOf(s, a.goal);
  if (!goal) return note(ctx, s.goals.length ? 'Choose a fundraising goal in the block settings.' : 'Add a fundraising goal under Settings > Donations, then choose it here.');
  const t = (ctx.data.get(GOALS_KEY) as Record<string, GoalTotal> | undefined)?.[goal.id] ?? { raised: 0, donors: 0, gifts: 0 };
  const pct = goal.target > 0 ? Math.min(100, Math.round((t.raised / goal.target) * 100)) : 0;
  const cur = s.currency;
  const heading = a.heading !== '' ? `<h2 class="c-progress__heading">${esc(a.heading || goal.name)}</h2>` : '';
  const line = `<p class="c-progress__raised"><strong>${esc(short(t.raised, cur))}</strong> raised${goal.target ? ` of ${esc(short(goal.target, cur))}` : ''}</p>`;
  const bar = goal.target ? `<div class="c-progress__bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="${escAttr(`${pct}% of the goal`)}"><span style="width:${pct}%"></span></div>` : '';
  const more = [a.showDonors !== false && t.donors ? `${t.donors} ${t.donors === 1 ? 'donor' : 'donors'}` : '', goal.target && a.showPercent !== false ? `${pct}% of the goal` : ''].filter(Boolean).join(' · ');
  const link = a.buttonUrl ? `<p class="c-progress__cta"><a class="c-button__link" href="${escAttr(a.buttonUrl)}">${esc(a.button || 'Donate')}</a></p>` : '';
  return `<section ${attrs(['c-progress', a.className], styleDecls(a.style), { id: a.anchor })}>${heading}${line}${bar}${more ? `<p class="c-progress__more">${esc(more)}</p>` : ''}${link}</section>`;
};

export const DONATION_RENDERERS: Record<string, Renderer> = { donate, 'donation-progress': progress };
