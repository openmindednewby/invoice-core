import { createFolderStorage } from '@dloizides/folder-store';
import type { FolderStorage } from '@dloizides/folder-store';
import { createFakeFolder, createFakeLocks } from '@dloizides/folder-store/testing';
import type { FakeFolder } from '@dloizides/folder-store/testing';
import { describe, expect, it } from 'vitest';

import { issueInvoice } from './issue';
import { nextNumber } from './numbering';
import { openDataFolder } from './openFolder';
import { FolderOpenState } from './FolderOpenState';
import type { InvoiceStorage } from './storage';
import { clientJson, companyJson, fakePdf, REQUEST } from './testing/fixtures';

function tabOn(root: FakeFolder, locks = createFakeLocks()): FolderStorage {
  return createFolderStorage(root, { locks });
}

async function seed(storage: InvoiceStorage): Promise<void> {
  await storage.writeNew('company.json', companyJson());
  await storage.writeNew('clients/acme.json', clientJson());
}

describe('issueInvoice over two browser tabs AC-09', () => {
  it('with six issues at once from two tabs, gives six different numbers with no gaps', async () => {
    const root = createFakeFolder();
    const locks = createFakeLocks();
    const tabA = tabOn(root, locks);
    const tabB = tabOn(root, locks);
    await seed(tabA);
    const request = { ...REQUEST, date: '2030-10-08' };
    const tabs = [tabA, tabB, tabA, tabB, tabA, tabB];

    const issued = await Promise.all(tabs.map((tab) => issueInvoice(tab, request, { render: fakePdf })));

    const numbers = issued.map((invoice) => invoice.number).sort((a, b) => a.localeCompare(b));
    expect(numbers).toEqual(['2030-001', '2030-002', '2030-003', '2030-004', '2030-005', '2030-006']);
    expect(await nextNumber(tabA, '2030')).toBe('2030-007');
  });

  it('with two writers that share no lock, never gives one number twice and keeps every record', async () => {
    const root = createFakeFolder();
    await seed(tabOn(root));
    const request = { ...REQUEST, date: '2030-10-08' };

    const results = await Promise.allSettled([tabOn(root), tabOn(root)].map((tab) => issueInvoice(tab, request, { render: fakePdf })));

    const issued = results.flatMap((result) => (result.status === 'fulfilled' ? [result.value.number] : []));
    expect(issued.length).toBeGreaterThan(0);
    expect(new Set(issued).size).toBe(issued.length);
    expect(await tabOn(root).list('invoices/2030')).toEqual(expect.arrayContaining(issued));
  });
});

describe('openDataFolder over a picked folder AC-01', () => {
  it('with an empty folder, writes the versioned format', async () => {
    const storage = tabOn(createFakeFolder());

    const state = await openDataFolder(storage);

    expect(state).toBe(FolderOpenState.New);
    expect(JSON.parse((await storage.readText('format.json')) ?? '')).toEqual({ version: 1 });
  });

  it('with a folder already holding the format, opens it and changes nothing', async () => {
    const storage = tabOn(createFakeFolder());
    await storage.writeNew('format.json', '{ "version": 1 }');

    const state = await openDataFolder(storage);

    expect(state).toBe(FolderOpenState.Existing);
    expect(await storage.readText('format.json')).toBe('{ "version": 1 }');
  });
});

describe('isStorageExistsError across packages', () => {
  it('with folder-store refusing a taken number, reports it as already issued', async () => {
    const root = createFakeFolder();
    const storage = tabOn(root);
    await seed(storage);
    await storage.writeNew('invoices/2030/2030-001/invoice.json', '{}');
    const { claimInvoice } = await import('./numbering');

    const claim = claimInvoice(storage, { number: '2030-001' } as never);

    await expect(claim).rejects.toThrow('2030-001 is already issued');
  });
});
