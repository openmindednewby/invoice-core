import type { VatRule } from './types';

const CY_DOMESTIC_19: VatRule = {
  id: 'cy-domestic-19',
  ratePercent: 19,
  labelEn: 'VAT',
  labelEl: 'ΦΠΑ',
  rateTextEn: '19%',
  rateTextEl: '19%',
  noteEn: '',
  noteEl: '',
  source: 'Cyprus VAT Law 95(I)/2000, standard rate',
  reviewedByAccountant: false,
};

const CY_TO_EU_B2B_SERVICES: VatRule = {
  id: 'cy-to-eu-b2b-services',
  ratePercent: 0,
  labelEn: 'VAT',
  labelEl: 'ΦΠΑ',
  rateTextEn: 'Reverse charge',
  rateTextEl: 'Αντίστροφη επιβάρυνση',
  noteEn: 'Reverse charge: VAT is payable by the recipient, Art. 196 Directive 2006/112/EC.',
  noteEl: 'Αντίστροφη επιβάρυνση: ο ΦΠΑ οφείλεται από τον λήπτη, άρθρο 196 Οδηγίας 2006/112/ΕΚ.',
  source: 'Directive 2006/112/EC Art. 44, 196, 226(11a)',
  reviewedByAccountant: false,
};

/** The built-in VAT rules by id; a rule file in the data folder overrides them. Not tax advice. */
export const BUILT_IN_RULES: ReadonlyMap<string, VatRule> = new Map([
  [CY_DOMESTIC_19.id, CY_DOMESTIC_19],
  [CY_TO_EU_B2B_SERVICES.id, CY_TO_EU_B2B_SERVICES],
]);
