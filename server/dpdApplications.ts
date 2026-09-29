import { load } from "cheerio";

const CITY_BASE = "https://www.chicago.gov";
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const CACHE_MS = 12 * 60 * 60 * 1000;

export interface DpdApplication {
  id: string;
  address: string;
  applicant: string | null;
  applicationType: string;
  status: "Plan Commission application";
  proposal: string;
  hearingDate: string | null;
  hearingUrl: string;
  applicationUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  units: number | null;
  unitsAmbiguous: boolean;
  stories: number | null;
  ward: number | null;
}

export interface DpdCoverage {
  source: string;
  checkedAt: string;
  pageCount: number;
  successfulPageCount: number;
  geocodedCount: number;
  complete: false;
  note: string;
}

let cached: { value: DpdApplication[]; coverage: DpdCoverage; cachedAt: number } | null = null;
const geocodeCache = new Map<string, { latitude: number; longitude: number } | null>();

const clean = (value: string) => value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
const absoluteUrl = (url: string | undefined) => !url ? null : url.startsWith("http") ? url : `${CITY_BASE}${url}`;

function applicationType(description: string, applicationLinkText: string): string {
  const text = `${applicationLinkText} ${description}`.toLowerCase();
  if (text.includes("planned development")) return "Planned Development application";
  if (text.includes("map amendment") || text.includes("rezone")) return "Zoning map amendment application";
  if (text.includes("lakefront")) return "Lakefront Protection Ordinance application";
  if (text.includes("planned manufacturing")) return "Planned Manufacturing District application";
  return applicationLinkText ? clean(applicationLinkText) : "Plan Commission application";
}

function parseAddress(value: string): string | null {
  const match = clean(value).match(/\b\d{1,5}(?:\s*[-–]\s*\d{1,5})?\s+(?:N(?:ORTH)?|S(?:OUTH)?|E(?:AST)?|W(?:EST)?)\.?\s+[A-Z0-9.' -]+?(?:AVE(?:NUE)?|ST(?:REET)?|RD|ROAD|BLVD|BOULEVARD|DR|DRIVE|PL|PLACE|CT|COURT|LN|LANE)\b/i);
  return match ? clean(match[0]) : null;
}

function parseHearingDate(text: string, year: number, monthIndex: number): string | null {
  const match = text.match(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/i);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[2] || year), MONTH_NAMES.findIndex(m => m.toLowerCase() === match![0].split(/\s+/)[0].toLowerCase()), Number(match[1])));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function parseApplicant(description: string): string | null {
  const match = description.match(/\bsubmitted by\s+(.+?)(?:,?\s+for (?:the )?property|,?\s+for the site|,?\s+to |,?\s+which)/i);
  return match ? clean(match[1]).replace(/[,.]$/, "") : null;
}

function parseUnits(description: string): { units: number | null; ambiguous: boolean } {
  const counts = new Set<number>();
  const pattern = /\b(\d[\d,]*)[\s-]*(?:dwelling[\s-]+)?units?\b/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(description)) !== null) {
    const count = Number(match[1].replace(/,/g, ""));
    if (count >= 1 && count <= 2_000) counts.add(count);
  }
  let maximum: number | null = null;
  counts.forEach(count => {
    maximum = maximum === null ? count : Math.max(maximum, count);
  });
  return {
    units: maximum,
    ambiguous: counts.size > 1,
  };
}

async function geocode(address: string): Promise<{ latitude: number; longitude: number } | null> {
  const key = address.toUpperCase();
  if (geocodeCache.has(key)) return geocodeCache.get(key)!;
  try {
    const params = new URLSearchParams({
      address: `${address}, Chicago, IL`,
      benchmark: "Public_AR_Current",
      format: "json",
    });
    const response = await fetch(`https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?${params}`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`Census geocoder ${response.status}`);
    const body = await response.json() as any;
    const coordinates = body?.result?.addressMatches?.[0]?.coordinates;
    const result = Number.isFinite(coordinates?.y) && Number.isFinite(coordinates?.x)
      ? { latitude: coordinates.y, longitude: coordinates.x }
      : null;
    geocodeCache.set(key, result);
    return result;
  } catch {
    geocodeCache.set(key, null);
    return null;
  }
}

function hearingPageUrl(year: number, monthIndex: number): string {
  return `${CITY_BASE}/city/en/depts/dcd/supp_info/chicago_plan_commission/${MONTH_NAMES[monthIndex]}_${year}_Plan_Commission_Hearing.html`;
}

