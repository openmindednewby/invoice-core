import { describe, expect, it } from 'vitest';

import { issueCreditNote } from './creditNote';
import { exportQuarterCsv } from './exportCsv';
import { issueInvoice } from './issue';
import type { InvoiceStorage } from './storage';
import { fakePdf, makeStorage, REQUEST } from './testing/fixtures';

async function seeded(client: object = {}): Promise<InvoiceStorage> {
  const storage = makeStorage({}, client);
  await issueInvoice(storage, { ...REQUEST, date: '2030-03-31' }, { render: fakePdf });
  await issueInvoice(storage, { ...REQUEST, date: '2030-04-01', amounts: ['100'] }, { render: fakePdf });
  await issueInvoice(storage, { ...REQUEST, date: '2030-06-30', amounts: ['200'] }, { render: fakePdf });
  await issueInvoice(storage, { ...REQUEST, date: '2030-07-01', amounts: ['300'] }, { render: fakePdf });
  await issueCreditNote(storage, { invoiceNumber: '2030-002', date: '2030-05-15', reason: 'Refund', amount: '40' }, { render: fakePdf });
  return storage;
}

describe('exportQuarterCsv AC-16', () => {
  it('with a chosen quarter, holds only its invoices and credit notes, by date', async () => {
    const storage = await seeded();

    const csv = await exportQuarterCsv(storage, '2030', 2);
    const numbers = csv.replace(/^﻿/, '').trim().split('\r\n').slice(1).map((row) => row.split(',')[0]);

    expect(numbers).toEqual(['2030-002', 'CN-2030-001', '2030-003']);
  });

  it('with a credit note, shows negative amounts and the invoice it credits', async () => {
    const storage = await seeded({ vatRule: 'cy-domestic-19' });

    const csv = await exportQuarterCsv(storage, '2030', 2);
    const row = csv.split('\r\n').find((line) => line.startsWith('CN-2030-001')) ?? '';

    expect(row).toContain('-40.00,-7.60,-47.60');
    expect(row).toContain('2030-002');
  });

  it('with Greek text and a comma in a name, quotes it and starts with a BOM', async () => {
    const storage = await seeded({ name: 'Πελάτης, Ltd' });

    const csv = await exportQuarterCsv(storage, '2030', 2);

    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('"Πελάτης, Ltd"');
  });

  it('with a client name starting with =, neutralises the formula', async () => {
    const storage = await seeded({ name: '=HYPERLINK("x")' });

    const csv = await exportQuarterCsv(storage, '2030', 2);

    expect(csv).toContain('"\'=HYPERLINK(""x"")"');
  });

  it('with quarter 5, refuses and names it', async () => {
    const storage = makeStorage();

    const attempt = exportQuarterCsv(storage, '2030', 5);

    await expect(attempt).rejects.toMatchObject({ errors: [{ path: 'quarter' }] });
  });
});
