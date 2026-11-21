import { supplierSlug, yearDirs } from '../bills/billFolder';
import { readJsonFile, toJson } from '../folder';
import { isStorageExistsError } from '../storage';
import type { InvoiceStorage } from '../storage';
import { InvoiceError } from '../types';
import type { FieldError } from '../types';
import { isRealDate } from '../validate';
import { readCategories } from './categories';
import { EXPENSE_JSON, EXPENSE_VAT_RATES, EXPENSES_DIR } from './expensePaths';
import { expenseFromJson, expenseToJson } from './expenseFile';
import type { Expense, ExpenseDetails, ExpenseInput, ExpenseJson } from './expenseFile';

const LABEL = 'expense';
const YEAR_LENGTH = 4;

export interface ExpenseList {
  expenses: Expense[];
  broken: string[];
}

/** The first folder of an expense: expenses/<year>/<date>-<supplier slug>. */
export function expenseDir(supplier: string, date: string): string {
  return `${EXPENSES_DIR}/${date.slice(0, YEAR_LENGTH)}/${date}-${supplierSlug(supplier)}`;
}

/** Reads one expense's expense.json; throws InvoiceError if missing or not JSON. */
export async function readExpense(storage: InvoiceStorage, dir: string): Promise<Expense> {
  return expenseFromJson(dir, await readJsonFile<ExpenseJson>(storage, `${dir}/${EXPENSE_JSON}`, LABEL));
}

/** Writes an expense back to its expense.json, keeping any field the file has that an expense does not. */
export async function saveExpense(storage: InvoiceStorage, expense: Expense): Promise<void> {
  const existing = await readJsonFile<ExpenseJson>(storage, `${expense.dir}/${EXPENSE_JSON}`, LABEL);
  await storage.replace(`${expense.dir}/${EXPENSE_JSON}`, toJson(expenseToJson(expense, existing)));
}

/** Lists every expense in expenses/; a folder whose expense.json cannot be read is returned in broken. */
export async function listExpenses(storage: InvoiceStorage): Promise<ExpenseList> {
  const result: ExpenseList = { expenses: [], broken: [] };
  for (const dir of await yearDirs(storage, EXPENSES_DIR)) {
    if ((await storage.list(dir)).includes(EXPENSE_JSON)) {
      await readExpense(storage, dir).then((expense) => result.expenses.push(expense), () => result.broken.push(dir));
    }
  }
  return result;
}

/** The field errors of an expense's details, against the category ids in use. */
export function detailErrors(details: ExpenseDetails, categoryIds: string[]): FieldError[] {
  return [
    ...(details.supplier.trim().length === 0 ? [{ path: 'supplier', message: 'is required' }] : []),
    ...(categoryIds.includes(details.category) ? [] : [{ path: 'category', message: 'must be one of the expense categories' }]),
    ...(details.vatRate === null || EXPENSE_VAT_RATES.includes(details.vatRate) ? [] : [{ path: 'vatRate', message: 'must be 19, 9, 5, 0 or none' }]),
    ...(details.netCents + details.vatCents === details.totalCents ? [] : [{ path: 'total', message: 'must equal net + VAT' }]),
  ];
}

async function checkInput(storage: InvoiceStorage, input: ExpenseInput): Promise<void> {
  const ids = (await readCategories(storage)).map((category) => category.id);
  const errors = [
    ...(isRealDate(input.date) ? [] : [{ path: 'date', message: 'must be a real date as YYYY-MM-DD' }]),
    ...detailErrors(input, ids),
  ];
  if (errors.length > 0) {
    throw new InvoiceError(errors);
  }
}

async function writeFresh(storage: InvoiceStorage, base: string, json: string): Promise<string> {
  for (let copy = 1; ; copy += 1) {
    const dir = copy === 1 ? base : `${base}-${copy}`;
    try {
      await storage.writeNew(`${dir}/${EXPENSE_JSON}`, json);
      return dir;
    } catch (error) {
      if (!isStorageExistsError(error)) {
        throw error;
      }
    }
  }
}

/** Files an expense with no receipt yet; recurringId is null for one added by hand. */
export async function fileExpense(storage: InvoiceStorage, input: ExpenseInput, recurringId: string | null): Promise<Expense> {
  await checkInput(storage, input);
  const draft: Expense = { ...input, dir: '', receiptFiles: [], paidBackOn: null, recurringId };
  const dir = await writeFresh(storage, expenseDir(input.supplier, input.date), toJson(expenseToJson(draft)));
  return { ...draft, dir };
}

/** Files an expense in its own folder, with no receipt yet; a same-day same-supplier expense gets a -2 folder. */
export function addExpense(storage: InvoiceStorage, input: ExpenseInput): Promise<Expense> {
  return fileExpense(storage, input, null);
}
