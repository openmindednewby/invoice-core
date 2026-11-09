import { describe, expect, it, vi } from 'vitest';

import { issueInvoice } from './issue';
import { InvoiceSentError, isInvoiceSentError } from './InvoiceSentError';
import { markPaid, markUnpaid, readPaymentStatus } from './paymentStatus';
import { markFirstSent, markSent, markUnsent, readSentStatus } from './sentStatus';
import type { InvoiceStorage } from './storage';
import { fakePdf, makeStorage, REQUEST } from './testing/fixtures';

const STATUS_PATH = 'invoices/2030/2030-001/status.json';

async function issued(): Promise<InvoiceStorage> {
  const storage = makeStorage();
  await issueInvoice(storage, { ...REQUEST, date: '2030-10-08' }, { render: fakePdf });
  return storage;
}

describe('readSentStatus AC-ED-4', () => {
  it('with no status file, reads as not sent', async () => {
    const storage = await issued();

    const status = await readSentStatus(storage, '2030-001');

    expect(status).toEqual({ sentOn: null });
  });
});

describe('markSent AC-ED-4', () => {
  it('with a real date on or after the invoice date, records sentOn in status.json', async () => {
    const storage = await issued();

    await markSent(storage, '2030-001', '2030-10-09');

    expect(await readSentStatus(storage, '2030-001')).toEqual({ sentOn: '2030-10-09' });
  });

  it('with a date before the invoice date, refuses', async () => {
    const storage = await issued();

    const mark = markSent(storage, '2030-001', '2030-10-07');

    await expect(mark).rejects.toThrow('sentOn');
  });

  it('with a date that is not real, refuses', async () => {
    const storage = await issued();

    const mark = markSent(storage, '2030-001', '2030-02-30');

    await expect(mark).rejects.toThrow('sentOn');
  });

  it('with a recorded payment, keeps the payment date', async () => {
    const storage = await issued();
    await markPaid(storage, '2030-001', '2030-11-01');

    await markSent(storage, '2030-001', '2030-10-09');

    expect(await readPaymentStatus(storage, '2030-001')).toEqual({ paidOn: '2030-11-01' });
  });
});

describe('markFirstSent', () => {
  it('with a sent date stored, returns it and writes nothing', async () => {
    const storage = await issued();
    await markSent(storage, '2030-001', '2030-10-09');
    const replace = vi.fn(() => Promise.reject(new Error('disk full')));

    const standing = await markFirstSent({ ...storage, replace }, '2030-001', '2030-10-20');

    expect(standing).toBe('2030-10-09');
    expect(replace).not.toHaveBeenCalled();
  });

  it('with no sent date stored, records the given date and returns it', async () => {
    const storage = await issued();

    const standing = await markFirstSent(storage, '2030-001', '2030-10-20');

    expect(standing).toBe('2030-10-20');
    expect(await readSentStatus(storage, '2030-001')).toEqual({ sentOn: '2030-10-20' });
  });
});

describe('markUnsent AC-ED-4', () => {
  it('with an unpaid sent invoice, clears sentOn and removes the empty status file', async () => {
    const storage = await issued();
    await markSent(storage, '2030-001', '2030-10-09');

    await markUnsent(storage, '2030-001');

    expect(await readSentStatus(storage, '2030-001')).toEqual({ sentOn: null });
    expect(await storage.readText(STATUS_PATH)).toBeNull();
  });

  it('with a paid invoice, refuses and keeps sentOn', async () => {
    const storage = await issued();
    await markSent(storage, '2030-001', '2030-10-09');
    await markPaid(storage, '2030-001', '2030-11-01');

    const unmark = markUnsent(storage, '2030-001');

    await expect(unmark).rejects.toThrow('paid');
    expect(await readSentStatus(storage, '2030-001')).toEqual({ sentOn: '2030-10-09' });
  });
});

describe('markUnpaid with a sent invoice', () => {
  it('with a sent and paid invoice, keeps sentOn and clears paidOn', async () => {
    const storage = await issued();
    await markSent(storage, '2030-001', '2030-10-09');
    await markPaid(storage, '2030-001', '2030-11-01');

    await markUnpaid(storage, '2030-001');

    expect(await readSentStatus(storage, '2030-001')).toEqual({ sentOn: '2030-10-09' });
    expect(await readPaymentStatus(storage, '2030-001')).toEqual({ paidOn: null });
  });
});

describe('isInvoiceSentError', () => {
  it('with an InvoiceSentError, returns true and carries sentOn', () => {
    const error = new InvoiceSentError('2030-001', '2030-10-09');

    const matched = isInvoiceSentError(error);

    expect(matched).toBe(true);
    expect(error.sentOn).toBe('2030-10-09');
  });

  it('with another error, returns false', () => {
    const error = new Error('2030-001');

    const matched = isInvoiceSentError(error);

    expect(matched).toBe(false);
  });
});
