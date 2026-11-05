import { StorageExistsError } from './storage';
import type { InvoiceStorage } from './storage';

function toBytes(data: string | Uint8Array): Uint8Array {
  return typeof data === 'string' ? new TextEncoder().encode(data) : data;
}

function childName(path: string, prefix: string): string[] {
  return path.startsWith(prefix) ? [path.slice(prefix.length).split('/')[0] ?? ''] : [];
}

/** Creates an in-memory storage, for tests and previews. */
export function createMemoryStorage(initial: Record<string, string | Uint8Array> = {}): InvoiceStorage {
  const files = new Map(Object.entries(initial).map(([path, data]) => [path, toBytes(data)]));
  const queues = new Map<string, Promise<unknown>>();
  return {
    readText: (path): Promise<string | null> => {
      const bytes = files.get(path);
      return Promise.resolve(bytes ? new TextDecoder().decode(bytes) : null);
    },
    readBytes: (path): Promise<Uint8Array | null> => Promise.resolve(files.get(path) ?? null),
    list: (dir): Promise<string[]> => {
      const prefix = dir === '' ? '' : `${dir}/`;
      return Promise.resolve([...new Set([...files.keys()].flatMap((path) => childName(path, prefix)))].sort((a, b) => a.localeCompare(b)));
    },
    writeNew: (path, data): Promise<void> => {
      if (files.has(path)) {
        return Promise.reject(new StorageExistsError(path));
      }
      files.set(path, toBytes(data));
      return Promise.resolve();
    },
    replace: (path, data): Promise<void> => {
      files.set(path, toBytes(data));
      return Promise.resolve();
    },
    remove: (path): Promise<void> => {
      files.delete(path);
      return Promise.resolve();
    },
    withLock: <T>(name: string, work: () => Promise<T>): Promise<T> => {
      const run = (queues.get(name) ?? Promise.resolve()).then(work, work);
      queues.set(name, run.catch(() => undefined));
      return run;
    },
  };
}
