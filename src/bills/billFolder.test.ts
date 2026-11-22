import { describe, expect, it } from 'vitest';

import { createMemoryStorage } from '../memoryStorage';
import { FILED_BILL_JSON, PDF_BYTES } from '../testing/billFixtures';
import { BillStatus } from './BillStatus';
import { addBill, billDir, listBills, readBill } from './billFolder';
import { vatSplitMissing } from './billFile';
import type { BillInput } from './billFile';

const FILED_DIR = 'bills/2026/example-26223';

function input(overrides: Partial<BillInput> = {}): BillInput {
  return {
    supplier: 'Example Supplier', supplierVat: '10000001X', number: '26300', issueDate: '2026-11-10', dueDate: '2026-11-30', currency: 'EUR',
    netCents: 10000, vatCents: 1900, notSubjectToVatCents: 0, totalCents: 11900,
    payTo: { bank: 'Example Bank', iban: 'CY17002001280000001200527600', swift: 'EXBKCY2N' }, ...overrides,
  };
}

describe('listBills', () => {
  it('with a bill filed by hand, reads it without re-entry', async () => {
    const storage = createMemoryStorage({ [`${FILED_DIR}/bill.json`]: FILED_BILL_JSON, [`${FILED_DIR}/bill.pdf`]: PDF_BYTES });

    const { bills } = await listBills(storage);

    expect(bills).toEqual([expect.objectContaining({
      dir: FILED_DIR, number: '26223', issueDate: '2026-11-02', dueDate: null, totalCents: 84400, netCents: 20000, vatCents: 3800,
      notSubjectToVatCents: 60600, status: BillStatus.Unpaid, proofFiles: [],
    })]);
  });

  it('with a malformed bill.json, lists it as broken and keeps the others', async () => {
    const storage = createMemoryStorage({ [`${FILED_DIR}/bill.json`]: FILED_BILL_JSON, 'bills/2026/bad-1/bill.json': '{ nope' });

    const result = await listBills(storage);

    expect({ count: result.bills.length, broken: result.broken }).toEqual({ count: 1, broken: ['bills/2026/bad-1'] });
  });

  it('with no bills folder, returns an empty list', async () => {
    const storage = createMemoryStorage();

    const result = await listBills(storage);

    expect(result).toEqual({ bills: [], broken: [] });
  });
});

describe('addBill', () => {
  it('with a confirmed input, copies the PDF and writes bill.json in the layout', async () => {
    const storage = createMemoryStorage();

    const bill = await addBill(storage, PDF_BYTES, input());

    expect({ dir: bill.dir, pdf: await storage.readBytes(`${bill.dir}/bill.pdf`), read: await readBill(storage, bill.dir) })
      .toEqual({ dir: 'bills/2026/example-26300', pdf: PDF_BYTES, read: bill });
  });

  it('with parts that do not add up to the total, refuses', async () => {
    const storage = createMemoryStorage();

    const adding = addBill(storage, PDF_BYTES, input({ totalCents: 12000 }));

    await expect(adding).rejects.toMatchObject({ errors: [expect.objectContaining({ path: 'total' })] });
  });

  it('with only the total entered, saves the bill flagged VAT split missing', async () => {
    const storage = createMemoryStorage();

    const bill = await addBill(storage, PDF_BYTES, input({ netCents: 0, vatCents: 0, totalCents: 11900 }));

    expect({ total: (await readBill(storage, bill.dir)).totalCents, missing: vatSplitMissing(bill) }).toEqual({ total: 11900, missing: true });
  });

  it('with the same supplier and number filed already, refuses', async () => {
    const storage = createMemoryStorage();
    await addBill(storage, PDF_BYTES, input());

    const adding = addBill(storage, new TextEncoder().encode('other'), input());

    await expect(adding).rejects.toMatchObject({ errors: [expect.objectContaining({ path: 'number' })] });
  });

  it('with no due date, saves the bill with a null due date', async () => {
    const storage = createMemoryStorage();

    const bill = await addBill(storage, PDF_BYTES, input({ dueDate: null }));

    expect(bill.dueDate).toBeNull();
  });
});

describe('billDir', () => {
  it('with a supplier name with brackets, uses the first word as slug', () => {
    const name = 'Example (A. Person)';

    const dir = billDir(name, '26223', '2026-11-02');

    expect(dir).toBe(FILED_DIR);
  });
});

describe('vatSplitMissing', () => {
  it('with net and VAT entered, returns false', () => {
    const bill = input({ netCents: 10000, vatCents: 1900, totalCents: 11900 });

    const missing = vatSplitMissing(bill);

    expect(missing).toBe(false);
  });

  it('with only not subject to VAT entered, returns false', () => {
    const bill = input({ netCents: 0, vatCents: 0, notSubjectToVatCents: 11900, totalCents: 11900 });

    const missing = vatSplitMissing(bill);

    expect(missing).toBe(false);
  });
});
