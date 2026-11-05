import type { InvoiceKind } from './InvoiceKind';

/** One validation problem: a field path and what is wrong with it. */
export interface FieldError { path: string; message: string; }

/** The issuing company, read from company.json in the data folder. */
export interface Company {
  name: string; addressLines: string[]; regNo: string; vatNumber: string;
  bank: string; iban: string; bic: string; logo?: string; template?: string; layout?: string;
}

/** A client, read from clients/<id>.json in the data folder. */
export interface Client {
  name: string; addressLines: string[]; taxLines: string[]; vatNumber: string;
  vatRule: string; paymentTermsDays: number | null; description: string; template?: string; layout?: string;
}

/** A VAT treatment, built in or read from a rule file. */
export interface VatRule {
  id: string; ratePercent: number; labelEn: string; labelEl: string;
  rateTextEn: string; rateTextEl: string; noteEn: string; noteEl: string; source: string;
  reviewedByAccountant?: boolean;
}

/** A line as entered: its own description and an amount such as 2952.50. */
export interface InvoiceLine { description: string; amount: string; }

/** A line ready to print and total. */
export interface ResolvedLine { description: string; cents: number; }

/** Totals in whole cents. */
export interface Totals { netCents: number; vatCents: number; totalCents: number; }

/** The per-invoice request. Lines win over amounts, which use the client description. */
export interface InvoiceRequest {
  clientId: string; period: string; date: string; amounts: string[]; lines?: InvoiceLine[];
  template?: string; layout?: string; draft: boolean;
}

/** The three files an invoice is built from. */
export interface Parties { company: Company; client: Client; rule: VatRule; }

/** Which schedule month an issued record came from. */
export interface ScheduleRef { id: string; period: string; }

/** The immutable record of an issued invoice or credit note. */
export interface InvoiceRecord extends Parties {
  kind: InvoiceKind; number: string; request: InvoiceRequest; lines: ResolvedLine[]; totals: Totals;
  schedule?: ScheduleRef; creditFor?: string; reason?: string;
}

/** Where an issued record and its PDF were saved. */
export interface IssuedInvoice { number: string; pdfPath: string; recordPath: string; }

/** Thrown for any refusal; errors name each field. */
export class InvoiceError extends Error {
  readonly errors: FieldError[];

  constructor(errors: FieldError[]) {
    super(errors.map((e) => `${e.path}: ${e.message}`).join('; '));
    this.name = 'InvoiceError';
    this.errors = errors;
  }
}
