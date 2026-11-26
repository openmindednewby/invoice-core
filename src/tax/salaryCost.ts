import { CENTS_PER_UNIT } from '../bank/cents';
import { PayCap } from './PayCap';
import { highestCost } from './sourcedValue';
import type { PayrollFund, TaxBand, TaxRules } from './taxRuleTypes';

const MONTHS_PER_YEAR = 12;

export interface SalaryCost {
  readonly employerCents: number;
  readonly withheldCents: number;
  readonly sourceIds: readonly string[];
}

function capCents(rules: TaxRules, cap: PayCap): number {
  if (cap === PayCap.InsurableEarnings) {
    return rules.payroll.maxInsurableEarningsPerMonthEur.value * MONTHS_PER_YEAR * CENTS_PER_UNIT;
  }
  if (cap === PayCap.GesyIncome) {
    return rules.payroll.gesyAnnualCapEur.value * CENTS_PER_UNIT;
  }
  return Number.POSITIVE_INFINITY;
}

function fundsCents(rules: TaxRules, funds: readonly PayrollFund[], salaryCents: number): number {
  return funds.reduce(
    (sum, fund) => sum + Math.round(Math.min(salaryCents, capCents(rules, fund.cap.value)) * highestCost(fund.rate)),
    0,
  );
}

function bandTaxCents(band: TaxBand, salaryCents: number): number {
  const top = band.toEur === null ? salaryCents : Math.min(salaryCents, band.toEur * CENTS_PER_UNIT);
  return Math.max(0, top - band.fromEur * CENTS_PER_UNIT) * band.rate;
}

/** Personal income tax on a yearly salary, band by band, in whole cents. */
export function incomeTaxCents(rules: TaxRules, salaryCents: number): number {
  return Math.round(rules.personalIncomeTax.bands.value.reduce((sum, band) => sum + bandTaxCents(band, salaryCents), 0));
}

function fundSourceIds(funds: readonly PayrollFund[]): string[] {
  return funds.flatMap((fund) => [...fund.rate.sourceIds, ...fund.cap.sourceIds]);
}

/** Employer contributions and the amounts withheld from a yearly gross salary. */
export function salaryCost(rules: TaxRules, salaryCents: number): SalaryCost {
  if (salaryCents <= 0) {
    return { employerCents: 0, withheldCents: 0, sourceIds: [] };
  }
  const employer = Object.values(rules.payroll.employer);
  const employee = Object.values(rules.payroll.employee);
  return {
    employerCents: fundsCents(rules, employer, salaryCents),
    withheldCents: fundsCents(rules, employee, salaryCents) + incomeTaxCents(rules, salaryCents),
    sourceIds: [
      ...fundSourceIds(employer),
      ...fundSourceIds(employee),
      ...rules.payroll.maxInsurableEarningsPerMonthEur.sourceIds,
      ...rules.payroll.gesyAnnualCapEur.sourceIds,
      ...rules.personalIncomeTax.bands.sourceIds,
    ],
  };
}
