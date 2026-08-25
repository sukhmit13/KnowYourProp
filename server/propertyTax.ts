import { db } from './db';
import { propertyTaxCache } from '@shared/schema';
import { eq } from 'drizzle-orm';
import type { PropertyTaxResult, TaxYearEntry } from '@shared/schema';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

const CACHE_DURATION_DAYS = 7;

const workspaceBrowsersPath = path.join(process.cwd(), 'playwright-browsers');
const playwrightEnv = existsSync(workspaceBrowsersPath)
  ? { PLAYWRIGHT_BROWSERS_PATH: workspaceBrowsersPath }
  : {};
const TREASURER_CACHE_DURATION_DAYS = 90;
const BUILDING_CHARS_API = 'https://datacatalog.cookcountyil.gov/resource/x54s-btds.json';
const ASSESSED_VALUES_API = 'https://datacatalog.cookcountyil.gov/resource/uzyt-m557.json';

function normalizePin(pin: string): string {
  return pin.replace(/[^0-9]/g, '');
}

function formatPin(pin: string): string {
  const p = normalizePin(pin);
  if (p.length === 14) {
    return `${p.slice(0,2)}-${p.slice(2,4)}-${p.slice(4,7)}-${p.slice(7,10)}-${p.slice(10)}`;
  }
  return pin;
}

function buildTreasurerUrl(pin: string): string {
  const formattedPin = formatPin(pin);
  return `https://www.cookcountytreasurer.com/setsearchparameters.aspx?mode=PIN&searchpin=${formattedPin}&isBusiness=false`;
}

function buildAssessorUrl(pin: string): string {
  const normalizedPin = normalizePin(pin);
  return `https://www.cookcountyassessor.com/pin/${normalizedPin}`;
}

interface BuildingCharsRecord {
  pin: string;
  year: string;
  card?: string;
  class?: string;
  pin_is_multicard?: boolean;
  pin_num_cards?: string;
  char_land_sf?: string;
  char_bldg_sf?: string;
  char_type_resd?: string;
  char_use?: string;
  char_apts?: string;
  char_bsmt?: string;
  char_attic_type?: string;
  char_yrblt?: string;
}

function parseStoriesFromType(typeResd: string | undefined): number | null {
  if (!typeResd) return null;
  const lower = typeResd.toLowerCase();
  if (lower.includes('1.5 story')) return 1.5;
  if (lower.includes('1 story')) return 1;
  if (lower.includes('2 story')) return 2;
  if (lower.includes('3 story')) return 3;
  if (lower.includes('split level')) return 2;
  return null;
}

interface AssessedValuesRecord {
  pin: string;
  year: string;
  class?: string;
}

interface PropertyData {
  taxYear: number | null;
  propertyClass: string | null;
  landSquareFeet: number | null;
  buildingSquareFeet: number | null;
  buildingType: string | null;
  buildingUse: string | null;
  apartments: string | null;
  basement: string | null;
  attic: string | null;
  yearBuilt: number | null;
  stories: number | null;
  success: boolean;
  isMultiCard: boolean;
  numCards: number;
}

interface TreasurerData {
  totalAnnualTaxAmount: number | null;
  paymentStatus: 'current' | 'delinquent' | 'sold' | 'unknown';
  taxYears: TaxYearEntry[];
  mailingOwnerName: string | null;
}

function hasUsableTreasurerData(data: TreasurerData | null | undefined): data is TreasurerData {
  if (!data) return false;
  return data.paymentStatus !== 'unknown'
    || data.totalAnnualTaxAmount !== null
    || data.taxYears.length > 0;
}

function getCachedTreasurerData(cached: any): TreasurerData | null {
  if (!cached?.paymentStatus) return null;
  const taxYears = (cached.taxYearsJson as TaxYearEntry[] | null) ?? [];
  return {
    totalAnnualTaxAmount: cached.totalAnnualTaxAmount
      ? parseFloat(String(cached.totalAnnualTaxAmount))
      : null,
    paymentStatus: cached.paymentStatus as TreasurerData['paymentStatus'],
    taxYears,
    mailingOwnerName: cached.ownerName ?? null,
  };
}

