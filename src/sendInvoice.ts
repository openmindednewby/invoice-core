import { addMissingContacts, INVALID_EMAIL_MESSAGE, isValidEmail } from './contacts';
import { fillEmailTemplate } from './emailTemplates';
import { pdfPath } from './folder';
import { readInvoice } from './issue';
import { RecipientKind } from './RecipientKind';
import { appendSend, firstSendDate, readSendLog, sha256Hex } from './sendLog';
import type { SendEntry } from './sendLog';
import { assertSentDate, markFirstSent, readSentStatus } from './sentStatus';
import { SentNotRecordedError } from './SentNotRecordedError';
import type { InvoiceStorage } from './storage';
import { InvoiceError } from './types';
import type { FieldError, InvoiceRecord } from './types';
import { isBlank } from './validate';

const PDF_CONTENT_TYPE = 'application/pdf';
const LINE_BREAK = /[\r\n]/;

const inFlight = new WeakMap<InvoiceStorage, Set<string>>();

export interface MailAttachment { filename: string; contentType: string; data: Uint8Array; }

export interface MailMessage { from: string; to: string[]; cc: string[]; subject: string; body: string; attachment: MailAttachment; }

export interface MailSender {
  /** Sends a message and returns the id the mail service gave it; rejects if it was not accepted. */
  send(message: MailMessage): Promise<{ messageId: string }>;
}

export interface SendInvoiceInput {
  number: string; from: string; to: string[]; cc: string[]; subject: string; body: string; at: string; today: string;
}

export interface SendInvoiceResult {
  messageId: string; sentOn: string; pdfSha256: string; addedContacts: string[]; contactsUpdated: boolean;
}

interface SendReady { record: InvoiceRecord; pdf: Uint8Array; sentDate: string; }

function addressErrors(field: string, addresses: string[]): FieldError[] {
  return addresses.flatMap((address, index) => (isValidEmail(address) ? [] : [{ path: `${field}.${index}`, message: INVALID_EMAIL_MESSAGE }]));
}

function subjectErrors(subject: string): FieldError[] {
  if (isBlank(subject)) {
    return [{ path: 'subject', message: 'must not be blank' }];
  }
  return LINE_BREAK.test(subject) ? [{ path: 'subject', message: 'must be a single line' }] : [];
}

function checkInput(input: SendInvoiceInput): void {
  const errors: FieldError[] = [
    ...(isValidEmail(input.from) ? [] : [{ path: 'from', message: INVALID_EMAIL_MESSAGE }]),
    ...(input.to.length === 0 ? [{ path: 'to', message: 'needs at least one recipient' }] : addressErrors('to', input.to)),
    ...addressErrors('cc', input.cc),
    ...subjectErrors(input.subject),
  ];
  if (errors.length > 0) {
    throw new InvoiceError(errors);
  }
}

function dateToMark(record: InvoiceRecord, sends: SendEntry[], today: string): string {
  const logged = firstSendDate(sends);
  if (logged === null) {
    assertSentDate(record, today);
    return today;
  }
  return logged < record.request.date ? record.request.date : logged;
}

async function readyToSend(storage: InvoiceStorage, input: SendInvoiceInput): Promise<SendReady> {
  checkInput(input);
  const record = await readInvoice(storage, input.number);
  const pdf = await storage.readBytes(pdfPath(input.number));
  if (pdf === null || pdf.length === 0) {
    throw new InvoiceError([{ path: 'pdf', message: `${input.number} has no PDF: ${pdfPath(input.number)}` }]);
  }
  const sends = await readSendLog(storage, input.number);
  const { sentOn } = await readSentStatus(storage, input.number);
  return { record, pdf, sentDate: sentOn ?? dateToMark(record, sends, input.today) };
}

async function succeeded(work: () => Promise<unknown>): Promise<boolean> {
  try {
    await work();
    return true;
  } catch {
    return false;
  }
}

async function recordSend(storage: InvoiceStorage, number: string, entry: SendEntry, sentDate: string): Promise<string> {
  let standing = sentDate;
  const logged = await succeeded(() => appendSend(storage, number, entry));
  const marked = await succeeded(async () => {
    standing = await markFirstSent(storage, number, sentDate);
  });
  if (!logged || !marked) {
    throw new SentNotRecordedError(number, entry.messageId, { logged, marked });
  }
  return standing;
}

async function rememberRecipients(storage: InvoiceStorage, clientId: string, input: SendInvoiceInput): Promise<{ addedContacts: string[]; contactsUpdated: boolean }> {
  const recipients = [
    ...input.to.map((email) => ({ email, recipient: RecipientKind.To })),
    ...input.cc.map((email) => ({ email, recipient: RecipientKind.Cc })),
  ];
  try {
    return { addedContacts: await addMissingContacts(storage, clientId, recipients), contactsUpdated: true };
  } catch {
    return { addedContacts: [], contactsUpdated: false };
  }
}

async function sendOnce(storage: InvoiceStorage, input: SendInvoiceInput, sender: MailSender): Promise<SendInvoiceResult> {
  const { record, pdf, sentDate } = await readyToSend(storage, input);
  const { subject, body } = fillEmailTemplate({ subject: input.subject, body: input.body }, record);
  const pdfSha256 = await sha256Hex(pdf);
  const { from, to, cc, at, number } = input;
  const attachment = { filename: `${number}.pdf`, contentType: PDF_CONTENT_TYPE, data: pdf };
  const { messageId } = await sender.send({ from, to, cc, subject, body, attachment });
  const sentOn = await recordSend(storage, number, { at, from, to, cc, subject, messageId, pdfSha256 }, sentDate);
  return { messageId, sentOn, pdfSha256, ...(await rememberRecipients(storage, record.request.clientId, input)) };
}

/** Sends an issued invoice with its PDF through the given sender, logs the send and marks it sent. */
export async function sendInvoice(storage: InvoiceStorage, input: SendInvoiceInput, sender: MailSender): Promise<SendInvoiceResult> {
  const running = inFlight.get(storage) ?? new Set<string>();
  inFlight.set(storage, running);
  if (running.has(input.number)) {
    throw new InvoiceError([{ path: 'number', message: `${input.number} is already being sent` }]);
  }
  running.add(input.number);
  try {
    return await sendOnce(storage, input, sender);
  } finally {
    running.delete(input.number);
  }
}
