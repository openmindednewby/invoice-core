import { describe, expect, it } from 'vitest';

import { createMemoryStorage } from '../memoryStorage';
import { expenseInput } from '../testing/expenseFixtures';
import { InvoiceError } from '../types';
import { addExpense, listExpenses, readExpense } from './expenseFolder';

function pathsOf(error: unknown): string[] {
  return error instanceof InvoiceError ? error.errors.map((item) => item.path) : [];
}

describe('addExpense', () => {
  it('with a confirmed input, writes expense.json in its year folder with every field', async () => {
    const storage = createMemoryStorage();

    const expense = await addExpense(storage, expenseInput());

    expect(await readExpense(storage, expense.dir)).toEqual({
      ...expenseInput(), dir: 'expenses/2026/2026-11-14-example', receiptFiles: [], paidBackOn: null, recurringId: null,
    });
  });

  it('with a second expense on the same day from the same supplier, files it in a -2 folder', async () => {
    const storage = createMemoryStorage();
    await addExpense(storage, expenseInput());

    const second = await addExpense(storage, expenseInput({ description: 'Second coffee' }));

    expect(second.dir).toBe('expenses/2026/2026-11-14-example-2');
  });

  it('with a blank supplier, unreal date, unknown category, odd VAT rate and a wrong total, refuses with each field', async () => {
    const storage = createMemoryStorage();
    const bad = expenseInput({ supplier: ' ', date: '2026-02-30', category: 'yachts', vatRate: 7, totalCents: 1 });

    const refused = await addExpense(storage, bad).catch((error: unknown) => error);

    expect(pathsOf(refused)).toEqual(['date', 'supplier', 'category', 'vatRate', 'total']);
  });

  it('with no VAT rate, files it as none', async () => {
    const storage = createMemoryStorage();

    const expense = await addExpense(storage, expenseInput({ vatRate: null, netCents: 700, vatCents: 0, vatReclaimable: false }));

    expect((await readExpense(storage, expense.dir)).vatRate).toBeNull();
  });
});

describe('listExpenses', () => {
  it('with one unreadable expense.json, lists it as broken and keeps the others', async () => {
    const storage = createMemoryStorage({ 'expenses/2026/2026-11-01-bad/expense.json': '{ nope' });
    await addExpense(storage, expenseInput());

    const result = await listExpenses(storage);

    expect({ count: result.expenses.length, broken: result.broken }).toEqual({ count: 1, broken: ['expenses/2026/2026-11-01-bad'] });
  });

  it('with no expenses folder, returns an empty list', async () => {
    const storage = createMemoryStorage();

    const result = await listExpenses(storage);

    expect(result).toEqual({ expenses: [], broken: [] });
  });
});
