import type { BankLine } from './bankLine';

const CARD_MARKER = ' PURCHASE ';
const INTERNET_DEBIT_MARKER = 'TRANSFER-INTERNET-DEBIT ';
const FROM_MARKER = ' FROM ';
const BY_MARKER = ' BY ';
const SENDER_END = '>';
const COUNTRY_AND_CODE = /^[A-Z]{2} \d{4} /;
const NUMBER_WORD = /^[\d-]+$/;

/** Text upper-cased without accents, every run of other characters one space. */
export function normalise(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9-]+/g, ' ').trim();
}

/** The normalised words of a text. */
export function words(value: string): string[] {
  return normalise(value).split(' ').filter((word) => word.length > 0);
}

/** Whether the text holds the phrase as whole words, in any case. */
export function hasPhrase(text: string, phrase: string): boolean {
  const wanted = normalise(phrase);
  return wanted !== '' && ` ${normalise(text)} `.includes(` ${wanted} `);
}

/** The merchant part of a card purchase, before the PURCHASE marker. */
export function cardMerchant(description: string): string | null {
  const at = description.toUpperCase().indexOf(CARD_MARKER);
  return at <= 0 ? null : description.slice(0, at);
}

/** The free text of an internet debit; null when it has none. */
export function internetDebitText(description: string): string | null {
  const at = description.toUpperCase().indexOf(INTERNET_DEBIT_MARKER);
  const text = at < 0 ? '' : description.slice(at + INTERNET_DEBIT_MARKER.length).trim();
  return text === '' ? null : text;
}

function between(description: string, marker: string): string | null {
  const at = description.toUpperCase().indexOf(marker);
  const end = at < 0 ? -1 : description.indexOf(SENDER_END, at);
  return end < 0 ? null : description.slice(at + marker.length, end);
}

/** The sender of a transfer: after "from" within the bank, after "by" from another bank, up to the ">". */
export function sender(description: string): string | null {
  return between(description, FROM_MARKER) ?? between(description, BY_MARKER);
}

/** The payee of a line: the merchant of a card purchase, the free text of an internet debit, the sender of a transfer. */
export function payeeOf(line: BankLine): string {
  return normalise(cardMerchant(line.description) ?? internetDebitText(line.description) ?? sender(line.description) ?? line.description);
}

/** The payee without the country, the card code and the numbers, as a mapping matches it: "NL 4816 HOST 42201" is "HOST". */
export function payeeKey(payee: string): string {
  const text = normalise(payee);
  const kept = text.replace(COUNTRY_AND_CODE, '').split(' ').filter((word) => word !== '' && !NUMBER_WORD.test(word));
  return kept.length === 0 ? text : kept.join(' ');
}
