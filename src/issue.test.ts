import { describe, expect, it } from 'vitest';

import { issueInvoice, readInvoice, renderDraftPdf, reprintInvoice } from './issue';
import { claimInvoice, nextNumber } from './numbering';
import { fakePdf, makeStorage, REQUEST } from './testing/fixtures';
import { extractPdfText, pdfPageCount } from './testing/pdfText';
import { InvoiceError } from './types';

describe('issueInvoice', () => {
  it('with two issues, gives each its own gap-free number', async () => {
    const storage = makeStorage();

    const first = await issueInvoice(storage, REQUEST, { render: fakePdf });
    const second = await issueInvoice(storage, REQUEST, { render: fakePdf });

    expect([first.number, second.number]).toEqual(['2030-001', '2030-002']);
    expect(await nextNumber(storage, '2030')).toBe('2030-003');
  });

  it('with a blank required field, refuses and names it, using no number', async () => {
    const storage = makeStorage({ iban: '' });

    const attempt = issueInvoice(storage, REQUEST, { render: fakePdf });

    await expect(attempt).rejects.toMatchObject({ errors: [{ path: 'company.iban' }] });
    expect(await nextNumber(storage, '2030')).toBe('2030-001');
  });

  it('with a failing render, uses no number', async () => {
    const storage = makeStorage();

    const attempt = issueInvoice(storage, REQUEST, { render: () => Promise.reject(new Error('render broke')) });

    await expect(attempt).rejects.toThrow('render broke');
    expect(await nextNumber(storage, '2030')).toBe('2030-001');
  });

  it('with a new folder, writes the record and PDF under invoices/<year>/<number>', async () => {
    const storage = makeStorage();

    const issued = await issueInvoice(storage, REQUEST, { render: fakePdf });

    expect(issued.recordPath).toBe('invoices/2030/2030-001/invoice.json');
    expect(issued.pdfPath).toBe('invoices/2030/2030-001/2030-001.pdf');
    expect(await storage.readText('format.json')).toContain('"version": 1');
  });

  it('with a format newer than this code, refuses and names the format', async () => {
    const storage = makeStorage();
    await storage.writeNew('format.json', '{"version":99}');

    const attempt = issueInvoice(storage, REQUEST, { render: fakePdf });

    await expect(attempt).rejects.toMatchObject({ errors: [{ path: 'format' }] });
  });

  it('with own line descriptions, keeps each line and sums its cents', async () => {
    const storage = makeStorage();
    const lines = [{ description: 'Setup', amount: '0.10' }, { description: 'Support', amount: '0.20' }];

    await issueInvoice(storage, { ...REQUEST, amounts: [], lines }, { render: fakePdf });
    const record = await readInvoice(storage, '2030-001');

    expect(record.lines.map((line) => line.description)).toEqual(['Setup', 'Support']);
    expect(record.totals).toEqual({ netCents: 30, vatCents: 0, totalCents: 30 });
  });
});

describe('claimInvoice AC-10', () => {
  it('with a number already issued, refuses and leaves the record unchanged', async () => {
    const storage = makeStorage();
    await issueInvoice(storage, REQUEST, { render: fakePdf });
    const before = await storage.readText('invoices/2030/2030-001/invoice.json');
    const record = await readInvoice(storage, '2030-001');

    const attempt = claimInvoice(storage, { ...record, totals: { netCents: 1, vatCents: 0, totalCents: 1 } });

    await expect(attempt).rejects.toBeInstanceOf(InvoiceError);
    expect(await storage.readText('invoices/2030/2030-001/invoice.json')).toBe(before);
  });
});

describe('reprintInvoice AC-10', () => {
  it('with an existing PDF, refuses and never replaces it', async () => {
    const storage = makeStorage();
    await issueInvoice(storage, REQUEST, { render: fakePdf });

    const attempt = reprintInvoice(storage, '2030-001', { render: fakePdf });

    await expect(attempt).rejects.toThrow('already has a PDF');
  });

  it('with the PDF missing, recreates it from the record', async () => {
    const storage = makeStorage();
    const issued = await issueInvoice(storage, REQUEST, { render: fakePdf });
    await storage.remove(issued.pdfPath);

    const reprinted = await reprintInvoice(storage, '2030-001', { render: fakePdf });

    expect(reprinted.pdfPath).toBe(issued.pdfPath);
    expect(await storage.readBytes(issued.pdfPath)).not.toBeNull();
  });
});

describe('renderDraftPdf AC-12', () => {
  it('with blanks, renders a one-page draft that takes no number', async () => {
    const storage = makeStorage({ vatNumber: '', iban: '' });

    const pdf = await renderDraftPdf(storage, REQUEST);
    const text = await extractPdfText(pdf);

    expect(await pdfPageCount(pdf)).toBe(1);
    expect(text).toContain('DRAFT');
    expect(text).toContain('[________]');
    expect(await nextNumber(storage, '2030')).toBe('2030-001');
  });
});

describe('issued PDF AC-12', () => {
  it('with Greek text and a cents total, has it selectable and exact', async () => {
    const storage = makeStorage({}, { vatRule: 'cy-domestic-19' });

    const issued = await issueInvoice(storage, REQUEST);
    const bytes = await storage.readBytes(issued.pdfPath);
    const text = await extractPdfText(bytes ?? new Uint8Array());

    expect(text).toContain('ΤΙΜΟΛΟΓΙΟ');
    expect(text).toContain('Υπηρεσίες για τον μήνα Σεπτέμβριο 2030');
    expect(text).toContain('1.234,50');
    expect(text).toContain('234,56');
    expect(text).toContain('1.469,06');
    expect(text).toContain('2030-001');
  });
});
