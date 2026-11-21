import { isOsFile, readJsonFile, toJson } from '../folder';
import { isStorageExistsError } from '../storage';
import type { InvoiceStorage } from '../storage';
import { InvoiceError } from '../types';
import { isRealDate } from '../validate';
import { BillStatus } from './BillStatus';
import { billFromJson, billToJson } from './billFile';
import type { Bill, BillInput, BillJson } from './billFile';

export const BILLS_DIR = 'bills';
export const BILL_PDF = 'bill.pdf';
export const BILL_JSON = 'bill.json';
const BILL_LABEL = 'bill';
const YEAR = /^\d{4}$/;
const FALLBACK_SLUG = 'unnamed';
const YEAR_LENGTH = 4;
const REQUIRED = 'is required';
const REAL_DATE = 'must be a real date as YYYY-MM-DD';

export interface BillList {
  bills: Bill[];
  broken: string[];
}

export function supplierSlug(supplier: string): string {
  const word = supplier.normalize('NFD').toLowerCase().split(/[^a-z0-9]+/).find((part) => part.length > 0);
  return word ?? FALLBACK_SLUG;
}

function safeNumber(number: string): string {
  return number.replace(/[^A-Za-z0-9-]+/g, '-');
}

/** The folder of a bill: bills/<issue year>/<supplier slug>-<number>. */
export function billDir(supplier: string, number: string, issueDate: string): string {
  return `${BILLS_DIR}/${issueDate.slice(0, YEAR_LENGTH)}/${supplierSlug(supplier)}-${safeNumber(number)}`;
}

/** Reads one bill's bill.json; throws InvoiceError if missing or not JSON. */
export async function readBill(storage: InvoiceStorage, dir: string): Promise<Bill> {
  return billFromJson(dir, await readJsonFile<BillJson>(storage, `${dir}/${BILL_JSON}`, BILL_LABEL));
}

/** Writes a bill back to its bill.json, keeping any field the file has that a bill does not. */
export async function saveBill(storage: InvoiceStorage, bill: Bill): Promise<void> {
  const existing = await readJsonFile<BillJson>(storage, `${bill.dir}/${BILL_JSON}`, BILL_LABEL);
  await storage.replace(`${bill.dir}/${BILL_JSON}`, toJson(billToJson(bill, existing)));
}

/** Every record folder under root/<year>/, for a store laid out by year. */
export async function yearDirs(storage: InvoiceStorage, root: string): Promise<string[]> {
  const years = (await storage.list(root)).filter((name) => YEAR.test(name));
  const perYear = await Promise.all(years.map(async (year) => (await storage.list(`${root}/${year}`))
    .filter((name) => !isOsFile(name)).map((name) => `${root}/${year}/${name}`)));
  return perYear.flat();
}

/** Lists every bill in bills/; a folder whose bill.json cannot be read is returned in broken. */
export async function listBills(storage: InvoiceStorage): Promise<BillList> {
  const result: BillList = { bills: [], broken: [] };
  for (const dir of await yearDirs(storage, BILLS_DIR)) {
    if ((await storage.list(dir)).includes(BILL_JSON)) {
      await readBill(storage, dir).then((bill) => result.bills.push(bill), () => result.broken.push(dir));
    }
  }
  return result;
}

function inputErrors(input: BillInput): InvoiceError | null {
  const errors = [
    ...(input.supplier.trim().length === 0 ? [{ path: 'supplier', message: REQUIRED }] : []),
    ...(input.number.trim().length === 0 ? [{ path: 'number', message: REQUIRED }] : []),
    ...(isRealDate(input.issueDate) ? [] : [{ path: 'issueDate', message: REAL_DATE }]),
    ...(input.dueDate === null || isRealDate(input.dueDate) ? [] : [{ path: 'dueDate', message: REAL_DATE }]),
    ...(input.netCents + input.vatCents + input.notSubjectToVatCents === input.totalCents
      ? [] : [{ path: 'total', message: 'must equal net + VAT + not subject to VAT' }]),
  ];
  return errors.length > 0 ? new InvoiceError(errors) : null;
}

/** Files a received bill: copies the PDF unchanged and writes bill.json, unpaid with no proofs. */
export async function addBill(storage: InvoiceStorage, pdf: Uint8Array, input: BillInput): Promise<Bill> {
  const invalid = inputErrors(input);
  if (invalid !== null) {
    throw invalid;
  }
  const bill: Bill = { ...input, dir: billDir(input.supplier, input.number, input.issueDate), status: BillStatus.Unpaid, paidOn: null, proofFiles: [] };
  try {
    await storage.writeNew(`${bill.dir}/${BILL_PDF}`, pdf);
  } catch (error) {
    if (isStorageExistsError(error)) {
      throw new InvoiceError([{ path: 'number', message: `bill ${input.number} from this supplier is already filed` }]);
    }
    throw error;
  }
  await storage.writeNew(`${bill.dir}/${BILL_JSON}`, toJson(billToJson(bill)));
  return bill;
}
