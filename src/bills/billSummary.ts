import { centsToAmount } from '../money';
import { BillState } from './BillState';
import { BillStatus } from './BillStatus';
import type { Bill } from './billFile';

export interface BillTotals {
  unpaidCents: number;
  overdueCents: number;
}

export interface PaySheet {
  payee: string;
  bank?: string;
  iban?: string;
  swift?: string;
  amount: string;
  currency: string;
  reference: string;
}

/** Paid, unpaid or overdue today; a bill with no due date is never overdue (D-BILLS-1). */
export function billState(bill: Bill, today: string): BillState {
  if (bill.status === BillStatus.Paid) {
    return BillState.Paid;
  }
  return bill.dueDate !== null && today > bill.dueDate ? BillState.Overdue : BillState.Unpaid;
}

/** The unpaid total (overdue included) and the overdue total. */
export function billTotals(bills: Bill[], today: string): BillTotals {
  return bills.reduce<BillTotals>((totals, bill) => {
    const state = billState(bill, today);
    return {
      unpaidCents: totals.unpaidCents + (state === BillState.Paid ? 0 : bill.totalCents),
      overdueCents: totals.overdueCents + (state === BillState.Overdue ? bill.totalCents : 0),
    };
  }, { unpaidCents: 0, overdueCents: 0 });
}

function dueOrIssued(bill: Bill): string {
  return bill.dueDate ?? bill.issueDate;
}

function compareBills(a: Bill, b: Bill): number {
  const aPaid = a.status === BillStatus.Paid;
  if (aPaid !== (b.status === BillStatus.Paid)) {
    return aPaid ? 1 : -1;
  }
  return aPaid ? b.issueDate.localeCompare(a.issueDate) : dueOrIssued(a).localeCompare(dueOrIssued(b));
}

/** Unpaid first, earliest due (or issued) first; then paid, newest first. */
export function sortBills(bills: Bill[]): Bill[] {
  return [...bills].sort(compareBills);
}

/** Whether a bill is marked paid with no proof attached. */
export function paidWithoutProof(bill: Bill): boolean {
  return bill.status === BillStatus.Paid && bill.proofFiles.length === 0;
}

function filledOnly(fields: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value.trim().length > 0));
}

/** What to type into the bank to pay a bill; a blank bank, IBAN or SWIFT is left out. */
export function paySheet(bill: Bill): PaySheet {
  const { bank, iban, swift } = bill.payTo;
  return {
    payee: bill.supplier, ...filledOnly({ bank, iban, swift }),
    amount: centsToAmount(bill.totalCents), currency: bill.currency, reference: `Invoice ${bill.number}`,
  };
}
