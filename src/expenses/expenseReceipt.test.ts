import { describe, expect, it } from 'vitest';

import { createMemoryStorage } from '../memoryStorage';
import { expenseInput, RECEIPT_BYTES } from '../testing/expenseFixtures';
import { addExpense, readExpense } from './expenseFolder';
import { addReceipt, receiptMissing } from './expenseReceipt';

describe('addReceipt', () => {
  it('with two receipts of one name, copies both into receipt/ under fresh names', async () => {
    const storage = createMemoryStorage();
    const expense = await addExpense(storage, expenseInput());

    const updated = await addReceipt(storage, expense.dir, [{ name: 'till.pdf', bytes: RECEIPT_BYTES }, { name: 'till.pdf', bytes: RECEIPT_BYTES }]);

    expect({ files: updated.receiptFiles, saved: (await readExpense(storage, expense.dir)).receiptFiles, bytes: await storage.readBytes(`${expense.dir}/receipt/till-2.pdf`) })
      .toEqual({ files: ['till.pdf', 'till-2.pdf'], saved: ['till.pdf', 'till-2.pdf'], bytes: RECEIPT_BYTES });
  });

  it('with a file that is not a PDF, PNG or JPG, refuses it', async () => {
    const storage = createMemoryStorage();
    const expense = await addExpense(storage, expenseInput());

    const refused = addReceipt(storage, expense.dir, [{ name: 'notes.txt', bytes: RECEIPT_BYTES }]);

    await expect(refused).rejects.toThrow('receipt: notes.txt is not a PDF, PNG or JPG');
  });
});

describe('receiptMissing', () => {
  it('before and after a receipt is attached, is true then false', async () => {
    const storage = createMemoryStorage();
    const expense = await addExpense(storage, expenseInput());

    const updated = await addReceipt(storage, expense.dir, [{ name: 'till.jpg', bytes: RECEIPT_BYTES }]);

    expect([receiptMissing(expense), receiptMissing(updated)]).toEqual([true, false]);
  });
});
