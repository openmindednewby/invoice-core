import { readInvoice } from './issue';
import { readStatusFile, updateStatusFile } from './statusFile';
import type { InvoiceStorage } from './storage';
import { InvoiceError } from './types';
import { isRealDate } from './validate';

export interface SentStatus { sentOn: string | null; }

/** Reads whether an invoice was sent; no status file means not sent. */
export async function readSentStatus(storage: InvoiceStorage, number: string): Promise<SentStatus> {
  return { sentOn: (await readStatusFile(storage, number)).sentOn ?? null };
}

/** Records the date an invoice was sent; from then on it cannot be edited. */
export async function markSent(storage: InvoiceStorage, number: string, sentOn: string): Promise<void> {
  if (!isRealDate(sentOn)) {
    throw new InvoiceError([{ path: 'sentOn', message: 'must be a real date as YYYY-MM-DD' }]);
  }
  const record = await readInvoice(storage, number);
  if (sentOn < record.request.date) {
    throw new InvoiceError([{ path: 'sentOn', message: `must not be before the invoice date ${record.request.date}` }]);
  }
  await updateStatusFile(storage, number, (status) => ({ ...status, sentOn }));
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
