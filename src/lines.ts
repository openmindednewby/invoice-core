import { toCents, vatCents } from './money';
import { periodTexts } from './period';
import type { Client, InvoiceRequest, ResolvedLine, Totals } from './types';

/** Fills {periodElAccusative} and {periodEn} in a client description. */
export function expandDescription(description: string, period: string): string {
  const texts = periodTexts(period);
  return description.split('{periodElAccusative}').join(texts.elAccusative).split('{periodEn}').join(texts.en);
}

/** Turns a request into printable lines: its own lines, else amounts with the client description. */
export function resolveLines(request: InvoiceRequest, client: Client): ResolvedLine[] {
  if (request.lines && request.lines.length > 0) {
    return request.lines.map((line) => ({ description: line.description, cents: toCents(line.amount) ?? 0 }));
  }
  const description = expandDescription(client.description, request.period);
  return request.amounts.map((amount) => ({ description, cents: toCents(amount) ?? 0 }));
}

/** The VAT-included total a request must come to, in cents, or null when it has none. */
export function grossCentsOf(request: InvoiceRequest): number | null {
  return request.grossTotal === undefined ? null : toCents(request.grossTotal);
}

/** Sums lines in whole cents and adds VAT at the rate; with a gross total, VAT is what makes the total exact. */
export function computeTotals(lines: ResolvedLine[], ratePercent: number, grossCents: number | null = null): Totals {
  const netCents = lines.reduce((sum, line) => sum + line.cents, 0);
  const vat = grossCents === null ? vatCents(netCents, ratePercent) : grossCents - netCents;
  return { netCents, vatCents: vat, totalCents: netCents + vat };
}
