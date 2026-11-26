import { describe, expect, it } from 'vitest';

import { LineKind } from '../bank/LineKind';
import { taxReserve } from '../tax/reserve';
import { auditLine, CARD_TYPE, FEE_TYPE } from './auditFixtures';
import { auditSummary } from './auditSummary';
import { PaymentMethod } from './PaymentMethod';

const INCOME_JAN = auditLine({ date: '2026-01-10', kind: LineKind.Income, amountCents: 100000, proven: true });
const CAFE_JAN = auditLine({ date: '2026-01-12', kind: LineKind.Expense, amountCents: -700, type: CARD_TYPE, category: 'Meals' });
const FEE_FEB = auditLine({ date: '2026-02-01', kind: LineKind.BankFee, amountCents: -1500, type: FEE_TYPE, category: 'Bank charges' });
const RENT_FEB = auditLine({ date: '2026-02-03', kind: LineKind.Expense, amountCents: -30000, category: 'Rent', proven: true });
const REVIEW_FEB = auditLine({ date: '2026-02-05', kind: LineKind.ToReview, amountCents: -2000 });
const LAST_YEAR = auditLine({ date: '2025-12-31', kind: LineKind.Income, amountCents: 999900 });
const LINES = [INCOME_JAN, CAFE_JAN, FEE_FEB, RENT_FEB, REVIEW_FEB, LAST_YEAR];

describe('auditSummary', () => {
  it('with lines in two years, sums income and expenses per month of the asked year only', () => {
    const lines = LINES;

    const summary = auditSummary(lines, 2026);

    expect(summary.months.slice(0, 3).map(({ month, incomeCents, expensesCents }) => ({ month, incomeCents, expensesCents }))).toEqual([
      { month: '2026-01', incomeCents: 100000, expensesCents: 700 },
      { month: '2026-02', incomeCents: 0, expensesCents: 31500 },
      { month: '2026-03', incomeCents: 0, expensesCents: 0 },
    ]);
  });

  it('with a year, returns all twelve months and the year line count', () => {
    const lines = LINES;

    const summary = auditSummary(lines, 2026);

    expect({ months: summary.months.length, last: summary.months[11]?.month, lineCount: summary.lineCount }).toEqual({ months: 12, last: '2026-12', lineCount: 5 });
  });

  it('with income, expenses and a plan, gives the reserve to date per month and the year reserve from taxReserve', () => {
    const plan = { plannedDividendsCents: 20000, plannedSalaryCents: 0 };

    const summary = auditSummary(LINES, 2026, plan);

    expect({ jan: summary.months[0]?.reserveToDateCents, feb: summary.months[1]?.reserveToDateCents, year: summary.reserve }).toEqual({
      jan: taxReserve({ year: 2026, incomeCents: 100000, expensesCents: 700, ...plan })?.reserveCents,
      feb: taxReserve({ year: 2026, incomeCents: 100000, expensesCents: 32200, ...plan })?.reserveCents,
      year: taxReserve({ year: 2026, incomeCents: 100000, expensesCents: 32200, ...plan }),
    });
  });

  it('with a year that has no rule set, guesses no reserve', () => {
    const lines = [LAST_YEAR];

    const summary = auditSummary(lines, 2025);

    expect({ year: summary.reserve, dec: summary.months[11]?.reserveToDateCents, income: summary.months[11]?.incomeCents }).toEqual({ year: null, dec: null, income: 999900 });
  });

  it('with lines of several kinds, totals each kind with its count in kind order', () => {
    const lines = LINES;

    const summary = auditSummary(lines, 2026);

    expect(summary.byKind).toEqual([
      { kind: LineKind.Expense, count: 2, totalCents: -30700 },
      { kind: LineKind.Income, count: 1, totalCents: 100000 },
      { kind: LineKind.BankFee, count: 1, totalCents: -1500 },
      { kind: LineKind.ToReview, count: 1, totalCents: -2000 },
    ]);
  });

  it('with categorised and uncategorised lines, totals each category by name with no category last', () => {
    const lines = LINES;

    const summary = auditSummary(lines, 2026);

    expect(summary.byCategory).toEqual([
      { category: 'Bank charges', count: 1, totalCents: -1500 },
      { category: 'Meals', count: 1, totalCents: -700 },
      { category: 'Rent', count: 1, totalCents: -30000 },
      { category: null, count: 2, totalCents: 98000 },
    ]);
  });

  it('with card, transfer and fee lines, totals money in and out per payment method', () => {
    const lines = LINES;

    const summary = auditSummary(lines, 2026);

    expect(summary.byMethod).toEqual([
      { method: PaymentMethod.Card, count: 1, inCents: 0, outCents: 700 },
      { method: PaymentMethod.Transfer, count: 3, inCents: 100000, outCents: 32000 },
      { method: PaymentMethod.Fee, count: 1, inCents: 0, outCents: 1500 },
    ]);
  });

  it('with proven and unproven lines, gives proof coverage and the missing lines per month', () => {
    const lines = LINES;

    const summary = auditSummary(lines, 2026);

    expect(summary.months.slice(0, 2).map((month) => month.proof)).toEqual([
      { neededCount: 2, provenCount: 1, missing: [CAFE_JAN] },
      { neededCount: 1, provenCount: 1, missing: [] },
    ]);
  });

  it('with no lines, returns empty totals and zero months', () => {
    const lines: never[] = [];

    const summary = auditSummary(lines, 2026);

    expect({ lineCount: summary.lineCount, byKind: summary.byKind, byCategory: summary.byCategory, byMethod: summary.byMethod, jan: summary.months[0] }).toEqual({
      lineCount: 0, byKind: [], byCategory: [], byMethod: [],
      jan: { month: '2026-01', incomeCents: 0, expensesCents: 0, reserveToDateCents: taxReserve({ year: 2026 })?.reserveCents, proof: { neededCount: 0, provenCount: 0, missing: [] } },
    });
  });
});