function extractMailingOwnerName(_bodyText: string): string | null {
  // The Cook County Treasurer page shows only the mailing address (street + city),
  // not the taxpayer/owner name. Attempting to parse a name from this page
  // reliably captures navigation text instead. Owner name comes from the
  // Cook County Recorder deed grantee lookup (via lien search).
  return null;
}

const TREASURER_SEARCH_URL = 'https://www.cookcountytreasurer.com/setsearchparameters.aspx';

async function scrapeTreasurerData(pin: string): Promise<TreasurerData> {
  const formattedPin = formatPin(pin);

  // Spawn Playwright scraper as a separate child process to avoid issues
  // with Playwright's browser process when launched from within Express
  return new Promise((resolve) => {
    const scriptPath = path.join(path.dirname(new URL(import.meta.url).pathname), 'treasurer-scraper.mjs');

    // Use a clean environment without tsx/loader hooks that would interfere with the
    // standalone .mjs script's Playwright execution
    const cleanEnv: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (v !== undefined) cleanEnv[k] = v;
    }

    // Strip tsx loader hooks from NODE_OPTIONS that would be inherited by the child
    // tsx uses --require and --import flags which interfere with standalone .mjs scripts
    delete cleanEnv.NODE_OPTIONS;

    // Point Playwright to the workspace-local browser binaries installed during build
    Object.assign(cleanEnv, playwrightEnv);

    console.log('Treasurer: spawning scraper process for', formattedPin);
    const child = spawn(process.execPath, [scriptPath, formattedPin], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 240000,
      env: cleanEnv,
      detached: true,
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    child.on('close', (code: number) => {
      if (stderr) console.log('Treasurer scraper stderr:', stderr.substring(0, 500));
      console.log('Treasurer: scraper process exited with code', code, '| stdout length:', stdout.length);
      try {
        const result = JSON.parse(stdout);
        if (result.error) {
          console.error('Treasurer: scraper error:', result.error);
          resolve({ totalAnnualTaxAmount: null, paymentStatus: 'unknown', taxYears: [], mailingOwnerName: null });
        } else if (result.bodyText) {
          resolve(parseTreasurerText(result.bodyText));
        } else {
          resolve({ totalAnnualTaxAmount: null, paymentStatus: 'unknown', taxYears: [], mailingOwnerName: null });
        }
      } catch (e: any) {
        console.error('Treasurer: failed to parse scraper output:', e.message, stdout.substring(0, 200));
        resolve({ totalAnnualTaxAmount: null, paymentStatus: 'unknown', taxYears: [], mailingOwnerName: null });
      }
    });

    child.on('error', (err: Error) => {
      console.error('Treasurer: failed to spawn scraper:', err.message);
      resolve({ totalAnnualTaxAmount: null, paymentStatus: 'unknown', taxYears: [], mailingOwnerName: null });
    });
  });
}

// Used by Market Discovery only. This deliberately bypasses the individual
// property-tax cache so a pilot scan cannot overwrite or refresh report data.
export async function scrapeTreasurerDataUncached(pin: string): Promise<TreasurerData> {
  return scrapeTreasurerData(pin);
}

// Derive paymentStatus from taxYears — used by both the parser and cache-read path
// so that cached data with stale status values is always recomputed correctly.
function derivePaymentStatus(
  taxYears: TaxYearEntry[],
  isSold: boolean,
  hasDelinquentKeyword: boolean = false,
): TreasurerData['paymentStatus'] {
  if (isSold) return 'sold';
  // Only full years (both installments billed) count toward delinquency.
  // 1st-installment-only years (e.g. TY2025 not due until Apr 1) are not yet delinquent.
  const pastDueDue = taxYears
    .filter(y => y.installment2 > 0)
    .reduce((sum, y) => sum + y.amountDue, 0);
  if (pastDueDue > 0 || hasDelinquentKeyword) return 'delinquent';
  if (taxYears.length > 0) return 'current';
  return 'unknown';
}

