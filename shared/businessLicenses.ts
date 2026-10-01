export type LicenseCategory =
  | 'liquor'
  | 'food'
  | 'entertainment'
  | 'manufacturing'
  | 'hotel'
  | 'gallery'
  | 'other';

export interface NearbyLicense {
  businessName: string;
  address: string;
  licenseType: string;
  licenseCategory: LicenseCategory;
  startDate: string;
  distanceMiles: number;
  latitude: number;
  longitude: number;
}

export interface NearbyLicensesResponse {
  /** Current 12-month issuance records. A business may hold several records. */
  licenses: NearbyLicense[];
  /** Distinct businesses receiving new licenses in the current 12-month period; not confirmed openings. */
  totalCount: number;
  /** Current issuance records, retained to make the grouping transparent. */
  licenseCount: number;
  /** Distinct businesses receiving new licenses in the preceding 12-month period. */
  priorPeriodCount: number;
  /** Year-over-year change in businesses receiving new licenses; null when there is no prior-period base. */
  changePct: number | null;
  radiusMiles: number;
  periodMonths: number;
}

export interface LicenseEstablishment {
  name: string;
  address: string;
  distanceMiles: number;
  licenses: Pick<NearbyLicense, 'licenseType' | 'licenseCategory' | 'startDate'>[];
  comboLabel: string;
}

export const LICENSE_CATEGORY_LABEL: Record<LicenseCategory, string> = {
  food: 'Retail Food',
  liquor: 'Liquor / Tavern',
  entertainment: 'Entertainment',
  manufacturing: 'Manufacturing',
  hotel: 'Hotel / Motel',
  gallery: 'Art Gallery',
  other: 'Other',
};

const LICENSE_CATEGORY_ORDER: LicenseCategory[] = [
  'food', 'liquor', 'entertainment', 'gallery', 'hotel', 'manufacturing', 'other',
];

/** Normalizes only address noise that should not create a second establishment. */
export function normalizeLicenseAddress(address: string): string {
  const tokens = (address || '').toUpperCase().replace(/[.,#]/g, ' ').split(/\s+/).filter(Boolean);
  const streetType = /^(AVE|AVENUE|ST|STREET|BLVD|BOULEVARD|RD|ROAD|DR|DRIVE|PL|PLACE|CT|COURT|LN|LANE|WAY|PKWY|TER|SQ|PLZ|BROADWAY)$/;
  const unitMarker = /^(STE|SUITE|UNIT|APT|RM|FL|FLR|FLOOR|BSMT|BASEMENT|REAR|LOWER|UPPER|MEZZ|MEZZANINE)$/;
  const bareUnit = /^(\d+(ST|ND|RD|TH)?|[A-Z]|\d+[A-Z]|#\w*)$/;
  const hasStreetType = (items: string[]) => items.some((item) => streetType.test(item));
  while (tokens.length > 3) {
    const last = tokens[tokens.length - 1];
    const rest = tokens.slice(0, -1);
    if (unitMarker.test(last) || (bareUnit.test(last) && hasStreetType(rest) && !streetType.test(last))) {
      tokens.pop();
      continue;
    }
    break;
  }
  return tokens.join(' ');
}

export function licenseEstablishmentKey(license: Pick<NearbyLicense, 'businessName' | 'address'>): string {
  return `${(license.businessName || '').toUpperCase().trim()}|${normalizeLicenseAddress(license.address || '')}`;
}

/** One business is one name + normalized street address, regardless of license count. */
export function groupLicenseEstablishments(licenses: NearbyLicense[]): LicenseEstablishment[] {
  const grouped = new Map<string, LicenseEstablishment & { categories: Set<LicenseCategory> }>();
  for (const license of licenses || []) {
    const key = licenseEstablishmentKey(license);
    let establishment = grouped.get(key);
    if (!establishment) {
      establishment = {
        name: license.businessName,
        address: license.address,
        distanceMiles: license.distanceMiles,
        licenses: [],
        comboLabel: '',
        categories: new Set<LicenseCategory>(),
      };
      grouped.set(key, establishment);
    }
    establishment.distanceMiles = Math.min(establishment.distanceMiles, license.distanceMiles);
    establishment.licenses.push({
      licenseType: license.licenseType,
      licenseCategory: license.licenseCategory,
      startDate: license.startDate,
    });
    establishment.categories.add(license.licenseCategory);
  }

  return [...grouped.values()].map((establishment) => {
    const labels = LICENSE_CATEGORY_ORDER
      .filter((category) => establishment.categories.has(category))
      .map((category) => LICENSE_CATEGORY_LABEL[category]);
    establishment.comboLabel = labels.length === 1 ? `${labels[0]} only` : labels.join(' + ');
    establishment.licenses.sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
    const { categories: _categories, ...result } = establishment;
    return result;
  }).sort((a, b) => a.distanceMiles - b.distanceMiles);
}

export function titleCaseBusiness(value: string): string {
  if (!value) return value;
  const keepUpper = /^(LLC|INC|CO|II|III|IV|BBQ|GYG|USA|SGD|PE|&)$/i;
  return value.split(/\s+/).map((word) => {
    if (keepUpper.test(word.replace(/[.,]/g, ''))) return word.toUpperCase();
    if (/^\d/.test(word)) return word.toLowerCase();
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join(' ');
}