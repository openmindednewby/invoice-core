import { afterEach, describe, expect, it, vi } from 'vitest';

import { bocXlsx } from '../testing/bankFixtures';
import { readZipEntries } from './zipRead';

const END_SIGNATURE = 0x06054b50;
const END_SIZE = 22;
const ENTRY_COUNT_AT = 10;
const CENTRAL_OFFSET_AT = 16;

function endRecordPointingAt(offset: number): Uint8Array {
  const bytes = new Uint8Array(END_SIZE);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, END_SIGNATURE, true);
  view.setUint16(ENTRY_COUNT_AT, 1, true);
  view.setUint32(CENTRAL_OFFSET_AT, offset, true);
  return bytes;
}

describe('readZipEntries', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('with a central directory offset past the end of the file, refuses it as not an xlsx', async () => {
    const bytes = endRecordPointingAt(1000);

    const read = readZipEntries(bytes);

    await expect(read).rejects.toThrow('file: is not an xlsx file');
  });

  it('with corrupt compressed data, refuses it as not an xlsx', async () => {
    const bytes = bocXlsx();
    bytes.fill(0xff, 45, 50);

    const read = readZipEntries(bytes);

    await expect(read).rejects.toThrow('file: is not an xlsx file');
  });

  it('with no deflate support in the runtime, passes the runtime error through', async () => {
    vi.stubGlobal('DecompressionStream', undefined);

    const read = readZipEntries(bocXlsx());

    await expect(read).rejects.toThrow(TypeError);
  });
});
