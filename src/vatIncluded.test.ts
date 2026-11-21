import { describe, expect, it } from 'vitest';

import { AmountBasis } from './AmountBasis';
import { computeTotals } from './lines';
import { toCents } from './money';
import { netLinesFromGross, scheduleMonthTotals, splitGross } from './vatIncluded';

const RATES = [0, 3, 5, 9, 13, 19, 20, 21, 23, 24, 25, 27];

describe('splitGross AC7', () => {
  it('with 5166.67 at 19%, gives net 4341.74 and VAT 824.93', () => {
    const gross = 516667;

    const totals = splitGross(gross, 19);

    expect(totals).toEqual({ netCents: 434174, vatCents: 82493, totalCents: 516667 });
  });

  it('with every amount up to 2000.00 at common rates, totals the entered amount and VAT within a cent of net x rate', () => {
    const amounts = Array.from({ length: 200001 }, (_, cents) => cents);

    const misses = RATES.flatMap((rate) => amounts.filter((gross) => {
      const totals = splitGross(gross, rate);
      return totals.netCents + totals.vatCents !== gross || Math.abs(totals.vatCents - (totals.netCents * rate) / 100) > 1;
    }));

    expect(misses).toEqual([]);
  });
});

describe('netLinesFromGross AC7', () => {
  it('with two gross lines at 19%, issued totals come to the entered sum', () => {
    const lines = [{ description: 'a', amount: '5166.67' }, { description: 'b', amount: '0.07' }];

    const net = netLinesFromGross(lines, 19);

    const totals = computeTotals(net.lines.map((line) => ({ description: line.description, cents: toCents(line.amount) ?? 0 })), 19, toCents(net.grossTotal));
    expect(net.grossTotal).toBe('5166.74');
    expect(totals.totalCents).toBe(516674);
  });
});

describe('scheduleMonthTotals', () => {
  it('with a month that has no basis, adds VAT on top as before', () => {
    const month = { period: '2030-01', lines: [{ description: 'a', amount: '1000' }], number: null, issuedOn: null };

    const totals = scheduleMonthTotals(month, 19);

    expect(totals.totalCents).toBe(119000);
  });

  it('with a VAT-included month, totals the entered amount', () => {
    const month = { period: '2030-01', lines: [{ description: 'a', amount: '5166.67' }], number: null, issuedOn: null, basis: AmountBasis.VatIncluded };

    const totals = scheduleMonthTotals(month, 19);

    expect(totals).toEqual({ netCents: 434174, vatCents: 82493, totalCents: 516667 });
  });
});
