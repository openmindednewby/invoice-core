export interface InvoiceStorage {
  /** Returns the file as text, or null if it does not exist. */
  readText(path: string): Promise<string | null>;
  /** Returns the file as bytes, or null if it does not exist. */
  readBytes(path: string): Promise<Uint8Array | null>;
  /** Returns the names of a folder's direct children; empty if it does not exist. */
  list(dir: string): Promise<string[]>;
  /** Creates a file and its parents; throws StorageExistsError if the file exists. */
  writeNew(path: string, data: string | Uint8Array): Promise<void>;
  /** Creates or overwrites a file; never used on an issued record. */
  replace(path: string, data: string | Uint8Array): Promise<void>;
  /** Deletes a file; does nothing if it does not exist. */
  remove(path: string): Promise<void>;
  /** Runs work while holding the named lock; other holders of that name wait. */
  withLock<T>(name: string, work: () => Promise<T>): Promise<T>;
}

export class StorageExistsError extends Error {
  constructor(path: string) {
    super(`already exists: ${path}`);
    this.name = 'StorageExistsError';
  }
}

/** Whether an error means the file exists; matched by name, so another package's class of this name counts. */
export function isStorageExistsError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'StorageExistsError';
}
