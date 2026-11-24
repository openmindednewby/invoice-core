import { crc32, createZip } from '@dloizides/utils/zip';

import { describe, expect, it } from 'vitest';

import { createMemoryStorage } from '../memoryStorage';
import { FILED_BILL_JSON, PDF_BYTES, readZipNames } from '../testing/billFixtures';
import { billsCsv, exportBillsZip, exportBillZip } from './billExport';
import { listBills } from './billFolder';
import { addProof } from './billProof';

const DIR = 'bills/2026/example-26223';

async function filedWithProof(): Promise<ReturnType<typeof createMemoryStorage>> {
  const storage = createMemoryStorage({ [`${DIR}/bill.json`]: FILED_BILL_JSON, [`${DIR}/bill.pdf`]: PDF_BYTES });
  await addProof(storage, DIR, [{ name: 'transfer.pdf', bytes: PDF_BYTES }], '2026-11-20');
  return storage;
}

describe('billsCsv', () => {
  it('with a filed paid bill, writes one row with the VAT split', async () => {
    const storage = await filedWithProof();
    const { bills } = await listBills(storage);

    const csv = billsCsv(bills);

    expect(csv.split('\r\n').slice(0, 2)).toEqual([
      '﻿supplier,supplier_vat,number,issue_date,due_date,currency,net,vat,not_subject_to_vat,total,status,paid_on,proofs',
      'Example Supplier (A. Person),10000001X,26223,2026-11-02,,EUR,200.00,38.00,606.00,844.00,paid,2026-11-20,1',
    ]);
  });
});

describe('exportBillZip', () => {
  it('with one bill, zips the bill PDF, bill.json and its proofs', async () => {
    const storage = await filedWithProof();

    const { fileName, bytes } = await exportBillZip(storage, DIR);

    expect({ fileName, names: readZipNames(bytes) }).toEqual({
      fileName: 'bill-example-26223.zip',
      names: ['example-26223/bill.pdf', 'example-26223/bill.json', 'example-26223/proof/transfer.pdf'],
    });
  });
});

describe('exportBillsZip', () => {
  it('with a range holding the bill, zips every bill with proofs and a CSV summary', async () => {
    const storage = await filedWithProof();

    const result = await exportBillsZip(storage, '2026-10-01', '2026-12-31');

    expect({ fileName: result.fileName, count: result.count, names: readZipNames(result.bytes) }).toEqual({
      fileName: 'bills-2026-10-01-to-2026-12-31.zip',
      count: 1,
      names: ['bills-2026-10-01-to-2026-12-31.csv', '2026/example-26223/bill.pdf', '2026/example-26223/bill.json', '2026/example-26223/proof/transfer.pdf'],
    });
  });

  it('with a range outside every bill, zips only the CSV', async () => {
    const storage = await filedWithProof();

    const result = await exportBillsZip(storage, '2025-01-01', '2025-03-31');

    expect({ count: result.count, names: readZipNames(result.bytes) }).toEqual({ count: 0, names: ['bills-2025-01-01-to-2025-03-31.csv'] });
  });

  it('with from after to, refuses', async () => {
    const storage = await filedWithProof();

    const exporting = exportBillsZip(storage, '2026-12-31', '2026-01-01');

    await expect(exporting).rejects.toMatchObject({ errors: [expect.objectContaining({ path: 'from' })] });
  });
});

describe('crc32', () => {
  it('with "hello", returns the standard checksum', () => {
    const bytes = new TextEncoder().encode('hello');

    const crc = crc32(bytes);

    expect(crc).toBe(0x3610a686);
  });
});

describe('createZip', () => {
  it('with two files, writes both names in order with an end record', () => {
    const entries = [{ path: 'a.txt', bytes: new TextEncoder().encode('a') }, { path: 'Φ/b.txt', bytes: new Uint8Array([1, 2]) }];

    const bytes = createZip(entries);

    expect(readZipNames(bytes)).toEqual(['a.txt', 'Φ/b.txt']);
  });
});
