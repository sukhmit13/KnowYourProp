import { db } from "./db";
import { zbaMonthlyCache } from "../shared/schema";
import { desc, eq } from "drizzle-orm";

export interface ZbaApproval {
  caseNumber: string;
  ward: number;
  zoningDistrict: string;
  address: string;
  applicant: string;
  subject: string;
  decision: 'Approved' | 'Denied' | 'Continued' | 'Withdrawn';
  meetingDate: string;
  meetingMonth: string;
  sourceUrl?: string;
  lat?: number;
  lon?: number;
}

export interface ZbaUpcoming {
  caseNumber: string;
  ward: number;
  zoningDistrict: string;
  address: string;
  applicant: string;
  subject: string;
  hearingDate: string;   // actual meeting date extracted from PDF, e.g. "2026-03-20"
  hearingMonth: string;
  sourceUrl?: string;
  lat?: number;
  lon?: number;
}

export interface ZbaActivityCoverage {
  status: "available" | "partial" | "unavailable";
  refreshing: boolean;
  checkedAt: string | null;
  agenda: { expectedMonths: number; successfulMonths: number };
  decisions: { expectedMonths: number; successfulMonths: number };
  coordinates: { total: number; geocoded: number; missing: number };
  note: string;
}

export interface ZbaActivitySnapshot {
  recentApprovals: ZbaApproval[];
  upcomingCases: ZbaUpcoming[];
  coverage: ZbaActivityCoverage;
}

export function mergeByCaseNumber<T extends { caseNumber: string }>(previous: T[], incoming: T[]): T[] {
  const merged = new Map<string, T>();
  for (const item of previous) merged.set(item.caseNumber, item);
  for (const item of incoming) merged.set(item.caseNumber, item);
  return Array.from(merged.values());
}

export function retainLastGoodOnIncomplete<T extends { caseNumber: string }>(
  previous: T[],
  incoming: T[],
  sourceComplete: boolean,
): T[] {
  return sourceComplete ? incoming : mergeByCaseNumber(previous, incoming);
}

export function deriveZbaCoverageStatus(input: {
  hasCache: boolean;
  agendaComplete: boolean;
  decisionsComplete: boolean;
  coordinateTotal: number;
  geocodedCount: number;
}): ZbaActivityCoverage["status"] {
  const sourceComplete = input.agendaComplete && input.decisionsComplete;
  const coordinatesComplete = input.geocodedCount === input.coordinateTotal;
  if (sourceComplete && coordinatesComplete) return "available";
  if (!input.hasCache && !input.geocodedCount && !input.coordinateTotal &&
    !input.agendaComplete && !input.decisionsComplete) return "unavailable";
  return "partial";
}

const MONTH_ABBREVS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const PDF_BASE = 'https://www.chicago.gov/content/dam/city/depts/zlup/Administrative_Reviews_and_Approvals/Agendas';

