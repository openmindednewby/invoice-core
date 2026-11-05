import { LayoutAlign } from './LayoutAlign';
import type { InvoiceStorage } from './storage';
import { InvoiceError } from './types';
import type { FieldError, InvoiceRequest, Parties } from './types';

const SAFE_NAME = /^[\w-]+$/;
const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;
const NUMBER_RANGES: Record<string, [number, number]> = { pageMargin: [10, 80], bodySize: [6, 14], titleSize: [10, 40], logoWidth: [20, 240] };
const COLOUR_KEYS = ['accent', 'muted', 'band'];
const ALLOWED_KEYS = new Set(['name', 'titleAlign', ...COLOUR_KEYS, ...Object.keys(NUMBER_RANGES)]);

/** The name a request uses when neither it, the client nor the company picks a layout. */
export const DEFAULT_LAYOUT = 'classic';

/** The look of a PDF: plain data only, so a layout cannot run anything. */
export interface InvoiceLayout {
  name: string; pageMargin: number; bodySize: number; titleSize: number; logoWidth: number;
  accent: string; muted: string; band: string; titleAlign: LayoutAlign;
}

/** The layouts every folder can use; a file in layouts/ overrides them by name. */
export const BUILT_IN_LAYOUTS = {
  classic: { name: 'classic', pageMargin: 40, bodySize: 9.5, titleSize: 22, logoWidth: 90, accent: '#1F3A5F', muted: '#666666', band: '#E4ECF5', titleAlign: LayoutAlign.Right },
  compact: { name: 'compact', pageMargin: 28, bodySize: 8.5, titleSize: 16, logoWidth: 60, accent: '#2F4F4F', muted: '#5F5F5F', band: '#E8EFEE', titleAlign: LayoutAlign.Left },
} as const satisfies Record<string, InvoiceLayout>;

const BUILT_IN_BY_NAME: ReadonlyMap<string, InvoiceLayout> = new Map(Object.entries(BUILT_IN_LAYOUTS));

function fieldErrors(data: Record<string, unknown>): FieldError[] {
  const errors: FieldError[] = Object.keys(data).filter((key) => !ALLOWED_KEYS.has(key)).map((key) => ({ path: `layout.${key}`, message: 'unknown field' }));
  if (typeof data.name !== 'string') {
    errors.push({ path: 'layout.name', message: 'must be text' });
  }
  if (data.titleAlign !== LayoutAlign.Left && data.titleAlign !== LayoutAlign.Right) {
    errors.push({ path: 'layout.titleAlign', message: 'must be left or right' });
  }
  COLOUR_KEYS.filter((key) => typeof data[key] !== 'string' || !HEX_COLOUR.test(data[key])).forEach((key) => errors.push({ path: `layout.${key}`, message: 'must be a colour like #1F3A5F' }));
  Object.entries(NUMBER_RANGES).forEach(([key, [min, max]]) => {
    const value = data[key];
    if (typeof value !== 'number' || !(value >= min && value <= max)) {
      errors.push({ path: `layout.${key}`, message: `must be a number from ${min} to ${max}` });
    }
  });
  return errors;
}

/** Checks a parsed layout file; refuses unknown fields and anything but plain values. */
export function parseLayout(raw: unknown): InvoiceLayout {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new InvoiceError([{ path: 'layout', message: 'must be a JSON object' }]);
  }
  const errors = fieldErrors(raw as Record<string, unknown>);
  if (errors.length > 0) {
    throw new InvoiceError(errors);
  }
  return raw as InvoiceLayout;
}

function parseLayoutText(text: string, name: string): InvoiceLayout {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new InvoiceError([{ path: 'layout', message: `invalid JSON in layout "${name}"` }]);
  }
  return parseLayout(parsed);
}

/** Finds a layout in the data folder, then the built-in set; an unknown name is refused and named. */
export async function resolveLayout(storage: InvoiceStorage, name: string): Promise<InvoiceLayout> {
  const text = SAFE_NAME.test(name) ? await storage.readText(`layouts/${name}.json`) : null;
  if (text !== null) {
    return parseLayoutText(text, name);
  }
  const builtIn = BUILT_IN_BY_NAME.get(name);
  if (!builtIn) {
    throw new InvoiceError([{ path: 'layout', message: `unknown layout "${name}"` }]);
  }
  return builtIn;
}

/** The layout name in force: request, then client, then company, then the default. */
export function selectLayoutName(request: InvoiceRequest, parties: Parties): string {
  return request.layout ?? parties.client.layout ?? parties.company.layout ?? DEFAULT_LAYOUT;
}
