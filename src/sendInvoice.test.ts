import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import { readContacts, saveContacts } from './contacts';
import { issueCreditNote } from './creditNote';
import { editInvoice } from './editInvoice';
import { issueInvoice } from './issue';
import { RecipientKind } from './RecipientKind';
import { readSendLog } from './sendLog';
import { isSentNotRecordedError, sendInvoice } from './sendInvoice';
import type { MailMessage, MailSender, SendInvoiceInput } from './sendInvoice';
import { readSentStatus } from './sentStatus';
import type { InvoiceStorage } from './storage';
import { fakePdf, makeStorage, REQUEST } from './testing/fixtures';

const DIR = 'invoices/2030/2030-001';
const SENDS_PATH = `${DIR}/sends.json`;
const STATUS_PATH = `${DIR}/status.json`;
const PDF_PATH = `${DIR}/2030-001.pdf`;

async function issued(): Promise<InvoiceStorage> {
  const storage = makeStorage();
  await issueInvoice(storage, { ...REQUEST, date: '2030-10-08' }, { render: fakePdf });
  return storage;
}

function inputWith(overrides: Partial<SendInvoiceInput> = {}): SendInvoiceInput {
  return {
    number: '2030-001', from: 'me@example.test', to: ['ada@example.test'], cc: [], subject: 'Subject', body: 'Body',
    at: '2030-10-09T08:00:00.000Z', today: '2030-10-09', ...overrides,
  };
}

function senderReturning(messageId: string): MailSender & { send: ReturnType<typeof vi.fn> } {
  return { send: vi.fn((_message: MailMessage) => Promise.resolve({ messageId })) };
}

function failingOn(storage: InvoiceStorage, failPath: string): InvoiceStorage {
  return { ...storage, replace: (path, data) => (path === failPath ? Promise.reject(new Error('disk full')) : storage.replace(path, data)) };
}

describe('sendInvoice AC-12', () => {
  it('with an issued invoice, sends the PDF to the recipients and returns the message id', async () => {
    const storage = await issued();
    const sender = senderReturning('gmail-1');
    const input = inputWith({ from: 'me@example.test', to: ['ada@example.test'], cc: ['ben@example.test'], subject: 'Τιμολόγιο', body: 'Γεια σας' });

    const result = await sendInvoice(storage, input, sender);

    expect(result.messageId).toBe('gmail-1');
    expect(sender.send).toHaveBeenCalledTimes(1);
    expect(sender.send).toHaveBeenCalledWith({
      from: 'me@example.test', to: ['ada@example.test'], cc: ['ben@example.test'], subject: 'Τιμολόγιο', body: 'Γεια σας',
      attachment: { filename: '2030-001.pdf', contentType: 'application/pdf', data: new TextEncoder().encode('%PDF-fake') },
    });
  });

  it('with a successful send, appends one log entry holding the hash of the PDF sent', async () => {
    const storage = await issued();
    const input = inputWith({ at: '2030-10-09T08:00:00.000Z', from: 'me@example.test', to: ['ada@example.test'], cc: ['ben@example.test'], subject: 'Subject' });

    await sendInvoice(storage, input, senderReturning('gmail-1'));

    expect(await readSendLog(storage, '2030-001')).toEqual([{
      at: '2030-10-09T08:00:00.000Z', from: 'me@example.test', to: ['ada@example.test'], cc: ['ben@example.test'], subject: 'Subject', messageId: 'gmail-1',
      pdfSha256: createHash('sha256').update('%PDF-fake').digest('hex'),
    }]);
  });

  it('with a successful send, marks the invoice sent today and locks it from editing', async () => {
    const storage = await issued();

    const result = await sendInvoice(storage, inputWith({ today: '2030-10-09' }), senderReturning('gmail-1'));

    expect(result.sentOn).toBe('2030-10-09');
    expect(await readSentStatus(storage, '2030-001')).toEqual({ sentOn: '2030-10-09' });
    await expect(editInvoice(storage, '2030-001', { period: '2030-08' }, { render: fakePdf })).rejects.toThrow('was sent on 2030-10-09');
  });

  it('with an invoice already sent, logs again and keeps the first sent date', async () => {
    const storage = await issued();
    await sendInvoice(storage, inputWith({ today: '2030-10-09' }), senderReturning('gmail-1'));

    const result = await sendInvoice(storage, inputWith({ today: '2030-10-20' }), senderReturning('gmail-2'));

    expect(result.sentOn).toBe('2030-10-09');
    expect(await readSentStatus(storage, '2030-001')).toEqual({ sentOn: '2030-10-09' });
    expect((await readSendLog(storage, '2030-001')).map((entry) => entry.messageId)).toEqual(['gmail-1', 'gmail-2']);
  });

  it('with a credit note, attaches its own PDF', async () => {
    const storage = await issued();
    const credit = await issueCreditNote(storage, { invoiceNumber: '2030-001', date: '2030-10-08', reason: 'wrong amount' }, { render: fakePdf });
    const sender = senderReturning('gmail-1');

    await sendInvoice(storage, inputWith({ number: credit.number }), sender);

    expect(sender.send).toHaveBeenCalledWith(expect.objectContaining({ attachment: expect.objectContaining({ filename: `${credit.number}.pdf` }) }));
  });

  it('with a placeholder left in the edited text, fills it from the issued record', async () => {
    const storage = await issued();
    const sender = senderReturning('gmail-1');

    await sendInvoice(storage, inputWith({ number: '2030-001', subject: 'Invoice {number}' }), sender);

    expect(sender.send).toHaveBeenCalledWith(expect.objectContaining({ subject: 'Invoice 2030-001' }));
  });
});

