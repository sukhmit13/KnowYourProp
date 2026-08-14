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
  lat?: number;
  lon?: number;
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
function buildKnownMeetingDates(): Map<string, string> {
  const map = new Map<string, string>();
  for (const u of cachedUpcoming) {
    if (!u.hearingDate || u.hearingDate.endsWith('-01')) continue; // skip fake dates
    const key = u.hearingDate.slice(0, 7); // "YYYY-MM"
    map.set(key, u.hearingDate);
  }
  return map;
}

// Returns the most recent unlock date that has passed based on known meeting dates.
// This is the "latest data available" timestamp — if our cache predates this, re-fetch.
function getLatestAvailableDate(): Date {
  const now = new Date();
  const known = buildKnownMeetingDates();

  let latest = new Date(0);

  // Check real meeting dates from cached upcoming items first
  for (const [, dateStr] of known) {
    const u = unlockDate(dateStr);
    if (now >= u && u > latest) latest = u;
  }

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

function getDecisionMonthSets(): Array<{
  decisionUrls: string[]; meetingDate: string; meetingMonth: string;
}> {
  const now = new Date();
  const known = buildKnownMeetingDates();
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

function getAgendaMonthSets(): Array<{
  agendaUrls: string[]; fallbackHearingDate: string; hearingMonth: string;
}> {
  const now = new Date();
  const known = buildKnownMeetingDates();
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

async function fetchPdfText(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/pdf,*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.chicago.gov/',
      },
      signal: AbortSignal.timeout(30000),
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

async function geocodeAddress(address: string): Promise<{ lat: number; lon: number } | null> {
  try {
    const encoded = encodeURIComponent(`${address}, Chicago, IL`);
    const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encoded}&benchmark=Public_AR_Current&format=json`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return null;
    const data = await resp.json() as any;
    const match = data.result?.addressMatches?.[0];
    if (!match?.coordinates) return null;
    return { lat: parseFloat(match.coordinates.y), lon: parseFloat(match.coordinates.x) };
  } catch {
    return null;
  }
}

async function geocodeItems<T extends { address: string }>(items: T[]): Promise<(T & { lat?: number; lon?: number })[]> {
  const results: (T & { lat?: number; lon?: number })[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const coords = await geocodeAddress(item.address);
    results.push({ ...item, lat: coords?.lat, lon: coords?.lon });
    if (i < items.length - 1) await new Promise(r => setTimeout(r, 80));
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

  const applicantM = block.match(/APPLICANT:\s*(.+?)(?=\n(?:OWNER:|PREMISES|SUBJECT:|$))/s);
  const applicant = applicantM ? applicantM[1].replace(/\s+/g, ' ').trim().slice(0, 100) : '';

  const subjectM = block.match(/SUBJECT:\s*([\s\S]+?)(?=(?:Motion to|•\s*(?:Approved|Denied|Continued|Withdrawn)|Continued to\s|\bWithdrawn\b)|$)/i);
  let subject = subjectM ? subjectM[1].replace(/\s+/g, ' ').trim() : '';
  if (subject.length > 400) subject = subject.slice(0, 400).trim();

  return { ward, zoningDistrict, address, applicant, subject };
}

function parseZbaText(text: string, meetingMonth: string, meetingDate: string): Omit<ZbaApproval, 'lat' | 'lon'>[] {
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

    results.push({ caseNumber, ...fields, decision, meetingDate, meetingMonth });
  }
  return results;
}

// Parses agenda PDF text. Extracts the real meeting date from the PDF header
// and uses it as hearingDate on all items (falls back to fallbackDate if not found).
function parseAgendaText(
  text: string,
  fallbackHearingDate: string,
  fallbackHearingMonth: string,
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
    results.push({ caseNumber, ...fields, hearingDate, hearingMonth });
  }
  return results;
}

let cachedApprovals: ZbaApproval[] = [];
let cachedUpcoming: ZbaUpcoming[] = [];
let lastFetchedAt = 0;
let refreshPromise: Promise<void> | null = null;

async function loadFromDb(): Promise<boolean> {
  try {
    const rows = await db.select().from(zbaMonthlyCache).orderBy(desc(zbaMonthlyCache.cachedAt)).limit(1);
    if (!rows.length) return false;
    const row = rows[0];
    cachedApprovals = JSON.parse(row.approvalsJson);
    cachedUpcoming = JSON.parse(row.upcomingJson);
    lastFetchedAt = row.cachedAt.getTime();
    console.log(`[ZBA] Loaded from DB: ${cachedApprovals.length} approvals, ${cachedUpcoming.length} upcoming. Meeting dates known: ${[...buildKnownMeetingDates().entries()].map(([k, v]) => `${k}→${v}`).join(', ')}`);
    return true;
  } catch (err) {
    console.error('[ZBA] DB load failed:', (err as Error).message);
    return false;
  }
}

async function saveToDb(): Promise<void> {
  try {
    await db.insert(zbaMonthlyCache).values({
      approvalsJson: JSON.stringify(cachedApprovals),
      upcomingJson: JSON.stringify(cachedUpcoming),
    });
    // Keep only the 3 most recent rows
    const rows = await db.select({ id: zbaMonthlyCache.id })
      .from(zbaMonthlyCache)
      .orderBy(desc(zbaMonthlyCache.cachedAt));
    if (rows.length > 3) {
      for (const row of rows.slice(3)) {
        await db.delete(zbaMonthlyCache).where(eq(zbaMonthlyCache.id, row.id));
      }
    }
    console.log('[ZBA] Saved to DB');
  } catch (err) {
    console.error('[ZBA] DB save failed:', (err as Error).message);
  }
}

async function refreshCache(): Promise<void> {
  // Load from DB on first call (survives server restarts)
  if (cachedApprovals.length === 0 && cachedUpcoming.length === 0) {
    await loadFromDb();
  }

  const now = Date.now();

  // Cold start: never fetched before — always run once to get initial data
  if (lastFetchedAt === 0) {
    console.log('[ZBA] Cold start — fetching initial data');
  } else {
    // Check if any new meeting data has become available since our last fetch.
    // "New data available" = a meeting in our known dates map has an unlock date
    // (meeting + 7 days) that is NEWER than our last fetch.
    const latestAvailable = getLatestAvailableDate();

    // Also re-fetch when all cached upcoming items have already passed — their
    // hearing dates are in the past, so the current/next month's agenda is needed.
    const nowDate = new Date();
    const allUpcomingPast = cachedUpcoming.length > 0 && cachedUpcoming.every(u => {
      if (!u.hearingDate) return false;
      return new Date(u.hearingDate + 'T12:00:00') < nowDate;
    });

    if (!allUpcomingPast && (latestAvailable.getTime() === 0 || lastFetchedAt >= latestAvailable.getTime())) {
      return; // data is current
    }
    if (allUpcomingPast) {
      console.log('[ZBA] All upcoming items have passed — re-fetching current/next agenda');
    } else {
      console.log(`[ZBA] New data available since ${latestAvailable.toISOString()}, re-fetching`);
    }
  }

  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const rawApprovals: Omit<ZbaApproval, 'lat' | 'lon'>[] = [];
      const rawUpcoming: Omit<ZbaUpcoming, 'lat' | 'lon'>[] = [];
      const seenApprovals = new Set<string>();
      const seenUpcoming = new Set<string>();

      // Step 1: Fetch agenda(s) first — this gives us the real meeting dates
      const agendaSets = getAgendaMonthSets();
      for (const s of agendaSets) {
        for (const url of s.agendaUrls) {
          const text = await fetchPdfText(url);
          if (!text) continue;
          const parsed = parseAgendaText(text, s.fallbackHearingDate, s.hearingMonth);
          for (const u of parsed) {
            if (!seenUpcoming.has(u.caseNumber)) {
              seenUpcoming.add(u.caseNumber);
              rawUpcoming.push(u);
            }
          }
          break;
        }
      }

      // Step 2: Use the real meeting dates (now in rawUpcoming / buildKnownMeetingDates)
      // to decide which past months' decisions are ready to fetch.
      // We need to temporarily set cachedUpcoming so buildKnownMeetingDates() has the new dates.
      const tempUpcoming = [...cachedUpcoming, ...rawUpcoming];
      const tempCache = cachedUpcoming;
      cachedUpcoming = tempUpcoming;

      const pastSets = getDecisionMonthSets();
      cachedUpcoming = tempCache; // restore

      for (const s of pastSets) {
        for (const url of s.decisionUrls) {
          const text = await fetchPdfText(url);
          if (!text) continue;
          const parsed = parseZbaText(text, s.meetingMonth, s.meetingDate);
          for (const a of parsed) {
            if (!seenApprovals.has(a.caseNumber)) {
              seenApprovals.add(a.caseNumber);
              rawApprovals.push(a);
            }
          }
          break;
        }
      }

      const [geocodedApprovals, geocodedUpcoming] = await Promise.all([
        geocodeItems(rawApprovals),
        geocodeItems(rawUpcoming),
      ]);

      cachedApprovals = geocodedApprovals;
      cachedUpcoming = geocodedUpcoming;
      lastFetchedAt = now;

      await saveToDb();
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function getZbaApprovals(ward: number): Promise<ZbaApproval[]> {
  await refreshCache();
  return cachedApprovals.filter(a => a.ward === ward);
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

// Clears the in-memory and DB cache, then forces a full re-fetch on the next call.
export async function forceRefreshZbaCache(): Promise<void> {
  try {
    // Delete all rows in the DB cache table
    const rows = await db.select({ id: zbaMonthlyCache.id }).from(zbaMonthlyCache);
    for (const row of rows) {
      await db.delete(zbaMonthlyCache).where(eq(zbaMonthlyCache.id, row.id));
    }
  } catch (err) {
    console.error('[ZBA] forceRefresh: DB clear failed:', (err as Error).message);
  }
  // Reset in-memory state
  cachedApprovals = [];
  cachedUpcoming = [];
  lastFetchedAt = 0;
  refreshPromise = null;
  console.log('[ZBA] forceRefresh: cache cleared, will re-fetch on next request');
  // Trigger fresh fetch immediately
  await refreshCache();
}
