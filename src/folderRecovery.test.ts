import { createFolderStorage } from '@dloizides/folder-store';
import type { FolderStorage } from '@dloizides/folder-store';
import { createFakeFolder, createFakeLocks } from '@dloizides/folder-store/testing';
import type { FakeFolder } from '@dloizides/folder-store/testing';
import { describe, expect, it } from 'vitest';

import { findFolderConflicts } from './conflicts';
import { exportQuarterCsv } from './exportCsv';
import { migrateLegacyFolder } from './folder';
import { FolderConflictKind } from './FolderConflictKind';
import { FolderOpenState } from './FolderOpenState';
import { issueInvoice, listIssued, reprintInvoice } from './issue';
import { nextNumber } from './numbering';
import { openDataFolder } from './openFolder';
import { clientJson, companyJson, fakePdf, REQUEST } from './testing/fixtures';

const RENDER = { render: fakePdf };
const PDF_TEXT = '%PDF-fake';
const OLD_PDF = new TextEncoder().encode('%PDF-old');
const RECORD_TEXT = '{"number":"2030-001"}';
const INVOICE = { ...REQUEST, date: '2030-10-08' };

async function seeded(root: FakeFolder = createFakeFolder()): Promise<FolderStorage> {
  const storage = createFolderStorage(root, { locks: createFakeLocks() });
  await storage.writeNew('company.json', companyJson());
  await storage.writeNew('clients/acme.json', clientJson());
  await storage.writeNew('format.json', '{"version":1}');
  return storage;
}

describe('issueInvoice after a failed record write AC-09', () => {
  it('with the folder left behind, the retry takes the same number and leaves no gap', async () => {
    const root = createFakeFolder();
    const storage = await seeded(root);
    root.state.writeFailures.push(new Error('disk full'));
    await issueInvoice(storage, INVOICE, RENDER).catch(() => undefined);

    const retry = await issueInvoice(storage, INVOICE, RENDER);

    expect(retry.number).toBe('2030-001');
    expect((await listIssued(storage, '2030')).map((record) => record.number)).toEqual(['2030-001']);
  });
});

describe('findFolderConflicts on record-less folders AC-09', () => {
  it('with an empty folder above every record, finds nothing because its number is unused', async () => {
    const root = createFakeFolder();
    const storage = await seeded(root);
    root.state.writeFailures.push(new Error('disk full'));
    await issueInvoice(storage, INVOICE, RENDER).catch(() => undefined);

    const conflicts = await findFolderConflicts(storage, '2030');

    expect(await storage.list('invoices/2030')).toEqual(['2030-001']);
    expect(conflicts).toEqual([]);
  });

  it('with an empty folder below a record, reports the missing record', async () => {
    const storage = await seeded();
    await issueInvoice(storage, INVOICE, RENDER);
    await issueInvoice(storage, INVOICE, RENDER);
    await storage.remove('invoices/2030/2030-001/invoice.json');
    await storage.remove('invoices/2030/2030-001/2030-001.pdf');

    const conflicts = await findFolderConflicts(storage, '2030');

    expect(conflicts).toEqual([{ kind: FolderConflictKind.MissingRecord, path: 'invoices/2030/2030-001' }]);
  });

  it('with a PDF and no record, reports the missing record and the number stays uncounted', async () => {
    const storage = await seeded();
    await storage.writeNew('invoices/2030/2030-001/2030-001.pdf', OLD_PDF);

    const conflicts = await findFolderConflicts(storage, '2030');
    const next = await nextNumber(storage, '2030');

    expect(conflicts).toEqual([{ kind: FolderConflictKind.MissingRecord, path: 'invoices/2030/2030-001' }]);
    expect(next).toBe('2030-001');
  });
});

describe('a record with no usable PDF', () => {
  it('with a 0-byte PDF left by a crash, reprintInvoice replaces it', async () => {
    const storage = await seeded();
    const render = (): Promise<Uint8Array> => Promise.resolve(new TextEncoder().encode(PDF_TEXT));
    const { pdfPath } = await issueInvoice(storage, INVOICE, { render });
    await storage.replace(pdfPath, new Uint8Array());

    await reprintInvoice(storage, '2030-001', { render });

    expect(new TextDecoder().decode((await storage.readBytes(pdfPath)) ?? new Uint8Array())).toBe(PDF_TEXT);
  });

  it('with a good PDF, reprintInvoice still refuses', async () => {
    const storage = await seeded();
    await issueInvoice(storage, INVOICE, RENDER);

    const attempt = reprintInvoice(storage, '2030-001', RENDER);

    await expect(attempt).rejects.toMatchObject({ errors: [{ path: 'number' }] });
  });

  it('with a 0-byte PDF, reports it', async () => {
    const storage = await seeded();
    const { pdfPath } = await issueInvoice(storage, INVOICE, RENDER);
    await storage.replace(pdfPath, new Uint8Array());

    const conflicts = await findFolderConflicts(storage, '2030');

    expect(conflicts).toEqual([{ kind: FolderConflictKind.MissingPdf, path: pdfPath }]);
  });

  it('with a missing PDF, reports it and the next issue still goes through', async () => {
    const storage = await seeded();
    const { pdfPath } = await issueInvoice(storage, INVOICE, RENDER);
    await storage.remove(pdfPath);

    const conflicts = await findFolderConflicts(storage, '2030');
    const next = await issueInvoice(storage, INVOICE, RENDER);

    expect(conflicts).toEqual([{ kind: FolderConflictKind.MissingPdf, path: pdfPath }]);
    expect(next.number).toBe('2030-002');
  });
});

