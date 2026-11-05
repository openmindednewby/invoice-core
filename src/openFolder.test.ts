import { describe, expect, it } from 'vitest';

import { FolderOpenState } from './FolderOpenState';
import { createMemoryStorage } from './memoryStorage';
import { openDataFolder } from './openFolder';
import { isStorageExistsError, StorageExistsError } from './storage';

describe('openDataFolder AC-01', () => {
  it('with an empty folder, writes format.json and reports new', async () => {
    const storage = createMemoryStorage();

    const state = await openDataFolder(storage);

    expect(state).toBe(FolderOpenState.New);
    expect(JSON.parse((await storage.readText('format.json')) ?? '')).toEqual({ version: 1 });
  });

  it('with only operating system files, treats the folder as new', async () => {
    const storage = createMemoryStorage({ 'desktop.ini': 'x', '.DS_Store': 'x' });

    const state = await openDataFolder(storage);

    expect(state).toBe(FolderOpenState.New);
  });

  it('with format.json present, reports existing and rewrites nothing', async () => {
    const storage = createMemoryStorage({ 'format.json': '{ "version": 1 }' });

    const state = await openDataFolder(storage);

    expect(state).toBe(FolderOpenState.Existing);
    expect(await storage.readText('format.json')).toBe('{ "version": 1 }');
  });

  it('with a format newer than this code, refuses and names the format', async () => {
    const storage = createMemoryStorage({ 'format.json': '{ "version": 999 }' });

    const open = openDataFolder(storage);

    await expect(open).rejects.toThrow('format');
  });

  it.each(['company.json', 'clients/acme.json', 'invoices/2030/2030-001/invoice.json', '2030/2030-001.json'])('with %j and no format, reports legacy and writes nothing', async (path) => {
    const storage = createMemoryStorage({ [path]: '{}' });

    const state = await openDataFolder(storage);

    expect(state).toBe(FolderOpenState.Legacy);
    expect(await storage.readText('format.json')).toBeNull();
  });

  it('with unrelated files, reports foreign and writes nothing', async () => {
    const storage = createMemoryStorage({ 'holiday.jpg': 'x', 'notes/a.txt': 'x' });

    const state = await openDataFolder(storage);

    expect(state).toBe(FolderOpenState.Foreign);
    expect(await storage.list('')).toEqual(['holiday.jpg', 'notes']);
  });
});

describe('isStorageExistsError', () => {
  it('with this package\'s error, is true', () => {
    const error = new StorageExistsError('a');

    const result = isStorageExistsError(error);

    expect(result).toBe(true);
  });

  it('with another package\'s error of the same name, is true', () => {
    const error = Object.assign(new Error('taken'), { name: 'StorageExistsError' });

    const result = isStorageExistsError(error);

    expect(result).toBe(true);
  });

  it.each([new DOMException('no', 'NotAllowedError'), new Error('disk full'), null, 'StorageExistsError'])('with %j, is false', (value) => {
    const result = isStorageExistsError(value);

    expect(result).toBe(false);
  });
});
