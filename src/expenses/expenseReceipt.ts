import { checkProofTypes, copyProofFiles } from '../bills/billProof';
import type { ProofFile } from '../bills/billProof';
import type { InvoiceStorage } from '../storage';
import { expenseLock, RECEIPT_DIR } from './expensePaths';
import { readExpense, saveExpense } from './expenseFolder';
import type { Expense } from './expenseFile';

/** Whether an expense still has no receipt or invoice attached. */
export function receiptMissing(expense: Expense): boolean {
  return expense.receiptFiles.length === 0;
}

/** Copies receipts (PDF, PNG or JPG) into receipt/ under names never used before. */
export function addReceipt(storage: InvoiceStorage, dir: string, files: ProofFile[]): Promise<Expense> {
  return storage.withLock(expenseLock(dir), async () => {
    checkProofTypes(files, RECEIPT_DIR);
    const expense = await readExpense(storage, dir);
    const added = await copyProofFiles(storage, `${dir}/${RECEIPT_DIR}`, files);
    const updated: Expense = { ...expense, receiptFiles: [...expense.receiptFiles, ...added] };
    await saveExpense(storage, updated);
    return updated;
  });
}
