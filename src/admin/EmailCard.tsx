// One designed email in a list of them (Settings > Tickets and an event's own, Settings > Shop): its
// subject, whether it has its own design, and Edit email, which opens the email builder with the kit given.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import EmailBuilder, { type EmailKit } from '../forms/EmailBuilder';
import { Text } from '../puck/fields';
import type { EmailDoc } from '../lib/forms/email';
import { browserClient } from '../lib/db/browser';
import { defaultTemplate } from '../lib/email-templates';

const btn = 'rounded-sm border border-admin-ink/20 px-3 py-1.5 text-xs font-semibold hover:border-admin-ink/50';

export interface DesignedEmail {
  subject?: string;
  design?: EmailDoc;
  text?: string;
}

export function EmailCard({
  label,
  help,
  value,
  fallback,
  templateKey,
  makeKit,
  start,
  subjectPlaceholder,
  note,
  children,
  onChange,
  onReset,
  onDone,
}: {
  label: string;
  help: ReactNode;
  value: DesignedEmail;
  /** The built-in email: what is sent until someone designs one (or sets a default template). */
  fallback: { subject: string; design: EmailDoc };
  /** The default template's key (Templates in the email builder), sent when nothing above it is designed. */
  templateKey: string;
  /** The builder's kit; `subject` reads the subject as it is when the preview renders. */
  makeKit: (subject: () => string) => EmailKit;
  /** The design the builder opens with when there is none yet. */
  start?: EmailDoc;
  subjectPlaceholder?: string;
  /** Shown in the builder's header: how changes are saved. */
  note: string;
  /** Controls above the subject (on/off, timing). */
  children?: ReactNode;
  onChange: (patch: DesignedEmail) => void;
  /** Back to the default (or the site's) email; offered when this one has a design of its own. */
  onReset?: () => void;
  /** The builder closed. */
  onDone?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [template, setTemplate] = useState<{ design: EmailDoc; text: string } | null>(null);
  useEffect(() => {
    defaultTemplate(browserClient(), templateKey).then(setTemplate, () => {});
  }, [templateKey]);
  const subject = useRef(value.subject);
  subject.current = value.subject || subjectPlaceholder || fallback.subject;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const kit = useMemo(() => makeKit(() => subject.current!), [templateKey]);
  return (
    <section className="mb-3 rounded border border-admin-ink/10 bg-white p-3">
      <h3 className="text-sm font-medium">{label}</h3>
      <p className="mb-3 text-xs text-admin-muted">{help}</p>
      {children}
      <Text title="Subject" value={value.subject} placeholder={subjectPlaceholder ?? fallback.subject} onChange={(s) => onChange({ subject: s || undefined })} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={btn} onClick={() => setEditing(true)}>
          Edit email
        </button>
        <span className="text-xs text-admin-muted">{value.design ? 'Designed here' : 'Not changed yet'}</span>
        {value.design && onReset && (
          <button type="button" className="text-xs text-[#b3261e]" onClick={() => confirm('Go back to the default email? This design is removed.') && onReset()}>
            Reset to the default
          </button>
        )}
      </div>
      {editing && (
        <EmailBuilder
          title={`${label}: email`}
          kit={kit}
          design={value.design ?? start ?? template?.design ?? fallback.design}
          text={value.text ?? (value.design || start ? undefined : template?.text || undefined)}
          note={note}
          onChange={(patch) => onChange('text' in patch ? { text: patch.text } : patch)}
          onClose={() => {
            setEditing(false);
            onDone?.();
          }}
        />
      )}
    </section>
  );
}
