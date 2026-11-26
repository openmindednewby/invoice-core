import { SourceType } from './SourceType';
import type { TaxSource } from './taxRuleTypes';

const CHECKED = '2026-11-26';
const TAX_DEPARTMENT = 'Cyprus Tax Department (gov.cy/mof-tax)';
const MOF_TAX_DEPARTMENT = 'Cyprus Tax Department (Ministry of Finance)';
const BUSINESS_IN_CYPRUS = 'Cyprus government (businessincyprus.gov.cy)';
const PWC = 'PwC Worldwide Tax Summaries';
const PWC_REVIEWED = '2026-08-04';
const MONDAQ = 'Mondaq (law-firm article)';
const GOVCY_TAX = 'https://www.gov.cy/mof-tax/documents/';
const GOVCY_LAWS = `${GOVCY_TAX}nomothesia-egkyklioi-kai-synafes-yliko-amesis-forologias/nomoi/`;
const GOVCY_MEDIA = 'https://www.gov.cy/media/sites/167/2026/03/';
const GAZETTE = 'Official Gazette, hosted by gov.cy/mof-tax';
const GAZETTE_DATE = '2025-12-31';
const SLIDES_DATE = '2026-03';

type SourceDoc = Pick<TaxSource, 'title' | 'publisher' | 'url'>;

function primary(doc: SourceDoc, readInFull: boolean, published: string | null = null): TaxSource {
  const { title, publisher, url } = doc;
  return { title, publisher, type: SourceType.Primary, url, published, checked: CHECKED, readInFull };
}

function secondary(title: string, publisher: string, url: string, published: string | null, readInFull = true): TaxSource {
  return { title, publisher, type: SourceType.Secondary, url, published, checked: CHECKED, readInFull };
}

function locatedNotRead(title: string, url: string, published: string | null): TaxSource {
  return { title, publisher: MOF_TAX_DEPARTMENT, type: SourceType.PrimaryLocatedNotRead, url, published, checked: CHECKED, readInFull: false };
}

