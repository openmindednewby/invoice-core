import type { PayTo } from './billFile';

export interface BillPrefill {
  number?: string;
  issueDate?: string;
  supplierVat?: string;
  net?: string;
  vat?: string;
  notSubjectToVat?: string;
  total?: string;
  payTo: Partial<PayTo>;
}

export const AMOUNT = String.raw`€?\s*(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2}|\d+\.\d{2})`;
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const NUMBER = /I?nvoice\s+no\.?\s*(?::\s*)?([a-z0-9][a-z0-9/-]*)/i;
const DATE_WORDS = /Date:?\s*(\d{1,2})\s+([a-z]+)\s+(\d{4})/i;
const DATE_DIGITS = /Date:?\s*(\d{1,2})[./-](\d{1,2})[./-](\d{4})/i;
const SUPPLIER_VAT = /V\.?A\.?T\.?\s*Reg(?:istration)?\.?\s*No\.?:?\s*([A-Z0-9]+)/i;
const IBAN = /IBAN:?\s*([A-Z]{2}\d{2}(?: ?[A-Z0-9]{4})+(?: ?[A-Z0-9]{1,3})?)\b/;
const SWIFT = /(?:SWIFT|BIC)(?:\/BIC)?:?\s*([A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?)\b/;
const BANK_LABEL = 'Bank:';
const BANK_END = /\s(?:SWIFT|BIC|A\/C|IBAN)\b/;
const LINE_BREAK = /[\n\r\p{Zl}\p{Zp}]/u;
const NET = new RegExp(String.raw`Subtotal\s*[–-]\s*vatable\s+${AMOUNT}`, 'i');
const VAT = new RegExp(String.raw`VAT\s*@\s*[\d.,]+\s*%\s+${AMOUNT}`, 'i');
const NOT_SUBJECT = new RegExp(String.raw`not\s+subject\s+to\s+VAT\s+${AMOUNT}`, 'i');
const TOTAL = new RegExp(String.raw`\bTotal\b\s*:?\s*${AMOUNT}`, 'g');
const TWO_DIGITS = 2;

export function plainAmount(found: string | undefined): string | undefined {
  if (found === undefined) {
    return undefined;
  }
  return found.includes(',') ? found.split('.').join('').replace(',', '.') : found;
}

function isoDate(day: string, month: number, year: string): string | undefined {
  return month >= 1 && month <= MONTHS.length ? `${year}-${String(month).padStart(TWO_DIGITS, '0')}-${day.padStart(TWO_DIGITS, '0')}` : undefined;
}

function issueDateOf(text: string): string | undefined {
  const words = DATE_WORDS.exec(text);
  if (words !== null) {
    return isoDate(words[1] ?? '', MONTHS.indexOf((words[2] ?? '').toLowerCase()) + 1, words[3] ?? '');
  }
  const digits = DATE_DIGITS.exec(text);
  return digits === null ? undefined : isoDate(digits[1] ?? '', Number(digits[2]), digits[3] ?? '');
}

export function lastTotal(text: string): string | undefined {
  return plainAmount([...text.matchAll(TOTAL)].pop()?.[1]);
}

function bankAt(text: string, labelAt: number): string | undefined {
  const rest = text.slice(labelAt + BANK_LABEL.length).trimStart();
  const end = BANK_END.exec(rest.slice(1));
  const bank = end === null ? undefined : rest.slice(0, end.index + 1).trimEnd();
  return bank === undefined || LINE_BREAK.test(bank) ? undefined : bank;
}

function bankOf(text: string): string | undefined {
  for (let at = text.indexOf(BANK_LABEL); at >= 0; at = text.indexOf(BANK_LABEL, at + 1)) {
    const bank = bankAt(text, at);
    if (bank !== undefined) {
      return bank;
    }
  }
  return undefined;
}

export function defined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

/** Reads what it can from a bill's PDF text, for the owner to confirm; a field it cannot find is left out. */
export function prefillBillFromText(text: string): BillPrefill {
  return {
    ...defined({
      number: NUMBER.exec(text)?.[1], issueDate: issueDateOf(text), supplierVat: SUPPLIER_VAT.exec(text)?.[1],
      net: plainAmount(NET.exec(text)?.[1]), vat: plainAmount(VAT.exec(text)?.[1]), notSubjectToVat: plainAmount(NOT_SUBJECT.exec(text)?.[1]),
      total: lastTotal(text),
    }),
    payTo: defined({ bank: bankOf(text), iban: IBAN.exec(text)?.[1]?.split(' ').join(''), swift: SWIFT.exec(text)?.[1] }),
  };
}
