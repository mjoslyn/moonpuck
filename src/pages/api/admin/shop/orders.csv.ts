// The Orders screen's orders as CSV, one row per line: GET /api/admin/shop/orders.csv?tab=&q= (the
// screen's tab and search). Formulas guarded.
import type { APIRoute } from 'astro';
import { allRows } from '../../../../lib/rows';
import { ordersCsvRows, ordersQuery, type ShopOrder } from '../../../../lib/shop/orders';

const cell = (v: unknown) => {
  let s = String(v ?? '');
  // A buyer's name or address starting with =, +, -, @ would run as a formula in a spreadsheet.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const GET: APIRoute = async ({ url, locals }) => {
  const { data, error } = await allRows(ordersQuery(locals.db, url.searchParams.get('tab') ?? 'all', url.searchParams.get('q') ?? '', url.searchParams.get('status') ?? ''));
  if (error) return new Response(error.message, { status: 400 });
  const lines = ordersCsvRows((data ?? []) as ShopOrder[]).map((r) => r.map(cell).join(','));
  const day = new Date().toISOString().slice(0, 10);
  return new Response(`\uFEFF${lines.join('\r\n')}\r\n`, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="orders-${day}.csv"` } });
};
