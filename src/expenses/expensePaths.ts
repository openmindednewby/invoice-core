export const EXPENSES_DIR = 'expenses';
export const EXPENSE_JSON = 'expense.json';
export const RECEIPT_DIR = 'receipt';
export const CATEGORIES_JSON = `${EXPENSES_DIR}/categories.json`;
export const RECURRING_JSON = `${EXPENSES_DIR}/recurring.json`;
export const EXPENSE_VAT_RATES: readonly number[] = [19, 9, 5, 0];
const FIRST_COPY = 2;

/** base, or base-2, base-3 ... the first one not taken. */
export function firstFree(base: string, taken: Set<string>): string {
  if (!taken.has(base)) {
    return base;
  }
  let copy = FIRST_COPY;
  while (taken.has(`${base}-${copy}`)) {
    copy += 1;
  }
  return `${base}-${copy}`;
}

/** The lock name for one expense folder. */
export function expenseLock(dir: string): string {
  return `expense:${dir}`;
}
