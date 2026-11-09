import { readJsonFile } from './folder';
import { BUILT_IN_RULES } from './rules';
import { clientShape, companyShape, ruleShape } from './schema';
import type { InvoiceStorage } from './storage';
import { InvoiceError } from './types';
import type { Client, Company, InvoiceRequest, Parties, VatRule } from './types';
import { missingForFinal, validateRequest } from './validate';

const SAFE_ID = /^[\w-]+$/;

async function loadRule(storage: InvoiceStorage, id: string): Promise<VatRule> {
  const safe = SAFE_ID.test(id);
  if (safe && (await storage.readText(`rules/${id}.json`)) !== null) {
    return readJsonFile<VatRule>(storage, `rules/${id}.json`, 'rule');
  }
  const builtIn = BUILT_IN_RULES.get(id);
  if (!builtIn) {
    throw new InvoiceError([{ path: 'client.vatRule', message: `unknown VAT rule "${id}"` }]);
  }
  return builtIn;
}

/** Refuses a client id that could not be a single file name. */
export function assertSafeClientId(clientId: string): void {
  if (!SAFE_ID.test(clientId)) {
    throw new InvoiceError([{ path: 'clientId', message: 'must hold only letters, digits, - and _' }]);
  }
}

/** Reads the request's company, client and VAT rule, refusing if any is missing. */
export async function loadParties(storage: InvoiceStorage, clientId: string): Promise<Parties> {
  assertSafeClientId(clientId);
  const company = await readJsonFile<Company>(storage, 'company.json', 'company');
  const client = await readJsonFile<Client>(storage, `clients/${clientId}.json`, 'client');
  return { company, client, rule: await loadRule(storage, client.vatRule) };
}

/** Checks a request and returns its parties; final mode also refuses blank required fields. */
export async function checkRequest(storage: InvoiceStorage, request: InvoiceRequest): Promise<Parties> {
  const errors = validateRequest(request);
  if (errors.length > 0) {
    throw new InvoiceError(errors);
  }
  const parties = await loadParties(storage, request.clientId);
  const shape = [...companyShape(parties.company), ...clientShape(parties.client), ...ruleShape(parties.rule)];
  if (shape.length > 0) {
    throw new InvoiceError(shape);
  }
  const missing = request.draft ? [] : missingForFinal(parties.company, parties.client, request.lines);
  if (missing.length > 0) {
    throw new InvoiceError(missing);
  }
  return parties;
}
