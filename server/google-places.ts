/**
 * Competitive landscape via Google Places API (classic Text Search)
 *
 * Direct synchronous API call — results in ~200ms instead of 60-90s.
 * Cache: 7-day TTL for results, 2-hour TTL for zero-result sets.
 * Requires: GOOGLE_PLACES_API_KEY environment variable
 * Endpoint: https://maps.googleapis.com/maps/api/place/textsearch/json
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';

const CACHE_DIR = path.join(process.cwd(), 'server/cache');
const CACHE_FILE = path.join(CACHE_DIR, 'google-places.json');
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_ZERO_TTL_MS = 5 * 60 * 1000; // 5 minutes — don't persist "no results" for long
const MAX_RADIUS_MILES = 1.0;
const MAX_RADIUS_METERS = Math.round(MAX_RADIUS_MILES * 1609.34);

const PLACES_TEXT_SEARCH_URL =
  'https://maps.googleapis.com/maps/api/place/textsearch/json';

export interface GooglePlace {
  name: string;
  address: string | null;
  rating: number | null;
  reviewsCount: number | null;
  distanceMiles: number | null;
  url: string | null;
  phone: string | null;
}

export interface GooglePlacesResult {
  places: GooglePlace[];
  count: number;
  searchTerm: string;
  avgRating: number | null;
  fetchedAt: string;
  status: 'pending' | 'complete';
}

function cacheKey(lat: number, lon: number, searchTerm: string): string {
  const slug = searchTerm.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 50);
  return `${lat.toFixed(3)}_${lon.toFixed(3)}_${slug}`;
}

function loadCache(): Record<string, any> {
  try {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
    if (!fs.existsSync(CACHE_FILE)) return {};
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function saveCache(cache: Record<string, any>) {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch (e) {
    console.error('[GPLACES] Cache write error:', e);
  }
}

function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function buildResult(
  items: any[],
  lat: number,
  lon: number,
  searchTerm: string,
): GooglePlacesResult {
  const seen = new Set<string>();
  const places: GooglePlace[] = items
    .filter(item => !!item.name)
    .map(item => {
      const placeLat = item.geometry?.location?.lat ?? null;
      const placeLon = item.geometry?.location?.lng ?? null;
      const dist =
        placeLat != null && placeLon != null
          ? parseFloat(haversineMiles(lat, lon, placeLat, placeLon).toFixed(2))
          : null;
      const placeId = item.place_id ?? null;
      return {
        name: item.name,
        address: item.formatted_address ?? null,
        rating: item.rating ?? null,
        reviewsCount: item.user_ratings_total ?? null,
        distanceMiles: dist,
        url: placeId ? `https://www.google.com/maps/place/?q=place_id:${placeId}` : null,
        phone: null,
      };
    })
    .filter(p => p.distanceMiles === null || p.distanceMiles <= MAX_RADIUS_MILES)
    .sort((a, b) => (a.distanceMiles ?? 99) - (b.distanceMiles ?? 99))
    .filter(p => {
      const key = `${(p.name || '').trim().toUpperCase()}|${(p.address || '').trim().toUpperCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  const ratings = places.map(p => p.rating).filter((r): r is number => r !== null);
  const avgRating =
    ratings.length > 0
      ? parseFloat((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1))
      : null;

  return {
    places,
    count: places.length,
    searchTerm,
    avgRating,
    fetchedAt: new Date().toISOString(),
    status: 'complete',
  };
}

export async function fetchGooglePlacesData(
  lat: number,
  lon: number,
  searchTerm: string,
): Promise<GooglePlacesResult> {
  const fetchedAt = new Date().toISOString();
  const empty = (): GooglePlacesResult => ({
    places: [], count: 0, searchTerm, avgRating: null, fetchedAt, status: 'complete',
  });

  if (!searchTerm.trim()) return empty();

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.log('[GPLACES] No GOOGLE_PLACES_API_KEY — returning empty');
    return empty();
  }

  const cache = loadCache();
  const key = cacheKey(lat, lon, searchTerm);
  const cached = cache[key];

  if (cached?.result) {
    const age = Date.now() - cached.ts;
    const ttl = cached.result.count === 0 ? CACHE_ZERO_TTL_MS : CACHE_TTL_MS;
    if (age < ttl) {
      console.log(`[GPLACES] Cache hit for "${searchTerm}" (${cached.result.count} places)`);
      return cached.result;
    }
    console.log(`[GPLACES] Cache stale for "${searchTerm}"`);
  }

  try {
    console.log(`[GPLACES] Fetching "${searchTerm}" near ${lat.toFixed(4)},${lon.toFixed(4)}`);
    const resp = await axios.get(PLACES_TEXT_SEARCH_URL, {
      params: {
        query: searchTerm,
        location: `${lat},${lon}`,
        radius: MAX_RADIUS_METERS,
        key: apiKey,
      },
      timeout: 10000,
    });

    const { status, results } = resp.data;
    if (status !== 'OK' && status !== 'ZERO_RESULTS') {
      console.error(`[GPLACES] API returned status: ${status}`);
      return empty();
    }

    const items = results ?? [];
    console.log(`[GPLACES] Got ${items.length} results for "${searchTerm}"`);
    const result = buildResult(items, lat, lon, searchTerm);
    cache[key] = { result, ts: Date.now() };
    saveCache(cache);
    return result;
  } catch (err: any) {
    const msg = err.response?.data?.error_message ?? err.message;
    console.error(`[GPLACES] API error: ${msg}`);
    return empty();
  }
}
