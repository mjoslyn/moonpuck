// Shop > Stats' tables as CSV: GET /api/admin/shop/stats.csv?table=daily|products|discounts|campaigns with the
// screen's range (days, or from and to). Formulas guarded.
import type { APIRoute } from "astro";
import { SITE_TZ } from "../../../../lib/site";
import { statsRange } from "../../../../lib/stats";
import { shopSettings } from "../../../../lib/shop/config";
import { shopStats } from "../../../../lib/shop/stats";

const cell = (v: unknown) => {
  let s = String(v ?? "");
  // A product's name or code starting with =, +, -, @ would run as a formula in a spreadsheet.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const cents = (n: number) => (n / 100).toFixed(2);

export const GET: APIRoute = async ({ url, locals }) => {
  const range = statsRange(url.searchParams);
  const { data: siteRow } = await locals.db
    .from("settings")
    .select("value")
    .eq("key", "site")
    .maybeSingle();
  const currency = shopSettings(siteRow?.value).currency;
  const s = await shopStats(locals.db, range, currency, SITE_TZ);
  const table = url.searchParams.get("table");
  const rows: unknown[][] =
    table === "products"
      ? [
          ["Product", "Sold", `Sales (${currency})`],
          ...s.products.map((p) => [p.title, p.quantity, cents(p.sales)]),
        ]
      : table === "campaigns"
        ? [
            ["Campaign", "Source", "Medium", "Orders", `Sales (${currency})`],
            ...s.campaigns.map((c) => [
              c.campaign,
              c.source,
              c.medium,
              c.orders,
              cents(c.sales),
            ]),
          ]
        : table === "discounts"
          ? [
              ["Discount", "Orders", `Took off (${currency})`],
              ...s.discounts.map((d) => [d.code, d.orders, cents(d.amount)]),
            ]
          : [
              ["Day", "Orders", `Sales (${currency})`],
              ...s.daily.map((d) => [d.day, d.orders, cents(d.sales)]),
            ];
  const name = `shop-${table === "products" || table === "discounts" || table === "campaigns" ? table : "daily"}-${range.from}-to-${range.to}.csv`;
  return new Response(
    `﻿${rows.map((r) => r.map(cell).join(",")).join("\r\n")}\r\n`,
    {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name}"`,
      },
    },
  );
};
