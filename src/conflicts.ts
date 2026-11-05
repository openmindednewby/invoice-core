import { isOsFile, numberYear, NUMBER_SHAPE } from './folder';
import { FolderConflictKind } from './FolderConflictKind';
import type { InvoiceStorage } from './storage';
import { InvoiceError } from './types';
import type { ScheduleRef } from './types';

const RECORD_FILE = 'invoice.json';
const STATUS_FILE = 'status.json';
const LEGACY_FILE = /^(\d{4}-\d+)\.(json|pdf)$/;
const FIXED_BY_REPRINT_OR_CREDIT = new Set([FolderConflictKind.MissingPdf, FolderConflictKind.DuplicateScheduleMonth]);

export interface FolderConflict {
  kind: FolderConflictKind;
  path: string;
}

interface RecordLess {
  path: string;
  number: string;
  empty: boolean;
}

interface LayoutScan {
  conflicts: FolderConflict[];
  numbers: Set<string>;
  recordLess: RecordLess[];
  recorded: string[];
  scheduleMonths: Set<string>;
}

function seriesOf(number: string): string {
  return number.slice(0, number.lastIndexOf('-'));
}

function sequenceOf(number: string): number {
  return Number(number.slice(number.lastIndexOf('-') + 1));
}

function seriesKey(number: string): string {
  return `${seriesOf(number)}-${sequenceOf(number)}`;
}

function parseRecord(text: string): { number?: unknown; schedule?: ScheduleRef } | null {
  try {
    const parsed = JSON.parse(text) as { number?: unknown; schedule?: ScheduleRef } | null;
    return typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

async function pdfConflicts(storage: InvoiceStorage, dir: string, number: string): Promise<FolderConflict[]> {
  const path = `${dir}/${number}.pdf`;
  const bytes = await storage.readBytes(path);
  return bytes && bytes.length > 0 ? [] : [{ kind: FolderConflictKind.MissingPdf, path }];
}

function scheduleConflicts(scan: LayoutScan, path: string, schedule?: ScheduleRef): FolderConflict[] {
  if (!schedule) {
    return [];
  }
  const key = `${schedule.id}:${schedule.period}`;
  if (scan.scheduleMonths.has(key)) {
    return [{ kind: FolderConflictKind.DuplicateScheduleMonth, path }];
  }
  scan.scheduleMonths.add(key);
  return [];
}

async function recordConflicts(storage: InvoiceStorage, scan: LayoutScan, dir: string, number: string, text: string): Promise<FolderConflict[]> {
  const path = `${dir}/${RECORD_FILE}`;
  const parsed = parseRecord(text);
  if (parsed === null) {
    return [{ kind: FolderConflictKind.UnreadableRecord, path }];
  }
  if (parsed.number !== number) {
    return [{ kind: FolderConflictKind.DuplicateNumber, path }];
  }
  return [...(await pdfConflicts(storage, dir, number)), ...scheduleConflicts(scan, path, parsed.schedule)];
}

async function scanNumberFolder(storage: InvoiceStorage, scan: LayoutScan, dir: string, number: string): Promise<void> {
  const files = (await storage.list(dir)).filter((name) => !isOsFile(name));
  const allowed = new Set([RECORD_FILE, STATUS_FILE, `${number}.pdf`]);
  scan.conflicts.push(...files.filter((name) => !allowed.has(name)).map((name) => ({ kind: FolderConflictKind.SyncCopy, path: `${dir}/${name}` })));
  const text = await storage.readText(`${dir}/${RECORD_FILE}`);
  if (text === null) {
    scan.recordLess.push({ path: dir, number, empty: files.length === 0 });
    return;
  }
  scan.recorded.push(number);
  scan.conflicts.push(...(await recordConflicts(storage, scan, dir, number, text)));
}

function losesARecord({ number, empty }: RecordLess, recorded: string[]): boolean {
  const series = seriesOf(number);
  return !empty || recorded.some((other) => seriesOf(other) === series && sequenceOf(other) > sequenceOf(number));
}

async function scanCurrentLayout(storage: InvoiceStorage, year: string): Promise<LayoutScan> {
  const scan: LayoutScan = { conflicts: [], numbers: new Set(), recordLess: [], recorded: [], scheduleMonths: new Set() };
  const keys = new Set<string>();
  const yearDir = `invoices/${year}`;
  for (const name of (await storage.list(yearDir)).filter((entry) => !isOsFile(entry))) {
    const path = `${yearDir}/${name}`;
    if (!NUMBER_SHAPE.test(name) || numberYear(name) !== year) {
      scan.conflicts.push({ kind: FolderConflictKind.SyncCopy, path });
    } else if (keys.has(seriesKey(name))) {
      scan.conflicts.push({ kind: FolderConflictKind.DuplicateNumber, path });
    } else {
      keys.add(seriesKey(name));
      scan.numbers.add(name);
      await scanNumberFolder(storage, scan, path, name);
    }
  }
  const missing = scan.recordLess.filter((entry) => losesARecord(entry, scan.recorded));
  scan.conflicts.push(...missing.map(({ path }) => ({ kind: FolderConflictKind.MissingRecord, path })));
  return scan;
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

/** Finds sync-conflict copies, duplicates, lost records, missing PDFs and unreadable records in one year, in both layouts. */
export async function findFolderConflicts(storage: InvoiceStorage, year: string): Promise<FolderConflict[]> {
  const { conflicts, numbers } = await scanCurrentLayout(storage, year);
  return [...conflicts, ...(await legacyLayoutConflicts(storage, year, numbers))];
}

/** Refuses to continue if the year holds a conflict that a new number could make worse, naming each path. */
export async function assertNoConflicts(storage: InvoiceStorage, year: string): Promise<void> {
  const conflicts = (await findFolderConflicts(storage, year)).filter(({ kind }) => !FIXED_BY_REPRINT_OR_CREDIT.has(kind));
  if (conflicts.length > 0) {
    throw new InvoiceError(conflicts.map(({ kind, path }) => ({ path: 'folder', message: `${kind}: ${path}` })));
  }
}
