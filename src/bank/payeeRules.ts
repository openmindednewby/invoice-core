import { toJson } from '../folder';
import type { InvoiceStorage } from '../storage';
import { PAYEE_RULES_JSON } from './bankPaths';
import type { LineKind } from './LineKind';

export interface PayeeRule {
  payee: string;
  kind: LineKind;
  category: string | null;
}

export const PAYEE_RULES_LOCK = 'bank-payee-rules';

function isRule(value: unknown): value is PayeeRule {
  const raw = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  return typeof raw.payee === 'string' && typeof raw.kind === 'string' && (raw.category === null || typeof raw.category === 'string');
}

/** The payee rules learnt from the owner's choices; empty until the first one. */
export async function readPayeeRules(storage: InvoiceStorage): Promise<PayeeRule[]> {
  const saved = await storage.readText(PAYEE_RULES_JSON);
  if (saved === null) {
    return [];
  }
  const parsed: unknown = JSON.parse(saved);
  return Array.isArray(parsed) ? parsed.filter(isRule) : [];
}

/** Writes the payee rules. */
export async function savePayeeRules(storage: InvoiceStorage, rules: PayeeRule[]): Promise<void> {
  await storage.replace(PAYEE_RULES_JSON, toJson(rules));
}
