import type { FieldError } from '../types';

export interface RecurringSchedule {
  dayOfMonth: number;
  startMonth: string;
  endMonth: string | null;
  lastAddedMonth?: string | null;
  skippedMonths?: string[];
}

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
const MONTHS_PER_YEAR = 12;
const LAST_DAY = 31;
const TWO_DIGITS = 2;
const MONTH_LENGTH = 7;
const REAL_MONTH = 'must be a month as YYYY-MM';

function monthIndex(month: string): number | null {
  const found = MONTH.exec(month);
  return found === null ? null : Number(found[1]) * MONTHS_PER_YEAR + Number(found[2]) - 1;
}

function dateIn(index: number, dayOfMonth: number): string {
  const year = Math.floor(index / MONTHS_PER_YEAR);
  const month = (index % MONTHS_PER_YEAR) + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(TWO_DIGITS, '0')}-${String(Math.min(dayOfMonth, lastDay)).padStart(TWO_DIGITS, '0')}`;
}

/** True for a month written as YYYY-MM. */
export function isMonth(month: string): boolean {
  return monthIndex(month) !== null;
}

/** The field errors of a recurring schedule: day 1..31, a real start month, an end month not before it. */
export function monthErrors(schedule: RecurringSchedule): FieldError[] {
  const start = monthIndex(schedule.startMonth);
  const end = schedule.endMonth === null ? null : monthIndex(schedule.endMonth);
  return [
    ...(Number.isInteger(schedule.dayOfMonth) && schedule.dayOfMonth >= 1 && schedule.dayOfMonth <= LAST_DAY
      ? [] : [{ path: 'dayOfMonth', message: 'must be a day from 1 to 31' }]),
    ...(start === null ? [{ path: 'startMonth', message: REAL_MONTH }] : []),
    ...(schedule.endMonth !== null && end === null ? [{ path: 'endMonth', message: REAL_MONTH }] : []),
    ...(start !== null && end !== null && end < start ? [{ path: 'endMonth', message: 'must not be before the start month' }] : []),
  ];
}

/** The dates of every period due by today, not yet added and not skipped; a day past the month end falls on its last day. */
export function dueDates(schedule: RecurringSchedule, today: string): string[] {
  const last = schedule.lastAddedMonth === null || schedule.lastAddedMonth === undefined ? null : monthIndex(schedule.lastAddedMonth);
  const from = last === null ? monthIndex(schedule.startMonth) : last + 1;
  const todayMonth = monthIndex(today.slice(0, MONTH_LENGTH));
  const end = schedule.endMonth === null ? null : monthIndex(schedule.endMonth);
  if (from === null || todayMonth === null) {
    return [];
  }
  const to = end === null ? todayMonth : Math.min(end, todayMonth);
  const skipped = new Set(schedule.skippedMonths ?? []);
  const dates: string[] = [];
  for (let index = from; index <= to; index += 1) {
    const date = dateIn(index, schedule.dayOfMonth);
    if (date <= today && !skipped.has(date.slice(0, MONTH_LENGTH))) {
      dates.push(date);
    }
  }
  return dates;
}
