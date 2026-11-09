import { InvoiceError } from './types';

export interface RecordOutcome { logged: boolean; marked: boolean; }

function failedSteps({ logged, marked }: RecordOutcome): string {
  return [...(logged ? [] : ['logged']), ...(marked ? [] : ['marked sent'])].join(' or ');
}

export class SentNotRecordedError extends InvoiceError {
  readonly messageId: string;
  readonly logged: boolean;
  readonly marked: boolean;

  constructor(number: string, messageId: string, outcome: RecordOutcome) {
    super([{ path: 'send', message: `${number} was sent as message ${messageId} but could not be ${failedSteps(outcome)}; do not send it again` }]);
    this.name = 'SentNotRecordedError';
    this.messageId = messageId;
    this.logged = outcome.logged;
    this.marked = outcome.marked;
  }
}

/** Whether an error means the mail left but recording it failed; matched by name across packages. */
export function isSentNotRecordedError(error: unknown): error is SentNotRecordedError {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'SentNotRecordedError';
}
