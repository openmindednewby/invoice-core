import { describe, expect, it } from 'vitest';

import { issueInvoice } from './issue';
import { BUILT_IN_LAYOUTS, parseLayout, resolveLayout } from './layouts';
import { nextNumber } from './numbering';
import { checkRequest } from './parties';
import { buildPdfDefinition } from './pdfDefinition';
import { makeStorage, REQUEST } from './testing/fixtures';
import { buildInvoiceView } from './view';

async function definitionFor(layoutName: string): Promise<string> {
  const storage = makeStorage();
  const parties = await checkRequest(storage, REQUEST);
  const layout = await resolveLayout(storage, layoutName);
  const view = buildInvoiceView({ request: REQUEST, number: '2030-001', parties });
  return JSON.stringify(buildPdfDefinition(view, layout));
}

describe('resolveLayout AC-13', () => {
  it('with two built-in layouts, each selects a different look', async () => {
    const names = Object.keys(BUILT_IN_LAYOUTS);

    const [first, second] = await Promise.all(names.slice(0, 2).map(definitionFor));

    expect(names.length).toBeGreaterThanOrEqual(2);
    expect(first).not.toBe(second);
  });

  it('with an unknown layout, refuses and names it', async () => {
    const storage = makeStorage();

    const attempt = resolveLayout(storage, 'nope');

    await expect(attempt).rejects.toMatchObject({ errors: [{ path: 'layout', message: 'unknown layout "nope"' }] });
  });

  it('with a layout in the data folder, uses it over the built-in', async () => {
    const storage = makeStorage();
    const custom = { ...BUILT_IN_LAYOUTS.classic, accent: '#123456' };
    await storage.writeNew('layouts/classic.json', JSON.stringify(custom));

    const layout = await resolveLayout(storage, 'classic');

    expect(layout.accent).toBe('#123456');
  });
});

describe('parseLayout AC-13', () => {
  it('with an unknown key, refuses and names the key', () => {
    const raw = { ...BUILT_IN_LAYOUTS.classic, script: 'alert(1)' };

    const parse = (): unknown => parseLayout(raw);

    expect(parse).toThrow('layout.script');
  });

  it('with a colour that is not hex, refuses and names the field', () => {
    const raw = { ...BUILT_IN_LAYOUTS.classic, accent: 'url(x)' };

    const parse = (): unknown => parseLayout(raw);

    expect(parse).toThrow('layout.accent');
  });
});

describe('issueInvoice layout selection AC-13', () => {
  it('with an unknown layout on the request, refuses before taking a number', async () => {
    const storage = makeStorage();

    const attempt = issueInvoice(storage, { ...REQUEST, layout: 'nope' });

    await expect(attempt).rejects.toMatchObject({ errors: [{ path: 'layout' }] });
    expect(await nextNumber(storage, '2030')).toBe('2030-001');
  });
});
