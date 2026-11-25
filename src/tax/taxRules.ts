import { COMPANY_CHANGES_CY_2026, CORPORATE_CY_2026, DEADLINES_CY_2026, DIVIDENDS_CY_2026, FILING_CY_2026, VAT_CY_2026 } from './companyRulesCY2026';
import { COMPLIANCE_CY_2026, PAYROLL_CY_2026, PERSONAL_INCOME_TAX_CY_2026 } from './peopleRulesCY2026';
import { RuleStatus } from './RuleStatus';
import { SOURCES_CY_2026 } from './sourcesCY2026';
import type { TaxRules } from './taxRuleTypes';

export const TAX_RULES_CY_2026: TaxRules = {
  jurisdiction: 'CY',
  taxYear: 2026,
  status: RuleStatus.InForce,
  researchedOn: '2026-11-26',
  corporateIncomeTax: CORPORATE_CY_2026,
  dividends: DIVIDENDS_CY_2026,
  companyChanges: COMPANY_CHANGES_CY_2026,
  vat: VAT_CY_2026,
  filing: FILING_CY_2026,
  deadlines: DEADLINES_CY_2026,
  personalIncomeTax: PERSONAL_INCOME_TAX_CY_2026,
  payroll: PAYROLL_CY_2026,
  compliance: COMPLIANCE_CY_2026,
  sources: SOURCES_CY_2026,
};

const RULES_BY_YEAR: ReadonlyMap<number, TaxRules> = new Map([[TAX_RULES_CY_2026.taxYear, TAX_RULES_CY_2026]]);

/** The rule set for a tax year, or null when no rule set ships for that year. */
export function taxRulesFor(year: number): TaxRules | null {
  return RULES_BY_YEAR.get(year) ?? null;
}
