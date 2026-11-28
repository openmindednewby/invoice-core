import type { LedgerStorage } from '@dloizides/evidence-ledger';

import type { InvoiceStorage } from '../storage';

export function ledgerStorageAt(storage: InvoiceStorage, dir: string): LedgerStorage {
  return {
    read: (path) => storage.readBytes(`${dir}/${path}`),
    write: (path, bytes) => storage.replace(`${dir}/${path}`, bytes),
  };
}
