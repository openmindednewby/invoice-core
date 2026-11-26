import { toJson } from '../folder';
import type { InvoiceStorage } from '../storage';
import { InvoiceError } from '../types';
import { PAYEE_RULES_JSON } from './bankPaths';
import type { LineKind } from './LineKind';
import { normalise, payeeKey } from './payeeText';

export interface PayeeRule {
  contains: string;
  kind: LineKind;
  category: string | null;
}

export const PAYEE_RULES_LOCK = 'bank-payee-rules';

function containsOf(raw: Record<string, unknown>): string {
  if (typeof raw.contains === 'string') {
    return raw.contains.trim();
  }
  return typeof raw.payee === 'string' ? payeeKey(raw.payee) : '';
}

function asRule(value: unknown): PayeeRule | null {
  const raw = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const contains = containsOf(raw);
  const valid = contains !== '' && typeof raw.kind === 'string' && (raw.category === null || typeof raw.category === 'string');
  return valid ? { contains, kind: raw.kind as LineKind, category: raw.category as string | null } : null;
}

/** The rules with one rule set: it replaces the rule of the earlier text, or of its own text, else it is added. */
export function withRule(rules: PayeeRule[], previous: string | null, rule: PayeeRule): PayeeRule[] {
  const replaced = new Set([normalise(previous ?? rule.contains), normalise(rule.contains)]);
  const at = rules.findIndex((candidate) => replaced.has(normalise(candidate.contains)));
  const others = rules.filter((candidate) => !replaced.has(normalise(candidate.contains)));
  return at < 0 ? [...others, rule] : [...others.slice(0, at), rule, ...others.slice(at)];
}

/** The owner's mappings, oldest first; rules saved as exact payees read as mappings on the payee key. */
export async function readPayeeRules(storage: InvoiceStorage): Promise<PayeeRule[]> {
  const saved = await storage.readText(PAYEE_RULES_JSON);
  const parsed: unknown = saved === null ? [] : JSON.parse(saved);
  const rules = Array.isArray(parsed) ? parsed.map(asRule).filter((rule): rule is PayeeRule => rule !== null) : [];
  return rules.reduce<PayeeRule[]>((kept, rule) => withRule(kept, null, rule), []);
}

/** Writes the mappings. */
export async function savePayeeRules(storage: InvoiceStorage, rules: PayeeRule[]): Promise<void> {
  await storage.replace(PAYEE_RULES_JSON, toJson(rules));
}

/** Adds a mapping, or edits the one with the previous text; returns the saved mappings. */
export function upsertPayeeRule(storage: InvoiceStorage, previous: string | null, rule: PayeeRule): Promise<PayeeRule[]> {
  const contains = rule.contains.trim();
  if (contains === '') {
    return Promise.reject(new InvoiceError([{ path: 'contains', message: 'is required' }]));
  }
  return storage.withLock(PAYEE_RULES_LOCK, async () => {
    const rules = withRule(await readPayeeRules(storage), previous, { ...rule, contains });
    await savePayeeRules(storage, rules);
    return rules;
  });
}

/** Deletes the mapping with the text; returns the saved mappings. */
export function deletePayeeRule(storage: InvoiceStorage, contains: string): Promise<PayeeRule[]> {
  return storage.withLock(PAYEE_RULES_LOCK, async () => {
    const rules = (await readPayeeRules(storage)).filter((rule) => normalise(rule.contains) !== normalise(contains));
    await savePayeeRules(storage, rules);
    return rules;
  });
}
