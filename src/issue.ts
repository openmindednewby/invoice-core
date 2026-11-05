import { assertNoConflicts } from './conflicts';
import { ensureFormat, NUMBER_SHAPE, numberYear, pdfPath, readJsonFile, recordPath } from './folder';
import { InvoiceKind } from './InvoiceKind';
import { resolveLayout, selectLayoutName } from './layouts';
import { computeTotals, resolveLines } from './lines';
import { claimInvoice, nextNumber } from './numbering';
import { checkRequest } from './parties';
import { renderInvoicePdf } from './pdf';
import type { InvoiceStorage } from './storage';
import { InvoiceError } from './types';
import type { InvoiceRecord, InvoiceRequest, IssuedInvoice, ScheduleRef } from './types';
import type { RenderInput } from './view';

/** The lock every number claim holds, so two tabs never take one number. */
export const NUMBER_LOCK = 'invoice-number';

/** Renders PDF bytes; the default is renderInvoicePdf. */
export type PdfRender = (input: RenderInput) => Promise<Uint8Array>;

/** Options for issuing; schedule marks which schedule month this came from. */
export interface IssueOptions { render?: PdfRender; schedule?: ScheduleRef; }

/** The renderer in force for these options. */
export function rendererFor(storage: InvoiceStorage, options: IssueOptions): PdfRender {
  return options.render ?? ((input): Promise<Uint8Array> => renderInvoicePdf(storage, input));
}

/** Saves the record first, then its PDF; a failed PDF leaves a record that reprintInvoice can finish. */
export async function commitRecord(storage: InvoiceStorage, record: InvoiceRecord, pdf: Uint8Array): Promise<IssuedInvoice> {
  const savedRecord = await claimInvoice(storage, record);
  const savedPdf = pdfPath(record.number);
  try {
    await storage.writeNew(savedPdf, pdf);
  } catch {
    throw new InvoiceError([{ path: 'number', message: `${record.number} is issued but its PDF could not be saved; run: reprint --number ${record.number}` }]);
  }
  return { number: record.number, pdfPath: savedPdf, recordPath: savedRecord };
}

/** Issues a final invoice: renders first, then claims the number, so a failed render uses none. */
export async function issueInvoice(storage: InvoiceStorage, request: InvoiceRequest, options: IssueOptions = {}): Promise<IssuedInvoice> {
  const final = { ...request, draft: false };
  const parties = await checkRequest(storage, final);
  await resolveLayout(storage, selectLayoutName(final, parties));
  await ensureFormat(storage);
  const render = rendererFor(storage, options);
  return storage.withLock(NUMBER_LOCK, async () => {
    await assertNoConflicts(storage, final.date.slice(0, 4));
    const number = await nextNumber(storage, final.date.slice(0, 4));
    const lines = resolveLines(final, parties.client);
    const pdf = await render({ request: final, number, parties, lines });
    const totals = computeTotals(lines, parties.rule.ratePercent);
    const record: InvoiceRecord = { kind: InvoiceKind.Invoice, number, request: final, ...parties, lines, totals, ...(options.schedule ? { schedule: options.schedule } : {}) };
    return commitRecord(storage, record, pdf);
  });
}

/** Renders a draft PDF that takes no number. */
export async function renderDraftPdf(storage: InvoiceStorage, request: InvoiceRequest, options: IssueOptions = {}): Promise<Uint8Array> {
  const draft = { ...request, draft: true };
  const parties = await checkRequest(storage, draft);
  return rendererFor(storage, options)({ request: draft, number: null, parties });
}

function completeRecord(raw: Partial<InvoiceRecord> & Pick<InvoiceRecord, 'number' | 'request' | 'company' | 'client' | 'rule'>): InvoiceRecord {
  const lines = raw.lines ?? resolveLines(raw.request, raw.client);
  return { ...raw, kind: raw.kind ?? InvoiceKind.Invoice, lines, totals: raw.totals ?? computeTotals(lines, raw.rule.ratePercent) };
}

/** Reads an issued record; a record from the old layout's shape gets its kind, lines and totals. */
export async function readInvoice(storage: InvoiceStorage, number: string): Promise<InvoiceRecord> {
  if (!NUMBER_SHAPE.test(number)) {
    throw new InvoiceError([{ path: 'invoiceNumber', message: 'must look like 2030-001 or CN-2030-001' }]);
  }
  return completeRecord(await readJsonFile<InvoiceRecord>(storage, recordPath(number), 'invoiceNumber'));
}

/** Lists a year's issued invoices and credit notes; folders with no record are skipped. */
export async function listIssued(storage: InvoiceStorage, year: string): Promise<InvoiceRecord[]> {
  const names = (await storage.list(`invoices/${year}`)).filter((name) => NUMBER_SHAPE.test(name) && numberYear(name) === year);
  const present = await Promise.all(names.map(async (name) => ((await storage.readText(recordPath(name))) === null ? null : name)));
  return Promise.all(present.flatMap((name) => name ?? []).map((name) => readInvoice(storage, name)));
}

/** Recreates the missing PDF of an issued record; never replaces an existing PDF. */
export async function reprintInvoice(storage: InvoiceStorage, number: string, options: IssueOptions = {}): Promise<{ number: string; pdfPath: string }> {
  const record = await readInvoice(storage, number);
  const path = pdfPath(number);
  if ((await storage.readBytes(path)) !== null) {
    throw new InvoiceError([{ path: 'number', message: `${number} already has a PDF` }]);
  }
  const { company, client, rule } = record;
  const pdf = await rendererFor(storage, options)({
    request: record.request, number, parties: { company, client, rule }, lines: record.lines, kind: record.kind, creditFor: record.creditFor, reason: record.reason,
  });
  await storage.writeNew(path, pdf);
  return { number, pdfPath: path };
}
