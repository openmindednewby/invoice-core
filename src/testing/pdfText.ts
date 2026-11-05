import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocument({ data: new Uint8Array(bytes), disableFontFace: true, verbosity: 0 }).promise;
  const pages: string[] = [];
  for (let n = 1; n <= pdf.numPages; n += 1) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' ').replace(/\s+/g, ' '));
  }
  return pages.join('\n');
}

export async function pdfPageCount(bytes: Uint8Array): Promise<number> {
  const pdf = await getDocument({ data: new Uint8Array(bytes), disableFontFace: true, verbosity: 0 }).promise;
  return pdf.numPages;
}
