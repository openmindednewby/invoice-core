import { AmountBasis } from './AmountBasis';
import { computeTotals } from './lines';
import { centsToAmount, toCents } from './money';
import type { ScheduleMonth } from './schedule';
import type { InvoiceLine, ResolvedLine, Totals } from './types';

const PERCENT = 100;

export interface NetLines { lines: InvoiceLine[]; grossTotal: string; }

/** Splits a VAT-included amount: net = round(gross / (1 + rate), 2), VAT = gross - net, so the total stays exact. */
export function splitGross(grossCents: number, ratePercent: number): Totals {
  const netCents = Math.round((grossCents * PERCENT) / (PERCENT + ratePercent));
  return { netCents, vatCents: grossCents - netCents, totalCents: grossCents };
}

/** Turns VAT-included lines into net lines plus the gross total the invoice must come to. */
export function netLinesFromGross(lines: readonly InvoiceLine[], ratePercent: number): NetLines {
  const grossCents = lines.map((line) => toCents(line.amount) ?? 0);
  return {
    lines: lines.map((line, i) => ({ description: line.description, amount: centsToAmount(splitGross(grossCents[i] ?? 0, ratePercent).netCents) })),
    grossTotal: centsToAmount(grossCents.reduce((sum, cents) => sum + cents, 0)),
  };
}

function resolved(lines: readonly InvoiceLine[]): ResolvedLine[] {
  return lines.map((line) => ({ description: line.description, cents: toCents(line.amount) ?? 0 }));
}

/** Totals of a scheduled month as it will be issued, for either amount basis. */
export function scheduleMonthTotals(month: ScheduleMonth, ratePercent: number): Totals {
  if (month.basis !== AmountBasis.VatIncluded) {
    return computeTotals(resolved(month.lines), ratePercent);
  }
  const net = netLinesFromGross(month.lines, ratePercent);
  return computeTotals(resolved(net.lines), ratePercent, toCents(net.grossTotal));
}
