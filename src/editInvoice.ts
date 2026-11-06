import { numberYear, pdfPath, recordPath, toJson } from './folder';
import { appendEdit } from './editLog';
import { InvoiceKind } from './InvoiceKind';
import { InvoiceSentError } from './InvoiceSentError';
import { listIssued, readInvoice, rendererFor } from './issue';
import type { IssueOptions } from './issue';
import { resolveLayout, selectLayoutName } from './layouts';
import { computeTotals, resolveLines } from './lines';
import { checkRequest } from './parties';
import { loadLogo } from './pdf';
import { readStatusFile, STATUS_LOCK } from './statusFile';
import type { InvoiceStorage } from './storage';
import { InvoiceError } from './types';
import type { InvoiceRecord, InvoiceRequest, IssuedInvoice } from './types';

const EDITABLE = ['clientId', 'period', 'date', 'amounts', 'lines', 'template', 'layout'] as const;
const YEAR_SHAPE = /^\d{4}$/;

type EditableField = (typeof EDITABLE)[number];

export type InvoiceChanges = Partial<Pick<InvoiceRequest, EditableField>>;

export interface EditOptions extends IssueOptions { now?: () => Date; }

export interface EditedInvoice extends IssuedInvoice { changed: string[]; }

function isEditable(key: string): key is EditableField {
  return (EDITABLE as readonly string[]).includes(key);
}

function checkChanges(record: InvoiceRecord, changes: InvoiceChanges): void {
  const refused = Object.keys(changes).filter((key) => !isEditable(key));
  if (refused.length > 0) {
    throw new InvoiceError(refused.map((path) => ({ path, message: 'cannot be edited' })));
  }
  if (record.kind !== InvoiceKind.Invoice) {
    throw new InvoiceError([{ path: 'number', message: `${record.number} is a credit note; only an invoice can be edited` }]);
  }
  const year = numberYear(record.number);
  if (changes.date !== undefined && changes.date.slice(0, 4) !== year) {
    throw new InvoiceError([{ path: 'date', message: `must stay in ${year}, the year of number ${record.number}` }]);
  }
}

function changedFields(request: InvoiceRequest, changes: InvoiceChanges): EditableField[] {
  return Object.keys(changes).filter(isEditable).filter((key) => JSON.stringify(changes[key]) !== JSON.stringify(request[key]));
}

async function assertNotCredited(storage: InvoiceStorage, number: string): Promise<void> {
  const first = numberYear(number);
  const years = (await storage.list('invoices')).filter((name) => YEAR_SHAPE.test(name) && name >= first);
  const records = (await Promise.all(years.map((year) => listIssued(storage, year)))).flat();
  const credit = records.find((other) => other.creditFor === number);
  if (credit !== undefined) {
    throw new InvoiceError([{ path: 'number', message: `${number} has credit note ${credit.number}; it can no longer be edited` }]);
  }
}

async function assertNotSent(storage: InvoiceStorage, number: string): Promise<void> {
  const { sentOn } = await readStatusFile(storage, number);
  if (sentOn !== undefined) {
    throw new InvoiceSentError(number, sentOn);
  }
}

async function replacePdf(storage: InvoiceStorage, number: string, pdf: Uint8Array): Promise<string> {
  const path = pdfPath(number);
  try {
    await storage.replace(path, pdf);
  } catch {
    await storage.remove(path).catch(() => undefined);
    throw new InvoiceError([{ path: 'number', message: `${number} is edited but its PDF could not be saved; run: reprint --number ${number}` }]);
  }
  return path;
}

/** Edits an issued invoice that was not sent: keeps its number, replaces the record and PDF, and logs the changed fields. */
export async function editInvoice(storage: InvoiceStorage, number: string, changes: InvoiceChanges, options: EditOptions = {}): Promise<EditedInvoice> {
  const record = await readInvoice(storage, number);
  checkChanges(record, changes);
  const changed = changedFields(record.request, changes);
  if (changed.length === 0) {
    return { number, pdfPath: pdfPath(number), recordPath: recordPath(number), changed };
  }
  const request: InvoiceRequest = { ...record.request, ...changes, draft: false };
  const parties = await checkRequest(storage, request);
  await resolveLayout(storage, selectLayoutName(request, parties));
  await loadLogo(storage, parties.company.logo);
  const render = rendererFor(storage, options);
  return storage.withLock(STATUS_LOCK, async () => {
    await assertNotSent(storage, number);
    await assertNotCredited(storage, number);
    const lines = resolveLines(request, parties.client);
    const pdf = await render({ request, number, parties, lines });
    const totals = computeTotals(lines, parties.rule.ratePercent);
    const updated: InvoiceRecord = { ...record, request, ...parties, lines, totals };
    await storage.replace(recordPath(number), toJson(updated));
    await appendEdit(storage, number, { at: (options.now ?? ((): Date => new Date()))().toISOString(), fields: changed });
    return { number, pdfPath: await replacePdf(storage, number, pdf), recordPath: recordPath(number), changed };
  });
}
