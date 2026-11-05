import type { FieldError } from './types';

const MAX_RATE = 100;

function strings(prefix: string, data: Record<string, unknown>, keys: string[]): FieldError[] {
  return keys
    .filter((key) => data[key] !== undefined && typeof data[key] !== 'string')
    .map((key) => ({ path: `${prefix}.${key}`, message: 'must be text' }));
}

function required(prefix: string, data: Record<string, unknown>, keys: string[]): FieldError[] {
  return keys
    .filter((key) => typeof data[key] !== 'string')
    .map((key) => ({ path: `${prefix}.${key}`, message: 'must be text' }));
}

function isTextList(value: unknown): boolean {
  return Array.isArray(value) && value.every((line) => typeof line === 'string');
}

function lines(prefix: string, data: Record<string, unknown>, keys: string[]): FieldError[] {
  return keys
    .filter((key) => !isTextList(data[key]))
    .map((key) => ({ path: `${prefix}.${key}`, message: 'must be a list of text lines' }));
}

/** Checks the shape of company.json. */
export function companyShape(company: object): FieldError[] {
  const data = company as Record<string, unknown>;
  return [
    ...required('company', data, ['name', 'regNo', 'vatNumber', 'bank', 'iban', 'bic']),
    ...strings('company', data, ['logo', 'template', 'layout']),
    ...lines('company', data, ['addressLines']),
  ];
}

/** Checks the shape of a client file. */
export function clientShape(client: object): FieldError[] {
  const data = client as Record<string, unknown>;
  const days = data.paymentTermsDays;
  const badDays = days !== null && (!Number.isInteger(days) || (days as number) < 0);
  return [
    ...required('client', data, ['name', 'vatNumber', 'vatRule', 'description']),
    ...strings('client', data, ['template', 'layout']),
    ...lines('client', data, ['addressLines', 'taxLines']),
    ...(badDays ? [{ path: 'client.paymentTermsDays', message: 'must be null or a whole number of days, 0 or more' }] : []),
  ];
}

/** Checks the shape of a VAT rule file. */
export function ruleShape(rule: object): FieldError[] {
  const data = rule as Record<string, unknown>;
  const rate = data.ratePercent;
  const badRate = typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0 || rate > MAX_RATE;
  return [
    ...required('rule', data, ['labelEn', 'labelEl', 'rateTextEn', 'rateTextEl', 'noteEn', 'noteEl']),
    ...(badRate ? [{ path: 'rule.ratePercent', message: 'must be a number from 0 to 100' }] : []),
  ];
}
