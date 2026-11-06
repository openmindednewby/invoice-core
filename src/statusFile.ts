import { invoiceDir, readJsonFile, toJson } from './folder';
import type { InvoiceStorage } from './storage';

export const STATUS_LOCK = 'invoice-status';

export interface StatusFile { paidOn?: string; sentOn?: string; }

/** The path of an invoice's status.json. */
export function statusPath(number: string): string {
  return `${invoiceDir(number)}/status.json`;
}

function dateField(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Reads status.json; no file means an empty status. */
export async function readStatusFile(storage: InvoiceStorage, number: string): Promise<StatusFile> {
  const path = statusPath(number);
  if ((await storage.readText(path)) === null) {
    return {};
  }
  const raw = await readJsonFile<{ paidOn?: unknown; sentOn?: unknown }>(storage, path, 'status');
  const paidOn = dateField(raw.paidOn);
  const sentOn = dateField(raw.sentOn);
  return { ...(paidOn === undefined ? {} : { paidOn }), ...(sentOn === undefined ? {} : { sentOn }) };
}

/** Writes status.json as the given status; an empty status removes the file. */
export async function writeStatusFile(storage: InvoiceStorage, number: string, status: StatusFile): Promise<void> {
  const path = statusPath(number);
  const empty = status.paidOn === undefined && status.sentOn === undefined;
  await (empty ? storage.remove(path) : storage.replace(path, toJson(status)));
}

/** Merges a change into status.json under the status lock, so one field never erases another. */
export async function updateStatusFile(storage: InvoiceStorage, number: string, change: (status: StatusFile) => StatusFile): Promise<void> {
  await storage.withLock(STATUS_LOCK, async () => {
    await writeStatusFile(storage, number, change(await readStatusFile(storage, number)));
  });
}
