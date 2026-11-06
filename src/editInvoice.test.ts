import { describe, expect, it } from 'vitest';

import { findFolderConflicts } from './conflicts';
import { issueCreditNote } from './creditNote';
import { editInvoice } from './editInvoice';
import type { InvoiceChanges } from './editInvoice';
import { isEdited, readEditLog } from './editLog';
import { isInvoiceSentError } from './InvoiceSentError';
import { issueInvoice, readInvoice } from './issue';
import { markSent } from './sentStatus';
import type { InvoiceStorage } from './storage';
import { fakePdf, makeStorage, REQUEST } from './testing/fixtures';

const PDF_PATH = 'invoices/2030/2030-001/2030-001.pdf';
const RECORD_PATH = 'invoices/2030/2030-001/invoice.json';
const EDIT_TIME = new Date('2030-10-09T10:00:00.000Z');

function pdfOf(text: string): () => Promise<Uint8Array> {
  return () => Promise.resolve(new TextEncoder().encode(text));
}

async function pdfText(storage: InvoiceStorage): Promise<string> {
  return new TextDecoder().decode((await storage.readBytes(PDF_PATH)) ?? new Uint8Array());
}

async function issued(): Promise<InvoiceStorage> {
  const storage = makeStorage();
  await issueInvoice(storage, { ...REQUEST, date: '2030-10-08', amounts: ['100.00'] }, { render: fakePdf });
  return storage;
}

describe('editInvoice AC-ED-2', () => {
  it('with new amounts, keeps the number and replaces the record and PDF in place', async () => {
    const storage = await issued();

    const edited = await editInvoice(storage, '2030-001', { amounts: ['200.00'] }, { render: pdfOf('%PDF-edited'), now: () => EDIT_TIME });

    const record = await readInvoice(storage, '2030-001');
    expect(edited.number).toBe('2030-001');
    expect(edited.changed).toEqual(['amounts']);
    expect(record.request.amounts).toEqual(['200.00']);
    expect(record.totals.netCents).toBe(20000);
    expect(await pdfText(storage)).toBe('%PDF-edited');
  });

  it('with changes equal to the record, writes nothing', async () => {
    const storage = await issued();

    const edited = await editInvoice(storage, '2030-001', { amounts: ['100.00'] }, { render: pdfOf('%PDF-edited'), now: () => EDIT_TIME });

    expect(edited.changed).toEqual([]);
    expect(await pdfText(storage)).toBe('%PDF-fake');
    expect(await readEditLog(storage, '2030-001')).toEqual([]);
  });

  it('with a PDF that fails to save, names reprint', async () => {
    const storage = await issued();
    const replace = storage.replace.bind(storage);
    storage.replace = (path, data): Promise<void> => (path === PDF_PATH ? Promise.reject(new Error('disk')) : replace(path, data));

    const edit = editInvoice(storage, '2030-001', { amounts: ['200.00'] }, { render: fakePdf });

    await expect(edit).rejects.toThrow('reprint --number 2030-001');
  });
});

describe('editInvoice AC-ED-3', () => {
  it('with a number change, refuses by path', async () => {
    const storage = await issued();
    const changes = { number: '2030-009' } as unknown as InvoiceChanges;

    const edit = editInvoice(storage, '2030-001', changes, { render: fakePdf });

    await expect(edit).rejects.toThrow('number: cannot be edited');
  });

  it('with a date in another year, refuses', async () => {
    const storage = await issued();

    const edit = editInvoice(storage, '2030-001', { date: '2031-01-02' }, { render: fakePdf });

    await expect(edit).rejects.toThrow('date: must stay in 2030');
  });

  it('with a credit note against the invoice, refuses and names it', async () => {
    const storage = await issued();
    await issueCreditNote(storage, { invoiceNumber: '2030-001', date: '2030-10-20', reason: 'wrong month' }, { render: fakePdf });

    const edit = editInvoice(storage, '2030-001', { amounts: ['200.00'] }, { render: fakePdf });

    await expect(edit).rejects.toThrow('CN-2030-001');
  });

  it('with a credit note number, refuses', async () => {
    const storage = await issued();
    await issueCreditNote(storage, { invoiceNumber: '2030-001', date: '2030-10-20', reason: 'wrong month' }, { render: fakePdf });

    const edit = editInvoice(storage, 'CN-2030-001', { period: '2030-08' }, { render: fakePdf });

    await expect(edit).rejects.toThrow('is a credit note');
  });
});

describe('editInvoice AC-ED-5', () => {
  it('with a sent invoice, refuses with InvoiceSentError and leaves the record', async () => {
    const storage = await issued();
    await markSent(storage, '2030-001', '2030-10-09');
    const before = await storage.readText(RECORD_PATH);

    const error = await editInvoice(storage, '2030-001', { amounts: ['200.00'] }, { render: fakePdf }).catch((caught: unknown) => caught);

    expect(isInvoiceSentError(error)).toBe(true);
    expect(await storage.readText(RECORD_PATH)).toBe(before);
  });
});

describe('editInvoice AC-ED-6', () => {
  it('with two edits, appends one audit entry per edit with time and fields', async () => {
    const storage = await issued();
    await editInvoice(storage, '2030-001', { amounts: ['200.00'] }, { render: fakePdf, now: () => EDIT_TIME });

    await editInvoice(storage, '2030-001', { period: '2030-08', amounts: ['300.00'] }, { render: fakePdf, now: () => EDIT_TIME });

    expect(await readEditLog(storage, '2030-001')).toEqual([
      { at: '2030-10-09T10:00:00.000Z', fields: ['amounts'] },
      { at: '2030-10-09T10:00:00.000Z', fields: ['period', 'amounts'] },
    ]);
    expect(await isEdited(storage, '2030-001')).toBe(true);
  });

  it('with no edit, isEdited is false', async () => {
    const storage = await issued();

    const edited = await isEdited(storage, '2030-001');

    expect(edited).toBe(false);
  });

  it('with an edited invoice, reports no folder conflict', async () => {
    const storage = await issued();
    await editInvoice(storage, '2030-001', { amounts: ['200.00'] }, { render: fakePdf, now: () => EDIT_TIME });

    const conflicts = await findFolderConflicts(storage, '2030');

    expect(conflicts).toEqual([]);
  });
});
