import { BillStatus } from './BillStatus';

const CENTS_PER_UNIT = 100;

export interface PayTo {
  bank: string;
  iban: string;
  swift: string;
}

export interface BillInput {
  supplier: string;
  supplierVat: string;
  number: string;
  issueDate: string;
  dueDate: string | null;
  currency: string;
  netCents: number;
  vatCents: number;
  notSubjectToVatCents: number;
  totalCents: number;
  payTo: PayTo;
}

export interface Bill extends BillInput {
  dir: string;
  status: BillStatus;
  paidOn: string | null;
  proofFiles: string[];
}

export type BillJson = Record<string, unknown>;

export function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function dateOrNull(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

export function cents(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value * CENTS_PER_UNIT) : 0;
}

function payToOf(value: unknown): PayTo {
  const raw = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  return { bank: text(raw.bank), iban: text(raw.iban), swift: text(raw.swift) };
}

/** Reads a bill.json object into a bill; amounts in the file are euros, in memory cents. */
export function billFromJson(dir: string, json: BillJson): Bill {
  return {
    dir, supplier: text(json.supplier), supplierVat: text(json.supplierVat), number: text(json.number), issueDate: text(json.issueDate),
    dueDate: dateOrNull(json.dueDate), currency: text(json.currency) || 'EUR', netCents: cents(json.net), vatCents: cents(json.vat),
    notSubjectToVatCents: cents(json.notSubjectToVat), totalCents: cents(json.total), payTo: payToOf(json.payTo),
    status: json.status === BillStatus.Paid ? BillStatus.Paid : BillStatus.Unpaid, paidOn: dateOrNull(json.paidOn),
    proofFiles: Array.isArray(json.proofFiles) ? json.proofFiles.filter((name): name is string => typeof name === 'string') : [],
  };
}

/** Writes a bill over its existing bill.json object, keeping fields this module does not know. */
export function billToJson(bill: Bill, existing: BillJson = {}): BillJson {
  return {
    ...existing, supplier: bill.supplier, supplierVat: bill.supplierVat, number: bill.number, issueDate: bill.issueDate, dueDate: bill.dueDate,
    currency: bill.currency, net: bill.netCents / CENTS_PER_UNIT, vat: bill.vatCents / CENTS_PER_UNIT,
    notSubjectToVat: bill.notSubjectToVatCents / CENTS_PER_UNIT, total: bill.totalCents / CENTS_PER_UNIT, payTo: bill.payTo,
    status: bill.status, paidOn: bill.paidOn, proofFiles: bill.proofFiles,
  };
}
