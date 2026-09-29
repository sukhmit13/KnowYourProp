const CHARS_ENDPOINT = 'https://datacatalog.cookcountyil.gov/resource/bcnq-qi2z.json';
const SALES_ENDPOINT = 'https://datacatalog.cookcountyil.gov/resource/wvhk-k5uv.json';

const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
const compsCache = new Map<string, { data: CompsResult; ts: number }>();

export interface ComparableSale {
  pin: string;
  address: string;
  salePrice: number;
  saleDate: string;
  sqft: number | null;
  beds: number | null;
  fullBaths: number | null;
  halfBaths: number | null;
  lat: number;
  lng: number;
  distanceMiles: number;
  pricePerSqft: number | null;
  similarityScore: number;
  propertyClass: string;
  buyerName: string | null;
}

export interface MarketAnalysis {
  estimatedValue: number | null;
  medianSalePrice: number | null;
  medianPricePerSqft: number | null;
  priceRange: { low: number; high: number } | null;
  basedOnComps: number;
  confidence: 'High' | 'Medium' | 'Low' | 'None';
}

export interface CompsResult {
  comparables: ComparableSale[];
  marketAnalysis: MarketAnalysis;
  searchParams: { radiusMiles: number; monthsBack: number; propertyClass: string };
  totalCandidates: number;
  rawSalesCount: number; // Countywide rows in the recent-sales candidate sample (query limit applies).
  matchedCharacteristics: number; // Unique PINs in that sample with a characteristics row.
  geocodedSalesCount: number; // Candidate sales with matched characteristics and usable coordinates.
  nearbySalesCount: number; // Geocoded candidate sales within the selected search radius.
  error: string | null;
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function median(arr: number[]): number {
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

async function soqlFetch(url: string): Promise<any[]> {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`Socrata HTTP ${res.status}: ${url}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error('Unexpected response: ' + JSON.stringify(data).substring(0, 200));
  return data;
}

function emptyResult(propertyClass: string, radiusMiles: number, monthsBack: number, rawSalesCount = 0, matchedCharacteristics = 0, error: string | null = null): CompsResult {
  return {
    comparables: [],
    marketAnalysis: { estimatedValue: null, medianSalePrice: null, medianPricePerSqft: null, priceRange: null, basedOnComps: 0, confidence: 'None' },
    searchParams: { radiusMiles, monthsBack, propertyClass },
    totalCandidates: 0,
    rawSalesCount,
    matchedCharacteristics,
    geocodedSalesCount: 0,
    nearbySalesCount: 0,
    error,
  };
}

export async function getComparableSales(
  lat: number,
  lng: number,
  propertyClass: string,
  sqft: number | null,
  beds: number | null,
  baths: number | null,
  radiusMiles = 0.75,
  monthsBack = 18
): Promise<CompsResult> {
  const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)},${propertyClass}`;
  const cached = compsCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    console.log(`[COMPS] Cache hit for ${cacheKey}`);
    return cached.data;
  }

  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - monthsBack);
  const startDateStr = startDate.toISOString().split('T')[0];

  console.log(`[COMPS] Fetching sales for class=${propertyClass} since ${startDateStr}`);

  const salesWhere = `class='${propertyClass}' AND sale_date>'${startDateStr}T00:00:00' AND sale_filter_less_than_10k=false AND sale_price > 50000`;
  const salesUrl = `${SALES_ENDPOINT}?$select=${encodeURIComponent('pin,class,sale_date,sale_price,buyer_name,nbhd')}&$where=${encodeURIComponent(salesWhere)}&$order=${encodeURIComponent('sale_date DESC')}&$limit=500`;

  let salesData: any[];
  try {
    salesData = await soqlFetch(salesUrl);
  } catch (err) {
    console.error('[COMPS] Sales fetch error:', err);
    const message = err instanceof Error ? err.message : String(err);
    return emptyResult(propertyClass, radiusMiles, monthsBack, 0, 0, `Sales data could not be retrieved: ${message}`);
  }

  console.log(`[COMPS] ${salesData.length} raw sales for class ${propertyClass}`);

  if (salesData.length === 0) return emptyResult(propertyClass, radiusMiles, monthsBack, 0);

  const pins = [...new Set<string>(salesData.map((s: any) => s.pin))];

  const CHUNK = 80;
  const charsMap = new Map<string, any>();
  let charsFetchError: string | null = null;

  for (let i = 0; i < pins.length; i += CHUNK) {
    const chunk = pins.slice(i, i + CHUNK);
    const inClause = `pin in(${chunk.map(p => `"${p}"`).join(',')})`;
    const charsUrl = `${CHARS_ENDPOINT}?$select=${encodeURIComponent('pin,centroid_x,centroid_y,bldg_sf,beds,fbath,hbath,addr')}&$where=${encodeURIComponent(inClause)}&$order=${encodeURIComponent('tax_year DESC')}&$limit=${CHUNK * 3}`;

    try {
      const chars = await soqlFetch(charsUrl);
      for (const c of chars) {
        if (!charsMap.has(c.pin)) charsMap.set(c.pin, c);
      }
    } catch (err) {
      console.error(`[COMPS] Chars chunk ${i} error:`, err);
      if (!charsFetchError) {
        const message = err instanceof Error ? err.message : String(err);
        charsFetchError = `County characteristics could not be fully retrieved: ${message}`;
      }
    }
  }

  console.log(`[COMPS] Got characteristics for ${charsMap.size}/${pins.length} PINs`);

