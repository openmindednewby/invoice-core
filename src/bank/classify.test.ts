import { describe, expect, it } from 'vitest';

import { createMemoryStorage } from '../memoryStorage';
import { bocRows, bocXlsx, FIXTURE_LINES, TEST_ACCOUNT, TEST_DIRECTOR } from '../testing/bankFixtures';
import { parseBocRows } from './bocExport';
import { applyMapping, classifyLine, mappingFor, matchesMapping, setLineKind } from './classify';
import { ClassSource } from './ClassSource';
import { importStatement, readLedger } from './importLedger';
import { LineKind } from './LineKind';
import { readPayeeRules } from './payeeRules';
import { payeeOf } from './payeeText';

const LINES = parseBocRows(bocRows()).lines;
const NO_CONTEXT = { directors: [], rules: [] };
const NOT_SORTED = { source: ClassSource.None, match: null };

function line(index: number): (typeof LINES)[number] {
  const found = LINES[index];
  if (found === undefined) {
    throw new Error(`no fixture line ${index}`);
  }
  return found;
}

async function importedCafe(): Promise<{ storage: ReturnType<typeof createMemoryStorage>; key: string }> {
  const storage = createMemoryStorage();
  const first = await importStatement(storage, parseBocRows(bocRows()), { fileName: 'a.xlsx', bytes: bocXlsx(), directors: [] });
  return { storage, key: first.lines[3]?.key ?? '' };
}

describe('classifyLine', () => {
  it('with transaction type Commission - Fee, is a bank fee in bank charges', () => {
    const fee = line(0);

    const result = classifyLine(fee, NO_CONTEXT);

    expect(result).toEqual({
      kind: LineKind.BankFee, category: 'bank-charges', needsReview: false, billNumber: null, invoiceNumbers: [], why: { source: ClassSource.BankType, match: 'Commission - Fee' },
    });
  });

  it('with a local card purchase at a cafe, suggests meals and entertainment for review', () => {
    const purchase = line(3);

    const result = classifyLine(purchase, NO_CONTEXT);

    expect(result).toEqual({
      kind: LineKind.Expense, category: 'meals-and-entertainment', needsReview: true, billNumber: null, invoiceNumbers: [], why: { source: ClassSource.Word, match: 'CAFE' },
    });
  });

  it('with a credit from a director, in any name order, is owner money in', () => {
    const credit = line(1);

    const result = classifyLine(credit, { directors: ['Example Jane'], rules: [] });

    expect({ kind: result.kind, why: result.why }).toEqual({ kind: LineKind.OwnerMoneyIn, why: { source: ClassSource.Director, match: 'JANE EXAMPLE' } });
  });

  it('with a credit from someone who is not a director, is to review and not sorted', () => {
    const credit = line(4);

    const result = classifyLine(credit, { directors: [TEST_DIRECTOR], rules: [] });

    expect(result).toEqual({ kind: LineKind.ToReview, category: null, needsReview: true, billNumber: null, invoiceNumbers: [], why: NOT_SORTED });
  });

  it('with an internet debit naming an invoice, is the payment of that bill', () => {
    const debit = line(2);

    const result = classifyLine(debit, NO_CONTEXT);

    expect(result).toEqual({ kind: LineKind.Expense, category: null, needsReview: false, billNumber: '2026-17', invoiceNumbers: [], why: { source: ClassSource.Bill, match: '2026-17' } });
  });

  it('with a mapping whose text the description contains, applies its kind and category', () => {
    const purchase = line(3);
    const rules = [mappingFor(purchase, LineKind.OwnerPersonal, null)];

    const result = classifyLine(purchase, { directors: [], rules });

    expect(result).toEqual({
      kind: LineKind.OwnerPersonal, category: null, needsReview: false, billNumber: null, invoiceNumbers: [], why: { source: ClassSource.Mapping, match: 'EXAMPLE CAFE LTD' },
    });
  });
});

