import { describe, expect, it } from 'vitest';

import { BillState } from './BillState';
import { BillStatus } from './BillStatus';
import { billState, billTotals, paidWithoutProof, paySheet, sortBills } from './billSummary';
import type { Bill } from './billFile';

function bill(overrides: Partial<Bill>): Bill {
  return {
    dir: 'bills/2026/x-1', supplier: 'Example', supplierVat: '', number: '1', issueDate: '2026-11-02', dueDate: null, currency: 'EUR',
    netCents: 0, vatCents: 0, notSubjectToVatCents: 0, totalCents: 1000, payTo: { bank: 'Example Bank', iban: 'CY17', swift: 'EXBKCY2N' },
    status: BillStatus.Unpaid, paidOn: null, proofFiles: [], ...overrides,
  };
}

describe('billState', () => {
  it('with no due date long past the issue date, is unpaid and never overdue', () => {
    const undated = bill({ issueDate: '2020-01-01' });

    const state = billState(undated, '2026-11-20');

    expect(state).toBe(BillState.Unpaid);
  });

  it('with a due date before today, is overdue', () => {
    const late = bill({ dueDate: '2026-11-19' });

    const state = billState(late, '2026-11-20');

    expect(state).toBe(BillState.Overdue);
  });

  it('with today as the due date, is unpaid', () => {
    const due = bill({ dueDate: '2026-11-20' });

    const state = billState(due, '2026-11-20');

    expect(state).toBe(BillState.Unpaid);
  });

  it('with a paid status and a past due date, is paid', () => {
    const paid = bill({ dueDate: '2026-11-01', status: BillStatus.Paid, paidOn: '2026-11-05' });

    const state = billState(paid, '2026-11-20');

    expect(state).toBe(BillState.Paid);
  });
});

describe('billTotals', () => {
  it('with unpaid, overdue and paid bills, sums unpaid including overdue and overdue only with a due date', () => {
    const bills = [
      bill({ totalCents: 84400 }), bill({ totalCents: 44700, dueDate: '2026-11-10' }),
      bill({ totalCents: 5000, status: BillStatus.Paid, paidOn: '2026-11-05' }),
    ];

    const totals = billTotals(bills, '2026-11-20');

    expect(totals).toEqual({ unpaidCents: 129100, overdueCents: 44700 });
  });
});

describe('sortBills', () => {
  it('with mixed bills, puts unpaid first by due or issue date, then paid newest first', () => {
    const bills = [
      bill({ number: 'paid-old', status: BillStatus.Paid, issueDate: '2026-01-01' }),
      bill({ number: 'unpaid-late', issueDate: '2026-11-15' }),
      bill({ number: 'paid-new', status: BillStatus.Paid, issueDate: '2026-10-01' }),
      bill({ number: 'unpaid-due', issueDate: '2026-11-20', dueDate: '2026-11-01' }),
    ];

    const order = sortBills(bills).map((item) => item.number);

    expect(order).toEqual(['unpaid-due', 'unpaid-late', 'paid-new', 'paid-old']);
  });
});

describe('paidWithoutProof', () => {
  it('with a paid bill and no proof, warns', () => {
    const paid = bill({ status: BillStatus.Paid, paidOn: '2026-11-05' });

    const warn = paidWithoutProof(paid);

    expect(warn).toBe(true);
  });

  it('with a paid bill and a proof, does not warn', () => {
    const paid = bill({ status: BillStatus.Paid, paidOn: '2026-11-05', proofFiles: ['transfer.pdf'] });

    const warn = paidWithoutProof(paid);

    expect(warn).toBe(false);
  });
});

describe('paySheet', () => {
  it('with a bill, gives payee, bank details, amount and the invoice reference', () => {
    const unpaid = bill({ supplier: 'Example Supplier', number: '26223', totalCents: 84400 });

    const sheet = paySheet(unpaid);

    expect(sheet).toEqual({ payee: 'Example Supplier', bank: 'Example Bank', iban: 'CY17', swift: 'EXBKCY2N', amount: '844.00', currency: 'EUR', reference: 'Invoice 26223' });
  });

  it('with a supplier that has no IBAN or SWIFT, omits both fields', () => {
    const noBank = bill({ supplier: 'Example Supplier', number: '7', payTo: { bank: 'Example Bank', iban: '', swift: '  ' } });

    const sheet = paySheet(noBank);

    expect(sheet).toEqual({ payee: 'Example Supplier', bank: 'Example Bank', amount: '10.00', currency: 'EUR', reference: 'Invoice 7' });
  });

  it('with no bank details at all, gives only payee, amount and reference', () => {
    const none = bill({ supplier: 'Example Supplier', number: '8', payTo: { bank: '', iban: '', swift: '' } });

    const sheet = paySheet(none);

    expect(Object.keys(sheet)).toEqual(['payee', 'amount', 'currency', 'reference']);
  });
});
