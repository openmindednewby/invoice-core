import type { InvoiceStorage } from '../storage';
import { InvoiceError } from '../types';
import { isRealDate } from '../validate';
import { BillStatus } from './BillStatus';
import { readBill, saveBill } from './billFolder';
import type { Bill } from './billFile';

export const PROOF_DIR = 'proof';
const PROOF_TYPES = new Set(['pdf', 'png', 'jpg', 'jpeg']);
const UNSAFE_NAME = /[^\p{L}\p{N}._ -]+/gu;
const FIRST_COPY = 2;

export interface ProofFile {
  name: string;
  bytes: Uint8Array;
}

function extension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

/** Whether a file can be kept as a payment proof (PDF, PNG or JPG). */
export function isProofFile(name: string): boolean {
  return PROOF_TYPES.has(extension(name));
}

function freeName(name: string, taken: Set<string>): string {
  const safe = name.replace(UNSAFE_NAME, '-');
  const dot = safe.lastIndexOf('.');
  let candidate = safe;
  let copy = FIRST_COPY;
  while (taken.has(candidate.toLowerCase())) {
    candidate = `${safe.slice(0, dot)}-${copy}${safe.slice(dot)}`;
    copy += 1;
  }
  return candidate;
}

function checkPaidOn(bill: Bill, paidOn: string): void {
  if (!isRealDate(paidOn)) {
    throw new InvoiceError([{ path: 'paidOn', message: 'must be a real date as YYYY-MM-DD' }]);
  }
  if (paidOn < bill.issueDate) {
    throw new InvoiceError([{ path: 'paidOn', message: `must not be before the bill date ${bill.issueDate}` }]);
  }
}

function lockName(dir: string): string {
  return `bill:${dir}`;
}

/** Refuses the files if one is not a PDF, PNG or JPG; path names the field. */
export function checkProofTypes(files: ProofFile[], path: string): void {
  const unsupported = files.find((file) => !isProofFile(file.name));
  if (unsupported !== undefined) {
    throw new InvoiceError([{ path, message: `${unsupported.name} is not a PDF, PNG or JPG` }]);
  }
}

/** Copies files into folder under names never used there before; returns the names used. */
export async function copyProofFiles(storage: InvoiceStorage, folder: string, files: ProofFile[]): Promise<string[]> {
  const taken = new Set((await storage.list(folder)).map((name) => name.toLowerCase()));
  const added: string[] = [];
  for (const file of files) {
    const name = freeName(file.name, taken);
    await storage.writeNew(`${folder}/${name}`, file.bytes);
    taken.add(name.toLowerCase());
    added.push(name);
  }
  return added;
}

/** Copies proofs into proof/ under names never used before, and marks the bill paid when a paid-on date is given. */
export function addProof(storage: InvoiceStorage, dir: string, files: ProofFile[], paidOn: string | null): Promise<Bill> {
  return storage.withLock(lockName(dir), async () => {
    checkProofTypes(files, PROOF_DIR);
    const bill = await readBill(storage, dir);
    if (paidOn !== null) {
      checkPaidOn(bill, paidOn);
    }
    const added = await copyProofFiles(storage, `${dir}/${PROOF_DIR}`, files);
    const paid = paidOn === null ? {} : { status: BillStatus.Paid, paidOn };
    const updated: Bill = { ...bill, ...paid, proofFiles: [...bill.proofFiles, ...added] };
    await saveBill(storage, updated);
    return updated;
  });
}

/** Marks a bill paid on a date not before its issue date. */
export function markBillPaid(storage: InvoiceStorage, dir: string, paidOn: string): Promise<Bill> {
  return storage.withLock(lockName(dir), async () => {
    const bill = await readBill(storage, dir);
    checkPaidOn(bill, paidOn);
    const updated: Bill = { ...bill, status: BillStatus.Paid, paidOn };
    await saveBill(storage, updated);
    return updated;
  });
}

/** Marks a bill unpaid again; its proofs stay in proof/. */
export function markBillUnpaid(storage: InvoiceStorage, dir: string): Promise<Bill> {
  return storage.withLock(lockName(dir), async () => {
    const updated: Bill = { ...(await readBill(storage, dir)), status: BillStatus.Unpaid, paidOn: null };
    await saveBill(storage, updated);
    return updated;
  });
}