function parseTreasurerText(bodyText: string): TreasurerData {
  const taxYears: TaxYearEntry[] = [];

  // Extract only the "Are Your Taxes Paid?" section to avoid nav menu false matches
  const paymentsSection = (() => {
    const start = bodyText.indexOf('Are Your Taxes Paid?');
    const end = bodyText.indexOf('20-Year Property Tax Bill History');
    if (start === -1) return bodyText;
    return end === -1 ? bodyText.slice(start) : bodyText.slice(start, end);
  })();

  // Match each tax year block: "Tax Year YYYY (billed in YYYY)"
  // Lookahead requires the full header format (preceded by \n) to avoid stopping early at
  // installment labels like "1st INSTALLMENT - Tax Year 2024" within the block.
  const yearBlockRegex = /Tax Year (\d{4}) \(billed in \d{4}\)\s*Total Amount Billed:\s*\$([0-9,]+\.?\d*)([\s\S]*?)(?=\nTax Year \d{4} \(billed in \d{4}\)|$)/g;
  let match;

  while ((match = yearBlockRegex.exec(paymentsSection)) !== null) {
    const year = parseInt(match[1], 10);
    const billed = parseFloat(match[2].replace(/,/g, ''));
    const block = match[3];

    // Parse installments - original billed amount per installment
    const inst1Match = block.match(/1st INSTALLMENT[\s\S]*?Original Billed Amount:\s*\$([0-9,]+\.?\d*)/);
    const inst2Match = block.match(/2nd INSTALLMENT[\s\S]*?Original Billed Amount:\s*\$([0-9,]+\.?\d*)/);
    const installment1 = inst1Match ? parseFloat(inst1Match[1].replace(/,/g, '')) : 0;
    const installment2 = inst2Match ? parseFloat(inst2Match[1].replace(/,/g, '')) : 0;

    // Check for DELINQUENT watermark in this block
    const hasDelinquent = /DELINQUENT/i.test(block);

    // Strategy 1: find year-level "Total Amount Due:" (last occurrence)
    const totalDueMatches = [...block.matchAll(/Total Amount Due:\s*\$([0-9,]+\.?\d*)/g)];
    let amountDue = totalDueMatches.length > 0
      ? parseFloat(totalDueMatches[totalDueMatches.length - 1][1].replace(/,/g, ''))
      : 0;

    // Strategy 2: fallback — sum "Current Amount Due:" per installment (present in every installment block)
    if (amountDue === 0) {
      const currentDueMatches = [...block.matchAll(/Current Amount Due:\s*\$([0-9,]+\.?\d*)/g)];
      const currentDueSum = currentDueMatches.reduce((sum, m) => sum + parseFloat(m[1].replace(/,/g, '')), 0);
      if (currentDueSum > 0) amountDue = currentDueSum;
    }

    // Strategy 3: if DELINQUENT watermark present but still no amount, derive from installment current dues
    if (amountDue === 0 && hasDelinquent) {
      // Parse Current Amount Due per each installment section
      const inst1DueMatch = block.match(/1st INSTALLMENT[\s\S]*?Current Amount Due:\s*\$([0-9,]+\.?\d*)/);
      const inst2DueMatch = block.match(/2nd INSTALLMENT[\s\S]*?Current Amount Due:\s*\$([0-9,]+\.?\d*)/);
      const inst1Due = inst1DueMatch ? parseFloat(inst1DueMatch[1].replace(/,/g, '')) : 0;
      const inst2Due = inst2DueMatch ? parseFloat(inst2DueMatch[1].replace(/,/g, '')) : 0;
      amountDue = inst1Due + inst2Due;
    }

    let status: TaxYearEntry['status'];
    if (hasDelinquent && amountDue > 0) {
      status = amountDue < billed ? 'partial' : 'unpaid';
    } else if (amountDue === 0 && billed > 0) {
      status = 'paid';
    } else if (amountDue > 0 && amountDue < billed) {
      status = 'partial';
    } else if (amountDue >= billed && billed > 0) {
      status = 'unpaid';
    } else {
      status = 'unknown';
    }

    taxYears.push({ year, billed, installment1, installment2, amountDue, status });
  }

  // Sort by year descending
  taxYears.sort((a, b) => b.year - a.year);

  const mostRecentBill = taxYears[0]?.billed ?? null;

  // Check if taxes were sold — look in the "Sold Taxes" section specifically
  const soldSection = (() => {
    const idx = bodyText.indexOf('SOLD TAXES');
    return idx !== -1 ? bodyText.slice(idx, idx + 500).toLowerCase() : '';
  })();
  const hasSoldIndicator =
    /your taxes have been sold|scavenger/i.test(soldSection) &&
    !/have not been sold/i.test(soldSection);

  // Also detect DELINQUENT keyword anywhere in the payments section as a safety net
  const hasDelinquentKeyword = /DELINQUENT/i.test(paymentsSection);

  const paymentStatus = derivePaymentStatus(taxYears, hasSoldIndicator, hasDelinquentKeyword);
  const mailingOwnerName = extractMailingOwnerName(bodyText);

  return { totalAnnualTaxAmount: mostRecentBill, paymentStatus, taxYears, mailingOwnerName };
}

