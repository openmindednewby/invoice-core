const CENTS_PER_UNIT = 100;
const GROUP_SIZE = 3;
const AMOUNT = /^\d{1,12}(\.\d{1,2})?$/;

function groupThousands(digits: string): string {
  const groups: string[] = [];
  for (let end = digits.length; end > 0; end -= GROUP_SIZE) {
    groups.unshift(digits.slice(Math.max(end - GROUP_SIZE, 0), end));
  }
  return groups.join('.');
}

/** Parses "2952" or "2952.50" into integer cents; returns null if malformed. */
export function toCents(amount: string): number | null {
  if (!AMOUNT.test(amount)) {
    return null;
  }
  const [whole, fraction = ''] = amount.split('.');
  return Number(whole) * CENTS_PER_UNIT + Number(fraction.padEnd(2, '0'));
}

/** Formats cents in Greek style: 295200 becomes "2.952,00". */
export function formatCents(cents: number): string {
  const size = Math.abs(cents);
  const whole = groupThousands(Math.floor(size / CENTS_PER_UNIT).toString());
  return `${cents < 0 ? '-' : ''}${whole},${(size % CENTS_PER_UNIT).toString().padStart(2, '0')}`;
}

/** Formats cents as a plain amount: -4000 becomes "-40.00". */
export function centsToAmount(cents: number): string {
  const size = Math.abs(cents);
  const text = `${Math.floor(size / CENTS_PER_UNIT)}.${(size % CENTS_PER_UNIT).toString().padStart(2, '0')}`;
  return cents < 0 ? `-${text}` : text;
}

/** Computes VAT in whole cents, rounded half up. */
export function vatCents(netCents: number, ratePercent: number): number {
  return Math.round((netCents * ratePercent) / CENTS_PER_UNIT);
}
