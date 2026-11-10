import { INVALID_EMAIL_MESSAGE, isValidEmail } from './contacts';
import { readJsonFile, toJson } from './folder';
import { InvoiceKind } from './InvoiceKind';
import { formatCents } from './money';
import { assertSafeClientId } from './parties';
import { addDays, displayDate, periodTexts } from './period';
import type { InvoiceStorage } from './storage';
import { InvoiceError } from './types';
import type { FieldError, InvoiceRecord } from './types';
import { isBlank } from './validate';

const TEMPLATE_DIR = 'email-templates';
const SETTINGS_PATH = `${TEMPLATE_DIR}/settings.json`;
const PLACEHOLDER = /\{([^{}\n]*)\}/g;
const TEMPLATE_FIELDS = ['subject', 'body'] as const;
const CRLF = '\r\n';
const LF = '\n';
const LEADING_NEWLINES = /^(\r?\n)+/;
const ANY_NEWLINE = /\r?\n/g;

interface EmailSettings { from?: string; signature?: string; }

export const EMAIL_PLACEHOLDERS = ['number', 'period', 'total', 'dueDate', 'clientName', 'companyName'] as const;

export interface EmailTemplate { subject: string; body: string; }

export const BUILT_IN_EMAIL_TEMPLATES: Readonly<Record<InvoiceKind, EmailTemplate>> = {
  [InvoiceKind.Invoice]: {
    subject: 'Τιμολόγιο {number} - {companyName}',
    body: 'Αξιότιμοι κύριοι,\n\nΣας αποστέλλουμε συνημμένο το τιμολόγιο {number}.\n\nΠερίοδος: {period}\nΠοσό: €{total}\nΗμερομηνία λήξης: {dueDate}\n\nΜε εκτίμηση,\n{companyName}',
  },
  [InvoiceKind.CreditNote]: {
    subject: 'Πιστωτικό σημείωμα {number} - {companyName}',
    body: 'Αξιότιμοι κύριοι,\n\nΣας αποστέλλουμε συνημμένο το πιστωτικό σημείωμα {number}.\n\nΠερίοδος: {period}\nΠοσό: €{total}\n\nΜε εκτίμηση,\n{companyName}',
  },
};

function templatePath(kind: InvoiceKind, clientId?: string): string {
  if (clientId === undefined) {
    return `${TEMPLATE_DIR}/${kind}.json`;
  }
  assertSafeClientId(clientId);
  return `${TEMPLATE_DIR}/${clientId}/${kind}.json`;
}

async function readStored(storage: InvoiceStorage, path: string): Promise<EmailTemplate | null> {
  if ((await storage.readText(path)) === null) {
    return null;
  }
  const { subject, body } = await readJsonFile<{ subject?: unknown; body?: unknown }>(storage, path, 'emailTemplate');
  if (typeof subject !== 'string' || typeof body !== 'string') {
    throw new InvoiceError([{ path: 'emailTemplate', message: `must hold a subject and a body: ${path}` }]);
  }
  return { subject, body };
}

function placeholderValues(record: InvoiceRecord): ReadonlyMap<string, string> {
  const terms = record.client.paymentTermsDays;
  return new Map([
    ['number', record.number],
    ['period', periodTexts(record.request.period).el],
    ['total', formatCents(record.totals.totalCents)],
    ['dueDate', typeof terms === 'number' ? displayDate(addDays(record.request.date, terms)) : ''],
    ['clientName', record.client.name],
    ['companyName', record.company.name],
  ]);
}

/** Reads the template to use: the client's override, else the edited general one, else the built-in. */
export async function readEmailTemplate(storage: InvoiceStorage, kind: InvoiceKind, clientId?: string): Promise<EmailTemplate> {
  const override = clientId === undefined ? null : await readStored(storage, templatePath(kind, clientId));
  return override ?? (await readStored(storage, templatePath(kind))) ?? BUILT_IN_EMAIL_TEMPLATES[kind];
}

/** Stores the general template of a kind, or a client's override when a client is given. */
export async function saveEmailTemplate(storage: InvoiceStorage, kind: InvoiceKind, template: EmailTemplate, clientId?: string): Promise<void> {
  const errors: FieldError[] = TEMPLATE_FIELDS.filter((field) => isBlank(template[field])).map((field) => ({ path: field, message: 'must not be blank' }));
  if (errors.length > 0) {
    throw new InvoiceError(errors);
  }
  await storage.replace(templatePath(kind, clientId), toJson({ subject: template.subject, body: template.body }));
}

