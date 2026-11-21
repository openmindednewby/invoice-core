import { cents, dateOrNull, text } from '../bills/billFile';
import { PaidFrom } from './PaidFrom';

const CENTS_PER_UNIT = 100;
const PAID_FROM: string[] = [PaidFrom.CompanyCard, PaidFrom.CompanyBank, PaidFrom.Cash, PaidFrom.OwnMoney];

export interface ExpenseAmounts {
  currency: string;
  netCents: number;
  vatCents: number;
  vatRate: number | null;
  vatReclaimable: boolean;
  totalCents: number;
}

export interface ExpenseDetails extends ExpenseAmounts {
  supplier: string;
  supplierVat: string;
  description: string;
  category: string;
  paidFrom: PaidFrom;
}

export interface ExpenseInput extends ExpenseDetails {
  date: string;
}

export interface Expense extends ExpenseInput {
  dir: string;
  receiptFiles: string[];
  paidBackOn: string | null;
  recurringId: string | null;
}

export type ExpenseJson = Record<string, unknown>;

function paidFromOf(value: unknown): PaidFrom {
  return typeof value === 'string' && PAID_FROM.includes(value) ? (value as PaidFrom) : PaidFrom.CompanyBank;
}

function rateOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function names(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((name): name is string => typeof name === 'string') : [];
}

/** Reads an expense.json object; amounts in the file are euros, in memory cents. */
export function expenseFromJson(dir: string, json: ExpenseJson): Expense {
  return {
    dir, supplier: text(json.supplier), supplierVat: text(json.supplierVat), date: text(json.date), description: text(json.description),
    category: text(json.category), currency: text(json.currency) || 'EUR', netCents: cents(json.net), vatCents: cents(json.vat),
    vatRate: rateOf(json.vatRate), vatReclaimable: json.vatReclaimable === true, totalCents: cents(json.total),
    paidFrom: paidFromOf(json.paidFrom), receiptFiles: names(json.receiptFiles), paidBackOn: dateOrNull(json.paidBackOn),
    recurringId: dateOrNull(json.recurringId),
  };
}

/** Writes an expense over its existing expense.json object, keeping fields this module does not know. */
export function expenseToJson(expense: Expense, existing: ExpenseJson = {}): ExpenseJson {
  return {
    ...existing, supplier: expense.supplier, supplierVat: expense.supplierVat, date: expense.date, description: expense.description,
    category: expense.category, currency: expense.currency, net: expense.netCents / CENTS_PER_UNIT, vat: expense.vatCents / CENTS_PER_UNIT,
    vatRate: expense.vatRate, vatReclaimable: expense.vatReclaimable, total: expense.totalCents / CENTS_PER_UNIT, paidFrom: expense.paidFrom,
    receiptFiles: expense.receiptFiles, paidBackOn: expense.paidBackOn, recurringId: expense.recurringId,
  };
}
