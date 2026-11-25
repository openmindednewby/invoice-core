import { conflictingValue, unverifiedValue, verifiedValue } from './sourcedValue';
import type { CompanyChanges, CorporateRules, DividendRules, FilingRules, TaxDeadline, VatRules } from './taxRuleTypes';

const EY = 'ey-2026-0140';
const BDO = 'bdo-2026-reform';
const PWC_ADMIN = 'pwc-corporate-tax-admin';
const PWC_OTHER = 'pwc-corporate-other-taxes';
const GOVCY_EAE = 'govcy-eae';
const GOVCY_GESY = 'govcy-gesy';
const GOVCY_DEADLINES = 'govcy-deadlines';
const GOVCY_TF4 = 'govcy-tf4-company-return';
const GOVCY_PENALTIES = 'govcy-penalties';
const GOVCY_VIES = 'govcy-vies';
const GOVCY_VAT_FAQ = 'govcy-vat-faq';
const BIC_INCOME_VAT = 'businessincyprus-income-vat';
const MOF_PENALTY = 'mof-late-payment-penalty';
const MOF_GUIDE = 'mof-temp-tax-guide-2021';
const PROVISIONAL_SOURCES = [GOVCY_DEADLINES, BIC_INCOME_VAT, PWC_ADMIN];

export const CORPORATE_CY_2026: CorporateRules = {
  rate: verifiedValue(0.15, [EY, GOVCY_TF4], 'was 12.5% for 2013-2025; Gazette law text not read'),
  lossCarryForwardYears: unverifiedValue(7, [EY], 'was 5 before 2026; no gov.cy page read states 7'),
};

export const DIVIDENDS_CY_2026: DividendRules = {
  defenceContributionRate: verifiedValue(0.05, [GOVCY_EAE, EY], 'resident domiciled individual, profits of 2026 onward'),
  defenceContributionRateLegacy: verifiedValue(0.17, [GOVCY_EAE, EY], 'profits up to 2025, received up to 31 Dec 2031'),
  gesyRate: verifiedValue(0.0265, [GOVCY_GESY, 'pwc-individual-other-taxes']),
  gesyCapAppliesToDividends: verifiedValue(true, [GOVCY_GESY], 'the first 180,000 of total income is charged, salary first'),
  deemedDistribution: verifiedValue(false, [GOVCY_EAE, EY, BDO], 'abolished for profits after 31 Dec 2025'),
  constructiveDividendWithholdingRate: verifiedValue(0.1, [GOVCY_EAE, EY]),
  constructiveDividendCases: unverifiedValue(null, [EY], 'unknown: no source lists the cases caught; needs the law text'),
  directorLoanDeemedInterestRate: unverifiedValue(null, [EY, BDO], 'unknown: no source covers director loans under the 2026 rules'),
};

export const COMPANY_CHANGES_CY_2026: CompanyChanges = {
  stampDutyAbolished: unverifiedValue(true, [EY]),
  entertainmentDeductionCapEur: unverifiedValue(30000, [EY], 'unit and period of the cap not stated'),
  exGratiaPaymentsDeductible: unverifiedValue(false, [EY]),
  nonBusinessAssetInterestDeductible: unverifiedValue(false, [BDO], 'private motor vehicles excepted'),
  defenceTaxOnCompanyInterestAndRent: unverifiedValue(false, [EY, GOVCY_EAE], 'gov.cy states rent only'),
  limitationPeriodYears: unverifiedValue(6, [EY], 'six years from filing of the return'),
};