async function parseHearingPage(year: number, monthIndex: number): Promise<DpdApplication[]> {
  const hearingUrl = hearingPageUrl(year, monthIndex);
  const response = await fetch(hearingUrl, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Plan Commission page returned ${response.status}`);
  const html = await response.text();
  const $ = load(html);
  const hearingDate = parseHearingDate($("body").text(), year, monthIndex);
  const rows: Omit<DpdApplication, "latitude" | "longitude">[] = [];

  $("table tr").each((_index, row) => {
    const cells = $(row).find("td");
    if (cells.length < 2) return;
    const addressCell = clean($(cells[0]).text());
    const description = clean($(cells[1]).text());
    const address = parseAddress(addressCell) || parseAddress(description);
    if (!address || !description) return;
    const links = $(row).find("a");
    const applicationAnchor = links.filter((_i, link) => /application/i.test(clean($(link).text()))).first();
    const applicationUrl = absoluteUrl(applicationAnchor.attr("href"));
    const applicationLinkText = clean(applicationAnchor.text());
    const wardMatch = addressCell.match(/(\d{1,2})(?:st|nd|rd|th)?\s+Ward/i);
    const unitCounts = parseUnits(description);
    const storyMatch = description.match(/\b(\d{1,3})\s*[- ]?stor(?:y|ies)\b/i);
    rows.push({
      id: `dpd-${year}-${monthIndex + 1}-${address.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      address,
      applicant: parseApplicant(description),
      applicationType: applicationType(description, applicationLinkText),
      status: "Plan Commission application",
      proposal: description.slice(0, 1_200),
      hearingDate,
      hearingUrl,
      applicationUrl,
      units: unitCounts.units,
      unitsAmbiguous: unitCounts.ambiguous,
      stories: storyMatch ? Number(storyMatch[1]) : null,
      ward: wardMatch ? Number(wardMatch[1]) : null,
    });
  });

  return Promise.all(rows.map(async row => {
    const point = await geocode(row.address);
    return { ...row, latitude: point?.latitude ?? null, longitude: point?.longitude ?? null };
  }));
}

export async function getDpdApplications(monthsToCheck = 6): Promise<{ applications: DpdApplication[]; coverage: DpdCoverage }> {
  if (cached && Date.now() - cached.cachedAt < CACHE_MS) return { applications: cached.value, coverage: cached.coverage };
  const now = new Date();
  const dates = Array.from({ length: monthsToCheck }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index, 1));
    return { year: date.getUTCFullYear(), monthIndex: date.getUTCMonth() };
  });
  const settled = await Promise.allSettled(dates.map(({ year, monthIndex }) => parseHearingPage(year, monthIndex)));
  const applications = settled.flatMap(result => result.status === "fulfilled" ? result.value : []);
  const deduped = Array.from(new Map(applications.map(item => [`${item.address}|${item.applicationType}|${item.hearingDate}`, item])).values())
    .sort((a, b) => (b.hearingDate || "").localeCompare(a.hearingDate || ""));
  const coverage: DpdCoverage = {
    source: "Chicago Department of Planning and Development · Chicago Plan Commission hearing pages",
    checkedAt: new Date().toISOString(),
    pageCount: dates.length,
    successfulPageCount: settled.filter(result => result.status === "fulfilled").length,
    geocodedCount: deduped.filter(item => item.latitude != null && item.longitude != null).length,
    complete: false,
    note: "This checks the recent Plan Commission hearing pages only. It is not a complete citywide register of all DPD intake, Part I, zoning, or Planned Development applications; a missing result is not a finding that no application exists.",
  };
  cached = { value: deduped, coverage, cachedAt: Date.now() };
  return { applications: deduped, coverage };
}

const normalizedAddress = (value: string) => clean(value).toUpperCase()
  .replace(/\b(NORTH|SOUTH|EAST|WEST)\b/g, "")
  .replace(/\b(N|S|E|W)\.?\b/g, "")
  .replace(/\b(AVENUE|AVE|STREET|ST|ROAD|RD|BOULEVARD|BLVD|DRIVE|DR|PLACE|PL|COURT|CT|LANE|LN)\b\.?/g, "")
  .replace(/[^A-Z0-9 -]/g, "")
  .replace(/\s+/g, " ").trim();

/** Exact street plus an address number in the recorded number/range; never matches on name alone. */
export function matchesDpdAddress(applicationAddress: string, targetAddress: string): boolean {
  const app = normalizedAddress(applicationAddress);
  const target = normalizedAddress(targetAddress);
  const appMatch = app.match(/^(\d+)(?:\s*-\s*(\d+))?\s+(.+)$/);
  const targetMatch = target.match(/^(\d+)\s+(.+)$/);
  if (!appMatch || !targetMatch || appMatch[3] !== targetMatch[2]) return false;
  const targetNumber = Number(targetMatch[1]);
  const start = Number(appMatch[1]);
  const end = appMatch[2] ? Number(appMatch[2]) : start;
  return targetNumber >= Math.min(start, end) && targetNumber <= Math.max(start, end);
}