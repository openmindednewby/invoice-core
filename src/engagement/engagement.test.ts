import { describe, expect, it } from 'vitest';

import { createMemoryStorage } from '../memoryStorage';
import { InvoiceError } from '../types';
import { EngagementMode } from './EngagementMode';
import { engagementDir, listEngagements, openEngagementLedger, readEngagement, startEngagement } from './engagement';

const NOW = new Date('2026-11-28T10:00:00.000Z');
const options = { now: (): Date => NOW, newId: (): string => 'e1' };
const input = { clientId: 'c1', name: 'Exchange MVP', mode: EngagementMode.NewProduct };

describe('startEngagement', () => {
  it('with a client, creates the engagement folder with an empty ledger.json', async () => {
    const storage = createMemoryStorage();

    await startEngagement(storage, input, options);

    expect(await storage.readText('clients/c1/engagements/e1/ledger.json')).toBe('[]');
    expect(await storage.list('clients/c1/engagements/e1')).toEqual(['engagement.json', 'ledger.json']);
  });

  it('with a client, stores engagement.json with id, client, name, mode, steps and createdAt', async () => {
    const storage = createMemoryStorage();

    const engagement = await startEngagement(storage, input, options);

    expect(engagement).toEqual(expect.objectContaining({ id: 'e1', clientId: 'c1', name: 'Exchange MVP', mode: 'new-product', createdAt: NOW.toISOString() }));
    expect(engagement.steps.length).toBeGreaterThan(0);
    expect(JSON.parse((await storage.readText('clients/c1/engagements/e1/engagement.json')) ?? '')).toEqual(engagement);
  });

  it('with an id already used, refuses and leaves the first engagement unchanged', async () => {
    const storage = createMemoryStorage();
    const first = await startEngagement(storage, input, options);

    const second = startEngagement(storage, { ...input, name: 'Other' }, options);

    await expect(second).rejects.toBeInstanceOf(InvoiceError);
    expect(await readEngagement(storage, 'c1', 'e1')).toEqual(first);
  });

  it('with a blank name, refuses and writes nothing', async () => {
    const storage = createMemoryStorage();

    const start = startEngagement(storage, { ...input, name: '  ' }, options);

    await expect(start).rejects.toBeInstanceOf(InvoiceError);
    expect(await storage.list('')).toEqual([]);
  });

  it('with a client id that escapes its folder, refuses and writes nothing', async () => {
    const storage = createMemoryStorage();

    const start = startEngagement(storage, { ...input, clientId: '../x' }, options);

    await expect(start).rejects.toBeInstanceOf(InvoiceError);
    expect(await storage.list('')).toEqual([]);
  });
});

describe('listEngagements', () => {
  it('with two engagements on a client, lists both oldest first and none of another client', async () => {
    const storage = createMemoryStorage();
    await startEngagement(storage, input, { now: (): Date => new Date('2026-11-28T10:00:00.000Z'), newId: (): string => 'e1' });
    await startEngagement(storage, { ...input, name: 'Second' }, { now: (): Date => new Date('2026-11-29T10:00:00.000Z'), newId: (): string => 'e2' });
    await startEngagement(storage, { ...input, clientId: 'c2' }, options);

    const list = await listEngagements(storage, 'c1');

    expect(list.map((e) => e.id)).toEqual(['e1', 'e2']);
  });

  it('with a client that has none, returns an empty list', async () => {
    const list = await listEngagements(createMemoryStorage(), 'c1');

    expect(list).toEqual([]);
  });
});

describe('engagementDir', () => {
  it('with a client and engagement, returns clients/<id>/engagements/<eid>', () => {
    expect(engagementDir('c1', 'e1')).toBe('clients/c1/engagements/e1');
  });
});

describe('openEngagementLedger', () => {
  it('with a new engagement, adds a file inside the engagement folder and verifies it', async () => {
    const storage = createMemoryStorage();
    await startEngagement(storage, input, options);
    const ledger = await openEngagementLedger(storage, 'c1', 'e1');

    const entry = await ledger.add({ name: 'a.txt', bytes: new TextEncoder().encode('x') }, { kind: 'note', source: 'test' });

    expect(await storage.readBytes(`clients/c1/engagements/e1/items/${entry.itemId}/1/a.txt`)).not.toBeNull();
    expect((await ledger.verify()).ok).toBe(true);
    expect(JSON.parse((await storage.readText('clients/c1/engagements/e1/ledger.json')) ?? '')).toHaveLength(1);
  });

  it('with a file changed on disk, verify reports a hash mismatch', async () => {
    const storage = createMemoryStorage();
    await startEngagement(storage, input, options);
    const ledger = await openEngagementLedger(storage, 'c1', 'e1');
    const entry = await ledger.add({ name: 'a.txt', bytes: new TextEncoder().encode('x') }, { kind: 'note', source: 'test' });
    await storage.replace(`clients/c1/engagements/e1/items/${entry.itemId}/1/a.txt`, 'tampered');

    const result = await ledger.verify();

    expect(result.mismatches.map((m) => m.reason)).toEqual(['hash-mismatch']);
  });

  it('with an engagement that does not exist, refuses', async () => {
    const open = openEngagementLedger(createMemoryStorage(), 'c1', 'nope');

    await expect(open).rejects.toBeInstanceOf(InvoiceError);
  });
});
