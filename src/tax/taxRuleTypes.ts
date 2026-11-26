import type { PayCap } from './PayCap';
import type { RuleStatus } from './RuleStatus';
import type { SourcedValue } from './sourcedValue';
import type { SourceType } from './SourceType';

export interface TaxSource {
  readonly title: string;
  readonly publisher: string;
  readonly type: SourceType;
  readonly url: string;
  readonly published: string | null;
  readonly checked: string;
  readonly readInFull: boolean;
}

export interface TaxBand {
  readonly fromEur: number;
  readonly toEur: number | null;
  readonly rate: number;
}

export interface TaxDeadline {
  readonly name: string;
  readonly date: SourcedValue<string>;
}

export interface PayrollFund {
  readonly rate: SourcedValue<number>;
  readonly cap: SourcedValue<PayCap>;
}

export interface CorporateRules {
  readonly rate: SourcedValue<number>;
  readonly lossCarryForwardYears: SourcedValue<number>;
}

export interface ConstructiveDividendCases {
  readonly who: string;
  readonly useOfCompanyAsset: string;
  readonly disposalBelowMarket: string;
  readonly excluded: string;
  readonly noRefund: string;
  readonly connectedPerson: string;
  readonly loansToShareholders: string;
}

export interface DividendRules {
  readonly defenceContributionRate: SourcedValue<number>;
  readonly defenceContributionRateLegacy: SourcedValue<number>;
  readonly gesyRate: SourcedValue<number>;
  readonly gesyCapAppliesToDividends: SourcedValue<boolean>;
  readonly deemedDistribution: SourcedValue<boolean>;
  readonly constructiveDividendWithholdingRate: SourcedValue<number>;
  readonly constructiveDividendCases: SourcedValue<ConstructiveDividendCases>;
  readonly directorLoanBenefitCoversIndirectShareholders: SourcedValue<boolean>;
  readonly directorLoanDeemedInterestRate: SourcedValue<number | null>;
}

export interface CompanyChanges {
  readonly stampDutyAbolished: SourcedValue<boolean>;
  readonly entertainmentDeductionCapEur: SourcedValue<number>;
  readonly exGratiaPaymentsDeductible: SourcedValue<boolean>;
  readonly nonBusinessAssetInterestDeductible: SourcedValue<boolean>;
  readonly defenceTaxOnCompanyInterestAndRent: SourcedValue<boolean>;
  readonly limitationPeriodYears: SourcedValue<number>;
}

export interface VatRules {
  readonly standardRate: SourcedValue<number>;
  readonly reducedRates: SourcedValue<readonly number[]>;
  readonly registrationThresholdEur: SourcedValue<number>;
  readonly euAcquisitionThresholdEur: SourcedValue<number>;
  readonly returnPeriod: SourcedValue<string>;
  readonly paymentAndFilingDueRule: SourcedValue<string>;
  readonly lateFilingPenaltyEur: SourcedValue<number>;
  readonly lateFilingSurchargeRate: SourcedValue<number>;
  readonly viesFrequency: SourcedValue<string>;
  readonly viesDueDayOfFollowingMonth: SourcedValue<number>;
  readonly viesLateFeeEur: SourcedValue<number>;
  readonly viesContinuedFailureMaxFineEur: SourcedValue<number>;
  readonly viesCorrectionLateFeeEur: SourcedValue<number>;
}

export interface FilingRules {
  readonly provisionalTaxInstalments: SourcedValue<number>;
  readonly provisionalTaxUnderestimateSurcharge: SourcedValue<number>;
  readonly provisionalTaxUnderestimateThreshold: SourcedValue<number>;
  readonly provisionalRevisionDeadline: SourcedValue<string>;
  readonly provisionalLateStarterRule: SourcedValue<string>;
  readonly latePaymentFineRate: SourcedValue<number>;
  readonly latePaymentFineRateAfterTwoMonths: SourcedValue<number>;
  readonly lateFilingFineCompanyEur: SourcedValue<number>;
  readonly lateFilingFineCompanyOver1mEur: SourcedValue<number>;
  readonly lateFilingFineAfterNoticeCompanyEur: SourcedValue<number>;
  readonly lateFilingFineAfterNoticeCompanyOver1mEur: SourcedValue<number>;
  readonly defaultInterestRate: SourcedValue<number>;
  readonly companyReturnDueRule: SourcedValue<string>;
  readonly finalTaxDueRule: SourcedValue<string>;
  readonly returnFormName: SourcedValue<string>;
}

export interface PersonalIncomeTaxRules {
  readonly taxFreeThresholdEur: SourcedValue<number>;
  readonly bands: SourcedValue<readonly TaxBand[]>;
}

export interface PayrollRules {
  readonly maxInsurableEarningsPerMonthEur: SourcedValue<number>;
  readonly maxInsurableEarningsPerWeekEur: SourcedValue<number>;
  readonly gesyAnnualCapEur: SourcedValue<number>;
  readonly employer: Readonly<Record<string, PayrollFund>>;
  readonly employee: Readonly<Record<string, PayrollFund>>;
  readonly selfEmployedSocialInsuranceRate: SourcedValue<number>;
  readonly selfEmployedGesyRate: SourcedValue<number>;
}

export interface ComplianceRules {
  readonly auditRequired: SourcedValue<boolean>;
  readonly reviewEngagementTurnoverLimitEur: SourcedValue<number>;
  readonly reviewEngagementAssetsLimitEur: SourcedValue<number>;
  readonly recordRetentionYears: SourcedValue<number>;
}

export interface TaxRules {
  readonly jurisdiction: string;
  readonly taxYear: number;
  readonly status: RuleStatus;
  readonly researchedOn: string;
  readonly corporateIncomeTax: CorporateRules;
  readonly dividends: DividendRules;
  readonly companyChanges: CompanyChanges;
  readonly vat: VatRules;
  readonly filing: FilingRules;
  readonly deadlines: readonly TaxDeadline[];
  readonly personalIncomeTax: PersonalIncomeTaxRules;
  readonly payroll: PayrollRules;
  readonly compliance: ComplianceRules;
  readonly sources: Readonly<Record<string, TaxSource>>;
}
