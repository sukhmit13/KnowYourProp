/**
 * RentCast market data integration
 * - /v1/markets endpoint for ZIP-level stats (30 calls/month budget)
 * - /v1/listings/rental/long-term for radius-based listings
 *
 * Cache strategy: PostgreSQL rentcast_cache table (survives server restarts and redeployments)
 * - ZIP market data: 30-day TTL, keyed by ZIP code
 * - Radius listings: 30-day TTL, keyed to ~1km grid so nearby addresses share one entry
 */

import fs from 'fs';
import path from 'path';
import { pool } from './db';

const API_KEY  = process.env.RENTCAST_API_KEY || '';
const BASE_URL = 'https://api.rentcast.io/v1';

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// ---------- Types ----------

export interface BedroomRentData {
  bedrooms: number;
  label: string;
  avgRent: number;
  medianRent: number;
  minRent: number;
  maxRent: number;
  avgPricePerSqft: number | null;
  medianSqft: number | null;
  avgDaysOnMarket: number;
  totalListings: number;
  fmrComparison?: {
    fmr: number;
    marketVsFmrPct: number;
    tier: 'dated' | 'average' | 'nice' | 'luxury';
  };
}

export interface RentTrend {
  month: string;
  avgRent: number;
  medianRent: number;
  totalListings: number;
}

export interface QualityTier {
  tier: 'dated' | 'average' | 'nice' | 'luxury';
  label: string;
  description: string;
  premiumDesc: string;
  minRent: number;
  maxRent: number | null;
}

export interface RentcastMarketData {
  zipCode: string;
  lastUpdated: string;
  overall: {
    avgRent: number;
    medianRent: number;
    minRent: number;
    maxRent: number;
    avgPricePerSqft: number | null;
    avgDaysOnMarket: number;
    medianDaysOnMarket: number;
    totalListings: number;
  };
  byBedroom: BedroomRentData[];
  trend: RentTrend[];
  qualityTiers: QualityTier[];
  fetchedAt: number;
}

export interface RadiusRentData {
  lat: number;
  lng: number;
  radiusMiles: number;
  totalListings: number;
  overall: {
    avgRent: number;
    medianRent: number;
    minRent: number;
    maxRent: number;
    avgDaysOnMarket: number;
    medianDaysOnMarket: number;
  };
  byBedroom: BedroomRentData[];
  fetchedAt: number;
}

// ---------- DB cache ----------

async function getCached<T extends { fetchedAt: number }>(
  cacheType: string, key: string
): Promise<T | null> {
  try {
    const result = await pool.query(
      'SELECT data, fetched_at FROM rentcast_cache WHERE cache_key = $1 AND cache_type = $2 LIMIT 1',
      [key, cacheType]
    );
    const row = result.rows[0];
    if (!row) return null;
    const fetchedAt = Number(row.fetched_at);
    if (Date.now() - fetchedAt > CACHE_TTL_MS) return null;
    const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
    return { ...data, fetchedAt } as T;
  } catch (err: any) {
    console.warn('[RENTCAST CACHE] DB read error:', err.message);
    return null;
  }
}

async function setCached<T>(cacheType: string, key: string, value: T & { fetchedAt: number }): Promise<void> {
  try {
    const { fetchedAt, ...data } = value as any;
    await pool.query(
      `INSERT INTO rentcast_cache (cache_key, cache_type, data, fetched_at)
       VALUES ($1, $2, $3::jsonb, $4)
       ON CONFLICT (cache_key) DO UPDATE
         SET data = EXCLUDED.data, fetched_at = EXCLUDED.fetched_at, cache_type = EXCLUDED.cache_type`,
      [key, cacheType, JSON.stringify(data), fetchedAt]
    );
  } catch (err: any) {
    console.warn('[RENTCAST CACHE] DB write error:', err.message);
  }
}

// ---------- FMR loader ----------

