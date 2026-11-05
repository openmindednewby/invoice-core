import { isStorageExistsError } from './storage';
import type { InvoiceStorage } from './storage';
import { InvoiceError } from './types';

export const FORMAT_PATH = 'format.json';
const FORMAT_VERSION = 1;
const NUMBER_YEAR = /(\d{4})-\d+$/;
const LEGACY_YEAR = /^\d{4}$/;
const LEGACY_FILE = /^(\d{4}-\d+)\.(json|pdf)$/;
const OS_FILES = new Set(['desktop.ini', 'thumbs.db', '.ds_store']);

export const NUMBER_SHAPE = /^(CN-)?\d{4}-\d+$/;

/** Whether a file is one the operating system leaves in any folder. */
export function isOsFile(name: string): boolean {
  return OS_FILES.has(name.toLowerCase());
}

/** Serialises a folder file the one way every writer does. */
export function toJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

/** The year folder a number belongs to. */
export function numberYear(number: string): string {
  return NUMBER_YEAR.exec(number)?.[1] ?? '';
}

/** The folder of an issued invoice or credit note. */
export function invoiceDir(number: string): string {
  return `invoices/${numberYear(number)}/${number}`;
}

/** The path of an issued record. */
export function recordPath(number: string): string {
  return `${invoiceDir(number)}/invoice.json`;
}

/** The path of an issued PDF. */
export function pdfPath(number: string): string {
  return `${invoiceDir(number)}/${number}.pdf`;
}

/** Reads a JSON object, refusing a missing file or bad JSON under the given label. */
export async function readJsonFile<T>(storage: InvoiceStorage, path: string, label: string): Promise<T> {
  const text = await storage.readText(path);
  if (text === null) {
    throw new InvoiceError([{ path: label, message: `file not found: ${path}` }]);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new InvoiceError([{ path: label, message: `invalid JSON: ${path}` }]);
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new InvoiceError([{ path: label, message: `must be a JSON object: ${path}` }]);
  }
  return parsed as T;
}

/** Creates format.json in a new folder and refuses a folder newer than this code. */
export async function ensureFormat(storage: InvoiceStorage): Promise<void> {
  const text = await storage.readText(FORMAT_PATH);
  if (text === null) {
    await storage.writeNew(FORMAT_PATH, toJson({ version: FORMAT_VERSION })).catch((error: unknown) => {
      if (!isStorageExistsError(error)) {
        throw error;
      }
    });
    return;
  }
  const { version } = await readJsonFile<{ version?: unknown }>(storage, FORMAT_PATH, 'format');
  if (typeof version !== 'number' || version > FORMAT_VERSION) {
    throw new InvoiceError([{ path: 'format', message: `folder format ${String(version)} is not supported; this code reads up to ${FORMAT_VERSION}` }]);
  }
}

async function migrateNumber(storage: InvoiceStorage, year: string, number: string): Promise<boolean> {
  const oldRecord = await storage.readBytes(`${year}/${number}.json`);
  const oldPdf = await storage.readBytes(`${year}/${number}.pdf`);
  const taken = (await storage.readBytes(recordPath(number))) !== null || (await storage.readBytes(pdfPath(number))) !== null;
  if (taken) {
    return false;
  }
  if (oldRecord) {
    await storage.writeNew(recordPath(number), oldRecord);
  }
  if (oldPdf) {
    await storage.writeNew(pdfPath(number), oldPdf);
  }
  await storage.remove(`${year}/${number}.json`);
  await storage.remove(`${year}/${number}.pdf`);
  return true;
}

/** What a migration moved, and the numbers left in place because the target exists. */
export interface MigrationResult { moved: string[]; conflicts: string[]; }

/** Moves <year>/<number>.json + .pdf to invoices/<year>/<number>/. Never overwrites. */
export async function migrateLegacyFolder(storage: InvoiceStorage): Promise<MigrationResult> {
  await ensureFormat(storage);
  const result: MigrationResult = { moved: [], conflicts: [] };
  const years = (await storage.list('')).filter((name) => LEGACY_YEAR.test(name));
  for (const year of years) {
    const names = await storage.list(year);
    const numbers = [...new Set(names.flatMap((name) => LEGACY_FILE.exec(name)?.[1] ?? []))].sort((a, b) => a.localeCompare(b));
    for (const number of numbers) {
      const moved = await migrateNumber(storage, year, number);
      (moved ? result.moved : result.conflicts).push(number);
    }
  }
  return result;
}
