import { describe, expect, it } from 'vitest';

import { issueInvoice, listIssued, readInvoice } from './issue';
import { editScheduleMonth, issueDueMonths, prepareYearSchedule, readSchedule } from './schedule';
import { fakePdf, makeStorage, REQUEST } from './testing/fixtures';

const PREPARE = { clientId: 'acme', year: '2030', monthlyAmount: '1000' };

describe('prepareYearSchedule AC-18', () => {
  it('with a client and a monthly amount, prepares 12 drafts with no numbers', async () => {
    const storage = makeStorage();

    const schedule = await prepareYearSchedule(storage, PREPARE);

    expect(schedule.months.map((month) => month.period)).toEqual(Array.from({ length: 12 }, (_, i) => `2030-${String(i + 1).padStart(2, '0')}`));
    expect(schedule.months.every((month) => month.number === null)).toBe(true);
    expect(schedule.months[0]?.lines[0]?.amount).toBe('1000');
    expect(schedule.months[0]?.lines[0]?.description).toBe('Υπηρεσίες για τον μήνα Ιανουάριο 2030');
    expect(await listIssued(storage, '2030')).toEqual([]);
  });

  it('with the same client and year twice, refuses and keeps the first', async () => {
    const storage = makeStorage();
    await prepareYearSchedule(storage, PREPARE);

    const attempt = prepareYearSchedule(storage, { ...PREPARE, monthlyAmount: '5' });

    await expect(attempt).rejects.toMatchObject({ errors: [{ path: 'schedule' }] });
    expect((await readSchedule(storage, 'acme-2030')).months[0]?.lines[0]?.amount).toBe('1000');
  });

  it('with a bad amount, refuses and names it', async () => {
    const storage = makeStorage();

    const attempt = prepareYearSchedule(storage, { ...PREPARE, monthlyAmount: 'abc' });

    await expect(attempt).rejects.toMatchObject({ errors: [{ path: 'monthlyAmount' }] });
  });
});

describe('editScheduleMonth AC-19', () => {
  it('with a draft month, saves the new lines', async () => {
    const storage = makeStorage();
    await prepareYearSchedule(storage, PREPARE);

    await editScheduleMonth(storage, 'acme-2030', '2030-03', [{ description: 'March work', amount: '1500' }]);

    expect((await readSchedule(storage, 'acme-2030')).months[2]?.lines).toEqual([{ description: 'March work', amount: '1500' }]);
  });

  it('with an issued month, refuses and names the month', async () => {
    const storage = makeStorage();
    await prepareYearSchedule(storage, PREPARE);
    await issueDueMonths(storage, 'acme-2030', { today: '2030-02-05', render: fakePdf });

    const attempt = editScheduleMonth(storage, 'acme-2030', '2030-01', [{ description: 'Late edit', amount: '1' }]);

    await expect(attempt).rejects.toMatchObject({ errors: [{ path: 'months.2030-01' }] });
  });
});

describe('issueDueMonths AC-20', () => {
  it('with a fixed clock, issues only finished months, in order, each with its number and date', async () => {
    const storage = makeStorage();
    await prepareYearSchedule(storage, PREPARE);

    const result = await issueDueMonths(storage, 'acme-2030', { today: '2030-04-05', render: fakePdf });
    const records = await Promise.all(result.issued.map((entry) => readInvoice(storage, entry.number)));

    expect(result.issued).toEqual([
      { period: '2030-01', number: '2030-001' },
      { period: '2030-02', number: '2030-002' },
      { period: '2030-03', number: '2030-003' },
    ]);
    expect(records.map((record) => record.request.period)).toEqual(['2030-01', '2030-02', '2030-03']);
    expect(records.every((record) => record.request.date === '2030-04-05')).toBe(true);
    expect(result.failed).toBeNull();
    expect((await readSchedule(storage, 'acme-2030')).months[3]?.number).toBeNull();
  });

  it('on the last day of a month, leaves that month as a draft', async () => {
    const storage = makeStorage();
    await prepareYearSchedule(storage, PREPARE);

    const result = await issueDueMonths(storage, 'acme-2030', { today: '2030-01-31', render: fakePdf });

    expect(result.issued).toEqual([]);
  });

  it('run twice, issues nothing the second time', async () => {
    const storage = makeStorage();
    await prepareYearSchedule(storage, PREPARE);
    await issueDueMonths(storage, 'acme-2030', { today: '2030-03-01', render: fakePdf });

    const again = await issueDueMonths(storage, 'acme-2030', { today: '2030-03-01', render: fakePdf });

    expect(again.issued).toEqual([]);
  });

  it('with other invoices already issued, continues the same gap-free sequence', async () => {
    const storage = makeStorage();
    await issueInvoice(storage, { ...REQUEST, date: '2030-01-10' }, { render: fakePdf });
    await prepareYearSchedule(storage, PREPARE);

    const result = await issueDueMonths(storage, 'acme-2030', { today: '2030-02-05', render: fakePdf });

    expect(result.issued).toEqual([{ period: '2030-01', number: '2030-002' }]);
  });
});

describe('issueDueMonths AC-21', () => {
  it('with a failure midway, keeps finished ones issued and the rest drafts', async () => {
    const storage = makeStorage();
    await prepareYearSchedule(storage, PREPARE);
    let renders = 0;
    const flaky = (): Promise<Uint8Array> => {
      renders += 1;
      return renders === 2 ? Promise.reject(new Error('disk full')) : fakePdf();
    };

    const result = await issueDueMonths(storage, 'acme-2030', { today: '2030-05-01', render: flaky });
    const schedule = await readSchedule(storage, 'acme-2030');

    expect(result.issued).toEqual([{ period: '2030-01', number: '2030-001' }]);
    expect(result.failed?.period).toBe('2030-02');
    expect(result.failed?.errors[0]?.message).toContain('disk full');
    expect(result.remaining).toEqual(['2030-02', '2030-03', '2030-04']);
    expect(schedule.months.slice(0, 4).map((month) => month.number)).toEqual(['2030-001', null, null, null]);
  });

  it('after a crash before the schedule was saved, does not issue the month twice', async () => {
    const storage = makeStorage();
    await prepareYearSchedule(storage, PREPARE);
    const lines = (await readSchedule(storage, 'acme-2030')).months[0]?.lines ?? [];
    const request = { clientId: 'acme', period: '2030-01', date: '2030-02-05', amounts: [], lines, draft: false };
    await issueInvoice(storage, request, { render: fakePdf, schedule: { id: 'acme-2030', period: '2030-01' } });

    const result = await issueDueMonths(storage, 'acme-2030', { today: '2030-02-05', render: fakePdf });

    expect(result.issued).toEqual([]);
    expect((await readSchedule(storage, 'acme-2030')).months[0]?.number).toBe('2030-001');
    expect(await listIssued(storage, '2030')).toHaveLength(1);
  });
});
