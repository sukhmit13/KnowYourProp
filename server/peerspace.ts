/**
 * Peerspace hourly commercial space listings via Apify playwright-scraper
 * Actor: apify/playwright-scraper
 *
 * Architecture: fire-and-forget (same as crexi.ts)
 *   1. First request → start actor run, return status:'pending'
 *   2. Actor renders Peerspace's React SPA in headless Chrome (~90-120s)
 *   3. Frontend polls every 30s until run completes; results cached 7 days
 *
 * Proxy: Apify RESIDENTIAL (bypasses Cloudflare managed challenge)
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';

const CACHE_DIR = path.join(process.cwd(), 'server/cache');
const CACHE_FILE = path.join(CACHE_DIR, 'peerspace.json');
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_PENDING_TTL_MS = 3 * 60 * 60 * 1000;

const ACTOR_ID = 'apify~playwright-scraper';
const APIFY_BASE = 'https://api.apify.com/v2';

const MAX_LISTINGS = 15;

export interface PeerspaceListing {
  title: string | null;
  neighborhood: string | null;
  pricePerHour: number | null;
  capacity: number | null;
  activityTypes: string[];
  url: string | null;
  rating: number | null;
}

export interface PeerspaceResult {
  listings: PeerspaceListing[];
  count: number;
  avgPricePerHour: number | null;
  minPricePerHour: number | null;
  maxPricePerHour: number | null;
  searchUrl: string;
  fetchedAt: string;
  status: 'pending' | 'complete';
}

interface CacheEntry {
  result?: PeerspaceResult;
  pendingRunId?: string;
  pendingDatasetId?: string;
  ts: number;
}

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
  return `peerspace:${zipCode}`;
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function peerspaceSearchUrl(zipCode: string): string {
  return `https://www.peerspace.com/s/chicago--il/meeting?postal_code=${encodeURIComponent(zipCode)}`;
}

// The pageFunction string to execute in Apify's Playwright browser
// This scrapes Peerspace's React-rendered search results
const PAGE_FUNCTION = `
async function pageFunction({ page, request, log }) {
  try {
    log.info('Peerspace: waiting for listings to render...');

    // Wait for price text or a listing link to appear
    let rendered = false;
    const strategies = [
      async () => { await page.waitForFunction(() => document.body.innerText.includes('/hr'), { timeout: 25000 }); },
      async () => { await page.waitForSelector('a[href*="/r/listings/"]', { timeout: 25000 }); },
    ];

    for (const strategy of strategies) {
      try {
        await strategy();
        rendered = true;
        break;
      } catch {}
    }

    if (!rendered) {
      log.warning('Peerspace: page did not render listings in time');
      return [];
    }

    // Extra wait for lazy-loaded content
    await page.waitForTimeout(3000);

    const listings = await page.evaluate(() => {
      const results = [];

      // Strategy 1: Find all links to Peerspace listing pages
      const listingLinks = Array.from(document.querySelectorAll('a[href*="/r/listings/"]'));

      // Deduplicate by href
      const seenHrefs = new Set();
      const uniqueLinks = listingLinks.filter(a => {
        const href = a.getAttribute('href') || '';
        if (seenHrefs.has(href)) return false;
        seenHrefs.add(href);
        return true;
      });

      for (const link of uniqueLinks) {
        // Walk up the DOM to find the card container
        let card = link.closest('article') || link.closest('[class*="card"]') || link.closest('[class*="Card"]') || link.closest('[class*="listing"]') || link.closest('[class*="Listing"]') || link.closest('[class*="venue"]') || link.closest('[class*="Venue"]') || link.closest('[class*="result"]');

        if (!card) {
          // Walk up manually up to 8 levels
          let el = link.parentElement;
          for (let i = 0; i < 8 && el; i++) {
            const cls = el.className || '';
            const tag = el.tagName;
            if (tag === 'ARTICLE' || /card|Card|listing|Listing|venue|Venue|result|Result/i.test(cls)) {
              card = el;
              break;
            }
            // Also check if this element has significant height (card-like)
            const rect = el.getBoundingClientRect();
            if (rect.height > 100 && rect.width > 100) {
              card = el;
              break;
            }
            el = el.parentElement;
          }
        }

        if (!card) card = link.parentElement;
        const text = card ? card.innerText : (link.parentElement?.innerText || '');

        // Extract price per hour
        const priceMatch = text.match(/\\$(\\d+)(?:\\.\\d+)?\\s*\\/\\s*hr/i);
        const pricePerHour = priceMatch ? parseInt(priceMatch[1]) : null;

        // Extract capacity
        const capMatch = text.match(/(?:up to|max\\.?|capacity:?)\\s*(\\d+)\\s*(?:people|guests|attendees|person)?/i) ||
                         text.match(/(\\d+)\\s*(?:people|guests|attendees)/i);
        const capacity = capMatch ? parseInt(capMatch[1]) : null;

        // Extract title - look for heading elements within card
        const headings = card ? card.querySelectorAll('h1, h2, h3, h4, [class*="title"], [class*="Title"], [class*="name"], [class*="Name"]') : [];
        let title = null;
        for (const h of headings) {
          const t = h.textContent?.trim();
          if (t && t.length > 3 && t.length < 200 && !t.match(/\\$/)) {
            title = t;
            break;
          }
        }
        if (!title) {
          // Try link text
          const linkText = link.textContent?.trim();
          if (linkText && linkText.length > 3) title = linkText;
        }

        // Extract neighborhood
        const neighborhoodMatch = text.match(/^([A-Z][a-z]+(?: [A-Z][a-z]+)*),?\\s*Chicago/m);
        let neighborhood = null;
        if (neighborhoodMatch) {
          neighborhood = neighborhoodMatch[1].trim();
        } else {
          // Look for neighborhood in smaller text elements
          const smallEls = card ? card.querySelectorAll('p, span, [class*="location"], [class*="neighborhood"]') : [];
          for (const el of smallEls) {
            const t = el.textContent?.trim();
            if (t && t.length > 2 && t.length < 50 && /Chicago|neighborhood|IL/i.test(t)) {
              neighborhood = t.replace(/,?\\s*Chicago.*$/i, '').trim() || t;
              break;
            }
          }
        }

        // Extract activity types from badges/tags
        const activityTypes = [];
        const badges = card ? card.querySelectorAll('[class*="badge"], [class*="Badge"], [class*="tag"], [class*="Tag"], [class*="type"], [class*="Type"]') : [];
        for (const badge of badges) {
          const t = badge.textContent?.trim();
          if (t && t.length > 1 && t.length < 30) activityTypes.push(t);
        }

        // Extract rating
        const ratingMatch = text.match(/(\\d\\.\\d)\\s*(?:stars?|rating|out of 5)/i) ||
                            text.match(/rating[:\\s]+(\\d\\.\\d)/i);
        const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;

        // Build URL
        const href = link.getAttribute('href') || '';
        const url = href.startsWith('http') ? href : 'https://www.peerspace.com' + href;

        results.push({
          title,
          neighborhood,
          pricePerHour,
          capacity,
          activityTypes,
          url,
          rating,
        });
      }

      return results;
    });

    log.info('Peerspace: extracted ' + listings.length + ' raw listings');
    return listings;
  } catch (err) {
    log.error('Peerspace pageFunction error: ' + err.message);
    return [];
  }
}
`;

function buildResult(
  items: any[],
  fetchedAt: string,
  targetLat: number,
  targetLon: number,
): PeerspaceResult {
  const searchUrl = 'https://www.peerspace.com/s/chicago--il/meeting';

  // Filter: must have a price
  const priced = items.filter(l => l.pricePerHour && l.pricePerHour > 0);

  // Sort by price ascending
  priced.sort((a, b) => (a.pricePerHour || 999) - (b.pricePerHour || 999));

  const listings = priced.slice(0, MAX_LISTINGS).map((item): PeerspaceListing => ({
    title: item.title || null,
    neighborhood: item.neighborhood || null,
    pricePerHour: item.pricePerHour || null,
    capacity: item.capacity || null,
    activityTypes: Array.isArray(item.activityTypes) ? item.activityTypes : [],
    url: item.url || null,
    rating: item.rating || null,
  }));

  const prices = listings.map(l => l.pricePerHour).filter((p): p is number => p !== null);
  const avgPricePerHour = prices.length > 0
    ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
    : null;

  console.log(`[PEERSPACE] buildResult: ${listings.length} listings, avg $${avgPricePerHour}/hr`);

  return {
    listings,
    count: listings.length,
    avgPricePerHour,
    minPricePerHour: prices.length > 0 ? Math.min(...prices) : null,
    maxPricePerHour: prices.length > 0 ? Math.max(...prices) : null,
    searchUrl,
    fetchedAt,
    status: 'complete',
  };
}

async function startActorRun(zipCode: string, apiToken: string): Promise<{ runId: string; datasetId: string }> {
  const searchUrl = peerspaceSearchUrl(zipCode);

  const resp = await axios.post(
    `${APIFY_BASE}/acts/${ACTOR_ID}/runs?token=${apiToken}`,
    {
      startUrls: [{ url: searchUrl }],
      pageFunction: PAGE_FUNCTION,
      maxRequestsPerCrawl: 1,
      maxConcurrency: 1,
      proxyConfiguration: {
        useApifyProxy: true,
        apifyProxyGroups: ['RESIDENTIAL'],
      },
      launchContext: {
        useChrome: false,
        launcher: 'playwright',
        launchOptions: {
          headless: true,
        },
      },
      preNavigationHooks: `[
        async ({ page }) => {
          await page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9',
          });
        }
      ]`,
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
  console.log(`[PEERSPACE] Run ${runId} status: ${status}`);
  return { status, datasetId };
}

async function fetchDataset(datasetId: string, apiToken: string): Promise<any[]> {
  const resp = await axios.get(
    `${APIFY_BASE}/datasets/${datasetId}/items?token=${apiToken}&limit=200`,
    { timeout: 20000 },
  );
  const items = resp.data || [];
  // playwright-scraper nests result in the item itself
  const flattened: any[] = [];
  for (const item of items) {
    if (Array.isArray(item)) {
      flattened.push(...item);
    } else if (Array.isArray(item?.result)) {
      flattened.push(...item.result);
    } else if (item?.pricePerHour !== undefined) {
      flattened.push(item);
    }
  }
  return flattened;
}

// Cache-read-only accessor (for insight-report evidence). NEVER starts an
// Apify actor run. Returns the cached completed result at any age, or null.
export function readCachedPeerspace(zipCode: string): PeerspaceResult | null {
  const zip = (zipCode || '').trim();
  if (!zip) return null;
  const cached = loadCache()[cacheKey(zip)];
  if (!cached?.result || cached.result.status !== 'complete') return null;
  return cached.result;
}

export async function fetchPeerspaceData(
  lat: number,
  lon: number,
  zipCode: string,
): Promise<PeerspaceResult> {
  const zip = zipCode || '';
  const fetchedAt = new Date().toISOString();

  const emptyResult: PeerspaceResult = {
    listings: [], count: 0, avgPricePerHour: null,
    minPricePerHour: null, maxPricePerHour: null,
    searchUrl: 'https://www.peerspace.com/s/chicago--il/meeting',
    fetchedAt, status: 'pending',
  };

  if (!zip) return { ...emptyResult, status: 'complete' };

  const apiToken = process.env.APIFY_API_TOKEN;
  if (!apiToken) {
    console.log('[PEERSPACE] No APIFY_API_TOKEN — returning empty');
    return { ...emptyResult, status: 'complete' };
  }

  const cache = loadCache();
  const key = cacheKey(zip);
  const cached = cache[key];

  if (cached?.result) {
    const age = Date.now() - cached.ts;
    const ttl = cached.result.count === 0 ? 2 * 60 * 60 * 1000 : CACHE_TTL_MS;
    if (age < ttl) {
      console.log(`[PEERSPACE] Cache hit for ${key} (${cached.result.count} listings)`);
      return cached.result;
    }
    console.log(`[PEERSPACE] Cache stale for ${key}`);
  }

  if (cached?.pendingRunId) {
    const age = Date.now() - cached.ts;
    if (age < CACHE_PENDING_TTL_MS) {
      try {
        const { status, datasetId } = await checkRunStatus(cached.pendingRunId, apiToken);
        if (status === 'SUCCEEDED' || status === 'FINISHED') {
          const dsId = cached.pendingDatasetId || datasetId;
          const items = await fetchDataset(dsId, apiToken);
          console.log(`[PEERSPACE] Dataset returned ${items.length} raw items`);
          const result = buildResult(items, fetchedAt, lat, lon);
          cache[key] = { result, ts: Date.now() };
          saveCache(cache);
          return result;
        }
        if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
          console.log(`[PEERSPACE] Run ${cached.pendingRunId} ${status} — clearing pending`);
          delete cache[key];
          saveCache(cache);
        } else {
          return emptyResult;
        }
      } catch (err: any) {
        console.log(`[PEERSPACE] Pending run check error: ${err.message}`);
        return emptyResult;
      }
    } else {
      console.log(`[PEERSPACE] Pending entry expired — starting fresh`);
      delete cache[key];
    }
  }

  try {
    const { runId, datasetId } = await startActorRun(zip, apiToken);
    console.log(`[PEERSPACE] Started run ${runId} for ZIP ${zip}`);
    cache[key] = { pendingRunId: runId, pendingDatasetId: datasetId, ts: Date.now() };
    saveCache(cache);
  } catch (err: any) {
    console.log(`[PEERSPACE] Failed to start actor: ${err.message}`);
    return { ...emptyResult, status: 'complete' };
  }

  return emptyResult;
}
