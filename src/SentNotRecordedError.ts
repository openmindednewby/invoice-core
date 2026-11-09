import { InvoiceError } from './types';

export class SentNotRecordedError extends InvoiceError {
  readonly messageId: string;
  readonly logged: boolean;

  constructor(number: string, messageId: string, logged: boolean) {
    super([{ path: 'send', message: `${number} was sent as message ${messageId} but ${logged ? 'could not be marked sent' : 'could not be logged'}; do not send it again` }]);
    this.name = 'SentNotRecordedError';
    this.messageId = messageId;
    this.logged = logged;
  }
}

/** Whether an error means the mail left but recording it failed; matched by name across packages. */
export function isSentNotRecordedError(error: unknown): error is SentNotRecordedError {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'SentNotRecordedError';
}
