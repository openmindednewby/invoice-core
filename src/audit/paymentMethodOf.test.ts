import { describe, expect, it } from 'vitest';

import { CARD_TYPE, DIRECT_DEBIT_TYPE, FEE_TYPE, TRANSFER_TYPE } from './auditFixtures';
import { PaymentMethod } from './PaymentMethod';
import { paymentMethodOf } from './paymentMethodOf';

describe('paymentMethodOf', () => {
  it('with each BOC transaction type, names how the money moved', () => {
    const types = [CARD_TYPE, 'Card Purchase - Foreign', TRANSFER_TYPE, 'Transfer to Other Banks - Inward', DIRECT_DEBIT_TYPE, 'Standing Order', FEE_TYPE, 'Other Debit', ''];

    const methods = types.map(paymentMethodOf);

    expect(methods).toEqual([
      PaymentMethod.Card, PaymentMethod.Card, PaymentMethod.Transfer, PaymentMethod.Transfer, PaymentMethod.DirectDebit,
      PaymentMethod.DirectDebit, PaymentMethod.Fee, PaymentMethod.Other, PaymentMethod.Other,
    ]);
  });

  it('with a card fee typed as commission, counts it as a fee not a card payment', () => {
    const type = 'Commission - Card Fee';

    const method = paymentMethodOf(type);

    expect(method).toBe(PaymentMethod.Fee);
  });
});
