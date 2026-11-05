import { assertNoConflicts } from './conflicts';
import { ensureIssuable, NUMBER_SHAPE, numberYear, pdfPath, readJsonFile, recordPath } from './folder';
import { InvoiceKind } from './InvoiceKind';
import { resolveLayout, selectLayoutName } from './layouts';
import { computeTotals, resolveLines } from './lines';
import { claimInvoice, nextNumber } from './numbering';
import { checkRequest } from './parties';
import { loadLogo, renderInvoicePdf } from './pdf';
import type { InvoiceStorage } from './storage';
import { InvoiceError } from './types';
import type { InvoiceRecord, InvoiceRequest, IssuedInvoice, ScheduleRef } from './types';
import type { RenderInput } from './view';

const RENDER_TIMEOUT_MS = 60000;

export const NUMBER_LOCK = 'invoice-number';

export type PdfRender = (input: RenderInput) => Promise<Uint8Array>;

export interface IssueOptions { render?: PdfRender; schedule?: ScheduleRef; renderTimeoutMs?: number; }

function settleWithin(work: Promise<Uint8Array>, timeoutMs: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new InvoiceError([{ path: 'pdf', message: `rendering did not finish within ${timeoutMs} ms` }])), timeoutMs);
    void work.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

/** The renderer in force for these options; one that never finishes rejects, so it cannot hold the number lock. */
export function rendererFor(storage: InvoiceStorage, options: IssueOptions): PdfRender {
  const render = options.render ?? ((input): Promise<Uint8Array> => renderInvoicePdf(storage, input));
  return (input) => settleWithin(render(input), options.renderTimeoutMs ?? RENDER_TIMEOUT_MS);
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
  await loadLogo(storage, parties.company.logo);
  await ensureIssuable(storage);
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

/** Recreates the missing or empty PDF of an issued record; never replaces a PDF with content. */
export async function reprintInvoice(storage: InvoiceStorage, number: string, options: IssueOptions = {}): Promise<{ number: string; pdfPath: string }> {
  const record = await readInvoice(storage, number);
  const path = pdfPath(number);
  const existing = await storage.readBytes(path);
  if (existing !== null && existing.length > 0) {
    throw new InvoiceError([{ path: 'number', message: `${number} already has a PDF` }]);
  }
  const { company, client, rule } = record;
  const pdf = await rendererFor(storage, options)({
    request: record.request, number, parties: { company, client, rule }, lines: record.lines, totals: record.totals, kind: record.kind, creditFor: record.creditFor, reason: record.reason,
  });
  await (existing === null ? storage.writeNew(path, pdf) : storage.replace(path, pdf));
  return { number, pdfPath: path };
}
