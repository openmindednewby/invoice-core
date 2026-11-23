import { readContacts } from './contacts';
import type { Contact } from './contacts';
import { appendSignature, fillEmailTemplate, findUnknownPlaceholders, readEmailSignature, readEmailTemplate, readSenderAddress } from './emailTemplates';
import type { EmailTemplate } from './emailTemplates';
import { pdfPath } from './folder';
import { withTimeGreeting } from './greeting';
import { readInvoice } from './issue';
import { RecipientKind } from './RecipientKind';
import { readSendLog } from './sendLog';
import type { SendEntry } from './sendLog';
import { readSentStatus } from './sentStatus';
import type { InvoiceStorage } from './storage';
import type { InvoiceRecord } from './types';
import { readUncertainSend } from './uncertainSend';

export interface SendForm {
  to: string;
  cc: string;
  subject: string;
  body: string;
}

export interface SendDraft extends SendForm {
  number: string;
  from: string;
  people: readonly Contact[];
  pdfName: string;
  pdfMissing: boolean;
  sentOn: string | null;
  lastSend: SendEntry | null;
  uncertainAt: string | null;
}

const LIST_JOIN = ', ';
const HIDDEN_OPEN = '⟦';
const HIDDEN_CLOSE = '⟧';

function addressesOf(contacts: readonly Contact[], kind: RecipientKind): string {
  return contacts.filter((contact) => contact.recipient === kind).map((contact) => contact.email).join(LIST_JOIN);
}

function replaceEach(text: string, names: readonly string[], from: (name: string) => string, to: (name: string) => string): string {
  return names.reduce((current, name) => current.replaceAll(from(name), to(name)), text);
}

/** Fills a template from an issued record and leaves any unknown placeholder visible, so it can be fixed in the preview. */
export function fillKeepingUnknown(template: EmailTemplate, record: InvoiceRecord): EmailTemplate {
  const names = findUnknownPlaceholders(`${template.subject}\n${template.body}`);
  const open = (name: string): string => `{${name}}`;
  const hidden = (name: string): string => `${HIDDEN_OPEN}${name}${HIDDEN_CLOSE}`;
  const filled = fillEmailTemplate(
    { subject: replaceEach(template.subject, names, open, hidden), body: replaceEach(template.body, names, open, hidden) },
    record
  );
  return { subject: replaceEach(filled.subject, names, hidden, open), body: replaceEach(filled.body, names, hidden, open) };
}

/** Puts the signature, filled like the template, one blank line under a filled message. */
export function signBody(body: string, signature: string, record: InvoiceRecord): string {
  return appendSignature(body, fillKeepingUnknown({ subject: '', body: signature }, record).body);
}

/** Reads the default email for one issued document: contacts To/Cc, filled template, greeting, signature; a missing PDF is reported, never printed anew. */
export async function loadSendDraft(storage: InvoiceStorage, number: string, now: Date = new Date()): Promise<SendDraft> {
  const record = await readInvoice(storage, number);
  const clientId = record.request.clientId;
  const [contacts, template, signature, from, pdf, status, sends, uncertainAt] = await Promise.all([
    readContacts(storage, clientId),
    readEmailTemplate(storage, record.kind, clientId),
    readEmailSignature(storage),
    readSenderAddress(storage),
    storage.readBytes(pdfPath(number)),
    readSentStatus(storage, number),
    readSendLog(storage, number),
    readUncertainSend(storage, number),
  ]);
  const filled = fillKeepingUnknown(template, record);
  return {
    number,
    from: from ?? '',
    people: contacts,
    to: addressesOf(contacts, RecipientKind.To),
    cc: addressesOf(contacts, RecipientKind.Cc),
    subject: filled.subject,
    body: signBody(withTimeGreeting(filled.body, now), signature, record),
    pdfName: `${number}.pdf`,
    pdfMissing: pdf === null || pdf.length === 0,
    sentOn: status.sentOn,
    lastSend: sends[sends.length - 1] ?? null,
    uncertainAt,
  };
}

/** Whether this invoice has gone before, by a date on file or a logged send. */
export function isRepeatSend(draft: Pick<SendDraft, 'sentOn' | 'lastSend'>): boolean {
  return draft.sentOn !== null || draft.lastSend !== null;
}
