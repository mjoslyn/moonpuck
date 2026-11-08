// Digital downloads: a product's file (its Shop settings, Download), kept in the store's private
// shop-downloads/ folder, which nothing serves on its own. An order keeps the file each line bought
// (`lines[].download`), and once paid its page and confirmation email link to /api/shop/download for each,
// which counts the download in the statement that allows it (`shop_download`: up to Settings > Shop's
// `downloadLimit`) within `downloadDays` of paying, and streams the file. Server only.
import type { Db } from '../db/query';
import { siteStorage } from '../storage';
import { serviceClient } from '../db/site';
import { checkoutSettings } from './checkout-settings';
import { orderByToken, type ShopOrder } from './orders';

export const DOWNLOAD_FOLDER = 'shop-downloads';
const MB = 1024 * 1024;
/** The largest download file the site takes (Cloudflare refuses requests over 100 MB on its Free and Pro plans). */
export const DOWNLOAD_MAX_MB = 200;

/** Where a line's download is fetched from. */
export const downloadUrl = (origin: string, token: string, line: number) => `${origin}/api/shop/download?order=${encodeURIComponent(token)}&line=${line}`;

/** An order's downloads: each line with one, its link, and how many times it was fetched. */
export function orderDownloads(o: Pick<ShopOrder, 'token' | 'lines' | 'status'>, origin: string): { line: number; title: string; name: string; url: string; count: number }[] {
  if (o.status !== 'paid') return [];
  return (o.lines ?? []).flatMap((l, i) => (l.download ? [{ line: i, title: l.title, name: l.download.name, url: downloadUrl(origin, o.token, i), count: l.downloads ?? 0 }] : []));
}

/** Why an order's downloads are closed now (not paid, past the days), or null. */
export function downloadsClosed(o: Pick<ShopOrder, 'status' | 'paid_at'>, days: number, now = Date.now()): string | null {
  if (o.status !== 'paid' || !o.paid_at) return 'This order isn’t paid, so its downloads aren’t available.';
  if (days > 0 && now > Date.parse(o.paid_at) + days * 86400_000) return `This download was available for ${days} days after the order was paid.`;
  return null;
}

/** The answer to a download link: the file, or a short page saying why not. */
export async function serveDownload(token: string, line: number): Promise<Response> {
  const db = serviceClient();
  const page = (status: number, text: string) => new Response(`<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>Download</title><p style="font:16px system-ui;margin:3rem auto;max-width:32rem">${text}</p>`, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
  const o = await orderByToken(db, token);
  if (!o || !o.lines?.[line]?.download) return page(404, 'There is no download here.');
  const settings = checkoutSettings(await siteShop(db));
  const closed = downloadsClosed(o, settings.downloadDays);
  if (closed) return page(410, closed);
  const { data, error } = await db.rpc('shop_download', { p_token: token, p_line: line, p_limit: settings.downloadLimit });
  if (error) return page(500, 'The download couldn’t be started. Try again in a moment.');
  if (!data) return page(410, `This download has been used ${settings.downloadLimit} ${settings.downloadLimit === 1 ? 'time' : 'times'}, as many as it allows. Ask the shop if you need it again.`);
  const file = data as { download: { path: string; name: string }; count: number };
  const res = await siteStorage().get(`${DOWNLOAD_FOLDER}/${file.download.path}`);
  if (!res.ok) return page(404, 'The file isn’t there any more. Ask the shop for it.');
  const name = file.download.name;
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return new Response(res.body, {
    headers: {
      'Content-Type': res.headers.get('content-type') || 'application/octet-stream',
      ...(res.headers.get('content-length') ? { 'Content-Length': res.headers.get('content-length')! } : {}),
      'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

async function siteShop(db: Db) {
  const { data } = await db.from('settings').select('value').eq('key', 'site').maybeSingle();
  return (data?.value as any)?.shop ?? {};
}

/**
 * A download file from the product form (the request's body, streamed to the store; its name in
 * X-File-Name), kept under a random folder so no address guesses it. Answers what the product keeps.
 */
export async function storeDownload(request: Request): Promise<{ path: string; name: string; size: number; type: string } | { error: string; status: number }> {
  const size = Number(request.headers.get('content-length') ?? NaN);
  if (!request.body || !Number.isFinite(size) || size <= 0) return { error: 'No file (or no Content-Length)', status: 411 };
  if (size > DOWNLOAD_MAX_MB * MB) return { error: `Downloads can be up to ${DOWNLOAD_MAX_MB} MB (on Cloudflare's Free and Pro plans, up to 100 MB)`, status: 413 };
  let name = 'download';
  try {
    name = decodeURIComponent(request.headers.get('x-file-name') ?? '') || name;
  } catch {}
  name = name.replace(/[\u0000-\u001f"\\/]/g, '').trim().slice(0, 150) || 'download';
  const safe = name.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'download';
  const dir = [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const type = (request.headers.get('content-type') ?? '').split(';')[0].trim().slice(0, 100) || 'application/octet-stream';
  const { error } = await siteStorage().from(DOWNLOAD_FOLDER).upload(`${dir}/${safe}`, request.body, { contentType: type, size, upsert: false });
  if (error) return { error: `Not saved: ${error.message}`, status: 500 };
  return { path: `${dir}/${safe}`, name, size, type };
}
