// The Donations screen's gifts as CSV: GET /api/admin/donations.csv?tab=&q=&goal= (the screen's tab, search
// and goal). Formulas guarded.
import type { APIRoute } from 'astro';
import { allRows } from '../../../lib/rows';
import { donationSettings } from '../../../lib/donations/config';
import { donationsCsvRows, donationsQuery, type Donation } from '../../../lib/donations/donations';

const cell = (v: unknown) => {
  let s = String(v ?? '');
  // A donor's name starting with =, +, -, @ would run as a formula in a spreadsheet.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const GET: APIRoute = async ({ url, locals }) => {
  const p = url.searchParams;
  const { data, error } = await allRows(donationsQuery(locals.db, p.get('tab') ?? 'all', p.get('q') ?? '', p.get('goal') ?? ''));
  if (error) return new Response(error.message, { status: 400 });
  const { data: siteRow } = await locals.db.from('settings').select('value').eq('key', 'site').maybeSingle();
  const lines = donationsCsvRows((data ?? []) as Donation[], donationSettings(siteRow?.value as any).goals).map((r) => r.map(cell).join(','));
  const day = new Date().toISOString().slice(0, 10);
  return new Response(`﻿${lines.join('\r\n')}\r\n`, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="donations-${day}.csv"` } });
};
