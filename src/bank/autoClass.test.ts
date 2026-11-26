import { describe, expect, it } from 'vitest';

import { foreignCard, INWARD, localCard, OTHER_DEBIT, syntheticLine } from '../testing/bankLines';
import { classifyLine } from './classify';
import { ClassSource } from './ClassSource';
import { LineKind } from './LineKind';

const NO_CONTEXT = { directors: [], rules: [] };

describe('classifyLine card codes', () => {
  it.each([
    ['5734', 'software-and-subscriptions'], ['4816', 'software-and-subscriptions'], ['5817', 'software-and-subscriptions'], ['7372', 'software-and-subscriptions'],
    ['5812', 'meals-and-entertainment'], ['5813', 'meals-and-entertainment'], ['5814', 'meals-and-entertainment'],
    ['5541', 'fuel-and-car'], ['5542', 'fuel-and-car'], ['4111', 'travel'], ['4121', 'travel'], ['4131', 'travel'], ['7011', 'travel'],
    ['4814', 'phone-and-internet'],
  ])('with card code %s, is an expense in %s', (code, category) => {
    const line = foreignCard('NL', code, 'SAMPLE SERVICE');

    const result = classifyLine(line, NO_CONTEXT);

    expect(result).toEqual({ kind: LineKind.Expense, category, needsReview: false, billNumber: null, invoiceNumbers: [], why: { source: ClassSource.CardCode, match: code } });
  });

  it('with a card code outside the table, is an expense awaiting review', () => {
    const line = foreignCard('IE', '4110', 'SAMPLE SERVICE');

    const result = classifyLine(line, NO_CONTEXT);

    expect(result).toEqual({ kind: LineKind.Expense, category: null, needsReview: true, billNumber: null, invoiceNumbers: [], why: { source: ClassSource.None, match: null } });
  });
});

describe('classifyLine words', () => {
  it.each(['CAFE', 'BAR', 'KITCHEN', 'PIZZA', 'TAVERNA'])('with a local card at a merchant named %s, suggests meals and entertainment for review', (word) => {
    const line = localCard(`SAMPLE ${word} ONE`);

    const result = classifyLine(line, NO_CONTEXT);

    expect(result).toEqual({ kind: LineKind.Expense, category: 'meals-and-entertainment', needsReview: true, billNumber: null, invoiceNumbers: [], why: { source: ClassSource.Word, match: word } });
  });

  it('with a word only inside a longer word, does not suggest', () => {
    const line = localCard('BARNSTORM SUPPLIES');

    const result = classifyLine(line, NO_CONTEXT);

    expect(result.why).toEqual({ source: ClassSource.None, match: null });
  });
});

describe('classifyLine bank types', () => {
  it('with an inward transfer from another bank, is income matched to the invoice numbers in its text', () => {
    const line = syntheticLine('INWARD CY000000000001 by SAMPLE CLIENT LTD>SAMPLE CLIENT PAYMENTOF INVOICE 2026-001, 2026-002', INWARD, 120000);

    const result = classifyLine(line, NO_CONTEXT);

    expect(result).toEqual({
      kind: LineKind.Income, category: null, needsReview: false, billNumber: null, invoiceNumbers: ['2026-001', '2026-002'], why: { source: ClassSource.BankType, match: INWARD },
    });
  });

  it('with a 1bank digipass debit, is a bank fee in bank charges', () => {
    const line = syntheticLine('1Bank Call Centre - Debit Advice Digipass', OTHER_DEBIT, -1000);

    const result = classifyLine(line, NO_CONTEXT);

    expect(result).toEqual({ kind: LineKind.BankFee, category: 'bank-charges', needsReview: false, billNumber: null, invoiceNumbers: [], why: { source: ClassSource.BankType, match: OTHER_DEBIT } });
  });

  it('with an other debit not from 1bank, is to review', () => {
    const line = syntheticLine('Standing order SAMPLE LANDLORD', OTHER_DEBIT, -1000);

    const result = classifyLine(line, NO_CONTEXT);

    expect(result.kind).toBe(LineKind.ToReview);
  });
});

describe('classifyLine order', () => {
  it('with a mapping and a card code that disagree, the mapping wins', () => {
    const line = foreignCard('NL', '4816', 'SAMPLE HOST');
    const rules = [{ contains: 'SAMPLE HOST', kind: LineKind.OwnerPersonal, category: null }];

    const result = classifyLine(line, { directors: [], rules });

    expect(result).toEqual({ kind: LineKind.OwnerPersonal, category: null, needsReview: false, billNumber: null, invoiceNumbers: [], why: { source: ClassSource.Mapping, match: 'SAMPLE HOST' } });
  });

  it('with a mapping on a bank fee line, the mapping wins over the bank type', () => {
    const line = syntheticLine('1Bank Call Centre - Debit Advice Digipass', OTHER_DEBIT, -1000);
    const rules = [{ contains: 'digipass', kind: LineKind.Expense, category: 'other' }];

    const result = classifyLine(line, { directors: [], rules });

    expect(result.why).toEqual({ source: ClassSource.Mapping, match: 'digipass' });
  });

  it('with two mappings matching, the longer text wins', () => {
    const line = localCard('SAMPLE CAFE CENTRAL');
    const rules = [{ contains: 'SAMPLE', kind: LineKind.OwnerPersonal, category: null }, { contains: 'SAMPLE CAFE', kind: LineKind.Expense, category: 'travel' }];

    const result = classifyLine(line, { directors: [], rules });

    expect({ kind: result.kind, category: result.category }).toEqual({ kind: LineKind.Expense, category: 'travel' });
  });

  it('with a card code and a word, the card code wins', () => {
    const line = foreignCard('IE', '5734', 'SAMPLE CAFE APP');

    const result = classifyLine(line, NO_CONTEXT);

    expect(result.why).toEqual({ source: ClassSource.CardCode, match: '5734' });
  });
});
