// A bought download (src/lib/shop/downloads.ts): GET /api/shop/download?order=<token>&line=<n>, counted
// and limited, streamed from the store's private folder.
import type { APIRoute } from 'astro';
import { serveDownload } from '../../../lib/shop/downloads';

export const GET: APIRoute = async ({ url }) => serveDownload(url.searchParams.get('order') ?? '', Math.trunc(Number(url.searchParams.get('line'))));
