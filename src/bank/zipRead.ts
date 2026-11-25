import { InvoiceError } from '../types';

const END_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const END_SIZE = 22;
const MAX_COMMENT = 65535;
const CENTRAL_SIZE = 46;
const LOCAL_SIZE = 30;
const STORED = 0;
const DEFLATED = 8;
const decoder = new TextDecoder();

interface CentralEntry {
  name: string;
  method: number;
  size: number;
  local: number;
  next: number;
}

function notXlsx(): InvoiceError {
  return new InvoiceError([{ path: 'file', message: 'is not an xlsx file' }]);
}

function endOffset(view: DataView): number {
  const last = view.byteLength - END_SIZE;
  for (let offset = last; offset >= Math.max(0, last - MAX_COMMENT); offset -= 1) {
    if (view.getUint32(offset, true) === END_SIGNATURE) {
      return offset;
    }
  }
  throw notXlsx();
}

function centralEntry(view: DataView, bytes: Uint8Array, offset: number): CentralEntry {
  if (view.getUint32(offset, true) !== CENTRAL_SIGNATURE) {
    throw notXlsx();
  }
  const nameLength = view.getUint16(offset + 28, true);
  const nameStart = offset + CENTRAL_SIZE;
  return {
    name: decoder.decode(bytes.subarray(nameStart, nameStart + nameLength)),
    method: view.getUint16(offset + 10, true),
    size: view.getUint32(offset + 20, true),
    local: view.getUint32(offset + 42, true),
    next: nameStart + nameLength + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true),
  };
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data.slice()]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function entryData(view: DataView, bytes: Uint8Array, entry: CentralEntry): Promise<Uint8Array> {
  const start = entry.local + LOCAL_SIZE + view.getUint16(entry.local + 26, true) + view.getUint16(entry.local + 28, true);
  const raw = bytes.subarray(start, start + entry.size);
  if (entry.method === STORED) {
    return Promise.resolve(raw.slice());
  }
  if (entry.method === DEFLATED) {
    return inflate(raw);
  }
  throw notXlsx();
}

async function readEntries(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = endOffset(view);
  const entries = new Map<string, Uint8Array>();
  let offset = view.getUint32(end + 16, true);
  for (let index = 0; index < view.getUint16(end + 10, true); index += 1) {
    const entry = centralEntry(view, bytes, offset);
    entries.set(entry.name, await entryData(view, bytes, entry));
    offset = entry.next;
  }
  return entries;
}

/** The files of a zip archive by name; throws InvoiceError when the bytes are not a readable zip. */
export async function readZipEntries(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  try {
    return await readEntries(bytes);
  } catch (error) {
    throw error instanceof InvoiceError ? error : notXlsx();
  }
}
