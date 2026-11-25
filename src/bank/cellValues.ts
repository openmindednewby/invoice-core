import type { CellValue } from './xlsxRead';

const EXCEL_EPOCH_OFFSET = 25569;
const MS_PER_DAY = 86400000;
const CENTS_PER_UNIT = 100;
const ISO_DATE_LENGTH = 10;
const ISO = /^(\d{4})-(\d{2})-(\d{2})/;
const DAY_MONTH_YEAR = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/;
const DATE_SERIAL = /^\d{1,6}(\.\d{1,17})?$/;
const ANY_DATE =/\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}/g;

/** A cell as trimmed text; empty for a blank cell. */
export function cellText(value: CellValue | undefined): string {
  return value === null || value === undefined ? '' : String(value).trim();
}

/** A YYYY-MM-DD date from text written as YYYY-MM-DD or DD/MM/YYYY, else null. */
export function textDate(text: string): string | null {
  const iso = ISO.exec(text);
  if (iso !== null) {
    return iso[0];
  }
  const dmy = DAY_MONTH_YEAR.exec(text);
  return dmy === null ? null : `${dmy[3] ?? ''}-${(dmy[2] ?? '').padStart(2, '0')}-${(dmy[1] ?? '').padStart(2, '0')}`;
}

/** A YYYY-MM-DD date from an Excel date serial or date text, else null. */
export function cellDate(value: CellValue | undefined): string | null {
  const text = cellText(value);
  if (!DATE_SERIAL.test(text)) {
    return textDate(text);
  }
  return new Date((Math.floor(Number(text)) - EXCEL_EPOCH_OFFSET) * MS_PER_DAY).toISOString().slice(0, ISO_DATE_LENGTH);
}

/** Every date written in a text, in order, as YYYY-MM-DD. */
export function datesIn(text: string): string[] {
  return [...text.matchAll(ANY_DATE)].map((match) => textDate(match[0])).filter((date): date is string => date !== null);
}

/** A cell amount in whole cents; null for a blank or non-numeric cell. */
export function cellCents(value: CellValue | undefined): number | null {
  if (typeof value === 'number') {
    return Math.round(value * CENTS_PER_UNIT);
  }
  const text = cellText(value).replace(/,/g, '');
  const amount = Number(text);
  return text === '' || !Number.isFinite(amount) ? null : Math.round(amount * CENTS_PER_UNIT);
}
