import { vi } from 'vitest';

import { issueInvoice } from '../issue';
import type { MailMessage, MailSender, SendInvoiceInput } from '../sendInvoice';
import type { InvoiceStorage } from '../storage';
import { fakePdf, makeStorage, REQUEST } from './fixtures';

export async function issued(): Promise<InvoiceStorage> {
  const storage = makeStorage();
  await issueInvoice(storage, { ...REQUEST, date: '2030-10-08' }, { render: fakePdf });
  return storage;
}

export function inputWith(overrides: Partial<SendInvoiceInput> = {}): SendInvoiceInput {
  return {
    number: '2030-001', from: 'me@example.test', to: ['ada@example.test'], cc: [], subject: 'Subject', body: 'Body',
    at: '2030-10-09T08:00:00.000Z', today: '2030-10-09', ...overrides,
  };
}

export function senderReturning(messageId: string): MailSender & { send: ReturnType<typeof vi.fn> } {
  return { send: vi.fn((_message: MailMessage) => Promise.resolve({ messageId })) };
}