let fmrCache: Record<string, any> | null = null;
function getFmrForZip(zipCode: string): Record<string, number> | null {
  if (!fmrCache) {
    try {
      fmrCache = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), 'server/data/chicago_fmr.json'), 'utf8')
      );
    } catch { fmrCache = {}; }
  }
  return fmrCache?.[zipCode] ?? null;
}

// ---------- Helpers ----------

const BEDROOM_LABELS: Record<number, string> = {
  0: 'Studio', 1: '1 Bedroom', 2: '2 Bedrooms',
  3: '3 Bedrooms', 4: '4 Bedrooms', 5: '5 Bedrooms',
};

function fmrForBedrooms(fmr: Record<string, number>, bedrooms: number): number | null {
  const map: Record<number, string> = {
    0: 'efficiency', 1: 'oneBed', 2: 'twoBed', 3: 'threeBed', 4: 'fourBed',
  };
  const key = map[bedrooms];
  return key ? fmr[key] ?? null : null;
}

function bedroomTier(median: number, fmr: number): 'dated' | 'average' | 'nice' | 'luxury' {
  const r = median / fmr;
  if (r < 0.85) return 'dated';
  if (r <= 1.15) return 'average';
  if (r <= 1.50) return 'nice';
  return 'luxury';
}

function buildQualityTiers(fmr2Bed: number): QualityTier[] {
  return [
    {
      tier: 'dated', label: 'Dated',
      description: 'Older units, basic finishes, may need updates',
      premiumDesc: '-15% to -30% below HUD FMR',
      minRent: Math.round(fmr2Bed * 0.70), maxRent: Math.round(fmr2Bed * 0.85),
    },
    {
      tier: 'average', label: 'Average',
      description: 'Standard finishes, functional condition',
      premiumDesc: '±15% of HUD FMR baseline',
      minRent: Math.round(fmr2Bed * 0.85), maxRent: Math.round(fmr2Bed * 1.15),
    },
    {
      tier: 'nice', label: 'Nice',
      description: 'Updated units, modern finishes, in-unit W/D, central AC',
      premiumDesc: '+15% to +50% above HUD FMR',
      minRent: Math.round(fmr2Bed * 1.15), maxRent: Math.round(fmr2Bed * 1.50),
    },
    {
      tier: 'luxury', label: 'Luxury',
      description: 'New construction, premium finishes, high-end amenities',
      premiumDesc: '+50% or more above HUD FMR',
      minRent: Math.round(fmr2Bed * 1.50), maxRent: null,
    },
  ];
}

function computeStats(prices: number[], doms: number[]) {
  const sorted = [...prices].sort((a, b) => a - b);
  const sortedDom = [...doms].sort((a, b) => a - b);
  return {
    avg: Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length),
    median: sorted[Math.floor(sorted.length / 2)],
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avgDom: Math.round(sortedDom.reduce((a, b) => a + b, 0) / sortedDom.length),
    medianDom: sortedDom[Math.floor(sortedDom.length / 2)],
  };
}

// ---------- ZIP-level market data ----------

