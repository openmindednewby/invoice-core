import { AmountBasis } from './AmountBasis';
import { ensureIssuable, toJson } from './folder';
import { InvoiceKind } from './InvoiceKind';
import { listIssued } from './issue';
import { expandDescription } from './lines';
import { toCents } from './money';
import { loadParties } from './parties';
import { lockName, readSchedule, reconcile, schedulePath } from './schedule';
import type { InvoiceSchedule, ScheduleMonth, SchedulePlan } from './schedule';
import type { InvoiceStorage } from './storage';
import { InvoiceError } from './types';
import type { FieldError } from './types';

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
const MONTHS_IN_YEAR = 12;
const MAX_PLAN_MONTHS = 120;
const YEAR_LENGTH = 4;
const MONTH_START = 5;
const JSON_SUFFIX = '.json';

export interface PreparePlanRequest extends SchedulePlan {
  clientId: string;
  taken?: readonly string[];
}

/** The id of a client's billing plan schedule. */
export function planId(clientId: string): string {
  return `${clientId}-plan`;
}

/** Lists every YYYY-MM month from `from` to `until`, both included, across years. */
export function planPeriods(from: string, until: string): string[] {
  const periods: string[] = [];
  let year = Number(from.slice(0, YEAR_LENGTH));
  let month = Number(from.slice(MONTH_START));
  for (let period = from; period <= until && periods.length <= MAX_PLAN_MONTHS; ) {
    periods.push(period);
    month = month === MONTHS_IN_YEAR ? 1 : month + 1;
    year = month === 1 ? year + 1 : year;
    period = `${String(year)}-${String(month).padStart(2, '0')}`;
  }
  return periods;
}

function untilErrors(request: PreparePlanRequest): FieldError[] {
  if (!PERIOD.test(request.until)) {
    return [{ path: 'until', message: 'must be YYYY-MM' }];
  }
  if (request.until < request.from) {
    return [{ path: 'until', message: 'must not be before the first month' }];
  }
  if (planPeriods(request.from, request.until).length > MAX_PLAN_MONTHS) {
    return [{ path: 'until', message: `must be at most ${String(MAX_PLAN_MONTHS)} months from the first month` }];
  }
  return [];
}

function planErrors(request: PreparePlanRequest): FieldError[] {
  const errors: FieldError[] = PERIOD.test(request.from) ? untilErrors(request) : [{ path: 'from', message: 'must be YYYY-MM' }];
  if (!toCents(request.monthlyAmount)) {
    errors.push({ path: 'monthlyAmount', message: 'must look like 2952 or 2952.50 and be more than zero' });
  }
  if (request.basis !== AmountBasis.VatIncluded && request.basis !== AmountBasis.BeforeVat) {
    errors.push({ path: 'basis', message: 'must be vat-included or before-vat' });
  }
  return errors;
}

async function otherSchedulePeriods(storage: InvoiceStorage, clientId: string, id: string): Promise<string[]> {
  const ids = (await storage.list('schedules')).filter((name) => name.endsWith(JSON_SUFFIX)).map((name) => name.slice(0, -JSON_SUFFIX.length)).filter((name) => name !== id);
  const schedules = await Promise.all(ids.map(async (name) => readSchedule(storage, name)));
  return schedules.filter((schedule) => schedule.clientId === clientId).flatMap((schedule) => schedule.months.map((month) => month.period));
}

async function invoicedPeriods(storage: InvoiceStorage, clientId: string, id: string, periods: readonly string[]): Promise<string[]> {
  const years = new Set(periods.map((period) => period.slice(0, YEAR_LENGTH)));
  const stored = (await storage.list('invoices')).filter((year) => years.has(year));
  const records = (await Promise.all(stored.map(async (year) => listIssued(storage, year)))).flat();
  return records.filter((record) => record.kind === InvoiceKind.Invoice && record.request.clientId === clientId && record.schedule?.id !== id).map((record) => record.request.period);
}

async function readPlan(storage: InvoiceStorage, id: string): Promise<InvoiceSchedule | null> {
  return (await storage.readText(schedulePath(id))) === null ? null : reconcile(storage, await readSchedule(storage, id));
}

async function takenPeriods(storage: InvoiceStorage, request: PreparePlanRequest, id: string, issued: readonly ScheduleMonth[]): Promise<Set<string>> {
  const periods = planPeriods(request.from, request.until);
  return new Set([
    ...(request.taken ?? []),
    ...issued.map((month) => month.period),
    ...(await otherSchedulePeriods(storage, request.clientId, id)),
    ...(await invoicedPeriods(storage, request.clientId, id, periods)),
  ]);
}

/** Saves a client's plan with one draft per free month from..until at its fixed amount; issued months stay. */
export async function prepareSchedulePlan(storage: InvoiceStorage, request: PreparePlanRequest): Promise<InvoiceSchedule> {
  const errors = planErrors(request);
  if (errors.length > 0) {
    throw new InvoiceError(errors);
  }
  const { client } = await loadParties(storage, request.clientId);
  await ensureIssuable(storage);
  const id = planId(request.clientId);
  return storage.withLock(lockName(id), async () => {
    const existing = await readPlan(storage, id);
    const issued = (existing?.months ?? []).filter((month) => month.number !== null);
    const taken = await takenPeriods(storage, request, id, issued);
    const drafts = planPeriods(request.from, request.until).filter((period) => !taken.has(period)).map((period): ScheduleMonth => ({
      period, lines: [{ description: expandDescription(client.description, period), amount: request.monthlyAmount }], number: null, issuedOn: null, basis: request.basis,
    }));
    const startYear = request.from.slice(0, YEAR_LENGTH);
    const plan: SchedulePlan = { from: request.from, until: request.until, monthlyAmount: request.monthlyAmount, basis: request.basis };
    const schedule: InvoiceSchedule = {
      id, clientId: request.clientId, year: existing !== null && existing.year < startYear ? existing.year : startYear,
      months: [...issued, ...drafts].sort((a, b) => a.period.localeCompare(b.period)), plan,
    };
    await storage.replace(schedulePath(id), toJson(schedule));
    return schedule;
  });
}
