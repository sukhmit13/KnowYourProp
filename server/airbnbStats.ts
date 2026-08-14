/**
 * Inside Airbnb Chicago data integration
 * Uses three files joined by listing ID:
 *   - visualisations/listings.csv  → neighbourhood, roomType, price, availability, reviews
 *   - data/listings.csv.gz         → bedrooms
 *   - visualisations/reviews.csv   → review dates for seasonal analysis
 * Cache: 7 days (data updates quarterly)
 */

import { createGunzip } from 'zlib';
import { Readable } from 'stream';

const SIMPLE_URL   = 'https://data.insideairbnb.com/united-states/il/chicago/2025-09-22/visualisations/listings.csv';
const DETAIL_URL   = 'https://data.insideairbnb.com/united-states/il/chicago/2025-09-22/data/listings.csv.gz';
const REVIEWS_URL  = 'https://data.insideairbnb.com/united-states/il/chicago/2025-09-22/visualisations/reviews.csv';
const DATA_DATE    = '2025-09-22';
const CACHE_TTL    = 7 * 24 * 60 * 60 * 1000;

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ---------- interfaces ----------

export interface AirbnbBedroomStats {
  label: string;
  count: number;
  pct: number;
  avgListedPrice: number;
  medianListedPrice: number;
  avgBookedNights: number;
  avgOccupancyPct: number;
}

export interface AirbnbRoomStats {
  count: number;
  pct: number;
  avgListedPrice: number;
  medianListedPrice: number;
  avgBookedNights: number;
  avgOccupancyPct: number;
  bedroomBreakdown?: AirbnbBedroomStats[];
}

export interface SeasonalMonth {
  month: string;       // "Jan" … "Dec"
  reviewCount: number;
  pct: number;         // % of rolling-12-month reviews
  index: number;       // relative to average (1.0 = average month)
}

export interface AirbnbNeighborhoodStats {
  neighbourhood: string;
  totalListings: number;
  hostCount: number;
  reviewsLastYear: number;
  entireHome: AirbnbRoomStats | null;
  privateRoom: AirbnbRoomStats | null;
  sharedRoom: AirbnbRoomStats | null;
  hotelRoom: AirbnbRoomStats | null;
  seasonal: SeasonalMonth[];
  peakMonths: string[];
  slowMonths: string[];
  dataDate: string;
  sourceUrl: string;
}

// ---------- raw parsed listing ----------

interface ParsedListing {
  id: string;
  neighbourhood: string;
  hostId: string;
  roomType: string;
  price: number;
  bedrooms: number | null;
  availability365: number;
  reviewsLtm: number;
  minNights: number;
}

interface AllData {
  listings: ParsedListing[];
  /** listing_id → month counts (0-indexed) for last 12 rolling months */
  reviewsByListing: Map<string, number[]>;
  fetchedAt: number;
}

let cache: AllData | null = null;

// ---------- helpers ----------

function parseCSVLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; }
    else if (c === ',' && !inQ) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

async function decompressGzip(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const gunzip = createGunzip();
    const readable = Readable.from(buffer);
    const chunks: Buffer[] = [];
    gunzip.on('data', (chunk: Buffer) => chunks.push(chunk));
    gunzip.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    gunzip.on('error', reject);
    readable.pipe(gunzip);
  });
}

