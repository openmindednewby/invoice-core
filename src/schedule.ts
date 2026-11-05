import { ensureFormat, readJsonFile, toJson } from './folder';
import { issueInvoice, listIssued } from './issue';
import type { PdfRender } from './issue';
import { expandDescription } from './lines';
import { toCents } from './money';
import { loadParties } from './parties';
import { isStorageExistsError } from './storage';
import type { InvoiceStorage } from './storage';
import { InvoiceError } from './types';
import type { FieldError, InvoiceLine } from './types';
import { isRealDate, validateLines } from './validate';

const MONTHS_IN_YEAR = 12;
const YEAR = /^\d{4}$/;
const SAFE_ID = /^[\w-]+$/;

/** One month of a schedule: a draft until number is set. */
export interface ScheduleMonth { period: string; lines: InvoiceLine[]; number: string | null; issuedOn: string | null; }

/** A client's yearly schedule, stored in schedules/<id>.json. */
export interface InvoiceSchedule { id: string; clientId: string; year: string; months: ScheduleMonth[]; }

/** What to prepare: a client and the amount each month starts with. */
export interface PrepareScheduleRequest { clientId: string; year: string; monthlyAmount: string; }

/** The clock and renderer for issuing due months. */
export interface IssueDueOptions { today: string; render?: PdfRender; }

/** What issuing due months did; a failure stops the run and leaves the rest as drafts. */
export interface IssueDueResult {
  issued: { period: string; number: string }[];
  failed: { period: string; errors: FieldError[] } | null;
  remaining: string[];
}

function schedulePath(id: string): string {
  return `schedules/${id}.json`;
}

function lockName(id: string): string {
  return `schedule-${id}`;
}

function checkPrepare(request: PrepareScheduleRequest): void {
  if (!YEAR.test(request.year)) {
    throw new InvoiceError([{ path: 'year', message: 'must be YYYY' }]);
  }
  if (!toCents(request.monthlyAmount)) {
    throw new InvoiceError([{ path: 'monthlyAmount', message: 'must look like 2952 or 2952.50 and be more than zero' }]);
  }
}

/** Prepares 12 drafts with no numbers from a client and a monthly amount; a second call for that year is refused. */
export async function prepareYearSchedule(storage: InvoiceStorage, request: PrepareScheduleRequest): Promise<InvoiceSchedule> {
  checkPrepare(request);
  const { client } = await loadParties(storage, request.clientId);
  await ensureFormat(storage);
  const months = Array.from({ length: MONTHS_IN_YEAR }, (_, i): ScheduleMonth => {
    const period = `${request.year}-${String(i + 1).padStart(2, '0')}`;
    return { period, lines: [{ description: expandDescription(client.description, period), amount: request.monthlyAmount }], number: null, issuedOn: null };
  });
  const schedule: InvoiceSchedule = { id: `${request.clientId}-${request.year}`, clientId: request.clientId, year: request.year, months };
  try {
    await storage.writeNew(schedulePath(schedule.id), toJson(schedule));
  } catch (error) {
    if (isStorageExistsError(error)) {
      throw new InvoiceError([{ path: 'schedule', message: `${schedule.id} is already prepared` }]);
    }
    throw error;
  }
  return schedule;
}

/** Reads a schedule by id. */
export async function readSchedule(storage: InvoiceStorage, id: string): Promise<InvoiceSchedule> {
  if (!SAFE_ID.test(id)) {
    throw new InvoiceError([{ path: 'schedule', message: 'must hold only letters, digits, - and _' }]);
  }
  return readJsonFile<InvoiceSchedule>(storage, schedulePath(id), 'schedule');
}

/** Changes a draft month's lines; an issued month is refused and named. */
export async function editScheduleMonth(storage: InvoiceStorage, id: string, period: string, lines: InvoiceLine[]): Promise<InvoiceSchedule> {
  const errors = validateLines(lines);
  if (errors.length > 0) {
    throw new InvoiceError(errors);
  }
  return storage.withLock(lockName(id), async () => {
    const schedule = await readSchedule(storage, id);
    const month = schedule.months.find((entry) => entry.period === period);
    if (!month || month.number !== null) {
      const message = month ? `is issued as ${String(month.number)} and cannot change` : 'is not in this schedule';
      throw new InvoiceError([{ path: `months.${period}`, message }]);
    }
    const updated = { ...schedule, months: schedule.months.map((entry) => (entry === month ? { ...entry, lines } : entry)) };
    await storage.replace(schedulePath(id), toJson(updated));
    return updated;
  });
}

async function reconcile(storage: InvoiceStorage, schedule: InvoiceSchedule, today: string): Promise<InvoiceSchedule> {
  const first = Number(schedule.year);
  const last = Math.max(Number(today.slice(0, 4)), first);
  const years = Array.from({ length: last - first + 1 }, (_, i) => String(first + i));
  const records = (await Promise.all(years.map((year) => listIssued(storage, year)))).flat().filter((record) => record.schedule?.id === schedule.id);
  const months = schedule.months.map((month) => {
    const record = records.find((entry) => entry.schedule?.period === month.period);
    return month.number === null && record ? { ...month, number: record.number, issuedOn: record.request.date } : month;
  });
  const changed = months.some((month, i) => month !== schedule.months[i]);
  const updated = { ...schedule, months };
  if (changed) {
    await storage.replace(schedulePath(schedule.id), toJson(updated));
  }
  return updated;
}

function toFieldErrors(error: unknown): FieldError[] {
  if (error instanceof InvoiceError) {
    return error.errors;
  }
  return [{ path: 'issue', message: error instanceof Error ? error.message : String(error) }];
}

async function issueRun(storage: InvoiceStorage, start: InvoiceSchedule, options: IssueDueOptions): Promise<IssueDueResult> {
  const due = start.months.filter((month) => month.number === null && month.period < options.today.slice(0, 7));
  const result: IssueDueResult = { issued: [], failed: null, remaining: due.map((month) => month.period) };
  let schedule = start;
  for (const month of due) {
    try {
      const request = { clientId: start.clientId, period: month.period, date: options.today, amounts: [], lines: month.lines, draft: false };
      const { number } = await issueInvoice(storage, request, { render: options.render, schedule: { id: start.id, period: month.period } });
      result.issued.push({ period: month.period, number });
      result.remaining = result.remaining.filter((period) => period !== month.period);
      schedule = { ...schedule, months: schedule.months.map((entry) => (entry.period === month.period ? { ...entry, number, issuedOn: options.today } : entry)) };
      await storage.replace(schedulePath(start.id), toJson(schedule));
    } catch (error) {
      result.failed = { period: month.period, errors: toFieldErrors(error) };
      break;
    }
  }
  return result;
}

/** Issues finished months in order, each with its own number, dated today; stops at the first failure. */
export async function issueDueMonths(storage: InvoiceStorage, id: string, options: IssueDueOptions): Promise<IssueDueResult> {
  if (!isRealDate(options.today)) {
    throw new InvoiceError([{ path: 'today', message: 'must be a real date as YYYY-MM-DD' }]);
  }
  return storage.withLock(lockName(id), async () => issueRun(storage, await reconcile(storage, await readSchedule(storage, id), options.today), options));
}
