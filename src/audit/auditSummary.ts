import type { LedgerLine } from '../bank/bankLine';
import { LineKind } from '../bank/LineKind';
import { missingProof, needsProof } from '../bank/proof';
import { taxReserve } from '../tax/reserve';
import type { TaxReserve } from '../tax/reserve';
import { totalsByCategory, totalsByKind, totalsByMethod } from './auditTotals';
import type { CategoryTotal, KindTotal, MethodTotal } from './auditTotals';

export interface ReservePlan {
  readonly plannedDividendsCents?: number;
  readonly plannedSalaryCents?: number;
}

export interface ProofCoverage {
  readonly neededCount: number;
  readonly provenCount: number;
  readonly missing: LedgerLine[];
}

export interface AuditMonth {
  readonly month: string;
  readonly incomeCents: number;
  readonly expensesCents: number;
  readonly reserveToDateCents: number | null;
  readonly proof: ProofCoverage;
}

export interface AuditSummary {
  readonly year: number;
  readonly lineCount: number;
  readonly months: AuditMonth[];
  readonly byKind: KindTotal[];
  readonly byCategory: CategoryTotal[];
  readonly byMethod: MethodTotal[];
  readonly reserve: TaxReserve | null;
}

const MONTHS_IN_YEAR = 12;
const MONTH_DIGITS = 2;
const EXPENSE_KINDS = new Set<string>([LineKind.Expense, LineKind.BankFee]);

interface MonthMoney {
  readonly incomeCents: number;
  readonly expensesCents: number;
}

function moneyOf(lines: readonly LedgerLine[]): MonthMoney {
  const incomeCents = lines.filter((line) => line.kind === LineKind.Income).reduce((total, line) => total + line.amountCents, 0);
  const expensesCents = lines.filter((line) => EXPENSE_KINDS.has(line.kind)).reduce((total, line) => total - line.amountCents, 0);
  return { incomeCents, expensesCents };
}

function proofOf(lines: LedgerLine[], month: string): ProofCoverage {
  const missing = missingProof(lines, month);
  const neededCount = lines.filter(needsProof).length;
  return { neededCount, provenCount: neededCount - missing.length, missing };
}

function monthsOf(lines: LedgerLine[], year: number, plan: ReservePlan): AuditMonth[] {
  return Array.from({ length: MONTHS_IN_YEAR }, (_, index) => {
    const month = `${String(year)}-${String(index + 1).padStart(MONTH_DIGITS, '0')}`;
    const inMonth = lines.filter((line) => line.date.startsWith(`${month}-`));
    const toDate = moneyOf(lines.filter((line) => line.date.slice(0, month.length) <= month));
    const reserveToDate = taxReserve({ year, ...toDate, ...plan });
    return { month, ...moneyOf(inMonth), reserveToDateCents: reserveToDate === null ? null : reserveToDate.reserveCents, proof: proofOf(inMonth, month) };
  });
}

/** One year's audit numbers from ledger lines: months, totals by kind, category and payment method, and the reserve. */
export function auditSummary(lines: readonly LedgerLine[], year: number, plan: ReservePlan = {}): AuditSummary {
  const yearLines = lines.filter((line) => line.date.startsWith(`${String(year)}-`));
  return {
    year,
    lineCount: yearLines.length,
    months: monthsOf(yearLines, year, plan),
    byKind: totalsByKind(yearLines),
    byCategory: totalsByCategory(yearLines),
    byMethod: totalsByMethod(yearLines),
    reserve: taxReserve({ year, ...moneyOf(yearLines), ...plan }),
  };
}
