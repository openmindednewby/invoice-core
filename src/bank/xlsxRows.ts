import { isFileFormatError, readXlsxRows as readSheetRows } from '@dloizides/utils/xlsx';
import type { CellValue } from '@dloizides/utils/xlsx';

import { InvoiceError } from '../types';

/** The rows of one sheet of an xlsx file; throws InvoiceError when the bytes are not an xlsx file. */
export async function readXlsxRows(bytes: Uint8Array, sheetName: string | null): Promise<CellValue[][]> {
  try {
    return await readSheetRows(bytes, sheetName);
  } catch (error) {
    throw isFileFormatError(error) ? new InvoiceError([{ path: 'file', message: 'is not an xlsx file' }]) : error;
  }
}
