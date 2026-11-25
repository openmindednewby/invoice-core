export const BANK_DIR = 'bank';
export const STATEMENTS = 'statements';
export const STATEMENTS_DIR = `${BANK_DIR}/${STATEMENTS}`;
export const PAYEE_RULES_JSON = `${BANK_DIR}/payee-rules.json`;
export const LINES_JSON = 'lines.json';
export const BANK_CHARGES_CATEGORY = 'bank-charges';
const FALLBACK_SEGMENT = 'account';

/** A value made safe as one folder or file name segment. */
export function safeSegment(value: string): string {
  const safe = value.trim().split(/[^A-Za-z0-9_-]/).filter((part) => part !== '').join('-');
  return safe === '' ? FALLBACK_SEGMENT : safe;
}

/** The ledger file of one account: bank/<account>/lines.json. */
export function ledgerPath(account: string): string {
  return `${BANK_DIR}/${safeSegment(account)}/${LINES_JSON}`;
}

/** The lock name for one account's ledger. */
export function bankLock(account: string): string {
  return `bank:${account}`;
}
