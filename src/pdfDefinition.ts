import type { InvoiceLayout } from './layouts';
import { LayoutStyle } from './LayoutStyle';
import { boxedItems, boxedMeta, boxedTotals, headerRule } from './pdfBoxed';
import { amountHead, GRAND_SIZE_GAIN, labelled, SECTION_GAP, value, WHITE } from './pdfCells';
import type { PdfNode } from './pdfCells';
import type { InvoiceView } from './view';

const WATERMARK_COLOUR = '#A00000';
const WATERMARK_OPACITY = 0.13;
const FOOT_SIZE_DROP = 1.5;
const COMPANY_SIZE_GAIN = 3;
const PAGE_SIZE = 'A4';

export type PdfLogo = { image: string } | { svg: string };

function titleBlock(view: InvoiceView, layout: InvoiceLayout): PdfNode {
  const [en, el] = view.creditNote ? ['CREDIT NOTE', 'ΠΙΣΤΩΤΙΚΟ ΣΗΜΕΙΩΜΑ'] : ['INVOICE', 'ΤΙΜΟΛΟΓΙΟ'];
  return {
    width: 'auto',
    alignment: layout.titleAlign,
    color: layout.accent,
    bold: true,
    stack: [{ text: en, fontSize: layout.titleSize }, { text: el, fontSize: layout.bodySize + GRAND_SIZE_GAIN }],
  };
}

function header(view: InvoiceView, layout: InvoiceLayout, logo?: PdfLogo): PdfNode {
  const company = {
    width: '*',
    stack: [
      ...(logo ? [{ ...logo, width: layout.logoWidth, margin: [0, 0, 0, 6] }] : []),
      { ...value(view.company.name), bold: true, fontSize: layout.bodySize + COMPANY_SIZE_GAIN, color: layout.accent },
      ...view.company.addressLines,
      labelled('Reg. No. / Αρ. Εγγραφής', view.company.regNo),
      labelled('VAT No. / Αρ. ΦΠΑ', view.company.vatNumber),
    ],
  };
  return { columns: [company, titleBlock(view, layout)], margin: [0, 0, 0, SECTION_GAP] };
}

function meta(view: InvoiceView, layout: InvoiceLayout): PdfNode {
  const billTo = {
    width: '*',
    stack: [
      { text: 'BILL TO / ΠΕΛΑΤΗΣ', bold: true, color: layout.accent },
      { ...value(view.client.name), bold: true },
      ...view.client.addressLines,
      ...view.client.taxLines,
    ],
  };
  const numberLabel = view.creditNote ? 'Credit Note No. / Αρ. Πιστωτικού' : 'Invoice No. / Αρ. Τιμολογίου';
  const details = {
    width: 'auto',
    stack: [
      labelled(numberLabel, view.number),
      ...(view.creditFor ? [labelled('Credits invoice / Πιστώνει το τιμολόγιο', view.creditFor)] : []),
      labelled('Date / Ημερομηνία', view.date),
      labelled('Period / Περίοδος', `${view.periodEn} / ${view.periodEl}`),
      labelled('Currency / Νόμισμα', 'EUR (€)'),
    ],
  };
  return { columns: [billTo, details], margin: [0, 0, 0, SECTION_GAP] };
}

function items(view: InvoiceView, layout: InvoiceLayout): PdfNode {
  const head = [
    { text: 'DESCRIPTION / ΠΕΡΙΓΡΑΦΗ', bold: true, color: WHITE, fillColor: layout.accent },
    amountHead(layout.accent),
  ];
  const rows = view.rows.map((row) => [value(row.description), { text: row.amount, alignment: 'right' }]);
  return { id: 'items', table: { headerRows: 1, widths: ['*', 'auto'], body: [head, ...rows] }, layout: 'lightHorizontalLines', margin: [0, 0, 0, SECTION_GAP] };
}

function totals(view: InvoiceView, layout: InvoiceLayout): PdfNode {
  const grand = { bold: true, color: layout.accent, fillColor: layout.band, fontSize: layout.bodySize + GRAND_SIZE_GAIN };
  const grandLabel = view.creditNote ? 'TOTAL CREDIT / ΣΥΝΟΛΟ ΠΙΣΤΩΣΗΣ' : 'TOTAL DUE / ΣΥΝΟΛΟ ΠΛΗΡΩΤΕΟ';
  const body = [
    ['Net Amount / Καθαρή Αξία', { text: view.net, alignment: 'right' }],
    [view.vatLabel, { text: view.vat, alignment: 'right' }],
    [{ text: grandLabel, ...grand }, { text: `€ ${view.total}`, alignment: 'right', ...grand }],
  ];
  return { table: { widths: ['*', 'auto'], body }, layout: 'noBorders', margin: [0, 0, 0, SECTION_GAP] };
}

function payment(view: InvoiceView, layout: InvoiceLayout): PdfNode[] {
  if (view.creditNote) {
    return view.reason ? [labelled('Reason / Αιτιολογία', view.reason)] : [];
  }
  const rows = [
    ['Bank / Τράπεζα', view.company.bank], ['Account Name / Δικαιούχος', view.company.name], ['IBAN', view.company.iban], ['BIC / SWIFT', view.company.bic],
    ['Due date / Ημ. Πληρωμής', view.dueDate], ['Reference / Αιτιολογία', view.number],
  ];
  const headingColour = layout.style === LayoutStyle.Boxed ? layout.muted : layout.accent;
  return [
    { text: 'PAYMENT DETAILS / ΣΤΟΙΧΕΙΑ ΠΛΗΡΩΜΗΣ', bold: true, color: headingColour },
    { table: { widths: ['auto', '*'], body: rows.map(([label = '', text = '']) => [{ text: label, color: layout.muted }, value(text)]) }, layout: 'noBorders' },
  ];
}

function note(view: InvoiceView, layout: InvoiceLayout): PdfNode[] {
  return view.noteEn === '' && view.noteEl === '' ? [] : [{ stack: [view.noteEn, view.noteEl], color: layout.muted, margin: [0, 0, 0, SECTION_GAP] }];
}

/** Builds the pdfmake document from plain view data and a layout. */
export function buildPdfDefinition(view: InvoiceView, layout: InvoiceLayout, logo?: PdfLogo): PdfNode {
  const foot = `${view.company.name} · Reg. No. ${view.company.regNo} · ${view.company.addressLines.join(', ')}`;
  return {
    pageSize: PAGE_SIZE,
    pageMargins: layout.pageMargin,
    defaultStyle: { fontSize: layout.bodySize },
    ...(view.draft ? { watermark: { text: 'DRAFT', color: WATERMARK_COLOUR, opacity: WATERMARK_OPACITY, bold: true } } : {}),
    footer: { text: foot, alignment: 'center', color: layout.muted, fontSize: layout.bodySize - FOOT_SIZE_DROP },
    content: [...body(view, layout, logo), ...note(view, layout), ...payment(view, layout)],
  };
}

function body(view: InvoiceView, layout: InvoiceLayout, logo?: PdfLogo): PdfNode[] {
  if (layout.style === LayoutStyle.Boxed) {
    return [header(view, layout, logo), headerRule(layout), boxedMeta(view, layout), boxedItems(view, layout), boxedTotals(view, layout)];
  }
  return [header(view, layout, logo), meta(view, layout), items(view, layout), totals(view, layout)];
}
