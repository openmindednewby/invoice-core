import { isOsFile, toJson } from '../folder';
import type { InvoiceStorage } from '../storage';
import { InvoiceError } from '../types';
import type { LedgerLine } from './bankLine';
import { BANK_DIR, bankLock, ledgerPath, STATEMENTS } from './bankPaths';
import { ClassSource } from './ClassSource';

/** The stored lines of one account, newest first; empty before the first import. */
export async function readLedger(storage: InvoiceStorage, account: string): Promise<LedgerLine[]> {
  const saved = await storage.readText(ledgerPath(account));
  if (saved === null) {
    return [];
  }
  const parsed: unknown = JSON.parse(saved);
  return Array.isArray(parsed) ? (parsed as StoredLine[]).map(withWhy) : [];
}

type StoredLine = Omit<LedgerLine, 'why' | 'invoiceNumbers'> & Partial<Pick<LedgerLine, 'why' | 'invoiceNumbers'>>;

function withWhy(line: StoredLine): LedgerLine {
  const why = line.why ?? { source: line.needsReview ? ClassSource.None : ClassSource.Manual, match: null };
  return { ...line, why, invoiceNumbers: line.invoiceNumbers ?? [] };
}

/** Writes the lines of one account. */
export async function saveLedger(storage: InvoiceStorage, account: string, lines: LedgerLine[]): Promise<void> {
  await storage.replace(ledgerPath(account), toJson(lines));
}

/** The accounts that have a ledger under bank/. */
export async function listBankAccounts(storage: InvoiceStorage): Promise<string[]> {
  const names = (await storage.list(BANK_DIR)).filter((name) => name !== STATEMENTS && !name.includes('.') && !isOsFile(name));
  const withLedger = await Promise.all(names.map(async (name) => ((await storage.readText(ledgerPath(name))) === null ? null : name)));
  return withLedger.filter((name): name is string => name !== null);
}

/** Changes one line under the account lock; throws InvoiceError when no line has the key. */
export function updateLedgerLine(
  storage: InvoiceStorage, account: string, key: string, change: (line: LedgerLine) => Promise<LedgerLine>,
): Promise<LedgerLine> {
  return storage.withLock(bankLock(account), async () => {
    const lines = await readLedger(storage, account);
    const found = lines.find((line) => line.key === key);
    if (found === undefined) {
      throw new InvoiceError([{ path: 'key', message: `no bank line ${key}` }]);
    }
    const updated = await change(found);
    await saveLedger(storage, account, lines.map((line) => (line.key === key ? updated : line)));
    return updated;
  });
}
