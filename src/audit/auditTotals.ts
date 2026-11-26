import type { LedgerLine } from '../bank/bankLine';
import { LineKind } from '../bank/LineKind';
import { PaymentMethod } from './PaymentMethod';
import { paymentMethodOf } from './paymentMethodOf';

export interface KindTotal {
  readonly kind: LineKind;
  readonly count: number;
  readonly totalCents: number;
}

export interface CategoryTotal {
  readonly category: string | null;
  readonly count: number;
  readonly totalCents: number;
}

export interface MethodTotal {
  readonly method: PaymentMethod;
  readonly count: number;
  readonly inCents: number;
  readonly outCents: number;
}

const KIND_ORDER: readonly LineKind[] = [
  LineKind.Expense, LineKind.Income, LineKind.OwnerMoneyIn, LineKind.OwnerPersonal, LineKind.TaxPayment,
  LineKind.Salary, LineKind.OwnTransfer, LineKind.BankFee, LineKind.ToReview,
];

const METHOD_ORDER: readonly PaymentMethod[] = [PaymentMethod.Card, PaymentMethod.Transfer, PaymentMethod.DirectDebit, PaymentMethod.Fee, PaymentMethod.Other];

function sumCents(lines: readonly LedgerLine[]): number {
  return lines.reduce((total, line) => total + line.amountCents, 0);
}

/** The count and signed total of each line kind present, in kind order. */
export function totalsByKind(lines: readonly LedgerLine[]): KindTotal[] {
  return KIND_ORDER
    .map((kind) => lines.filter((line) => line.kind === kind))
    .filter((group) => group.length > 0)
    .map((group) => ({ kind: group[0]?.kind ?? LineKind.ToReview, count: group.length, totalCents: sumCents(group) }));
}

/** The count and signed total of each category, by name, lines with no category last. */
export function totalsByCategory(lines: readonly LedgerLine[]): CategoryTotal[] {
  const names = [...new Set(lines.map((line) => line.category).filter((name): name is string => name !== null))].sort((a, b) => a.localeCompare(b));
  const categories: Array<string | null> = lines.some((line) => line.category === null) ? [...names, null] : names;
  return categories.map((category) => {
    const group = lines.filter((line) => line.category === category);
    return { category, count: group.length, totalCents: sumCents(group) };
  });
}

/** Money in and out per payment method present, read from each line's bank transaction type. */
export function totalsByMethod(lines: readonly LedgerLine[]): MethodTotal[] {
  return METHOD_ORDER
    .map((method) => ({ method, group: lines.filter((line) => paymentMethodOf(line.type) === method) }))
    .filter(({ group }) => group.length > 0)
    .map(({ method, group }) => ({
      method,
      count: group.length,
      inCents: sumCents(group.filter((line) => line.amountCents > 0)),
      outCents: group.filter((line) => line.amountCents < 0).reduce((total, line) => total - line.amountCents, 0),
    }));
}