async function fetchBuildingCharacteristics(pin: string): Promise<PropertyData> {
  const normalizedPin = normalizePin(pin);

  try {
    const params = new URLSearchParams();
    params.set('pin', normalizedPin);
    params.set('$order', 'year DESC, card ASC');
    params.set('$limit', '10');

    const url = `${BUILDING_CHARS_API}?${params.toString()}`;
    console.log('Fetching building characteristics:', url);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    let response: Response;
    try {
      response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        signal: controller.signal,
      });
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        console.error('Building characteristics API timeout after 10s');
      } else {
        console.error('Building characteristics fetch error:', fetchError.message);
      }
      return await fetchAssessedValuesOnly(normalizedPin);
    }
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`Building characteristics API error: ${response.status}`);
      return await fetchAssessedValuesOnly(normalizedPin);
    }

    const data: BuildingCharsRecord[] = await response.json();
    console.log('Building characteristics response count:', data.length);

    if (!Array.isArray(data) || data.length === 0) {
      console.log('No building characteristics found, trying assessed values API...');
      return await fetchAssessedValuesOnly(normalizedPin);
    }

    const mostRecentYear = data[0].year;
    const recordsForYear = data.filter(r => r.year === mostRecentYear);

    const primaryRecord = recordsForYear.find(r => r.card === '1.0' || r.card === '1') || recordsForYear[0];

    const isMultiCard = primaryRecord.pin_is_multicard === true || recordsForYear.length > 1;
    const numCards = primaryRecord.pin_num_cards
      ? parseInt(primaryRecord.pin_num_cards.replace('.0', ''), 10)
      : recordsForYear.length;

    const taxYear = primaryRecord.year ? parseInt(primaryRecord.year.replace('.0', ''), 10) : null;

    console.log(`Using primary record (card ${primaryRecord.card || '1'}) for PIN ${normalizedPin}, multicard: ${isMultiCard}, numCards: ${numCards}`);

    return {
      taxYear,
      propertyClass: primaryRecord.class || null,
      landSquareFeet: primaryRecord.char_land_sf ? parseFloat(primaryRecord.char_land_sf) : null,
      buildingSquareFeet: primaryRecord.char_bldg_sf ? parseFloat(primaryRecord.char_bldg_sf) : null,
      buildingType: primaryRecord.char_type_resd || null,
      buildingUse: primaryRecord.char_use || null,
      apartments: primaryRecord.char_apts || null,
      basement: primaryRecord.char_bsmt || null,
      attic: primaryRecord.char_attic_type || null,
      yearBuilt: primaryRecord.char_yrblt ? parseInt(primaryRecord.char_yrblt.replace('.0', ''), 10) : null,
      stories: parseStoriesFromType(primaryRecord.char_type_resd),
      success: true,
      isMultiCard,
      numCards,
    };
  } catch (err) {
    console.error('Error fetching building characteristics:', err);
    return getEmptyPropertyData();
  }
}

