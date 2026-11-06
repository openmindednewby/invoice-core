import { BLANK_MARK } from './view';

const BLANK_BACKGROUND = '#FFF2B3';

export const WHITE = '#FFFFFF';
export const SECTION_GAP = 14;
export const GRAND_SIZE_GAIN = 1;

export type PdfNode = Record<string, unknown>;

/** A printed value; a blank required field is highlighted. */
export function value(text: string): PdfNode {
  return text === BLANK_MARK ? { text, background: BLANK_BACKGROUND } : { text };
}

/** A "label: value" line. */
export function labelled(label: string, text: string): PdfNode {
  return { text: [`${label}: `, value(text)] };
}

/** The amount column head, kept on one line. */
export function amountHead(fillColor: string): PdfNode {
  return { text: 'AMOUNT / ΠΟΣΟ (€)', bold: true, color: WHITE, fillColor, alignment: 'right', noWrap: true };
}
