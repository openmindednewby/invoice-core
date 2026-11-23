import { describe, expect, it } from 'vitest';

import { applyGreeting, greetingForTime, greetingOf, withTimeGreeting } from './greeting';
import { GreetingKind } from './GreetingKind';

const MORNING = 'Καλημέρα σας,';
const EVENING = 'Καλησπέρα σας,';
const FORMAL = 'Αξιότιμοι κύριοι,';
const REST = '\n\nΣας επισυνάπτουμε το τιμολόγιο 2026-001.\n\nΜε εκτίμηση';
const WINTER_1159 = new Date('2026-11-10T09:59:00Z');
const WINTER_1200 = new Date('2026-11-10T10:00:00Z');
const SUMMER_1159 = new Date('2026-07-10T08:59:00Z');
const SUMMER_1200 = new Date('2026-07-10T09:00:00Z');
const CYPRUS_MIDNIGHT = new Date('2026-11-10T22:00:00Z');
const CYPRUS_2359 = new Date('2026-11-10T21:59:00Z');
const UTC_MORNING_CYPRUS_AFTERNOON = new Date('2026-11-10T10:30:00Z');

describe('withTimeGreeting', () => {
  it('AC-1 with an evening template opened at 11:59 Cyprus time, opens with good morning', () => {
    const body = `${EVENING}${REST}`;

    const result = withTimeGreeting(body, WINTER_1159);

    expect(result).toBe(`${MORNING}${REST}`);
    expect(greetingOf(result)).toBe(GreetingKind.Morning);
  });

  it('AC-1 with a morning template opened at 00:00 Cyprus time, keeps good morning', () => {
    const body = `${MORNING}${REST}`;

    const result = withTimeGreeting(body, CYPRUS_MIDNIGHT);

    expect(result).toBe(`${MORNING}${REST}`);
  });

  it('AC-2 with a morning template opened at 12:00 Cyprus time, opens with good evening', () => {
    const body = `${MORNING}${REST}`;

    const result = withTimeGreeting(body, WINTER_1200);

    expect(result).toBe(`${EVENING}${REST}`);
    expect(greetingOf(result)).toBe(GreetingKind.Evening);
  });

  it('AC-2 with a morning template opened at 23:59 Cyprus time, opens with good evening', () => {
    const body = `${MORNING}${REST}`;

    const result = withTimeGreeting(body, CYPRUS_2359);

    expect(result).toBe(`${EVENING}${REST}`);
  });

  it('AC-4 with a formal template, keeps it at any hour', () => {
    const body = `${FORMAL}${REST}`;

    const results = [WINTER_1159, WINTER_1200].map((now) => withTimeGreeting(body, now));

    expect(results).toEqual([body, body]);
    expect(greetingOf(body)).toBe(GreetingKind.Formal);
  });

  it('AC-5 with any other opening, leaves the message as it is and selects nothing', () => {
    const body = `Dear Anna,${REST}`;

    const result = withTimeGreeting(body, WINTER_1200);

    expect(result).toBe(body);
    expect(greetingOf(result)).toBeNull();
  });
});

describe('greetingForTime', () => {
  it('AC-3 with 10:30 UTC, which is 12:30 in Cyprus, chooses good evening', () => {
    const now = UTC_MORNING_CYPRUS_AFTERNOON;

    const greeting = greetingForTime(now);

    expect(greeting).toBe(GreetingKind.Evening);
  });

  it('AC-3 with summer time in Cyprus, switches at 12:00 Cyprus time', () => {
    const moments = [SUMMER_1159, SUMMER_1200];

    const greetings = moments.map(greetingForTime);

    expect(greetings).toEqual([GreetingKind.Morning, GreetingKind.Evening]);
  });
});

describe('applyGreeting', () => {
  it('AC-7 with a known greeting and an edited message, replaces only the first line', () => {
    const body = `${MORNING}  \r\nΚάτι που έγραψα.\nΤέλος`;

    const result = applyGreeting(body, GreetingKind.Formal);

    expect(result).toBe(`${FORMAL}  \r\nΚάτι που έγραψα.\nΤέλος`);
  });

  it('AC-7 with a message of the greeting alone, replaces it', () => {
    const body = EVENING;

    const result = applyGreeting(body, GreetingKind.Morning);

    expect(result).toBe(MORNING);
  });

  it('AC-8 with an unknown first line, adds the greeting and a blank line above, removing nothing', () => {
    const body = `Dear Anna,${REST}`;

    const result = applyGreeting(body, GreetingKind.Evening);

    expect(result).toBe(`${EVENING}\n\nDear Anna,${REST}`);
  });

  it('AC-8 with an unknown first line in a message with Windows line endings, adds lines ending the same way', () => {
    const body = 'Dear Anna,\r\nκείμενο\r\n';

    const result = applyGreeting(body, GreetingKind.Morning);

    expect(result).toBe(`${MORNING}\r\n\r\nDear Anna,\r\nκείμενο\r\n`);
  });

  it('AC-8 with an empty message, adds the greeting and a blank line', () => {
    const body = '';

    const result = applyGreeting(body, GreetingKind.Morning);

    expect(result).toBe(`${MORNING}\n\n`);
  });
});

describe('greetingOf', () => {
  it('AC-9 with a greeting typed as the first line, selects it', () => {
    const body = `${FORMAL}\nκείμενο`;

    const greeting = greetingOf(body);

    expect(greeting).toBe(GreetingKind.Formal);
  });

  it('AC-9 with the greeting changed by typing, clears the selection', () => {
    const body = `Καλημέρα σας κύριε,\nκείμενο`;

    const greeting = greetingOf(body);

    expect(greeting).toBeNull();
  });
});