function median(arr: number[]): number {
  if (!arr.length) return 0;
  const sorted = arr.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function validPrices(listings: ParsedListing[]): number[] {
  return listings.map(l => l.price).filter(p => p > 0 && p < 5000);
}

// ---------- data loading ----------

// Rolling 12-month window ending at DATA_DATE (Sep 2025)
// months[0] = Oct 2024, months[11] = Sep 2025
function dateToMonthIdx(dateStr: string): number | null {
  // dateStr: "YYYY-MM-DD"
  if (!dateStr || dateStr.length < 7) return null;
  const [yr, mo] = dateStr.split('-').map(Number);
  // Oct 2024 = idx 0, Nov 2024 = 1, …, Sep 2025 = 11
  const base = 2024 * 12 + 9; // Oct 2024 = month #
  const cur  = yr * 12 + (mo - 1);
  const idx  = cur - base;
  return idx >= 0 && idx < 12 ? idx : null;
}

async function loadAll(): Promise<AllData> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) return cache;

  console.log('[AIRBNB] Fetching all three Chicago data files in parallel...');
  const [simpleResp, detailResp, reviewsResp] = await Promise.all([
    fetch(SIMPLE_URL,  { headers: { 'User-Agent': 'ChicagoEligibilityScreener/1.0' }, signal: AbortSignal.timeout(30000) }),
    fetch(DETAIL_URL,  { headers: { 'User-Agent': 'ChicagoEligibilityScreener/1.0' }, signal: AbortSignal.timeout(60000) }),
    fetch(REVIEWS_URL, { headers: { 'User-Agent': 'ChicagoEligibilityScreener/1.0' }, signal: AbortSignal.timeout(60000) }),
  ]);
  if (!simpleResp.ok)  throw new Error(`Airbnb simple fetch ${simpleResp.status}`);
  if (!detailResp.ok)  throw new Error(`Airbnb detail fetch ${detailResp.status}`);
  if (!reviewsResp.ok) throw new Error(`Airbnb reviews fetch ${reviewsResp.status}`);

  const [simpleText, detailText, reviewsText] = await Promise.all([
    simpleResp.text(),
    detailResp.arrayBuffer().then(b => decompressGzip(Buffer.from(b))),
    reviewsResp.text(),
  ]);

  // --- Simple file: id → base listing fields ---
  const simpleLines = simpleText.split('\n');
  // cols: id(0),name(1),host_id(2),host_name(3),nb_group(4),neighbourhood(5),lat(6),lon(7),
  //       room_type(8),price(9),min_nights(10),reviews(11),last_review(12),
  //       reviews_per_month(13),host_listings(14),availability_365(15),reviews_ltm(16),license(17)
  const simpleMap = new Map<string, { neighbourhood: string; hostId: string; roomType: string; price: number; availability365: number; reviewsLtm: number; minNights: number }>();
  for (let i = 1; i < simpleLines.length; i++) {
    const line = simpleLines[i].trim();
    if (!line) continue;
    const cols = parseCSVLine(line);
    const id = cols[0]?.trim();
    const neighbourhood = cols[5]?.trim();
    if (!id || !neighbourhood) continue;
    simpleMap.set(id, {
      neighbourhood,
      hostId: cols[2]?.trim() || '',
      roomType: cols[8]?.trim() || '',
      price: parseFloat((cols[9] || '').replace(/[^\d.]/g, '')),
      availability365: parseInt(cols[15] || '365', 10),
      reviewsLtm: parseInt(cols[16] || '0', 10),
      minNights: parseInt(cols[10] || '1', 10),
    });
  }

  // --- Detail file: id → bedrooms ---
  const detailLines = detailText.split('\n');
  const detailHeader = detailLines[0].split(',');
  const bedrIdx = detailHeader.indexOf('bedrooms');
  const detIdIdx = detailHeader.indexOf('id');
  const bedroomMap = new Map<string, number | null>();
  for (let i = 1; i < detailLines.length; i++) {
    const line = detailLines[i].trim();
    if (!line) continue;
    const cols = parseCSVLine(line);
    const id = cols[detIdIdx]?.trim();
    if (!id) continue;
    const bedrRaw = cols[bedrIdx]?.trim();
    bedroomMap.set(id, bedrRaw && bedrRaw !== 'NA' ? parseInt(bedrRaw, 10) : null);
  }

  // --- Reviews file: listing_id → month counts ---
  const reviewsLines = reviewsText.split('\n');
  const reviewsByListing = new Map<string, number[]>();
  for (let i = 1; i < reviewsLines.length; i++) {
    const line = reviewsLines[i].trim();
    if (!line) continue;
    const comma = line.indexOf(',');
    if (comma < 0) continue;
    const listingId = line.slice(0, comma).trim();
    const dateStr   = line.slice(comma + 1).trim();
    const idx = dateToMonthIdx(dateStr);
    if (idx === null) continue;
    if (!reviewsByListing.has(listingId)) reviewsByListing.set(listingId, new Array(12).fill(0));
    reviewsByListing.get(listingId)![idx]++;
  }

  // --- Join ---
  const listings: ParsedListing[] = [];
  for (const [id, s] of simpleMap) {
    listings.push({
      id,
      neighbourhood: s.neighbourhood,
      hostId: s.hostId,
      roomType: s.roomType,
      price: s.price,
      bedrooms: bedroomMap.get(id) ?? null,
      availability365: s.availability365,
      reviewsLtm: s.reviewsLtm,
      minNights: s.minNights,
    });
  }

  cache = { listings, reviewsByListing, fetchedAt: Date.now() };
  console.log(`[AIRBNB] Cached ${listings.length} listings + ${reviewsByListing.size} review series`);
  return cache;
}

// ---------- stat builders ----------

