import { createMemoryStorage } from '../memoryStorage';
import type { InvoiceStorage } from '../storage';
import type { InvoiceRequest } from '../types';

export const REQUEST: InvoiceRequest = { clientId: 'acme', period: '2030-09', date: '2030-10-08', amounts: ['1234.50'], draft: false };

export function companyJson(overrides: object = {}): string {
  return JSON.stringify({
    name: 'Example Ltd', addressLines: ['1 Test Street', '1000 Testville'], regNo: 'HE 1', vatNumber: 'CY00000000X',
    bank: 'Test Bank', iban: 'CY00 TEST', bic: 'TESTCY00', ...overrides,
  });
}

export function clientJson(overrides: object = {}): string {
  return JSON.stringify({
    name: 'Acme S.A.', addressLines: ['2 Client Road'], taxLines: ['VAT No.: EL000000000'], vatNumber: 'EL000000000',
    vatRule: 'cy-to-eu-b2b-services', paymentTermsDays: 30, description: 'Υπηρεσίες για τον μήνα {periodElAccusative}', ...overrides,
  });
}

export function makeStorage(company: object = {}, client: object = {}): InvoiceStorage {
  return createMemoryStorage({ 'company.json': companyJson(company), 'clients/acme.json': clientJson(client) });
}

export function fakePdf(): Promise<Uint8Array> {
  return Promise.resolve(new TextEncoder().encode('%PDF-fake'));
}
