import { describe, expect, it } from 'vitest';

import { sendInvoice } from './sendInvoice';
import type { SendInvoiceInput } from './sendInvoice';
import { inputWith, issued, senderReturning } from './testing/sendFixtures';

const DIR = 'invoices/2030/2030-001';
const SENDS_PATH = `${DIR}/sends.json`;
const STATUS_PATH = `${DIR}/status.json`;
const PDF_PATH = `${DIR}/2030-001.pdf`;

describe('sendInvoice refuses before sending', () => {
  it.each<[string, Partial<SendInvoiceInput>, string]>([
    ['an invalid sender', { from: 'nope' }, 'from'],
    ['no recipient', { to: [] }, 'to'],
    ['an invalid To address', { to: ['ada@example.test', 'nope'] }, 'to.1'],
    ['an invalid Cc address', { cc: ['nope'] }, 'cc.0'],
    ['a blank subject', { subject: '  ' }, 'subject'],
    ['a subject of two lines', { subject: 'One\r\nBcc: x@example.test' }, 'subject'],
  ])('with %s, names the field and sends nothing', async (_name, overrides, path) => {
    const storage = await issued();
    const sender = senderReturning('gmail-1');

    const send = sendInvoice(storage, inputWith(overrides), sender);

    await expect(send).rejects.toMatchObject({ errors: [expect.objectContaining({ path })] });
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('with a missing PDF, refuses and sends nothing', async () => {
    const storage = await issued();
    await storage.remove(PDF_PATH);
    const sender = senderReturning('gmail-1');

    const send = sendInvoice(storage, inputWith(), sender);

    await expect(send).rejects.toMatchObject({ errors: [expect.objectContaining({ path: 'pdf' })] });
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('with an empty PDF, refuses and sends nothing', async () => {
    const storage = await issued();
    await storage.replace(PDF_PATH, new Uint8Array());
    const sender = senderReturning('gmail-1');

    const send = sendInvoice(storage, inputWith(), sender);

    await expect(send).rejects.toMatchObject({ errors: [expect.objectContaining({ path: 'pdf' })] });
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('with a first send dated before the invoice date, refuses and sends nothing', async () => {
    const storage = await issued();
    const sender = senderReturning('gmail-1');

    const send = sendInvoice(storage, inputWith({ today: '2030-10-07' }), sender);

    await expect(send).rejects.toThrow('sentOn');
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('with a broken send log, refuses and sends nothing', async () => {
    const storage = await issued();
    await storage.writeNew(SENDS_PATH, 'not json');
    const sender = senderReturning('gmail-1');

    const send = sendInvoice(storage, inputWith(), sender);

    await expect(send).rejects.toThrow(SENDS_PATH);
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('with a broken status file, refuses and sends nothing', async () => {
    const storage = await issued();
    await storage.writeNew(STATUS_PATH, 'not json');
    const sender = senderReturning('gmail-1');

    const send = sendInvoice(storage, inputWith(), sender);

    await expect(send).rejects.toThrow(STATUS_PATH);
    expect(sender.send).not.toHaveBeenCalled();
  });
});
