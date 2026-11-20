import { describe, expect, it } from 'vitest';

import { FIRST_BILL_TEXT, SECOND_BILL_TEXT } from '../testing/billFixtures';
import { prefillBillFromText } from './billPrefill';

describe('prefillBillFromText', () => {
  it('with the first filed bill text, fills number, date, totals, VAT number and bank details', () => {
    const text = FIRST_BILL_TEXT;

    const prefill = prefillBillFromText(text);

    expect(prefill).toEqual({
      number: '26223', issueDate: '2026-11-02', supplierVat: '10000001X', net: '200.00', vat: '38.00', notSubjectToVat: '606.00', total: '844.00',
      payTo: { bank: 'Example Bank', iban: 'CY17002001280000001200527600', swift: 'EXBKCY2N' },
    });
  });

  it('with a clipped "nvoice no." and a thousands total, still finds number and total', () => {
    const text = SECOND_BILL_TEXT;

    const { number, total } = prefillBillFromText(text);

    expect({ number, total }).toEqual({ number: '26224', total: '1447.00' });
  });

  it('with a numeric date, reads it as day/month/year', () => {
    const text = 'Invoice no. 7 Date: 05/03/2026 Total 10,00';

    const { issueDate } = prefillBillFromText(text);

    expect(issueDate).toBe('2026-03-05');
  });

  it('with text that has none of the fields, returns an empty prefill', () => {
    const text = 'a scanned image with no text layer';

    const prefill = prefillBillFromText(text);

    expect(prefill).toEqual({ payTo: {} });
  });
});
