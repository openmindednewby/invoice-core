import { invoiceDir, readJsonFile, toJson } from './folder';
import type { InvoiceStorage } from './storage';

export const EDITS_FILE = 'edits.json';

export interface EditEntry { at: string; fields: string[]; }

function editsPath(number: string): string {
  return `${invoiceDir(number)}/${EDITS_FILE}`;
}

/** Reads the audit entries of an invoice's edits, oldest first; none if never edited. */
export async function readEditLog(storage: InvoiceStorage, number: string): Promise<EditEntry[]> {
  const path = editsPath(number);
  if ((await storage.readText(path)) === null) {
    return [];
  }
  const { edits } = await readJsonFile<{ edits?: unknown }>(storage, path, 'edits');
  return Array.isArray(edits) ? (edits as EditEntry[]) : [];
}

/** Whether an invoice was edited after it was issued. */
export async function isEdited(storage: InvoiceStorage, number: string): Promise<boolean> {
  return (await readEditLog(storage, number)).length > 0;
}

/** Appends one audit entry to edits.json. */
export async function appendEdit(storage: InvoiceStorage, number: string, entry: EditEntry): Promise<void> {
  const edits = [...(await readEditLog(storage, number)), entry];
  await storage.replace(editsPath(number), toJson({ edits }));
}
