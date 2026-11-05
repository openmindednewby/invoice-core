import { describe, expect, it } from 'vitest';

import { findFolderConflicts } from './conflicts';
import { issueCreditNote } from './creditNote';
import { FolderConflictKind } from './FolderConflictKind';
import { issueInvoice } from './issue';
import { createMemoryStorage } from './memoryStorage';
import { issueDueMonths, prepareYearSchedule } from './schedule';
import type { InvoiceStorage } from './storage';
import { fakePdf, makeStorage, REQUEST } from './testing/fixtures';
import { InvoiceError } from './types';

const RENDER = { render: fakePdf };
const REQUEST_2030 = { ...REQUEST, date: '2030-10-08' };

function record(number: string): string {
  return JSON.stringify({ number });
}

async function issuedStorage(): Promise<InvoiceStorage> {
  const storage = makeStorage();
  await issueInvoice(storage, REQUEST_2030, RENDER);
  return storage;
}

describe('findFolderConflicts AC-11', () => {
  it('with a clean year, finds nothing', async () => {
    const storage = await issuedStorage();
    await storage.writeNew('invoices/2030/2030-001/status.json', '{}');

    const conflicts = await findFolderConflicts(storage, '2030');

    expect(conflicts).toEqual([]);
  });

  it('with a missing year, finds nothing', async () => {
    const storage = createMemoryStorage();

    const conflicts = await findFolderConflicts(storage, '2030');

    expect(conflicts).toEqual([]);
  });

  it('with operating system files, ignores them', async () => {
    const storage = await issuedStorage();
    await storage.writeNew('invoices/2030/desktop.ini', 'x');
    await storage.writeNew('invoices/2030/2030-001/.DS_Store', 'x');
    await storage.writeNew('2030/Thumbs.db', 'x');

    const conflicts = await findFolderConflicts(storage, '2030');

    expect(conflicts).toEqual([]);
  });

  it.each(['2030-001 (1)', '2030-001 - Copy', "2030-001 (Dimi's conflicted copy 2030-10-09)", '2030-001-DESKTOP-ABC'])('with a copied number folder %j, reports a sync copy', async (name) => {
    const storage = await issuedStorage();
    await storage.writeNew(`invoices/2030/${name}/invoice.json`, record('2030-001'));

    const conflicts = await findFolderConflicts(storage, '2030');

    expect(conflicts).toEqual([{ kind: FolderConflictKind.SyncCopy, path: `invoices/2030/${name}` }]);
  });

  it.each(['invoice (1).json', 'invoice-DESKTOP-ABC.json', '2030-001 (conflicted copy).pdf', 'status (1).json'])('with a copied file %j inside a number folder, reports a sync copy', async (name) => {
    const storage = await issuedStorage();
    await storage.writeNew(`invoices/2030/2030-001/${name}`, 'x');

    const conflicts = await findFolderConflicts(storage, '2030');

    expect(conflicts).toEqual([{ kind: FolderConflictKind.SyncCopy, path: `invoices/2030/2030-001/${name}` }]);
  });

  it('with one number written two ways, reports the duplicate', async () => {
    const storage = await issuedStorage();
    await storage.writeNew('invoices/2030/2030-01/invoice.json', record('2030-01'));

    const conflicts = await findFolderConflicts(storage, '2030');

    expect(conflicts).toEqual([{ kind: FolderConflictKind.DuplicateNumber, path: 'invoices/2030/2030-01' }]);
  });

  it('with an invoice and a credit note of equal digits, reports no duplicate', async () => {
    const storage = await issuedStorage();
    await storage.writeNew('invoices/2030/CN-2030-001/invoice.json', record('CN-2030-001'));

    const conflicts = await findFolderConflicts(storage, '2030');

    expect(conflicts).toEqual([]);
  });

  it('with a record whose number differs from its folder, reports the duplicate', async () => {
    const storage = await issuedStorage();
    await storage.writeNew('invoices/2030/2030-002/invoice.json', record('2030-001'));

    const conflicts = await findFolderConflicts(storage, '2030');

    expect(conflicts).toEqual([{ kind: FolderConflictKind.DuplicateNumber, path: 'invoices/2030/2030-002/invoice.json' }]);
  });

  it('with an empty record left by a crash, reports it as unreadable', async () => {
    const storage = await issuedStorage();
    await storage.writeNew('invoices/2030/2030-002/invoice.json', '');

    const conflicts = await findFolderConflicts(storage, '2030');

    expect(conflicts).toEqual([{ kind: FolderConflictKind.UnreadableRecord, path: 'invoices/2030/2030-002/invoice.json' }]);
  });

  it('with a number in the old layout and the new one, reports the duplicate', async () => {
    const storage = await issuedStorage();
    await storage.writeNew('2030/2030-001.json', record('2030-001'));

    const conflicts = await findFolderConflicts(storage, '2030');

    expect(conflicts).toEqual([{ kind: FolderConflictKind.DuplicateNumber, path: '2030/2030-001.json' }]);
  });

  it('with old layout files alone, finds nothing', async () => {
    const storage = createMemoryStorage({ '2030/2030-001.json': record('2030-001'), '2030/2030-001.pdf': 'x' });

    const conflicts = await findFolderConflicts(storage, '2030');

    expect(conflicts).toEqual([]);
  });

  it('with a copied file in the old layout, reports a sync copy', async () => {
    const storage = createMemoryStorage({ '2030/2030-001 (1).json': record('2030-001') });

    const conflicts = await findFolderConflicts(storage, '2030');

    expect(conflicts).toEqual([{ kind: FolderConflictKind.SyncCopy, path: '2030/2030-001 (1).json' }]);
  });
});

