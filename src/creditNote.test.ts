import { describe, expect, it } from 'vitest';

import { issueCreditNote } from './creditNote';
import { InvoiceKind } from './InvoiceKind';
import { issueInvoice, readInvoice } from './issue';
import { nextNumber } from './numbering';
import type { InvoiceStorage } from './storage';
import { fakePdf, makeStorage, REQUEST } from './testing/fixtures';
import { extractPdfText } from './testing/pdfText';

async function storageWithInvoice(): Promise<InvoiceStorage> {
  const storage = makeStorage();
  await issueInvoice(storage, REQUEST, { render: fakePdf });
  return storage;
}

const CREDIT = { invoiceNumber: '2030-001', date: '2030-11-01', reason: 'Billed twice' };

describe('issueCreditNote AC-15', () => {
  it('with an issued invoice, references it and takes its own number', async () => {
    const storage = await storageWithInvoice();

    const issued = await issueCreditNote(storage, CREDIT, { render: fakePdf });
    const record = await readInvoice(storage, issued.number);

    expect(issued.number).toBe('CN-2030-001');
    expect(record.kind).toBe(InvoiceKind.CreditNote);
    expect(record.creditFor).toBe('2030-001');
    expect(record.totals.netCents).toBe(123450);
    expect(await nextNumber(storage, '2030')).toBe('2030-002');
  });

  it('with a second credit note, takes the next credit number', async () => {
    const storage = await storageWithInvoice();
    await issueCreditNote(storage, { ...CREDIT, amount: '100' }, { render: fakePdf });

    const second = await issueCreditNote(storage, { ...CREDIT, amount: '100' }, { render: fakePdf });

    expect(second.number).toBe('CN-2030-002');
  });

  it('with more than the invoice has left, refuses', async () => {
    const storage = await storageWithInvoice();
    await issueCreditNote(storage, { ...CREDIT, amount: '1000' }, { render: fakePdf });

    const attempt = issueCreditNote(storage, { ...CREDIT, amount: '234.51' }, { render: fakePdf });

    await expect(attempt).rejects.toMatchObject({ errors: [{ path: 'amount' }] });
  });

  it('with an unknown invoice, refuses and names it', async () => {
    const storage = makeStorage();

    const attempt = issueCreditNote(storage, CREDIT, { render: fakePdf });

    await expect(attempt).rejects.toMatchObject({ errors: [{ path: 'invoiceNumber' }] });
  });

  it('with a credit note as the target, refuses', async () => {
    const storage = await storageWithInvoice();
    await issueCreditNote(storage, { ...CREDIT, amount: '1' }, { render: fakePdf });

    const attempt = issueCreditNote(storage, { ...CREDIT, invoiceNumber: 'CN-2030-001' }, { render: fakePdf });

    await expect(attempt).rejects.toMatchObject({ errors: [{ path: 'invoiceNumber' }] });
  });

  it('with a blank reason, refuses and names it', async () => {
    const storage = await storageWithInvoice();

    const attempt = issueCreditNote(storage, { ...CREDIT, reason: ' ' }, { render: fakePdf });

    await expect(attempt).rejects.toMatchObject({ errors: [{ path: 'reason' }] });
  });

  it('with the default render, prints the title and the referenced invoice', async () => {
    const storage = await storageWithInvoice();

    const issued = await issueCreditNote(storage, CREDIT);
    const text = await extractPdfText((await storage.readBytes(issued.pdfPath)) ?? new Uint8Array());

    expect(text).toContain('CREDIT NOTE');
    expect(text).toContain('2030-001');
    expect(text).toContain('Billed twice');
  });
});
