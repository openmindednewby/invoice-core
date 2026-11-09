import { describe, expect, it } from 'vitest';

import {
  BUILT_IN_EMAIL_TEMPLATES, fillEmailTemplate, findUnknownPlaceholders, readEmailTemplate, readSenderAddress, removeEmailTemplate, saveEmailTemplate, saveSenderAddress,
} from './emailTemplates';
import { InvoiceKind } from './InvoiceKind';
import { issueInvoice, readInvoice } from './issue';
import { fakePdf, makeStorage, REQUEST } from './testing/fixtures';
import type { InvoiceRecord } from './types';

const GREEK_LETTER = /[Ͱ-Ͽ]/;
const INVOICE_TEMPLATE_PATH = 'email-templates/invoice.json';

async function issuedRecord(): Promise<InvoiceRecord> {
  const storage = makeStorage();
  await issueInvoice(storage, { ...REQUEST, date: '2030-10-08' }, { render: fakePdf });
  return readInvoice(storage, '2030-001');
}

describe('readEmailTemplate AC-5', () => {
  it('with nothing stored, returns the built-in template of that kind', async () => {
    const storage = makeStorage();

    const template = await readEmailTemplate(storage, InvoiceKind.CreditNote);

    expect(template).toEqual(BUILT_IN_EMAIL_TEMPLATES[InvoiceKind.CreditNote]);
  });

  it('with an edited invoice template, returns it and leaves the credit note template alone', async () => {
    const storage = makeStorage();
    await saveEmailTemplate(storage, InvoiceKind.Invoice, { subject: 'Edited', body: 'Edited body' });

    const invoice = await readEmailTemplate(storage, InvoiceKind.Invoice);
    const credit = await readEmailTemplate(storage, InvoiceKind.CreditNote);

    expect(invoice).toEqual({ subject: 'Edited', body: 'Edited body' });
    expect(credit).toEqual(BUILT_IN_EMAIL_TEMPLATES[InvoiceKind.CreditNote]);
  });

  it('with a client override, returns it for that client only', async () => {
    const storage = makeStorage();
    await saveEmailTemplate(storage, InvoiceKind.Invoice, { subject: 'General', body: 'General body' });
    await saveEmailTemplate(storage, InvoiceKind.Invoice, { subject: 'For acme', body: 'Acme body' }, 'acme');

    const forAcme = await readEmailTemplate(storage, InvoiceKind.Invoice, 'acme');
    const forOther = await readEmailTemplate(storage, InvoiceKind.Invoice, 'other');

    expect(forAcme).toEqual({ subject: 'For acme', body: 'Acme body' });
    expect(forOther).toEqual({ subject: 'General', body: 'General body' });
  });

  it('with a removed client override, falls back to the general template', async () => {
    const storage = makeStorage();
    await saveEmailTemplate(storage, InvoiceKind.Invoice, { subject: 'General', body: 'General body' });
    await saveEmailTemplate(storage, InvoiceKind.Invoice, { subject: 'For acme', body: 'Acme body' }, 'acme');

    await removeEmailTemplate(storage, InvoiceKind.Invoice, 'acme');

    expect(await readEmailTemplate(storage, InvoiceKind.Invoice, 'acme')).toEqual({ subject: 'General', body: 'General body' });
  });

  it('with a stored file missing its body, refuses and names it', async () => {
    const storage = makeStorage();
    await storage.writeNew(INVOICE_TEMPLATE_PATH, '{"subject":"only"}');

    const read = readEmailTemplate(storage, InvoiceKind.Invoice);

    await expect(read).rejects.toThrow(INVOICE_TEMPLATE_PATH);
  });
});

describe('saveEmailTemplate AC-5', () => {
  it('with a template, stores it under email-templates/ by kind', async () => {
    const storage = makeStorage();

    await saveEmailTemplate(storage, InvoiceKind.CreditNote, { subject: 'Subject', body: 'Body' });

    expect(JSON.parse((await storage.readText('email-templates/credit-note.json')) ?? '')).toEqual({ subject: 'Subject', body: 'Body' });
  });

  it('with a client override, stores it in that client folder', async () => {
    const storage = makeStorage();

    await saveEmailTemplate(storage, InvoiceKind.Invoice, { subject: 'Subject', body: 'Body' }, 'acme');

    expect(await storage.list('email-templates/acme')).toEqual(['invoice.json']);
  });

  it('with a blank subject and body, refuses on both fields', async () => {
    const storage = makeStorage();

    const save = saveEmailTemplate(storage, InvoiceKind.Invoice, { subject: ' ', body: '' });

    await expect(save).rejects.toMatchObject({ errors: [{ path: 'subject' }, { path: 'body' }] });
  });

  it('with a client id that could leave the folder, refuses', async () => {
    const storage = makeStorage();

    const save = saveEmailTemplate(storage, InvoiceKind.Invoice, { subject: 'Subject', body: 'Body' }, '../acme');

    await expect(save).rejects.toThrow('clientId');
  });
});

