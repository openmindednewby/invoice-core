import { recordPath, toJson } from './folder';
import { InvoiceKind } from './InvoiceKind';
import { StorageExistsError } from './storage';
import type { InvoiceStorage } from './storage';
import { InvoiceError } from './types';
import type { InvoiceRecord } from './types';

const PAD = 3;
const YEAR = /^\d{4}$/;
const CREDIT_PREFIX = 'CN-';

function highest(names: string[], pattern: RegExp): number {
  return names.reduce((max, name) => Math.max(max, Number(pattern.exec(name)?.[1] ?? 0)), 0);
}

/** Returns the next gap-free number for a year, such as 2030-002 or CN-2030-001. */
export async function nextNumber(storage: InvoiceStorage, year: string, kind: InvoiceKind = InvoiceKind.Invoice): Promise<string> {
  if (!YEAR.test(year)) {
    throw new InvoiceError([{ path: 'year', message: 'must be YYYY' }]);
  }
  const prefix = kind === InvoiceKind.CreditNote ? CREDIT_PREFIX : '';
  const current = highest(await storage.list(`invoices/${year}`), new RegExp(`^${prefix}${year}-(\\d+)$`));
  const legacy = prefix === '' ? highest(await storage.list(year), new RegExp(`^${year}-(\\d+)\\.(?:json|pdf)$`)) : 0;
  return `${prefix}${year}-${String(Math.max(current, legacy) + 1).padStart(PAD, '0')}`;
}

/** Writes the record, refusing if that number was already issued. Issued records are never replaced. */
export async function claimInvoice(storage: InvoiceStorage, record: InvoiceRecord): Promise<string> {
  const path = recordPath(record.number);
  try {
    await storage.writeNew(path, toJson(record));
  } catch (error) {
    const message = error instanceof StorageExistsError ? `${record.number} is already issued` : `could not save ${record.number}: ${(error as Error).message}`;
    throw new InvoiceError([{ path: 'number', message }]);
  }
  return path;
}
