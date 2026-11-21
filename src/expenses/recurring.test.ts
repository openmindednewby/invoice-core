import { describe, expect, it } from 'vitest';

import { createMemoryStorage } from '../memoryStorage';
import { expenseInput } from '../testing/expenseFixtures';
import { listExpenses } from './expenseFolder';
import { receiptMissing } from './expenseReceipt';
import { addRecurring, listRecurring, runRecurring } from './recurring';
import type { RecurringInput } from './recurring';
import type { ExpenseDetails } from './expenseFile';

function plan(overrides: Partial<RecurringInput> = {}): RecurringInput {
  const details: ExpenseDetails = expenseInput({ supplier: 'Example Telecom', category: 'phone-and-internet', netCents: 3000, vatCents: 570, totalCents: 3570 });
  return { ...details, dayOfMonth: 5, startMonth: '2026-01', endMonth: null, ...overrides };
}

describe('runRecurring', () => {
  it('with eleven periods passed since the start, adds every one with no cap, receipt missing', async () => {
    const storage = createMemoryStorage();
    await addRecurring(storage, plan());

    const added = await runRecurring(storage, '2026-11-21');

    expect({ count: added.length, first: added[0]?.date, last: added[10]?.date, missing: added.every(receiptMissing) })
      .toEqual({ count: 11, first: '2026-01-05', last: '2026-11-05', missing: true });
  });

  it('with a second run on the same day, adds nothing twice', async () => {
    const storage = createMemoryStorage();
    await addRecurring(storage, plan());
    await runRecurring(storage, '2026-11-21');

    const again = await runRecurring(storage, '2026-11-21');

    expect({ again: again.length, filed: (await listExpenses(storage)).expenses.length }).toEqual({ again: 0, filed: 11 });
  });

  it('with an end month, adds none after it', async () => {
    const storage = createMemoryStorage();
    await addRecurring(storage, plan({ endMonth: '2026-03' }));

    const added = await runRecurring(storage, '2026-11-21');

    expect(added.map((expense) => expense.date)).toEqual(['2026-01-05', '2026-02-05', '2026-03-05']);
  });

  it('with day 31, falls on the last day of shorter months and waits for this month\'s day', async () => {
    const storage = createMemoryStorage();
    await addRecurring(storage, plan({ dayOfMonth: 31, startMonth: '2026-02' }));

    const added = await runRecurring(storage, '2026-04-29');

    expect(added.map((expense) => expense.date)).toEqual(['2026-02-28', '2026-03-31']);
  });

  it('with a later run after a new period, adds only the new one and records it', async () => {
    const storage = createMemoryStorage();
    await addRecurring(storage, plan({ startMonth: '2026-10' }));
    await runRecurring(storage, '2026-10-20');

    const added = await runRecurring(storage, '2026-11-06');

    expect({ dates: added.map((expense) => expense.date), last: (await listRecurring(storage))[0]?.lastAddedMonth })
      .toEqual({ dates: ['2026-11-05'], last: '2026-11' });
  });
});

describe('addRecurring', () => {
  it('with a bad day, a bad start month and an end before the start, refuses with each field', async () => {
    const storage = createMemoryStorage();

    const refused = await addRecurring(storage, plan({ dayOfMonth: 0, startMonth: '2026-13' })).catch((error: Error) => error.message);
    const endBefore = await addRecurring(storage, plan({ endMonth: '2025-12' })).catch((error: Error) => error.message);

    expect([refused, endBefore]).toEqual([
      'dayOfMonth: must be a day from 1 to 31; startMonth: must be a month as YYYY-MM',
      'endMonth: must not be before the start month',
    ]);
  });
});
