import { InvoiceError } from '../types';
import { readZipEntries } from './zipRead';

export type CellValue = string | number | null;

const decoder = new TextDecoder();
const ENTITIES: Record<string, string | undefined> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const HEX = 16;
const ALPHABET = 26;
const COLUMN_BASE = 'A'.charCodeAt(0) - 1;
const WORKBOOK = 'xl/workbook.xml';
const WORKBOOK_RELS = 'xl/_rels/workbook.xml.rels';
const SHARED_STRINGS = 'xl/sharedStrings.xml';
const FIRST_SHEET = 'xl/worksheets/sheet1.xml';

function entity(code: string): string {
  if (code.startsWith('#x')) {
    return String.fromCodePoint(parseInt(code.slice(2), HEX));
  }
  if (code.startsWith('#')) {
    return String.fromCodePoint(Number(code.slice(1)));
  }
  return ENTITIES[code] ?? '';
}

function unescapeXml(value: string): string {
  return value.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_match, code: string) => entity(code));
}

function attr(attrs: string, name: string): string | null {
  return new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attrs)?.[1] ?? null;
}

function texts(xml: string): string {
  return [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((match) => unescapeXml(match[1] ?? '')).join('');
}

function sharedStrings(xml: string | undefined): string[] {
  return xml === undefined ? [] : [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((match) => texts(match[1] ?? ''));
}

function columnIndex(ref: string | null, fallback: number): number {
  const letters = ref === null ? '' : (/^[A-Z]+/.exec(ref)?.[0] ?? '');
  return letters === '' ? fallback : [...letters].reduce((total, letter) => total * ALPHABET + letter.charCodeAt(0) - COLUMN_BASE, 0) - 1;
}

function cellValue(attrs: string, inner: string | undefined, shared: string[]): string | null {
  const type = attr(attrs, 't');
  const value = inner === undefined ? undefined : /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
  if (type === 'inlineStr') {
    return texts(inner ?? '');
  }
  if (value === undefined || type === 'e') {
    return null;
  }
  return type === 's' ? (shared[Number(value)] ?? null) : unescapeXml(value);
}

function rowCells(xml: string, shared: string[]): CellValue[] {
  const row: CellValue[] = [];
  for (const match of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const attrs = match[1] ?? '';
    row[columnIndex(attr(attrs, 'r'), row.length)] = cellValue(attrs, match[2], shared);
  }
  return Array.from(row, (value) => value ?? null);
}

function sheetRows(xml: string, shared: string[]): CellValue[][] {
  const rows: CellValue[][] = [];
  for (const match of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const number = Number(attr(match[1] ?? '', 'r'));
    rows[Number.isInteger(number) && number > 0 ? number - 1 : rows.length] = rowCells(match[2] ?? '', shared);
  }
  return Array.from(rows, (row) => row ?? []);
}

function sheetPath(workbook: string | undefined, rels: string | undefined, sheetName: string | null): string {
  const sheets = [...(workbook ?? '').matchAll(/<sheet\b([^>]*)>/g)].map((match) => match[1] ?? '');
  const sheet = sheets.find((attrs) => attr(attrs, 'name') === sheetName) ?? sheets[0];
  const id = sheet === undefined ? null : attr(sheet, 'r:id');
  const target = [...(rels ?? '').matchAll(/<Relationship\b([^>]*)>/g)].map((match) => match[1] ?? '').find((attrs) => attr(attrs, 'Id') === id);
  const path = target === undefined ? null : attr(target, 'Target');
  if (path === null) {
    return FIRST_SHEET;
  }
  return path.startsWith('/') ? path.slice(1) : `xl/${path}`;
}

/** The cell values of one sheet (the named one, else the first) as rows of cells; strings, numbers or null. */
export async function readXlsxRows(bytes: Uint8Array, sheetName: string | null): Promise<CellValue[][]> {
  const entries = await readZipEntries(bytes);
  const read = (name: string): string | undefined => {
    const data = entries.get(name);
    return data === undefined ? undefined : decoder.decode(data);
  };
  const sheet = read(sheetPath(read(WORKBOOK), read(WORKBOOK_RELS), sheetName));
  if (sheet === undefined) {
    throw new InvoiceError([{ path: 'file', message: 'is not an xlsx file' }]);
  }
  return sheetRows(sheet, sharedStrings(read(SHARED_STRINGS)));
}
