import { describe, expect, it } from 'vitest';

import { createMemoryStorage } from '../memoryStorage';
import { foreignCard, localCard } from '../testing/bankLines';
import { PAYEE_RULES_JSON } from './bankPaths';
import { LineKind } from './LineKind';
import { deletePayeeRule, readPayeeRules, upsertPayeeRule } from './payeeRules';
import { payeeKey, payeeOf } from './payeeText';

describe('payeeKey', () => {
  it('with a foreign card payee, drops the country, the card code and the numbers', () => {
    const payee = payeeOf(foreignCard('NL', '4816', 'SAMPLE HOST'));

    const key = payeeKey(payee);

    expect(key).toBe('SAMPLE HOST');
  });

  it('with a local card payee, keeps the merchant words', () => {
    const payee = payeeOf(localCard('SAMPLE GREEN GARDEN LTD'));

    const key = payeeKey(payee);

    expect(key).toBe('SAMPLE GREEN GARDEN LTD');
  });
});

describe('readPayeeRules', () => {
  it('with rules saved as exact payees, migrates each to a contains rule on its payee key', async () => {
    const storage = createMemoryStorage();
    await storage.replace(PAYEE_RULES_JSON, JSON.stringify([
      { payee: 'NL 4816 SAMPLE HOST 4000000001', kind: LineKind.Expense, category: 'software-and-subscriptions' },
      { payee: 'NL 4816 SAMPLE HOST 4000000002', kind: LineKind.Expense, category: 'other' },
      { payee: 'SAMPLE CAFE LTD', kind: LineKind.OwnerPersonal, category: null },
    ]));

    const rules = await readPayeeRules(storage);

    expect(rules).toEqual([
      { contains: 'SAMPLE HOST', kind: LineKind.Expense, category: 'other' },
      { contains: 'SAMPLE CAFE LTD', kind: LineKind.OwnerPersonal, category: null },
    ]);
  });

  it('with an empty contains text, drops the rule', async () => {
    const storage = createMemoryStorage();
    await storage.replace(PAYEE_RULES_JSON, JSON.stringify([{ contains: '  ', kind: LineKind.Expense, category: null }]));

    const rules = await readPayeeRules(storage);

    expect(rules).toEqual([]);
  });
});

describe('upsertPayeeRule', () => {
  it('with a rule replacing an earlier text, edits it in place and keeps the others', async () => {
    const storage = createMemoryStorage();
    await upsertPayeeRule(storage, null, { contains: 'SAMPLE HOST', kind: LineKind.Expense, category: 'other' });
    await upsertPayeeRule(storage, null, { contains: 'SAMPLE CAFE', kind: LineKind.Expense, category: 'meals-and-entertainment' });

    const rules = await upsertPayeeRule(storage, 'sample host', { contains: 'SAMPLE HOSTING', kind: LineKind.Expense, category: 'software-and-subscriptions' });

    expect(rules).toEqual([
      { contains: 'SAMPLE HOSTING', kind: LineKind.Expense, category: 'software-and-subscriptions' },
      { contains: 'SAMPLE CAFE', kind: LineKind.Expense, category: 'meals-and-entertainment' },
    ]);
  });

  it('with blank text, refuses it', async () => {
    const storage = createMemoryStorage();

    const saved = upsertPayeeRule(storage, null, { contains: ' ', kind: LineKind.Expense, category: null });

    await expect(saved).rejects.toThrow('contains: is required');
  });
});

describe('deletePayeeRule', () => {
  it('with a saved text, removes only that rule', async () => {
    const storage = createMemoryStorage();
    await upsertPayeeRule(storage, null, { contains: 'SAMPLE HOST', kind: LineKind.Expense, category: 'other' });
    await upsertPayeeRule(storage, null, { contains: 'SAMPLE CAFE', kind: LineKind.Expense, category: null });

    const rules = await deletePayeeRule(storage, 'SAMPLE HOST');

    expect(rules).toEqual([{ contains: 'SAMPLE CAFE', kind: LineKind.Expense, category: null }]);
  });
});
