import { PaymentMethod } from './PaymentMethod';

const METHOD_WORDS: ReadonlyArray<{ readonly method: PaymentMethod; readonly words: readonly string[] }> = [
  { method: PaymentMethod.Fee, words: ['commission', 'fee', 'charge'] },
  { method: PaymentMethod.DirectDebit, words: ['direct debit', 'standing order'] },
  { method: PaymentMethod.Card, words: ['card'] },
  { method: PaymentMethod.Transfer, words: ['transfer'] },
];

/** How the money moved, read from the bank's transaction type; other when the type names no known method. */
export function paymentMethodOf(type: string): PaymentMethod {
  const text = type.toLowerCase();
  return METHOD_WORDS.find(({ words }) => words.some((word) => text.includes(word)))?.method ?? PaymentMethod.Other;
}
