import type { InvoiceStorage } from '../storage';
import { InvoiceError } from '../types';
import { isRealDate } from '../validate';
import { PaidFrom } from './PaidFrom';
import { expenseLock } from './expensePaths';
import { readExpense, saveExpense } from './expenseFolder';
import type { Expense } from './expenseFile';

const PAID_BACK_ON = 'paidBackOn';

/** Whether the company still owes the owner this expense, paid with own money. */
export function toPayBack(expense: Expense): boolean {
  return expense.paidFrom === PaidFrom.OwnMoney && expense.paidBackOn === null;
}

/** The running total, in cents, the company still owes the owner. */
export function payBackTotal(expenses: Expense[]): number {
  return expenses.filter(toPayBack).reduce((sum, expense) => sum + expense.totalCents, 0);
}

function checkPaidBack(expense: Expense, on: string): void {
  if (expense.paidFrom !== PaidFrom.OwnMoney) {
    throw new InvoiceError([{ path: 'paidFrom', message: 'only an expense paid with own money is paid back' }]);
  }
  if (!isRealDate(on)) {
    throw new InvoiceError([{ path: PAID_BACK_ON, message: 'must be a real date as YYYY-MM-DD' }]);
  }
  if (on < expense.date) {
    throw new InvoiceError([{ path: PAID_BACK_ON, message: `must not be before the expense date ${expense.date}` }]);
  }
}

/** Marks a whole own-money expense paid back to the owner on a date not before the expense. */
export function markPaidBack(storage: InvoiceStorage, dir: string, on: string): Promise<Expense> {
  return storage.withLock(expenseLock(dir), async () => {
    const expense = await readExpense(storage, dir);
    checkPaidBack(expense, on);
    const updated: Expense = { ...expense, paidBackOn: on };
    await saveExpense(storage, updated);
    return updated;
  });
}

/** Opens an expense's pay-back again. */
export function markNotPaidBack(storage: InvoiceStorage, dir: string): Promise<Expense> {
  return storage.withLock(expenseLock(dir), async () => {
    const updated: Expense = { ...(await readExpense(storage, dir)), paidBackOn: null };
    await saveExpense(storage, updated);
    return updated;
  });
}
