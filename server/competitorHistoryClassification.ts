import type { CompetitorHistoryInput, CompetitorHistoryResult } from "../shared/competitorHistory";

export const LICENSE_SOURCE = "https://data.cityofchicago.org/Community-Economic-Development/Business-Licenses/r5kz-chrr";

export interface HistoryLicense {
  id?: string;
  address?: string;
  doing_business_as_name?: string;
  legal_name?: string;
  account_number?: string;
  license_number?: string;
  license_description?: string;
  business_activity?: string;
  license_start_date?: string;
  date_issued?: string;
  expiration_date?: string;
  license_status?: string;
}

export function unknownHistory(detail: string): CompetitorHistoryResult {
  return { classification: "unknown", firstLicenseDate: null, previousBusinesses: [], detail,
    sourceUrl: LICENSE_SOURCE, checkedAt: new Date().toISOString() };
}

export function normalizeHistoryAddress(address: string) {
  let street = address.split(",")[0].toUpperCase().replace(/[.']/g, "").replace(/\s+/g, " ").trim();
  const unitMatch = street.match(/(?:\b(?:SUITE|STE|UNIT|APT|APARTMENT|FLOOR|FL)\s*|#\s*)([A-Z0-9-]+)/);
  const unit = unitMatch?.[1] ?? "";
  if (unitMatch) street = street.slice(0, unitMatch.index).trim();
  const replacements: Record<string, string> = {
    NORTH: "N", SOUTH: "S", EAST: "E", WEST: "W", STREET: "ST", AVENUE: "AVE",
    BOULEVARD: "BLVD", ROAD: "RD", DRIVE: "DR", COURT: "CT", PLACE: "PL",
    PARKWAY: "PKWY", LANE: "LN", TERRACE: "TER",
  };
  street = street.split(" ").map(word => replacements[word] ?? word).join(" ");
  const number = street.match(/^\d+(?:-\d+)?/)?.[0] ?? "";
  const streetWords = street.split(" ").slice(1).filter(word => !/^(N|S|E|W|ST|AVE|BLVD|RD|DR|CT|PL|PKWY|LN|TER)$/.test(word));
  return { building: street, unit, number, streetWords };
}

export function normalizeHistoryName(name: string) {
  return name.toUpperCase().replace(/&/g, " AND ").replace(/[^A-Z0-9 ]/g, "")
    .replace(/\b(LLC|INCORPORATED|INC|CORPORATION|CORP|LTD|PC)\b/g, "")
    .replace(/\s+/g, " ").trim();
}

/** Match the selected use, not merely a generic license held by that business. */
export function historyUseMatcher(projectUse: string): ((row: HistoryLicense) => boolean) | null {
  const use = projectUse.toLowerCase();
  let pattern: RegExp | null = null;
  if (/day\s*care|child\s*care/.test(use)) {
    return row => /day care|child care/.test((row.license_description ?? "").toLowerCase())
      || (/children.s services facility/.test((row.license_description ?? "").toLowerCase())
        && (!row.business_activity || /care for.*children.*(?:0-6|2-6|under 6)/.test(row.business_activity.toLowerCase())));
  }
  else if (/gas station|filling station/.test(use)) pattern = /gas station|filling station|motor vehicle fuel|gasoline|retail.*(?:fuel|petroleum)/;
  else if (/car wash/.test(use)) pattern = /car wash/;
  else if (/auto|motor vehicle|body shop|vehicle repair/.test(use)) pattern = /motor vehicle repair|auto.*repair|body work|engine.*work/;
  else if (/hotel|motel|lodging/.test(use)) pattern = /hotel|motel|lodging/;
  else if (/\b(bar|tavern|nightclub)\b/.test(use)) pattern = /tavern|consumption on premises|nightclub/;
  else if (/restaurant|cafe|coffee|food/.test(use)) pattern = /retail food|food establishment|preparation.*food|restaurant/;
  else if (/cannabis/.test(use)) pattern = /cannabis/;
  else if (/gym|fitness|yoga/.test(use)) pattern = /fitness|health club|gym|yoga/;
  else if (/salon|spa|beauty|barber/.test(use)) pattern = /salon|beauty|barber|hair|massage/;
  else if (/laundry|dry clean/.test(use)) pattern = /laundry|laundromat|dry clean/;
  else if (/funeral/.test(use)) pattern = /funeral/;
  else if (/medical|dental/.test(use)) pattern = /medical|dental/;
  else if (/retail|shop|store/.test(use)) pattern = /retail sale|retail food/;
  else {
    // Specific activities can establish other selected uses; generic licenses cannot.
    const words = use.replace(/[^a-z ]/g, " ").split(/\s+/).filter(word => word.length >= 4 && !["service", "services", "general", "other"].includes(word));
    if (!words.length) return null;
    return row => words.every(word => `${row.license_description ?? ""} ${row.business_activity ?? ""}`.toLowerCase().includes(word));
  }
  return row => pattern!.test(`${row.license_description ?? ""} ${row.business_activity ?? ""}`.toLowerCase());
}

function sourceDate(value: string | undefined) {
  const date = value?.slice(0, 10);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
    && date <= new Date().toISOString().slice(0, 10) ? date : null;
}

function nameMatches(input: string, row: HistoryLicense) {
  const current = normalizeHistoryName(input);
  return [row.doing_business_as_name, row.legal_name].some(name => {
    const recorded = normalizeHistoryName(name ?? "");
    if (!recorded || !current) return false;
    if (recorded === current) return true;
    const a = new Set(current.split(" ").filter(word => word.length > 2 && word !== "THE" && word !== "AND"));
    const b = new Set(recorded.split(" ").filter(word => word.length > 2 && word !== "THE" && word !== "AND"));
    const common = Array.from(a).filter(word => b.has(word)).length;
    return common >= 2 && common / Math.min(a.size, b.size) >= 0.8 && common / Math.max(a.size, b.size) >= 0.5;
  });
}

export function classifyCompetitorHistory(input: CompetitorHistoryInput, allRows: HistoryLicense[], complete = true): CompetitorHistoryResult {
  if (!complete) return unknownHistory("The location's license history could not be retrieved completely.");
  const address = normalizeHistoryAddress(input.address);
  const matchesUse = historyUseMatcher(input.projectUse);
  if (!matchesUse || !address.number) return unknownHistory("Available license records cannot establish history for this selected use.");
  const atBuilding = allRows.filter(row => normalizeHistoryAddress(row.address ?? "").building === address.building && matchesUse(row));
  const rows = atBuilding.filter(row => !address.unit || normalizeHistoryAddress(row.address ?? "").unit === address.unit);
  const byOperator = new Map<string, HistoryLicense[]>();
  for (const row of rows) {
    const name = normalizeHistoryName(row.legal_name || row.doing_business_as_name || "");
    if (!row.account_number && !name) continue;
    const unit = normalizeHistoryAddress(row.address ?? "").unit;
    const key = `${row.account_number || name}|${unit}`;
    byOperator.set(key, [...(byOperator.get(key) ?? []), row]);
  }
  const groups = Array.from(byOperator.values());
  const current = groups.filter(group => input.licenseNumber
    ? group.some(row => row.license_number === input.licenseNumber)
    : group.some(row => nameMatches(input.name, row)));
  if (current.length !== 1) return unknownHistory("License records do not establish a unique start history for this business and location.");
  const operator = current[0];
  const starts = operator.map(row => sourceDate(row.license_start_date) ?? sourceDate(row.date_issued)).filter((date): date is string => !!date).sort();
  const first = starts[0];
  if (!first) return unknownHistory("The business's earliest license date is unavailable.");
  const result = { ...unknownHistory(""), firstLicenseDate: first };
  const unit = normalizeHistoryAddress(operator[0].address ?? "").unit;
  const earlier = groups.filter(group => group !== operator && group.some(row => {
    const date = sourceDate(row.license_start_date) ?? sourceDate(row.date_issued);
    return date && date <= first;
  }));
  // Missing unit numbers are not evidence that two tenants occupied the same space.
  const ambiguousUnit = atBuilding.some(row => {
    const otherUnit = normalizeHistoryAddress(row.address ?? "").unit;
    const date = sourceDate(row.license_start_date) ?? sourceDate(row.date_issued);
    return otherUnit !== unit && (!otherUnit || !unit) && date && date <= first;
  });
  if (ambiguousUnit) return { ...result, detail: "Earlier same-use licenses exist in this building, but the occupied unit cannot be established." };
  const sameUnit = earlier.filter(group => normalizeHistoryAddress(group[0].address ?? "").unit === unit);
  const undated = groups.some(group => group !== operator && group.some(row =>
    normalizeHistoryAddress(row.address ?? "").unit === unit
    && !(sourceDate(row.license_start_date) ?? sourceDate(row.date_issued))));
  if (undated) return { ...result, detail: "Other same-use operators have undated licenses here, so their sequence cannot be established." };
  const names = sameUnit.map(group => group[0].doing_business_as_name || group[0].legal_name || "Earlier operator");
  // The prior operator must precede the current license, not be a simultaneous tenant.
  const nonOverlapping = sameUnit.every(group => group.every(row => {
    const date = sourceDate(row.license_start_date) ?? sourceDate(row.date_issued);
    const expiration = sourceDate(row.expiration_date);
    return date && date < first && expiration && expiration <= first;
  }));
  if (sameUnit.length && !nonOverlapping) return { ...result, previousBusinesses: names,
    detail: "Earlier same-use operators are recorded here, but overlapping or incomplete license dates do not establish a replacement." };
  if (sameUnit.length) return { ...result, classification: "replacement", previousBusinesses: Array.from(new Set(names)),
    detail: `Replacement in available license history. Previously licensed here: ${Array.from(new Set(names)).join("; ")}.` };
  return { ...result, classification: "additional",
    detail: "New same-use location in available City license history: no earlier same-use operator was found at this location. This is not a verified opening date." };
}
