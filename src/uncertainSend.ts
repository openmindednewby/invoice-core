import type { InvoiceStorage } from './storage';

const UNKNOWN_TIME = '';

/** Where the may-have-gone marker of one document is kept. */
export function uncertainSendPath(number: string): string {
  return `send-uncertain/${number}.json`;
}

function atOf(parsed: unknown): unknown {
  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }
  return 'at' in parsed ? parsed.at : null;
}

function timeIn(text: string): string {
  try {
    const at = atOf(JSON.parse(text));
    return typeof at === 'string' && !Number.isNaN(Date.parse(at)) ? at : UNKNOWN_TIME;
  } catch {
    return UNKNOWN_TIME;
  }
}

/** Returns when a send of unknown outcome happened, or null if none is open; a damaged file still counts as open. */
export async function readUncertainSend(storage: InvoiceStorage, number: string): Promise<string | null> {
  const text = await storage.readText(uncertainSendPath(number));
  return text === null ? null : timeIn(text);
}

/** Keeps on file that a send of this document may have left at this time, so it is never resent on a guess. */
export async function markUncertainSend(storage: InvoiceStorage, number: string, at: string): Promise<void> {
  await storage.replace(uncertainSendPath(number), JSON.stringify({ at }));
}

/** Closes an open unknown outcome once the owner has checked Gmail. */
export async function clearUncertainSend(storage: InvoiceStorage, number: string): Promise<void> {
  await storage.remove(uncertainSendPath(number));
}
