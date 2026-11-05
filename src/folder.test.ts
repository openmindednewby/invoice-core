import { describe, expect, it } from 'vitest';

import { migrateLegacyFolder } from './folder';
import { InvoiceKind } from './InvoiceKind';
import { readInvoice } from './issue';
import { createMemoryStorage } from './memoryStorage';
import { nextNumber } from './numbering';
import type { InvoiceStorage } from './storage';
import { clientJson, companyJson, REQUEST } from './testing/fixtures';

const RULE = { id: 'r', ratePercent: 19, labelEn: 'VAT', labelEl: 'ΦΠΑ', rateTextEn: '19%', rateTextEl: '19%', noteEn: '', noteEl: '', source: 's' };

function legacyStorage(): InvoiceStorage {
  return createMemoryStorage({
    'company.json': companyJson(),
    'clients/acme.json': clientJson(),
    '2030/2030-001.json': JSON.stringify({ number: '2030-001', request: REQUEST, company: JSON.parse(companyJson()) as object, client: JSON.parse(clientJson()) as object, rule: RULE }),
    '2030/2030-001.pdf': new TextEncoder().encode('%PDF-old'),
    '2030/2030-002.pdf': new TextEncoder().encode('%PDF-orphan'),
  });
}

describe('nextNumber on a legacy folder AC-05', () => {
  it('with a legacy record and an orphan PDF, counts both', async () => {
    const storage = legacyStorage();

    const next = await nextNumber(storage, '2030');

    expect(next).toBe('2030-003');
  });
});

describe('migrateLegacyFolder AC-05', () => {
  it('with a legacy folder, moves files to the new layout and the record reads back complete', async () => {
    const storage = legacyStorage();

    const result = await migrateLegacyFolder(storage);
    const record = await readInvoice(storage, '2030-001');

    expect(result.moved).toEqual(['2030-001', '2030-002']);
    expect(result.conflicts).toEqual([]);
    expect(await storage.readText('2030/2030-001.json')).toBeNull();
    expect(await storage.readBytes('invoices/2030/2030-001/2030-001.pdf')).not.toBeNull();
    expect(record.kind).toBe(InvoiceKind.Invoice);
    expect(record.totals).toEqual({ netCents: 123450, vatCents: 23456, totalCents: 146906 });
    expect(await nextNumber(storage, '2030')).toBe('2030-003');
  });

  it('with a target that already exists, reports a conflict and keeps both copies', async () => {
    const storage = legacyStorage();
    await storage.writeNew('invoices/2030/2030-001/invoice.json', '{"number":"2030-001"}');

    const result = await migrateLegacyFolder(storage);

    expect(result.conflicts).toEqual(['2030-001']);
    expect(await storage.readText('2030/2030-001.json')).not.toBeNull();
    expect(await storage.readText('invoices/2030/2030-001/invoice.json')).toBe('{"number":"2030-001"}');
  });
});
