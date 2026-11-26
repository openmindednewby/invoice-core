import { BILL_PDF, listBills, readBill } from '../bills/billFolder';
import { PROOF_DIR } from '../bills/billProof';
import { readExpense } from '../expenses/expenseFolder';
import { RECEIPT_DIR } from '../expenses/expensePaths';
import { invoiceDir, pdfPath } from '../folder';
import type { InvoiceStorage } from '../storage';
import type { LedgerLine, LineRef } from './bankLine';
import { updateLedgerLine } from './ledgerStore';
import { LineKind } from './LineKind';
import { ProofKind } from './ProofKind';

const NEEDS_PROOF = new Set<string>([LineKind.Expense, LineKind.Income]);

/** The files that prove a line: an expense's receipts, a bill's PDF and payment proofs, or an invoice's PDF. */
export async function proofFiles(storage: InvoiceStorage, kind: ProofKind, ref: string): Promise<string[]> {
  if (kind === ProofKind.Expense) {
    return (await readExpense(storage, ref)).receiptFiles.map((name) => `${ref}/${RECEIPT_DIR}/${name}`);
  }
  if (kind === ProofKind.Bill) {
    const bill = await readBill(storage, ref);
    const pdf = (await storage.list(ref)).includes(BILL_PDF) ? [`${ref}/${BILL_PDF}`] : [];
    return [...pdf, ...bill.proofFiles.map((name) => `${ref}/${PROOF_DIR}/${name}`)];
  }
  return (await storage.list(invoiceDir(ref))).includes(`${ref}.pdf`) ? [pdfPath(ref)] : [];
}

/** Links a line to the expense folder, bill folder or invoice number that proves it. */
export function linkProof(storage: InvoiceStorage, target: LineRef, kind: ProofKind, ref: string): Promise<LedgerLine> {
  return updateLedgerLine(storage, target.account, target.key, async (line) => ({ ...line, proof: { kind, ref, files: await proofFiles(storage, kind, ref) } }));
}

/** Removes a line's proof link. */
export function unlinkProof(storage: InvoiceStorage, account: string, key: string): Promise<LedgerLine> {
  return updateLedgerLine(storage, account, key, (line) => Promise.resolve({ ...line, proof: null }));
}

/** Whether a line is an expense, bill payment or income and so needs proof. */
export function needsProof(line: LedgerLine): boolean {
  return NEEDS_PROOF.has(line.kind);
}

/** Whether a line needs proof and has no proof file. */
export function proofMissing(line: LedgerLine): boolean {
  return needsProof(line) && (line.proof === null || line.proof.files.length === 0);
}

/** The lines of a YYYY-MM month that need proof and have none, in ledger order. */
export function missingProof(lines: LedgerLine[], month: string): LedgerLine[] {
  return lines.filter((line) => line.date.startsWith(`${month}-`) && proofMissing(line));
}

/** The lines with a bill payment linked to the filed bill of that number and total, when there is one. */
export async function linkPaidBills(storage: InvoiceStorage, lines: LedgerLine[]): Promise<LedgerLine[]> {
  if (!lines.some((line) => line.billNumber !== null)) {
    return lines;
  }
  const { bills } = await listBills(storage);
  return Promise.all(lines.map(async (line) => {
    const bill = bills.find((candidate) => candidate.number === line.billNumber && candidate.totalCents === -line.amountCents);
    return bill === undefined ? line : { ...line, proof: { kind: ProofKind.Bill, ref: bill.dir, files: await proofFiles(storage, ProofKind.Bill, bill.dir) } };
  }));
}
