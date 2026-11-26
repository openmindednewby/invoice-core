import type { BankLine, LineClass } from './bankLine';
import { BANK_CHARGES_CATEGORY } from './bankPaths';
import { ClassSource } from './ClassSource';
import { LineKind } from './LineKind';
import { cardMerchant, hasPhrase, internetDebitText, normalise, payeeOf, sender, words } from './payeeText';

const SOFTWARE = 'software-and-subscriptions';
const MEALS = 'meals-and-entertainment';
const FUEL = 'fuel-and-car';
const TRAVEL = 'travel';
const PHONE = 'phone-and-internet';
const TRAVEL_FIRST = 4111;
const TRAVEL_LAST = 4131;
const CARD_CODES: Readonly<Record<string, string | undefined>> = {
  5734: SOFTWARE, 4816: SOFTWARE, 5817: SOFTWARE, 7372: SOFTWARE, 5812: MEALS, 5813: MEALS, 5814: MEALS, 5541: FUEL, 5542: FUEL, 7011: TRAVEL, 4814: PHONE,
};
const MEAL_WORDS = ['CAFE', 'COFFEE', 'BAR', 'KITCHEN', 'PIZZA', 'TAVERNA', 'RESTAURANT', 'BAKERY', 'KIOSK', 'GRILL', 'BISTRO'];
const CARD_CODE = /^[A-Z]{2} (\d{4}) /;
const FEE_TYPE = 'commission - fee';
const OTHER_DEBIT_TYPE = 'other debit';
const INWARD_TYPE = 'transfer to other banks - inward';
const CARD_TYPE = 'card purchase';
const BANK_NAME = '1BANK';
const INVOICE_PAID = /^Invoice\s(\S+)/i;
const INVOICE_WORD = /INVOICE/i;
const INVOICE_NUMBER = /\b\d{4}-\d+\b/g;

export interface Sorting {
  kind: LineKind;
  category: string | null;
  needsReview?: boolean;
  billNumber?: string | null;
  invoiceNumbers?: string[];
}

/** A line class from a sorting and the reason for it. */
export function sorted(sorting: Sorting, source: ClassSource, match: string | null): LineClass {
  const { kind, category, needsReview = false, billNumber = null, invoiceNumbers = [] } = sorting;
  return { kind, category, needsReview, billNumber, invoiceNumbers, why: { source, match } };
}

function typeOf(line: BankLine): string {
  return line.type.trim().toLowerCase();
}

function codeCategory(code: string): string | null {
  const number = Number(code);
  return CARD_CODES[code] ?? (number >= TRAVEL_FIRST && number <= TRAVEL_LAST ? TRAVEL : null);
}

/** Sorts a card purchase by the merchant category code a foreign card line carries. */
export function byCardCode(line: BankLine): LineClass | null {
  const code = CARD_CODE.exec(normalise(cardMerchant(line.description) ?? ''))?.[1];
  const category = code === undefined ? null : codeCategory(code);
  return code === undefined || category === null ? null : sorted({ kind: LineKind.Expense, category }, ClassSource.CardCode, code);
}

function isDirector(payee: string, directors: string[]): boolean {
  const payeeWords = new Set(words(payee));
  return directors.some((director) => words(director).length > 0 && words(director).every((word) => payeeWords.has(word)));
}

function invoiceNumbers(description: string): string[] {
  const at = description.search(INVOICE_WORD);
  return at < 0 ? [] : (description.slice(at).match(INVOICE_NUMBER) ?? []);
}

function byTransfer(line: BankLine, directors: string[]): LineClass | null {
  const payee = payeeOf(line);
  if (line.amountCents > 0 && sender(line.description) !== null && isDirector(payee, directors)) {
    return sorted({ kind: LineKind.OwnerMoneyIn, category: null }, ClassSource.Director, payee);
  }
  const bill = line.amountCents < 0 ? INVOICE_PAID.exec(internetDebitText(line.description) ?? '')?.[1] : undefined;
  return bill === undefined ? null : sorted({ kind: LineKind.Expense, category: null, billNumber: bill }, ClassSource.Bill, bill);
}

/** Sorts a line by its bank transaction type: fees and 1bank charges, inward payments, director credits, bill payments. */
export function byBankType(line: BankLine, directors: string[]): LineClass | null {
  const type = typeOf(line);
  const bankType = line.type.trim();
  const fee = { kind: LineKind.BankFee, category: BANK_CHARGES_CATEGORY };
  if (type === FEE_TYPE || (type === OTHER_DEBIT_TYPE && normalise(line.description).startsWith(BANK_NAME))) {
    return sorted(fee, ClassSource.BankType, bankType);
  }
  if (type === INWARD_TYPE && line.amountCents > 0) {
    return sorted({ kind: LineKind.Income, category: null, invoiceNumbers: invoiceNumbers(line.description) }, ClassSource.BankType, bankType);
  }
  return byTransfer(line, directors);
}

/** Suggests a category for a card purchase from a word in the merchant name; the line stays to review. */
export function byWord(line: BankLine): LineClass | null {
  const merchant = cardMerchant(line.description);
  const word = merchant === null ? undefined : MEAL_WORDS.find((candidate) => hasPhrase(merchant, candidate));
  return word === undefined ? null : sorted({ kind: LineKind.Expense, category: MEALS, needsReview: true }, ClassSource.Word, word);
}

/** The class of a line no rule sorts: an uncategorised expense for a card purchase, else to review. */
export function unsorted(line: BankLine): LineClass {
  const kind = typeOf(line).startsWith(CARD_TYPE) ? LineKind.Expense : LineKind.ToReview;
  return sorted({ kind, category: null, needsReview: true }, ClassSource.None, null);
}
