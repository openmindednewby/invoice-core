import { describe, expect, it } from 'vitest';

import { bocRows, bocXlsx, TEST_ACCOUNT } from '../testing/bankFixtures';
import { parseBocExport, parseBocRows } from './bocExport';

describe('parseBocExport', () => {
  it('with a BOC xlsx export, reads the header block from the named sheet', async () => {
    const bytes = bocXlsx();

    const statement = await parseBocExport(bytes);

    expect({ ...statement, lines: statement.lines.length }).toEqual({
      accountNumber: TEST_ACCOUNT, accountName: 'EXAMPLE TRADING LTD', accountType: 'Current account', currency: 'EUR',
      period: '01/10/2026 - 31/10/2026', periodFrom: '2026-10-01', periodTo: '2026-10-31', lines: 5, skippedRows: 0,
    });
  });

  it('with a debit row, gives negative cents, the date and value date, and the bank reference', async () => {
    const bytes = bocXlsx();

    const statement = await parseBocExport(bytes);

    expect(statement.lines[2]).toEqual({
      date: '2026-10-15', valueDate: '2026-10-15', description: '1Bank - Transfer-Internet-Debit Invoice 2026-17', type: 'BOC Transfer',
      reference: 'REF', bankReference: 'BR0000000003', branchCode: '0001', amountCents: -24010, balanceCents: 74956,
    });
  });

  it('with a credit row and no bank reference, gives positive cents and an empty reference', async () => {
    const bytes = bocXlsx();

    const statement = await parseBocExport(bytes);

    expect({ amount: statement.lines[4]?.amountCents, reference: statement.lines[4]?.bankReference }).toEqual({ amount: 99666, reference: '' });
  });

  it('with bytes that are not a zip, refuses them', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);

    const parsed = parseBocExport(bytes);

    await expect(parsed).rejects.toThrow('file: is not an xlsx file');
  });
});

const CAFE = { date: '2026-10-09', description: 'EXAMPLE CAFE LTD', type: 'Card Purchase - Local', debit: 7, credit: null, balance: 989.66, bankReference: 'BR1' };
const SHOP = { ...CAFE, date: '2026-10-08', description: 'EXAMPLE SHOP LTD', bankReference: 'BR2' };

describe('parseBocRows', () => {
  it('with rows that have no Date title row, refuses them', () => {
    const rows = [['Something else']];

    const parse = (): unknown => parseBocRows(rows);

    expect(parse).toThrow('file: is not a Bank of Cyprus statement export');
  });

  it('with text dates and text amounts, reads them as dates and cents', () => {
    const rows = bocRows([]);
    rows.push(['15/10/2026', 'Typed row', null, null, null, 'BOC Transfer', '', '1,200.50', null, '2,000.00', '16/10/2026', 'BR1', '']);

    const statement = parseBocRows(rows);

    expect(statement.lines[0]).toMatchObject({ date: '2026-10-15', valueDate: '2026-10-16', amountCents: -120050, balanceCents: 200000 });
  });

  it('with a blank row between two lines, skips it and reads both lines', () => {
    const rows = bocRows([CAFE, SHOP]);
    rows.splice(7, 0, []);

    const statement = parseBocRows(rows);

    expect({ lines: statement.lines.map((line) => line.description), skipped: statement.skippedRows }).toEqual({ lines: ['EXAMPLE CAFE LTD', 'EXAMPLE SHOP LTD'], skipped: 0 });
  });

  it('with a row that has an amount but no readable date, skips it, counts it and reads the next line', () => {
    const rows = bocRows([CAFE, SHOP]);
    rows.splice(7, 0, ['not a date', 'Garbled row', null, null, null, 'BOC Transfer', '', 5, null, 100, null, 'BR9', '']);

    const statement = parseBocRows(rows);

    expect({ lines: statement.lines.length, skipped: statement.skippedRows }).toEqual({ lines: 2, skipped: 1 });
  });

  it('with a footer row of text and no amount, stops there even when a dated row follows', () => {
    const rows = bocRows([CAFE]);
    rows.push(['Printed by 1bank', null], ...bocRows([SHOP]).slice(6));

    const statement = parseBocRows(rows);

    expect({ lines: statement.lines.map((line) => line.description), skipped: statement.skippedRows }).toEqual({ lines: ['EXAMPLE CAFE LTD'], skipped: 0 });
  });

  it('with both a 5.00 debit and a 7.00 credit on one row, gives the net +200 cents', () => {
    const rows = bocRows([{ ...CAFE, debit: 5, credit: 7 }]);

    const statement = parseBocRows(rows);

    expect(statement.lines[0]?.amountCents).toBe(200);
  });

  it('with a Period of "Last 12 Months", keeps it as the label and takes the period from the first and last line dates', () => {
    const rows = bocRows([CAFE, SHOP], 'Last 12 Months');

    const statement = parseBocRows(rows);

    expect({ period: statement.period, from: statement.periodFrom, to: statement.periodTo }).toEqual({ period: 'Last 12 Months', from: '2026-10-08', to: '2026-10-09' });
  });

  it('with a blank row after the lines, stops there', () => {
    const rows = bocRows();
    rows.push([], ['Total', null, null]);

    const statement = parseBocRows(rows);

    expect(statement.lines).toHaveLength(5);
  });
});
