import { describe, expect, it } from 'vitest';

import { createMemoryStorage } from '../memoryStorage';
import { FILED_BILL_JSON } from '../testing/billFixtures';
import { BillStatus } from './BillStatus';
import { readBill } from './billFolder';
import { addProof, markBillPaid, markBillUnpaid } from './billProof';

const DIR = 'bills/2026/example-26223';
const PNG = new Uint8Array([137, 80, 78, 71]);

function filed(): ReturnType<typeof createMemoryStorage> {
  return createMemoryStorage({ [`${DIR}/bill.json`]: FILED_BILL_JSON });
}

describe('addProof', () => {
  it('with a pasted screenshot and a paid-on date, copies it into proof/ and marks the bill paid', async () => {
    const storage = filed();

    const bill = await addProof(storage, DIR, [{ name: 'image.png', bytes: PNG }], '2026-11-20');

    expect({ status: bill.status, paidOn: bill.paidOn, proofFiles: bill.proofFiles, stored: await storage.readBytes(`${DIR}/proof/image.png`) })
      .toEqual({ status: BillStatus.Paid, paidOn: '2026-11-20', proofFiles: ['image.png'], stored: PNG });
  });

  it('with a second file of the same name, keeps both and never overwrites the first', async () => {
    const storage = filed();
    await addProof(storage, DIR, [{ name: 'image.png', bytes: PNG }], null);

    const bill = await addProof(storage, DIR, [{ name: 'image.png', bytes: new Uint8Array([1]) }], null);

    expect({ files: bill.proofFiles, first: await storage.readBytes(`${DIR}/proof/image.png`) }).toEqual({ files: ['image.png', 'image-2.png'], first: PNG });
  });

  it('with an unsupported file type, refuses and stores nothing', async () => {
    const storage = filed();

    const adding = addProof(storage, DIR, [{ name: 'notes.docx', bytes: PNG }], null);

    await expect(adding).rejects.toMatchObject({ errors: [expect.objectContaining({ path: 'proof' })] });
    expect(await storage.list(`${DIR}/proof`)).toEqual([]);
  });

  it('with no paid-on date, keeps the bill unpaid', async () => {
    const storage = filed();

    const bill = await addProof(storage, DIR, [{ name: 'transfer.PDF', bytes: PNG }], null);

    expect({ status: bill.status, files: bill.proofFiles }).toEqual({ status: BillStatus.Unpaid, files: ['transfer.PDF'] });
  });

  it('with extra fields in bill.json, keeps them on save', async () => {
    const storage = filed();

    await addProof(storage, DIR, [{ name: 'a.jpg', bytes: PNG }], null);

    expect(JSON.parse((await storage.readText(`${DIR}/bill.json`)) ?? '{}')).toMatchObject({ supplierTic: '12000001T', total: 844 });
  });
});

describe('markBillPaid', () => {
  it('with a date before the issue date, refuses', async () => {
    const storage = filed();

    const marking = markBillPaid(storage, DIR, '2026-11-01');

    await expect(marking).rejects.toMatchObject({ errors: [expect.objectContaining({ path: 'paidOn' })] });
  });
});

describe('markBillUnpaid', () => {
  it('with a paid bill, clears the paid-on date', async () => {
    const storage = filed();
    await markBillPaid(storage, DIR, '2026-11-03');

    await markBillUnpaid(storage, DIR);

    expect(await readBill(storage, DIR)).toMatchObject({ status: BillStatus.Unpaid, paidOn: null });
  });
});