export const SOURCES_CY_2026: Readonly<Record<string, TaxSource>> = {
  'ey-2026-0140': secondary('Cyprus enacts major tax reform legislation', 'EY Global Tax News',
    'https://taxnews.ey.com/news/2026-0140-cyprus-enacts-major-tax-reform-legislation', '2026-01-07'),
  'ey-taxlegi-2026-02': secondary('TaxLegi 26.02.2026', 'EY Cyprus',
    'https://www.ey.com/en_cy/technical/tax-alert/tax-legi-february-2026', '2026-02-26'),
  'bdo-2026-reform': secondary('Cyprus tax reform includes corporate tax rate increase', 'BDO Global',
    'https://www.bdo.global/en-gb/insights/tax/world-wide-tax/cyprus-tax-reform-includes-corporate-tax-rate-increase', null, false),
  'pwc-corporate-tax-admin': secondary('Cyprus - Corporate - Tax administration', PWC,
    'https://taxsummaries.pwc.com/cyprus/corporate/tax-administration', PWC_REVIEWED),
  'pwc-corporate-other-taxes': secondary('Cyprus - Corporate - Other taxes (VAT, social insurance)', PWC,
    'https://taxsummaries.pwc.com/cyprus/corporate/other-taxes', PWC_REVIEWED),
  'pwc-individual-other-taxes': secondary('Cyprus - Individual - Other taxes (GHS, social insurance)', PWC,
    'https://taxsummaries.pwc.com/cyprus/individual/other-taxes', PWC_REVIEWED),
  'kpmg-insurable-earnings-2026': secondary('Amendment to the maximum amount of insurable earnings for 2026', 'KPMG Cyprus',
    'https://kpmg.com/cy/en/insights/tax-alerts/amendment-to-the-maximum-amount-of-insurable-earnings-for-2026.html', '2026-01-07'),
  'kpmg-vat-extension-2026': secondary('Deadline extension: VAT return for the period ending 30 November 2025', 'KPMG Cyprus',
    'https://kpmg.com/cy/en/home/insights/2026/1/deadline-extension-vat-return-for-the-period-ending-30-november-2025.html', null, false),
  'mof-late-payment-penalty': locatedNotRead('Tax Department page on the 5% fine and default interest table',
    'https://www.mof.gov.cy/mof/TAX/taxdep.nsf/All/E7532677137EE889C225824900482E2E?OpenDocument=', null),
  'mof-temp-tax-guide-2021': locatedNotRead('Guide for the computation of temporary tax and GHS contribution (2021)',
    'https://www.mof.gov.cy/mof/TAX/taxdep.nsf/All/46B8063388344400C225879E004C0411/$file/2021%20TD%20005%200200%20and%200213.pdf', '2021'),
  'mondaq-audit-threshold-2026': secondary('Audit threshold increased to EUR 300,000: what it means for Cyprus companies', MONDAQ,
    'https://www.mondaq.com/cyprus/audit/1738254/audit-threshold-increased-to-%e2%82%ac300000-what-it-means-for-cyprus-companies', null, false),
  'mondaq-audit-requirements': secondary('Cyprus statutory audit requirements: what finance teams need to know', MONDAQ,
    'https://www.mondaq.com/cyprus/corporate-tax/1763942/cyprus-statutory-audit-requirements-what-finance-teams-need-to-know', null, false),
  'govcy-tf4-company-return': primary({ title: 'Company income tax return (TF4) page', publisher: TAX_DEPARTMENT, url: `${GOVCY_TAX}forologiki-dilosi-eisodimatos-etaireias-t-f-4-aytoergodotoymenoy-me-elegmenoys-logariasmoys-t-f-1/` }, true),
  'govcy-eae': primary({ title: 'Special Defence Contribution (EAE), rate table', publisher: TAX_DEPARTMENT, url: `${GOVCY_TAX}ektakti-amyntiki-eisfora-eae/` }, false),
  'govcy-gesy': primary({ title: 'GESY contribution (Tax Department)', publisher: TAX_DEPARTMENT, url: `${GOVCY_TAX}geniko-systima-ygeias-gesy/` }, true),
  'govcy-vat-rates': primary({ title: 'VAT rates', publisher: TAX_DEPARTMENT, url: `${GOVCY_TAX}syntelestes-f-p-a/` }, true),
  'govcy-deadlines': primary({ title: 'Deadlines calendar (VAT, income tax, provisional tax); VAT and income tax sections read', publisher: TAX_DEPARTMENT, url: 'https://www.gov.cy/mof-tax/prothesmies/' }, false),
  'govcy-vat-faq': primary({ title: 'VAT return FAQ; late-return answer truncated after 10 percent', publisher: TAX_DEPARTMENT, url: `${GOVCY_TAX}ypovoli-tropopoiisi-diloseon-f-p-a/sychnes-erotiseis-dilosis-f-p-a/` }, false),
  'govcy-vies': primary({ title: 'VIES general information', publisher: TAX_DEPARTMENT, url: 'https://www.gov.cy/mof-tax/en/documents/paneyropaikes-platformes/vies-vat-information-exchange-system/genikes-plirofories-2/' }, true, '2026-03-20'),
  'govcy-default-interest': primary({ title: 'Default interest, general information', publisher: TAX_DEPARTMENT, url: 'https://www.gov.cy/mof-tax/en/documents/default-interest-monetary-charges-administrative-fines-additional-tax/default-interest-monetary-charges-administrative-fines-additional-tax-general-information/' }, true),
  'govcy-penalties': primary({ title: 'Default interest, monetary charges, fines (direct taxation)', publisher: TAX_DEPARTMENT, url: `${GOVCY_TAX}tokos-yperimerias-chrimatikes-epivarynseis-dioikitika-prostima-prosthetos-foros/tokos-yperimerias-chrimatikes-epivarynseis-dioikitika-prostima-prosthetos-foros-amesis-forologias/` }, true),
  'govcy-provisional-revision': primary({ title: 'FAQ on revising provisional tax (code 0200)', publisher: TAX_DEPARTMENT, url: `${GOVCY_TAX}forologiki-dilosi-eisodimatos-atomoy/sychnes-erotiseis-kai-paradeigmata-gia-tin-anatheorisi-prosorinis-forologias-kod-foroy-0200/` }, true),
  'sis-max-earnings-2026': primary({ title: 'Maximum insurable earnings 2026 notice', publisher: 'Social Insurance Services (sisweb.mlsi.gov.cy)', url: 'https://sisweb.mlsi.gov.cy/anotato2025/' }, true),
  'businessincyprus-social-insurance': primary({ title: 'Social insurance registration and contributions', publisher: BUSINESS_IN_CYPRUS, url: 'https://www.businessincyprus.gov.cy/social-insurance-registration-and-contributions/' }, true),
  'businessincyprus-income-vat': primary({ title: 'Registering for income tax and VAT in Cyprus', publisher: BUSINESS_IN_CYPRUS, url: 'https://www.businessincyprus.gov.cy/doing-business-in-cyprus/start-your-business/registering-for-income-tax-and-value-added-tax/' }, true),
  'mlsi-central-holiday-fund': primary({ title: 'Contributions to the Central Holiday Fund', publisher: 'Ministry of Labour, Social Insurance Services (mlsi.gov.cy)', url: 'https://www.mlsi.gov.cy/mlsi/sdg/sdg.nsf/All/00DDEF169CC27CAEC22586B7003F35FE' }, true, '2021-04-14'),
  'govcy-tax-reform-2026': primary({ title: 'Tax Reform 2026 (guides, FAQs, slides)', publisher: TAX_DEPARTMENT, url: `${GOVCY_TAX}forologiki-metarrythmisi-2026/` }, true, '2026-05-29'),
  'govcy-law-243-2025': primary({ title: 'Law 243(I)/2025, Assessment and Collection of Taxes (Amendment) (No. 2)', publisher: GAZETTE, url: GOVCY_LAWS }, false, GAZETTE_DATE),
  'govcy-law-245-2025': primary({ title: 'Law 245(I)/2025, Special Defence Contribution (Amendment) (No. 4)', publisher: GAZETTE, url: GOVCY_LAWS }, false, GAZETTE_DATE),
  'govcy-slides-243-2025': primary({ title: 'Tax Reform 2026: Assessment and Collection of Taxes, Law 243(I)/2025 (slides)', publisher: TAX_DEPARTMENT, url: `${GOVCY_MEDIA}2026-ΦορΜεταρρύθμιση-Νόμοι-ΠΒΕ-Εισπράξεως-Χαρτοσήμων.pdf` }, false, SLIDES_DATE),
  'govcy-slides-244-2025': primary({ title: 'Tax Reform 2026: Income Tax, Law 244(I)/2025 (slides)', publisher: TAX_DEPARTMENT, url: `${GOVCY_MEDIA}2026-ΦορΜεταρρύθμιση-Φόρος-Εισοδήματος.pdf` }, false, SLIDES_DATE),
  'govcy-slides-245-2025': primary({ title: 'Tax Reform 2026: SDC and CGT amendments (slides, 06/03/2026)', publisher: TAX_DEPARTMENT, url: `${GOVCY_MEDIA}EEA-ΦΚΚ-ΜΕΤΑΡΡΥΘΜΙΣΗ-06032026.pdf` }, false, '2026-03-06'),
  'roc-sme': primary({ title: 'Small and medium-sized companies', publisher: 'Registrar of Companies (companies.gov.cy)', url: 'https://www.companies.gov.cy/en/knowledgebase/tips-notes/small-and-medium-sized-companies' }, true),
  'mondaq-reform-key-points': secondary('The Cyprus tax reform: key points', MONDAQ,
    'https://www.mondaq.com/cyprus/tax-authorities/1743512/the-cyprus-tax-reform-key-points', null, false),
  'businessincyprus-records': primary({ title: 'Business in Cyprus government portal: record keeping', publisher: BUSINESS_IN_CYPRUS, url: 'https://www.businessincyprus.gov.cy/?p=1431' }, true),
};