// Extracts the actual ZBA meeting date from the first ~1000 chars of PDF text.
// Chicago agenda PDFs have a header like "March 20, 2026" or "MARCH 20, 2026".
function extractMeetingDateFromText(text: string): string | null {
  const header = text.slice(0, 1500);
  const monthPat = MONTH_NAMES.join('|');
  const regex = new RegExp(`(${monthPat})\\s+(\\d{1,2}),?\\s+(20\\d{2})`, 'i');
  const m = header.match(regex);
  if (!m) return null;
  const monthIdx = MONTH_NAMES.findIndex(mn => mn.toLowerCase() === m[1].toLowerCase());
  if (monthIdx === -1) return null;
  const day = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  return `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Returns a label like "March 2026" from a date string "2026-03-20"
function formatMeetingMonth(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

// Returns Date 7 days after the given date string
function unlockDate(dateStr: string): Date {
  const d = new Date(dateStr + 'T12:00:00');
  return new Date(d.getTime() + 7 * 24 * 60 * 60 * 1000);
}

// From cached upcoming items, build a map of yearMonth -> actual meeting date
// so we can check if past months' decisions are ready without needing their agendas.
function buildKnownMeetingDates(upcoming = cachedUpcoming): Map<string, string> {
  const map = new Map<string, string>();
  for (const u of upcoming) {
    if (!u.hearingDate || u.hearingDate.endsWith('-01')) continue; // skip fake dates
    const key = u.hearingDate.slice(0, 7); // "YYYY-MM"
    map.set(key, u.hearingDate);
  }
  return map;
}

// Returns the most recent unlock date that has passed based on known meeting dates.
// This is the "latest data available" timestamp — if our cache predates this, re-fetch.
function getLatestAvailableDate(upcoming = cachedUpcoming): Date {
  const now = new Date();
  const known = buildKnownMeetingDates(upcoming);

  let latest = new Date(0);

  // Check real meeting dates from cached upcoming items first
  known.forEach(dateStr => {
    const u = unlockDate(dateStr);
    if (now >= u && u > latest) latest = u;
  });

  // Fall back to the 20th-of-month estimate for the past 4 months (including current).
  // This ensures we always detect "new data available" even if the known map is empty.
  for (let i = 0; i <= 4; i++) {
    let month = now.getMonth() - i;
    let year = now.getFullYear();
    if (month < 0) { month += 12; year--; }
    const key = `${year}-${String(month + 1).padStart(2, '0')}`;
    if (known.has(key)) continue; // already covered by real dates above
    const fallbackDate = `${year}-${String(month + 1).padStart(2, '0')}-20`;
    const u = unlockDate(fallbackDate);
    if (now >= u && u > latest) latest = u;
  }

  return latest;
}

// The city has used both abbreviated ("ZBA_Jul_2026_...") and full month names
// ("ZBA_July_2026_...") in PDF filenames — e.g. Jan–May 2026 used abbreviations,
// June/July 2026 switched to full names. Always try both variants.
function monthUrlVariants(month: number, year: number, kind: 'Agenda' | 'Decisions' | 'Minutes'): string[] {
  const urls = [
    `${PDF_BASE}/ZBA_${MONTH_ABBREVS[month]}_${year}_${kind}.pdf`,
    `${PDF_BASE}/ZBA_${MONTH_NAMES[month]}_${year}_${kind}.pdf`,
  ];
  return Array.from(new Set(urls)); // dedupes May, where abbrev and full name are identical
}

function getDecisionMonthSets(upcoming = cachedUpcoming): Array<{
  decisionUrls: string[]; meetingDate: string; meetingMonth: string;
}> {
  const now = new Date();
  const known = buildKnownMeetingDates(upcoming);
  const sets = [];

  // Start at i=0 to include the current month when its meeting+7 days has already passed
  for (let i = 0; i <= 4; i++) {
    let month = now.getMonth() - i;
    let year = now.getFullYear();
    if (month < 0) { month += 12; year--; }
    const key = `${year}-${String(month + 1).padStart(2, '0')}`;
    const abbrev = MONTH_ABBREVS[month];
    const name = MONTH_NAMES[month];

    // Use real meeting date if known, otherwise fall back to 20th of that month
    const meetingDateStr = known.get(key) ?? `${year}-${String(month + 1).padStart(2, '0')}-20`;
    if (now < unlockDate(meetingDateStr)) continue; // decisions not yet available

    sets.push({
      // Decisions PDFs first (posted sooner), then Minutes as fallback — each in both naming variants
      decisionUrls: [...monthUrlVariants(month, year, 'Decisions'), ...monthUrlVariants(month, year, 'Minutes')],
      meetingDate:  meetingDateStr,
      meetingMonth: `${name} ${year}`,
    });
  }
  return sets;
}

function getAgendaMonthSets(upcoming = cachedUpcoming): Array<{
  agendaUrls: string[]; fallbackHearingDate: string; hearingMonth: string;
}> {
  const now = new Date();
  const known = buildKnownMeetingDates(upcoming);
  const sets = [];

  const curMonth = now.getMonth();
  const curYear = now.getFullYear();
  const curKey = `${curYear}-${String(curMonth + 1).padStart(2, '0')}`;
  const curMeetingDateStr = known.get(curKey) ?? `${curYear}-${String(curMonth + 1).padStart(2, '0')}-20`;

  if (now < unlockDate(curMeetingDateStr)) {
    // Before this month's meeting + 7: show current month's agenda
    sets.push({
      agendaUrls: monthUrlVariants(curMonth, curYear, 'Agenda'),
      fallbackHearingDate: curMeetingDateStr,
      hearingMonth: `${MONTH_NAMES[curMonth]} ${curYear}`,
    });
  } else {
    // After this month's meeting + 7: show next month's agenda
    let nextMonth = curMonth + 1;
    let nextYear = curYear;
    if (nextMonth > 11) { nextMonth -= 12; nextYear++; }
    const nextKey = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}`;
    const nextFallback = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-20`;
    sets.push({
      agendaUrls: monthUrlVariants(nextMonth, nextYear, 'Agenda'),
      fallbackHearingDate: known.get(nextKey) ?? nextFallback,
      hearingMonth: `${MONTH_NAMES[nextMonth]} ${nextYear}`,
    });
  }
  return sets;
}

async function fetchPdfText(url: string, deadline: number): Promise<string | null> {
  try {
    const timeoutMs = Math.min(8_000, deadline - Date.now());
    if (timeoutMs <= 0) return null;
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/pdf,*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.chicago.gov/',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!resp.ok) return null;
    const buffer = Buffer.from(await resp.arrayBuffer());
    const { PDFParse } = await import('pdf-parse') as any;
    const parser = new PDFParse({ data: buffer, verbosity: 0 });
    const result = await parser.getText();
    return (result.text as string) || '';
  } catch (err) {
    console.error(`[ZBA] PDF fetch/parse failed for ${url}:`, (err as Error).message);
    return null;
  }
}

async function geocodeAddress(address: string, deadline: number): Promise<{ lat: number; lon: number } | null> {
  try {
    const timeoutMs = Math.min(5_000, deadline - Date.now());
    if (timeoutMs <= 0) return null;
    const encoded = encodeURIComponent(`${address}, Chicago, IL`);
    const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encoded}&benchmark=Public_AR_Current&format=json`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!resp.ok) return null;
    const data = await resp.json() as any;
    const match = data.result?.addressMatches?.[0];
    if (!match?.coordinates) return null;
    const lat = parseFloat(match.coordinates.y);
    const lon = parseFloat(match.coordinates.x);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon };
  } catch {
    return null;
  }
}

