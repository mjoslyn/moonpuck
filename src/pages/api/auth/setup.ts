import type { APIRoute } from 'astro';
import { createUser, redirectWith, signIn, userByEmail } from '../../../lib/auth';
import { siteDb } from '../../../lib/db/site';
import { firstAdminProblem, needsFirstAdmin, setupCodeNeeded } from '../../../lib/admin/first-run';
import { seedSite } from '../../../lib/admin/seed';

/** The first admin (src/lib/admin/first-run.ts): only while the site has none. */
export const POST: APIRoute = async ({ request, redirect }) => {
  if (!(await needsFirstAdmin())) return redirect('/admin/login/');
  const form = await request.formData();
  const f = { name: String(form.get('name') ?? '').trim(), email: String(form.get('email') ?? '').trim().toLowerCase(), password: String(form.get('password') ?? ''), code: String(form.get('code') ?? '') };
  const back = (error: string) => redirect(`/admin/setup/?error=${encodeURIComponent(error)}&email=${encodeURIComponent(f.email)}`);
  const problem = firstAdminProblem(f, setupCodeNeeded());
  if (problem) return back(problem);
  if (await userByEmail(f.email)) return back('That address already has an account. Make it an admin with scripts/create-editor.ts, or use another.');
  const user = await createUser({ email: f.email, name: f.name, password: f.password, emailVerified: true });
  const { error } = await siteDb().from('profiles').upsert({ id: user.id, role: 'admin', ...(f.name ? { display_name: f.name } : {}) });
  if (error) return back(error.message);
  if (form.get('starter')) await seedSite(siteDb()).catch((e) => console.error(`starter content: ${(e as Error).message}`));
  const res = await signIn(f.email, f.password, request, false);
  if (!res.ok) return redirect('/admin/login/');
  return redirectWith('/admin/', res.cookies, 303);
};
