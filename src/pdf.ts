import { resolveLayout, selectLayoutName } from './layouts';
import { buildPdfDefinition } from './pdfDefinition';
import type { PdfLogo } from './pdfDefinition';
import type { InvoiceStorage } from './storage';
import { InvoiceError } from './types';
import { buildInvoiceView } from './view';
import type { RenderInput } from './view';

const IMAGE_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };
const BASE64_CHUNK = 32768;

interface PdfDocument { getBuffer(callback: (bytes: Uint8Array) => void): void; }
interface PdfMake { createPdf(definition: object, layouts?: unknown, fonts?: unknown, vfs?: unknown): PdfDocument; }
interface FontModule { vfs?: unknown; pdfMake?: { vfs?: unknown }; }

function unwrap<T>(module: { default?: T } & T): T {
  return module.default ?? module;
}

async function loadPdfMake(): Promise<{ pdfMake: PdfMake; vfs: unknown }> {
  const [pdfModule, fontModule] = await Promise.all([
    import('pdfmake/build/pdfmake.js') as Promise<{ default?: PdfMake } & PdfMake>,
    import('pdfmake/build/vfs_fonts.js') as Promise<{ default?: FontModule } & FontModule>,
  ]);
  const fonts = unwrap<FontModule>(fontModule);
  return { pdfMake: unwrap<PdfMake>(pdfModule), vfs: fonts.pdfMake?.vfs ?? fonts.vfs ?? fonts };
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let start = 0; start < bytes.length; start += BASE64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(start, start + BASE64_CHUNK));
  }
  return btoa(binary);
}

/** Reads the company logo for a PDF; PNG, JPG or SVG, refusing anything else or a missing file. */
export async function loadLogo(storage: InvoiceStorage, logo?: string): Promise<PdfLogo | undefined> {
  if (!logo) {
    return undefined;
  }
  const extension = logo.split('.').pop()?.toLowerCase() ?? '';
  const type = IMAGE_TYPES[extension];
  if (!type && extension !== 'svg') {
    throw new InvoiceError([{ path: 'company.logo', message: 'must be PNG, JPG or SVG' }]);
  }
  const bytes = await storage.readBytes(logo);
  if (!bytes) {
    throw new InvoiceError([{ path: 'company.logo', message: `file not found: ${logo}` }]);
  }
  return type ? { image: `data:${type};base64,${toBase64(bytes)}` } : { svg: new TextDecoder().decode(bytes) };
}

function toBytes(pdfMake: PdfMake, definition: object, vfs: unknown): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    try {
      pdfMake.createPdf(definition, undefined, undefined, vfs).getBuffer((bytes) => resolve(new Uint8Array(bytes)));
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

/** Renders an invoice or credit note to PDF bytes with selectable Greek text. Works in browsers and Node. */
export async function renderInvoicePdf(storage: InvoiceStorage, input: RenderInput): Promise<Uint8Array> {
  const layout = await resolveLayout(storage, selectLayoutName(input.request, input.parties));
  const logo = await loadLogo(storage, input.parties.company.logo);
  const { pdfMake, vfs } = await loadPdfMake();
  return toBytes(pdfMake, buildPdfDefinition(buildInvoiceView(input), layout, logo), vfs);
}
