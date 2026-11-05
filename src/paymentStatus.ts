import { invoiceDir, readJsonFile, toJson } from './folder';
import { InvoiceKind } from './InvoiceKind';
import { readInvoice } from './issue';
import { PaymentState } from './PaymentState';
import { addDays } from './period';
import type { InvoiceStorage } from './storage';
import { InvoiceError } from './types';
import type { InvoiceRecord } from './types';
import { isRealDate } from './validate';

const STATUS_LOCK = 'invoice-status';

export interface PaymentStatus {
  paidOn: string | null;
}

function statusPath(number: string): string {
  return `${invoiceDir(number)}/status.json`;
}

/** Reads an invoice's payment status from its status.json; no file means unpaid. */
export async function readPaymentStatus(storage: InvoiceStorage, number: string): Promise<PaymentStatus> {
  const path = statusPath(number);
  if ((await storage.readText(path)) === null) {
    return { paidOn: null };
  }
  const { paidOn } = await readJsonFile<{ paidOn?: unknown }>(storage, path, 'status');
  return { paidOn: typeof paidOn === 'string' ? paidOn : null };
}

/** Records a payment date in status.json; the issued record is never touched. */
export async function markPaid(storage: InvoiceStorage, number: string, paidOn: string): Promise<void> {
  if (!isRealDate(paidOn)) {
    throw new InvoiceError([{ path: 'paidOn', message: 'must be a real date as YYYY-MM-DD' }]);
  }
  const record = await readInvoice(storage, number);
  if (record.kind !== InvoiceKind.Invoice) {
    throw new InvoiceError([{ path: 'number', message: `${number} is a credit note; only an invoice can be paid` }]);
  }
  if (paidOn < record.request.date) {
    throw new InvoiceError([{ path: 'paidOn', message: `must not be before the invoice date ${record.request.date}` }]);
  }
  const payment: PaymentStatus = { paidOn };
  await storage.withLock(STATUS_LOCK, () => storage.replace(statusPath(number), toJson(payment)));
}

/** Removes a recorded payment; the issued record is never touched. */
export async function markUnpaid(storage: InvoiceStorage, number: string): Promise<void> {
  await storage.withLock(STATUS_LOCK, () => storage.remove(statusPath(number)));
}

/** Says whether an invoice is paid, unpaid or overdue today; overdue starts the day after the due date. */
export function paymentStateOf(record: InvoiceRecord, status: PaymentStatus, today: string): PaymentState {
  if (status.paidOn !== null) {
    return PaymentState.Paid;
  }
  const terms = record.client.paymentTermsDays;
  const overdue = typeof terms === 'number' && today > addDays(record.request.date, terms);
  return overdue ? PaymentState.Overdue : PaymentState.Unpaid;
}
