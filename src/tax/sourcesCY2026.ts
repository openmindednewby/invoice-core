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

function primary(title: string, publisher: string, url: string, readInFull: boolean, published: string | null = null): TaxSource {
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
  'govcy-tf4-company-return': primary('Company income tax return (TF4) page', TAX_DEPARTMENT,
    `${GOVCY_TAX}forologiki-dilosi-eisodimatos-etaireias-t-f-4-aytoergodotoymenoy-me-elegmenoys-logariasmoys-t-f-1/`, true),
  'govcy-eae': primary('Special Defence Contribution (EAE), rate table', TAX_DEPARTMENT,
    `${GOVCY_TAX}ektakti-amyntiki-eisfora-eae/`, false),
  'govcy-gesy': primary('GESY contribution (Tax Department)', TAX_DEPARTMENT, `${GOVCY_TAX}geniko-systima-ygeias-gesy/`, true),
  'govcy-vat-rates': primary('VAT rates', TAX_DEPARTMENT, `${GOVCY_TAX}syntelestes-f-p-a/`, true),
  'govcy-deadlines': primary('Deadlines calendar (VAT, income tax, provisional tax); VAT and income tax sections read', TAX_DEPARTMENT,
    'https://www.gov.cy/mof-tax/prothesmies/', false),
  'govcy-vat-faq': primary('VAT return FAQ; late-return answer truncated after 10 percent', TAX_DEPARTMENT,
    `${GOVCY_TAX}ypovoli-tropopoiisi-diloseon-f-p-a/sychnes-erotiseis-dilosis-f-p-a/`, false),
  'govcy-vies': primary('VIES general information', TAX_DEPARTMENT,
    'https://www.gov.cy/mof-tax/en/documents/paneyropaikes-platformes/vies-vat-information-exchange-system/genikes-plirofories-2/', true, '2026-03-20'),
  'govcy-default-interest': primary('Default interest, general information', TAX_DEPARTMENT,
    'https://www.gov.cy/mof-tax/en/documents/default-interest-monetary-charges-administrative-fines-additional-tax/default-interest-monetary-charges-administrative-fines-additional-tax-general-information/', true),
  'govcy-penalties': primary('Default interest, monetary charges, fines (direct taxation)', TAX_DEPARTMENT,
    `${GOVCY_TAX}tokos-yperimerias-chrimatikes-epivarynseis-dioikitika-prostima-prosthetos-foros/tokos-yperimerias-chrimatikes-epivarynseis-dioikitika-prostima-prosthetos-foros-amesis-forologias/`, true),
  'govcy-provisional-revision': primary('FAQ on revising provisional tax (code 0200)', TAX_DEPARTMENT,
    `${GOVCY_TAX}forologiki-dilosi-eisodimatos-atomoy/sychnes-erotiseis-kai-paradeigmata-gia-tin-anatheorisi-prosorinis-forologias-kod-foroy-0200/`, true),
  'sis-max-earnings-2026': primary('Maximum insurable earnings 2026 notice', 'Social Insurance Services (sisweb.mlsi.gov.cy)',
    'https://sisweb.mlsi.gov.cy/anotato2025/', true),
  'businessincyprus-social-insurance': primary('Social insurance registration and contributions', BUSINESS_IN_CYPRUS,
    'https://www.businessincyprus.gov.cy/social-insurance-registration-and-contributions/', true),
  'businessincyprus-income-vat': primary('Registering for income tax and VAT in Cyprus', BUSINESS_IN_CYPRUS,
    'https://www.businessincyprus.gov.cy/doing-business-in-cyprus/start-your-business/registering-for-income-tax-and-value-added-tax/', true),
  'businessincyprus-records': primary('Business in Cyprus government portal: record keeping', BUSINESS_IN_CYPRUS,
    'https://www.businessincyprus.gov.cy/?p=1431', true),
};
