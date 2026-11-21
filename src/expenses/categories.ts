import type { InvoiceStorage } from '../storage';
import { InvoiceError } from '../types';
import { CATEGORIES_JSON, firstFree } from './expensePaths';

export interface ExpenseCategory {
  id: string;
  name: string;
}

export const DEFAULT_EXPENSE_CATEGORIES: readonly ExpenseCategory[] = [
  { id: 'travel', name: 'Travel' },
  { id: 'fuel-and-car', name: 'Fuel and car' },
  { id: 'software-and-subscriptions', name: 'Software and subscriptions' },
  { id: 'equipment', name: 'Equipment' },
  { id: 'office-and-supplies', name: 'Office and supplies' },
  { id: 'meals-and-entertainment', name: 'Meals and entertainment' },
  { id: 'phone-and-internet', name: 'Phone and internet' },
  { id: 'professional-fees', name: 'Professional fees' },
  { id: 'other', name: 'Other' },
];

const LOCK = 'expense-categories';
const FALLBACK_ID = 'category';

function isCategory(value: unknown): value is ExpenseCategory {
  const raw = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  return typeof raw.id === 'string' && typeof raw.name === 'string';
}

/** The expense categories; the nine defaults until the list is first changed. */
export async function readCategories(storage: InvoiceStorage): Promise<ExpenseCategory[]> {
  const saved = await storage.readText(CATEGORIES_JSON);
  if (saved === null) {
    return DEFAULT_EXPENSE_CATEGORIES.map((category) => ({ ...category }));
  }
  const parsed: unknown = JSON.parse(saved);
  return Array.isArray(parsed) ? parsed.filter(isCategory).map((category) => ({ id: category.id, name: category.name })) : [];
}

function checkName(categories: ExpenseCategory[], name: string, exceptId: string | null): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new InvoiceError([{ path: 'name', message: 'is required' }]);
  }
  if (categories.some((category) => category.id !== exceptId && category.name.toLowerCase() === trimmed.toLowerCase())) {
    throw new InvoiceError([{ path: 'name', message: `${trimmed} is already a category` }]);
  }
  return trimmed;
}

function freeId(categories: ExpenseCategory[], name: string): string {
  const base = name.normalize('NFD').toLowerCase().split(/[^a-z0-9]+/).filter((part) => part.length > 0).join('-') || FALLBACK_ID;
  return firstFree(base, new Set(categories.map((category) => category.id)));
}

async function save(storage: InvoiceStorage, categories: ExpenseCategory[]): Promise<ExpenseCategory[]> {
  await storage.replace(CATEGORIES_JSON, `${JSON.stringify(categories, null, 2)}\n`);
  return categories;
}

/** Adds a category with a new id; a blank or repeated name is refused. */
export function addCategory(storage: InvoiceStorage, name: string): Promise<ExpenseCategory[]> {
  return storage.withLock(LOCK, async () => {
    const categories = await readCategories(storage);
    const trimmed = checkName(categories, name, null);
    return save(storage, [...categories, { id: freeId(categories, trimmed), name: trimmed }]);
  });
}

/** Renames a category; its id, and so every expense in it, stays. */
export function renameCategory(storage: InvoiceStorage, id: string, name: string): Promise<ExpenseCategory[]> {
  return storage.withLock(LOCK, async () => {
    const categories = await readCategories(storage);
    if (!categories.some((category) => category.id === id)) {
      throw new InvoiceError([{ path: 'id', message: `no category ${id}` }]);
    }
    const trimmed = checkName(categories, name, id);
    return save(storage, categories.map((category) => (category.id === id ? { id, name: trimmed } : category)));
  });
}
