import { describe, expect, it } from 'vitest';

import { issueCreditNote } from './creditNote';
import { issueInvoice, readInvoice } from './issue';
import { markPaid, markUnpaid, paymentStateOf, readPaymentStatus } from './paymentStatus';
import { PaymentState } from './PaymentState';
import type { InvoiceStorage } from './storage';
import { fakePdf, makeStorage, REQUEST } from './testing/fixtures';
import type { InvoiceRecord } from './types';

const ISSUE_DATE = '2030-10-08';
const STATUS_PATH = 'invoices/2030/2030-001/status.json';
const RECORD_PATH = 'invoices/2030/2030-001/invoice.json';

async function issued(paymentTermsDays = 30): Promise<{ storage: InvoiceStorage; record: InvoiceRecord }> {
  const storage = makeStorage({}, { paymentTermsDays });
  await issueInvoice(storage, { ...REQUEST, date: ISSUE_DATE }, { render: fakePdf });
  return { storage, record: await readInvoice(storage, '2030-001') };
}

describe('readPaymentStatus', () => {
  it('with no status file, reads as unpaid', async () => {
    const { storage } = await issued();

    const status = await readPaymentStatus(storage, '2030-001');

    expect(status).toEqual({ paidOn: null });
  });

  it('with a broken status file, refuses and names it', async () => {
    const { storage } = await issued();
    await storage.writeNew(STATUS_PATH, 'not json');

    const read = readPaymentStatus(storage, '2030-001');

    await expect(read).rejects.toThrow(STATUS_PATH);
  });
});

describe('markPaid AC-14', () => {
  it('with an issued invoice, writes status.json and leaves the record byte for byte', async () => {
    const { storage } = await issued();
    const before = await storage.readText(RECORD_PATH);

    await markPaid(storage, '2030-001', '2030-11-01');

    expect(await readPaymentStatus(storage, '2030-001')).toEqual({ paidOn: '2030-11-01' });
    expect(await storage.readText(RECORD_PATH)).toBe(before);
  });

  it('with a second payment date, replaces the first', async () => {
    const { storage } = await issued();
    await markPaid(storage, '2030-001', '2030-11-01');

    await markPaid(storage, '2030-001', '2030-11-02');

    expect(await readPaymentStatus(storage, '2030-001')).toEqual({ paidOn: '2030-11-02' });
  });

  it('with a date that is not real, refuses', async () => {
    const { storage } = await issued();

    const mark = markPaid(storage, '2030-001', '2030-02-31');

    await expect(mark).rejects.toThrow('paidOn');
    expect(await storage.readText(STATUS_PATH)).toBeNull();
  });

  it('with a date before the invoice date, refuses', async () => {
    const { storage } = await issued();

    const mark = markPaid(storage, '2030-001', '2030-10-07');

    await expect(mark).rejects.toThrow('paidOn');
  });

  it('with a number never issued, refuses and writes nothing', async () => {
    const { storage } = await issued();

    const mark = markPaid(storage, '2030-009', '2030-11-01');

    await expect(mark).rejects.toThrow('2030-009');
    expect(await storage.list('invoices/2030')).toEqual(['2030-001']);
  });

  it('with a credit note, refuses', async () => {
    const { storage } = await issued();
    const credit = await issueCreditNote(storage, { invoiceNumber: '2030-001', date: ISSUE_DATE, reason: 'wrong amount' }, { render: fakePdf });

    const mark = markPaid(storage, credit.number, '2030-11-01');

    await expect(mark).rejects.toThrow('credit note');
  });
});

describe('markUnpaid AC-14', () => {
  it('with a paid invoice, removes the status and leaves the record byte for byte', async () => {
    const { storage } = await issued();
    const before = await storage.readText(RECORD_PATH);
    await markPaid(storage, '2030-001', '2030-11-01');

    await markUnpaid(storage, '2030-001');

    expect(await storage.readText(STATUS_PATH)).toBeNull();
    expect(await storage.readText(RECORD_PATH)).toBe(before);
  });
});

describe('paymentStateOf AC-14', () => {
  it('with a payment date, is paid even past the due date', async () => {
    const { record } = await issued(30);

    const state = paymentStateOf(record, { paidOn: '2030-11-01' }, '2031-06-01');

    expect(state).toBe(PaymentState.Paid);
  });

  it('with no payment on the due date itself, is unpaid', async () => {
    const { record } = await issued(30);

    const state = paymentStateOf(record, { paidOn: null }, '2030-11-07');

    expect(state).toBe(PaymentState.Unpaid);
  });

  it('with no payment the day after the due date, is overdue', async () => {
    const { record } = await issued(30);

    const state = paymentStateOf(record, { paidOn: null }, '2030-11-08');

    expect(state).toBe(PaymentState.Overdue);
  });

  it('with no payment terms, is never overdue', async () => {
    const { record } = await issued(30);
    const noTerms = { ...record, client: { ...record.client, paymentTermsDays: null } };

    const state = paymentStateOf(noTerms, { paidOn: null }, '2040-01-01');

    expect(state).toBe(PaymentState.Unpaid);
  });
});
