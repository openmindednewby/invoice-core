import { ensureFormat, numberYear } from './folder';
import { InvoiceKind } from './InvoiceKind';
import { commitRecord, listIssued, NUMBER_LOCK, readInvoice, rendererFor } from './issue';
import type { IssueOptions } from './issue';
import { computeTotals } from './lines';
import { centsToAmount, toCents } from './money';
import { nextNumber } from './numbering';
import type { InvoiceStorage } from './storage';
import { InvoiceError } from './types';
import type { InvoiceRecord, IssuedInvoice } from './types';
import { isBlank, isRealDate } from './validate';

/** What to credit. Without an amount the credit note covers all the invoice has left. */
export interface CreditNoteRequest { invoiceNumber: string; date: string; reason: string; amount?: string; }

function checkInput(input: CreditNoteRequest): void {
  if (isBlank(input.reason)) {
    throw new InvoiceError([{ path: 'reason', message: 'required for a credit note' }]);
  }
  if (!isRealDate(input.date)) {
    throw new InvoiceError([{ path: 'date', message: 'must be a real date as YYYY-MM-DD' }]);
  }
}

async function creditedSoFar(storage: InvoiceStorage, invoice: InvoiceRecord, date: string): Promise<number> {
  const first = Number(numberYear(invoice.number));
  const last = Number(date.slice(0, 4));
  const years = Array.from({ length: Math.max(last - first + 1, 0) }, (_, i) => String(first + i));
  const records = (await Promise.all(years.map((year) => listIssued(storage, year)))).flat();
  return records.filter((record) => record.creditFor === invoice.number).reduce((sum, record) => sum + record.totals.netCents, 0);
}

function creditCents(input: CreditNoteRequest, remaining: number): number {
  const cents = input.amount === undefined ? remaining : toCents(input.amount);
  if (cents === null || cents <= 0 || cents > remaining) {
    throw new InvoiceError([{ path: 'amount', message: `must be more than zero and at most ${centsToAmount(remaining)}` }]);
  }
  return cents;
}

function checkTarget(invoice: InvoiceRecord, input: CreditNoteRequest): void {
  if (invoice.kind !== InvoiceKind.Invoice) {
    throw new InvoiceError([{ path: 'invoiceNumber', message: `${invoice.number} is a credit note; only an invoice can be credited` }]);
  }
  if (input.date < invoice.request.date) {
    throw new InvoiceError([{ path: 'date', message: `must not be before the invoice date ${invoice.request.date}` }]);
  }
}

/** Issues a credit note that references its invoice and takes its own gap-free CN- number. */
export async function issueCreditNote(storage: InvoiceStorage, input: CreditNoteRequest, options: IssueOptions = {}): Promise<IssuedInvoice> {
  checkInput(input);
  await ensureFormat(storage);
  const invoice = await readInvoice(storage, input.invoiceNumber);
  checkTarget(invoice, input);
  const render = rendererFor(storage, options);
  return storage.withLock(NUMBER_LOCK, async () => {
    const remaining = invoice.totals.netCents - (await creditedSoFar(storage, invoice, input.date));
    const cents = creditCents(input, remaining);
    const number = await nextNumber(storage, input.date.slice(0, 4), InvoiceKind.CreditNote);
    const description = `Credit for invoice ${invoice.number}: ${input.reason}`;
    const lines = [{ description, cents }];
    const { company, client, rule } = invoice;
    const request = { ...invoice.request, date: input.date, amounts: [], lines: [{ description, amount: centsToAmount(cents) }], draft: false };
    const shared = { kind: InvoiceKind.CreditNote, creditFor: invoice.number, reason: input.reason, lines } as const;
    const pdf = await render({ request, number, parties: { company, client, rule }, ...shared, lines });
    return commitRecord(storage, { number, request, company, client, rule, ...shared, lines, totals: computeTotals(lines, rule.ratePercent) }, pdf);
  });
}
