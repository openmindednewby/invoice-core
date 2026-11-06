import type { InvoiceLayout } from './layouts';
import { amountHead, GRAND_SIZE_GAIN, SECTION_GAP, value, WHITE } from './pdfCells';
import type { PdfNode } from './pdfCells';
import type { InvoiceView } from './view';

const A4_WIDTH = 595.28;
const BOX_FILL = '#F3F6FA';
const LINE_COLOUR = '#B9C2CD';
const LINE_WIDTH = 0.75;
const RULE_WIDTH = 1.2;
const AMOUNT_WIDTH = 150;
const ROW_HEIGHT = 30;
const EMPTY_ROWS = 3;
const CELL_PAD = 5;
const TIGHT_PAD = 2;
const LABEL_SIZE_DROP = 1;
const NO_BORDER = [false, false, false, false];
const FULL_BORDER = [true, true, true, true];

const lines = {
  hLineWidth: (): number => LINE_WIDTH,
  vLineWidth: (): number => LINE_WIDTH,
  hLineColor: (): string => LINE_COLOUR,
  vLineColor: (): string => LINE_COLOUR,
  paddingLeft: (): number => CELL_PAD,
  paddingRight: (): number => CELL_PAD,
  paddingTop: (): number => CELL_PAD,
  paddingBottom: (): number => CELL_PAD,
};

function mutedThenBold(label: string, text: string, layout: InvoiceLayout): PdfNode {
  return { text: [{ text: `${label}: `, color: layout.muted }, { ...value(text), bold: true }], margin: [0, 0, 0, 2] };
}

/** The accent line under the company header. */
export function headerRule(layout: InvoiceLayout): PdfNode {
  const x2 = A4_WIDTH - 2 * layout.pageMargin;
  return { id: 'header-rule', canvas: [{ type: 'line', x1: 0, y1: 0, x2, y2: 0, lineWidth: RULE_WIDTH, lineColor: layout.accent }], margin: [0, 0, 0, SECTION_GAP + SECTION_GAP] };
}

/** Bill-to and invoice details in one framed, shaded two-cell box. */
export function boxedMeta(view: InvoiceView, layout: InvoiceLayout): PdfNode {
  const billTo = {
    fillColor: BOX_FILL,
    stack: [
      { text: 'BILL TO / ΠΕΛΑΤΗΣ', bold: true, color: layout.muted, fontSize: layout.bodySize - LABEL_SIZE_DROP },
      { ...value(view.client.name), bold: true },
      ...view.client.addressLines,
      ...view.client.taxLines,
    ],
  };
  const numberLabel = view.creditNote ? 'Credit Note No. / Αρ. Πιστωτικού' : 'Invoice No. / Αρ. Τιμολογίου';
  const details = {
    fillColor: BOX_FILL,
    stack: [
      mutedThenBold(numberLabel, view.number, layout),
      ...(view.creditFor ? [mutedThenBold('Credits invoice / Πιστώνει το τιμολόγιο', view.creditFor, layout)] : []),
      mutedThenBold('Date / Ημερομηνία', view.date, layout),
      mutedThenBold('Period / Περίοδος', `${view.periodEl} / ${view.periodEn}`, layout),
      mutedThenBold('Currency / Νόμισμα', 'EUR (€)', layout),
    ],
  };
  return { id: 'meta-box', table: { widths: ['*', 'auto'], body: [[billTo, details]] }, layout: lines, margin: [0, 0, 0, SECTION_GAP + SECTION_GAP] };
}

/** The bordered line table with three empty rows to write in. */
export function boxedItems(view: InvoiceView, layout: InvoiceLayout): PdfNode {
  const head = [{ text: 'DESCRIPTION / ΠΕΡΙΓΡΑΦΗ', bold: true, color: WHITE, fillColor: layout.accent }, amountHead(layout.accent)];
  const rows = view.rows.map((row) => [value(row.description), { text: row.amount, alignment: 'right' }]);
  const empty = Array.from({ length: EMPTY_ROWS }, () => [{ text: '' }, { text: '' }]);
  const heights = (row: number): number | 'auto' => (row === 0 ? 'auto' : ROW_HEIGHT);
  return { id: 'items', table: { headerRows: 1, widths: ['*', AMOUNT_WIDTH], heights, body: [head, ...rows, ...empty] }, layout: lines, margin: [0, 0, 0, SECTION_GAP + SECTION_GAP] };
}

/** Totals in the amount column, the total in a framed shaded cell. */
export function boxedTotals(view: InvoiceView, layout: InvoiceLayout): PdfNode {
  const plain = { alignment: 'right', border: NO_BORDER };
  const grand = { ...plain, bold: true, fontSize: layout.bodySize + GRAND_SIZE_GAIN };
  const grandLabel = view.creditNote ? 'TOTAL CREDIT / ΣΥΝΟΛΟ ΠΙΣΤΩΣΗΣ' : 'TOTAL DUE / ΣΥΝΟΛΟ ΠΛΗΡΩΤΕΟ';
  const body = [
    [{ text: 'Net Amount / Καθαρή Αξία', ...plain }, { text: view.net, ...plain }],
    [{ text: view.vatLabel, ...plain }, { text: view.vat, ...plain }],
    [{ text: grandLabel, ...grand }, { text: `€ ${view.total}`, ...grand, border: FULL_BORDER, fillColor: layout.band }],
  ];
  return { id: 'totals', table: { widths: ['*', AMOUNT_WIDTH], body }, layout: { ...lines, paddingTop: (): number => TIGHT_PAD, paddingBottom: (): number => TIGHT_PAD }, margin: [0, 0, 0, SECTION_GAP + SECTION_GAP] };
}
