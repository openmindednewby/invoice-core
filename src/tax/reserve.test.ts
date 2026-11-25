import { describe, expect, it } from 'vitest';

import { taxReserve } from './reserve';
import { incomeTaxCents } from './salaryCost';
import { TAX_RULES_CY_2026 } from './taxRules';

const EUR = 100;

describe('taxReserve', () => {
  it('with only a year, defaults every amount to 0 and reserves nothing', () => {
    const input = { year: 2026 };

    const reserve = taxReserve(input);

    expect(reserve).toMatchObject({ corporateTaxCents: 0, vatOwedCents: 0, dividendCostCents: 0, salaryCostCents: 0, reserveCents: 0, safeToSpendCents: 0 });
  });

  it('with 100,000 income and 20,000 expenses, reserves 15% of the 80,000 profit and leaves 68,000 safe', () => {
    const input = { year: 2026, incomeCents: 100000 * EUR, expensesCents: 20000 * EUR };

    const reserve = taxReserve(input);

    expect(reserve).toMatchObject({ corporateTaxCents: 12000 * EUR, reserveCents: 12000 * EUR, safeToSpendCents: 68000 * EUR });
  });

  it('with 19,000 VAT charged and 3,800 reclaimable, owes 15,200 VAT', () => {
    const input = { year: 2026, vatChargedCents: 19000 * EUR, vatReclaimableCents: 3800 * EUR };

    const reserve = taxReserve(input);

    expect(reserve?.vatOwedCents).toBe(15200 * EUR);
  });

  it('with more VAT reclaimable than charged, owes no VAT', () => {
    const input = { year: 2026, vatChargedCents: 1000 * EUR, vatReclaimableCents: 3000 * EUR };

    const reserve = taxReserve(input);

    expect(reserve?.vatOwedCents).toBe(0);
  });

  it('with a 10,000 dividend, costs 5% defence contribution plus 2.65% GESY = 765', () => {
    const input = { year: 2026, plannedDividendsCents: 10000 * EUR };

    const reserve = taxReserve(input);

    expect(reserve?.dividendCostCents).toBe(765 * EUR);
  });

  it('with a 170,000 salary and a 20,000 dividend, charges GESY only on the 10,000 left under the 180,000 cap', () => {
    const input = { year: 2026, plannedSalaryCents: 170000 * EUR, plannedDividendsCents: 20000 * EUR };

    const reserve = taxReserve(input);

    expect(reserve?.dividendCostCents).toBe((1000 + 265) * EUR);
  });

  it('with a 30,000 salary, takes the 8% holiday fund over none (D-TAX-3) and withholds SI, GESY and income tax', () => {
    const input = { year: 2026, plannedSalaryCents: 30000 * EUR };

    const reserve = taxReserve(input);

    expect(reserve).toMatchObject({
      employerContributionsCents: (2640 + 360 + 150 + 600 + 870 + 2400) * EUR,
      salaryWithheldCents: (2640 + 795 + 1600) * EUR,
      salaryCostCents: (7020 + 5035) * EUR,
    });
  });

  it('with a 100,000 salary, caps the insurable funds at 12 x 5,742 = 68,904 and leaves cohesion and GESY uncapped below 180,000', () => {
    const input = { year: 2026, plannedSalaryCents: 100000 * EUR };

    const reserve = taxReserve(input);

    expect(reserve?.employerContributionsCents).toBe(606355 + 82685 + 34452 + 551232 + 200000 + 290000);
  });

  it('with income, expenses, VAT, a dividend and a salary, deducts salary costs from profit and leaves the rest safe', () => {
    const input = {
      year: 2026,
      incomeCents: 100000 * EUR,
      expensesCents: 20000 * EUR,
      vatChargedCents: 19000 * EUR,
      vatReclaimableCents: 3800 * EUR,
      plannedDividendsCents: 10000 * EUR,
      plannedSalaryCents: 30000 * EUR,
    };

    const reserve = taxReserve(input);

    expect(reserve).toMatchObject({
      taxableProfitCents: (100000 - 20000 - 30000 - 7020) * EUR,
      corporateTaxCents: 6447 * EUR,
      reserveCents: (6447 + 15200 + 765 + 12055) * EUR,
      safeToSpendCents: (100000 - 20000 - 6447 - 7020 - 30000 - 10000) * EUR,
    });
  });

  it('with only income, lists the corporate tax sources and no dividend or payroll source', () => {
    const input = { year: 2026, incomeCents: 1000 * EUR };

    const reserve = taxReserve(input);

    expect(reserve?.sourceIds).toEqual(['ey-2026-0140', 'govcy-tf4-company-return']);
  });

  it('with a dividend and a salary, lists the defence contribution, GESY and social insurance sources once each', () => {
    const input = { year: 2026, plannedDividendsCents: 1000 * EUR, plannedSalaryCents: 1000 * EUR };

    const ids = taxReserve(input)?.sourceIds ?? [];

    expect({ eae: ids.includes('govcy-eae'), gesy: ids.includes('govcy-gesy'), sis: ids.includes('sis-max-earnings-2026'), unique: new Set(ids).size === ids.length })
      .toEqual({ eae: true, gesy: true, sis: true, unique: true });
  });

  it('with a year that has no rule set, returns null', () => {
    const input = { year: 2025, incomeCents: 1000 * EUR };

    const reserve = taxReserve(input);

    expect(reserve).toBeNull();
  });
});

describe('incomeTaxCents', () => {
  it('with 80,000, charges 20% to 32,000, 25% to 42,000, 30% to 72,000 and 35% above', () => {
    const salaryCents = 80000 * EUR;

    const tax = incomeTaxCents(TAX_RULES_CY_2026, salaryCents);

    expect(tax).toBe((2000 + 2500 + 9000 + 2800) * EUR);
  });
});