  // Pre-compute all candidates with their distances (no radius filter yet)
  const candidates: (ComparableSale & { _dist: number })[] = [];
  for (const sale of salesData) {
    const c = charsMap.get(sale.pin);
    if (!c) continue;
    const compLat = parseFloat(c.centroid_y);
    const compLng = parseFloat(c.centroid_x);
    if (!Number.isFinite(compLat) || !Number.isFinite(compLng)) continue;
    const dist = haversine(lat, lng, compLat, compLng);
    const compSqft = c.bldg_sf ? parseInt(c.bldg_sf) : null;
    const compBeds = c.beds ? parseInt(c.beds) : null;
    const compFBaths = c.fbath ? parseInt(c.fbath) : null;
    const compHBaths = c.hbath ? parseInt(c.hbath) : null;
    const salePrice = parseFloat(sale.sale_price) || 0;
    const pricePerSqft = compSqft && salePrice ? Math.round(salePrice / compSqft) : null;
    candidates.push({
      pin: sale.pin,
      address: c.addr ? titleCase(c.addr) : '',
      salePrice,
      saleDate: sale.sale_date,
      sqft: compSqft,
      beds: compBeds,
      fullBaths: compFBaths,
      halfBaths: compHBaths,
      lat: compLat,
      lng: compLng,
      distanceMiles: Math.round(dist * 100) / 100,
      pricePerSqft,
      similarityScore: 0, // computed below
      propertyClass: sale.class,
      buyerName: sale.buyer_name || null,
      _dist: dist,
    });
  }

  // Expand radius in 0.25 mi increments until at least 1 comp is found (max 3 mi)
  const MAX_RADIUS = 3.0;
  const RADIUS_STEP = 0.25;
  let searchRadius = radiusMiles;

  let joined: ComparableSale[] = [];
  while (searchRadius <= MAX_RADIUS) {
    const inRadius = candidates.filter(c => c._dist <= searchRadius);
    if (inRadius.length > 0 || searchRadius >= MAX_RADIUS) {
      // Score all comps within this radius
      joined = inRadius.map(comp => {
        let score = 100;
        // Distance penalty scales with radius — further = bigger penalty
        const distPenalty = comp._dist <= 0.25 ? 5
          : comp._dist <= 0.5 ? 10
          : comp._dist <= 0.75 ? 15
          : comp._dist <= 1.0 ? 20
          : comp._dist <= 1.5 ? 25
          : 30;
        score -= distPenalty;
        if (sqft && comp.sqft) {
          const pctDiff = Math.abs(sqft - comp.sqft) / sqft;
          score -= pctDiff * 40;
        }
        if (beds !== null && comp.beds !== null) score -= Math.abs(beds - comp.beds) * 8;
        if (baths !== null && comp.fullBaths !== null) score -= Math.abs(baths - comp.fullBaths) * 5;
        const daysOld = (Date.now() - new Date(comp.saleDate).getTime()) / 86400000;
        score -= (daysOld / 30) * 1.5;
        const { _dist, ...rest } = comp as any;
        return { ...rest, similarityScore: Math.max(0, Math.round(score)) };
      });
      searchRadius = Math.round(searchRadius * 100) / 100;
      break;
    }
    searchRadius = Math.round((searchRadius + RADIUS_STEP) * 100) / 100;
    console.log(`[COMPS] No comps within ${searchRadius - RADIUS_STEP} mi — expanding to ${searchRadius} mi`);
  }

  console.log(`[COMPS] ${joined.length} comps within ${searchRadius} mi`);

  joined.sort((a, b) => b.similarityScore - a.similarityScore);
  const topComps = joined.slice(0, 10);

  const prices = topComps.map(c => c.salePrice).filter(Boolean);
  const ppsfList = topComps.map(c => c.pricePerSqft).filter((v): v is number => v !== null);

  const medianPrice = prices.length ? median(prices) : null;
  const medianPpsf = ppsfList.length ? median(ppsfList) : null;
  const estimatedValue = medianPpsf && sqft ? Math.round((medianPpsf * sqft) / 1000) * 1000 : null;

  const avgScore = topComps.length ? topComps.reduce((s, c) => s + c.similarityScore, 0) / topComps.length : 0;
  const confidence: MarketAnalysis['confidence'] =
    topComps.length >= 5 && avgScore >= 55 ? 'High' :
    topComps.length >= 3 && avgScore >= 40 ? 'Medium' :
    topComps.length > 0 ? 'Low' : 'None';

  const result: CompsResult = {
    comparables: topComps,
    marketAnalysis: {
      estimatedValue,
      medianSalePrice: medianPrice,
      medianPricePerSqft: medianPpsf,
      priceRange: prices.length ? { low: Math.min(...prices), high: Math.max(...prices) } : null,
      basedOnComps: topComps.length,
      confidence,
    },
    searchParams: { radiusMiles: searchRadius, monthsBack, propertyClass },
    totalCandidates: joined.length,
    rawSalesCount: salesData.length,
    matchedCharacteristics: charsMap.size,
    geocodedSalesCount: candidates.length,
    nearbySalesCount: candidates.filter(c => c._dist <= searchRadius).length,
    error: charsFetchError,
  };

  compsCache.set(cacheKey, { data: result, ts: Date.now() });
  console.log(`[COMPS] Done — ${topComps.length} comps, confidence=${confidence}`);
  return result;
}

function titleCase(str: string): string {
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}