function normalizeNeighbourhood(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function roomStats(
  listings: ParsedListing[],
  total: number,
  includeBedroomBreakdown = false,
): AirbnbRoomStats | null {
  if (!listings.length) return null;
  const prices = validPrices(listings);
  const avg = prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0;
  const avgBooked = Math.round(listings.reduce((a, l) => a + Math.max(0, 365 - l.availability365), 0) / listings.length);
  const avgOcc    = Math.round((avgBooked / 365) * 100);

  const stats: AirbnbRoomStats = {
    count: listings.length,
    pct: Math.round((listings.length / total) * 1000) / 10,
    avgListedPrice: avg,
    medianListedPrice: prices.length ? median(prices) : 0,
    avgBookedNights: avgBooked,
    avgOccupancyPct: avgOcc,
  };

  if (includeBedroomBreakdown) {
    const groups: Record<string, ParsedListing[]> = {};
    for (const l of listings) {
      let label: string;
      if (l.bedrooms === null || isNaN(l.bedrooms as number)) label = 'Unknown';
      else if (l.bedrooms === 0) label = 'Studio';
      else if (l.bedrooms === 1) label = '1 Bedroom';
      else if (l.bedrooms === 2) label = '2 Bedrooms';
      else if (l.bedrooms === 3) label = '3 Bedrooms';
      else label = '4+ Bedrooms';
      if (!groups[label]) groups[label] = [];
      groups[label].push(l);
    }

    const order = ['Studio', '1 Bedroom', '2 Bedrooms', '3 Bedrooms', '4+ Bedrooms'];
    stats.bedroomBreakdown = order
      .filter(label => groups[label]?.length)
      .map(label => {
        const grp = groups[label];
        const ps = validPrices(grp);
        const booked = Math.round(grp.reduce((a, l) => a + Math.max(0, 365 - l.availability365), 0) / grp.length);
        return {
          label,
          count: grp.length,
          pct: Math.round((grp.length / listings.length) * 1000) / 10,
          avgListedPrice: ps.length ? Math.round(ps.reduce((a, b) => a + b, 0) / ps.length) : 0,
          medianListedPrice: ps.length ? median(ps) : 0,
          avgBookedNights: booked,
          avgOccupancyPct: Math.round((booked / 365) * 100),
        };
      });
  }

  return stats;
}

function buildSeasonal(
  listingIds: Set<string>,
  reviewsByListing: Map<string, number[]>,
): { seasonal: SeasonalMonth[]; peakMonths: string[]; slowMonths: string[] } {
  // Aggregate month counts for this neighbourhood (Oct 2024 → Sep 2025, idx 0–11)
  const monthTotals = new Array(12).fill(0);
  for (const id of listingIds) {
    const series = reviewsByListing.get(id);
    if (!series) continue;
    for (let m = 0; m < 12; m++) monthTotals[m] += series[m];
  }
  const grandTotal = monthTotals.reduce((a, b) => a + b, 0);
  if (grandTotal === 0) return { seasonal: [], peakMonths: [], slowMonths: [] };

  const avgPerMonth = grandTotal / 12;

  // Map idx 0 = Oct 2024 → calendar months Oct(9)…Dec(11), Jan(0)…Sep(8)
  // We want to present Jan–Dec order for the UI
  const calendarMonths: SeasonalMonth[] = new Array(12);
  for (let idx = 0; idx < 12; idx++) {
    const calMonth = (idx + 9) % 12; // idx 0 → Oct = 9, idx 3 → Jan = 0
    calendarMonths[calMonth] = {
      month: MONTH_LABELS[calMonth],
      reviewCount: monthTotals[idx],
      pct: Math.round((monthTotals[idx] / grandTotal) * 1000) / 10,
      index: Math.round((monthTotals[idx] / avgPerMonth) * 100) / 100,
    };
  }

  const peakMonths  = calendarMonths.filter(m => m.index >= 1.25).sort((a,b) => b.index - a.index).slice(0, 3).map(m => m.month);
  const slowMonths  = calendarMonths.filter(m => m.index <= 0.75).sort((a,b) => a.index - b.index).slice(0, 3).map(m => m.month);

  return { seasonal: calendarMonths, peakMonths, slowMonths };
}

// ---------- main export ----------

export async function getAirbnbStats(communityArea: string): Promise<AirbnbNeighborhoodStats | null> {
  const { listings, reviewsByListing } = await loadAll();
  const targetNorm = normalizeNeighbourhood(communityArea);

  const matched = listings.filter(l => normalizeNeighbourhood(l.neighbourhood) === targetNorm);
  if (!matched.length) return null;

  const total = matched.length;
  const hosts = new Set(matched.map(l => l.hostId));
  const reviewsLtm = matched.reduce((a, b) => a + b.reviewsLtm, 0);
  const listingIds = new Set(matched.map(l => l.id));

  const { seasonal, peakMonths, slowMonths } = buildSeasonal(listingIds, reviewsByListing);

  return {
    neighbourhood: communityArea,
    totalListings: total,
    hostCount: hosts.size,
    reviewsLastYear: reviewsLtm,
    entireHome:  roomStats(matched.filter(l => l.roomType === 'Entire home/apt'), total, true),
    privateRoom: roomStats(matched.filter(l => l.roomType === 'Private room'), total),
    sharedRoom:  roomStats(matched.filter(l => l.roomType === 'Shared room'), total),
    hotelRoom:   roomStats(matched.filter(l => l.roomType === 'Hotel room'), total),
    seasonal,
    peakMonths,
    slowMonths,
    dataDate: DATA_DATE,
    sourceUrl: 'https://insideairbnb.com/chicago/',
  };
}
