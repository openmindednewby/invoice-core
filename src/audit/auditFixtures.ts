import type { LedgerLine } from '../bank/bankLine';
import { ClassSource } from '../bank/ClassSource';
import { LineKind } from '../bank/LineKind';
import { ProofKind } from '../bank/ProofKind';

export const CARD_TYPE = 'Card Purchase - Local';
export const TRANSFER_TYPE = 'BOC Transfer';
export const FEE_TYPE = 'Commission - Fee';
export const DIRECT_DEBIT_TYPE = 'Direct Debit';

export interface AuditLineInput {
  readonly date: string;
  readonly kind: LineKind;
  readonly amountCents: number;
  readonly type?: string;
  readonly category?: string | null;
  readonly proven?: boolean;
}

/** A synthetic ledger line for audit tests. */
export function auditLine(input: AuditLineInput): LedgerLine {
  const { date, kind, amountCents, type = TRANSFER_TYPE, category = null, proven = false } = input;
  return {
    date, valueDate: null, description: `SAMPLE ${kind} ${date}`, type, reference: 'REF', bankReference: '', branchCode: '0001', amountCents, balanceCents: null,
    kind, category, needsReview: kind === LineKind.ToReview, billNumber: null, invoiceNumbers: [], why: { source: ClassSource.Manual, match: null },
    key: `${date}-${String(amountCents)}-${kind}`, account: 'SAMPLE-ACCOUNT', statementFile: 'sample.xlsx',
    proof: proven ? { kind: ProofKind.Expense, ref: 'expenses/sample', files: ['expenses/sample/receipt/a.pdf'] } : null,
  };
}
