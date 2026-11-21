import { supplierSlug } from '../bills/billFolder';
import type { InvoiceStorage } from '../storage';
import { InvoiceError } from '../types';
import { readCategories } from './categories';
import { firstFree, RECURRING_JSON } from './expensePaths';
import { detailErrors, fileExpense, listExpenses } from './expenseFolder';
import type { Expense, ExpenseDetails } from './expenseFile';
import { dueDates, monthErrors } from './recurringPeriods';

export interface RecurringInput extends ExpenseDetails {
  dayOfMonth: number;
  startMonth: string;
  endMonth: string | null;
}

export interface RecurringExpense extends RecurringInput {
  id: string;
  lastAddedMonth: string | null;
}

const LOCK = 'expense-recurring';
const MONTH_LENGTH = 7;

/** Every recurring expense plan in expenses/recurring.json. */
export async function listRecurring(storage: InvoiceStorage): Promise<RecurringExpense[]> {
  const saved = await storage.readText(RECURRING_JSON);
  const parsed: unknown = saved === null ? [] : JSON.parse(saved);
  return Array.isArray(parsed) ? (parsed as RecurringExpense[]) : [];
}

async function savePlans(storage: InvoiceStorage, plans: RecurringExpense[]): Promise<void> {
  await storage.replace(RECURRING_JSON, `${JSON.stringify(plans, null, 2)}\n`);
}

function freeId(plans: RecurringExpense[], input: RecurringInput): string {
  return firstFree(`${supplierSlug(input.supplier)}-${input.startMonth}`, new Set(plans.map((plan) => plan.id)));
}

/** Saves a recurring expense set up once: amount, day of month, category, start month and an optional end month. */
export function addRecurring(storage: InvoiceStorage, input: RecurringInput): Promise<RecurringExpense> {
  return storage.withLock(LOCK, async () => {
    const ids = (await readCategories(storage)).map((category) => category.id);
    const errors = [...monthErrors(input), ...detailErrors(input, ids)];
    if (errors.length > 0) {
      throw new InvoiceError(errors);
    }
    const plans = await listRecurring(storage);
    const plan: RecurringExpense = { ...input, id: freeId(plans, input), lastAddedMonth: null };
    await savePlans(storage, [...plans, plan]);
    return plan;
  });
}

function detailsOf(plan: RecurringExpense): ExpenseDetails {
  return {
    supplier: plan.supplier, supplierVat: plan.supplierVat, description: plan.description, category: plan.category, paidFrom: plan.paidFrom,
    currency: plan.currency, netCents: plan.netCents, vatCents: plan.vatCents, vatRate: plan.vatRate, vatReclaimable: plan.vatReclaimable,
    totalCents: plan.totalCents,
  };
}

async function addDue(storage: InvoiceStorage, plan: RecurringExpense, today: string, filed: Expense[]): Promise<Expense[]> {
  const added: Expense[] = [];
  for (const date of dueDates(plan, today)) {
    if (!filed.some((expense) => expense.recurringId === plan.id && expense.date === date)) {
      added.push(await fileExpense(storage, { ...detailsOf(plan), date }, plan.id));
    }
  }
  return added;
}

/** Adds one expense per period passed since the last run, receipt missing, with no catch-up cap; returns the added ones. */
export function runRecurring(storage: InvoiceStorage, today: string): Promise<Expense[]> {
  return storage.withLock(LOCK, async () => {
    const filed = (await listExpenses(storage)).expenses;
    const plans = await listRecurring(storage);
    const added: Expense[] = [];
    const next: RecurringExpense[] = [];
    for (const plan of plans) {
      const due = dueDates(plan, today);
      added.push(...(await addDue(storage, plan, today, filed)));
      const last = due[due.length - 1];
      next.push(last === undefined ? plan : { ...plan, lastAddedMonth: last.slice(0, MONTH_LENGTH) });
    }
    await savePlans(storage, next);
    return added;
  });
}
