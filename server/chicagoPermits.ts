/** Shared Chicago "new construction" permit client.
 *
 * This module intentionally owns the Socrata query, normalization, permit
 * categorization, and accessory exclusion. Consumers must not reimplement
 * any of those rules from raw permit records.
 */
export type ConstructionCategory = "singleFamily" | "multifamily" | "commercial";

interface RawPermit {
  permit_?: string;
  permit_type?: string;
  work_description?: string;
  issue_date?: string;
  reported_cost?: string;
  community_area?: string;
  latitude?: string;
  longitude?: string;
  street_number?: string;
  street_direction?: string;
  street_name?: string;
  contact_1_name?: string;
  contact_1_type?: string;
  contact_2_name?: string;
  contact_2_type?: string;
  contact_3_name?: string;
  contact_3_type?: string;
  contact_4_name?: string;
  contact_4_type?: string;
}

export interface NewConstructionPermit {
  permitNumber: string;
  address: string;
  category: ConstructionCategory;
  workDescription: string;
  issueDate: string;
  reportedCost: number;
  communityArea: string;
  latitude: number | null;
  longitude: number | null;
  ownerName?: string;
  architectName?: string;
  contractorName?: string;
  stories?: number;
  units?: number;
  unitsAmbiguous?: boolean;
  parkingSpaces?: number;
  buildingUse?: string;
}

export function categorizePermit(workDescription = ""): ConstructionCategory {
  const description = workDescription.toUpperCase();
  if (/\b(TENT|STAGE|ERECTION STARTS)\b/.test(description)) return "commercial";
  if (/\b(SINGLE[- ]FAMILY|S\.?F\.?R\.?)\b/.test(description)) return "singleFamily";
  const units = description.match(/\b(\d+)\s*(?:D\.?U\.?|DWELLING\s*UNITS?|UNITS?)\b/);
  if (units) return Number(units[1]) <= 1 ? "singleFamily" : "multifamily";
  if (/\b(APARTMENT|R-2|COACH HOUSE|ADU|TOWN ?HOME|TOWNHOUSE|CONDOMINIUM|CONDO)\b/.test(description)) return "multifamily";
  if (/\b(RESIDENCE|RESIDENTIAL|R-5)\b/.test(description)) return "singleFamily";
  return "commercial";
}

export function isAccessoryStructure(workDescription = ""): boolean {
  const description = workDescription.toUpperCase();
  if (description.includes("ERECTION STARTS:")) return true;
  const core = description
    .replace(/\b(ON|AT|SERVING|CONTAINING|WITHIN)\s+(AN?\s+|THE\s+)?EXISTING[^.]*/g, "")
    .replace(/\bEXISTING\b[^.]*/g, "");
  if (/\b(STORY|STORIES|RESIDENCE|DWELLING|D\.?U\.?S?\b|APARTMENT|SFR|TOWNHOME|TOWNHOUSE|CONDO|RETAIL|OFFICE|MIXED[- ]?USE|SCHOOL|WAREHOUSE|HOTEL|RESTAURANT)\b/.test(core)) return false;
  return /\b(GARAGE|MOBILE STAGE|STAGE|TENT|CANOPY|CANOPIES|SCAFFOLD|FENCE|SHED|CARPORT|PERGOLA|GAZEBO)\b/.test(core);
}

function parseDetails(workDescription: string) {
  const description = workDescription.toUpperCase();
  const stories = description.match(/\b(\d+)[\s-](?:STORY|STORIES|STOR|FL(?:OOR)?S?)\b/)?.[1];
  const unitMatches = Array.from(description.matchAll(/\b(\d+)\s*(?:D\.?U\.?|DWELLING\s*UNITS?|UNITS?(?:\s+RESID)?|APARTMENTS?)\b/g));
  const units = unitMatches[0]?.[1];
  const reportedUnitCounts = new Set(unitMatches.map(match => Number(match[1])).filter(value => value > 0));
  const parkingSpaces = description.match(/\b(\d+)[\s-](?:PARKING\s*SPACES?|CAR\s*GARAGE|CAR\s*PARKING|STALLS?)\b/)?.[1];
  let buildingUse: string | undefined;
  if (/\bMIXED[- ]USE\b/.test(description)) buildingUse = "Mixed Use";
  else if (/\bRETAIL\b/.test(description)) buildingUse = "Retail";
  else if (/\bOFFICE\b/.test(description)) buildingUse = "Office";
  else if (/\bRESTAURANT\b/.test(description)) buildingUse = "Restaurant";
  else if (/\bHOTEL|MOTEL\b/.test(description)) buildingUse = "Hotel";
  else if (/\bWAREHOUSE\b/.test(description)) buildingUse = "Warehouse";
  else if (/\bAPARTMENT\b/.test(description)) buildingUse = "Apartment";
  else if (/\bCONDOMINIUM|CONDO\b/.test(description)) buildingUse = "Condominium";
  else if (/\bTOWN ?HOME|TOWNHOUSE\b/.test(description)) buildingUse = "Townhome";
  else if (/\bSINGLE[- ]FAMILY|S\.?F\.?R\.?|RESIDENCE\b/.test(description)) buildingUse = "Single Family";
  return {
    stories: stories ? Number(stories) : undefined,
    units: units && Number(units) > 0 ? Number(units) : undefined,
    unitsAmbiguous: reportedUnitCounts.size > 1,
    parkingSpaces: parkingSpaces ? Number(parkingSpaces) : undefined,
    buildingUse,
  };
}

