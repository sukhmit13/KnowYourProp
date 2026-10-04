import { licenseEstablishmentKey, normalizeLicenseAddress, type NearbyLicense } from "./businessLicenses";

export interface LicensePeriodComparison {
  start: string;
  end: string;
  businessesWithNewLicenses: number;
  licenseIssuances: number;
  licensedAddresses: number;
  recurringBusinesses: number;
  firstObservedBusinesses: number;
  previouslyUnseenAddresses: number;
  differentNamesAtKnownAddresses: number;
}

export interface CorridorLicenseComparison {
  current: LicensePeriodComparison;
  prior: LicensePeriodComparison;
  businessChange: number;
  businessChangePct: number | null;
  addressChange: number;
  unseenAddressChange: number;
  possibleTurnover: Array<{ name: string; address: string; previousNames: string[] }>;
  currentObservations: Array<{
    key: string;
    kind: "recurring" | "possible-turnover" | "previously-unseen-address" | "new-name-at-shared-address";
    previousNames: string[];
  }>;
}

const nameKey = (name: string) => name.toUpperCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();
const addressKey = (address: string) => normalizeLicenseAddress(address)
  .replace(/\bAVENUE\b/g, "AVE").replace(/\bSTREET\b/g, "ST").replace(/\bBOULEVARD\b/g, "BLVD")
  .replace(/\bROAD\b/g, "RD").replace(/\bDRIVE\b/g, "DR");
export const licenseComparisonKey = (row: Pick<NearbyLicense, "businessName" | "address">) =>
  licenseEstablishmentKey({ businessName: nameKey(row.businessName), address: addressKey(row.address) });

/** UTC calendar windows, with an equal 12-month lookback for each comparison period. */
export function licenseComparisonDates(asOf = new Date()) {
  const end = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate() + 1));
  const yearsBack = (years: number) => {
    const year = end.getUTCFullYear() - years;
    const lastDay = new Date(Date.UTC(year, end.getUTCMonth() + 1, 0)).getUTCDate();
    return new Date(Date.UTC(year, end.getUTCMonth(), Math.min(end.getUTCDate(), lastDay))).toISOString().slice(0, 10);
  };
  return { end: end.toISOString().slice(0, 10), currentStart: yearsBack(1), priorStart: yearsBack(2), historyStart: yearsBack(3) };
}

/** ISSUE-only observations are not an operating-business census or proof of net growth. */
export function compareCorridorLicenses(history: NearbyLicense[], asOf = new Date()): CorridorLicenseComparison {
  const dates = licenseComparisonDates(asOf);
  const key = licenseComparisonKey;
  const rows = history.filter(row => {
    const date = row.startDate;
    return row.businessName?.trim() && row.address?.trim()
      && !/^(unknown|address unavailable)$/i.test(row.businessName.trim())
      && !/^(unknown|address unavailable)$/i.test(row.address.trim())
      && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date))
      && new Date(date).toISOString().slice(0, 10) === date
      && date >= dates.historyStart && date < dates.end;
  });

  function period(start: string, end: string, lookbackStart: string) {
    const previous = rows.filter(row => row.startDate >= lookbackStart && row.startDate < start);
    const previousKeys = new Set(previous.map(key));
    const knownAddresses = new Set(previous.map(row => addressKey(row.address)));
    const selected = rows.filter(row => row.startDate >= start && row.startDate < end)
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
    const grouped = new Map<string, NearbyLicense>();
    for (const row of selected) if (!grouped.has(key(row))) grouped.set(key(row), row);
    const recurring = Array.from(grouped).filter(([id]) => previousKeys.has(id));
    const firstObserved = Array.from(grouped).filter(([id]) => !previousKeys.has(id)).map(([, row]) => row);
    const unseenAddresses = new Set(firstObserved.filter(row => !knownAddresses.has(addressKey(row.address))).map(row => addressKey(row.address)));
    const possibleTurnover = firstObserved.flatMap(row => {
      const older = [...previous, ...selected.filter(other => other.startDate < row.startDate)];
      const previousNames = Array.from(new Set(older.filter(other =>
        addressKey(other.address) === addressKey(row.address) && nameKey(other.businessName) !== nameKey(row.businessName),
      ).map(other => other.businessName)));
      return previousNames.length ? [{ name: row.businessName, address: row.address, previousNames }] : [];
    });
    const turnoverByKey = new Map(possibleTurnover.map(row => [
      key({ businessName: row.name, address: row.address }), row.previousNames,
    ]));
    const observations = Array.from(grouped).map(([id, row]) => ({
      key: id,
      kind: previousKeys.has(id) ? "recurring" as const
        : turnoverByKey.has(id) ? "possible-turnover" as const
          : !knownAddresses.has(addressKey(row.address)) ? "previously-unseen-address" as const
            : "new-name-at-shared-address" as const,
      previousNames: turnoverByKey.get(id) || [],
    }));
    return {
      summary: {
        start, end,
        businessesWithNewLicenses: grouped.size,
        licenseIssuances: selected.length,
        licensedAddresses: new Set(Array.from(grouped.values()).map(row => addressKey(row.address))).size,
        recurringBusinesses: recurring.length,
        firstObservedBusinesses: firstObserved.length,
        previouslyUnseenAddresses: unseenAddresses.size,
        differentNamesAtKnownAddresses: possibleTurnover.length,
      },
      possibleTurnover,
      observations,
    };
  }
  const current = period(dates.currentStart, dates.end, dates.priorStart);
  const prior = period(dates.priorStart, dates.currentStart, dates.historyStart);
  const businessChange = current.summary.businessesWithNewLicenses - prior.summary.businessesWithNewLicenses;
  return {
    current: current.summary, prior: prior.summary, businessChange,
    businessChangePct: prior.summary.businessesWithNewLicenses > 0
      ? Math.round(businessChange / prior.summary.businessesWithNewLicenses * 1000) / 10 : null,
    addressChange: current.summary.licensedAddresses - prior.summary.licensedAddresses,
    unseenAddressChange: current.summary.previouslyUnseenAddresses - prior.summary.previouslyUnseenAddresses,
    possibleTurnover: current.possibleTurnover,
    currentObservations: current.observations,
  };
}