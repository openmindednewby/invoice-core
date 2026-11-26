import { describe, expect, it } from 'vitest';

import { bocXlsx } from '../testing/bankFixtures';
import { BOC_SHEET } from './bocExport';
import { readXlsxRows } from './xlsxRead';

describe('readXlsxRows', () => {
  it('with a self-closing empty row, keeps the row after it', async () => {
    const bytes = bocXlsx([['Date'], [], ['next']]);

    const rows = await readXlsxRows(bytes, BOC_SHEET);

    expect(rows).toEqual([['Date'], [], ['next']]);
  });
});
