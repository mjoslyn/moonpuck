// What gifts add up to: each fundraising goal's total (the Donation progress block, the Donations screen)
// and what a gift counts towards one. Safe in the browser (the editor's canvas reads it as the editor).
import type { Db } from '../db/query';
import { SITE_TZ } from '../site';
import type { DonationGoal } from './config';

/** A gift as totals read it. */
export interface CountedGift {
  status: string;
  amount: number;
  total: number;
  refunded_amount: number;
}

/** What a gift counts towards totals: the gift less what was refunded of it (fees covered aren't the gift). */
export const raised = (d: CountedGift) => (d.status === 'paid' ? Math.max(0, Math.min(d.amount, d.total - d.refunded_amount)) : 0);

/** A time's local day (YYYY-MM-DD) in the site's time zone. */
export const localDay = (at: Date, tz: string = SITE_TZ) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);

/** Whether a gift paid at `paidAt` falls in a goal's dates (local dates in the site's time zone). */
export const inGoalDates = (g: Pick<DonationGoal, 'start' | 'end'>, paidAt: string | null) => {
  if (!paidAt) return false;
  const day = localDay(new Date(paidAt));
  return (!g.start || day >= g.start) && (!g.end || day <= g.end);
};

export interface GoalTotal {
  raised: number;
  donors: number;
  gifts: number;
}

/** Each goal's total raised, donors and gifts, from its paid gifts in its dates. */
export async function goalTotals(db: Db, goals: DonationGoal[]): Promise<Record<string, GoalTotal>> {
  const out: Record<string, GoalTotal> = {};
  if (!goals.length) return out;
  const { data } = await db.from('donations').select('goal, status, amount, total, refunded_amount, paid_at, email').in('goal', goals.map((g) => g.id)).eq('status', 'paid').limit(50_000);
  for (const g of goals) {
    const rows = (data ?? []).filter((d) => d.goal === g.id && inGoalDates(g, d.paid_at as string));
    out[g.id] = { raised: rows.reduce((a, d) => a + raised(d as unknown as CountedGift), 0), donors: new Set(rows.map((d) => String(d.email).toLowerCase())).size, gifts: rows.length };
  }
  return out;
}
