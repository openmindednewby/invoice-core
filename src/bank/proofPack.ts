import { textCell } from '../exportCsv';
import type { ExpenseCategory } from '../expenses/categories';
import { centsToAmount } from '../money';
import type { LedgerLine } from './bankLine';
import { proofMissing } from './proof';

const BOM = '﻿';
const NEWLINE = '\r\n';
const HEADER = ['date', 'description', 'kind', 'category', 'amount', 'proof', 'statement'];
const FILE_SEPARATOR = ' ; ';
export const MISSING_PROOF = 'MISSING';

export interface BankProofPack {
  fileName: string;
  csv: string;
  statementFiles: string[];
  lineCount: number;
  missingCount: number;
}

function proofCell(line: LedgerLine): string {
  if (proofMissing(line)) {
    return MISSING_PROOF;
  }
  return line.proof === null ? '' : line.proof.files.join(FILE_SEPARATOR);
}

function row(line: LedgerLine, names: Map<string, string>): string {
  const category = line.category === null ? '' : (names.get(line.category) ?? line.category);
  return [
    line.date, textCell(line.description), line.kind, textCell(category), centsToAmount(line.amountCents), textCell(proofCell(line)), textCell(line.statementFile),
  ].join(',');
}

/** The accountant's CSV of one YYYY-MM month's bank lines, oldest first, each with its proof or MISSING. */
export function bankProofPack(lines: LedgerLine[], month: string, categories: ExpenseCategory[]): BankProofPack {
  const names = new Map(categories.map((category) => [category.id, category.name]));
  const inMonth = lines.filter((line) => line.date.startsWith(`${month}-`)).sort((a, b) => a.date.localeCompare(b.date));
  const csv = `${BOM}${[HEADER.join(','), ...inMonth.map((line) => row(line, names))].join(NEWLINE)}${NEWLINE}`;
  return {
    fileName: `bank-proof-${month}.csv`, csv, statementFiles: [...new Set(inMonth.map((line) => line.statementFile))],
    lineCount: inMonth.length, missingCount: inMonth.filter(proofMissing).length,
  };
}
