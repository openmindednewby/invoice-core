import { invoiceDir, NUMBER_SHAPE, pdfPath, readJsonFile, toJson } from './folder';
import type { InvoiceStorage } from './storage';
import { InvoiceError } from './types';
import { isRealDate } from './validate';

export const SENDS_FILE = 'sends.json';
export const SEND_LOG_LOCK = 'invoice-sends';

const HEX_RADIX = 16;
const HEX_BYTE_LENGTH = 2;
const ISO_DATE_LENGTH = 10;

export interface SendEntry { at: string; from: string; to: string[]; cc: string[]; subject: string; messageId: string; pdfSha256: string; }

export interface SendHistoryEntry extends SendEntry { earlierVersion: boolean; }

function sendsPath(number: string): string {
  return `${invoiceDir(number)}/${SENDS_FILE}`;
}

async function readRawSends(storage: InvoiceStorage, number: string): Promise<unknown[]> {
  if (!NUMBER_SHAPE.test(number)) {
    throw new InvoiceError([{ path: 'invoiceNumber', message: 'must look like 2030-001 or CN-2030-001' }]);
  }
  const path = sendsPath(number);
  if ((await storage.readText(path)) === null) {
    return [];
  }
  const { sends } = await readJsonFile<{ sends?: unknown }>(storage, path, 'sends');
  if (!Array.isArray(sends)) {
    throw new InvoiceError([{ path: 'sends', message: `must hold a list of sends: ${path}` }]);
  }
  return sends as unknown[];
}

/** Returns the SHA-256 of some bytes as lowercase hex, using WebCrypto. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes.slice());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(HEX_RADIX).padStart(HEX_BYTE_LENGTH, '0')).join('');
}

/** Reads an invoice's sends, oldest first; none if never sent. */
export async function readSendLog(storage: InvoiceStorage, number: string): Promise<SendEntry[]> {
  return (await readRawSends(storage, number)) as SendEntry[];
}

/** Returns the UTC date of the earliest logged send as YYYY-MM-DD; null with none. */
export function firstSendDate(sends: SendEntry[]): string | null {
  const dates = sends.map(({ at }) => String(at).slice(0, ISO_DATE_LENGTH)).filter((date) => isRealDate(date));
  dates.sort((a, b) => a.localeCompare(b));
  return dates[0] ?? null;
}

/** Adds one entry after the existing ones, which are kept exactly as stored; a broken log is refused, never replaced. */
export async function appendSend(storage: InvoiceStorage, number: string, entry: SendEntry): Promise<void> {
  await storage.withLock(SEND_LOG_LOCK, async () => {
    const sends = await readRawSends(storage, number);
    await storage.replace(sendsPath(number), toJson({ sends: [...sends, entry] }));
  });
}

/** Reads the sends and marks each one whose PDF differs from today's file; with no PDF to compare, none is marked. */
export async function readSendHistory(storage: InvoiceStorage, number: string): Promise<SendHistoryEntry[]> {
  const sends = await readSendLog(storage, number);
  const pdf = await storage.readBytes(pdfPath(number));
  const current = pdf === null || pdf.length === 0 ? null : await sha256Hex(pdf);
  return sends.map((entry) => ({ ...entry, earlierVersion: current !== null && entry.pdfSha256 !== current }));
}