async function geocodeItems<T extends { address: string; lat?: number; lon?: number }>(
  items: T[],
  deadline: number,
): Promise<(T & { lat?: number; lon?: number })[]> {
  const results = [...items];
  const missingIndices = items.map((item, index) => item.lat == null || item.lon == null ? index : -1).filter(index => index >= 0);
  const work = missingIndices.slice(0, 32);
  for (let start = 0; start < work.length && Date.now() < deadline; start += 8) {
    const batch = work.slice(start, start + 8);
    await Promise.all(batch.map(async index => {
      const coords = await geocodeAddress(items[index].address, deadline);
      if (coords) results[index] = { ...items[index], lat: coords.lat, lon: coords.lon };
    }));
  }
  return results;
}

function extractStreetAddress(text: string): string {
  const m = text.match(/\d{3,5}\s+[NSEW]\.?\s+[\w.]+(?:\s+[\w.]+)*\s+(?:Avenue|Ave\.?|Street|St\.?|Boulevard|Blvd\.?|Drive|Dr\.?|Lane|Ln|Road|Rd|Way|Place|Pl|Court|Ct|Parkway|Pkwy)\b/i);
  return m ? m[0].replace(/\s+/g, ' ').trim() : '';
}

function parseCaseBlocks(text: string): Array<{ caseNumber: string; block: string }> {
  const caseRegex = /\b(\d{1,4}-\d{2,4}-[SZ])\b/g;
  const positions: Array<{ index: number; caseNumber: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = caseRegex.exec(text)) !== null) {
    positions.push({ index: m.index, caseNumber: m[1] });
  }
  return positions.map((p, i) => ({
    caseNumber: p.caseNumber,
    block: text.slice(p.index, i + 1 < positions.length ? positions[i + 1].index : text.length),
  }));
}

