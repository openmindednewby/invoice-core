import { describe, expect, it } from 'vitest';

import { saveContacts } from './contacts';
import { issueCreditNote } from './creditNote';
import { saveEmailSignature, saveEmailTemplate, saveSenderAddress } from './emailTemplates';
import { pdfPath } from './folder';
import { InvoiceKind } from './InvoiceKind';
import { readInvoice } from './issue';
import { RecipientKind } from './RecipientKind';
import { fillKeepingUnknown, isRepeatSend, loadSendDraft } from './sendDraft';
import { sendInvoice } from './sendInvoice';
import { markSent } from './sentStatus';
import { fakePdf } from './testing/fixtures';
import { inputWith, issued, senderReturning } from './testing/sendFixtures';
import { clearUncertainSend, markUncertainSend } from './uncertainSend';

const NUMBER = '2030-001';
const ME = 'me@example.test';
const ACCOUNTS = 'accounts@example.test';
const MANAGER = 'manager@example.test';
const PICKED = 'picked@example.test';
const CYPRUS_MORNING = new Date('2026-11-10T07:00:00Z');
const CYPRUS_1159 = new Date('2026-11-10T09:59:00Z');
const LOST_AT = '2030-10-09T08:00:00.000Z';

describe('loadSendDraft', () => {
  it('with people on file, fills To and Cc from who receives what', async () => {
    const storage = await issued();
    await saveContacts(storage, 'acme', [
      { name: 'Accounts', email: ACCOUNTS, role: '', recipient: RecipientKind.To },
      { name: 'Manager', email: MANAGER, role: '', recipient: RecipientKind.Cc },
    ]);

    const loaded = await loadSendDraft(storage, NUMBER);

    expect(loaded.to).toBe(ACCOUNTS);
    expect(loaded.cc).toBe(MANAGER);
  });

  it('with an only-if-picked person, keeps them out of both lists and offers them', async () => {
    const storage = await issued();
    const picked = { name: 'Picked', email: PICKED, role: '', recipient: RecipientKind.Picked };
    await saveContacts(storage, 'acme', [{ name: 'Accounts', email: ACCOUNTS, role: '', recipient: RecipientKind.To }, picked]);

    const loaded = await loadSendDraft(storage, NUMBER);

    expect(`${loaded.to} ${loaded.cc}`).not.toContain(PICKED);
    expect(loaded.people).toContainEqual(picked);
  });

  it('with no stored template, uses the Greek default filled from the invoice', async () => {
    const storage = await issued();

    const loaded = await loadSendDraft(storage, NUMBER);

    expect(loaded.subject).toContain('Τιμολόγιο');
    expect(loaded.subject).toContain(NUMBER);
    expect(loaded.body).toContain('Αξιότιμοι');
  });

  it('with a stored evening template opened at 11:59 Cyprus time, opens with good morning', async () => {
    const storage = await issued();
    await saveEmailTemplate(storage, InvoiceKind.Invoice, { subject: 'Τιμολόγιο {number}', body: 'Καλησπέρα σας,\n\nΣας επισυνάπτουμε το τιμολόγιο.' });

    const loaded = await loadSendDraft(storage, NUMBER, CYPRUS_1159);

    expect(loaded.body).toBe('Καλημέρα σας,\n\nΣας επισυνάπτουμε το τιμολόγιο.');
  });

  it('with a sender address stored, shows it as From', async () => {
    const storage = await issued();
    await saveSenderAddress(storage, ME);

    const loaded = await loadSendDraft(storage, NUMBER);

    expect(loaded.from).toBe(ME);
  });

  it('with the PDF on disk, names it and does not flag it missing', async () => {
    const storage = await issued();

    const loaded = await loadSendDraft(storage, NUMBER);

    expect(loaded.pdfName).toBe(`${NUMBER}.pdf`);
    expect(loaded.pdfMissing).toBe(false);
  });

  it('with the PDF gone, flags it missing and never prints a new one', async () => {
    const storage = await issued();
    await storage.remove(pdfPath(NUMBER));

    const loaded = await loadSendDraft(storage, NUMBER);

    expect(loaded.pdfMissing).toBe(true);
    expect(await storage.readBytes(pdfPath(NUMBER))).toBeNull();
  });

  it('with an invoice marked sent by hand, returns the date and no last send', async () => {
    const storage = await issued();
    await markSent(storage, NUMBER, '2030-10-11');

    const loaded = await loadSendDraft(storage, NUMBER);

    expect(loaded.sentOn).toBe('2030-10-11');
    expect(loaded.lastSend).toBeNull();
  });

  it('with a logged send, returns it as the last send', async () => {
    const storage = await issued();
    await sendInvoice(storage, inputWith(), senderReturning('gmail-1'));

    const loaded = await loadSendDraft(storage, NUMBER);

    expect(loaded.lastSend?.messageId).toBe('gmail-1');
  });

  it('with a may-have-gone marker on file, returns its time; once cleared, returns null', async () => {
    const storage = await issued();
    await markUncertainSend(storage, NUMBER, LOST_AT);
    const open = await loadSendDraft(storage, NUMBER);
    await clearUncertainSend(storage, NUMBER);

    const closed = await loadSendDraft(storage, NUMBER);

    expect(open.uncertainAt).toBe(LOST_AT);
    expect(closed.uncertainAt).toBeNull();
  });
});

