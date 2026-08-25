export type ListingClaimField =
  | 'unitCount'
  | 'yearBuilt'
  | 'lotSizeSf'
  | 'annualTaxes'
  | 'renovationYear'
  | 'grossAnnualIncome';

export interface ListingClaim {
  field: ListingClaimField;
  value: number;
  raw: string;
}

export type CheckResult = 'match' | 'differs' | 'wrong' | 'unavailable';

export interface ListingCheck {
  field: ListingClaimField;
  claimLabel: string;
  recordLabel: string;
  recordSource: string;
  result: CheckResult;
  note: string | null;
}

export interface ClassifiedDisclosure {
  text: string;
  kind: 'standard' | 'finding';
  resolution: { resolved: true; because: string } | null;
  consequence: string;
}

export interface ListingCheckContext {
  annualTaxes?: number | null;
  lotSizeSf?: number | null;
  assessorApartments?: number | null;
  yearBuilt?: number | null;
  zoningMaxUnits?: number | null;
  permitYears?: number[];
  hasArmLengthSaleAfterFinding?: boolean;
  hasPermittedWorkAfterFinding?: boolean;
}

/**
 * A sale is resolution evidence only when the source has a positive sale price,
 * occurs after the finding, and carries no explicit non-market indicators.
 * A mortgage is corroborating evidence, not a substitute for an arm's-length sale.
 */
export function hasValidatedArmLengthSaleAfterFinding(
  sales: Array<{
    saleDate?: string | null;
    salePrice?: number | null;
    sellerName?: string | null;
    buyerName?: string | null;
    deedType?: string | null;
    naflag?: string | null;
    trust?: boolean;
    ms?: number;
    price?: number;
  }> | null | undefined,
  findingTime: number | null | undefined,
): boolean {
  if (findingTime == null || !Number.isFinite(findingTime)) return false;
  return (sales ?? []).some((sale) => {
    const time = Number.isFinite(sale.ms) ? Number(sale.ms) : new Date(String(sale.saleDate ?? '')).getTime();
    const price = Number.isFinite(sale.price) ? Number(sale.price) : Number(sale.salePrice);
    if (!Number.isFinite(time) || time <= findingTime || !Number.isFinite(price) || price <= 0) return false;
    if (sale.trust || sale.naflag) return false;
    const text = `${sale.deedType ?? ''} ${sale.sellerName ?? ''} ${sale.buyerName ?? ''}`.toLowerCase();
    if (/\btrust\b|trustee|related entit|between entit|quitclaim|nominal/.test(text)) return false;
    return true;
  });
}

const labels: Record<ListingClaimField, string> = {
  unitCount: 'Units',
  yearBuilt: 'Year built',
  lotSizeSf: 'Lot size',
  annualTaxes: 'Annual taxes',
  renovationYear: 'Renovation',
  grossAnnualIncome: 'Gross annual income',
};

const finite = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const count = (value: number) => `${Math.round(value).toLocaleString('en-US')} ${Math.round(value) === 1 ? 'unit' : 'units'}`;
const dollars = (value: number) => `$${Math.round(value).toLocaleString('en-US')}/yr`;
const squareFeet = (value: number) => `${Math.round(value).toLocaleString('en-US')} sq ft`;

function resultForExact(
  claim: ListingClaim,
  record: number | null,
  source: string,
  formatter: (value: number) => string,
  mismatch: 'wrong' | 'differs',
): ListingCheck {
  const claimLabel = formatter(claim.value);
  if (record === null) {
    return { field: claim.field, claimLabel, recordLabel: 'Record unavailable', recordSource: source, result: 'unavailable', note: null };
  }
  const matches = Math.round(claim.value) === Math.round(record);
  return {
    field: claim.field,
    claimLabel,
    recordLabel: formatter(record),
    recordSource: source,
    result: matches ? 'match' : mismatch,
    note: matches ? null : mismatch === 'wrong' ? 'The listing conflicts with this authoritative record.' : 'The listing and record differ; neither alone settles this question.',
  };
}

/**
 * Compares only claims the listing actually made. "Wrong" is deliberately reserved
 * for a direct conflict with an authoritative record, never an absent or indirect one.
 */
