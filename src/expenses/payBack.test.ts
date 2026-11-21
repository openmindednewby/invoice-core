import { describe, expect, it } from 'vitest';

import { createMemoryStorage } from '../memoryStorage';
import { expenseInput } from '../testing/expenseFixtures';
import { PaidFrom } from './PaidFrom';
import { addExpense, readExpense } from './expenseFolder';
import { markNotPaidBack, markPaidBack, payBackTotal, toPayBack } from './payBack';

describe('payBackTotal', () => {
  it('with two open own-money expenses, one paid back and one by card, sums the two open ones', async () => {
    const storage = createMemoryStorage();
    const open = await addExpense(storage, expenseInput({ paidFrom: PaidFrom.OwnMoney }));
    const second = await addExpense(storage, expenseInput({ paidFrom: PaidFrom.OwnMoney, netCents: 1000, vatCents: 190, totalCents: 1190 }));
    const repaid = await markPaidBack(storage, (await addExpense(storage, expenseInput({ paidFrom: PaidFrom.OwnMoney }))).dir, '2026-11-20');
    const card = await addExpense(storage, expenseInput({ paidFrom: PaidFrom.CompanyCard }));

    const total = payBackTotal([open, second, repaid, card]);

    expect(total).toBe(1890);
  });
});

describe('toPayBack', () => {
  it('with each way of paying, is true only for own money not yet paid back', () => {
    const base = { ...expenseInput(), dir: 'expenses/2026/x', receiptFiles: [], paidBackOn: null, recurringId: null };
    const ways = [PaidFrom.CompanyCard, PaidFrom.CompanyBank, PaidFrom.Cash, PaidFrom.OwnMoney];

    const flags = ways.map((paidFrom) => toPayBack({ ...base, paidFrom }));

    expect(flags).toEqual([false, false, false, true]);
  });
});

describe('markPaidBack', () => {
  it('with a date, marks the whole expense paid back, and markNotPaidBack reopens it', async () => {
    const storage = createMemoryStorage();
    const expense = await addExpense(storage, expenseInput({ paidFrom: PaidFrom.OwnMoney }));
    await markPaidBack(storage, expense.dir, '2026-11-20');

    const reopened = await markNotPaidBack(storage, expense.dir);

    expect({ reopened: toPayBack(reopened), saved: (await readExpense(storage, expense.dir)).paidBackOn }).toEqual({ reopened: true, saved: null });
  });

  it('with a date before the expense, refuses', async () => {
    const storage = createMemoryStorage();
    const expense = await addExpense(storage, expenseInput({ paidFrom: PaidFrom.OwnMoney }));

    const refused = markPaidBack(storage, expense.dir, '2026-11-01');

    await expect(refused).rejects.toThrow('paidBackOn: must not be before the expense date 2026-11-14');
  });

  it('with an expense paid by company card, refuses', async () => {
    const storage = createMemoryStorage();
    const expense = await addExpense(storage, expenseInput({ paidFrom: PaidFrom.CompanyCard }));

    const refused = markPaidBack(storage, expense.dir, '2026-11-20');

    await expect(refused).rejects.toThrow('paidFrom: only an expense paid with own money is paid back');
  });
});
