/**
 * LoopNet commercial lease market data via Apify actor
 * Actor: memo23~apify-loopnet-search-cheerio
 *
 * Architecture: fire-and-forget
 *   1. First request for a ZIP → start actor run, return status:'pending' immediately (~2s)
 *   2. Actor runs on Apify (~130s) in the background
 *   3. Frontend polls every 25s; when run completes, data is cached and returned
 *
 * Filtering / ranking:
 *   - Listings without a price are discarded
 *   - Same-corridor (street name match) listings ranked first
 *   - Expanding radius: start 0.5 mi, +0.25 mi until ≥5 listings or 3 mi limit
 *   - Cap: 25 listings returned
 *   - Cache: 7-day TTL for completed results
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';

const CACHE_DIR = path.join(process.cwd(), 'server/cache');
const CACHE_FILE = path.join(CACHE_DIR, 'crexi.json');
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_PENDING_TTL_MS = 3 * 60 * 60 * 1000;

const ACTOR_ID = 'memo23~apify-loopnet-search-cheerio';
const APIFY_BASE = 'https://api.apify.com/v2';

const MAX_LISTINGS = 10;
const MIN_LISTINGS_TARGET = 5;
const INITIAL_RADIUS_MI = 0.5;
const RADIUS_STEP_MI = 0.25;
const MAX_RADIUS_MI = 0.75;

export interface CrexiListing {
  address: string | null;
  sizeSqFt: number | null;
  pricePerSqFtYear: number | null;
  totalMonthly: number | null;
  leaseType: string | null;
  propertyType: string | null;
  onCorridor: boolean;
  distanceMiles: number | null;
}

export interface CrexiResult {
  listings: CrexiListing[];
  count: number;
  avgPricePerSqFtYear: number | null;
  medianSqFt: number | null;
  minSqFt: number | null;
  maxSqFt: number | null;
  radiusMilesUsed: number;
  corridorListingCount: number;
  fetchedAt: string;
  proxyUsed: 'residential' | 'direct' | null;
  /** 'pending' = actor still running, poll again; 'complete' = final answer */
  status: 'pending' | 'complete';
}

interface CacheEntry {
  result?: CrexiResult;
  pendingRunId?: string;
  pendingDatasetId?: string;
  ts: number;
}

// --- Cache ---

