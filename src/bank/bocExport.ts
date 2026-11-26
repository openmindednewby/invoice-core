import type { CellValue } from '@dloizides/utils/xlsx';

import { InvoiceError } from '../types';
import type { BankLine, BocStatement } from './bankLine';
import { cellCents, cellDate, cellText, datesIn } from './cellValues';
import { readXlsxRows } from './xlsxRows';

export const BOC_SHEET = 'Activity_report_SIMPLE';

const COLUMNS = {
  date: 'date', description: 'description', type: 'transaction type', reference: 'reference number', debit: 'debit', credit: 'credit',
  balance: 'indicative balance', valueDate: 'value date', bankReference: 'bank reference number', branchCode: 'branch code',
} as const;

type ColumnMap = Record<keyof typeof COLUMNS, number>;

function label(value: CellValue | undefined): string {
  return cellText(value).toLowerCase().replace(/:$/, '');
}

function notBoc(): InvoiceError {
  return new InvoiceError([{ path: 'file', message: 'is not a Bank of Cyprus statement export' }]);
}

function headerValue(rows: CellValue[][], name: string): string {
  const row = rows.find((cells) => label(cells[0]) === name);
  return row === undefined ? '' : cellText(row.slice(1).find((value) => cellText(value) !== ''));
}

function columnMap(titles: CellValue[]): ColumnMap {
  const names = titles.map(label);
  const map = Object.fromEntries(Object.entries(COLUMNS).map(([key, title]) => [key, names.indexOf(title)])) as ColumnMap;
  if (map.description < 0 || map.debit < 0 || map.credit < 0) {
    throw notBoc();
  }
  return map;
}

function cell(row: CellValue[], index: number): string {
  return cellText(row[index]);
}

function signedCents(debit: number | null, credit: number | null): number {
  return Math.abs(credit ?? 0) - Math.abs(debit ?? 0);
}

function isBlank(row: CellValue[]): boolean {
  return row.every((value) => cellText(value) === '');
}

function hasAmount(row: CellValue[], map: ColumnMap): boolean {
  return cellCents(cell(row, map.debit)) !== null || cellCents(cell(row, map.credit)) !== null;
}

function lineOf(row: CellValue[], map: ColumnMap): BankLine | null {
  const date = cellDate(cell(row, map.date));
  if (date === null) {
    return null;
  }
  return {
    date, valueDate: cellDate(cell(row, map.valueDate)), description: cellText(cell(row, map.description)), type: cellText(cell(row, map.type)),
    reference: cellText(cell(row, map.reference)), bankReference: cellText(cell(row, map.bankReference)), branchCode: cellText(cell(row, map.branchCode)),
    amountCents: signedCents(cellCents(cell(row, map.debit)), cellCents(cell(row, map.credit))), balanceCents: cellCents(cell(row, map.balance)),
  };
}

interface ReadLines {
  lines: BankLine[];
  skippedRows: number;
}

function linesAfter(rows: CellValue[][], map: ColumnMap): ReadLines {
  const lines: BankLine[] = [];
  let skippedRows = 0;
  for (const row of rows) {
    const line = lineOf(row, map);
    if (line !== null) {
      lines.push(line);
    } else if (hasAmount(row, map)) {
      skippedRows += 1;
    } else if (!isBlank(row)) {
      break;
    }
  }
  return { lines, skippedRows };
}

/** Reads the header block and every line of a BOC sheet's rows, amounts in signed cents (credit +, debit -); blank rows are skipped, rows with an amount but no date are counted in skippedRows, and a text-only row ends the lines. */
export function parseBocRows(rows: CellValue[][]): BocStatement {
  const titleRow = rows.findIndex((cells) => label(cells[0]) === COLUMNS.date);
  const titles = rows[titleRow];
  if (titles === undefined) {
    throw notBoc();
  }
  const header = rows.slice(0, titleRow);
  const period = headerValue(header, 'period');
  const [periodFrom, periodTo] = datesIn(period);
  const { lines, skippedRows } = linesAfter(rows.slice(titleRow + 1), columnMap(titles));
  const dates = lines.map((line) => line.date).sort((a, b) => a.localeCompare(b));
  return {
    accountNumber: headerValue(header, 'account number'), accountName: headerValue(header, 'account name'), accountType: headerValue(header, 'account type'),
    currency: headerValue(header, 'account currency'), period, periodFrom: periodFrom ?? dates[0] ?? null, periodTo: periodTo ?? dates[dates.length - 1] ?? null,
    lines, skippedRows,
  };
}

/** Reads a BOC TransactionHistory xlsx export; throws InvoiceError when it is not one. */
export async function parseBocExport(bytes: Uint8Array): Promise<BocStatement> {
  return parseBocRows(await readXlsxRows(bytes, BOC_SHEET));
}