function extractCaseFields(block: string): {
  ward: number; zoningDistrict: string; address: string; applicant: string; subject: string;
} | null {
  const wardM = block.match(/WARD:\s*(\d+)/);
  if (!wardM) return null;
  const ward = parseInt(wardM[1], 10);
  if (isNaN(ward) || ward < 1 || ward > 50) return null;

  const zoningM = block.match(/ZONING DISTRICT:\s*([A-Z0-9-]+)/);
  const zoningDistrict = zoningM?.[1] || '';

  let address = '';
  const premisesLineM = block.match(/PREMISES AFFECTED:\s*([^\n]+)/);
  if (premisesLineM) {
    const raw = premisesLineM[1].trim();
    if (/^\d+/.test(raw)) address = raw;
  }
  if (!address) address = extractStreetAddress(block);
  if (!address) return null;

  address = address.replace(/\s+/g, ' ').replace(/\$\s*/g, '').replace(/\\mathrm\s*\{[^}]*\}/g, '').trim();

  const applicantM = block.match(/APPLICANT:\s*([\s\S]+?)(?=\n(?:OWNER:|PREMISES|SUBJECT:|$))/);
  const applicant = applicantM ? applicantM[1].replace(/\s+/g, ' ').trim().slice(0, 100) : '';

  const subjectM = block.match(/SUBJECT:\s*([\s\S]+?)(?=(?:Motion to|•\s*(?:Approved|Denied|Continued|Withdrawn)|Continued to\s|\bWithdrawn\b)|$)/i);
  let subject = subjectM ? subjectM[1].replace(/\s+/g, ' ').trim() : '';
  if (subject.length > 400) subject = subject.slice(0, 400).trim();

  return { ward, zoningDistrict, address, applicant, subject };
}

function parseZbaText(
  text: string,
  meetingMonth: string,
  meetingDate: string,
  sourceUrl?: string,
): Omit<ZbaApproval, 'lat' | 'lon'>[] {
  const results: Omit<ZbaApproval, 'lat' | 'lon'>[] = [];
  for (const { caseNumber, block } of parseCaseBlocks(text)) {
    const fields = extractCaseFields(block);
    if (!fields) continue;

    let decision: ZbaApproval['decision'];
    if (/Motion to approve[\s\S]{0,200}Motion carried|•\s*Approved/i.test(block)) {
      decision = 'Approved';
    } else if (/Motion to deny[\s\S]{0,200}Motion carried|•\s*Denied/i.test(block)) {
      decision = 'Denied';
    } else if (/Continued to\s|•\s*Continued/i.test(block)) {
      decision = 'Continued';
    } else if (/\bWithdrawn\b|•\s*Withdrawn/i.test(block)) {
      decision = 'Withdrawn';
    } else {
      continue;
    }

    results.push({ caseNumber, ...fields, decision, meetingDate, meetingMonth, sourceUrl });
  }
  return results;
}

// Parses agenda PDF text. Extracts the real meeting date from the PDF header
// and uses it as hearingDate on all items (falls back to fallbackDate if not found).
function parseAgendaText(
  text: string,
  fallbackHearingDate: string,
  fallbackHearingMonth: string,
  sourceUrl?: string,
): Omit<ZbaUpcoming, 'lat' | 'lon'>[] {
  const extracted = extractMeetingDateFromText(text);
  const hearingDate = extracted ?? fallbackHearingDate;
  const hearingMonth = extracted ? formatMeetingMonth(extracted) : fallbackHearingMonth;

  if (extracted) {
    console.log(`[ZBA] Extracted real meeting date from agenda PDF: ${extracted}`);
  } else {
    console.log(`[ZBA] Could not extract meeting date from agenda PDF, using fallback: ${fallbackHearingDate}`);
  }

  const results: Omit<ZbaUpcoming, 'lat' | 'lon'>[] = [];
  for (const { caseNumber, block } of parseCaseBlocks(text)) {
    const fields = extractCaseFields(block);
    if (!fields) continue;
    results.push({ caseNumber, ...fields, hearingDate, hearingMonth, sourceUrl });
  }
  return results;
}

let cachedApprovals: ZbaApproval[] = [];
let cachedUpcoming: ZbaUpcoming[] = [];
let lastFetchedAt = 0;
let nextRefreshAt = 0;
let cacheLoaded = false;
let refreshPromise: Promise<void> | null = null;
let lastCoverage: ZbaActivityCoverage = {
  status: "unavailable",
  refreshing: false,
  checkedAt: null,
  agenda: { expectedMonths: 0, successfulMonths: 0 },
  decisions: { expectedMonths: 0, successfulMonths: 0 },
  coordinates: { total: 0, geocoded: 0, missing: 0 },
  note: "ZBA cache has not been loaded or refreshed yet.",
};

