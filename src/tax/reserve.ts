import { CENTS_PER_UNIT } from '../bank/cents';
import { salaryCost } from './salaryCost';
import { highestCost } from './sourcedValue';
import { InvoiceError } from '../types';
import { taxRulesFor } from './taxRules';
import type { TaxRules } from './taxRuleTypes';


export interface ReserveInput {
  readonly year: number;
  readonly incomeCents?: number;
  readonly expensesCents?: number;
  readonly vatChargedCents?: number;
  readonly vatReclaimableCents?: number;
  readonly plannedDividendsCents?: number;
  readonly plannedSalaryCents?: number;
}

export interface TaxReserve {
  readonly taxYear: number;
  readonly taxableProfitCents: number;
  readonly corporateTaxCents: number;
  readonly vatOwedCents: number;
  readonly dividendCostCents: number;
  readonly salaryCostCents: number;
  readonly employerContributionsCents: number;
  readonly salaryWithheldCents: number;
  readonly reserveCents: number;
  readonly safeToSpendCents: number;
  readonly sourceIds: readonly string[];
}

const AMOUNT_FIELDS = ['incomeCents', 'expensesCents', 'vatChargedCents', 'vatReclaimableCents', 'plannedDividendsCents', 'plannedSalaryCents'] as const;

function assertNotNegative(input: ReserveInput): void {
  const errors = AMOUNT_FIELDS.filter((field) => (input[field] ?? 0) < 0).map((path) => ({ path, message: 'must not be negative' }));
  if (errors.length > 0) {
    throw new InvoiceError(errors);
  }
}

interface DividendCost {
  readonly cents: number;
  readonly sourceIds: readonly string[];
}

function dividendCost(rules: TaxRules, dividendsCents: number, salaryCents: number): DividendCost {
  if (dividendsCents <= 0) {
    return { cents: 0, sourceIds: [] };
  }
  const { dividends, payroll } = rules;
  const gesyRoom = Math.max(0, payroll.gesyAnnualCapEur.value * CENTS_PER_UNIT - salaryCents);
  const gesyBase = dividends.gesyCapAppliesToDividends.value ? Math.min(dividendsCents, gesyRoom) : dividendsCents;
  return {
    cents: Math.round(dividendsCents * highestCost(dividends.defenceContributionRate)) + Math.round(gesyBase * highestCost(dividends.gesyRate)),
    sourceIds: [
      ...dividends.defenceContributionRate.sourceIds,
      ...dividends.gesyRate.sourceIds,
      ...dividends.gesyCapAppliesToDividends.sourceIds,
      ...payroll.gesyAnnualCapEur.sourceIds,
    ],
  };
}

/** The tax reserve and the amount safe to spend for a year; null when no rule set ships for that year; throws on a negative amount. */
export function taxReserve(input: ReserveInput): TaxReserve | null {
  assertNotNegative(input);
  const rules = taxRulesFor(input.year);
  if (rules === null) {
    return null;
  }
  const { incomeCents = 0, expensesCents = 0, vatChargedCents = 0, vatReclaimableCents = 0 } = input;
  const { plannedDividendsCents = 0, plannedSalaryCents = 0 } = input;
  const salary = salaryCost(rules, plannedSalaryCents);
  const dividend = dividendCost(rules, plannedDividendsCents, plannedSalaryCents);
  const taxableProfitCents = Math.max(0, incomeCents - expensesCents - plannedSalaryCents - salary.employerCents);
  const corporateTaxCents = Math.round(taxableProfitCents * highestCost(rules.corporateIncomeTax.rate));
  const vatOwedCents = Math.max(0, vatChargedCents - vatReclaimableCents);
  const salaryCostCents = salary.employerCents + salary.withheldCents;
  const reserveCents = corporateTaxCents + vatOwedCents + dividend.cents + salaryCostCents;
  const cashCents = incomeCents - expensesCents + vatChargedCents - vatReclaimableCents;
  const paidOutCents = plannedSalaryCents - salary.withheldCents + plannedDividendsCents - dividend.cents;
  return {
    taxYear: rules.taxYear,
    taxableProfitCents,
    corporateTaxCents,
    vatOwedCents,
    dividendCostCents: dividend.cents,
    salaryCostCents,
    employerContributionsCents: salary.employerCents,
    salaryWithheldCents: salary.withheldCents,
    reserveCents,
    safeToSpendCents: cashCents - reserveCents - paidOutCents,
    sourceIds: [...new Set([...rules.corporateIncomeTax.rate.sourceIds, ...dividend.sourceIds, ...salary.sourceIds])],
  };
}