async function fetchAssessedValuesOnly(pin: string): Promise<PropertyData> {
  try {
    const params = new URLSearchParams();
    params.set('pin', pin);
    params.set('$order', 'year DESC');
    params.set('$limit', '1');

    const url = `${ASSESSED_VALUES_API}?${params.toString()}`;
    console.log('Fetching assessed values:', url);

    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return getEmptyPropertyData();
    }

    const data: AssessedValuesRecord[] = await response.json();

    if (!Array.isArray(data) || data.length === 0) {
      return getEmptyPropertyData();
    }

    const record = data[0];
    const taxYear = record.year ? parseInt(record.year, 10) : null;

    return {
      taxYear,
      propertyClass: record.class || null,
      landSquareFeet: null,
      buildingSquareFeet: null,
      buildingType: null,
      buildingUse: null,
      apartments: null,
      basement: null,
      attic: null,
      yearBuilt: null,
      stories: null,
      success: taxYear !== null,
      isMultiCard: false,
      numCards: 1,
    };
  } catch (err) {
    console.error('Error fetching assessed values:', err);
    return getEmptyPropertyData();
  }
}

// When the primary PIN has no building characteristics (e.g. a vacant lot that is one of
// several lots in a multi-lot parcel), scan adjacent address numbers on the same street
// for a sibling PIN that does have characteristics.  Returns the first match together with
// the sibling PIN and its street address so the UI can display the attribution.
async function tryCoParcelCharacteristics(
  address: string,
): Promise<{ data: PropertyData; pin: string; parsedAddress: string } | null> {
  const deadline = Date.now() + 15000; // 15s total budget for all co-parcel attempts
  try {
    const upper = address.toUpperCase().trim();
    const addrMatch = upper.match(
      /^(\d+)\s+(?:(N|S|E|W|NORTH|SOUTH|EAST|WEST)\.?\s+)?(.+?)(?:\s+(ST|STREET|AVE|AVENUE|BLVD|BOULEVARD|DR|DRIVE|RD|ROAD|CT|COURT|PL|PLACE|WAY|LN|LANE|TER|TERRACE|PKWY|PARKWAY|CIR|CIRCLE))?(?:,|\s|$)/i,
    );
    if (!addrMatch) return null;

    const houseNum = parseInt(addrMatch[1], 10);
    const rawDir = (addrMatch[2] || '').replace(/\./g, '').trim().toUpperCase();
    const DMAP: Record<string, string> = { NORTH: 'N', SOUTH: 'S', EAST: 'E', WEST: 'W', N: 'N', S: 'S', E: 'E', W: 'W' };
    const dir = DMAP[rawDir] || '';
    const streetName = (addrMatch[3] || '')
      .trim()
      .replace(/\s+(ST|STREET|AVE|AVENUE|BLVD|BOULEVARD|DR|DRIVE|RD|ROAD|CT|COURT|PL|PLACE|WAY|LN|LANE|TER|TERRACE|PKWY|PARKWAY|CIR|CIRCLE)$/i, '')
      .trim();

    const parity = houseNum % 2;
    // Closest first: ±2, then ±4
    const adjacentNums = [houseNum - 2, houseNum + 2, houseNum - 4, houseNum + 4]
      .filter(n => n > 0 && n % 2 === parity);

    const ASSESSOR_API = 'https://datacatalog.cookcountyil.gov/resource/c49d-89sn.json';

    for (const num of adjacentNums) {
      if (Date.now() > deadline) {
        console.log('[PROPERTY-TAX] Co-parcel deadline reached, giving up');
        break;
      }
      try {
        const streetQuery = dir ? `${num} ${dir} ${streetName}%` : `${num} %${streetName}%`;
        const params = new URLSearchParams({
          '$where': `property_address like '${streetQuery.replace(/'/g, "''")}' AND property_city = 'CHICAGO'`,
          '$limit': '3',
        });
        const resp = await fetch(`${ASSESSOR_API}?${params}`, {
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(5000),
        });
        if (!resp.ok) continue;
        const data = await resp.json();
        if (!Array.isArray(data) || data.length === 0) continue;

        const record = data[0];
        const siblingPin = ((record.pin || record.pin14 || '') as string).replace(/[^0-9]/g, '');
        if (!siblingPin || siblingPin.length !== 14) continue;

        const siblingChars = await fetchBuildingCharacteristics(siblingPin);
        if (siblingChars.success) {
          const parsedAddress = (record.property_address || `${num} ${dir ? dir + ' ' : ''}${streetName}`).trim();
          console.log(`[PROPERTY-TAX] Co-parcel fallback: characteristics from ${parsedAddress} (PIN ${siblingPin})`);
          return { data: siblingChars, pin: siblingPin, parsedAddress };
        }
      } catch (_) {}
    }
    return null;
  } catch (_) {
    return null;
  }
}

