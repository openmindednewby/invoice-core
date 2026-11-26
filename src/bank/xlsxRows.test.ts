import { createZip } from '@dloizides/utils/zip';
import { describe, expect, it } from 'vitest';

import { bocXlsx } from '../testing/bankFixtures';
import { InvoiceError } from '../types';
import { BOC_SHEET } from './bocExport';
import { readXlsxRows } from './xlsxRows';

describe('readXlsxRows', () => {
  it('with bytes that are not an xlsx file, throws an InvoiceError on the file path', async () => {
    const bytes = new TextEncoder().encode('not a zip');

    const read = readXlsxRows(bytes, BOC_SHEET);

    await expect(read).rejects.toEqual(new InvoiceError([{ path: 'file', message: 'is not an xlsx file' }]));
  });

  it('with a zip that holds no sheet, throws an InvoiceError', async () => {
    const bytes = createZip([{ path: 'notes.txt', bytes: new TextEncoder().encode('no workbook') }]);

    const read = readXlsxRows(bytes, BOC_SHEET);

    await expect(read).rejects.toBeInstanceOf(InvoiceError);
  });

  it('with an error that is not a file format error, passes it through unchanged', async () => {
    const bytes = null as unknown as Uint8Array;

    const read = readXlsxRows(bytes, BOC_SHEET);

    await expect(read).rejects.toBeInstanceOf(TypeError);
  });

  it('with a BOC xlsx export, returns the rows of the named sheet', async () => {
    const bytes = bocXlsx();

    const rows = await readXlsxRows(bytes, BOC_SHEET);

    expect(rows.length).toBeGreaterThan(0);
  });
});
