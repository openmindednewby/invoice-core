import { deflateRawSync } from 'node:zlib';

import type { CellValue } from '../bank/xlsxRead';

export const TEST_ACCOUNT = '000000000000';
export const TEST_DIRECTOR = 'Jane Example';
const EXCEL_EPOCH_OFFSET = 25569;
const MS_PER_DAY = 86400000;
const TWO_AM = 2 / 24;

export interface FixtureLine {
  date: string;
  description: string;
  type: string;
  debit: number | null;
  credit: number | null;
  balance: number;
  bankReference: string;
}

/** An Excel date serial at 02:00 for a YYYY-MM-DD date, as the bank export writes it. */
export function serialOf(date: string): number {
  return Date.parse(`${date}T00:00:00Z`) / MS_PER_DAY + EXCEL_EPOCH_OFFSET + TWO_AM;
}

export const FIXTURE_LINES: FixtureLine[] = [
  { date: '2026-10-30', description: 'CARD MEMBERSHIP FEE 4***0000', type: 'Commission - Fee', debit: 15, credit: null, balance: 1234.56, bankReference: 'BR0000000005' },
  { date: '2026-10-21', description: 'Transfer 000111 from JANE EXAMPLE>capital top up', type: 'BOC Transfer', debit: null, credit: 500, balance: 1249.56, bankReference: 'BR0000000004' },
  { date: '2026-10-15', description: '1Bank - Transfer-Internet-Debit Invoice 2026-17', type: 'BOC Transfer', debit: 240.1, credit: null, balance: 749.56, bankReference: 'BR0000000003' },
  { date: '2026-10-09', description: 'EXAMPLE CAFE LTD PURCHASE CY Card 4***0000 09/10/26 7.00 EUR Auth 000001 Trace 000002', type: 'Card Purchase - Local', debit: 7, credit: null, balance: 989.66, bankReference: 'BR0000000002' },
  { date: '2026-10-02', description: 'Transfer 000222 from SAMPLE CLIENT LTD>payment', type: 'BOC Transfer', debit: null, credit: 996.66, balance: 996.66, bankReference: '' },
];

const TITLES = ['Date', 'Description', '', '', '', 'Transaction type', 'Reference number', 'Debit', 'Credit', 'Indicative balance', 'Value date', 'Bank reference number', 'Branch code'];

/** The rows of a synthetic BOC export: header block, title row, then the lines newest first. */
export function bocRows(lines: FixtureLine[] = FIXTURE_LINES, period = '01/10/2026 - 31/10/2026'): CellValue[][] {
  const header: CellValue[][] = [
    ['Period', null, period], ['Account number', null, TEST_ACCOUNT], ['Account name', null, 'EXAMPLE TRADING LTD'],
    ['Account type', null, 'Current account'], ['Account currency', null, 'EUR'],
  ];
  const body = lines.map((line): CellValue[] => [
    serialOf(line.date), line.description, null, null, null, line.type, 'REF', line.debit, line.credit, line.balance, serialOf(line.date),
    line.bankReference === '' ? null : line.bankReference, '0001',
  ]);
  return [...header, TITLES, ...body];
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function columnName(index: number): string {
  return String.fromCharCode('A'.charCodeAt(0) + index);
}

function sheetXml(rows: CellValue[][], strings: string[]): string {
  const rowXml = rows.map((row, r) => {
    const cells = row.map((value, c) => {
      const ref = `${columnName(c)}${r + 1}`;
      if (value === null || value === '') {
        return `<c r="${ref}" s="1"/>`;
      }
      if (typeof value === 'number') {
        return `<c r="${ref}"><v>${value}</v></c>`;
      }
      if (c === 1 && r > 5) {
        return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
      }
      strings.push(value);
      return `<c r="${ref}" t="s"><v>${strings.length - 1}</v></c>`;
    });
    return cells.length === 0 ? `<row r="${r + 1}"/>` : `<row r="${r + 1}">${cells.join('')}</row>`;
  });
  return `<?xml version="1.0"?><worksheet><sheetData>${rowXml.join('')}</sheetData></worksheet>`;
}

const CRC_TABLE = Array.from({ length: 256 }, (_unused, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(files: Array<{ name: string; text: string }>): Uint8Array {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const raw = Buffer.from(file.text, 'utf8');
    const data = deflateRawSync(raw);
    const name = Buffer.from(file.name, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc32(raw), 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(name.length, 26);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6); entry.writeUInt16LE(8, 10);
    entry.writeUInt32LE(crc32(raw), 16); entry.writeUInt32LE(data.length, 20); entry.writeUInt32LE(raw.length, 24); entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    parts.push(local, name, data);
    central.push(entry, name);
    offset += local.length + name.length + data.length;
  }
  const centralBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBytes.length, 12); end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...parts, centralBytes, end]));
}

/** A synthetic xlsx file holding the rows on a sheet named Activity_report_SIMPLE, after a decoy first sheet. */
export function bocXlsx(rows: CellValue[][] = bocRows()): Uint8Array {
  const strings: string[] = [];
  const sheet = sheetXml(rows, strings);
  const shared = strings.map((value) => `<si><t>${escapeXml(value)}</t></si>`).join('');
  return zip([
    { name: 'xl/workbook.xml', text: '<workbook><sheets><sheet name="Cover" sheetId="1" r:id="rId1"/><sheet name="Activity_report_SIMPLE" sheetId="2" r:id="rId2"/></sheets></workbook>' },
    { name: 'xl/_rels/workbook.xml.rels', text: '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="/xl/worksheets/sheet2.xml"/></Relationships>' },
    { name: 'xl/worksheets/sheet1.xml', text: '<worksheet><sheetData><row r="1"><c r="A1"><v>1</v></c></row></sheetData></worksheet>' },
    { name: 'xl/worksheets/sheet2.xml', text: sheet },
    { name: 'xl/sharedStrings.xml', text: `<sst>${shared}</sst>` },
  ]);
}
