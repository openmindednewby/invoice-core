import { readInvoice } from './issue';
import { readStatusFile, updateStatusFile } from './statusFile';
import type { InvoiceStorage } from './storage';
import { InvoiceError } from './types';
import type { InvoiceRecord } from './types';
import { isRealDate } from './validate';

export interface SentStatus { sentOn: string | null; }

/** Reads whether an invoice was sent; no status file means not sent. */
export async function readSentStatus(storage: InvoiceStorage, number: string): Promise<SentStatus> {
  return { sentOn: (await readStatusFile(storage, number)).sentOn ?? null };
}

/** Refuses a sent date that is not real or falls before the invoice date. */
export function assertSentDate(record: InvoiceRecord, sentOn: string): void {
  if (!isRealDate(sentOn)) {
    throw new InvoiceError([{ path: 'sentOn', message: 'must be a real date as YYYY-MM-DD' }]);
  }
  if (sentOn < record.request.date) {
    throw new InvoiceError([{ path: 'sentOn', message: `must not be before the invoice date ${record.request.date}` }]);
  }
}

/** Records the date an invoice was sent; from then on it cannot be edited. */
export async function markSent(storage: InvoiceStorage, number: string, sentOn: string): Promise<void> {
  assertSentDate(await readInvoice(storage, number), sentOn);
  await updateStatusFile(storage, number, (status) => ({ ...status, sentOn }));
}

/** Records a sent date only if none is stored, and returns the date that stands. */
export async function markFirstSent(storage: InvoiceStorage, number: string, sentOn: string): Promise<string> {
  const record = await readInvoice(storage, number);
  let standing = sentOn;
  await updateStatusFile(storage, number, (status) => {
    if (status.sentOn !== undefined) {
      standing = status.sentOn;
      return status;
    }
    assertSentDate(record, sentOn);
    return { ...status, sentOn };
  });
  return standing;
}

/** Clears the sent date; refused once the invoice is paid. */
export async function markUnsent(storage: InvoiceStorage, number: string): Promise<void> {
  await updateStatusFile(storage, number, (status) => {
    if (status.paidOn !== undefined) {
      throw new InvoiceError([{ path: 'sentOn', message: `${number} is paid; mark it unpaid before marking it not sent` }]);
    }
    return { ...status, sentOn: undefined };
  });
}
