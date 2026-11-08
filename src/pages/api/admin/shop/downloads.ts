// A product's download file (its Shop settings, Download): POST the file as the request's body, its name in
// X-File-Name; answers what the product keeps (src/lib/shop/downloads.ts). Editors.
import type { APIRoute } from 'astro';
import { storeDownload } from '../../../../lib/shop/downloads';

export const POST: APIRoute = async ({ request }) => {
  const r = await storeDownload(request);
  return 'error' in r ? new Response(r.error, { status: r.status }) : Response.json(r);
};
