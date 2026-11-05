import { toCents } from './money';
import type { Client, Company, FieldError, InvoiceLine, InvoiceRequest } from './types';

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** True for an empty value or a placeholder such as CY[____]. */
export function isBlank(value: unknown): boolean {
  if (value === undefined || value === null) {
    return true;
  }
  const text = String(value);
  return text.trim() === '' || text.includes('__');
}

/** True for a real calendar date written as YYYY-MM-DD. */
export function isRealDate(date: string): boolean {
  if (!DATE.test(date)) {
    return false;
  }
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

function amountErrors(amount: string, path: string): FieldError[] {
  const cents = toCents(amount);
  if (cents === null) {
    return [{ path, message: 'must look like 2952 or 2952.50' }];
  }
  return cents === 0 ? [{ path, message: 'must be more than zero' }] : [];
}

/** Checks each line's amount; a description may stay blank until final. */
export function validateLines(lines: InvoiceLine[]): FieldError[] {
  return lines.flatMap((line, i) => amountErrors(line.amount, `lines[${i}].amount`));
}

/** Checks the request shape; these errors apply to drafts too. */
export function validateRequest(req: InvoiceRequest): FieldError[] {
  const errors: FieldError[] = [];
  const lines = req.lines ?? [];
  if (!PERIOD.test(req.period)) {
    errors.push({ path: 'period', message: 'must be YYYY-MM' });
  }
  if (!isRealDate(req.date)) {
    errors.push({ path: 'date', message: 'must be a real date as YYYY-MM-DD' });
  }
  if (req.amounts.length === 0 && lines.length === 0) {
    errors.push({ path: 'amounts', message: 'at least one amount is required' });
  }
  req.amounts.forEach((amount, i) => errors.push(...amountErrors(amount, `amounts[${i}]`)));
  errors.push(...validateLines(lines));
  return errors;
}

/** Lists required fields still blank; a final invoice is refused if any are. */
export function missingForFinal(company: Company, client: Client, lines: InvoiceLine[] = []): FieldError[] {
  const required: [string, unknown][] = [
    ['company.name', company.name], ['company.addressLines', company.addressLines?.join('')],
    ['company.regNo', company.regNo], ['company.vatNumber', company.vatNumber],
    ['company.bank', company.bank], ['company.iban', company.iban], ['company.bic', company.bic],
    ['client.name', client.name], ['client.addressLines', client.addressLines?.join('')],
    ['client.vatNumber', client.vatNumber], ['client.paymentTermsDays', client.paymentTermsDays],
    ...(lines.length === 0 ? [['client.description', client.description] as [string, unknown]] : []),
    ...lines.map((line, i): [string, unknown] => [`lines[${i}].description`, line.description]),
  ];
  const errors = required.filter(([, value]) => isBlank(value)).map(([path]) => ({ path, message: 'required for a final invoice' }));
  const vatShown = isBlank(client.vatNumber) || client.taxLines.some((line) => line.includes(client.vatNumber));
  return vatShown ? errors : [...errors, { path: 'client.taxLines', message: 'must show the client VAT number' }];
}
