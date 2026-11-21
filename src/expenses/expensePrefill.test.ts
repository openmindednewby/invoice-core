import { describe, expect, it } from 'vitest';

import { RECEIPT_NO_VAT_TEXT, RECEIPT_TEXT } from '../testing/expenseFixtures';
import { prefillExpenseFromText } from './expensePrefill';

describe('prefillExpenseFromText', () => {
  it('with a receipt showing a VAT number, finds the VAT split and rate and turns reclaimable on', () => {
    const text = RECEIPT_TEXT;

    const prefill = prefillExpenseFromText(text);

    expect(prefill).toEqual({ date: '2026-11-14', supplierVat: '10000002X', net: '5.88', vat: '1.12', total: '7.00', vatRate: 19, vatReclaimable: true });
  });

  it('with a receipt showing no VAT number, finds the total and leaves reclaimable off', () => {
    const text = RECEIPT_NO_VAT_TEXT;

    const prefill = prefillExpenseFromText(text);

    expect(prefill).toEqual({ date: '2026-11-15', total: '1.50', vatReclaimable: false });
  });
});
