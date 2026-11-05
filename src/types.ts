import type { InvoiceKind } from './InvoiceKind';

export interface FieldError { path: string; message: string; }

export interface Company {
  name: string; addressLines: string[]; regNo: string; vatNumber: string;
  bank: string; iban: string; bic: string; logo?: string; template?: string; layout?: string;
}

export interface Client {
  name: string; addressLines: string[]; taxLines: string[]; vatNumber: string;
  vatRule: string; paymentTermsDays: number | null; description: string; template?: string; layout?: string;
}

export interface VatRule {
  id: string; ratePercent: number; labelEn: string; labelEl: string;
  rateTextEn: string; rateTextEl: string; noteEn: string; noteEl: string; source: string;
  reviewedByAccountant?: boolean;
}

export interface InvoiceLine { description: string; amount: string; }

export interface ResolvedLine { description: string; cents: number; }

export interface Totals { netCents: number; vatCents: number; totalCents: number; }

export interface InvoiceRequest {
  clientId: string; period: string; date: string; amounts: string[]; lines?: InvoiceLine[];
  template?: string; layout?: string; draft: boolean;
}

export interface Parties { company: Company; client: Client; rule: VatRule; }

export interface ScheduleRef { id: string; period: string; }

export interface InvoiceRecord extends Parties {
  kind: InvoiceKind; number: string; request: InvoiceRequest; lines: ResolvedLine[]; totals: Totals;
  schedule?: ScheduleRef; creditFor?: string; reason?: string;
}

export interface IssuedInvoice { number: string; pdfPath: string; recordPath: string; }

export class InvoiceError extends Error {
  readonly errors: FieldError[];

  constructor(errors: FieldError[]) {
    super(errors.map((e) => `${e.path}: ${e.message}`).join('; '));
    this.name = 'InvoiceError';
    this.errors = errors;
  }
}
