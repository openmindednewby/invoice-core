const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_EL = ['Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος', 'Μάιος', 'Ιούνιος', 'Ιούλιος', 'Αύγουστος', 'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος'];
const MONTHS_EL_ACCUSATIVE = ['Ιανουάριο', 'Φεβρουάριο', 'Μάρτιο', 'Απρίλιο', 'Μάιο', 'Ιούνιο', 'Ιούλιο', 'Αύγουστο', 'Σεπτέμβριο', 'Οκτώβριο', 'Νοέμβριο', 'Δεκέμβριο'];

/** Period texts for a YYYY-MM period. */
export function periodTexts(period: string): { en: string; el: string; elAccusative: string } {
  const year = period.slice(0, 4);
  const i = Number(period.slice(5)) - 1;
  return {
    en: `${MONTHS_EN[i] ?? ''} ${year}`,
    el: `${MONTHS_EL[i] ?? ''} ${year}`,
    elAccusative: `${MONTHS_EL_ACCUSATIVE[i] ?? ''} ${year}`,
  };
}

/** Formats YYYY-MM-DD as DD/MM/YYYY. */
export function displayDate(iso: string): string {
  return iso.split('-').reverse().join('/');
}

/** Adds days to a YYYY-MM-DD date. */
export function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