describe('issue blocked by a conflict AC-11', () => {
  it('with a sync copy, issueInvoice refuses, names the path and takes no number', async () => {
    const storage = await issuedStorage();
    await storage.writeNew('invoices/2030/2030-001 (1)/invoice.json', record('2030-001'));

    const issue = issueInvoice(storage, REQUEST_2030, RENDER);

    await expect(issue).rejects.toBeInstanceOf(InvoiceError);
    await expect(issue).rejects.toThrow('invoices/2030/2030-001 (1)');
    expect(await storage.list('invoices/2030')).toEqual(['2030-001', '2030-001 (1)']);
  });

  it('with a conflict only in another year, issueInvoice still issues', async () => {
    const storage = await issuedStorage();
    await storage.writeNew('invoices/2029/2029-001 (1)/invoice.json', record('2029-001'));

    const issued = await issueInvoice(storage, REQUEST_2030, RENDER);

    expect(issued.number).toBe('2030-002');
  });

  it('with a sync copy, issueCreditNote refuses and takes no number', async () => {
    const storage = await issuedStorage();
    await storage.writeNew('invoices/2030/2030-001/invoice (1).json', 'x');

    const credit = issueCreditNote(storage, { invoiceNumber: '2030-001', date: '2030-10-09', reason: 'wrong amount' }, RENDER);

    await expect(credit).rejects.toThrow('invoices/2030/2030-001/invoice (1).json');
    expect(await storage.list('invoices/2030')).toEqual(['2030-001']);
  });

  it('with a sync copy, issueDueMonths leaves every month a draft and reports the block', async () => {
    const storage = makeStorage();
    const { id } = await prepareYearSchedule(storage, { clientId: 'acme', year: '2030', monthlyAmount: '100.00' });
    await storage.writeNew('invoices/2030/2030-001 (1)/invoice.json', record('2030-001'));

    const result = await issueDueMonths(storage, id, { today: '2030-03-15', render: fakePdf });

    expect(result.issued).toEqual([]);
    expect(JSON.stringify(result.failed)).toContain('invoices/2030/2030-001 (1)');
  });
});
