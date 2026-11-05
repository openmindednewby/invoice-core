import { InvoiceKind } from './InvoiceKind';
import { computeTotals, resolveLines } from './lines';
import { formatCents } from './money';
import { addDays, displayDate, periodTexts } from './period';
import type { InvoiceRequest, Parties, ResolvedLine, Totals } from './types';
import { isBlank } from './validate';

/** What a blank required field prints as on a draft. */
export const BLANK_MARK = '[________]';

const DRAFT_NUMBER = 'DRAFT';

export interface RenderInput {
  request: InvoiceRequest; number: string | null; parties: Parties;
  lines?: ResolvedLine[]; totals?: Totals; kind?: InvoiceKind; creditFor?: string; reason?: string;
}

export interface InvoiceView {
  draft: boolean; creditNote: boolean; number: string; date: string; dueDate: string; periodEn: string; periodEl: string;
  company: { name: string; addressLines: string[]; regNo: string; vatNumber: string; bank: string; iban: string; bic: string };
  client: { name: string; addressLines: string[]; taxLines: string[] };
  rows: { description: string; amount: string }[];
  net: string; vat: string; total: string; vatLabel: string; noteEn: string; noteEl: string;
  creditFor?: string; reason?: string;
}

function shown(value: unknown): string {
  return isBlank(value) ? BLANK_MARK : String(value);
}

/** Formats a request into what the PDF prints. */
export function buildInvoiceView(input: RenderInput): InvoiceView {
  const { request, number, parties: { company, client, rule } } = input;
  const lines = input.lines ?? resolveLines(request, client);
  const totals = input.totals ?? computeTotals(lines, rule.ratePercent);
  const period = periodTexts(request.period);
  return {
    draft: number === null,
    creditNote: input.kind === InvoiceKind.CreditNote,
    number: number ?? DRAFT_NUMBER,
    date: displayDate(request.date),
    dueDate: typeof client.paymentTermsDays === 'number' ? displayDate(addDays(request.date, client.paymentTermsDays)) : BLANK_MARK,
    periodEn: period.en,
    periodEl: period.el,
    company: {
      name: shown(company.name), addressLines: company.addressLines, regNo: shown(company.regNo), vatNumber: shown(company.vatNumber),
      bank: shown(company.bank), iban: shown(company.iban), bic: shown(company.bic),
    },
    client: { name: shown(client.name), addressLines: client.addressLines, taxLines: client.taxLines },
    rows: lines.map((line) => ({ description: shown(line.description), amount: formatCents(line.cents) })),
    net: formatCents(totals.netCents),
    vat: formatCents(totals.vatCents),
    total: formatCents(totals.totalCents),
    vatLabel: `${rule.labelEn} / ${rule.labelEl} (${rule.rateTextEn} / ${rule.rateTextEl})`,
    noteEn: rule.noteEn,
    noteEl: rule.noteEl,
    creditFor: input.creditFor,
    reason: input.reason,
  };
}
