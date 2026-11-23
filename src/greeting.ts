import { GreetingKind } from './GreetingKind';

const NOON = 12;
const CYPRUS_ZONE = 'Europe/Nicosia';
const LINE_BREAK = '\n';
const WINDOWS_LINE_BREAK = '\r\n';

const GREETING_TEXT: Record<GreetingKind, string> = {
  [GreetingKind.Morning]: 'Καλημέρα σας,',
  [GreetingKind.Evening]: 'Καλησπέρα σας,',
  [GreetingKind.Formal]: 'Αξιότιμοι κύριοι,',
};

const CLOCK_GREETINGS: readonly GreetingKind[] = [GreetingKind.Morning, GreetingKind.Evening];

export const GREETINGS_IN_ORDER: readonly GreetingKind[] = [GreetingKind.Morning, GreetingKind.Evening, GreetingKind.Formal];

interface FirstLine {
  text: string;
  tail: string;
  rest: string;
}

function splitFirstLine(body: string): FirstLine {
  const end = body.indexOf(LINE_BREAK);
  const head = end === -1 ? body : body.slice(0, end);
  const text = head.trimEnd();
  return { text, tail: head.slice(text.length), rest: end === -1 ? '' : body.slice(end) };
}

/** The words of one greeting as they appear in the email. */
export function greetingText(greeting: GreetingKind): string {
  return GREETING_TEXT[greeting];
}

/** The hour, 0 to 23, on a clock in Cyprus at this moment, whatever zone this computer is in. */
export function cyprusHour(now: Date): number {
  const hour = new Intl.DateTimeFormat('en-GB', { timeZone: CYPRUS_ZONE, hour: 'numeric', hourCycle: 'h23' }).format(now);
  return Number(hour);
}

/** Good morning before 12:00 Cyprus time, good evening from 12:00 until midnight. */
export function greetingForTime(now: Date): GreetingKind {
  return cyprusHour(now) < NOON ? GreetingKind.Morning : GreetingKind.Evening;
}

/** The greeting the message opens with, or null when its first line is none of the three. */
export function greetingOf(body: string): GreetingKind | null {
  const { text } = splitFirstLine(body);
  return GREETINGS_IN_ORDER.find((greeting) => GREETING_TEXT[greeting] === text) ?? null;
}

/** Puts a greeting on the first line, replacing only a known greeting; any other first line stays below it. */
export function applyGreeting(body: string, greeting: GreetingKind): string {
  if (greetingOf(body) === null) {
    const lineEnd = body.includes(WINDOWS_LINE_BREAK) ? WINDOWS_LINE_BREAK : LINE_BREAK;
    return `${GREETING_TEXT[greeting]}${lineEnd}${lineEnd}${body}`;
  }
  const { tail, rest } = splitFirstLine(body);
  return `${GREETING_TEXT[greeting]}${tail}${rest}`;
}

/** Sets a morning or evening greeting by the Cyprus clock; a formal or unknown opening is left as it is. */
export function withTimeGreeting(body: string, now: Date): string {
  const current = greetingOf(body);
  if (current === null || !CLOCK_GREETINGS.includes(current)) {
    return body;
  }
  return applyGreeting(body, greetingForTime(now));
}
