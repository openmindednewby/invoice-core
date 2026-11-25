import { describe, expect, it } from 'vitest';

import { createMemoryStorage } from '../memoryStorage';
import { bocRows, bocXlsx, FIXTURE_LINES, TEST_ACCOUNT } from '../testing/bankFixtures';
import { parseBocRows } from './bocExport';
import { importStatement, lineKey, readLedger } from './importLedger';

const OPTIONS = { fileName: 'TransactionHistory_x.xlsx', bytes: bocXlsx(), directors: [] };

describe('lineKey', () => {
  it('with a bank reference, is the account plus the reference', () => {
    const line = parseBocRows(bocRows()).lines[0];

    const key = line === undefined ? '' : lineKey(TEST_ACCOUNT, line);

    expect(key).toBe(`${TEST_ACCOUNT}:BR0000000005`);
  });

  it('with no bank reference, is the account plus a hash of date, amount, description and balance', () => {
    const lines = parseBocRows(bocRows()).lines;
    const first = lines[4];
    const changed = first === undefined ? undefined : { ...first, balanceCents: 1 };

    const keys = [first, changed].map((line) => (line === undefined ? '' : lineKey(TEST_ACCOUNT, line)));

    expect({ shape: /^000000000000:h[0-9a-f]{8}$/.test(keys[0] ?? ''), differ: keys[0] !== keys[1] }).toEqual({ shape: true, differ: true });
  });
});

describe('importStatement', () => {
  it('with a first import, adds every line and keeps the original file', async () => {
    const storage = createMemoryStorage();

    const result = await importStatement(storage, parseBocRows(bocRows()), OPTIONS);

    expect({ added: result.added, already: result.alreadyImported, file: result.statementFile, kept: await storage.readBytes(result.statementFile) })
      .toEqual({ added: 5, already: 0, file: `bank/statements/${TEST_ACCOUNT}/2026-10-01_2026-10-31.xlsx`, kept: OPTIONS.bytes });
  });

  it('with the same statement twice, adds nothing the second time', async () => {
    const storage = createMemoryStorage();
    await importStatement(storage, parseBocRows(bocRows()), OPTIONS);

    const again = await importStatement(storage, parseBocRows(bocRows()), OPTIONS);

    expect({ added: again.added, already: again.alreadyImported, stored: (await readLedger(storage, TEST_ACCOUNT)).length })
      .toEqual({ added: 0, already: 5, stored: 5 });
  });

  it('with an overlapping period, merges the new lines and keeps the newest first', async () => {
    const storage = createMemoryStorage();
    await importStatement(storage, parseBocRows(bocRows(FIXTURE_LINES.slice(2))), OPTIONS);
    const newer = { date: '2026-11-03', description: 'Transfer 000333 from SAMPLE CLIENT LTD>nov', type: 'BOC Transfer', debit: null, credit: 10, balance: 1244.56, bankReference: 'BR0000000006' };

    const result = await importStatement(storage, parseBocRows(bocRows([newer, ...FIXTURE_LINES], '01/10/2026 - 05/11/2026')), OPTIONS);

    expect({ added: result.added, already: result.alreadyImported, dates: (await readLedger(storage, TEST_ACCOUNT)).map((line) => line.date) })
      .toEqual({ added: 3, already: 3, dates: ['2026-11-03', '2026-10-30', '2026-10-21', '2026-10-15', '2026-10-09', '2026-10-02'] });
  });

  it('with two lines of one bank reference in one statement, keeps both and stays idempotent', async () => {
    const storage = createMemoryStorage();
    const twin = { ...FIXTURE_LINES[0], bankReference: 'BR0000000002' } as (typeof FIXTURE_LINES)[number];
    const statement = parseBocRows(bocRows([twin, ...FIXTURE_LINES.slice(1)]));
    await importStatement(storage, statement, OPTIONS);

    const again = await importStatement(storage, statement, OPTIONS);

    expect({ stored: (await readLedger(storage, TEST_ACCOUNT)).length, added: again.added }).toEqual({ stored: 5, added: 0 });
  });

  it('with a fresh import, sorts each new line into a kind', async () => {
    const storage = createMemoryStorage();

    const result = await importStatement(storage, parseBocRows(bocRows()), OPTIONS);

    expect(result.lines.map((line) => line.kind)).toEqual(['bank-fee', 'to-review', 'expense', 'expense', 'to-review']);
  });
});
