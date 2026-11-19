// A newsletter draft's editor for a share link's guest (src/pages/admin/shared-email/[id].astro): its subject
// and its email (the email builder, with its preview line and plain text), saved with PUT
// /api/admin/shared-email/<id> (src/lib/share). No lists, audience, sender, tests or sending: those are
// editors'. The builder's Templates panel and the email's look (colours, font, width) aren't offered.
import { useEffect, useMemo, useRef, useState } from 'react';
import EmailBuilder from '../forms/EmailBuilder';
import { mailingEmailKit } from './mailing-email';
import type { EmailDoc } from '../lib/forms/email';
import type { ContactField } from '../lib/mailing/config';

interface SharedCampaign {
  id: number;
  name: string;
  subject: string;
  design: unknown;
  text: string;
  updated_at: string;
}

export default function SharedEmailEditor({ campaign, fields, label }: { campaign: SharedCampaign; fields: ContactField[]; label: string }) {
  const [c, setC] = useState(campaign);
  const [saved, setSaved] = useState(() => JSON.stringify([campaign.subject, campaign.design, campaign.text]));
  const [building, setBuilding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const latest = useRef(c);
  latest.current = c;
  const base = useRef(campaign.updated_at);
  const dirty = JSON.stringify([c.subject, c.design, c.text]) !== saved;
  const kit = useMemo(() => ({ ...mailingEmailKit({ id: campaign.id, subject: () => latest.current.subject, fields }), templates: undefined, lockLook: true }), [campaign.id]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const save = async () => {
    setBusy(true);
    setStatus('Saving…');
    const now = latest.current;
    const res = await fetch(`/api/admin/shared-email/${campaign.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subject: now.subject, design: now.design, text: now.text, base: base.current }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setStatus((res && (await res.text())) || 'Couldn’t save. Try again.');
    base.current = (await res.json()).updated_at;
    setSaved(JSON.stringify([now.subject, now.design, now.text]));
    setStatus(`Saved ${new Date().toLocaleTimeString()}`);
  };

  const input = 'w-full rounded border border-admin-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-admin-accent';
  return (
    <div className="mx-auto max-w-3xl p-6">
      <p className="mb-2">
        <span className="rounded-full bg-admin-accent/10 px-2 py-0.5 text-xs text-admin-accent" title="Your changes are saved to the newsletter's draft; the site's editors send it">
          Shared with you{label ? ` (${label})` : ''}
        </span>
      </p>
      <h1 className="text-3xl font-normal">{c.name || 'Newsletter'}</h1>
      <p className="mt-1 text-sm text-admin-muted">Change the subject and the email, then Save. The site’s editors choose who it goes to and send it.</p>
      <label className="mt-6 block text-sm">
        <span className="mb-1 block font-medium">Subject</span>
        <input className={input} value={c.subject} maxLength={300} onChange={(e) => setC({ ...c, subject: e.target.value })} />
      </label>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" className="rounded-sm border border-admin-ink/20 bg-white px-3 py-1.5 text-sm hover:border-admin-accent hover:text-admin-accent" onClick={() => setBuilding(true)}>
          Edit the email
        </button>
        <button type="button" disabled={busy || !dirty} onClick={save} className="rounded-sm bg-admin-ink px-4 py-1.5 text-sm font-medium text-white hover:bg-admin-accent disabled:opacity-50">
          Save
        </button>
        <span role="status" className="text-xs text-admin-muted">
          {status || (dirty ? 'Unsaved changes' : '')}
        </span>
      </div>
      {building && (
        <EmailBuilder
          title={`${c.name || 'Newsletter'}: email`}
          kit={kit}
          design={(c.design ?? { root: { props: {} }, content: [] }) as EmailDoc}
          text={c.text}
          note="Saved with the newsletter (Save)."
          onChange={(patch) => setC((x) => ({ ...x, ...(patch.design ? { design: patch.design } : {}), ...('text' in patch ? { text: patch.text ?? '' } : {}) }))}
          onClose={() => setBuilding(false)}
        />
      )}
    </div>
  );
}
