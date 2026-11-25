import { isStorageExistsError } from '../storage';
import type { InvoiceStorage } from '../storage';
import { InvoiceError } from '../types';
import type { BankLine, BocStatement, LedgerLine } from './bankLine';
import { bankLock, safeSegment, STATEMENTS_DIR } from './bankPaths';
import { classifyLine } from './classify';
import { readLedger, saveLedger } from './ledgerStore';
import { readPayeeRules } from './payeeRules';
import { linkPaidBills } from './proof';

export { readLedger } from './ledgerStore';

const HASH_OFFSET = 0x811c9dc5;
const HASH_PRIME = 0x01000193;
const HASH_HEX = 16;
const HASH_LENGTH = 8;
const DEFAULT_EXTENSION = 'xlsx';

export interface ImportOptions {
  fileName: string;
  bytes: Uint8Array | null;
  directors: string[];
}

export interface ImportResult {
  added: number;
  alreadyImported: number;
  lines: LedgerLine[];
  statementFile: string;
}

interface KeyedLine {
  key: string;
  line: BankLine;
}

function hash(text: string): string {
  let value = HASH_OFFSET;
  for (const char of text) {
    value = Math.imul(value ^ (char.codePointAt(0) ?? 0), HASH_PRIME) >>> 0;
  }
  return value.toString(HASH_HEX).padStart(HASH_LENGTH, '0');
}

/** A line's idempotency key: account plus bank reference, else plus a hash of date, amount, text and balance. */
export function lineKey(account: string, line: BankLine): string {
  if (line.bankReference !== '') {
    return `${account}:${line.bankReference}`;
  }
  const fingerprint = [line.date, String(line.amountCents), line.description, String(line.balanceCents ?? '')].join('|');
  return `${account}:h${hash(fingerprint)}`;
}

function keyed(account: string, lines: BankLine[]): KeyedLine[] {
  const seen = new Map<string, number>();
  return lines.map((line) => {
    const base = lineKey(account, line);
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return { key: count === 1 ? base : `${base}#${count}`, line };
  });
}

/** Where the original statement file is kept: bank/statements/<account>/<from>_<to>.<ext>. */
export function statementPath(statement: BocStatement, fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  const extension = dot < 0 ? DEFAULT_EXTENSION : fileName.slice(dot + 1).toLowerCase();
  const period = statement.periodFrom !== null && statement.periodTo !== null ? `${statement.periodFrom}_${statement.periodTo}` : safeSegment(statement.period);
  return `${STATEMENTS_DIR}/${safeSegment(statement.accountNumber)}/${period}.${extension}`;
}

async function keepStatement(storage: InvoiceStorage, path: string, bytes: Uint8Array | null): Promise<void> {
  if (bytes === null) {
    return;
  }
  await storage.writeNew(path, bytes).catch((error: unknown) => {
    if (!isStorageExistsError(error)) {
      throw error;
    }
  });
}

/** Adds the statement lines not stored yet, sorted into kinds, and keeps the original file. */
export async function importStatement(storage: InvoiceStorage, statement: BocStatement, options: ImportOptions): Promise<ImportResult> {
  const account = statement.accountNumber;
  if (account === '') {
    throw new InvoiceError([{ path: 'accountNumber', message: 'is missing from the statement' }]);
  }
  const statementFile = statementPath(statement, options.fileName);
  await keepStatement(storage, statementFile, options.bytes);
  const context = { directors: options.directors, rules: await readPayeeRules(storage) };
  return storage.withLock(bankLock(account), async () => {
    const existing = await readLedger(storage, account);
    const known = new Set(existing.map((line) => line.key));
    const fresh = keyed(account, statement.lines).filter(({ key }) => !known.has(key))
      .map(({ key, line }): LedgerLine => ({ ...line, ...classifyLine(line, context), key, account, proof: null, statementFile }));
    const added = await linkPaidBills(storage, fresh);
    await saveLedger(storage, account, [...existing, ...added].sort((a, b) => b.date.localeCompare(a.date)));
    return { added: added.length, alreadyImported: statement.lines.length - added.length, lines: added, statementFile };
  });
}
