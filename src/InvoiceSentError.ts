import { InvoiceError } from './types';

export class InvoiceSentError extends InvoiceError {
  readonly sentOn: string;

  constructor(number: string, sentOn: string) {
    super([{ path: 'number', message: `${number} was sent on ${sentOn}; only a credit note can correct it` }]);
    this.name = 'InvoiceSentError';
    this.sentOn = sentOn;
  }
}

/** Whether an error means the invoice was already sent; matched by name, so another package's class of this name counts. */
export function isInvoiceSentError(error: unknown): error is InvoiceSentError {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'InvoiceSentError';
}
