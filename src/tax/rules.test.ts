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

function citesPrimary(value: SourcedValue<unknown>): boolean {
  return value.sourceIds.some((id) => sources[id]?.type === SourceType.Primary);
}

describe('TAX_RULES_CY_2026', () => {
  it('with every rule value, carries its value inside a sourced value', () => {
    const bare = allLeaves.filter((leaf) => leaf.sourced === null).map((leaf) => leaf.path);

    expect(bare).toEqual([]);
  });

  it('with every sourced value, cites at least one source and only sources that exist', () => {
    const broken = sourcedLeaves.filter(({ value }) => value.sourceIds.length === 0 || value.sourceIds.some((id) => sources[id] === undefined));

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
    const cited = new Set(sourcedLeaves.flatMap(({ value }) => value.sourceIds));

    const orphans = Object.keys(sources).filter((id) => !cited.has(id));

    expect(orphans).toEqual([]);
  });

  it('with the 2026 corporate rate, is 15% and verified on gov.cy', () => {
    const rate = TAX_RULES_CY_2026.corporateIncomeTax.rate;

    const primaryIds = rate.sourceIds.filter((id) => sources[id]?.type === SourceType.Primary);

    expect({ value: rate.value, verified: rate.verified, primaryIds }).toEqual({ value: 0.15, verified: true, primaryIds: ['govcy-tf4-company-return'] });
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
