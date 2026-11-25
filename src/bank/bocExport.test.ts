import { describe, expect, it } from 'vitest';

import { bocRows, bocXlsx, TEST_ACCOUNT } from '../testing/bankFixtures';
import { parseBocExport, parseBocRows } from './bocExport';

describe('parseBocExport', () => {
  it('with a BOC xlsx export, reads the header block from the named sheet', async () => {
    const bytes = bocXlsx();

    const statement = await parseBocExport(bytes);

    expect({ ...statement, lines: statement.lines.length }).toEqual({
      accountNumber: TEST_ACCOUNT, accountName: 'EXAMPLE TRADING LTD', accountType: 'Current account', currency: 'EUR',
      period: '01/10/2026 - 31/10/2026', periodFrom: '2026-10-01', periodTo: '2026-10-31', lines: 5,
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

  it('with a blank row after the lines, stops there', () => {
    const rows = bocRows();
    rows.push([], ['Total', null, null]);

    const statement = parseBocRows(rows);

    expect(statement.lines).toHaveLength(5);
  });
});