const MAX_REFRESH_MS = 60_000;
const READY_REFRESH_MS = 6 * 60 * 60 * 1000;
const RETRY_REFRESH_MS = 15 * 60 * 1000;

export function getSnapshotWithoutWaiting<T>(
  snapshot: () => T,
  startBackgroundRefresh: () => Promise<unknown> | null,
): T {
  const refresh = startBackgroundRefresh();
  if (refresh) void refresh.catch(err => console.error("[ZBA] Background refresh failed:", (err as Error).message));
  return snapshot();
}

async function loadFromDb(): Promise<boolean> {
  try {
    const rows = await db.select().from(zbaMonthlyCache).orderBy(desc(zbaMonthlyCache.cachedAt)).limit(1);
    if (!rows.length) return false;
    const row = rows[0];
    const approvals = JSON.parse(row.approvalsJson);
    const upcoming = JSON.parse(row.upcomingJson);
    if (!Array.isArray(approvals) || !Array.isArray(upcoming)) throw new Error("Invalid ZBA cache JSON");
    cachedApprovals = approvals;
    cachedUpcoming = upcoming;
    lastFetchedAt = row.cachedAt.getTime();
    cacheLoaded = true;
    const total = cachedApprovals.length + cachedUpcoming.length;
    const geocoded = [...cachedApprovals, ...cachedUpcoming].filter(item => item.lat != null && item.lon != null).length;
    lastCoverage = {
      status: "partial",
      refreshing: false,
      checkedAt: row.cachedAt.toISOString(),
      agenda: { expectedMonths: 0, successfulMonths: 0 },
      decisions: { expectedMonths: 0, successfulMonths: 0 },
      coordinates: { total, geocoded, missing: total - geocoded },
      note: "Loaded the last-good database snapshot; source-fetch completeness is not stored in the legacy cache.",
    };
    console.log(`[ZBA] Loaded from DB: ${cachedApprovals.length} approvals, ${cachedUpcoming.length} upcoming.`);
    return true;
  } catch (err) {
    console.error("[ZBA] DB load failed:", (err as Error).message);
    return false;
  }
}

async function saveToDb(): Promise<void> {
  try {
    await db.insert(zbaMonthlyCache).values({
      approvalsJson: JSON.stringify(cachedApprovals),
      upcomingJson: JSON.stringify(cachedUpcoming),
    });
    const rows = await db.select({ id: zbaMonthlyCache.id })
      .from(zbaMonthlyCache)
      .orderBy(desc(zbaMonthlyCache.cachedAt));
    for (const row of rows.slice(3)) {
      await db.delete(zbaMonthlyCache).where(eq(zbaMonthlyCache.id, row.id));
    }
  } catch (err) {
    console.error("[ZBA] DB save failed:", (err as Error).message);
  }
}

function cacheHasData(): boolean {
  return cacheLoaded || cachedApprovals.length > 0 || cachedUpcoming.length > 0;
}

function cacheNeedsRefresh(now: number): boolean {
  if (refreshPromise || now < nextRefreshAt) return false;
  if (!cacheHasData() || lastFetchedAt === 0) return true;
  if (lastCoverage.status === "partial" &&
    lastCoverage.note.startsWith("Loaded the last-good database snapshot")) return true;
  const latestAvailable = getLatestAvailableDate();
  const allUpcomingPast = cachedUpcoming.length > 0 && cachedUpcoming.every(item => {
    if (!item.hearingDate) return false;
    return new Date(`${item.hearingDate}T12:00:00`) < new Date(now);
  });
  return now - lastFetchedAt >= READY_REFRESH_MS ||
    (latestAvailable.getTime() > 0 && lastFetchedAt < latestAvailable.getTime()) ||
    allUpcomingPast;
}

async function fetchFirstAvailable<T>(
  urls: string[],
  parse: (text: string, url: string) => T[],
  deadline: number,
): Promise<{ fetched: boolean; records: T[] }> {
  for (const url of urls) {
    if (Date.now() >= deadline) break;
    const text = await fetchPdfText(url, deadline);
    if (text === null || !text.trim()) continue;
    const records = parse(text, url);
    if (!records.length) continue;
    return { fetched: true, records };
  }
  return { fetched: false, records: [] };
}

