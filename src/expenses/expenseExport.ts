import { billEntries, billsIn, checkRange } from '../bills/billExport';
import type { Bill } from '../bills/billFile';
import { createZip } from '../bills/zip';
import type { ZipEntry } from '../bills/zip';
import { textCell } from '../exportCsv';
import { centsToAmount } from '../money';
import type { InvoiceStorage } from '../storage';
import { readCategories } from './categories';
import type { ExpenseCategory } from './categories';
import { EXPENSE_JSON, RECEIPT_DIR } from './expensePaths';
import { listExpenses } from './expenseFolder';
import type { Expense } from './expenseFile';
import { receiptMissing } from './expenseReceipt';

const BOM = '﻿';
const NEWLINE = '\r\n';
const HEADER = [
  'kind', 'date', 'supplier', 'supplier_vat', 'number', 'category', 'description', 'currency', 'net', 'vat', 'vat_rate', 'reclaimable_vat',
  'not_subject_to_vat', 'total', 'status', 'paid_on', 'paid_from', 'paid_back_on', 'files',
];

export interface CostsZip {
  fileName: string;
  bytes: Uint8Array;
  billCount: number;
  expenseCount: number;
}

interface CostRow {
  date: string;
  line: string;
}

function billReclaimable(bill: Bill): number {
  return bill.supplierVat.trim() !== '' ? bill.vatCents : 0;
}

function billRow(bill: Bill): CostRow {
  const line = [
    'bill', bill.issueDate, textCell(bill.supplier), textCell(bill.supplierVat), textCell(bill.number), '', '', bill.currency,
    centsToAmount(bill.netCents), centsToAmount(bill.vatCents), '', centsToAmount(billReclaimable(bill)), centsToAmount(bill.notSubjectToVatCents), centsToAmount(bill.totalCents),
    bill.status, bill.paidOn ?? '', '', '', String(bill.proofFiles.length),
  ].join(',');
  return { date: bill.issueDate, line };
}

function expenseRow(expense: Expense, names: Map<string, string>): CostRow {
  const line = [
    'expense', expense.date, textCell(expense.supplier), textCell(expense.supplierVat), '', textCell(names.get(expense.category) ?? expense.category),
    textCell(expense.description), expense.currency, centsToAmount(expense.netCents), centsToAmount(expense.vatCents),
    expense.vatRate === null ? '' : String(expense.vatRate), centsToAmount(expense.vatReclaimable ? expense.vatCents : 0), centsToAmount(0),
    centsToAmount(expense.totalCents), receiptMissing(expense) ? 'receipt-missing' : 'paid', expense.date, expense.paidFrom,
    expense.paidBackOn ?? '', String(expense.receiptFiles.length),
  ].join(',');
  return { date: expense.date, line };
}

/** The accountant's CSV of bills and expenses in one list, oldest first, with the VAT split and reclaimable VAT. */
export function costsCsv(bills: Bill[], expenses: Expense[], categories: ExpenseCategory[]): string {
  const names = new Map(categories.map((category) => [category.id, category.name]));
  const rows = [...bills.map(billRow), ...expenses.map((expense) => expenseRow(expense, names))].sort((a, b) => a.date.localeCompare(b.date));
  return `${BOM}${[HEADER.join(','), ...rows.map((row) => row.line)].join(NEWLINE)}${NEWLINE}`;
}

async function expenseEntries(storage: InvoiceStorage, expense: Expense): Promise<ZipEntry[]> {
  const names = [EXPENSE_JSON, ...expense.receiptFiles.map((name) => `${RECEIPT_DIR}/${name}`)];
  const files = await Promise.all(names.map(async (name) => ({ path: `${expense.dir}/${name}`, bytes: await storage.readBytes(`${expense.dir}/${name}`) })));
  return files.flatMap((file) => (file.bytes === null ? [] : [{ path: file.path, bytes: file.bytes }]));
}

/** Every bill and expense dated from..to (inclusive) with their files, plus the joined CSV, as one zip. */
export async function exportCostsZip(storage: InvoiceStorage, from: string, to: string): Promise<CostsZip> {
  checkRange(from, to);
  const bills = await billsIn(storage, from, to);
  const expenses = (await listExpenses(storage)).expenses
    .filter((expense) => expense.date >= from && expense.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date) || a.dir.localeCompare(b.dir));
  const base = `costs-${from}-to-${to}`;
  const csv = { path: `${base}.csv`, bytes: new TextEncoder().encode(costsCsv(bills, expenses, await readCategories(storage))) };
  const files = await Promise.all([
    ...bills.map((bill) => billEntries(storage, bill, bill.dir)),
    ...expenses.map((expense) => expenseEntries(storage, expense)),
  ]);
  return { fileName: `${base}.zip`, bytes: createZip([csv, ...files.flat()]), billCount: bills.length, expenseCount: expenses.length };
}
