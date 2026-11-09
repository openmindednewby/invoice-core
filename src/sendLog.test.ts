import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { findFolderConflicts } from './conflicts';
import { issueInvoice } from './issue';
import { appendSend, readSendHistory, readSendLog, sha256Hex } from './sendLog';
import type { SendEntry } from './sendLog';
import type { InvoiceStorage } from './storage';
import { fakePdf, makeStorage, REQUEST } from './testing/fixtures';

const SENDS_PATH = 'invoices/2030/2030-001/sends.json';
const PDF_PATH = 'invoices/2030/2030-001/2030-001.pdf';

async function issued(): Promise<InvoiceStorage> {
  const storage = makeStorage();
  await issueInvoice(storage, { ...REQUEST, date: '2030-10-08' }, { render: fakePdf });
  return storage;
}

function entryWith(messageId: string, pdfSha256: string): SendEntry {
  return { at: '2030-10-09T08:00:00.000Z', from: 'me@example.test', to: ['ada@example.test'], cc: ['ben@example.test'], subject: 'Subject', messageId, pdfSha256 };
}

describe('sha256Hex', () => {
  it('with the bytes abc, returns the published digest', async () => {
    const bytes = new TextEncoder().encode('abc');

    const hash = await sha256Hex(bytes);

    expect(hash).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('readSendLog', () => {
  it('with no log file, returns no entries', async () => {
    const storage = await issued();

    const entries = await readSendLog(storage, '2030-001');

    expect(entries).toEqual([]);
  });

  it('with a broken log file, refuses and names it', async () => {
    const storage = await issued();
    await storage.writeNew(SENDS_PATH, 'not json');

    const read = readSendLog(storage, '2030-001');

    await expect(read).rejects.toThrow(SENDS_PATH);
  });
});

describe('send log invoice number', () => {
  it('with a number that could leave the folder, readSendLog refuses', async () => {
    const storage = await issued();

    const read = readSendLog(storage, '../../2030-001');

    await expect(read).rejects.toThrow('invoiceNumber');
  });

  it('with a number that could leave the folder, appendSend refuses and writes nothing', async () => {
    const storage = await issued();

    const append = appendSend(storage, '../../2030-001', entryWith('id-1', 'aa'));

    await expect(append).rejects.toThrow('invoiceNumber');
    expect(await storage.readText('invoices//../../2030-001/sends.json')).toBeNull();
  });
});

describe('appendSend AC-17', () => {
  it('with a first send, writes one entry with time, from, to, cc, subject, message id and PDF hash', async () => {
    const storage = await issued();
    const entry = { at: '2030-10-09T08:00:00.000Z', from: 'me@example.test', to: ['ada@example.test'], cc: ['ben@example.test'], subject: 'Subject', messageId: 'id-1', pdfSha256: 'aa' };

    await appendSend(storage, '2030-001', entry);

    expect(JSON.parse((await storage.readText(SENDS_PATH)) ?? '')).toEqual({ sends: [entry] });
  });

  it('with earlier entries, adds one entry after them and keeps them whole, unknown fields included', async () => {
    const storage = await issued();
    const earlier = { ...entryWith('id-1', 'aa'), addedByALaterVersion: { kept: true } };
    await storage.writeNew(SENDS_PATH, JSON.stringify({ sends: [earlier] }));
    const next = entryWith('id-2', 'bb');

    await appendSend(storage, '2030-001', next);

    expect(JSON.parse((await storage.readText(SENDS_PATH)) ?? '')).toEqual({ sends: [earlier, next] });
  });

  it('with a broken log file, refuses and leaves it as it was', async () => {
    const storage = await issued();
    await storage.writeNew(SENDS_PATH, '{"sends":"not a list"}');

    const append = appendSend(storage, '2030-001', entryWith('id-1', 'aa'));

    await expect(append).rejects.toThrow(SENDS_PATH);
    expect(await storage.readText(SENDS_PATH)).toBe('{"sends":"not a list"}');
  });

  it('with two appends at once, keeps both', async () => {
    const storage = await issued();

    await Promise.all([appendSend(storage, '2030-001', entryWith('id-1', 'aa')), appendSend(storage, '2030-001', entryWith('id-2', 'bb'))]);

    expect((await readSendLog(storage, '2030-001')).map((entry) => entry.messageId)).toEqual(['id-1', 'id-2']);
  });

  it('with a log in the invoice folder, is not reported as a sync copy', async () => {
    const storage = await issued();
    await appendSend(storage, '2030-001', entryWith('id-1', 'aa'));

    const conflicts = await findFolderConflicts(storage, '2030');

    expect(conflicts).toEqual([]);
  });
});

describe('readSendHistory AC-18', () => {
  it('with an entry for the PDF on disk, does not mark it', async () => {
    const storage = await issued();
    await storage.replace(PDF_PATH, '%PDF-current');
    const hash = createHash('sha256').update('%PDF-current').digest('hex');
    await appendSend(storage, '2030-001', entryWith('id-1', hash));

    const history = await readSendHistory(storage, '2030-001');

    expect(history).toEqual([{ ...entryWith('id-1', hash), earlierVersion: false }]);
  });

  it('with an entry whose hash differs from the PDF on disk, marks it an earlier version', async () => {
    const storage = await issued();
    await storage.replace(PDF_PATH, '%PDF-current');
    const before = createHash('sha256').update('%PDF-old').digest('hex');
    const now = createHash('sha256').update('%PDF-current').digest('hex');
    await appendSend(storage, '2030-001', entryWith('id-1', before));
    await appendSend(storage, '2030-001', entryWith('id-2', now));

    const history = await readSendHistory(storage, '2030-001');

    expect(history.map((entry) => entry.earlierVersion)).toEqual([true, false]);
  });

  it('with no PDF on disk, cannot compare and does not mark it', async () => {
    const storage = await issued();
    await appendSend(storage, '2030-001', entryWith('id-1', 'aa'));
    await storage.remove(PDF_PATH);

    const history = await readSendHistory(storage, '2030-001');

    expect(history.map((entry) => entry.earlierVersion)).toEqual([false]);
  });
});