export function buildListingChecks(claims: ListingClaim[] | null | undefined, context: ListingCheckContext): ListingCheck[] {
  const rows: ListingCheck[] = [];
  for (const claim of claims ?? []) {
    if (!Number.isFinite(claim.value)) continue;
    switch (claim.field) {
      case 'annualTaxes':
        rows.push(resultForExact(claim, finite(context.annualTaxes), 'Cook County Treasurer', dollars, 'wrong'));
        break;
      case 'lotSizeSf':
        rows.push(resultForExact(claim, finite(context.lotSizeSf), 'Cook County Assessor', squareFeet, 'wrong'));
        break;
      case 'yearBuilt':
        rows.push(resultForExact(claim, finite(context.yearBuilt), 'Cook County Assessor', (value) => String(Math.round(value)), 'differs'));
        break;
      case 'unitCount': {
        const units = Math.round(claim.value);
        const zoningCap = finite(context.zoningMaxUnits);
        if (zoningCap !== null && units > zoningCap) {
          rows.push({
            field: claim.field, claimLabel: count(units), recordLabel: `Zoning maximum ${count(zoningCap)}`,
            recordSource: 'Chicago zoning code', result: 'wrong',
            note: 'The listed unit count exceeds the zoning maximum for this lot.',
          });
        } else {
          rows.push(resultForExact(claim, finite(context.assessorApartments), 'Cook County Assessor', (value) => `${count(value)} apartments`, 'differs'));
        }
        break;
      }
      case 'renovationYear': {
        const year = Math.round(claim.value);
        const permitYears = (context.permitYears ?? []).filter((value) => Number.isFinite(value));
        const matched = permitYears.some((permitYear) => Math.abs(permitYear - year) <= 2);
        rows.push({
          field: claim.field,
          claimLabel: `Renovated ${year}`,
          recordLabel: matched
            ? `DOB permit recorded ${permitYears.filter((permitYear) => Math.abs(permitYear - year) <= 2).join(', ')}`
            : `No DOB permit recorded near ${year}`,
          recordSource: 'Chicago Department of Buildings',
          result: matched ? 'match' : 'differs',
          note: matched ? null : 'Missing permit records do not prove the work did not occur.',
        });
        break;
      }
      case 'grossAnnualIncome':
        rows.push({
          field: claim.field, claimLabel: dollars(claim.value), recordLabel: 'No public record',
          recordSource: '—', result: 'unavailable',
          note: 'Income is seller-supplied and cannot be verified from a public record.',
        });
        break;
    }
  }
  return rows.sort((a, b) => (a.result === 'unavailable' ? 1 : 0) - (b.result === 'unavailable' ? 1 : 0));
}

export function classifyDisclosures(disclosures: string[] | null | undefined, context: ListingCheckContext): ClassifiedDisclosure[] {
  return (disclosures ?? []).filter(Boolean).map((text) => {
    const normalized = text.toLowerCase();
    const standard = /\bas[- ]is\b|tenant[- ]occupied|occupied|estate|probate|no survey/.test(normalized);
    if (standard) {
      const consequence = /\btenant|occupied/.test(normalized)
        ? 'You cannot assume vacant delivery; request leases and tenant terms during diligence.'
        : /\bas[- ]is\b/.test(normalized)
          ? 'This shifts inspection and repair diligence to the buyer; it is not itself a defect.'
          : 'This changes diligence requirements, not the physical condition of the property.';
      return { text, kind: 'standard', resolution: null, consequence } as ClassifiedDisclosure;
    }
    const recordedProblem = /\bviolation|code|structural|environmental|short sale|cash[- ]only|defect/.test(normalized);
    // These booleans are intentionally *validated evidence*, not mere chronology.
    // A later sale is not necessarily arm's-length and a later permit is not
    // necessarily capable of curing the disclosed condition.
    const resolved = recordedProblem && (
      context.hasArmLengthSaleAfterFinding === true || context.hasPermittedWorkAfterFinding === true
    );
    const evidence: string[] = [];
    if (context.hasArmLengthSaleAfterFinding) evidence.push('an arm’s-length sale recorded after the finding');
    if (context.hasPermittedWorkAfterFinding) evidence.push('subsequent permitted work');
    return {
      text, kind: 'finding',
      resolution: resolved ? { resolved: true, because: `The report shows ${evidence.join(' and ')}.` } : null,
      consequence: /\bcash[- ]only\b/.test(normalized)
        ? 'Conventional financing may not be available; confirm lender requirements before making an offer.'
        : /\bshort sale\b/.test(normalized)
          ? 'A lender approval process can delay or change the transaction.'
          : 'Confirm scope, costs, and any open obligations during diligence.',
    } as ClassifiedDisclosure;
  }).sort((a, b) => Number(a.kind === 'finding') - Number(b.kind === 'finding'));
}

export function daysOnMarketVerdict(days: unknown, unitCount: unknown, listedDate: unknown): { tone: 'indigo' | 'orange' | 'red'; note: string } | null {
  const dom = finite(days);
  const units = finite(unitCount);
  if (dom === null || dom < 0 || !listedDate) return null;
  const commercialScale = units !== null && units >= 5;
  const orangeAt = commercialScale ? 91 : 46;
  const redAt = commercialScale ? 181 : 91;
  if (dom >= redAt) return { tone: 'red', note: `Past the ${commercialScale ? 180 : 90}-day mark; ask why and treat it as negotiating room.` };
  if (dom >= orangeAt) return { tone: 'orange', note: `Past the ${commercialScale ? 90 : 45}-day mark; worth asking why and it may create negotiating room.` };
  return { tone: 'indigo', note: 'Quick marketing time signals competition, not a buyer-side verdict.' };
}

export function listingClaimLabel(field: ListingClaimField): string {
  return labels[field];
}