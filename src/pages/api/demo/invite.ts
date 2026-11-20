import type { APIRoute } from 'astro';
import { isDemo } from '../../../lib/demo';
import { demoInvite } from '../../../lib/demo/invite';
import { env } from '../../../lib/env';

/** A demo's "Try the editor" form (src/lib/demo/invite.ts): back to the sign-in page with the answer's code. Not Found off a demo. */
export const POST: APIRoute = async ({ request, redirect, url }) => {
  if (!isDemo()) return new Response('Not Found', { status: 404 });
  const form = await request.formData();
  const origin = env('SITE_URL')?.replace(/\/$/, '') || url.origin;
  const code = await demoInvite(String(form.get('email') ?? ''), request, origin, String(form.get('website') ?? ''));
  return redirect(`/admin/login/?demo=${code}`, 303);
};
