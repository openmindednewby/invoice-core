import { describe, expect, it } from 'vitest';

import { AmountBasis } from './AmountBasis';
import { listIssued } from './issue';
import { issueDueMonths, prepareYearSchedule, readSchedule } from './schedule';
import { planPeriods, prepareSchedulePlan } from './schedulePlan';
import { fakePdf, makeStorage } from './testing/fixtures';

const PLAN = { clientId: 'acme', from: '2030-11', until: '2031-02', monthlyAmount: '1000', basis: AmountBasis.BeforeVat };

describe('planPeriods', () => {
  it('with a range crossing a year end, lists every month in order', () => {
    const from = '2030-11';

    const periods = planPeriods(from, '2031-02');

    expect(periods).toEqual(['2030-11', '2030-12', '2031-01', '2031-02']);
  });
});

describe('prepareSchedulePlan AC2', () => {
  it('with a plan crossing a year end, prepares one unnumbered draft per month', async () => {
    const storage = makeStorage();

    const schedule = await prepareSchedulePlan(storage, PLAN);

    expect(schedule.months.map((month) => month.period)).toEqual(['2030-11', '2030-12', '2031-01', '2031-02']);
    expect(schedule.months.every((month) => month.number === null)).toBe(true);
  });

  it('with months held by a yearly schedule and by caller drafts, skips them', async () => {
    const storage = makeStorage();
    await prepareYearSchedule(storage, { clientId: 'acme', year: '2030', monthlyAmount: '5' });

    const schedule = await prepareSchedulePlan(storage, { ...PLAN, taken: ['2031-01'] });

    expect(schedule.months.map((month) => month.period)).toEqual(['2031-02']);
  });

  it('with an until before the from, refuses and names until', async () => {
    const storage = makeStorage();

    const attempt = prepareSchedulePlan(storage, { ...PLAN, until: '2030-10' });

    await expect(attempt).rejects.toMatchObject({ errors: [{ path: 'until' }] });
  });
});

describe('prepareSchedulePlan AC3', () => {
  it('with a new amount after a month is issued, changes only the drafts', async () => {
    const storage = makeStorage();
    await prepareSchedulePlan(storage, PLAN);
    await issueDueMonths(storage, 'acme-plan', { today: '2030-12-05', render: fakePdf });

    const schedule = await prepareSchedulePlan(storage, { ...PLAN, monthlyAmount: '1200' });

    expect(schedule.months.map((month) => [month.period, month.number !== null, month.lines[0]?.amount])).toEqual([
      ['2030-11', true, '1000'], ['2030-12', false, '1200'], ['2031-01', false, '1200'], ['2031-02', false, '1200'],
    ]);
  });
});

describe('issueDueMonths AC4', () => {
  it('with a plan across a year end, issues finished months in order', async () => {
    const storage = makeStorage();
    await prepareSchedulePlan(storage, PLAN);

    const result = await issueDueMonths(storage, 'acme-plan', { today: '2031-01-10', render: fakePdf });

    expect(result.issued.map((entry) => entry.period)).toEqual(['2030-11', '2030-12']);
    expect(result.failed).toBeNull();
  });
});

describe('prepareSchedulePlan AC5', () => {
  it('with an earlier end month, saves the plan and drops drafts after the end', async () => {
    const storage = makeStorage();
    await prepareSchedulePlan(storage, PLAN);

    await prepareSchedulePlan(storage, { ...PLAN, until: '2030-12' });

    const saved = await readSchedule(storage, 'acme-plan');
    expect(saved.plan).toEqual({ from: '2030-11', until: '2030-12', monthlyAmount: '1000', basis: AmountBasis.BeforeVat });
    expect(saved.months.map((month) => month.period)).toEqual(['2030-11', '2030-12']);
  });
});

describe('issueDueMonths AC7', () => {
  it('with a VAT-included plan, issues an invoice whose total is the entered amount', async () => {
    const storage = makeStorage();
    await prepareSchedulePlan(storage, { ...PLAN, monthlyAmount: '5166.67', basis: AmountBasis.VatIncluded });

    await issueDueMonths(storage, 'acme-plan', { today: '2030-12-05', render: fakePdf });

    const [record] = await listIssued(storage, '2030');
    expect(record?.totals.totalCents).toBe(516667);
    expect((record?.totals.netCents ?? 0) + (record?.totals.vatCents ?? 0)).toBe(516667);
  });
});

describe('readSchedule N7', () => {
  it('with a yearly schedule stored before plans, reads it as a Jan-Dec plan before VAT', async () => {
    const storage = makeStorage();
    await storage.replace('schedules/acme-2030.json', JSON.stringify({ id: 'acme-2030', clientId: 'acme', year: '2030', months: [{ period: '2030-01', lines: [{ description: 'x', amount: '900' }], number: null, issuedOn: null }] }));

    const schedule = await readSchedule(storage, 'acme-2030');

    expect(schedule.plan).toEqual({ from: '2030-01', until: '2030-12', monthlyAmount: '900', basis: AmountBasis.BeforeVat });
    expect(schedule.months).toHaveLength(1);
  });
});
