import { describe, expect, it } from 'vitest';

import { createMemoryStorage } from '../memoryStorage';
import { bocRows, bocXlsx, FIXTURE_LINES, TEST_ACCOUNT, TEST_DIRECTOR } from '../testing/bankFixtures';
import { parseBocRows } from './bocExport';
import { classifyLine, learnPayeeRule, payeeOf, setLineKind } from './classify';
import { importStatement, readLedger } from './importLedger';
import { LineKind } from './LineKind';
import { readPayeeRules } from './payeeRules';

const LINES = parseBocRows(bocRows()).lines;
const NO_CONTEXT = { directors: [], rules: [] };

function line(index: number): (typeof LINES)[number] {
  const found = LINES[index];
  if (found === undefined) {
    throw new Error(`no fixture line ${index}`);
  }
  return found;
}

describe('classifyLine', () => {
  it('with transaction type Commission - Fee, is a bank fee in bank charges', () => {
    const fee = line(0);

    const result = classifyLine(fee, NO_CONTEXT);

    expect(result).toEqual({ kind: LineKind.BankFee, category: 'bank-charges', needsReview: false, billNumber: null });
  });

  it('with a card purchase, is an expense awaiting review', () => {
    const purchase = line(3);

    const result = classifyLine(purchase, NO_CONTEXT);

    expect(result).toEqual({ kind: LineKind.Expense, category: null, needsReview: true, billNumber: null });
  });

  it('with a credit from a director, in any name order, is owner money in', () => {
    const credit = line(1);

    const result = classifyLine(credit, { directors: ['Example Jane'], rules: [] });

    expect(result.kind).toBe(LineKind.OwnerMoneyIn);
  });

  it('with a credit from someone who is not a director, is to review', () => {
    const credit = line(4);

    const result = classifyLine(credit, { directors: [TEST_DIRECTOR], rules: [] });

    expect(result).toEqual({ kind: LineKind.ToReview, category: null, needsReview: true, billNumber: null });
  });

  it('with an internet debit naming an invoice, is the payment of that bill', () => {
    const debit = line(2);

    const result = classifyLine(debit, NO_CONTEXT);

    expect(result).toEqual({ kind: LineKind.Expense, category: null, needsReview: false, billNumber: '2026-17' });
  });

  it('with a learnt payee rule, applies its kind and category', () => {
    const purchase = line(3);
    const rules = learnPayeeRule([], purchase, LineKind.OwnerPersonal, null);

    const result = classifyLine(purchase, { directors: [], rules });

    expect(result).toEqual({ kind: LineKind.OwnerPersonal, category: null, needsReview: false, billNumber: null });
  });
});

describe('payeeOf', () => {
  it('with each description pattern, gives the payee', () => {
    const lines = [line(3), line(1), line(2)];

    const payees = lines.map(payeeOf);

    expect(payees).toEqual(['EXAMPLE CAFE LTD', 'JANE EXAMPLE', 'INVOICE 2026-17']);
  });
});

describe('learnPayeeRule', () => {
  it('with a payee already learnt, replaces its rule', () => {
    const first = learnPayeeRule([], line(3), LineKind.Expense, 'travel');

    const rules = learnPayeeRule(first, line(3), LineKind.Expense, 'meals-and-entertainment');

    expect(rules).toEqual([{ payee: 'EXAMPLE CAFE LTD', kind: LineKind.Expense, category: 'meals-and-entertainment' }]);
  });
});

describe('setLineKind', () => {
  it('with an owner choice, saves the line and sorts a later import of that payee the same way', async () => {
    const storage = createMemoryStorage();
    const first = await importStatement(storage, parseBocRows(bocRows()), { fileName: 'a.xlsx', bytes: bocXlsx(), directors: [] });
    const cafe = first.lines[3]?.key ?? '';
    await setLineKind(storage, { account: TEST_ACCOUNT, key: cafe }, LineKind.Expense, 'meals-and-entertainment');
    const later = { ...line(3), date: '2026-11-09' };
    const laterRow = { ...FIXTURE_LINES[3], date: '2026-11-09', bankReference: 'BR0000000009' } as (typeof FIXTURE_LINES)[number];

    const second = await importStatement(storage, parseBocRows(bocRows([laterRow], '01/11/2026 - 30/11/2026')), { fileName: 'b.xlsx', bytes: null, directors: [] });

    expect({ saved: (await readLedger(storage, TEST_ACCOUNT)).find((entry) => entry.key === cafe), later: second.lines[0], rules: await readPayeeRules(storage), payee: payeeOf(later) })
      .toMatchObject({
        saved: { kind: LineKind.Expense, category: 'meals-and-entertainment', needsReview: false },
        later: { kind: LineKind.Expense, category: 'meals-and-entertainment', needsReview: false },
        rules: [{ payee: 'EXAMPLE CAFE LTD' }], payee: 'EXAMPLE CAFE LTD',
      });
  });

  it('with an unknown line key, refuses it', async () => {
    const storage = createMemoryStorage();

    const set = setLineKind(storage, { account: TEST_ACCOUNT, key: 'nope' }, LineKind.Income, null);

    await expect(set).rejects.toThrow('key: no bank line nope');
  });
});
