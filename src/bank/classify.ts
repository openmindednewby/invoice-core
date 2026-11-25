import type { InvoiceStorage } from '../storage';
import type { BankLine, LedgerLine, LineClass } from './bankLine';
import { BANK_CHARGES_CATEGORY } from './bankPaths';
import { updateLedgerLine } from './ledgerStore';
import { LineKind } from './LineKind';
import { PAYEE_RULES_LOCK, readPayeeRules, savePayeeRules } from './payeeRules';
import type { PayeeRule } from './payeeRules';

const FEE_TYPE = 'commission - fee';
const CARD_TYPE = 'card purchase';
const CARD_MARKER = ' PURCHASE ';
const INTERNET_DEBIT_MARKER = 'TRANSFER-INTERNET-DEBIT ';
const FROM_MARKER = ' FROM ';
const SENDER_END = '>';
const INVOICE_PAID = /^Invoice\s(\S+)/i;

export interface ClassifyContext {
  directors: string[];
  rules: PayeeRule[];
}

function normalise(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9-]+/g, ' ').trim();
}

function words(value: string): string[] {
  return normalise(value).split(' ').filter((word) => word.length > 0);
}

function isDirector(payee: string, directors: string[]): boolean {
  const payeeWords = new Set(words(payee));
  return directors.some((director) => words(director).length > 0 && words(director).every((word) => payeeWords.has(word)));
}

function cardMerchant(description: string): string | null {
  const at = description.toUpperCase().indexOf(CARD_MARKER);
  return at <= 0 ? null : description.slice(0, at);
}

function internetDebitText(description: string): string | null {
  const at = description.toUpperCase().indexOf(INTERNET_DEBIT_MARKER);
  return at < 0 ? null : description.slice(at + INTERNET_DEBIT_MARKER.length).trim();
}

function sender(description: string): string | null {
  const at = description.toUpperCase().indexOf(FROM_MARKER);
  const end = at < 0 ? -1 : description.indexOf(SENDER_END, at);
  return end < 0 ? null : description.slice(at + FROM_MARKER.length, end);
}

function sorted(kind: LineKind, category: string | null, needsReview: boolean, billNumber: string | null = null): LineClass {
  return { kind, category, needsReview, billNumber };
}

/** The payee of a line: the merchant of a card purchase, the free text of an internet debit, the sender of a transfer. */
export function payeeOf(line: BankLine): string {
  return normalise(cardMerchant(line.description) ?? internetDebitText(line.description) ?? sender(line.description) ?? line.description);
}

/** Sorts a line into one kind by the built-in rules and the learnt payee rules; a line no rule sorts is To review. */
export function classifyLine(line: BankLine, context: ClassifyContext): LineClass {
  if (line.type.trim().toLowerCase() === FEE_TYPE) {
    return sorted(LineKind.BankFee, BANK_CHARGES_CATEGORY, false);
  }
  const payee = payeeOf(line);
  const rule = context.rules.find((candidate) => candidate.payee === payee);
  if (rule !== undefined) {
    return sorted(rule.kind, rule.category, false);
  }
  if (line.amountCents > 0 && sender(line.description) !== null && isDirector(payee, context.directors)) {
    return sorted(LineKind.OwnerMoneyIn, null, false);
  }
  const invoice = line.amountCents < 0 ? INVOICE_PAID.exec(internetDebitText(line.description) ?? '') : null;
  if (invoice?.[1] !== undefined) {
    return sorted(LineKind.Expense, null, false, invoice[1]);
  }
  if (line.type.trim().toLowerCase().startsWith(CARD_TYPE)) {
    return sorted(LineKind.Expense, null, true);
  }
  return sorted(LineKind.ToReview, null, true);
}

/** The rules with the owner's choice for this line's payee, replacing an earlier rule of that payee. */
export function learnPayeeRule(rules: PayeeRule[], line: BankLine, kind: LineKind, category: string | null): PayeeRule[] {
  const payee = payeeOf(line);
  return [...rules.filter((rule) => rule.payee !== payee), { payee, kind, category }];
}

/** Sets a line's kind and category from the owner's choice and learns it for later lines of the same payee. */
export function setLineKind(storage: InvoiceStorage, account: string, key: string, kind: LineKind, category: string | null): Promise<LedgerLine> {
  return updateLedgerLine(storage, account, key, async (line) => {
    if (line.billNumber === null) {
      await storage.withLock(PAYEE_RULES_LOCK, async () => savePayeeRules(storage, learnPayeeRule(await readPayeeRules(storage), line, kind, category)));
    }
    return { ...line, kind, category, needsReview: false };
  });
}
