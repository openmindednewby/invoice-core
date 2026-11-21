import { PaidFrom } from '../expenses/PaidFrom';
import type { ExpenseInput } from '../expenses/expenseFile';

export const RECEIPT_TEXT = 'Example Cafe Ltd VAT No: 10000002X Date: 14/11/2026 Coffee 2 x 3,50 7,00 Net 5,88 VAT 19% 1,12 Total 7,00';
export const RECEIPT_NO_VAT_TEXT = 'Corner Kiosk Date: 15/11/2026 Water 1,50 Total 1,50';
export const RECEIPT_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

/** A valid expense input, with fields overridden. */
export function expenseInput(overrides: Partial<ExpenseInput> = {}): ExpenseInput {
  return {
    supplier: 'Example Cafe Ltd', supplierVat: '10000002X', date: '2026-11-14', description: 'Client coffee', category: 'meals-and-entertainment',
    currency: 'EUR', netCents: 588, vatCents: 112, vatRate: 19, vatReclaimable: true, totalCents: 700, paidFrom: PaidFrom.CompanyCard, ...overrides,
  };
}
