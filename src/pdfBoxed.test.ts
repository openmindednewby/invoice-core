import { describe, expect, it } from 'vitest';

import { BUILT_IN_LAYOUTS, DEFAULT_LAYOUT, resolveLayout } from './layouts';
import type { InvoiceLayout } from './layouts';
import { LayoutStyle } from './LayoutStyle';
import { checkRequest } from './parties';
import { buildPdfDefinition } from './pdfDefinition';
import { makeStorage, REQUEST } from './testing/fixtures';
import { buildInvoiceView } from './view';

type Node = Record<string, unknown>;
type Table = { widths: unknown[]; body: Node[][] };

const EMPTY_ROWS = 3;

async function definitionFor(layoutName: string): Promise<{ content: Node[]; layout: InvoiceLayout; text: string }> {
  const storage = makeStorage();
  const parties = await checkRequest(storage, REQUEST);
  const layout = await resolveLayout(storage, layoutName);
  const view = buildInvoiceView({ request: REQUEST, number: '2030-001', parties });
  const definition = buildPdfDefinition(view, layout);
  return { content: definition.content as Node[], layout, text: JSON.stringify(definition) };
}

function byId(content: Node[], id: string): Node {
  const node = content.find((item) => item.id === id);
  if (!node) {
    throw new Error(`no node ${id}`);
  }
  return node;
}

function tableOf(content: Node[], id: string): Table {
  return byId(content, id).table as Table;
}

describe('DEFAULT_LAYOUT AC-TPL-1', () => {
  it('with no layout chosen, uses the boxed Word look', async () => {
    const { layout } = await definitionFor(DEFAULT_LAYOUT);

    expect(layout.style).toBe(LayoutStyle.Boxed);
  });
});

describe('buildPdfDefinition boxed AC-TPL-1', () => {
  it('with the default layout, draws an accent rule under the header', async () => {
    const { content, layout } = await definitionFor(DEFAULT_LAYOUT);

    const rule = byId(content, 'header-rule');

    expect(rule.canvas).toMatchObject([{ type: 'line', lineColor: layout.accent }]);
  });

  it('with the default layout, frames bill-to and details in one shaded two-cell box', async () => {
    const { content } = await definitionFor(DEFAULT_LAYOUT);

    const { body } = tableOf(content, 'meta-box');

    expect(body).toHaveLength(1);
    expect(body[0]).toHaveLength(2);
    expect(body[0]?.every((cell) => typeof cell.fillColor === 'string')).toBe(true);
  });

  it('with the default layout, prints detail labels muted and values bold', async () => {
    const { content, layout } = await definitionFor(DEFAULT_LAYOUT);

    const details = JSON.stringify(tableOf(content, 'meta-box').body[0]?.[1]);

    expect(details).toContain(JSON.stringify({ text: 'Invoice No. / Αρ. Τιμολογίου: ', color: layout.muted }));
    expect(details).toContain(JSON.stringify({ text: '2030-001', bold: true }));
  });

  it('with the default layout, prints the period Greek first', async () => {
    const { text } = await definitionFor(DEFAULT_LAYOUT);

    expect(text).toContain('Σεπτέμβριος 2030 / September 2030');
  });

  it('with one line, the bordered item table holds the line plus three empty rows', async () => {
    const { content } = await definitionFor(DEFAULT_LAYOUT);

    const items = byId(content, 'items');

    expect((items.table as Table).body).toHaveLength(1 + REQUEST.amounts.length + EMPTY_ROWS);
    expect(typeof items.layout).toBe('object');
  });

  it('with the default layout, puts totals in the amount column with a shaded total cell', async () => {
    const { content, layout } = await definitionFor(DEFAULT_LAYOUT);

    const totals = tableOf(content, 'totals');

    expect(totals.widths).toEqual(tableOf(content, 'items').widths);
    expect(totals.body.at(-1)?.[1]).toMatchObject({ fillColor: layout.band, bold: true });
  });
});

describe('buildPdfDefinition boxed AC-TPL-2', () => {
  it('with a reverse-charge client, keeps the note, due date and reference', async () => {
    const { text } = await definitionFor(DEFAULT_LAYOUT);

    expect(text).toContain('196');
    expect(text).toContain('Due date / Ημ. Πληρωμής');
    expect(text).toContain('Reference / Αιτιολογία');
  });
});

describe('buildPdfDefinition every layout AC-TPL-3', () => {
  it.each(Object.keys(BUILT_IN_LAYOUTS))('with layout %s, prints Account Name and keeps AMOUNT on one line', async (name) => {
    const { content, text } = await definitionFor(name);

    const head = tableOf(content, 'items').body[0]?.[1];

    expect(text).toContain('Account Name / Δικαιούχος');
    expect(head).toMatchObject({ text: 'AMOUNT / ΠΟΣΟ (€)', noWrap: true });
  });
});