function getEmptyPropertyData(): PropertyData {
  return {
    taxYear: null,
    propertyClass: null,
    landSquareFeet: null,
    buildingSquareFeet: null,
    buildingType: null,
    buildingUse: null,
    apartments: null,
    basement: null,
    attic: null,
    yearBuilt: null,
    stories: null,
    success: false,
    isMultiCard: false,
    numCards: 1,
  };
}

async function updateCache(
  pin: string,
  data: PropertyData,
  treasurerData?: TreasurerData
): Promise<void> {
  const normalizedPin = normalizePin(pin);
  const treasurerBillUrl = buildTreasurerUrl(normalizedPin);
  const now = new Date();

  const existing = await db.select()
    .from(propertyTaxCache)
    .where(eq(propertyTaxCache.pin, normalizedPin))
    .limit(1);

  const existingTreasurer = getCachedTreasurerData(existing[0]);
  const shouldWriteTreasurer = !!treasurerData
    && (!hasUsableTreasurerData(existingTreasurer) || hasUsableTreasurerData(treasurerData));
  const treasurerFields = shouldWriteTreasurer && treasurerData
    ? {
        totalAnnualTaxAmount: treasurerData.totalAnnualTaxAmount !== null
          ? String(treasurerData.totalAnnualTaxAmount)
          : null,
        paymentStatus: treasurerData.paymentStatus,
        taxYearsJson: treasurerData.taxYears as any,
        treasurerScrapedAt: now,
        ...(treasurerData.mailingOwnerName ? { ownerName: treasurerData.mailingOwnerName } : {}),
      }
    : {};

  if (treasurerData && !shouldWriteTreasurer) {
    console.warn(`[TREASURER] Ignoring empty refresh for ${normalizedPin}; preserving the last verified tax bill.`);
  }

  if (existing.length > 0) {
    await db.update(propertyTaxCache)
      .set({
        taxYearMostRecent: data.taxYear,
        treasurerBillUrl,
        fetchedAt: now,
        lastSuccessfulFetchAt: data.success ? now : existing[0].lastSuccessfulFetchAt,
        ...treasurerFields,
      })
      .where(eq(propertyTaxCache.pin, normalizedPin));
  } else {
    await db.insert(propertyTaxCache).values({
      pin: normalizedPin,
      taxYearMostRecent: data.taxYear,
      treasurerBillUrl,
      lastSuccessfulFetchAt: data.success ? now : null,
      ...treasurerFields,
    });
  }
}

export function isTreasurerCacheStale(cached: any): boolean {
  if (!cached?.treasurerScrapedAt) return true;
  const scraped = new Date(cached.treasurerScrapedAt);
  const msSinceScraped = Date.now() - scraped.getTime();
  // If the scrape returned no useful data (failed CAPTCHA or scraping error), allow a retry
  // after 1 hour — but not sooner, to avoid an infinite scraping loop.
  const taxYearsJson = cached.taxYearsJson ?? cached.taxYears;
  const taxYears = Array.isArray(taxYearsJson) ? taxYearsJson : [];
  if (cached.paymentStatus === 'unknown' && taxYears.length === 0 && cached.totalAnnualTaxAmount === null) {
    const ONE_HOUR_MS = 60 * 60 * 1000;
    return msSinceScraped > ONE_HOUR_MS;
  }
  // Smart year-lag check: Cook County bills Tax Year N during year N+1.
  // If the most recent scraped year is more than 1 year behind the minimum
  // expected year (currentYear - 2), the cached data is outdated regardless
  // of how recently it was scraped — a new tax year has been billed since then.
  if (taxYears.length > 0) {
    const mostRecentCachedYear = Math.max(...taxYears.map((y: any) => y.year ?? 0));
    const currentYear = new Date().getFullYear();
    const minimumExpectedYear = currentYear - 2; // e.g. in 2026 we expect at least 2024
    if (mostRecentCachedYear < minimumExpectedYear) {
      console.log(`[TREASURER] Cache stale: most recent year ${mostRecentCachedYear} < expected ${minimumExpectedYear}`);
      return true;
    }
  }
  const staleAfter = new Date(Date.now() - TREASURER_CACHE_DURATION_DAYS * 24 * 60 * 60 * 1000);
  return scraped < staleAfter;
}