describe('loadSendDraft with a saved signature', () => {
  it('for an invoice, puts one blank line and the filled signature under the message', async () => {
    const storage = await issued();
    await saveEmailTemplate(storage, InvoiceKind.Invoice, { subject: 'S', body: 'Body' });
    await saveEmailSignature(storage, 'Demetrios\n{companyName}');

    const loaded = await loadSendDraft(storage, NUMBER, CYPRUS_MORNING);

    expect(loaded.body).toBe('Body\n\nDemetrios\nExample Ltd');
  });

  it('for a credit note, puts the signature under the message too', async () => {
    const storage = await issued();
    await saveEmailTemplate(storage, InvoiceKind.CreditNote, { subject: 'S', body: 'Credit' });
    const credit = await issueCreditNote(storage, { invoiceNumber: NUMBER, date: '2030-10-10', reason: 'Twice' }, { render: fakePdf });
    await saveEmailSignature(storage, 'Demetrios');

    const loaded = await loadSendDraft(storage, credit.number, CYPRUS_MORNING);

    expect(loaded.body).toBe('Credit\n\nDemetrios');
  });

  it('with no signature saved, leaves the message exactly as the template', async () => {
    const storage = await issued();
    await saveEmailTemplate(storage, InvoiceKind.Invoice, { subject: 'S', body: 'Body\n' });

    const loaded = await loadSendDraft(storage, NUMBER, CYPRUS_MORNING);

    expect(loaded.body).toBe('Body\n');
  });

  it('with a template already ending in the signature, adds it no second time', async () => {
    const storage = await issued();
    await saveEmailTemplate(storage, InvoiceKind.Invoice, { subject: 'S', body: 'Body\n\nDemetrios\n{companyName}' });
    await saveEmailSignature(storage, 'Demetrios\n{companyName}');

    const loaded = await loadSendDraft(storage, NUMBER, CYPRUS_MORNING);

    expect(loaded.body).toBe('Body\n\nDemetrios\nExample Ltd');
  });

  it('with an evening greeting opened in the morning, changes only the first line', async () => {
    const storage = await issued();
    await saveEmailTemplate(storage, InvoiceKind.Invoice, { subject: 'S', body: 'Καλησπέρα σας,\n\nΣας επισυνάπτουμε το {number}.' });
    await saveEmailSignature(storage, 'Καλησπέρα σας,');

    const loaded = await loadSendDraft(storage, NUMBER, CYPRUS_MORNING);

    expect(loaded.body).toBe(`Καλημέρα σας,\n\nΣας επισυνάπτουμε το ${NUMBER}.\n\nΚαλησπέρα σας,`);
  });
});

describe('fillKeepingUnknown', () => {
  it('with an unknown placeholder, fills the known ones and keeps the unknown visible', async () => {
    const storage = await issued();
    const record = await readInvoice(storage, NUMBER);

    const filled = fillKeepingUnknown({ subject: '{number} {totl}', body: 'x' }, record);

    expect(filled.subject).toBe(`${NUMBER} {totl}`);
  });
});

describe('isRepeatSend', () => {
  it('with a date on file, returns true; with no date and no logged send, false', async () => {
    const storage = await issued();
    const fresh = await loadSendDraft(storage, NUMBER);

    const results = [fresh, { ...fresh, sentOn: '2030-10-11' }].map(isRepeatSend);

    expect(results).toEqual([false, true]);
  });

  it('with a logged send, returns true', async () => {
    const storage = await issued();
    await sendInvoice(storage, inputWith(), senderReturning('gmail-2'));
    const sent = await loadSendDraft(storage, NUMBER);

    const repeat = isRepeatSend({ ...sent, sentOn: null });

    expect(repeat).toBe(true);
  });
});
