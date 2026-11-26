import type { BankLine } from '../bank/bankLine';

export const LOCAL_CARD = 'Card Purchase - Local';
export const FOREIGN_CARD = 'Card Purchase - Foreign';
export const INWARD = 'Transfer to Other Banks - Inward';
export const OTHER_DEBIT = 'Other Debit';

/** A synthetic bank line with the given text, transaction type and signed amount in cents. */
export function syntheticLine(description: string, type: string, amountCents: number): BankLine {
  return { date: '2026-11-10', valueDate: null, description, type, reference: 'REF', bankReference: '', branchCode: '0001', amountCents, balanceCents: null };
}

/** A synthetic foreign card purchase: country, card code and merchant, then the card trailer. */
export function foreignCard(country: string, code: string, merchant: string): BankLine {
  return syntheticLine(`${country} ${code} ${merchant} 4000000001 PURCHASE Card 4***0000 2026-11-10 9.99 EUR Auth 000001 Trace 000002`, FOREIGN_CARD, -999);
}

/** A synthetic local card purchase at the merchant. */
export function localCard(merchant: string): BankLine {
  return syntheticLine(`${merchant} PURCHASE CY Card 4***0000 2026-11-10 7.00 EUR Auth 000001 Trace 000002`, LOCAL_CARD, -700);
}
