import { describe, expect, it } from 'vitest';

import { appendSignature, fillEmailSignature, readEmailSignature, readSenderAddress, saveEmailSignature, saveSenderAddress } from './emailTemplates';
import { issueInvoice, readInvoice } from './issue';
import { fakePdf, makeStorage, REQUEST } from './testing/fixtures';
import type { InvoiceRecord } from './types';

async function issuedRecord(): Promise<InvoiceRecord> {
  const storage = makeStorage();
  await issueInvoice(storage, { ...REQUEST, date: '2030-10-08' }, { render: fakePdf });
  return readInvoice(storage, '2030-001');
}

describe('saveEmailSignature AC-1 AC-3', () => {
  it('with a multi-line signature, reads it back', async () => {
    const storage = makeStorage();

    await saveEmailSignature(storage, 'Jim\nMoon Cube Ltd');

    expect(await readEmailSignature(storage)).toBe('Jim\nMoon Cube Ltd');
  });

  it('with nothing stored or a blank signature, reads back as none', async () => {
    const storage = makeStorage();
    const before = await readEmailSignature(storage);

    await saveEmailSignature(storage, '  \n ');

    expect([before, await readEmailSignature(storage)]).toEqual(['', '']);
  });

  it('with a saved sender address, keeps the address', async () => {
    const storage = makeStorage();
    await saveSenderAddress(storage, 'me@example.test');

    await saveEmailSignature(storage, 'Jim');

    expect(await readSenderAddress(storage)).toBe('me@example.test');
  });

  it('when the sender address is saved after it, keeps the signature', async () => {
    const storage = makeStorage();
    await saveEmailSignature(storage, 'Jim');

    await saveSenderAddress(storage, 'me@example.test');

    expect(await readEmailSignature(storage)).toBe('Jim');
  });
});

describe('fillEmailSignature AC-4', () => {
  it('with a template placeholder, fills it from the record', async () => {
    const record = await issuedRecord();

    const filled = fillEmailSignature('Jim\n{companyName}', record);

    expect(filled).toBe(`Jim\n${record.company.name}`);
  });

  it('with an unknown placeholder, refuses and names it on signature', async () => {
    const record = await issuedRecord();

    const fill = (): unknown => fillEmailSignature('Jim {phone}', record);

    expect(fill).toThrow('signature: unknown placeholder {phone}');
  });
});

describe('appendSignature AC-5 AC-6 AC-7', () => {
  it.each([
    ['a body', 'Hello\nBye', 'Jim', 'Hello\nBye\n\nJim'],
    ['a body ending in newlines', 'Hello\n\n', 'Jim\n', 'Hello\n\nJim'],
    ['no signature', 'Hello\n', ' ', 'Hello\n'],
    ['a body already ending with it', 'Hello\n\nJim\nLtd\n', 'Jim\nLtd', 'Hello\n\nJim\nLtd\n'],
    ['a CRLF body', 'Hello\r\nBye', 'Jim\nLtd', 'Hello\r\nBye\r\n\r\nJim\r\nLtd'],
  ])('with %s, returns the expected message', (_case, body, signature, expected) => {
    const message = appendSignature(body, signature);

    expect(message).toBe(expected);
  });
});