async function refreshCacheImpl(): Promise<void> {
  if (!cacheLoaded && cachedApprovals.length === 0 && cachedUpcoming.length === 0) await loadFromDb();
  const startedAt = Date.now();
  const deadline = startedAt + MAX_REFRESH_MS;
  const agendaSets = getAgendaMonthSets();
  const rawUpcoming: Omit<ZbaUpcoming, "lat" | "lon">[] = [];
  let agendaSuccessfulMonths = 0;

  for (const month of agendaSets) {
    if (Date.now() >= deadline) break;
    const fetched = await fetchFirstAvailable(month.agendaUrls,
      (text, url) => parseAgendaText(text, month.fallbackHearingDate, month.hearingMonth, url), deadline);
    if (fetched.fetched) {
      agendaSuccessfulMonths++;
      rawUpcoming.push(...fetched.records);
    }
  }
  const agendaComplete = agendaSuccessfulMonths === agendaSets.length;
  const knownUpcoming = [...cachedUpcoming, ...rawUpcoming];
  const decisionSets = getDecisionMonthSets(knownUpcoming);
  const rawApprovals: Omit<ZbaApproval, "lat" | "lon">[] = [];
  let decisionSuccessfulMonths = 0;
  for (const month of decisionSets) {
    if (Date.now() >= deadline) break;
    const fetched = await fetchFirstAvailable(month.decisionUrls,
      (text, url) => parseZbaText(text, month.meetingMonth, month.meetingDate, url), deadline);
    if (fetched.fetched) {
      decisionSuccessfulMonths++;
      rawApprovals.push(...fetched.records);
    }
  }
  const decisionsComplete = decisionSuccessfulMonths === decisionSets.length;
  const replaceApprovals = decisionSets.length > 0 && decisionsComplete;

  const approvalInput = retainLastGoodOnIncomplete(
    cachedApprovals,
    rawApprovals as ZbaApproval[],
    replaceApprovals,
  );
  const upcomingInput = retainLastGoodOnIncomplete(
    cachedUpcoming,
    rawUpcoming as ZbaUpcoming[],
    agendaComplete,
  );

  const priorApprovalCoords = new Map(cachedApprovals.filter(item => item.lat != null && item.lon != null)
    .map(item => [item.caseNumber, { lat: item.lat, lon: item.lon }]));
  const priorUpcomingCoords = new Map(cachedUpcoming.filter(item => item.lat != null && item.lon != null)
    .map(item => [item.caseNumber, { lat: item.lat, lon: item.lon }]));
  const approvalsWithKnownCoordinates = approvalInput.map(item => {
    const prior = priorApprovalCoords.get(item.caseNumber);
    return item.lat == null || item.lon == null ? { ...item, ...prior } : item;
  });
  const upcomingWithKnownCoordinates = upcomingInput.map(item => {
    const prior = priorUpcomingCoords.get(item.caseNumber);
    return item.lat == null || item.lon == null ? { ...item, ...prior } : item;
  });
  const [geocodedApprovals, geocodedUpcoming] = await Promise.all([
    geocodeItems(approvalsWithKnownCoordinates, deadline),
    geocodeItems(upcomingWithKnownCoordinates, deadline),
  ]);
  const coordinatesTotal = geocodedApprovals.length + geocodedUpcoming.length;
  const geocodedCount = [...geocodedApprovals, ...geocodedUpcoming]
    .filter(item => item.lat != null && item.lon != null).length;
  const status = deriveZbaCoverageStatus({
    hasCache: cacheHasData() || agendaSuccessfulMonths > 0 || decisionSuccessfulMonths > 0,
    agendaComplete,
    decisionsComplete,
    coordinateTotal: coordinatesTotal,
    geocodedCount,
  });

  // An incomplete source response may add new evidence, but cannot erase a
  // last-good record set or replace it with an empty array.
  if (replaceApprovals || geocodedApprovals.length) cachedApprovals = geocodedApprovals;
  if (agendaComplete || geocodedUpcoming.length) cachedUpcoming = geocodedUpcoming;
  if (cachedApprovals.length || cachedUpcoming.length || agendaSuccessfulMonths > 0 || decisionSuccessfulMonths > 0) {
    cacheLoaded = true;
  }
  lastFetchedAt = Date.now();
  const missingCoords = coordinatesTotal - geocodedCount;
  lastCoverage = {
    status,
    refreshing: false,
    checkedAt: new Date(lastFetchedAt).toISOString(),
    agenda: { expectedMonths: agendaSets.length, successfulMonths: agendaSuccessfulMonths },
    decisions: { expectedMonths: decisionSets.length, successfulMonths: decisionSuccessfulMonths },
    coordinates: { total: coordinatesTotal, geocoded: geocodedCount, missing: missingCoords },
    note: status === "available"
      ? "Agenda and decision sources were fetched for all currently expected months; every cached case has coordinates."
      : `ZBA coverage is ${status}: agenda ${agendaSuccessfulMonths}/${agendaSets.length} months, decisions ${decisionSuccessfulMonths}/${decisionSets.length} months, coordinates ${geocodedCount}/${coordinatesTotal}. Last-good records are retained.`,
  };
  nextRefreshAt = Date.now() + (status === "available" ? READY_REFRESH_MS : RETRY_REFRESH_MS);
  if (cacheHasData()) await saveToDb();
}