function loadCache(): Record<string, CacheEntry> {
  try {
    if (!fs.existsSync(CACHE_FILE)) return {};
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveCache(cache: Record<string, CacheEntry>) {
  try {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch {}
}

function cacheKey(zipCode: string): string {
  return `loopnet:${zipCode}`;
}

// --- Geo helpers ---

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Extract the primary street name from an address for corridor matching.
 * "2540 W North Ave, Chicago" → "NORTH"
 * "123 W Madison St #400"    → "MADISON"
 */
function extractStreetName(address: string): string {
  if (!address) return '';
  const upper = address.toUpperCase().replace(/[,#].*$/, '').trim();
  const parts = upper.split(/\s+/);
  let i = 0;
  // Skip leading house number
  if (/^\d/.test(parts[0] ?? '')) i++;
  // Skip directional prefix
  if (/^(N|S|E|W|NE|NW|SE|SW)$/.test(parts[i] ?? '')) i++;
  // Collect name tokens until street type
  const streetTypes = new Set(['AVE', 'ST', 'BLVD', 'DR', 'RD', 'LN', 'PL', 'CT', 'WAY', 'PKWY', 'HWY', 'EXPY', 'FWY', 'TER', 'CIR']);
  const nameTokens: string[] = [];
  while (i < parts.length && !streetTypes.has(parts[i])) {
    nameTokens.push(parts[i]);
    i++;
  }
  return nameTokens.join(' ').trim();
}

// --- LoopNet URL ---

function loopnetSearchUrl(zipCode: string): string {
  return `https://www.loopnet.com/search/commercial-real-estate/chicago-il-${zipCode}/for-lease/`;
}

// --- Price / sqft parsing ---

function parsePricePerSqFtYear(price: string | null | undefined, priceNumeric: number | null | undefined): number | null {
  if (price) {
    const str = price.toLowerCase().replace(/,/g, '');
    const numMatch = str.match(/[\d.]+/);
    if (numMatch) {
      const num = parseFloat(numMatch[0]);
      if (!isNaN(num) && num > 0) {
        if (str.includes('/sf') || str.includes('per sf') || str.includes('psf')) {
          const isMonthly = str.includes('/mo') || str.includes('month');
          return isMonthly ? Math.round(num * 12 * 100) / 100 : Math.round(num * 100) / 100;
        }
        if (str.includes('/mo') || str.includes('month')) return null;
        if (num >= 1 && num <= 500) return Math.round(num * 100) / 100;
      }
    }
  }
  if (priceNumeric != null && priceNumeric > 0 && priceNumeric <= 500) {
    return Math.round(priceNumeric * 100) / 100;
  }
  return null;
}

function parseSqFt(raw: any): number | null {
  if (raw == null) return null;
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/,/g, ''));
  if (isNaN(n) || n <= 0) return null;
  return Math.round(n);
}

function isForLease(listingType: string | null | undefined): boolean {
  if (!listingType) return false;
  const lt = listingType.toLowerCase();
  return lt.includes('lease') || lt.includes('rent');
}

// --- Build result from raw actor items ---

function buildResult(
  items: any[],
  fetchedAt: string,
  targetLat: number,
  targetLon: number,
  targetAddress: string,
): CrexiResult {
  const targetCorridor = extractStreetName(targetAddress);

  // 1. Map, require price, compute corridor + distance
  interface RankedItem {
    listing: CrexiListing;
    distanceMiles: number | null;
    onCorridor: boolean;
  }

  const ranked: RankedItem[] = [];

  for (const item of items) {
    if (!isForLease(item.listingType)) continue;

    const pricePerSqFtYear = parsePricePerSqFtYear(item.price ?? null, item.priceNumeric ?? null);
    if (!pricePerSqFtYear) continue; // Skip listings without a price

    const itemLat = item.lat ?? item.latitude ?? null;
    const itemLon = item.lon ?? item.longitude ?? null;
    const distanceMiles =
      typeof itemLat === 'number' && typeof itemLon === 'number' &&
      typeof targetLat === 'number' && typeof targetLon === 'number'
        ? Math.round(haversineDistance(targetLat, targetLon, itemLat, itemLon) * 100) / 100
        : null;

    const itemCorridor = extractStreetName(item.address ?? '');
    const onCorridor =
      targetCorridor.length > 2 && itemCorridor.length > 2 && itemCorridor === targetCorridor;

    const sizeSqFt = parseSqFt(item.squareFootage ?? item.buildingSize);
    let totalMonthly: number | null = null;
    if (pricePerSqFtYear && sizeSqFt) {
      totalMonthly = Math.round((pricePerSqFtYear * sizeSqFt) / 12);
    }

    ranked.push({
      listing: {
        address: item.address || null,
        sizeSqFt,
        pricePerSqFtYear,
        totalMonthly,
        leaseType: item.availability ?? null,
        propertyType: item.propertyType ?? item.propertyTypeDetailed ?? null,
        onCorridor,
        distanceMiles,
      },
      distanceMiles,
      onCorridor,
    });
  }

  // 2. Sort: corridor first, then by distance, then arbitrary
  ranked.sort((a, b) => {
    if (a.onCorridor !== b.onCorridor) return a.onCorridor ? -1 : 1;
    if (a.distanceMiles !== null && b.distanceMiles !== null) return a.distanceMiles - b.distanceMiles;
    if (a.distanceMiles !== null) return -1;
    if (b.distanceMiles !== null) return 1;
    return 0;
  });

  // 3. Expanding radius: start 0.5 mi, grow by 0.25 mi until ≥5 listings
  const hasDistances = ranked.some(r => r.distanceMiles !== null);
  let selected = ranked;
  let radiusMilesUsed = MAX_RADIUS_MI;

  if (hasDistances) {
    let radius = INITIAL_RADIUS_MI;
    while (radius <= MAX_RADIUS_MI) {
      const inRadius = ranked.filter(r => r.distanceMiles === null || r.distanceMiles <= radius);
      if (inRadius.length >= MIN_LISTINGS_TARGET) {
        selected = inRadius;
        radiusMilesUsed = radius;
        break;
      }
      radius = Math.round((radius + RADIUS_STEP_MI) * 100) / 100;
    }
    if (selected === ranked) {
      // Couldn't reach 5 within max radius — use everything we have
      selected = ranked;
      radiusMilesUsed = MAX_RADIUS_MI;
    }
  }

  // 4. Cap at 25
  const listings = selected.slice(0, MAX_LISTINGS).map(r => r.listing);
  const corridorListingCount = listings.filter(l => l.onCorridor).length;

  // 5. Compute stats
  const priced = listings.map(l => l.pricePerSqFtYear).filter((p): p is number => p !== null);
  const sized = listings.map(l => l.sizeSqFt).filter((s): s is number => s !== null);
  const avgPricePerSqFtYear =
    priced.length > 0
      ? Math.round((priced.reduce((a, b) => a + b, 0) / priced.length) * 100) / 100
      : null;
  const sortedSqFt = [...sized].sort((a, b) => a - b);
  const medianSqFt = sortedSqFt.length > 0 ? sortedSqFt[Math.floor(sortedSqFt.length / 2)] : null;

  console.log(
    `[LOOPNET] buildResult: ${listings.length} listings (${corridorListingCount} on corridor "${targetCorridor}"), radius=${radiusMilesUsed} mi`,
  );

  return {
    listings,
    count: listings.length,
    avgPricePerSqFtYear,
    medianSqFt,
    minSqFt: sized.length > 0 ? Math.min(...sized) : null,
    maxSqFt: sized.length > 0 ? Math.max(...sized) : null,
    radiusMilesUsed,
    corridorListingCount,
    fetchedAt,
    proxyUsed: 'residential',
    status: 'complete' as const,
  };
}

// --- Apify helpers ---

async function startActorRun(zip: string, apiToken: string): Promise<{ runId: string; datasetId: string }> {
  const resp = await axios.post(
    `${APIFY_BASE}/acts/${ACTOR_ID}/runs?token=${apiToken}`,
    {
      startUrls: [{ url: loopnetSearchUrl(zip) }],
      maxItems: 10,
      includeListingDetails: true,
      downloadImages: false,
      moreResults: false,
      proxy: { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'] },
    },
    { timeout: 30000 },
  );
  if (resp.data?.error) throw new Error(`Apify: ${resp.data.error.type} — ${resp.data.error.message}`);
  const runId = resp.data?.data?.id;
  const datasetId = resp.data?.data?.defaultDatasetId;
  if (!runId) throw new Error('No run ID from Apify');
  return { runId, datasetId };
}

async function checkRunStatus(runId: string, apiToken: string): Promise<{ status: string; datasetId: string }> {
  const resp = await axios.get(
    `${APIFY_BASE}/actor-runs/${runId}?token=${apiToken}`,
    { timeout: 15000 },
  );
  const status = resp.data?.data?.status ?? 'UNKNOWN';
  const datasetId = resp.data?.data?.defaultDatasetId ?? '';
  console.log(`[LOOPNET] Run ${runId} status: ${status}`);
  return { status, datasetId };
}

async function fetchDataset(datasetId: string, apiToken: string): Promise<any[]> {
  const resp = await axios.get(
    `${APIFY_BASE}/datasets/${datasetId}/items?token=${apiToken}&limit=100`,
    { timeout: 20000 },
  );
  return resp.data || [];
}

// --- Cache-read-only accessor (for insight-report evidence) ---
// NEVER triggers an Apify actor run. Returns the cached completed result at
// any age (stale market data is still useful evidence — fetchedAt is included),
// or null if nothing has been cached for this ZIP.
export function readCachedCrexi(zipCode: string): CrexiResult | null {
  const zip = (zipCode || '').trim();
  if (!zip) return null;
  const cached = loadCache()[cacheKey(zip)];
  if (!cached?.result || cached.result.status !== 'complete') return null;
  return cached.result;
}

// --- Main exported function ---

export async function fetchCrexiData(
  lat: number,
  lon: number,
  zipCode: string,
  address?: string,
): Promise<CrexiResult> {
  const zip = zipCode || '';
  const fetchedAt = new Date().toISOString();
  const targetAddress = address || '';

  const emptyResult: CrexiResult = {
    listings: [], count: 0, avgPricePerSqFtYear: null,
    medianSqFt: null, minSqFt: null, maxSqFt: null,
    radiusMilesUsed: 0, corridorListingCount: 0,
    fetchedAt, proxyUsed: null, status: 'pending',
  };

  if (!zip) return { ...emptyResult, status: 'complete' as const };

  const apiToken = process.env.APIFY_API_TOKEN;
  if (!apiToken) {
    console.log('[LOOPNET] No APIFY_API_TOKEN — returning empty');
    return { ...emptyResult, status: 'complete' as const };
  }

  const cache = loadCache();
  const key = cacheKey(zip);
  const cached = cache[key];

  // 1. Completed cache entry — serve if fresh
  if (cached?.result) {
    const age = Date.now() - cached.ts;
    const ttl = cached.result.count === 0 ? 2 * 60 * 60 * 1000 : CACHE_TTL_MS;
    if (age < ttl) {
      console.log(`[LOOPNET] Cache hit for ${key} (${cached.result.count} listings)`);
      return cached.result;
    }
    console.log(`[LOOPNET] Cache stale for ${key}`);
  }

  // 2. Pending run — check if done
  if (cached?.pendingRunId) {
    const age = Date.now() - cached.ts;
    if (age < CACHE_PENDING_TTL_MS) {
      try {
        const { status, datasetId } = await checkRunStatus(cached.pendingRunId, apiToken);
        if (status === 'SUCCEEDED' || status === 'FINISHED') {
          const dsId = cached.pendingDatasetId || datasetId;
          const items = await fetchDataset(dsId, apiToken);
          const result = buildResult(items, fetchedAt, lat, lon, targetAddress);
          cache[key] = { result, ts: Date.now() };
          saveCache(cache);
          return result;
        }
        if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
          console.log(`[LOOPNET] Run ${cached.pendingRunId} ${status} — clearing pending`);
          delete cache[key];
          saveCache(cache);
          // Fall through to start fresh
        } else {
          // Still running
          return emptyResult;
        }
      } catch (err: any) {
        console.log(`[LOOPNET] Pending run check error: ${err.message}`);
        return emptyResult;
      }
    } else {
      console.log(`[LOOPNET] Pending entry expired — starting fresh`);
      delete cache[key];
    }
  }

  // 3. No cache — fire actor and return empty immediately
  try {
    const { runId, datasetId } = await startActorRun(zip, apiToken);
    console.log(`[LOOPNET] Started run ${runId} for ZIP ${zip}`);
    cache[key] = { pendingRunId: runId, pendingDatasetId: datasetId, ts: Date.now() };
    saveCache(cache);
  } catch (err: any) {
    console.log(`[LOOPNET] Failed to start actor: ${err.message}`);
    return { ...emptyResult, status: 'complete' as const };
  }

  return emptyResult;
}
