import { describe, expect, it } from 'vitest';

import { computeTotals } from './lines';
import { formatCents, toCents, vatCents } from './money';

describe('toCents AC-12', () => {
  it('with 0.10 and 0.20, adds to exactly 30 cents', () => {
    const sum = (toCents('0.10') ?? 0) + (toCents('0.20') ?? 0);

    expect(sum).toBe(30);
  });

  it('with three decimals, returns null', () => {
    const result = toCents('1.999');

    expect(result).toBeNull();
  });
});

describe('formatCents AC-12', () => {
  it('with thousands and small cents, uses the Greek format', () => {
    const formatted = [formatCents(295200), formatCents(5)];

    expect(formatted).toEqual(['2.952,00', '0,05']);
  });
});

describe('computeTotals AC-12', () => {
  it('with a 19% rate, rounds VAT half up in whole cents', () => {
    const lines = [{ description: 'x', cents: 123450 }];

    const totals = computeTotals(lines, 19);

    expect(vatCents(123450, 19)).toBe(23456);
    expect(totals).toEqual({ netCents: 123450, vatCents: 23456, totalCents: 146906 });
  });
});

describe('formatCents with a negative amount', () => {
  it('with -40.50, puts one sign in front of the whole amount', () => {
    const cents = -4050;

    const text = formatCents(cents);

    expect(text).toBe('-40,50');
  });

  it('with thousands, groups them after the sign', () => {
    const cents = -295250;

    const text = formatCents(cents);

    expect(text).toBe('-2.952,50');
  });
});