describe('payeeOf', () => {
  it('with each description pattern, gives the payee', () => {
    const lines = [line(3), line(1), line(2)];

    const payees = lines.map(payeeOf);

    expect(payees).toEqual(['EXAMPLE CAFE LTD', 'JANE EXAMPLE', 'INVOICE 2026-17']);
  });
});

describe('matchesMapping', () => {
  it('with the text in another case inside the description, matches', () => {
    const rule = { contains: 'example cafe', kind: LineKind.Expense, category: null };

    const matched = matchesMapping(line(3), rule);

    expect(matched).toBe(true);
  });
});

describe('setLineKind', () => {
  it('with an owner choice, saves the line by hand and sorts a later import of that payee by mapping', async () => {
    const { storage, key } = await importedCafe();
    await setLineKind(storage, { account: TEST_ACCOUNT, key }, LineKind.Expense, 'travel');
    const laterRow = { ...FIXTURE_LINES[3], date: '2026-11-09', bankReference: 'BR0000000009' } as (typeof FIXTURE_LINES)[number];

    const second = await importStatement(storage, parseBocRows(bocRows([laterRow], '01/11/2026 - 30/11/2026')), { fileName: 'b.xlsx', bytes: null, directors: [] });

    expect({ saved: (await readLedger(storage, TEST_ACCOUNT)).find((entry) => entry.key === key), later: second.lines[0], rules: await readPayeeRules(storage) })
      .toMatchObject({
        saved: { kind: LineKind.Expense, category: 'travel', needsReview: false, why: { source: ClassSource.Manual, match: null } },
        later: { kind: LineKind.Expense, category: 'travel', needsReview: false, why: { source: ClassSource.Mapping, match: 'EXAMPLE CAFE LTD' } },
        rules: [{ contains: 'EXAMPLE CAFE LTD', kind: LineKind.Expense, category: 'travel' }],
      });
  });

  it('with an unknown line key, refuses it', async () => {
    const storage = createMemoryStorage();

    const set = setLineKind(storage, { account: TEST_ACCOUNT, key: 'nope' }, LineKind.Income, null);

    await expect(set).rejects.toThrow('key: no bank line nope');
  });
});

describe('applyMapping', () => {
  it('with earlier lines matching, re-sorts them and returns the count', async () => {
    const { storage, key } = await importedCafe();

    const count = await applyMapping(storage, TEST_ACCOUNT, { contains: 'EXAMPLE CAFE', kind: LineKind.OwnerPersonal, category: null });

    expect({ count, line: (await readLedger(storage, TEST_ACCOUNT)).find((entry) => entry.key === key) })
      .toMatchObject({ count: 1, line: { kind: LineKind.OwnerPersonal, needsReview: false, why: { source: ClassSource.Mapping, match: 'EXAMPLE CAFE' } } });
  });

  it('with a line the owner set by hand, never re-sorts it', async () => {
    const { storage, key } = await importedCafe();
    await setLineKind(storage, { account: TEST_ACCOUNT, key }, LineKind.Expense, 'travel');

    const count = await applyMapping(storage, TEST_ACCOUNT, { contains: 'EXAMPLE CAFE', kind: LineKind.OwnerPersonal, category: null });

    expect({ count, line: (await readLedger(storage, TEST_ACCOUNT)).find((entry) => entry.key === key) })
      .toMatchObject({ count: 0, line: { kind: LineKind.Expense, category: 'travel' } });
  });

  it('with a ledger stored before lines had a why, treats a sorted line as set by hand', async () => {
    const { storage, key } = await importedCafe();
    const stored = (await readLedger(storage, TEST_ACCOUNT)).map(({ why: _why, invoiceNumbers: _numbers, ...rest }) => ({ ...rest, needsReview: rest.key !== key }));
    await storage.replace(`bank/${TEST_ACCOUNT}/lines.json`, JSON.stringify(stored));

    const count = await applyMapping(storage, TEST_ACCOUNT, { contains: 'EXAMPLE CAFE', kind: LineKind.OwnerPersonal, category: null });

    expect(count).toBe(0);
  });
});
