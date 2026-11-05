import { describe, expect, it } from 'vitest';

import { issueInvoice, NUMBER_LOCK, readInvoice, renderDraftPdf, reprintInvoice } from './issue';
import { createMemoryStorage } from './memoryStorage';
import { claimInvoice, nextNumber } from './numbering';
import { loadLogo } from './pdf';
import { clientJson, companyJson, fakePdf, makeStorage, REQUEST } from './testing/fixtures';
import { extractPdfText, pdfPageCount } from './testing/pdfText';
import { InvoiceError } from './types';

describe('issueInvoice with a logo or a render that cannot finish', () => {
  it('with a corrupt logo, refuses before the lock and leaves the lock free', async () => {
    const storage = createMemoryStorage({ 'company.json': companyJson({ logo: 'logo.png' }), 'clients/acme.json': clientJson(), 'logo.png': new Uint8Array([1, 2, 3, 4]) });
    const request = { ...REQUEST, date: '2030-10-08' };

    const attempt = issueInvoice(storage, request, { render: fakePdf });

    await expect(attempt).rejects.toMatchObject({ errors: [{ path: 'company.logo' }] });
    await expect(storage.withLock(NUMBER_LOCK, () => Promise.resolve('free'))).resolves.toBe('free');
    expect(await nextNumber(storage, '2030')).toBe('2030-001');
  });

  it('with a render that never settles, rejects, frees the lock and uses no number', async () => {
    const storage = makeStorage();
    const request = { ...REQUEST, date: '2030-10-08' };
    const never = (): Promise<Uint8Array> => new Promise(() => undefined);

    const attempt = issueInvoice(storage, request, { render: never, renderTimeoutMs: 5 });

    await expect(attempt).rejects.toMatchObject({ errors: [{ path: 'pdf' }] });
    await expect(storage.withLock(NUMBER_LOCK, () => Promise.resolve('free'))).resolves.toBe('free');
    expect(await nextNumber(storage, '2030')).toBe('2030-001');
  });
});

describe('loadLogo', () => {
  it.each([['logo.png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]], ['logo.jpg', [0xff, 0xd8, 0xff, 0xe0]]] as const)('with %s holding its real signature, accepts it', async (name, bytes) => {
    const storage = createMemoryStorage({ [name]: new Uint8Array(bytes) });

    const logo = await loadLogo(storage, name);

    expect(logo?.image).toContain('base64,');
  });

  it('with an svg holding no svg element, refuses', async () => {
    const storage = createMemoryStorage({ 'logo.svg': 'not a picture' });

    const attempt = loadLogo(storage, 'logo.svg');

    await expect(attempt).rejects.toMatchObject({ errors: [{ path: 'company.logo' }] });
  });
});

describe('issueInvoice', () => {
  it('with two issues, gives each its own gap-free number', async () => {
    const storage = makeStorage();
    const request = { ...REQUEST, date: '2030-10-08' };

    const first = await issueInvoice(storage, request, { render: fakePdf });
    const second = await issueInvoice(storage, request, { render: fakePdf });

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
    const request = { ...REQUEST, date: '2030-10-08' };

    const issued = await issueInvoice(storage, request, { render: fakePdf });

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
    const storage = makeStorage({}, { vatRule: 'cy-domestic-19', description: 'Υπηρεσίες για τον μήνα {periodElAccusative}' });
    const request = { ...REQUEST, period: '2030-09', date: '2030-10-08', amounts: ['1234.50'] };

    const issued = await issueInvoice(storage, request);
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