export async function getRentcastMarket(zipCode: string): Promise<RentcastMarketData | null> {
  if (!API_KEY) { console.warn('[RENTCAST] No API key'); return null; }

  const cached = await getCached<RentcastMarketData>('market', zipCode);
  if (cached) {
    const ageDays = Math.round((Date.now() - cached.fetchedAt) / 86400000);
    console.log(`[RENTCAST] DB cache hit for ${zipCode} (${ageDays}d old)`);
    return cached;
  }

  try {
    console.log(`[RENTCAST] Fetching market data for ZIP ${zipCode}`);
    const res = await fetch(`${BASE_URL}/markets?zipCode=${zipCode}`, {
      headers: { 'X-Api-Key': API_KEY, 'accept': 'application/json' },
      signal: AbortSignal.timeout(15000),
    });

    if (res.status === 429) { console.warn('[RENTCAST] Rate limit hit'); return null; }
    if (!res.ok) { console.warn(`[RENTCAST] Error ${res.status} for ${zipCode}`); return null; }

    const raw = await res.json();
    const rd = raw.rentalData;
    if (!rd) return null;

    const fmr = getFmrForZip(zipCode);

    const byBedroom: BedroomRentData[] = (rd.dataByBedrooms ?? [])
      .filter((b: any) => b.bedrooms <= 5 && b.totalListings >= 3)
      .map((b: any) => {
        const fmrRent = fmr ? fmrForBedrooms(fmr, b.bedrooms) : null;
        return {
          bedrooms: b.bedrooms,
          label: BEDROOM_LABELS[b.bedrooms] ?? `${b.bedrooms} Bedrooms`,
          avgRent: Math.round(b.averageRent),
          medianRent: Math.round(b.medianRent),
          minRent: Math.round(b.minRent),
          maxRent: Math.round(b.maxRent),
          avgPricePerSqft: b.averageRentPerSquareFoot ? Math.round(b.averageRentPerSquareFoot * 100) / 100 : null,
          medianSqft: b.medianSquareFootage ?? null,
          avgDaysOnMarket: Math.round(b.averageDaysOnMarket),
          totalListings: b.totalListings,
          fmrComparison: fmrRent ? {
            fmr: fmrRent,
            marketVsFmrPct: Math.round(((b.medianRent - fmrRent) / fmrRent) * 100),
            tier: bedroomTier(b.medianRent, fmrRent),
          } : undefined,
        };
      });

    const historyEntries = Object.entries(rd.history ?? {}) as [string, any][];
    const trend: RentTrend[] = historyEntries
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 6)
      .map(([month, d]) => ({
        month,
        avgRent: Math.round(d.averageRent),
        medianRent: Math.round(d.medianRent),
        totalListings: d.totalListings,
      }));

    const fmr2Bed = fmr?.twoBed ?? rd.medianRent;

    const result: RentcastMarketData = {
      zipCode,
      lastUpdated: rd.lastUpdatedDate,
      overall: {
        avgRent: Math.round(rd.averageRent),
        medianRent: Math.round(rd.medianRent),
        minRent: Math.round(rd.minRent),
        maxRent: Math.round(rd.maxRent),
        avgPricePerSqft: rd.averageRentPerSquareFoot ? Math.round(rd.averageRentPerSquareFoot * 100) / 100 : null,
        avgDaysOnMarket: Math.round(rd.averageDaysOnMarket),
        medianDaysOnMarket: Math.round(rd.medianDaysOnMarket),
        totalListings: rd.totalListings,
      },
      byBedroom,
      trend,
      qualityTiers: buildQualityTiers(fmr2Bed),
      fetchedAt: Date.now(),
    };

    await setCached('market', zipCode, result);
    console.log(`[RENTCAST] Saved to DB cache for ${zipCode}: ${byBedroom.length} bedroom tiers`);
    return result;

  } catch (err: any) {
    console.error('[RENTCAST] Fetch error:', err.message);
    return null;
  }
}

// ---------- Radius-based rental listings ----------

/**
 * Cache key: lat/lng rounded to 2 decimal places (~1.1km grid cell).
 * Properties within the same ~1km block share one cached API call.
 */
function radiusCacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(2)},${lng.toFixed(2)}`;
}

export async function getRentcastRadius(
  lat: number,
  lng: number,
  zipCode?: string,
  radiusMiles = 0.75,
): Promise<RadiusRentData | null> {
  if (!API_KEY) return null;

  const key = radiusCacheKey(lat, lng);
  const cached = await getCached<RadiusRentData>('radius', key);
  if (cached) {
    const ageDays = Math.round((Date.now() - cached.fetchedAt) / 86400000);
    console.log(`[RENTCAST RADIUS] DB cache hit for ${key} (${ageDays}d old)`);
    return cached;
  }

  try {
    console.log(`[RENTCAST RADIUS] Fetching listings within ${radiusMiles}mi of ${lat},${lng} (key: ${key})`);
    const url = `${BASE_URL}/listings/rental/long-term?latitude=${lat}&longitude=${lng}&radius=${radiusMiles}&limit=500&status=Active`;
    const res = await fetch(url, {
      headers: { 'X-Api-Key': API_KEY, 'accept': 'application/json' },
      signal: AbortSignal.timeout(20000),
    });

    if (res.status === 429) { console.warn('[RENTCAST RADIUS] Rate limit'); return null; }
    if (!res.ok) { console.warn(`[RENTCAST RADIUS] Error ${res.status}`); return null; }

    const listings: any[] = await res.json();
    if (!Array.isArray(listings) || !listings.length) return null;

    const valid = listings.filter(l =>
      typeof l.price === 'number' && l.price >= 400 && l.price <= 15000
    );

    const fmr = zipCode ? getFmrForZip(zipCode) : null;

    const allPrices = valid.map(l => l.price);
    const allDoms   = valid.map(l => l.daysOnMarket ?? 30);
    const overall   = computeStats(allPrices, allDoms);

    const bedroomGroups = new Map<number, { prices: number[]; doms: number[]; sqfts: number[] }>();
    for (const l of valid) {
      const beds = typeof l.bedrooms === 'number' ? l.bedrooms : -1;
      if (beds < 0 || beds > 5) continue;
      if (!bedroomGroups.has(beds)) bedroomGroups.set(beds, { prices: [], doms: [], sqfts: [] });
      const g = bedroomGroups.get(beds)!;
      g.prices.push(l.price);
      g.doms.push(l.daysOnMarket ?? 30);
      if (l.squareFootage) g.sqfts.push(l.squareFootage);
    }

    const byBedroom: BedroomRentData[] = [];
    for (const [beds, g] of [...bedroomGroups.entries()].sort((a, b) => a[0] - b[0])) {
      if (g.prices.length < 2) continue;
      const stats   = computeStats(g.prices, g.doms);
      const medSqft = g.sqfts.length > 0
        ? [...g.sqfts].sort((a, b) => a - b)[Math.floor(g.sqfts.length / 2)]
        : null;
      const avgPsf   = medSqft && stats.median ? Math.round((stats.median / medSqft) * 100) / 100 : null;
      const fmrRent  = fmr ? fmrForBedrooms(fmr, beds) : null;

      byBedroom.push({
        bedrooms: beds,
        label: BEDROOM_LABELS[beds] ?? `${beds} Bedrooms`,
        avgRent: stats.avg,
        medianRent: stats.median,
        minRent: stats.min,
        maxRent: stats.max,
        avgPricePerSqft: avgPsf,
        medianSqft: medSqft,
        avgDaysOnMarket: stats.avgDom,
        totalListings: g.prices.length,
        fmrComparison: fmrRent ? {
          fmr: fmrRent,
          marketVsFmrPct: Math.round(((stats.median - fmrRent) / fmrRent) * 100),
          tier: bedroomTier(stats.median, fmrRent),
        } : undefined,
      });
    }

    const result: RadiusRentData = {
      lat, lng, radiusMiles,
      totalListings: valid.length,
      overall: {
        avgRent: overall.avg,
        medianRent: overall.median,
        minRent: overall.min,
        maxRent: overall.max,
        avgDaysOnMarket: overall.avgDom,
        medianDaysOnMarket: overall.medianDom,
      },
      byBedroom,
      fetchedAt: Date.now(),
    };

    await setCached('radius', key, result);
    console.log(`[RENTCAST RADIUS] Saved to DB cache for ${key}: ${valid.length} listings, ${byBedroom.length} bedroom groups`);
    return result;

  } catch (err: any) {
    console.error('[RENTCAST RADIUS] Error:', err.message);
    return null;
  }
}
