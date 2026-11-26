import type { InvoiceStorage } from '../storage';
import { byBankType, byCardCode, byWord, sorted, unsorted } from './autoClass';
import type { BankLine, LedgerLine, LineClass, LineRef } from './bankLine';
import { bankLock } from './bankPaths';
import { ClassSource } from './ClassSource';
import { readLedger, saveLedger, updateLedgerLine } from './ledgerStore';
import type { LineKind } from './LineKind';
import { PAYEE_RULES_LOCK, readPayeeRules, savePayeeRules, withRule } from './payeeRules';
import type { PayeeRule } from './payeeRules';
import { hasPhrase, payeeKey, payeeOf } from './payeeText';

export { payeeOf } from './payeeText';

export interface ClassifyContext {
  directors: string[];
  rules: PayeeRule[];
}

/** Whether a mapping applies to a line: its description holds the mapping text as whole words. */
export function matchesMapping(line: BankLine, rule: PayeeRule): boolean {
  return hasPhrase(line.description, rule.contains);
}

function byMapping(line: BankLine, rules: PayeeRule[]): LineClass | null {
  const rule = rules.filter((candidate) => matchesMapping(line, candidate)).reduce<PayeeRule | null>(
    (best, candidate) => (best === null || candidate.contains.trim().length > best.contains.trim().length ? candidate : best), null);
  return rule === null ? null : sorted(rule, ClassSource.Mapping, rule.contains);
}

/** Sorts a line by mapping, card code, bank type, then word; a line none of them sorts is to review. */
export function classifyLine(line: BankLine, context: ClassifyContext): LineClass {
  return byMapping(line, context.rules) ?? byCardCode(line) ?? byBankType(line, context.directors) ?? byWord(line) ?? unsorted(line);
}

/** The mapping that sorts every line of this line's payee the way the owner chose. */
export function mappingFor(line: BankLine, kind: LineKind, category: string | null): PayeeRule {
  return { contains: payeeKey(payeeOf(line)), kind, category };
}

/** Sets a line's kind and category by hand, so no rule re-sorts it, and maps its payee for later lines. */
export function setLineKind(storage: InvoiceStorage, target: LineRef, kind: LineKind, category: string | null): Promise<LedgerLine> {
  const { account, key } = target;
  return updateLedgerLine(storage, account, key, async (line) => {
    const rule = mappingFor(line, kind, category);
    if (line.billNumber === null && rule.contains !== '') {
      await storage.withLock(PAYEE_RULES_LOCK, async () => savePayeeRules(storage, withRule(await readPayeeRules(storage), rule.contains, rule)));
    }
    return { ...line, kind, category, needsReview: false, why: { source: ClassSource.Manual, match: null } };
  });
}

function mappable(line: LedgerLine, rule: PayeeRule): boolean {
  return line.why.source !== ClassSource.Manual && line.billNumber === null && matchesMapping(line, rule);
}

/** Sorts the earlier lines a mapping matches, never one set by hand or paying a bill; returns the count. */
export function applyMapping(storage: InvoiceStorage, account: string, rule: PayeeRule): Promise<number> {
  return storage.withLock(bankLock(account), async () => {
    const lines = await readLedger(storage, account);
    let changed = 0;
    const updated = lines.map((line) => {
      if (!mappable(line, rule)) {
        return line;
      }
      changed += 1;
      return { ...line, ...sorted(rule, ClassSource.Mapping, rule.contains), invoiceNumbers: line.invoiceNumbers };
    });
    if (changed > 0) {
      await saveLedger(storage, account, updated);
    }
    return changed;
  });
}
