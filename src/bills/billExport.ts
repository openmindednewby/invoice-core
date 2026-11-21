import { textCell } from '../exportCsv';
import { centsToAmount } from '../money';
import type { InvoiceStorage } from '../storage';
import { InvoiceError } from '../types';
import { isRealDate } from '../validate';
import { BILL_JSON, BILL_PDF, BILLS_DIR, listBills, readBill } from './billFolder';
import { PROOF_DIR } from './billProof';
import type { Bill } from './billFile';
import { createZip } from './zip';
import type { ZipEntry } from './zip';

const BOM = '﻿';
const NEWLINE = '\r\n';
const HEADER = ['supplier', 'supplier_vat', 'number', 'issue_date', 'due_date', 'currency', 'net', 'vat', 'not_subject_to_vat', 'total', 'status', 'paid_on', 'proofs'];

export interface BillZip {
  fileName: string;
  bytes: Uint8Array;
}

export interface BillsZip extends BillZip {
  count: number;
}

function toRow(bill: Bill): string {
  return [
    textCell(bill.supplier), textCell(bill.supplierVat), textCell(bill.number), bill.issueDate, bill.dueDate ?? '', bill.currency,
    centsToAmount(bill.netCents), centsToAmount(bill.vatCents), centsToAmount(bill.notSubjectToVatCents), centsToAmount(bill.totalCents),
    bill.status, bill.paidOn ?? '', String(bill.proofFiles.length),
  ].join(',');
}

/** The accountant's CSV of bills with the VAT split: net, VAT, not subject to VAT, total. */
export function billsCsv(bills: Bill[]): string {
  return `${BOM}${[HEADER.join(','), ...bills.map(toRow)].join(NEWLINE)}${NEWLINE}`;
}

export async function billEntries(storage: InvoiceStorage, bill: Bill, under: string): Promise<ZipEntry[]> {
  const names = [BILL_PDF, BILL_JSON, ...bill.proofFiles.map((name) => `${PROOF_DIR}/${name}`)];
  const files = await Promise.all(names.map(async (name) => ({ path: `${under}/${name}`, bytes: await storage.readBytes(`${bill.dir}/${name}`) })));
  return files.flatMap((file) => (file.bytes === null ? [] : [{ path: file.path, bytes: file.bytes }]));
}

function folderName(dir: string): string {
  return dir.split('/').pop() ?? dir;
}

/** One bill with its PDF, bill.json and proofs, as a zip. */
export async function exportBillZip(storage: InvoiceStorage, dir: string): Promise<BillZip> {
  const bill = await readBill(storage, dir);
  const name = folderName(dir);
  return { fileName: `bill-${name}.zip`, bytes: createZip(await billEntries(storage, bill, name)) };
}

export function checkRange(from: string, to: string): void {
  if (!isRealDate(from) || !isRealDate(to)) {
    throw new InvoiceError([{ path: isRealDate(from) ? 'to' : 'from', message: 'must be a real date as YYYY-MM-DD' }]);
  }
  if (from > to) {
    throw new InvoiceError([{ path: 'from', message: 'must not be after to' }]);
  }
}

/** The bills issued from..to (inclusive), oldest first. */
export async function billsIn(storage: InvoiceStorage, from: string, to: string): Promise<Bill[]> {
  return (await listBills(storage)).bills
    .filter((bill) => bill.issueDate >= from && bill.issueDate <= to)
    .sort((a, b) => a.issueDate.localeCompare(b.issueDate) || a.dir.localeCompare(b.dir));
}

/** Every bill issued from..to (inclusive) with its proofs, plus a CSV summary, as one zip. */
export async function exportBillsZip(storage: InvoiceStorage, from: string, to: string): Promise<BillsZip> {
  checkRange(from, to);
  const bills = await billsIn(storage, from, to);
  const base = `bills-${from}-to-${to}`;
  const entries = await Promise.all(bills.map((bill) => billEntries(storage, bill, bill.dir.slice(BILLS_DIR.length + 1))));
  const csv = { path: `${base}.csv`, bytes: new TextEncoder().encode(billsCsv(bills)) };
  return { fileName: `${base}.zip`, count: bills.length, bytes: createZip([csv, ...entries.flat()]) };
}
