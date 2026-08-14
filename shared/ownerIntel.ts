// Owner Intelligence — classify property owner names and build lookup links
// for tracing the person/registered agent behind a business entity owner.

export type OwnerEntityKind =
  | 'individual'
  | 'llc'
  | 'corporation'
  | 'trust'
  | 'bank_or_lender'
  | 'government'
  | 'nonprofit_or_church'
  | 'unknown';

export interface OwnerClassification {
  kind: OwnerEntityKind;
  label: string;
  isBusinessEntity: boolean; // true when an IL SOS lookup is the right next step
  hint: string; // short guidance on how to find the person behind this owner
}

const LLC_RE = /\b(L\.?\s?L\.?\s?C\.?|LIMITED LIABILITY (CO(MPANY)?|CORP))\b/i;
// Note: deliberately excludes ambiguous single tokens like "CO", "LTD", "LIMITED"
// on their own — they false-positive on human names and noisy owner strings.
// "LTD"/"LIMITED" only count when trailing the name (typical entity suffix position).
const CORP_RE = /\b(INC\.?|INCORPORATED|CORP\.?|CORPORATION|COMPANY|LLP|L\.L\.P\.|PLLC|VENTURES?|HOLDINGS?|PROPERTIES|ENTERPRISES?|GROUP|PARTNERSHIP|INVESTMENTS?|DEVELOPMENT|MGMT|MANAGEMENT|REALTY|CAPITAL)\b|\b(LTD\.?|LIMITED|LP|L\.P\.)\s*$/i;
const TRUST_RE = /\b(TRUST(EE)?S?|TR\.?|LIVING TRUST|LAND TRUST|REVOCABLE|IRREVOCABLE|DECLARATION OF TRUST)\b/i;
const BANK_RE = /\b(BANK|BANC|MORTGAGE|LENDING|FINANCIAL|CREDIT UNION|SAVINGS|FANNIE MAE|FREDDIE MAC|FEDERAL NATIONAL MORTGAGE|FEDERAL HOME LOAN|HUD|N\.?A\.?)\b/i;
const GOV_RE = /\b(CITY OF|COUNTY OF|STATE OF|VILLAGE OF|TOWN OF|CHICAGO HOUSING|LAND BANK|CCLBA|SECRETARY OF HOUSING|UNITED STATES|U\.?S\.?A\.?|DEPT|DEPARTMENT|AUTHORITY|BOARD OF)\b/i;
const NONPROFIT_RE = /\b(CHURCH|MINISTRY|MINISTRIES|TEMPLE|SYNAGOGUE|MOSQUE|CONGREGATION|PARISH|DIOCESE|ARCHDIOCESE|FOUNDATION|CHARIT(Y|IES|ABLE)|NFP|NOT FOR PROFIT|NON-?PROFIT)\b/i;

export function classifyOwnerName(rawName: string | null | undefined): OwnerClassification {
  const name = (rawName || '').trim().toUpperCase();
  if (!name) {
    return { kind: 'unknown', label: 'Unknown', isBusinessEntity: false, hint: 'No owner name on record yet — run the title/deed search first.' };
  }
  if (GOV_RE.test(name)) {
    return { kind: 'government', label: 'Government / Public Agency', isBusinessEntity: false, hint: 'Publicly owned — contact the agency directly; no registered agent applies.' };
  }
  if (BANK_RE.test(name) && !LLC_RE.test(name)) {
    return { kind: 'bank_or_lender', label: 'Bank / Lender (likely REO)', isBusinessEntity: false, hint: 'Likely bank-owned (REO) after foreclosure — contact the bank\u2019s REO or asset-management department.' };
  }
  if (TRUST_RE.test(name)) {
    return { kind: 'trust', label: 'Trust', isBusinessEntity: false, hint: 'Trusts are not registered with the IL SOS. Check the deed-in-trust and the tax bill mailing address for the trustee/beneficiary. Chicago Title Land Trust numbers can be researched via the trustee.' };
  }
  if (NONPROFIT_RE.test(name)) {
    return { kind: 'nonprofit_or_church', label: 'Nonprofit / Religious Org', isBusinessEntity: true, hint: 'Search IL SOS for the NFP corporation — officers and registered agent are listed. IRS Form 990 (ProPublica Nonprofit Explorer) also lists officers.' };
  }
  if (LLC_RE.test(name)) {
    return { kind: 'llc', label: 'LLC', isBusinessEntity: true, hint: 'Search IL SOS for the LLC\u2019s registered agent and managers/members. If the agent is a professional service, check the annual report, the mortgage signature page, and the tax bill mailing address.' };
  }
  if (CORP_RE.test(name)) {
    return { kind: 'corporation', label: 'Corporation / Business Entity', isBusinessEntity: true, hint: 'Search IL SOS — corporations list a president and secretary in addition to the registered agent.' };
  }
  return { kind: 'individual', label: 'Individual', isBusinessEntity: false, hint: 'Owned by a person directly — the deed name is the owner of record.' };
}

// Known professional registered-agent services: seeing one of these means the
// agent is a shield, not the owner.
const AGENT_SERVICES = [
  'REGISTERED AGENTS INC', 'CT CORPORATION', 'C T CORPORATION', 'COGENCY GLOBAL',
  'NORTHWEST REGISTERED AGENT', 'INCORP SERVICES', 'CORPORATION SERVICE COMPANY',
  'CSC', 'LEGALINC', 'VCORP', 'HARVARD BUSINESS SERVICES', 'ZENBUSINESS',
  'LEGALZOOM', 'UNITED STATES CORPORATION AGENTS', 'PARACORP',
];

export function isProfessionalAgentService(agentName: string | null | undefined): boolean {
  const name = (agentName || '').trim().toUpperCase();
  if (!name) return false;
  return AGENT_SERVICES.some((s) => name.includes(s));
}

// ---- Lookup links (prefilled where the site allows it) ----

export function ilSosBusinessSearchUrl(): string {
  // The IL SOS business entity search does not accept query params — user pastes the name.
  return 'https://apps.ilsos.gov/businessentitysearch/';
}

export function cookRecorderByPinUrl(pin: string): string {
  const p = (pin || '').replace(/[^0-9]/g, '');
  return `https://crs.cookcountyclerkil.gov/Search/ResultByPin?id1=${p}`;
}

export function cookTreasurerByPinUrl(pin: string): string {
  const p = (pin || '').replace(/[^0-9]/g, '');
  const formatted = p.length === 14
    ? `${p.slice(0, 2)}-${p.slice(2, 4)}-${p.slice(4, 7)}-${p.slice(7, 10)}-${p.slice(10)}`
    : p;
  // Same known-good format as server-side treasurer link builders
  return `https://www.cookcountytreasurer.com/setsearchparameters.aspx?mode=PIN&searchpin=${formatted}&isBusiness=false`;
}

export function propublicaNonprofitSearchUrl(name: string): string {
  return `https://projects.propublica.org/nonprofits/search?q=${encodeURIComponent(name)}`;
}
