import { describe, expect, it } from 'vitest';

import { DEFAULT_EXPENSE_CATEGORIES } from '../expenses/categories';
import { createMemoryStorage } from '../memoryStorage';
import { bocRows, bocXlsx, TEST_ACCOUNT } from '../testing/bankFixtures';
import { parseBocRows } from './bocExport';
import { setLineKind } from './classify';
import { importStatement, readLedger } from './importLedger';
import { LineKind } from './LineKind';
import { bankProofPack } from './proofPack';

describe('bankProofPack', () => {
  it('with an imported month, gives the CSV oldest first with kind, category, amount, proof or MISSING and the statement file', async () => {
    const storage = createMemoryStorage();
    const result = await importStatement(storage, parseBocRows(bocRows()), { fileName: 'TransactionHistory_x.xlsx', bytes: bocXlsx(), directors: [] });
    await setLineKind(storage, { account: TEST_ACCOUNT, key: result.lines[3]?.key ?? '' }, LineKind.Expense, 'meals-and-entertainment');
    const statement = `bank/statements/${TEST_ACCOUNT}/2026-10-01_2026-10-31.xlsx`;

    const pack = bankProofPack(await readLedger(storage, TEST_ACCOUNT), '2026-10', [...DEFAULT_EXPENSE_CATEGORIES]);

    expect({ ...pack, csv: pack.csv.split('\r\n') }).toEqual({
      fileName: 'bank-proof-2026-10.csv', lineCount: 5, missingCount: 2, statementFiles: [statement],
      csv: [
        '﻿date,description,kind,category,amount,proof,statement',
        `2026-10-02,Transfer 000222 from SAMPLE CLIENT LTD>payment,to-review,,996.66,,${statement}`,
        `2026-10-09,EXAMPLE CAFE LTD PURCHASE CY Card 4***0000 09/10/26 7.00 EUR Auth 000001 Trace 000002,expense,Meals and entertainment,-7.00,MISSING,${statement}`,
        `2026-10-15,1Bank - Transfer-Internet-Debit Invoice 2026-17,expense,,-240.10,MISSING,${statement}`,
        `2026-10-21,Transfer 000111 from JANE EXAMPLE>capital top up,to-review,,500.00,,${statement}`,
        `2026-10-30,CARD MEMBERSHIP FEE 4***0000,bank-fee,bank-charges,-15.00,,${statement}`,
        '',
      ],
    });
  });

  it('with a month that has no lines, gives only the header and no statement', () => {
    const lines: never[] = [];

    const pack = bankProofPack(lines, '2026-01', []);

    expect({ csv: pack.csv, files: pack.statementFiles, count: pack.lineCount }).toEqual({ csv: '﻿date,description,kind,category,amount,proof,statement\r\n', files: [], count: 0 });
  });
});
