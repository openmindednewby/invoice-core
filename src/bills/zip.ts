export interface ZipEntry {
  path: string;
  bytes: Uint8Array;
}

const CRC_POLYNOMIAL = 0xedb88320;
const BYTE_VALUES = 256;
const BITS_PER_BYTE = 8;
const LOW_BYTE = 0xff;
const ALL_ONES = 0xffffffff;
const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const END_SIG = 0x06054b50;
const VERSION = 20;
const UTF8_FLAG = 0x0800;
const DOS_DATE_1980_01_01 = 33;
const LOCAL_SIZE = 30;
const CENTRAL_SIZE = 46;
const END_SIZE = 22;
const LOCAL_COMMON_AT = 4;
const CENTRAL_COMMON_AT = 6;
const CENTRAL_OFFSET_AT = 42;

const CRC_TABLE = ((): Uint32Array => {
  const table = new Uint32Array(BYTE_VALUES);
  for (let n = 0; n < BYTE_VALUES; n += 1) {
    let c = n;
    for (let k = 0; k < BITS_PER_BYTE; k += 1) {
      c = (c & 1) === 1 ? CRC_POLYNOMIAL ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

/** The CRC-32 checksum zip files use. */
export function crc32(bytes: Uint8Array): number {
  let c = ALL_ONES;
  for (const byte of bytes) {
    c = (CRC_TABLE[(c ^ byte) & LOW_BYTE] ?? 0) ^ (c >>> BITS_PER_BYTE);
  }
  return (c ^ ALL_ONES) >>> 0;
}

function writeCommon(view: DataView, at: number, entry: { crc: number; size: number; nameLength: number }): void {
  view.setUint16(at, VERSION, true);
  view.setUint16(at + 2, UTF8_FLAG, true);
  view.setUint16(at + 8, DOS_DATE_1980_01_01, true);
  view.setUint32(at + 10, entry.crc, true);
  view.setUint32(at + 14, entry.size, true);
  view.setUint32(at + 18, entry.size, true);
  view.setUint16(at + 22, entry.nameLength, true);
}

function headerWithName(size: number, name: Uint8Array): { bytes: Uint8Array; view: DataView } {
  const bytes = new Uint8Array(size + name.length);
  bytes.set(name, size);
  return { bytes, view: new DataView(bytes.buffer) };
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** Builds an uncompressed zip with UTF-8 names, in entry order. */
export function createZip(entries: ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const body: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.path);
    const common = { crc: crc32(entry.bytes), size: entry.bytes.length, nameLength: name.length };
    const local = headerWithName(LOCAL_SIZE, name);
    local.view.setUint32(0, LOCAL_SIG, true);
    writeCommon(local.view, LOCAL_COMMON_AT, common);
    const record = headerWithName(CENTRAL_SIZE, name);
    record.view.setUint32(0, CENTRAL_SIG, true);
    record.view.setUint16(LOCAL_COMMON_AT, VERSION, true);
    writeCommon(record.view, CENTRAL_COMMON_AT, common);
    record.view.setUint32(CENTRAL_OFFSET_AT, offset, true);
    body.push(local.bytes, entry.bytes);
    central.push(record.bytes);
    offset += local.bytes.length + entry.bytes.length;
  }
  const directory = concat(central);
  const end = new DataView(new ArrayBuffer(END_SIZE));
  end.setUint32(0, END_SIG, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, directory.length, true);
  end.setUint32(16, offset, true);
  return concat([...body, directory, new Uint8Array(end.buffer)]);
}
