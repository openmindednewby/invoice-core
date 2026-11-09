import { describe, expect, it } from 'vitest';

import { addMissingContacts, isValidEmail, readContacts, saveContacts } from './contacts';
import { issueInvoice } from './issue';
import { RecipientKind } from './RecipientKind';
import { fakePdf, makeStorage, REQUEST } from './testing/fixtures';

const CONTACTS_PATH = 'contacts/acme.json';
const RECORD_PATH = 'invoices/2030/2030-001/invoice.json';

describe('saveContacts AC-1', () => {
  it('with valid people, stores name, email, role and To or Cc in the client contacts file', async () => {
    const storage = makeStorage();
    const people = [
      { name: 'Ada Example', email: 'ada@example.test', role: 'Accounts', recipient: RecipientKind.To },
      { name: 'Ben Example', email: 'ben@example.test', role: '', recipient: RecipientKind.Cc },
    ];

    await saveContacts(storage, 'acme', people);

    expect(JSON.parse((await storage.readText(CONTACTS_PATH)) ?? '')).toEqual({ people });
  });

  it('with an issued invoice for the client, leaves the issued record byte for byte', async () => {
    const storage = makeStorage();
    await issueInvoice(storage, { ...REQUEST, date: '2030-10-08' }, { render: fakePdf });
    const before = await storage.readText(RECORD_PATH);

    await saveContacts(storage, 'acme', [{ name: 'Ada Example', email: 'ada@example.test', role: '', recipient: RecipientKind.To }]);

    expect(await storage.readText(RECORD_PATH)).toBe(before);
  });

  it('with a client id that could leave the folder, refuses and writes nothing', async () => {
    const storage = makeStorage();

    const save = saveContacts(storage, '../acme', []);

    await expect(save).rejects.toThrow('clientId');
    expect(await storage.list('contacts')).toEqual([]);
  });

  it('with a blank name, refuses on that field', async () => {
    const storage = makeStorage();

    const save = saveContacts(storage, 'acme', [{ name: ' ', email: 'ada@example.test', role: '', recipient: RecipientKind.To }]);

    await expect(save).rejects.toMatchObject({ errors: [{ path: 'contacts.0.name' }] });
  });

  it('with the same address twice in different case, refuses on the second', async () => {
    const storage = makeStorage();
    const people = [
      { name: 'Ada', email: 'ada@example.test', role: '', recipient: RecipientKind.To },
      { name: 'Ada again', email: 'ADA@example.test', role: '', recipient: RecipientKind.Cc },
    ];

    const save = saveContacts(storage, 'acme', people);

    await expect(save).rejects.toMatchObject({ errors: [{ path: 'contacts.1.email', message: 'is already listed' }] });
  });
});

describe('saveContacts AC-3', () => {
  it('with an invalid address, refuses with a message on that field and writes nothing', async () => {
    const storage = makeStorage();
    const people = [
      { name: 'Ada', email: 'ada@example.test', role: '', recipient: RecipientKind.To },
      { name: 'Ben', email: 'ben.example.test', role: '', recipient: RecipientKind.Cc },
    ];

    const save = saveContacts(storage, 'acme', people);

    await expect(save).rejects.toMatchObject({ errors: [{ path: 'contacts.1.email', message: 'must be a valid email address' }] });
    expect(await storage.readText(CONTACTS_PATH)).toBeNull();
  });
});

describe('isValidEmail AC-3', () => {
  it.each(['ada@example.test', 'ada.b+inv@mail.example.gr'])('with %s, returns true', (address) => {
    const valid = isValidEmail(address);

    expect(valid).toBe(true);
  });

  it.each(['', 'ada', 'ada@', '@example.test', 'ada@example', 'a b@example.test', 'ada@example.test\nBcc: x@example.test', 'ada@example..test', 'a,b@example.test'])(
    'with %j, returns false',
    (address) => {
      const valid = isValidEmail(address);

      expect(valid).toBe(false);
    },
  );
});

describe('isValidEmail header safety', () => {
  it.each(['άδα@example.test', 'ada@exämple.test', 'ada\u0000@example.test', 'ada@example.test\u0007', 'ada\u007f@example.test'])(
    'with the non-ASCII or control address %j, returns false',
    (address) => {
      const valid = isValidEmail(address);

      expect(valid).toBe(false);
    },
  );
});

describe('readContacts', () => {
  it('with no contacts file, returns no people', async () => {
    const storage = makeStorage();

    const people = await readContacts(storage, 'acme');

    expect(people).toEqual([]);
  });

  it('with a file that is not a people list, refuses and names it', async () => {
    const storage = makeStorage();
    await storage.writeNew(CONTACTS_PATH, '{"people":[{"name":1}]}');

    const read = readContacts(storage, 'acme');

    await expect(read).rejects.toThrow(CONTACTS_PATH);
  });
});

describe('addMissingContacts AC-4', () => {
  it('with a new address, appends it under its address and keeps the existing people', async () => {
    const storage = makeStorage();
    const ada = { name: 'Ada', email: 'ada@example.test', role: 'Accounts', recipient: RecipientKind.To };
    await saveContacts(storage, 'acme', [ada]);

    const added = await addMissingContacts(storage, 'acme', [{ email: 'new@example.test', recipient: RecipientKind.Cc }]);

    expect(added).toEqual(['new@example.test']);
    expect(await readContacts(storage, 'acme')).toEqual([ada, { name: 'new@example.test', email: 'new@example.test', role: '', recipient: RecipientKind.Cc }]);
  });

  it('with a known address in another case, adds nothing and does not create a file change', async () => {
    const storage = makeStorage();
    await saveContacts(storage, 'acme', [{ name: 'Ada', email: 'ada@example.test', role: '', recipient: RecipientKind.To }]);
    const before = await storage.readText(CONTACTS_PATH);

    const added = await addMissingContacts(storage, 'acme', [{ email: 'ADA@example.test', recipient: RecipientKind.Cc }]);

    expect(added).toEqual([]);
    expect(await storage.readText(CONTACTS_PATH)).toBe(before);
  });

  it('with one new address listed twice, adds it once', async () => {
    const storage = makeStorage();
    const recipients = [{ email: 'new@example.test', recipient: RecipientKind.To }, { email: 'NEW@example.test', recipient: RecipientKind.Cc }];

    const added = await addMissingContacts(storage, 'acme', recipients);

    expect(added).toEqual(['new@example.test']);
  });

  it('with two additions at once, keeps both', async () => {
    const storage = makeStorage();

    await Promise.all([
      addMissingContacts(storage, 'acme', [{ email: 'one@example.test', recipient: RecipientKind.To }]),
      addMissingContacts(storage, 'acme', [{ email: 'two@example.test', recipient: RecipientKind.To }]),
    ]);

    expect((await readContacts(storage, 'acme')).map((person) => person.email)).toEqual(['one@example.test', 'two@example.test']);
  });
});