describe('BUILT_IN_EMAIL_TEMPLATES AC-8', () => {
  it.each([InvoiceKind.Invoice, InvoiceKind.CreditNote])('with kind %s, subject and body are Greek and use only known placeholders', (kind) => {
    const { subject, body } = BUILT_IN_EMAIL_TEMPLATES[kind];

    const unknown = [...findUnknownPlaceholders(subject), ...findUnknownPlaceholders(body)];

    expect(subject).toMatch(GREEK_LETTER);
    expect(body).toMatch(GREEK_LETTER);
    expect(unknown).toEqual([]);
  });
});

describe('fillEmailTemplate AC-6', () => {
  it('with every placeholder, fills each from the issued record', async () => {
    const base = await issuedRecord();
    const record: InvoiceRecord = {
      ...base,
      number: '2030-007',
      request: { ...base.request, period: '2030-09', date: '2030-10-08' },
      totals: { netCents: 123450, vatCents: 0, totalCents: 123450 },
      client: { ...base.client, name: 'Client Co', paymentTermsDays: 30 },
      company: { ...base.company, name: 'Demo Ltd' },
    };
    const template = { subject: '{number} {period}', body: '{total}|{dueDate}|{clientName}|{companyName}' };

    const filled = fillEmailTemplate(template, record);

    expect(filled).toEqual({ subject: '2030-007 Σεπτέμβριος 2030', body: '1.234,50|07/11/2030|Client Co|Demo Ltd' });
  });

  it('with a placeholder used twice, fills both', async () => {
    const base = await issuedRecord();
    const record: InvoiceRecord = { ...base, number: '2030-007' };

    const filled = fillEmailTemplate({ subject: '{number}', body: '{number} and {number}' }, record);

    expect(filled.body).toBe('2030-007 and 2030-007');
  });

  it('with a client that has no payment terms, leaves the due date empty', async () => {
    const base = await issuedRecord();
    const record: InvoiceRecord = { ...base, client: { ...base.client, paymentTermsDays: null } };

    const filled = fillEmailTemplate({ subject: 'Due', body: '[{dueDate}]' }, record);

    expect(filled.body).toBe('[]');
  });

  it('with a value holding a replacement pattern, writes it literally', async () => {
    const base = await issuedRecord();
    const record: InvoiceRecord = { ...base, client: { ...base.client, name: 'A$&B' } };

    const filled = fillEmailTemplate({ subject: 'S', body: '{clientName}' }, record);

    expect(filled.body).toBe('A$&B');
  });
});

describe('fillEmailTemplate AC-7', () => {
  it('with an unknown placeholder, refuses and names it and its field', async () => {
    const record = await issuedRecord();

    const fill = (): unknown => fillEmailTemplate({ subject: 'Fine', body: 'Pay by {payBy}' }, record);

    expect(fill).toThrow('body: unknown placeholder {payBy}');
  });

  it('with unknown placeholders in subject and body, names every one', async () => {
    const record = await issuedRecord();

    const fill = (): unknown => fillEmailTemplate({ subject: '{a}', body: '{b}' }, record);

    expect(fill).toThrow('subject: unknown placeholder {a}; body: unknown placeholder {b}');
  });
});

describe('findUnknownPlaceholders AC-7', () => {
  it('with known, unknown and repeated names, lists each unknown name once', () => {
    const text = '{number} {nope} {nope} {due date}';

    const unknown = findUnknownPlaceholders(text);

    expect(unknown).toEqual(['nope', 'due date']);
  });
});

describe('saveSenderAddress', () => {
  it('with a valid address, reads back', async () => {
    const storage = makeStorage();

    await saveSenderAddress(storage, 'me@example.test');

    expect(await readSenderAddress(storage)).toBe('me@example.test');
  });

  it('with an invalid address, refuses on from and stores nothing', async () => {
    const storage = makeStorage();

    const save = saveSenderAddress(storage, 'me-at-example');

    await expect(save).rejects.toMatchObject({ errors: [{ path: 'from' }] });
    expect(await readSenderAddress(storage)).toBeNull();
  });
});
