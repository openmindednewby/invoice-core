import { AMOUNT, defined, lastTotal, plainAmount, prefillBillFromText } from '../bills/billPrefill';
import { EXPENSE_VAT_RATES } from './expensePaths';

export interface ExpensePrefill {
  date?: string;
  supplierVat?: string;
  net?: string;
  vat?: string;
  total?: string;
  vatRate?: number;
  vatReclaimable: boolean;
}

const VAT_NUMBER = /\bVAT (?:Reg\. )?No\.?: ?([A-Z]{0,2}\d{6,}[A-Z]?)\b/i;
const VAT_RATE = /VAT ?@? ?(\d{1,2})(?:[.,]0+)? ?%/i;
const NET = new RegExp(String.raw`\bNet\b\s*:?\s*${AMOUNT}`, 'i');
const VAT_AMOUNT = new RegExp(String.raw`VAT\s*@?\s*[\d.,]+\s*%\s*:?\s*${AMOUNT}`, 'i');

function rateOf(text: string): number | undefined {
  const rate = Number(VAT_RATE.exec(text)?.[1]);
  return EXPENSE_VAT_RATES.includes(rate) ? rate : undefined;
}

/** Reads what it can from a receipt's text, for the owner to confirm; reclaimable is on when a VAT number is found. */
export function prefillExpenseFromText(text: string): ExpensePrefill {
  const bill = prefillBillFromText(text);
  const supplierVat = VAT_NUMBER.exec(text)?.[1] ?? bill.supplierVat;
  return {
    ...defined({
      date: bill.issueDate, supplierVat, net: plainAmount(NET.exec(text)?.[1]) ?? bill.net,
      vat: plainAmount(VAT_AMOUNT.exec(text)?.[1]) ?? bill.vat, total: lastTotal(text), vatRate: rateOf(text),
    }),
    vatReclaimable: supplierVat !== undefined,
  };
}