export const VAT_CY_2026: VatRules = {
  standardRate: verifiedValue(0.19, ['govcy-vat-rates', PWC_OTHER]),
  reducedRates: verifiedValue([0.09, 0.05, 0.03, 0], ['govcy-vat-rates'], 'the INV-EXPENSES-1 list lacks 3%'),
  registrationThresholdEur: verifiedValue(15600, [BIC_INCOME_VAT, PWC_OTHER], 'turnover in the preceding 12 months or the next 30 days'),
  euAcquisitionThresholdEur: verifiedValue(10251.61, [BIC_INCOME_VAT, PWC_OTHER], 'EU acquisitions per calendar year'),
  returnPeriod: verifiedValue('quarterly', [GOVCY_DEADLINES, PWC_OTHER]),
  paymentAndFilingDueRule: verifiedValue('10th day of the second month after the period ends', [GOVCY_DEADLINES, PWC_OTHER],
    'a weekend or holiday moves it to the next working day'),
  lateFilingPenaltyEur: verifiedValue(100, [GOVCY_VAT_FAQ, 'kpmg-vat-extension-2026'], 'gov.cy answer read was cut off after this'),
  lateFilingSurchargeRate: verifiedValue(0.1, [GOVCY_VAT_FAQ], 'additional tax on the VAT due'),
  viesFrequency: verifiedValue('monthly', [GOVCY_VIES], 'intra-Community suppliers only'),
  viesDueDayOfFollowingMonth: verifiedValue(15, [GOVCY_VIES]),
  viesLateFeeEur: verifiedValue(50, [GOVCY_VIES]),
  viesContinuedFailureMaxFineEur: verifiedValue(850, [GOVCY_VIES]),
  viesCorrectionLateFeeEur: verifiedValue(15, [GOVCY_VIES]),
};

export const FILING_CY_2026: FilingRules = {
  provisionalTaxInstalments: verifiedValue(2, [GOVCY_DEADLINES, PWC_ADMIN]),
  provisionalTaxUnderestimateSurcharge: unverifiedValue(0.1, [MOF_GUIDE], 'of final tax minus provisional tax; section 26 text not read'),
  provisionalTaxUnderestimateThreshold: unverifiedValue(0.75, [MOF_GUIDE], 'estimate below 3/4 of final chargeable income'),
  provisionalRevisionDeadline: verifiedValue('31 December of the current year', ['govcy-provisional-revision']),
  latePaymentFineRate: verifiedValue(0.05, [GOVCY_PENALTIES, MOF_PENALTY]),
  latePaymentFineRateAfterTwoMonths: conflictingValue(0.05, [GOVCY_PENALTIES], [{ value: 0, sourceIds: [MOF_PENALTY, PWC_ADMIN] }],
    'gov.cy from 2026: a further 5% after 2 months; the secondary sources show a single 5%'),
  lateFilingFineCompanyEur: verifiedValue(250, [GOVCY_PENALTIES], 'Law 4/1978 art. 50A; was 100'),
  lateFilingFineCompanyOver1mEur: verifiedValue(500, [GOVCY_PENALTIES], 'turnover or assets over 1m'),
  lateFilingFineAfterNoticeCompanyEur: verifiedValue(500, [GOVCY_PENALTIES]),
  lateFilingFineAfterNoticeCompanyOver1mEur: verifiedValue(1000, [GOVCY_PENALTIES]),
  defaultInterestRate: verifiedValue(0.035, ['govcy-default-interest'], 'was 5.50% in 2025'),
  companyReturnDueRule: conflictingValue('31 January of the second year after the tax year', [GOVCY_TF4, PWC_ADMIN],
    [{ value: '15 months after the tax year, payment 1 August', sourceIds: [BIC_INCOME_VAT] }],
    'businessincyprus describes the rule for years up to 2025; gov.cy tax page wins for 2026 on'),
  finalTaxDueRule: unverifiedValue('same date as the return', [PWC_ADMIN, EY], 'was 1 Aug of the next year up to 2025'),
  returnFormName: verifiedValue('T.D.4 (TF4)', [GOVCY_TF4], 'filed through the Tax For All portal'),
};

export const DEADLINES_CY_2026: readonly TaxDeadline[] = [
  { name: 'Provisional tax 1', date: verifiedValue('2026-07-31', PROVISIONAL_SOURCES) },
  { name: 'Provisional tax 2', date: verifiedValue('2026-12-31', PROVISIONAL_SOURCES) },
  { name: 'Final tax and company return 2025', date: verifiedValue('2026-08-01', [GOVCY_DEADLINES, GOVCY_TF4],
    'self-assessment and payment for 2025; the 2025 TF4 return is due 2027-03-31') },
  { name: 'Final tax and company return 2026', date: verifiedValue('2028-01-31', [GOVCY_TF4, PWC_ADMIN, EY],
    'return date on gov.cy; payment on the same date not confirmed there') },
];
