# Changelog

## 0.8.0

- Email signature in `email-templates/settings.json`: `readEmailSignature`, `saveEmailSignature` (blank = none); saving the signature or the sender address keeps the other.
- `fillEmailSignature` fills the template placeholders in a signature and refuses an unknown one.
- `appendSignature` puts the signature under a body after one blank line, in the body's line ending, and never adds it twice.

## 0.6.0

- Contacts per client in `contacts/<clientId>.json`: `readContacts`, `saveContacts`, `addMissingContacts`, `isValidEmail`, `RecipientKind`.
- Email templates in `email-templates/`, per kind with an optional per-client override, Greek built-ins (`BUILT_IN_EMAIL_TEMPLATES`), placeholders `{number}` `{period}` `{total}` `{dueDate}` `{clientName}` `{companyName}`; an unknown placeholder is refused. The sender address is stored in `email-templates/settings.json`.
- `sendInvoice` sends an issued invoice through a `MailSender` port, appends to `sends.json` and marks it sent; a resend keeps the first sent date. `SentNotRecordedError` means the mail left but recording it failed.
- `readSendHistory` flags a send whose PDF differs from today's file. `sends.json` is not reported as a sync-copy conflict.

## 0.5.0

- New built-in layout `standard`, now `DEFAULT_LAYOUT`: accent rule under the header, bill-to and details in one framed shaded box (muted labels, bold values, period Greek first), bordered line table with three empty rows, totals in the amount column with a framed shaded total. Reverse charge note, due date and reference stay.
- `InvoiceLayout.style` (`LayoutStyle.Plain` or `LayoutStyle.Boxed`, optional, plain when absent).
- Every layout prints "Account Name / Δικαιούχος" (the company name) in the payment details and keeps the AMOUNT head on one line.

## 0.4.0

- `editInvoice` edits an issued invoice that was not sent: same number, record and PDF replaced in place, each edit logged in `edits.json` (`readEditLog`, `isEdited`). Number and kind cannot be edited, the date stays in the number's year, and an invoice with a credit note or a sent date is refused (`InvoiceSentError`, `isInvoiceSentError`).
- `markSent`, `markUnsent` and `readSentStatus` keep a sent date in `status.json`; `markUnsent` is refused while the invoice is paid.
- `markPaid` and `markUnpaid` merge into `status.json`, so the sent date survives them.
- `edits.json` is no longer reported as a sync-copy conflict.

## 0.3.0

- A number folder left empty by a failed write no longer uses up its number; the retry takes it.
- `FolderConflictKind` gains `MissingRecord`, `MissingPdf` and `DuplicateScheduleMonth`. The last two are reported but do not block issuing, so they can be fixed by a reprint or a credit note.
- A corrupt logo is refused before the number lock; a render that never finishes rejects after `renderTimeoutMs` (default 60 s).
- `issueDueMonths` reports a month with a record as issued, with `errors` if its PDF or the schedule save failed; such a month can no longer be edited.
- `reprintInvoice` replaces a 0-byte PDF.
- The last credit note of an invoice takes the remaining VAT, so the parts add up; `RenderInput.totals` prints what the record holds.
- `issueInvoice`, `issueCreditNote`, `prepareYearSchedule` and `exportQuarterCsv` refuse a folder that still holds old-layout files; `openDataFolder` reports it as legacy even with a format file.
- `migrateLegacyFolder` finishes an interrupted move on a rerun.
- `formatCents` formats negative amounts.

## 0.2.0

Open a picked folder (`openDataFolder`), payment status in a separate `status.json`, sync-conflict and duplicate-number detection that blocks issuing, and `StorageExistsError` recognised by name so another package can implement the storage.

## 0.1.0

First release: storage interface, numbering, validation, VAT rules, JSON layouts, pdfmake rendering, yearly schedules, credit notes, quarter CSV export, legacy folder migration.