function contacts(raw: RawPermit) {
  const entries = [1, 2, 3, 4].map((n) => ({
    name: raw[`contact_${n}_name` as keyof RawPermit] as string | undefined,
    type: raw[`contact_${n}_type` as keyof RawPermit] as string | undefined,
  }));
  return {
    ownerName: entries.find((entry) => entry.name && /OWNER/i.test(entry.type || ""))?.name,
    architectName: entries.find((entry) => entry.name && /ARCHITECT/i.test(entry.type || ""))?.name,
    contractorName: entries.find((entry) => entry.name && /GENERAL CONTRACTOR/i.test(entry.type || ""))?.name,
  };
}

function normalize(raw: RawPermit): NewConstructionPermit {
  const workDescription = raw.work_description || "";
  // Chicago's current Building Permits schema includes the suffix in
  // street_name (for example, "WABASH AVE"); there is no separate suffix field.
  const address = [raw.street_number, raw.street_direction, raw.street_name].filter(Boolean).join(" ") || "Address unavailable";
  const latitude = Number(raw.latitude);
  const longitude = Number(raw.longitude);
  return {
    permitNumber: raw.permit_ || `${address}-${raw.issue_date || ""}`,
    address,
    category: categorizePermit(workDescription),
    workDescription,
    issueDate: (raw.issue_date || "").slice(0, 10),
    reportedCost: Number(raw.reported_cost) || 0,
    communityArea: raw.community_area || "",
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    ...contacts(raw),
    ...parseDetails(workDescription),
  };
}

let cached: { permits: NewConstructionPermit[]; fetchedAt: number } | null = null;
let inFlight: Promise<NewConstructionPermit[]> | null = null;
const CACHE_MS = 24 * 60 * 60 * 1000;

export async function getChicagoNewConstructionPermits(): Promise<NewConstructionPermit[]> {
  if (cached && Date.now() - cached.fetchedAt < CACHE_MS) return cached.permits;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const startDate = `${new Date().getFullYear() - 3}-01-01`;
    const select = "permit_,permit_type,work_description,issue_date,reported_cost,community_area,latitude,longitude,street_number,street_direction,street_name,contact_1_name,contact_1_type,contact_2_name,contact_2_type,contact_3_name,contact_3_type,contact_4_name,contact_4_type";
    const results: RawPermit[] = [];
    const limit = 2000;
    for (let offset = 0; ; offset += limit) {
      const query = new URLSearchParams({
        "$select": select,
        "$where": `permit_type='PERMIT - NEW CONSTRUCTION' AND issue_date >= '${startDate}'`,
        "$order": "issue_date DESC",
        "$limit": String(limit),
        "$offset": String(offset),
      });
      const response = await fetch(`https://data.cityofchicago.org/resource/ydr8-5enu.json?${query}`, { signal: AbortSignal.timeout(15_000) });
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 500);
        throw new Error(`Chicago permits API ${response.status}: ${detail}`);
      }
      const page = await response.json() as RawPermit[];
      results.push(...page);
      if (page.length < limit) break;
    }
    const byPermit = new Map<string, RawPermit>();
    for (const raw of results) {
      const key = raw.permit_ || `${raw.street_number}|${raw.street_name}|${raw.issue_date}`;
      if (!byPermit.has(key)) byPermit.set(key, raw);
    }
    const permits = Array.from(byPermit.values()).filter((raw) => !isAccessoryStructure(raw.work_description)).map(normalize);
    cached = { permits, fetchedAt: Date.now() };
    console.log(`[NEW CONSTRUCTION] Cached ${permits.length} qualifying permits from ${results.length} records`);
    return permits;
  })();
  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}