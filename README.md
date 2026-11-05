# @dloizides/invoice-core

Invoice logic for local-first apps: gap-free numbering, VAT rules, JSON layouts, PDFs with selectable Greek text, yearly schedules, credit notes and a quarter CSV export. Holds no file access: every function takes an `InvoiceStorage`.

```ts
import { createMemoryStorage, issueInvoice } from '@dloizides/invoice-core';

const storage = createMemoryStorage({ 'company.json': companyText, 'clients/acme.json': clientText });
const { number, pdfPath } = await issueInvoice(storage, {
  clientId: 'acme', period: '2030-09', date: '2030-10-08', amounts: ['1234.50'], draft: false,
});
```

## Storage

Implement `InvoiceStorage` (`src/storage.ts`) for your platform: `readText`, `readBytes`, `list`, `writeNew` (must refuse an existing file with `StorageExistsError`), `replace`, `remove`, `withLock`. Number claims run inside `withLock(NUMBER_LOCK, ...)`, so a browser implementation should back it with Web Locks.

## Folder format

```
format.json                               {"version": 1}
company.json                              name, addressLines, regNo, vatNumber, bank, iban, bic, logo?, layout?
clients/<id>.json                         name, addressLines, taxLines, vatNumber, vatRule, paymentTermsDays, description, layout?
rules/<id>.json                           optional; overrides or adds to BUILT_IN_RULES
layouts/<name>.json                       optional; overrides or adds to BUILT_IN_LAYOUTS
schedules/<clientId>-<year>.json          12 months, each a draft until issued
invoices/<year>/<number>/invoice.json     immutable record
invoices/<year>/<number>/<number>.pdf     the PDF; never replaced
```

`migrateLegacyFolder` moves `<year>/<number>.json` + `.pdf` into `invoices/`, never overwriting. Until then `nextNumber` counts both places.

## Layouts

A layout is plain data (`InvoiceLayout`): margins, sizes, three colours, title alignment. `parseLayout` refuses unknown fields, so a layout cannot carry a script. An unknown name is refused and named.

## Rendering

`renderInvoicePdf` uses pdfmake 0.2.12 and its bundled Roboto, loaded on first use. Pass `render` in the options to replace it.

## Numbers

Invoices number `2030-001`, credit notes `CN-2030-001`, each gap-free per year of their date. `issueDueMonths` dates each invoice on the day it issues; have your accountant confirm that suits your jurisdiction. Built-in VAT rules are not tax advice.