describe('sendInvoice AC-7', () => {
  it('with an unknown placeholder in the text, refuses and sends nothing', async () => {
    const storage = await issued();
    const sender = senderReturning('gmail-1');

    const send = sendInvoice(storage, inputWith({ body: 'Pay by {payBy}' }), sender);

    await expect(send).rejects.toThrow('unknown placeholder {payBy}');
    expect(sender.send).not.toHaveBeenCalled();
  });
});

describe('sendInvoice AC-13', () => {
  it('with a failed send, passes the error on and logs and marks nothing', async () => {
    const storage = await issued();
    const rejection = new Error('expired sign-in');
    const sender: MailSender = { send: () => Promise.reject(rejection) };

    const send = sendInvoice(storage, inputWith(), sender);

    await expect(send).rejects.toBe(rejection);
    expect(await storage.readText(SENDS_PATH)).toBeNull();
    expect(await storage.readText(STATUS_PATH)).toBeNull();
  });

  it('with a failed send, adds no contact', async () => {
    const storage = await issued();
    const sender: MailSender = { send: () => Promise.reject(new Error('network')) };

    await sendInvoice(storage, inputWith({ to: ['new@example.test'] }), sender).catch(() => undefined);

    expect(await readContacts(storage, 'acme')).toEqual([]);
  });

  it('with a failed send, a retry goes through', async () => {
    const storage = await issued();
    await sendInvoice(storage, inputWith(), { send: () => Promise.reject(new Error('network')) }).catch(() => undefined);

    const result = await sendInvoice(storage, inputWith(), senderReturning('gmail-2'));

    expect(result.messageId).toBe('gmail-2');
    expect((await readSendLog(storage, '2030-001')).map((entry) => entry.messageId)).toEqual(['gmail-2']);
  });
});

describe('sendInvoice AC-4', () => {
  it('with new addresses in To and Cc, adds them to the client contacts by field', async () => {
    const storage = await issued();

    const result = await sendInvoice(storage, inputWith({ to: ['new-to@example.test'], cc: ['new-cc@example.test'] }), senderReturning('gmail-1'));

    expect(result.addedContacts).toEqual(['new-to@example.test', 'new-cc@example.test']);
    expect(await readContacts(storage, 'acme')).toEqual([
      { name: 'new-to@example.test', email: 'new-to@example.test', role: '', recipient: RecipientKind.To },
      { name: 'new-cc@example.test', email: 'new-cc@example.test', role: '', recipient: RecipientKind.Cc },
    ]);
  });

  it('with an address already in the contacts, leaves the person as they are', async () => {
    const storage = await issued();
    const ada = { name: 'Ada', email: 'ada@example.test', role: 'Accounts', recipient: RecipientKind.Cc };
    await saveContacts(storage, 'acme', [ada]);

    const result = await sendInvoice(storage, inputWith({ to: ['ada@example.test'] }), senderReturning('gmail-1'));

    expect(result.addedContacts).toEqual([]);
    expect(await readContacts(storage, 'acme')).toEqual([ada]);
  });

  it('with a broken contacts file, still completes the send and reports contacts not updated', async () => {
    const storage = await issued();
    await storage.writeNew('contacts/acme.json', 'not json');

    const result = await sendInvoice(storage, inputWith({ today: '2030-10-09' }), senderReturning('gmail-1'));

    expect(result.contactsUpdated).toBe(false);
    expect(result.addedContacts).toEqual([]);
    expect(await readSentStatus(storage, '2030-001')).toEqual({ sentOn: '2030-10-09' });
  });
});

describe('sendInvoice recording failure', () => {
  it('with a log write that fails after the send, reports the message id and marks nothing', async () => {
    const storage = await issued();

    const failure: unknown = await sendInvoice(failingOn(storage, SENDS_PATH), inputWith(), senderReturning('gmail-9')).catch((error: unknown) => error);

    expect(isSentNotRecordedError(failure)).toBe(true);
    expect(failure).toMatchObject({ messageId: 'gmail-9', logged: false });
    expect(await storage.readText(STATUS_PATH)).toBeNull();
  });

  it('with a sent mark that fails after the send, reports the message id and that it is logged', async () => {
    const storage = await issued();

    const failure: unknown = await sendInvoice(failingOn(storage, STATUS_PATH), inputWith(), senderReturning('gmail-9')).catch((error: unknown) => error);

    expect(isSentNotRecordedError(failure)).toBe(true);
    expect(failure).toMatchObject({ messageId: 'gmail-9', logged: true });
    expect((await readSendLog(storage, '2030-001')).map((entry) => entry.messageId)).toEqual(['gmail-9']);
  });
});

describe('sendInvoice one send in flight', () => {
  it('with a second send while the first runs, refuses it and sends once', async () => {
    const storage = await issued();
    let finish: (value: { messageId: string }) => void = () => undefined;
    const sender = { send: vi.fn(() => new Promise<{ messageId: string }>((resolve) => { finish = resolve; })) };
    const first = sendInvoice(storage, inputWith(), sender);

    const second = sendInvoice(storage, inputWith(), sender);

    await expect(second).rejects.toThrow('already being sent');
    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledTimes(1));
    finish({ messageId: 'gmail-1' });
    await expect(first).resolves.toMatchObject({ messageId: 'gmail-1' });
  });

  it('with the first send finished, allows another', async () => {
    const storage = await issued();
    await sendInvoice(storage, inputWith(), senderReturning('gmail-1'));

    const again = sendInvoice(storage, inputWith(), senderReturning('gmail-2'));

    await expect(again).resolves.toMatchObject({ messageId: 'gmail-2' });
  });
});

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
