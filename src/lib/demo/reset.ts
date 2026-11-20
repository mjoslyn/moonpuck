// A demo's reset (src/lib/demo): back to its starting point, every resetHours() hours, from the Worker's
// hourly run (`scheduledDemoReset`), or by hand (`npm run demo -- reset`). The starting point is a snapshot
// (src/lib/sync.ts) saved as `<time>-snapshot-demo.json` (`saveDemoStart`, `npm run demo -- save`), kept
// apart from the snapshots pruned by number. A reset:
//   - restores it, deleting what was made since (entries, terms, media rows, templates, forms, settings);
//   - deletes the files visitors uploaded: every stored object of a media row the starting point doesn't have;
//   - deletes every account but admins' (visitors' editor accounts and any members), with their sessions;
//   - empties what visitors leave behind elsewhere: share links and comments, Compose conversations and
//     jobs, form submissions, revisions, the email log, Not found addresses and the demo's day counts.
// Server only.
import type { Db } from '../db/query';
import { serviceClient } from '../db/site';
import { demoSnapshot, mediaObjects, restore, takeSnapshot, backupFile } from '../sync';
import { deleteUser } from '../auth';
import { isDemo, resetDue } from './index';

/** Tables a reset empties (none of them in a snapshot), each with a column every row has, for the delete. */
const EMPTIED: [string, string][] = [
  ['share_comments', 'id'],
  ['share_links', 'id'],
  ['compose_jobs', 'id'],
  ['compose_sessions', 'id'],
  ['form_submissions', 'id'],
  ['revisions', 'id'],
  ['mail_log', 'id'],
  ['not_found', 'path'],
];

/** Save this site as it is now as the demo's starting point (older starting points go). */
export async function saveDemoStart(db: Db = serviceClient()): Promise<string> {
  return (await takeSnapshot(db, 'demo')).path;
}

/** Every stored file of the media rows the starting point doesn't have (visitors' uploads). */
async function uploadsSince(db: Db, path: string): Promise<string[]> {
  const start = JSON.parse(await (await backupFile('here', path)).text());
  const kept = new Set<number>((start.tables?.media ?? []).map((m: { id: number }) => m.id));
  const { data, error } = await db.from('media').select('id, path, sizes, formats');
  if (error) throw new Error(`Could not read the media library: ${error.message}`);
  return (data ?? []).filter((m) => !kept.has(m.id)).flatMap((m) => mediaObjects(m as { path: string; sizes?: any; formats?: any }));
}

/** Put the demo back to its starting point. A summary of what was done, for the log. */
export async function resetDemo(db: Db = serviceClient()): Promise<string> {
  const path = await demoSnapshot();
  if (!path) return 'no starting point saved (npm run demo -- save)';
  const uploads = await uploadsSince(db, path);
  const restored = await restore('here', path, { deleteSince: true });
  const notes: string[] = [`restored ${restored.restored} rows, removed ${restored.removed}`, ...restored.problems];
  // The files go once their rows have (a restore never deletes stored files itself).
  for (let i = 0; i < uploads.length; i += 100) {
    const { error } = await db.storage.from('media').remove(uploads.slice(i, i + 100));
    if (error) notes.push(`uploads not all deleted: ${error.message}`);
  }
  notes.push(`${uploads.length} uploaded files deleted`);
  const { data: people, error } = await db.from('profiles').select('id, role').neq('role', 'admin');
  if (error) notes.push(`accounts not read: ${error.message}`);
  for (const p of people ?? []) await deleteUser(p.id).catch((e: Error) => notes.push(`account ${p.id} not deleted: ${e.message}`));
  notes.push(`${people?.length ?? 0} accounts deleted`);
  for (const [table, column] of EMPTIED) {
    const { error: e } = await (db.from(table as any) as any).delete().not(column, 'is', null);
    if (e) notes.push(`${table} not emptied: ${e.message}`);
  }
  await db.from('verifications').delete().like('identifier', 'demo:%');
  return notes.join('; ');
}

/** The Worker's hourly run: on a demo, reset when it's due (the hours dividing by resetHours()). */
export async function scheduledDemoReset(now = new Date()): Promise<string> {
  if (!isDemo()) return 'not a demo';
  if (!resetDue(now)) return 'demo reset not due';
  return `demo reset: ${await resetDemo()}`;
}
