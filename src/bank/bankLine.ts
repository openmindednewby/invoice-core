import type { ClassSource } from './ClassSource';
import type { LineKind } from './LineKind';
import type { ProofKind } from './ProofKind';

export interface BankLine {
  date: string;
  valueDate: string | null;
  description: string;
  type: string;
  reference: string;
  bankReference: string;
  branchCode: string;
  amountCents: number;
  balanceCents: number | null;
}

export interface BocStatement {
  accountNumber: string;
  accountName: string;
  accountType: string;
  currency: string;
  period: string;
  periodFrom: string | null;
  periodTo: string | null;
  lines: BankLine[];
  skippedRows: number;
}

export interface ProofLink {
  kind: ProofKind;
  ref: string;
  files: string[];
}

export interface LineClass {
  kind: LineKind;
  category: string | null;
  needsReview: boolean;
  billNumber: string | null;
  invoiceNumbers: string[];
  why: LineWhy;
}

export interface LineWhy {
  source: ClassSource;
  match: string | null;
}

export interface LedgerLine extends BankLine, LineClass {
  key: string;
  account: string;
  proof: ProofLink | null;
  statementFile: string;
}

export interface LineRef {
  account: string;
  key: string;
}
