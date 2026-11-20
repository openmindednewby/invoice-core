const SUPPLIER_HEAD = [
  'V.A.T. Reg. No. 10000001X T.I.C. 12000001T Please remit payment to:',
  'Bank: Example Bank SWIFT: EXBKCY2N A/C No: 000111222333 IBAN: CY17002001280000001200527600',
  '',
].join(' ');

export const FIRST_BILL_TEXT =
  `${SUPPLIER_HEAD}Invoice no. 26223 Date: 2 November 2026 I N V O I C E Buyer Company Ltd Street 6 1095 City `
  + 'Description Disbursements Expenses Fees EURO EURO EURO Professional fees for the company registration 200,00 Registrar fees 584,00 '
  + 'Other disbursements: Messenger 22,00 606,00 - 200,00 Subtotal –vatable 200,00 VAT @ 19% 38,00 Subtotal not subject to VAT 606,00 Total €844,00';

export const SECOND_BILL_TEXT =
  `${SUPPLIER_HEAD}nvoice no. 26224 Date: 2 November 2026 I N V O I C E Buyer Company Ltd `
  + 'Description Fees EURO Professional fees 300,00 Certificate 80,00 Other disbursements: Messenger 10,00 90,00 - 300,00 '
  + 'Subtotal –vatable 300,00 VAT @ 19% 57,00 Subtotal not subject to VAT 90,00 Total €1.447,00';

export const FILED_BILL_JSON = JSON.stringify({
  supplier: 'Example Supplier (A. Person)',
  supplierVat: '10000001X',
  supplierTic: '12000001T',
  number: '26223',
  issueDate: '2026-11-02',
  dueDate: null,
  currency: 'EUR',
  net: 200.0,
  vat: 38.0,
  notSubjectToVat: 606.0,
  total: 844.0,
  payTo: { bank: 'Example Bank', iban: 'CY17002001280000001200527600', swift: 'EXBKCY2N' },
  status: 'unpaid',
  paidOn: null,
  proofFiles: [],
}, null, 2);

export const PDF_BYTES = new TextEncoder().encode('%PDF-1.4 bill');

const CENTRAL_SIG = 0x02014b50;
const END_SIZE = 22;
const CENTRAL_SIZE = 46;

export function readZipNames(bytes: Uint8Array): string[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.byteLength - END_SIZE;
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const names: string[] = [];
  for (let n = 0; n < count; n += 1) {
    if (view.getUint32(at, true) !== CENTRAL_SIG) {
      throw new Error(`no central header at ${at}`);
    }
    const nameLength = view.getUint16(at + 28, true);
    names.push(new TextDecoder().decode(bytes.subarray(at + CENTRAL_SIZE, at + CENTRAL_SIZE + nameLength)));
    at += CENTRAL_SIZE + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
  }
  return names;
}
