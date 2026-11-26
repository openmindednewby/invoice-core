import { describe, expect, it } from 'vitest';

import { highestCost } from './sourcedValue';
import type { SourcedValue } from './sourcedValue';
import { SourceType } from './SourceType';
import { TAX_RULES_CY_2026, taxRulesFor } from './taxRules';

const META_KEYS = new Set(['jurisdiction', 'taxYear', 'status', 'researchedOn', 'name']);

interface Leaf {
  readonly path: string;
  readonly sourced: SourcedValue<unknown> | null;
}

function isSourced(node: object): node is SourcedValue<unknown> {
  return 'value' in node && 'verified' in node && 'sourceIds' in node;
}

function leaves(node: unknown, path: string): Leaf[] {
  if (node !== null && typeof node === 'object' && isSourced(node)) {
    return [{ path, sourced: node }];
  }
  if (node !== null && typeof node === 'object') {
    return Object.entries(node).flatMap(([key, child]) => leaves(child, `${path}.${key}`));
  }
  const key = path.split('.').pop() ?? '';
  return META_KEYS.has(key) ? [] : [{ path, sourced: null }];
}

const { sources, ...ruleTree } = TAX_RULES_CY_2026;
const allLeaves = leaves(ruleTree, 'rules');
const sourcedLeaves = allLeaves.flatMap((leaf) => (leaf.sourced === null ? [] : [{ path: leaf.path, value: leaf.sourced }]));

function citedIds(value: SourcedValue<unknown>): readonly string[] {
  return [...value.sourceIds, ...(value.alternatives ?? []).flatMap((alternative) => alternative.sourceIds)];
}

function citesPrimary(value: SourcedValue<unknown>): boolean {
  return value.sourceIds.some((id) => sources[id]?.type === SourceType.Primary);
}

describe('TAX_RULES_CY_2026', () => {
  it('with every rule value, carries its value inside a sourced value', () => {
    const bare = allLeaves.filter((leaf) => leaf.sourced === null).map((leaf) => leaf.path);

    expect(bare).toEqual([]);
  });

  it('with every sourced value, cites at least one source and only sources that exist', () => {
    const broken = sourcedLeaves.filter(({ value }) => value.sourceIds.length === 0 || citedIds(value).some((id) => sources[id] === undefined));

    expect(broken.map(({ path }) => path)).toEqual([]);
  });

  it('with every verified value, cites a primary page that was read', () => {
    const unsupported = sourcedLeaves.filter(({ value }) => value.verified && !citesPrimary(value));

    expect(unsupported.map(({ path }) => path)).toEqual([]);
  });

  it('with conflicting sources, keeps every value and marks it unverified', () => {
    const conflicts = sourcedLeaves.filter(({ value }) => (value.alternatives ?? []).length > 0);

    expect(conflicts.map(({ path }) => path)).toEqual([
      'rules.filing.latePaymentFineRateAfterTwoMonths',
      'rules.filing.companyReturnDueRule',
      'rules.payroll.employer.holidayFund.rate',
      'rules.compliance.recordRetentionYears',
    ]);
    expect(conflicts.every(({ value }) => !value.verified && value.note !== undefined)).toBe(true);
  });

  it('with every source listed, is cited by at least one rule value', () => {
    const cited = new Set(sourcedLeaves.flatMap(({ value }) => citedIds(value)));

    const orphans = Object.keys(sources).filter((id) => !cited.has(id));

    expect(orphans).toEqual([]);
  });

  it('with the 2026 corporate rate, is 15% and verified on gov.cy', () => {
    const rate = TAX_RULES_CY_2026.corporateIncomeTax.rate;

    const primaryIds = rate.sourceIds.filter((id) => sources[id]?.type === SourceType.Primary);

    expect({ value: rate.value, verified: rate.verified, primaryIds }).toEqual({ value: 0.15, verified: true, primaryIds: ['govcy-tf4-company-return'] });
  });
});

