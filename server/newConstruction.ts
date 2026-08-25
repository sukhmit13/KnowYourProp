import { type ConstructionCategory, type NewConstructionPermit, getChicagoNewConstructionPermits } from "./chicagoPermits";

export { categorizePermit, isAccessoryStructure, getChicagoNewConstructionPermits } from "./chicagoPermits";

const COMMUNITY_AREA_NAMES: Record<string, string> = {
  "1": "Rogers Park", "2": "West Ridge", "3": "Uptown", "4": "Lincoln Square", "5": "North Center", "6": "Lake View", "7": "Lincoln Park", "8": "Near North Side", "9": "Edison Park", "10": "Norwood Park", "11": "Jefferson Park", "12": "Forest Glen", "13": "North Park", "14": "Albany Park", "15": "Portage Park", "16": "Irving Park", "17": "Dunning", "18": "Montclare", "19": "Belmont Cragin", "20": "Hermosa", "21": "Avondale", "22": "Logan Square", "23": "Humboldt Park", "24": "West Town", "25": "Austin", "26": "West Garfield Park", "27": "East Garfield Park", "28": "Near West Side", "29": "North Lawndale", "30": "South Lawndale", "31": "Lower West Side", "32": "Loop", "33": "Near South Side", "34": "Armour Square", "35": "Douglas", "36": "Oakland", "37": "Fuller Park", "38": "Grand Boulevard", "39": "Kenwood", "40": "Washington Park", "41": "Hyde Park", "42": "Woodlawn", "43": "South Shore", "44": "Chatham", "45": "Avalon Park", "46": "South Chicago", "47": "Burnside", "48": "Calumet Heights", "49": "Roseland", "50": "Pullman", "51": "South Deering", "52": "East Side", "53": "West Pullman", "54": "Riverdale", "55": "Hegewisch", "56": "Garfield Ridge", "57": "Archer Heights", "58": "Brighton Park", "59": "McKinley Park", "60": "Bridgeport", "61": "New City", "62": "West Elsdon", "63": "Gage Park", "64": "Clearing", "65": "West Lawn", "66": "Chicago Lawn", "67": "West Englewood", "68": "Englewood", "69": "Greater Grand Crossing", "70": "Ashburn", "71": "Auburn Gresham", "72": "Beverly", "73": "Washington Heights", "74": "Mount Greenwood", "75": "Morgan Park", "76": "O'Hare", "77": "Edgewater",
};

export interface ConstructionStats {
  totalPermits: number;
  byCategory: Record<ConstructionCategory, number>;
  annual: Record<string, Record<ConstructionCategory | "total", number>>;
  medianReportedCost: number | null;
  permittedUnits: number;
}
export interface NewConstructionResponse {
  radiusMiles: number;
  periodStart: string;
  periodEnd: string;
  subject: ConstructionStats;
  communityBenchmark: { name: string; totalPermits: number } | null;
  activePermitCount: number;
  nearestActivePermit: (NewConstructionPermit & { distanceMiles: number }) | null;
  permits: Array<NewConstructionPermit & { distanceMiles: number; likelyStillBuilding: boolean }>;
  trend: { current12Months: number; prior12Months: number; changePct: number | null; suppressed: boolean };
  dataSource: string;
}

const milesBetween = (aLat: number, aLon: number, bLat: number, bLon: number) => {
  const radians = (n: number) => n * Math.PI / 180;
  const dLat = radians(bLat - aLat), dLon = radians(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(aLat)) * Math.cos(radians(bLat)) * Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};
const median = (numbers: number[]) => {
  if (!numbers.length) return null;
  const values = [...numbers].sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  return Math.round(values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2);
};
export const computeConstructionStats = (permits: NewConstructionPermit[]): ConstructionStats => {
  const byCategory: Record<ConstructionCategory, number> = { singleFamily: 0, multifamily: 0, commercial: 0 };
  const annual: ConstructionStats["annual"] = {};
  const costs: number[] = [];
  let permittedUnits = 0;
  for (const permit of permits) {
    byCategory[permit.category]++;
    const year = permit.issueDate.slice(0, 4) || "Unknown";
    annual[year] ||= { total: 0, singleFamily: 0, multifamily: 0, commercial: 0 };
    annual[year].total++;
    annual[year][permit.category]++;
    if (permit.reportedCost > 0) costs.push(permit.reportedCost);
    if (permit.units) permittedUnits += permit.units;
  }
  return { totalPermits: permits.length, byCategory, annual, medianReportedCost: median(costs), permittedUnits };
};
export const shouldFlagConstructionSupply = (subjectUnits: number | null | undefined, nearbyPermittedUnits: number) =>
  subjectUnits != null && subjectUnits > 0 && nearbyPermittedUnits >= 12 && nearbyPermittedUnits / subjectUnits >= 2;
const communityNumber = (value?: string) => {
  if (!value) return "";
  if (/^\d+$/.test(value)) return value;
  const target = value.trim().toLowerCase();
  return Object.entries(COMMUNITY_AREA_NAMES).find(([, name]) => name.toLowerCase() === target)?.[0] || "";
};

export async function getNearbyNewConstruction(lat: number, lng: number, communityArea?: string, radiusMiles = 1): Promise<NewConstructionResponse> {
  const all = await getChicagoNewConstructionPermits();
  const now = Date.now();
  const month = 365 * 24 * 60 * 60 * 1000;
  const rows = all.flatMap((permit) => {
    if (permit.latitude == null || permit.longitude == null) return [];
    const distanceMiles = milesBetween(lat, lng, permit.latitude, permit.longitude);
    return distanceMiles <= radiusMiles ? [{ ...permit, distanceMiles: Math.round(distanceMiles * 100) / 100, likelyStillBuilding: Date.parse(permit.issueDate) >= now - 18 * 30.4375 * 24 * 60 * 60 * 1000 }] : [];
  }).sort((a, b) => a.distanceMiles - b.distanceMiles);
  const current12Months = rows.filter((permit) => Date.parse(permit.issueDate) >= now - month).length;
  const prior12Months = rows.filter((permit) => {
    const date = Date.parse(permit.issueDate);
    return date >= now - 2 * month && date < now - month;
  }).length;
  const combined = current12Months + prior12Months;
  const active = rows.filter((permit) => permit.likelyStillBuilding);
  const areaNumber = communityNumber(communityArea);
  const area = areaNumber ? all.filter((permit) => permit.communityArea === areaNumber) : [];
  return {
    radiusMiles,
    periodStart: `${new Date().getFullYear() - 3}-01-01`,
    periodEnd: new Date().toISOString().slice(0, 10),
    subject: computeConstructionStats(rows),
    communityBenchmark: areaNumber ? { name: COMMUNITY_AREA_NAMES[areaNumber] || communityArea || "Community area", totalPermits: area.length } : null,
    activePermitCount: active.length,
    nearestActivePermit: active[0] || null,
    permits: rows,
    trend: { current12Months, prior12Months, changePct: combined >= 4 && prior12Months > 0 ? Math.round(((current12Months - prior12Months) / prior12Months) * 100) : null, suppressed: combined < 4 || prior12Months === 0 },
    dataSource: "City of Chicago Building Permits · 1-mile subject scope · excludes accessory and temporary structures",
  };
}

/** Compatibility export for older callers: it now reads the shared cache only. */
export async function getNewConstructionStats(communityArea: string, _zipCode = "", lat?: number, lng?: number): Promise<NewConstructionResponse> {
  if (lat == null || lng == null) throw new Error("Latitude and longitude are required for the parcel-specific construction report");
  return getNearbyNewConstruction(lat, lng, communityArea, 1);
}