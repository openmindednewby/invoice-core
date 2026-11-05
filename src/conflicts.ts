import { isOsFile, numberYear, NUMBER_SHAPE } from './folder';
import { FolderConflictKind } from './FolderConflictKind';
import type { InvoiceStorage } from './storage';
import { InvoiceError } from './types';

const RECORD_FILE = 'invoice.json';
const STATUS_FILE = 'status.json';
const LEGACY_FILE = /^(\d{4}-\d+)\.(json|pdf)$/;

export interface FolderConflict {
  kind: FolderConflictKind;
  path: string;
}

function seriesKey(number: string): string {
  const separator = number.lastIndexOf('-');
  return `${number.slice(0, separator)}-${Number(number.slice(separator + 1))}`;
}

async function recordConflict(storage: InvoiceStorage, dir: string, number: string): Promise<FolderConflict[]> {
  const path = `${dir}/${RECORD_FILE}`;
  const text = await storage.readText(path);
  if (text === null) {
    return [];
  }
  let parsed: { number?: unknown } | null;
  try {
    parsed = JSON.parse(text) as { number?: unknown } | null;
  } catch {
    return [{ kind: FolderConflictKind.UnreadableRecord, path }];
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return [{ kind: FolderConflictKind.UnreadableRecord, path }];
  }
  return parsed.number === number ? [] : [{ kind: FolderConflictKind.DuplicateNumber, path }];
}

async function numberFolderConflicts(storage: InvoiceStorage, dir: string, number: string): Promise<FolderConflict[]> {
  const allowed = new Set([RECORD_FILE, STATUS_FILE, `${number}.pdf`]);
  const copies = (await storage.list(dir))
    .filter((name) => !allowed.has(name) && !isOsFile(name))
    .map((name) => ({ kind: FolderConflictKind.SyncCopy, path: `${dir}/${name}` }));
  return [...copies, ...(await recordConflict(storage, dir, number))];
}

async function currentLayoutConflicts(storage: InvoiceStorage, year: string): Promise<{ conflicts: FolderConflict[]; numbers: Set<string> }> {
  const conflicts: FolderConflict[] = [];
  const numbers = new Set<string>();
  const keys = new Set<string>();
  const yearDir = `invoices/${year}`;
  for (const name of (await storage.list(yearDir)).filter((entry) => !isOsFile(entry))) {
    const path = `${yearDir}/${name}`;
    if (!NUMBER_SHAPE.test(name) || numberYear(name) !== year) {
      conflicts.push({ kind: FolderConflictKind.SyncCopy, path });
    } else if (keys.has(seriesKey(name))) {
      conflicts.push({ kind: FolderConflictKind.DuplicateNumber, path });
    } else {
      keys.add(seriesKey(name));
      numbers.add(name);
      conflicts.push(...(await numberFolderConflicts(storage, path, name)));
    }
  }
  return { conflicts, numbers };
}

async function legacyLayoutConflicts(storage: InvoiceStorage, year: string, numbers: Set<string>): Promise<FolderConflict[]> {
  const names = (await storage.list(year)).filter((name) => !isOsFile(name));
  return names.flatMap((name): FolderConflict[] => {
    const number = LEGACY_FILE.exec(name)?.[1];
    const path = `${year}/${name}`;
    if (number === undefined || numberYear(number) !== year) {
      return [{ kind: FolderConflictKind.SyncCopy, path }];
    }
    return numbers.has(number) ? [{ kind: FolderConflictKind.DuplicateNumber, path }] : [];
  });
}

/** Finds sync-conflict copies, duplicate numbers and unreadable records in one year, in both layouts. */
export async function findFolderConflicts(storage: InvoiceStorage, year: string): Promise<FolderConflict[]> {
  const { conflicts, numbers } = await currentLayoutConflicts(storage, year);
  return [...conflicts, ...(await legacyLayoutConflicts(storage, year, numbers))];
}

/** Refuses to continue if the year holds a conflict, naming each path. */
export async function assertNoConflicts(storage: InvoiceStorage, year: string): Promise<void> {
  const conflicts = await findFolderConflicts(storage, year);
  if (conflicts.length > 0) {
    throw new InvoiceError(conflicts.map(({ kind, path }) => ({ path: 'folder', message: `${kind}: ${path}` })));
  }
}