describe('TAX_RULES_CY_2026 passes 3-4', () => {
  it('with record retention, uses the 6 years of Law 243(I)/2025 and keeps the portal 7 as a conflict', () => {
    const retention = TAX_RULES_CY_2026.compliance.recordRetentionYears;

    const alternatives = (retention.alternatives ?? []).map((alternative) => alternative.value);

    expect({ value: retention.value, cites: retention.sourceIds.includes('govcy-law-243-2025'), alternatives }).toEqual({ value: 6, cites: true, alternatives: [7] });
  });

  it('with the holiday fund, keeps 8% and cites the Central Holiday Fund page', () => {
    const rate = TAX_RULES_CY_2026.payroll.employer.holidayFund?.rate;

    const cites = rate?.sourceIds.includes('mlsi-central-holiday-fund') ?? false;

    expect({ value: rate?.value, cites }).toEqual({ value: 0.08, cites: true });
  });

  it('with the GESY cap on dividends, is verified on gov.cy and says salary is charged first', () => {
    const cap = TAX_RULES_CY_2026.dividends.gesyCapAppliesToDividends;

    const salaryFirst = cap.note?.includes('salary') ?? false;

    expect({ value: cap.value, verified: cap.verified, salaryFirst }).toEqual({ value: true, verified: true, salaryFirst: true });
  });

  it('with constructive dividends, lists the art. 3A cases read in Law 245(I)/2025', () => {
    const cases = TAX_RULES_CY_2026.dividends.constructiveDividendCases;

    const keys = cases.value === null ? [] : Object.keys(cases.value);

    expect({ verified: cases.verified, cites: cases.sourceIds.includes('govcy-law-245-2025'), keys }).toEqual({
      verified: true,
      cites: true,
      keys: ['who', 'useOfCompanyAsset', 'disposalBelowMarket', 'excluded', 'noRefund', 'connectedPerson', 'loansToShareholders'],
    });
  });

  it('with a late starter, carries the Law 243(I)/2025 provisional rule', () => {
    const rule = TAX_RULES_CY_2026.filing.provisionalLateStarterRule;

    const after30June = rule.value.includes('30 June');

    expect({ verified: rule.verified, cites: rule.sourceIds.includes('govcy-law-243-2025'), after30June }).toEqual({ verified: true, cites: true, after30June: true });
  });

  it('with a director loan, covers indirect shareholders per the Law 244(I)/2025 slides and leaves the rate unknown', () => {
    const { directorLoanBenefitCoversIndirectShareholders: indirect, directorLoanDeemedInterestRate: rate } = TAX_RULES_CY_2026.dividends;

    const result = { indirect: indirect.value, verified: indirect.verified, cites: indirect.sourceIds.includes('govcy-slides-244-2025'), rate: rate.value };

    expect(result).toEqual({ indirect: true, verified: true, cites: true, rate: null });
  });

  it('with the pass 3-4 sources, lists each with a public https URL', () => {
    const ids = ['mlsi-central-holiday-fund', 'govcy-tax-reform-2026', 'govcy-law-243-2025', 'govcy-law-245-2025',
      'govcy-slides-243-2025', 'govcy-slides-244-2025', 'govcy-slides-245-2025', 'roc-sme', 'mondaq-reform-key-points'];

    const missing = ids.filter((id) => !(sources[id]?.url.startsWith('https://') ?? false));

    expect(missing).toEqual([]);
  });
});

describe('taxRulesFor', () => {
  it('with 2026, returns the Cyprus 2026 rule set', () => {
    const rules = taxRulesFor(2026);

    expect(rules?.jurisdiction).toBe('CY');
  });

  it('with a year that has no rule set, returns null', () => {
    const rules = taxRulesFor(2025);

    expect(rules).toBeNull();
  });
});

describe('highestCost', () => {
  it('with the holiday fund at 8% (PwC) against none (KPMG), returns 8%', () => {
    const holidayFund = TAX_RULES_CY_2026.payroll.employer.holidayFund;

    const rate = highestCost(holidayFund?.rate ?? { value: 0, verified: false, sourceIds: [] });

    expect(rate).toBe(0.08);
  });
});