function startBackgroundRefresh(force = false): Promise<void> | null {
  if (refreshPromise) return refreshPromise;
  if (!force && !cacheNeedsRefresh(Date.now())) return null;
  const current = (async () => {
    try {
      await refreshCacheImpl();
    } catch (err) {
      console.error("[ZBA] Cache refresh failed:", (err as Error).message);
      nextRefreshAt = Date.now() + RETRY_REFRESH_MS;
      const hasCache = cacheHasData();
      lastCoverage = {
        ...lastCoverage,
        status: hasCache ? "partial" : "unavailable",
        refreshing: false,
        checkedAt: lastFetchedAt ? new Date(lastFetchedAt).toISOString() : null,
        note: `Refresh failed; ${hasCache ? "last-good records are retained" : "no ZBA snapshot is ready"}: ${(err as Error).message}`,
      };
    }
  })();
  refreshPromise = current.finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

async function refreshCache(): Promise<void> {
  const refresh = startBackgroundRefresh();
  if (refresh) await refresh;
}

function snapshot(): ZbaActivitySnapshot {
  const refreshing = !!refreshPromise;
  const coverage = !cacheHasData()
    ? { ...lastCoverage, status: "unavailable" as const, refreshing }
    : refreshing
      ? { ...lastCoverage, status: "partial" as const, refreshing, note: "Refreshing a stale snapshot; only last-good records are being returned." }
      : { ...lastCoverage, refreshing };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return {
    recentApprovals: [...cachedApprovals],
    upcomingCases: cachedUpcoming.filter(item => !item.hearingDate || new Date(`${item.hearingDate}T12:00:00`) >= today),
    coverage,
  };
}

/** Synchronous all-wards cache snapshot; refresh is singleton/background only. */
export function getAllZbaActivitySnapshot(): ZbaActivitySnapshot {
  return getSnapshotWithoutWaiting(snapshot, () => startBackgroundRefresh());
}

export async function getZbaApprovals(ward: number): Promise<ZbaApproval[]> {
  await refreshCache();
  return cachedApprovals.filter(a => a.ward === ward);
}

/** Current monthly decisions across all wards. Property history matches these
 * by address, rather than by the property's current ward. */
export async function getAllZbaApprovals(): Promise<ZbaApproval[]> {
  await refreshCache();
  return [...cachedApprovals];
}

export async function getZbaUpcoming(ward: number): Promise<ZbaUpcoming[]> {
  await refreshCache();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return cachedUpcoming.filter(u => {
    if (u.ward !== ward) return false;
    // Exclude items whose hearing date has already passed
    if (u.hearingDate) {
      const hd = new Date(u.hearingDate + 'T12:00:00');
      if (hd < today) return false;
    }
    return true;
  });
}

// Forces a refresh but retains the last-good snapshot while source requests run.
export async function forceRefreshZbaCache(): Promise<void> {
  nextRefreshAt = 0;
  const refresh = startBackgroundRefresh(true);
  if (refresh) await refresh;
}