// Track PINs with an in-progress background scrape so we don't double-spawn
const backgroundScrapes = new Set<string>();

export async function getPropertyTax(pin: string, options: { forceRefresh?: boolean; address?: string } = {}): Promise<PropertyTaxResult> {
  const normalizedPin = normalizePin(pin);
  const treasurerBillUrl = buildTreasurerUrl(normalizedPin);
  const assessorUrl = buildAssessorUrl(normalizedPin);
  const now = new Date();

  const cached = await db.select()
    .from(propertyTaxCache)
    .where(eq(propertyTaxCache.pin, normalizedPin))
    .limit(1);

  const cachedData = cached[0];
  const needsTreasurerScrape = options.forceRefresh || isTreasurerCacheStale(cachedData);

  // Always fetch assessor data (fast Socrata call ~500ms — building sqft, land sqft, year built, etc.)
  let assessorData = await fetchBuildingCharacteristics(normalizedPin);
  let coParcelPin: string | undefined;
  let coParcelAddress: string | undefined;

  // If no characteristics found for the primary PIN and we have an address, try sibling lots.
  // This handles multi-lot properties where one lot is a vacant portion but an adjacent lot
  // carries the building record (e.g. an old grocery store + parking lot spanning two PINs).
  if (!assessorData.success && options.address) {
    const fallback = await tryCoParcelCharacteristics(options.address);
    if (fallback) {
      assessorData = fallback.data;
      coParcelPin = fallback.pin;
      coParcelAddress = fallback.parsedAddress;
    }
  }

  let finalTreasurer: TreasurerData | null = null;
  let treasurerDataToCache: TreasurerData | undefined;
  let isStaleResult = false;

  // For any non-forced scrape (stale cache OR first-time lookup), return immediately and
  // background-scrape the Treasurer so the page isn't blocked for 15-30 seconds.
  // Only a forced refresh (user clicked "Refresh") waits synchronously.
  const shouldBackgroundScrape = needsTreasurerScrape && !options.forceRefresh;

  if (shouldBackgroundScrape) {
    // Use whatever treasurer data we already have in cache (may be null for first-time lookups)
    const cachedTreasurer = getCachedTreasurerData(cachedData);
    if (cachedTreasurer) {
      finalTreasurer = {
        ...cachedTreasurer,
        paymentStatus: derivePaymentStatus(
          cachedTreasurer.taxYears,
          cachedTreasurer.paymentStatus === 'sold',
        ),
      };
      isStaleResult = true;
    }
    // For first-time lookups, finalTreasurer stays null — assessor data will still return

    // Kick off background scrape if one isn't already running for this PIN
    if (!backgroundScrapes.has(normalizedPin)) {
      backgroundScrapes.add(normalizedPin);
      const label = cachedData ? 'stale cache' : 'first-time lookup';
      console.log(`[TREASURER] Starting background scrape (${label}) for ${normalizedPin}`);
      scrapeTreasurerData(normalizedPin)
        .then(async (fresh) => {
          if (fresh) await updateCache(normalizedPin, assessorData, fresh);
          console.log(`[TREASURER] Background scrape complete for ${normalizedPin}`);
        })
        .catch(err => console.error(`[TREASURER] Background scrape failed for ${normalizedPin}:`, err.message))
        .finally(() => backgroundScrapes.delete(normalizedPin));
    }
  } else if (needsTreasurerScrape) {
    // forceRefresh only — synchronous scrape
    const scraped = await scrapeTreasurerData(normalizedPin).catch(err => {
      console.error('Treasurer scrape failed:', err.message);
      return null;
    });
    const cachedTreasurer = getCachedTreasurerData(cachedData);
    treasurerDataToCache = scraped ?? undefined;

    if (hasUsableTreasurerData(scraped)) {
      finalTreasurer = scraped;
    } else if (cachedTreasurer) {
      finalTreasurer = {
        ...cachedTreasurer,
        paymentStatus: derivePaymentStatus(
          cachedTreasurer.taxYears,
          cachedTreasurer.paymentStatus === 'sold',
        ),
      };
      isStaleResult = true;
    } else {
      finalTreasurer = scraped;
    }
  } else {
    // Cache is fresh — use it directly
    const cachedTreasurer = getCachedTreasurerData(cachedData);
    if (cachedTreasurer) {
      finalTreasurer = {
        ...cachedTreasurer,
        paymentStatus: derivePaymentStatus(
          cachedTreasurer.taxYears,
          cachedTreasurer.paymentStatus === 'sold',
        ),
      };
    }
  }

  // Only a newly fetched Treasurer result may update Treasurer fields. Cached data
  // is returned as-is so ordinary page loads cannot reset its verification timestamp.
  await updateCache(normalizedPin, assessorData, treasurerDataToCache);

  let apartmentsDisplay = assessorData.apartments;
  if (assessorData.isMultiCard && assessorData.numCards > 1) {
    apartmentsDisplay = `${assessorData.apartments || 'None'} (primary bldg of ${assessorData.numCards})`;
  }

  const baseResult: PropertyTaxResult = {
    pin: normalizedPin,
    taxYearMostRecent: assessorData.taxYear,
    treasurerBillUrl,
    fetchedAt: now.toISOString(),
    isStale: isStaleResult,
    source: finalTreasurer ? 'cook_county_treasurer' : 'cook_county_assessor',
    assessorUrl,
    // Treasurer data
    totalAnnualTaxAmount: finalTreasurer?.totalAnnualTaxAmount ?? null,
    paymentStatus: finalTreasurer?.paymentStatus ?? null,
    taxYears: finalTreasurer?.taxYears ?? [],
    treasurerScrapedAt: cachedData?.treasurerScrapedAt
      ? cachedData.treasurerScrapedAt.toISOString()
      : (needsTreasurerScrape && finalTreasurer ? now.toISOString() : null),
    // Assessor data
    landSquareFeet: assessorData.landSquareFeet,
    buildingSquareFeet: assessorData.buildingSquareFeet,
    buildingType: assessorData.buildingType,
    buildingUse: assessorData.buildingUse,
    apartments: apartmentsDisplay,
    basement: assessorData.basement,
    attic: assessorData.attic,
    yearBuilt: assessorData.yearBuilt,
    stories: assessorData.stories,
    propertyClass: assessorData.propertyClass,
    mailingOwnerName: finalTreasurer?.mailingOwnerName ?? cachedData?.ownerName ?? null,
    ...(coParcelPin ? { coParcelPin, coParcelAddress } : {}),
  };

  // Only flag as "not found" when no co-parcel fallback saved us
  if (!assessorData.success && !coParcelPin) {
    baseResult.error = 'Property not found in assessor database. This may be a commercial property or the PIN may be invalid.';
    baseResult.isStale = true;
  }

  return baseResult;
}

// Called at server startup to purge any cached records written when the Treasurer
// scraper failed (Playwright not installed) — those records have paymentStatus='unknown'
// and no tax years, so they'd be served stale for 90 days without this cleanup.
export async function clearBadTaxCacheRecords(): Promise<void> {
  try {
    const { and, isNull, eq, or, sql } = await import('drizzle-orm');
    const deleted = await db
      .delete(propertyTaxCache)
      .where(
        and(
          eq(propertyTaxCache.paymentStatus, 'unknown'),
          isNull(propertyTaxCache.totalAnnualTaxAmount),
          or(
            isNull(propertyTaxCache.taxYearsJson),
            sql`${propertyTaxCache.taxYearsJson}::text = '[]'`,
          ),
        ),
      )
      .returning();
    if (deleted.length > 0) {
      console.log(`[STARTUP] Cleared ${deleted.length} bad property tax cache record(s) (unknown/empty from failed scrapes)`);
    }
  } catch (err: any) {
    console.error('[STARTUP] Failed to clear bad tax cache records:', err.message);
  }
}
