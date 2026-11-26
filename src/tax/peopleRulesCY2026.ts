import { PayCap } from './PayCap';
import { conflictingValue, unverifiedValue, verifiedValue } from './sourcedValue';
import type { ComplianceRules, PayrollFund, PayrollRules, PersonalIncomeTaxRules } from './taxRuleTypes';

const KPMG = 'kpmg-insurable-earnings-2026';
const PWC_OTHER = 'pwc-corporate-other-taxes';
const BIC_SI = 'businessincyprus-social-insurance';
const BIC_INCOME_VAT = 'businessincyprus-income-vat';
const GOVCY_GESY = 'govcy-gesy';
const SIS = 'sis-max-earnings-2026';
const MLSI_HOLIDAY = 'mlsi-central-holiday-fund';
const CAP_NOT_STATED = 'no primary source says which funds are capped';

const insurableCap = unverifiedValue(PayCap.InsurableEarnings, [KPMG], CAP_NOT_STATED);
const gesyCap = verifiedValue(PayCap.GesyIncome, [GOVCY_GESY]);

function fund(rate: PayrollFund['rate'], cap: PayrollFund['cap']): PayrollFund {
  return { rate, cap };
}

export const PERSONAL_INCOME_TAX_CY_2026: PersonalIncomeTaxRules = {
  taxFreeThresholdEur: verifiedValue(22000, [BIC_INCOME_VAT, 'ey-taxlegi-2026-02'], 'was 19,500'),
  bands: verifiedValue(
    [
      { fromEur: 0, toEur: 22000, rate: 0 },
      { fromEur: 22000, toEur: 32000, rate: 0.2 },
      { fromEur: 32000, toEur: 42000, rate: 0.25 },
      { fromEur: 42000, toEur: 72000, rate: 0.3 },
      { fromEur: 72000, toEur: null, rate: 0.35 },
    ],
    [BIC_INCOME_VAT, 'ey-taxlegi-2026-02'],
    'Income Tax Law text not read',
  ),
};

export const PAYROLL_CY_2026: PayrollRules = {
  maxInsurableEarningsPerMonthEur: verifiedValue(5742, [SIS, KPMG], 'from 2026-01-01'),
  maxInsurableEarningsPerWeekEur: verifiedValue(1325, [SIS, KPMG], 'from 2026-01-05'),
  gesyAnnualCapEur: verifiedValue(180000, [GOVCY_GESY, 'pwc-individual-other-taxes']),
  employer: {
    socialInsurance: fund(verifiedValue(0.088, [BIC_SI, KPMG]), insurableCap),
    redundancyFund: fund(verifiedValue(0.012, [BIC_SI, KPMG]), insurableCap),
    hrdaTrainingFund: fund(verifiedValue(0.005, [BIC_SI, KPMG]), insurableCap),
    socialCohesion: fund(verifiedValue(0.02, [BIC_SI, KPMG]), unverifiedValue(PayCap.None, [KPMG], 'one secondary source disputes the base')),
    gesy: fund(verifiedValue(0.029, [GOVCY_GESY, PWC_OTHER]), gesyCap),
    holidayFund: fund(
      conflictingValue(0.08, [MLSI_HOLIDAY, PWC_OTHER, BIC_SI], [{ value: 0, sourceIds: [KPMG] }],
        'mlsi: employer only, 8% for 20 or 24 days leave rising to 16% at 40 or 48 days; exemptible; KPMG has no row'),
      unverifiedValue(PayCap.InsurableEarnings, [PWC_OTHER], CAP_NOT_STATED),
    ),
  },
  employee: {
    socialInsurance: fund(verifiedValue(0.088, [BIC_SI, KPMG]), insurableCap),
    gesy: fund(verifiedValue(0.0265, [GOVCY_GESY, PWC_OTHER]), gesyCap),
  },
  selfEmployedSocialInsuranceRate: verifiedValue(0.166, [BIC_SI, KPMG]),
  selfEmployedGesyRate: verifiedValue(0.04, [GOVCY_GESY, PWC_OTHER]),
};

export const COMPLIANCE_CY_2026: ComplianceRules = {
  auditRequired: unverifiedValue(true, ['mondaq-audit-requirements', 'pwc-corporate-tax-admin', 'roc-sme'],
    'not settled: companies.gov.cy states no audit rule; a review engagement may replace the audit below the size test'),
  reviewEngagementTurnoverLimitEur: unverifiedValue(300000, ['mondaq-audit-threshold-2026'], 'years starting on or after 6 Feb 2026; was 200,000'),
  reviewEngagementAssetsLimitEur: unverifiedValue(500000, ['mondaq-audit-threshold-2026'], 'gross assets, two consecutive years'),
  recordRetentionYears: conflictingValue(6, ['govcy-law-243-2025', 'govcy-slides-243-2025', 'ey-2026-0140'],
    [{ value: 7, sourceIds: ['businessincyprus-records'] }],
    'Law 243(I)/2025 ss.4 and 17: 6 years from the later of return deadline or filing; portal 7 matches the pre-2026 wording'),
};