/** Deletes a stored template, so the next one in line applies. */
export async function removeEmailTemplate(storage: InvoiceStorage, kind: InvoiceKind, clientId?: string): Promise<void> {
  await storage.remove(templatePath(kind, clientId));
}

/** Lists each placeholder in a text that the templates cannot fill, once. */
export function findUnknownPlaceholders(text: string): string[] {
  const known = new Set<string>(EMAIL_PLACEHOLDERS);
  return [...new Set([...text.matchAll(PLACEHOLDER)].map((match) => match[1] ?? ''))].filter((name) => !known.has(name));
}

/** Fills a template from an issued record, refusing and naming any unknown placeholder. */
export function fillEmailTemplate(template: EmailTemplate, record: InvoiceRecord): EmailTemplate {
  const errors = TEMPLATE_FIELDS.flatMap((field) => findUnknownPlaceholders(template[field]).map((name) => ({ path: field, message: `unknown placeholder {${name}}` })));
  if (errors.length > 0) {
    throw new InvoiceError(errors);
  }
  return { subject: fillText(template.subject, record), body: fillText(template.body, record) };
}

async function readSettings(storage: InvoiceStorage): Promise<EmailSettings> {
  if ((await storage.readText(SETTINGS_PATH)) === null) {
    return {};
  }
  const { from, signature } = await readJsonFile<{ from?: unknown; signature?: unknown }>(storage, SETTINGS_PATH, 'emailSettings');
  return { ...(typeof from === 'string' ? { from } : {}), ...(typeof signature === 'string' ? { signature } : {}) };
}

function fillText(text: string, record: InvoiceRecord): string {
  const values = placeholderValues(record);
  return text.replace(PLACEHOLDER, (_match, name: string) => values.get(name) ?? '');
}

function tidySignature(signature: string, newline: string): string {
  return signature.replace(LEADING_NEWLINES, '').trimEnd().replace(ANY_NEWLINE, newline);
}

/** Reads the address invoices are sent from; null until it is set. */
export async function readSenderAddress(storage: InvoiceStorage): Promise<string | null> {
  const { from } = await readSettings(storage);
  return from ?? null;
}

/** Stores the address invoices are sent from. */
export async function saveSenderAddress(storage: InvoiceStorage, from: string): Promise<void> {
  if (!isValidEmail(from)) {
    throw new InvoiceError([{ path: 'from', message: INVALID_EMAIL_MESSAGE }]);
  }
  await storage.replace(SETTINGS_PATH, toJson({ ...(await readSettings(storage)), from }));
}

/** Reads the plain-text signature put under every email; empty when none is set. */
export async function readEmailSignature(storage: InvoiceStorage): Promise<string> {
  return (await readSettings(storage)).signature ?? '';
}

/** Stores the email signature, keeping the sender address; a blank signature means none. */
export async function saveEmailSignature(storage: InvoiceStorage, signature: string): Promise<void> {
  const { from } = await readSettings(storage);
  const kept = isBlank(signature) ? {} : { signature };
  await storage.replace(SETTINGS_PATH, toJson({ ...(from === undefined ? {} : { from }), ...kept }));
}

/** Fills the signature's placeholders from an issued record, refusing and naming any unknown one. */
export function fillEmailSignature(signature: string, record: InvoiceRecord): string {
  const errors = findUnknownPlaceholders(signature).map((name) => ({ path: 'signature', message: `unknown placeholder {${name}}` }));
  if (errors.length > 0) {
    throw new InvoiceError(errors);
  }
  return fillText(signature, record);
}

/** Puts the signature under the body after one blank line, in the body's line ending, unless it already ends with it. */
export function appendSignature(body: string, signature: string): string {
  const newline = body.includes(CRLF) ? CRLF : LF;
  const tidy = tidySignature(signature, newline);
  const text = body.trimEnd();
  if (tidy === '' || text.endsWith(tidy)) {
    return body;
  }
  return `${text}${newline}${newline}${tidy}`;
}