describe('a folder still in the old layout AC-16', () => {
  async function legacy(): Promise<FolderStorage> {
    const storage = createFolderStorage(createFakeFolder(), { locks: createFakeLocks() });
    await storage.writeNew('company.json', companyJson());
    await storage.writeNew('clients/acme.json', clientJson());
    await storage.writeNew('2030/2030-001.json', RECORD_TEXT);
    return storage;
  }

  it('with old files, issueInvoice refuses and writes no format file', async () => {
    const storage = await legacy();

    const attempt = issueInvoice(storage, INVOICE, RENDER);

    await expect(attempt).rejects.toMatchObject({ errors: [{ path: 'folder' }] });
    expect(await storage.readText('format.json')).toBeNull();
  });

  it('with old files, exportQuarterCsv refuses instead of leaving them out', async () => {
    const storage = await legacy();

    const attempt = exportQuarterCsv(storage, '2030', 4);

    await expect(attempt).rejects.toMatchObject({ errors: [{ path: 'folder' }] });
  });

  it('with a format file and old files, openDataFolder still says legacy', async () => {
    const storage = await legacy();
    await storage.writeNew('format.json', '{"version":1}');

    const state = await openDataFolder(storage);

    expect(state).toBe(FolderOpenState.Legacy);
  });
});

describe('migrateLegacyFolder after a crash AC-05', () => {
  async function legacyPair(): Promise<FolderStorage> {
    const storage = await seeded();
    await storage.writeNew('2030/2030-001.json', RECORD_TEXT);
    await storage.writeNew('2030/2030-001.pdf', OLD_PDF);
    return storage;
  }

  it('with the record copied and the PDF not, finishes the move', async () => {
    const storage = await legacyPair();
    await storage.writeNew('invoices/2030/2030-001/invoice.json', RECORD_TEXT);

    const result = await migrateLegacyFolder(storage);

    expect(result).toEqual({ moved: ['2030-001'], conflicts: [] });
    expect(await storage.readBytes('invoices/2030/2030-001/2030-001.pdf')).toEqual(OLD_PDF);
    expect(await storage.list('2030')).toEqual([]);
  });

  it('with both copied and the old files still there, removes them', async () => {
    const storage = await legacyPair();
    await storage.writeNew('invoices/2030/2030-001/invoice.json', RECORD_TEXT);
    await storage.writeNew('invoices/2030/2030-001/2030-001.pdf', OLD_PDF);

    const result = await migrateLegacyFolder(storage);

    expect(result).toEqual({ moved: ['2030-001'], conflicts: [] });
    expect(await storage.list('2030')).toEqual([]);
  });

  it('with only the old PDF left and both targets in place, removes it', async () => {
    const storage = await seeded();
    await storage.writeNew('2030/2030-001.pdf', OLD_PDF);
    await storage.writeNew('invoices/2030/2030-001/invoice.json', RECORD_TEXT);
    await storage.writeNew('invoices/2030/2030-001/2030-001.pdf', OLD_PDF);

    const result = await migrateLegacyFolder(storage);

    expect(result).toEqual({ moved: ['2030-001'], conflicts: [] });
    expect(await storage.list('2030')).toEqual([]);
  });

  it('with a 0-byte target from the crash, writes the old content over it', async () => {
    const storage = await legacyPair();
    await storage.writeNew('invoices/2030/2030-001/invoice.json', '');

    const result = await migrateLegacyFolder(storage);

    expect(result.moved).toEqual(['2030-001']);
    expect(await storage.readText('invoices/2030/2030-001/invoice.json')).toBe(RECORD_TEXT);
  });

  it('with an old PDF and a new-layout record that has no PDF, keeps it as a conflict', async () => {
    const storage = await seeded();
    await storage.writeNew('2030/2030-001.pdf', OLD_PDF);
    await storage.writeNew('invoices/2030/2030-001/invoice.json', RECORD_TEXT);

    const result = await migrateLegacyFolder(storage);

    expect(result).toEqual({ moved: [], conflicts: ['2030-001'] });
    expect(await storage.list('2030')).toEqual(['2030-001.pdf']);
  });
});
