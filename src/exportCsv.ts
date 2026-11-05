import { listIssued } from './issue';
import { InvoiceKind } from './InvoiceKind';
import { centsToAmount } from './money';
import type { InvoiceStorage } from './storage';
import { InvoiceError } from './types';
import type { InvoiceRecord } from './types';

const BOM = '﻿';
const NEWLINE = '\r\n';
const MONTHS_PER_QUARTER = 3;
const LAST_QUARTER = 4;
const YEAR = /^\d{4}$/;
const FORMULA_START = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\r\n]/;
const HEADER = ['number', 'kind', 'date', 'period', 'client', 'client_vat', 'net', 'vat', 'total', 'currency', 'vat_rule', 'credit_for', 'reason'];
const CURRENCY = 'EUR';

function textCell(value: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return NEEDS_QUOTES.test(safe) ? `"${safe.split('"').join('""')}"` : safe;
}

function toRow(record: InvoiceRecord): string {
  const sign = record.kind === InvoiceKind.CreditNote ? -1 : 1;
  const { netCents, vatCents, totalCents } = record.totals;
  return [
    record.number, record.kind, record.request.date, record.request.period, textCell(record.client.name), textCell(record.client.vatNumber),
    centsToAmount(sign * netCents), centsToAmount(sign * vatCents), centsToAmount(sign * totalCents), CURRENCY,
    textCell(record.rule.id), record.creditFor ?? '', textCell(record.reason ?? ''),
  ].join(',');
}

function inQuarter(record: InvoiceRecord, quarter: number): boolean {
  const month = Number(record.request.date.slice(5, 7));
  return Math.ceil(month / MONTHS_PER_QUARTER) === quarter;
}

function byDateThenNumber(a: InvoiceRecord, b: InvoiceRecord): number {
  return a.request.date.localeCompare(b.request.date) || a.number.localeCompare(b.number);
}

/** The accountant's CSV of one quarter's invoices and credit notes, by date; credit notes are negative. */
export async function exportQuarterCsv(storage: InvoiceStorage, year: string, quarter: number): Promise<string> {
  if (!Number.isInteger(quarter) || quarter < 1 || quarter > LAST_QUARTER) {
    throw new InvoiceError([{ path: 'quarter', message: 'must be 1, 2, 3 or 4' }]);
  }
  if (!YEAR.test(year)) {
    throw new InvoiceError([{ path: 'year', message: 'must be YYYY' }]);
  }
  const records = (await listIssued(storage, year)).filter((record) => inQuarter(record, quarter)).sort(byDateThenNumber);
  return `${BOM}${[HEADER.join(','), ...records.map(toRow)].join(NEWLINE)}${NEWLINE}`;
}
