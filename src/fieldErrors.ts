import type { FieldError } from './types';

/** Whether an error carries a field list, as an InvoiceError does. */
export function hasFieldErrors(error: unknown): error is { errors: FieldError[] } {
  return typeof error === 'object' && error !== null && Array.isArray(Reflect.get(error, 'errors'));
}

/** Returns an error's field list; any other failure becomes one entry with its message. */
export function fieldErrorsOf(error: unknown): FieldError[] {
  if (hasFieldErrors(error)) {
    return error.errors;
  }
  return [{ path: '', message: error instanceof Error ? error.message : String(error) }];
}
