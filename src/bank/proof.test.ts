import { describe, expect, it } from 'vitest';

import { addBill } from '../bills/billFolder';
import { addExpense } from '../expenses/expenseFolder';
import { addReceipt } from '../expenses/expenseReceipt';
import { createMemoryStorage } from '../memoryStorage';
import { bocRows, TEST_ACCOUNT } from '../testing/bankFixtures';
import { PDF_BYTES } from '../testing/billFixtures';
import { expenseInput, RECEIPT_BYTES } from '../testing/expenseFixtures';
import type { BillInput } from '../bills/billFile';
import { parseBocRows } from './bocExport';
import { setLineKind } from './classify';
import { importStatement, readLedger } from './importLedger';
import { LineKind } from './LineKind';
import { linkProof, missingProof, unlinkProof } from './proof';
import { ProofKind } from './ProofKind';

const OPTIONS = { fileName: 'a.xlsx', bytes: null, directors: [] };
const BILL: BillInput = {
  supplier: 'Example Supplier', supplierVat: '10000001X', number: '2026-17', issueDate: '2026-10-01', dueDate: null, currency: 'EUR',
  netCents: 20177, vatCents: 3833, notSubjectToVatCents: 0, totalCents: 24010,
  payTo: { bank: 'Example Bank', iban: 'CY17002001280000001200527600', swift: 'EXBKCY2N' },
};

async function imported(): Promise<{ storage: ReturnType<typeof createMemoryStorage>; keys: string[] }> {
  const storage = createMemoryStorage();
  const result = await importStatement(storage, parseBocRows(bocRows()), OPTIONS);
  return { storage, keys: result.lines.map((line) => line.key) };
}

describe('linkProof', () => {
  it('with an expense that has a receipt, links the line to the receipt file', async () => {
    const { storage, keys } = await imported();
    const expense = await addExpense(storage, expenseInput());
    await addReceipt(storage, expense.dir, [{ name: 'till.pdf', bytes: RECEIPT_BYTES }]);

    const linked = await linkProof(storage, { account: TEST_ACCOUNT, key: keys[3] ?? '' }, ProofKind.Expense, expense.dir);

    expect({ proof: linked.proof, saved: (await readLedger(storage, TEST_ACCOUNT))[3]?.proof })
      .toEqual({ proof: { kind: ProofKind.Expense, ref: expense.dir, files: [`${expense.dir}/receipt/till.pdf`] }, saved: linked.proof });
  });

  it('with an invoice number, links the line to the invoice PDF path when it exists', async () => {
    const { storage, keys } = await imported();
    await storage.writeNew('invoices/2026/2026-3/2026-3.pdf', RECEIPT_BYTES);

    const linked = await linkProof(storage, { account: TEST_ACCOUNT, key: keys[4] ?? '' }, ProofKind.Invoice, '2026-3');

    expect(linked.proof).toEqual({ kind: ProofKind.Invoice, ref: '2026-3', files: ['invoices/2026/2026-3/2026-3.pdf'] });
  });

  it('with an unlink, clears the proof again', async () => {
    const { storage, keys } = await imported();
    await storage.writeNew('invoices/2026/2026-3/2026-3.pdf', RECEIPT_BYTES);
    await linkProof(storage, { account: TEST_ACCOUNT, key: keys[4] ?? '' }, ProofKind.Invoice, '2026-3');

    const unlinked = await unlinkProof(storage, { account: TEST_ACCOUNT, key: keys[4] ?? '');

    expect(unlinked.proof).toBeNull();
  });
});

describe('importStatement bill link' }, () => {
  it('with a bill of the paid invoice number, links the payment line to the bill PDF', async () => {
    const storage = createMemoryStorage();
    const bill = await addBill(storage, PDF_BYTES, BILL);

    const result = await importStatement(storage, parseBocRows(bocRows()), OPTIONS);

    expect(result.lines[2]?.proof).toEqual({ kind: ProofKind.Bill, ref: bill.dir, files: [`${bill.dir}/bill.pdf`] });
  });
});

describe('importStatement bill link by amount', () => {
  it('with a bill of the paid number but another total, leaves the payment line without proof', async () => {
    const storage = createMemoryStorage();
    await addBill(storage, PDF_BYTES, { ...BILL, number: '2026-17', notSubjectToVatCents: 5990, totalCents: 30000 });
    const payment = { date: '2026-10-15', description: '1Bank - Transfer-Internet-Debit Invoice 2026-17', type: 'BOC Transfer', debit: 240.1, credit: null, balance: 749.56, bankReference: 'BR3' };

    const result = await importStatement(storage, parseBocRows(bocRows([payment])), OPTIONS);

    expect({ bill: result.lines[0]?.billNumber, proof: result.lines[0]?.proof }).toEqual({ bill: '2026-17', proof: null });
  });
});

describe('missingProof', () => {
  it('with a month, lists every expense, bill-payment or income line without proof', async () => {
    const { storage, keys } = await imported();
    await setLineKind(storage, { account: TEST_ACCOUNT, key: keys[4] ?? '' }, LineKind.Income, null);

    const missing = missingProof(await readLedger(storage, TEST_ACCOUNT), '2026-10');

    expect(missing.map((line) => line.key)).toEqual([keys[2], keys[3], keys[4]]);
  });

  it('with a linked expense whose receipt is still missing, keeps it in the list', async () => {
    const { storage, keys } = await imported();
    const expense = await addExpense(storage, expenseInput());
    await linkProof(storage, { account: TEST_ACCOUNT, key: keys[3] ?? '' }, ProofKind.Expense, expense.dir);

    const missing = missingProof(await readLedger(storage, TEST_ACCOUNT), '2026-10');

    expect(missing.map((line) => line.key)).toContain(keys[3]);
  });

  it('with another month, lists nothing', async () => {
    const { storage } = await imported();

    const missing = missingProof(await readLedger(storage, TEST_ACCOUNT), '2026-09');

    expect(missing).toEqual([]);
  });
});
