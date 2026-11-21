import { describe, expect, it } from 'vitest';

import { addBill } from '../bills/billFolder';
import { createMemoryStorage } from '../memoryStorage';
import { PDF_BYTES } from '../testing/billFixtures';
import { expenseInput, RECEIPT_BYTES } from '../testing/expenseFixtures';
import { PaidFrom } from './PaidFrom';
import { addExpense } from './expenseFolder';
import { costsCsv, exportCostsZip } from './expenseExport';
import { addReceipt } from './expenseReceipt';
import { readCategories } from './categories';

const BILL = {
  supplier: 'Example Supplier', supplierVat: '10000001X', number: '26300', issueDate: '2026-11-10', dueDate: null, currency: 'EUR',
  netCents: 10000, vatCents: 1900, notSubjectToVatCents: 0, totalCents: 11900, payTo: { bank: '', iban: '', swift: '' },
};

describe('costsCsv', () => {
  it('with a bill and two expenses, joins them oldest first with the VAT split and reclaimable VAT', async () => {
    const storage = createMemoryStorage();
    const bill = await addBill(storage, PDF_BYTES, BILL);
    const reclaimable = await addExpense(storage, expenseInput());
    const notReclaimable = await addExpense(storage, expenseInput({ date: '2026-11-02', vatReclaimable: false, paidFrom: PaidFrom.OwnMoney }));

    const csv = costsCsv([bill], [reclaimable, notReclaimable], await readCategories(storage));

    expect(csv.trim().split('\r\n').slice(1)).toEqual([
      'expense,2026-11-02,Example Cafe Ltd,10000002X,,Meals and entertainment,Client coffee,EUR,5.88,1.12,19,0.00,0.00,7.00,receipt-missing,2026-11-02,own-money,,0',
      'bill,2026-11-10,Example Supplier,10000001X,26300,,,EUR,100.00,19.00,,,0.00,119.00,unpaid,,,,0',
      'expense,2026-11-14,Example Cafe Ltd,10000002X,,Meals and entertainment,Client coffee,EUR,5.88,1.12,19,1.12,0.00,7.00,receipt-missing,2026-11-14,company-card,,0',
    ]);
  });
});

describe('exportCostsZip', () => {
  it('with costs in and out of range, zips the CSV with each bill and expense folder in range', async () => {
    const storage = createMemoryStorage();
    await addBill(storage, PDF_BYTES, BILL);
    const expense = await addExpense(storage, expenseInput());
    await addReceipt(storage, expense.dir, [{ name: 'till.pdf', bytes: RECEIPT_BYTES }]);
    await addExpense(storage, expenseInput({ date: '2026-12-01' }));

    const zip = await exportCostsZip(storage, '2026-11-01', '2026-11-30');

    const text = new TextDecoder('latin1').decode(zip.bytes);
    expect({ name: zip.fileName, bills: zip.billCount, expenses: zip.expenseCount, has: ['costs-2026-11-01-to-2026-11-30.csv', 'bills/2026/example-26300/bill.pdf',
      'expenses/2026/2026-11-14-example/expense.json', 'expenses/2026/2026-11-14-example/receipt/till.pdf'].every((path) => text.includes(path)), december: text.includes('2026-12-01-example') })
      .toEqual({ name: 'costs-2026-11-01-to-2026-11-30.zip', bills: 1, expenses: 1, has: true, december: false });
  });
});
