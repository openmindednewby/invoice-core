import { ensureFormat, FORMAT_PATH, isOsFile } from './folder';
import { FolderOpenState } from './FolderOpenState';
import type { InvoiceStorage } from './storage';

const DATA_ENTRIES = new Set(['company.json', 'clients', 'invoices', 'rules', 'layouts', 'schedules']);
const LEGACY_YEAR = /^\d{4}$/;

/** Opens a picked folder: an empty one gets the format, anything else unrecognised is left untouched. */
export async function openDataFolder(storage: InvoiceStorage): Promise<FolderOpenState> {
  const names = (await storage.list('')).filter((name) => !isOsFile(name));
  if (names.includes(FORMAT_PATH)) {
    await ensureFormat(storage);
    return FolderOpenState.Existing;
  }
  if (names.length === 0) {
    await ensureFormat(storage);
    return FolderOpenState.New;
  }
  return names.some((name) => DATA_ENTRIES.has(name) || LEGACY_YEAR.test(name)) ? FolderOpenState.Legacy : FolderOpenState.Foreign;
}
