// One ticket email in a list of them (Settings > Tickets, and an event's own on its attendee list): the
// email card (src/admin/EmailCard.tsx) with the ticket kit (src/admin/ticket-email.ts).
import type { ReactNode } from 'react';
import type { EmailDoc } from '../lib/forms/email';
import { DEFAULT_EMAILS, type EmailKind, type TicketEmail } from '../lib/tickets/config';
import { ticketEmailKit } from './ticket-email';
import { EmailCard } from './EmailCard';

export function TicketEmailCard(props: {
  kind: EmailKind;
  label: string;
  help: ReactNode;
  value: TicketEmail;
  start?: EmailDoc;
  subjectPlaceholder?: string;
  eventTitle?: string;
  note: string;
  children?: ReactNode;
  onChange: (patch: TicketEmail) => void;
  onReset?: () => void;
  onDone?: () => void;
}) {
  const { kind, eventTitle, ...rest } = props;
  return <EmailCard {...rest} fallback={DEFAULT_EMAILS[kind]} templateKey={`ticket:${kind}`} makeKit={(subject) => ticketEmailKit(kind, subject, eventTitle)} />;
}
