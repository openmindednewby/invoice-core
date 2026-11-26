import { conflictingValue, unverifiedValue, verifiedValue } from './sourcedValue';
import type { CompanyChanges, ConstructiveDividendCases, CorporateRules, DividendRules, FilingRules, TaxDeadline, VatRules } from './taxRuleTypes';

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
const LAW_243 = 'govcy-law-243-2025';
const SLIDES_243 = 'govcy-slides-243-2025';
const LAW_245 = 'govcy-law-245-2025';
const SLIDES_244 = 'govcy-slides-244-2025';
const SLIDES_245 = 'govcy-slides-245-2025';
const PROVISIONAL_SOURCES = [GOVCY_DEADLINES, BIC_INCOME_VAT, PWC_ADMIN];

export const CORPORATE_CY_2026: CorporateRules = {
  rate: verifiedValue(0.15, [EY, GOVCY_TF4], 'was 12.5% for 2013-2025; Gazette law text not read'),
  lossCarryForwardYears: unverifiedValue(7, [EY], 'was 5 before 2026; no gov.cy page read states 7'),
};

const CONSTRUCTIVE_DIVIDEND_CASES: ConstructiveDividendCases = {
  who: 'individual resident and domiciled in Cyprus (SDC sense) who is a shareholder of a Cyprus-resident company',
  useOfCompanyAsset: 'market value of a company asset used by the shareholder or a connected person, on the date personal use starts, times the personal-use share (100% if the asset is not connected with the business); an increase in use is charged on market value at the increase; a decrease refunds nothing',
  disposalBelowMarket: 'market value of a company asset disposed of to the shareholder or a connected person, minus the consideration paid, minus any use amount already charged on the same asset',
  excluded: 'an asset the company received as a gift from that same shareholder or connected person',
  noRefund: 'SDC paid under art. 3A is not refunded on a later art. 3 dividend, an asset contribution against the amount, or when use stops',
  connectedPerson: 'as in Income Tax Law art. 33(3)(a) and (b)',
  loansToShareholders: 'not in art. 3A; a loan is an Income Tax art. 5(1)(zeta) benefit, see directorLoanBenefitCoversIndirectShareholders',
};

export const DIVIDENDS_CY_2026: DividendRules = {
  defenceContributionRate: verifiedValue(0.05, [GOVCY_EAE, EY], 'resident domiciled individual, profits of 2026 onward'),
  defenceContributionRateLegacy: verifiedValue(0.17, [GOVCY_EAE, EY], 'profits up to 2025, received up to 31 Dec 2031'),
  gesyRate: verifiedValue(0.0265, [GOVCY_GESY, 'pwc-individual-other-taxes']),
  gesyCapAppliesToDividends: verifiedValue(true, [GOVCY_GESY],
    'one 180,000 cap across all income, charged by kind in table order: salary first, dividends after; employer 2.9% does not count'),
  deemedDistribution: verifiedValue(false, [GOVCY_EAE, EY, BDO], 'abolished for profits after 31 Dec 2025'),
  constructiveDividendWithholdingRate: verifiedValue(0.1, [LAW_245, GOVCY_EAE, 'govcy-tax-reform-2026', EY], 'SDC art. 3A(1), disguised dividend distribution'),
  constructiveDividendCases: verifiedValue(CONSTRUCTIVE_DIVIDEND_CASES, [LAW_245, SLIDES_245], 'Law 245(I)/2025 s.4, new SDC art. 3A; slides 21-23 agree'),
  directorLoanBenefitCoversIndirectShareholders: verifiedValue(true, [SLIDES_244],
    'Income Tax art. 5(1)(zeta) and 5(2)(zeta) extended to indirect shareholders; Law 244(I)/2025 text not read'),
  directorLoanDeemedInterestRate: unverifiedValue(null, [SLIDES_244, 'mondaq-reform-key-points'],
    'unknown from a primary: the slides state no rate; 9% per year is secondary only'),
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
  provisionalTaxUnderestimateSurcharge: unverifiedValue(0.1, [MOF_GUIDE, LAW_243],
    'of final tax minus provisional tax; Law 243(I)/2025 read and leaves it unchanged; base-law text not read'),
  provisionalTaxUnderestimateThreshold: unverifiedValue(0.75, [MOF_GUIDE], 'estimate below 3/4 of final chargeable income'),
  provisionalRevisionDeadline: verifiedValue('31 December of the current year', ['govcy-provisional-revision']),
  provisionalLateStarterRule: verifiedValue(
    'a company incorporated, registered or becoming resident after 30 June (or an individual starting non-salary income after 30 June) files its provisional computation by 31 December of that year',
    [LAW_243, SLIDES_243], 'Law 243(I)/2025 s.13, new proviso to art. 24'),
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
