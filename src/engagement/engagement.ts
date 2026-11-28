import { Ledger } from '@dloizides/evidence-ledger';

import { readJsonFile, toJson } from '../folder';
import { isStorageExistsError } from '../storage';
import type { InvoiceStorage } from '../storage';
import { InvoiceError } from '../types';
import { ENGAGEMENT_STEP_ORDER } from './EngagementStepKey';
import { StepStatus } from './StepStatus';
import type { Engagement, EngagementInput, EngagementOptions } from './engagementTypes';
import { ledgerStorageAt } from './ledgerStorage';

export const CLIENTS_DIR = 'clients';
export const ENGAGEMENTS_DIR = 'engagements';
export const ENGAGEMENT_JSON = 'engagement.json';
export const LEDGER_JSON = 'ledger.json';
const EMPTY_LEDGER = '[]';
const LABEL = 'engagement';
const UNSAFE_CHARS = ['/', String.fromCharCode(92), String.fromCharCode(0)];

function fail(path: string, message: string): never {
  throw new InvoiceError([{ path, message }]);
}

function assertSegment(path: string, value: string): void {
  if (value === '' || value === '.' || value === '..' || UNSAFE_CHARS.some((c) => value.includes(c))) {
    fail(path, 'must be a single folder name');
  }
}

export function engagementDir(clientId: string, engagementId: string): string {
  return `${CLIENTS_DIR}/${clientId}/${ENGAGEMENTS_DIR}/${engagementId}`;
}

export async function readEngagement(storage: InvoiceStorage, clientId: string, engagementId: string): Promise<Engagement> {
  return readJsonFile<Engagement>(storage, `${engagementDir(clientId, engagementId)}/${ENGAGEMENT_JSON}`, LABEL);
}

export async function startEngagement(storage: InvoiceStorage, input: EngagementInput, options: EngagementOptions = {}): Promise<Engagement> {
  const name = input.name.trim();
  if (name === '') {
    fail('name', 'is required');
  }
  assertSegment('clientId', input.clientId);
  const id = (options.newId ?? ((): string => globalThis.crypto.randomUUID()))();
  assertSegment('id', id);
  const engagement: Engagement = {
    id,
    clientId: input.clientId,
    name,
    mode: input.mode,
    steps: ENGAGEMENT_STEP_ORDER.map((key) => ({ key, status: StepStatus.Todo })),
    createdAt: (options.now ?? ((): Date => new Date()))().toISOString(),
  };
  const dir = engagementDir(input.clientId, id);
  try {
    await storage.writeNew(`${dir}/${ENGAGEMENT_JSON}`, toJson(engagement));
  } catch (error) {
    return isStorageExistsError(error) ? fail('id', `engagement ${id} already exists`) : Promise.reject(error as Error);
  }
  await storage.writeNew(`${dir}/${LEDGER_JSON}`, EMPTY_LEDGER);
  return engagement;
}

export async function listEngagements(storage: InvoiceStorage, clientId: string): Promise<Engagement[]> {
  assertSegment('clientId', clientId);
  const ids = await storage.list(`${CLIENTS_DIR}/${clientId}/${ENGAGEMENTS_DIR}`);
  const found = await Promise.all(ids.map((id) => readEngagement(storage, clientId, id).catch(() => null)));
  return found
    .filter((e): e is Engagement => e !== null)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function openEngagementLedger(storage: InvoiceStorage, clientId: string, engagementId: string): Promise<Ledger> {
  await readEngagement(storage, clientId, engagementId);
  return Ledger.open(ledgerStorageAt(storage, engagementDir(clientId, engagementId)));
}
