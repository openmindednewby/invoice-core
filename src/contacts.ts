import { readJsonFile, toJson } from './folder';
import { assertSafeClientId } from './parties';
import { RecipientKind } from './RecipientKind';
import type { InvoiceStorage } from './storage';
import { InvoiceError } from './types';
import type { FieldError } from './types';
import { isBlank } from './validate';

export const CONTACTS_LOCK = 'invoice-contacts';
export const INVALID_EMAIL_MESSAGE = 'must be a valid email address';

const PRINTABLE_ASCII = /^[!-~]+$/;
const EMAIL_SHAPE = /^[^\s@<>,;"]+@[^\s@<>,;".]+(\.[^\s@<>,;".]+)+$/;

export interface Contact { name: string; email: string; role: string; recipient: RecipientKind; }

export interface NewRecipient { email: string; recipient: RecipientKind; }

function contactsPath(clientId: string): string {
  return `contacts/${clientId}.json`;
}

function isContact(value: unknown): value is Contact {
  const entry = value as Partial<Contact> | null;
  const recipientKnown = [RecipientKind.To, RecipientKind.Cc, RecipientKind.Picked].some((kind) => kind === entry?.recipient);
  return typeof entry?.name === 'string' && typeof entry.email === 'string' && typeof entry.role === 'string' && recipientKnown;
}

function contactErrors(contacts: Contact[]): FieldError[] {
  const seen = new Set<string>();
  return contacts.flatMap((contact, index) => {
    const errors: FieldError[] = isBlank(contact.name) ? [{ path: `contacts.${index}.name`, message: 'must not be blank' }] : [];
    const key = contact.email.toLowerCase();
    if (!isValidEmail(contact.email)) {
      errors.push({ path: `contacts.${index}.email`, message: INVALID_EMAIL_MESSAGE });
    } else if (seen.has(key)) {
      errors.push({ path: `contacts.${index}.email`, message: 'is already listed' });
    }
    seen.add(key);
    return errors;
  });
}

/** Whether a text is a single email address safe to put in a mail header. */
export function isValidEmail(address: string): boolean {
  return PRINTABLE_ASCII.test(address) && EMAIL_SHAPE.test(address);
}

/** Reads a client's people; no file means none. */
export async function readContacts(storage: InvoiceStorage, clientId: string): Promise<Contact[]> {
  assertSafeClientId(clientId);
  const path = contactsPath(clientId);
  if ((await storage.readText(path)) === null) {
    return [];
  }
  const { people } = await readJsonFile<{ people?: unknown }>(storage, path, 'contacts');
  if (!Array.isArray(people) || !people.every(isContact)) {
    throw new InvoiceError([{ path: 'contacts', message: `must hold a list of people: ${path}` }]);
  }
  return people;
}

/** Replaces a client's people, refusing a blank name, an invalid address or a repeated address. */
export async function saveContacts(storage: InvoiceStorage, clientId: string, contacts: Contact[]): Promise<void> {
  assertSafeClientId(clientId);
  const errors = contactErrors(contacts);
  if (errors.length > 0) {
    throw new InvoiceError(errors);
  }
  await storage.withLock(CONTACTS_LOCK, () => storage.replace(contactsPath(clientId), toJson({ people: contacts })));
}

/** Adds the addresses a client's people do not have yet, named by their address; returns those added. */
export async function addMissingContacts(storage: InvoiceStorage, clientId: string, recipients: NewRecipient[]): Promise<string[]> {
  return storage.withLock(CONTACTS_LOCK, async () => {
    const contacts = await readContacts(storage, clientId);
    const known = new Set(contacts.map(({ email }) => email.toLowerCase()));
    const fresh = recipients.filter(({ email }) => {
      const isNew = !known.has(email.toLowerCase());
      known.add(email.toLowerCase());
      return isNew;
    });
    if (fresh.length > 0) {
      const added = fresh.map(({ email, recipient }) => ({ name: email, email, role: '', recipient }));
      await storage.replace(contactsPath(clientId), toJson({ people: [...contacts, ...added] }));
    }
    return fresh.map(({ email }) => email);
  });
}
