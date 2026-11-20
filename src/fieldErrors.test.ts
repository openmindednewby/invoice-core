import { describe, expect, it } from 'vitest';

import { fieldErrorsOf, hasFieldErrors } from './fieldErrors';
import { InvoiceError } from './types';

describe('fieldErrorsOf', () => {
  it('with an invoice error, returns its fields', () => {
    const error = new InvoiceError([{ path: 'company.iban', message: 'required for a final invoice' }]);

    const errors = fieldErrorsOf(error);

    expect(errors).toEqual([{ path: 'company.iban', message: 'required for a final invoice' }]);
  });

  it('with another error, returns its message with no field', () => {
    const error = new Error('disk full');

    const errors = fieldErrorsOf(error);

    expect(errors).toEqual([{ path: '', message: 'disk full' }]);
  });

  it('with a thrown text, returns the text with no field', () => {
    const error = 'offline';

    const errors = fieldErrorsOf(error);

    expect(errors).toEqual([{ path: '', message: 'offline' }]);
  });
});

describe('hasFieldErrors', () => {
  it.each([
    ['null', null],
    ['a text', 'errors'],
    ['an object whose errors is not a list', { errors: 'none' }],
  ])('with %s, returns false', (_scenario, error) => {
    const result = hasFieldErrors(error);

    expect(result).toBe(false);
  });

  it('with an object holding an errors list, returns true', () => {
    const error = { errors: [] };

    const result = hasFieldErrors(error);

    expect(result).toBe(true);
  });
});
