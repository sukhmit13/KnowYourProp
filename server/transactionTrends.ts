const ASSESSOR_UNIVERSE = 'https://datacatalog.cookcountyil.gov/resource/c49d-89sn.json';
const SALE_HISTORY = 'https://datacatalog.cookcountyil.gov/resource/wvhk-k5uv.json';

const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
const TARGET_YEARS = [2022, 2023, 2024, 2025];
const SALE_FILTERS = "sale_filter_less_than_10k=false AND sale_filter_deed_type=false";
const CATEGORIES: CatKey[] = ['singleFamily', 'unit2to4', 'condo', 'commercial'];
const CLASS_TO_CATEGORY: Record<string, CatKey> = {
  // Explicitly identified as single-family residences in the current
  // Cook County class descriptions (208 is a townhouse parcel).
  '202': 'singleFamily',
  '203': 'singleFamily',
  '208': 'singleFamily',
  '209': 'singleFamily',
  '210': 'singleFamily',
  // 211 is explicitly a two-flat; 212 spans three-to-six flats and cannot
  // be reliably split into the 2–4 unit bucket from this class alone.
  '211': 'unit2to4',
  // Individual condominium property classes. Condo Association (215) is not
  // an individual unit and is intentionally left unclassified.
  '204': 'condo',
  '234': 'condo',
  '299': 'condo',
  // Explicit commercial and mixed-use classes; industrial, exempt-residential,
  // and unrecognized class codes are not folded into commercial by number range.
  '300': 'commercial',
  '313': 'commercial',
  '318': 'commercial',
  '390': 'commercial',
  '391': 'commercial',
  '399': 'commercial',
  '400': 'commercial',
  '401': 'commercial',
  '414': 'commercial',
  '478': 'commercial',
  '489': 'commercial',
  '499': 'commercial',
  '600': 'commercial',
};

// Cook County assessor township_name → town_code.
const TOWNSHIP_TO_CODE: Record<string, string> = {
  'Hyde Park':     '70',
  'Jefferson':     '71',
  'Lake':          '72',
  'Lake View':     '73',
  'North Chicago': '74',
  'Rogers Park':   '75',
  'South Chicago': '76',
  'West Chicago':  '77',
  'Norwood Park':  '26',
  'Stickney':      '27',
  'Cicero':        '29',
  'Calumet':       '24',
  'Leyden':        '20',
  'Maine':         '21',
  'Niles':         '22',
  'Elk Grove':     '12',
  'Thornton':      '30',
};

export interface YearSnapshot {
  year: number;
  singleFamily: number;
  unit2to4: number;
  condo: number;
  commercial: number;
  total: number;
  medianPrice?: Partial<Record<CatKey, number | null>>;
}

export interface YoYChange {
  singleFamily: number | null;
  unit2to4: number | null;
  condo: number | null;
  commercial: number | null;
  total: number | null;
}

export interface TransactionTrendsResult {
  zip: string;
  years: YearSnapshot[];
  yoyChanges: YoYChange[];
  isStale?: boolean;
  lastUpdated?: string;
}

export interface TransactionTrendsCache {
  read(zip: string): Promise<{ result: TransactionTrendsResult; fetchedAt: number } | null>;
  write(zip: string, result: TransactionTrendsResult, fetchedAt: number): Promise<void>;
}

type CatKey = 'singleFamily' | 'unit2to4' | 'condo' | 'commercial';
type NbhdCounts = Record<CatKey, number>;

export function classifyClass(cls: string): CatKey | null {
  return CLASS_TO_CATEGORY[String(cls).trim()] ?? null;
}

export function assessorNbhdToSaleHistoryKey(townshipName: string, nbhd: unknown): string | null {
  const townshipCode = TOWNSHIP_TO_CODE[townshipName];
  if (!townshipCode || nbhd == null || String(nbhd).trim() === '') return null;
  // Live Socrata records use a three-digit assessor nbhd in c49d-89sn and
  // the concatenated five-digit township+nbhd key in wvhk-k5uv.
  return townshipCode + String(nbhd).padStart(3, '0');
}

async function soqlFetch(url: string, stage: string): Promise<any[]> {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      const responseDetail = (await res.text()).slice(0, 500);
      throw new Error(`Socrata HTTP ${res.status}${responseDetail ? `: ${responseDetail}` : ''}`);
    }
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('Non-array response from Socrata');
    console.log(`[TransactionTrends] ${stage}: ${data.length} rows in ${Date.now() - start}ms`);
    return data;
  } catch (error) {
    console.error(`[TransactionTrends] ${stage} failed after ${Date.now() - start}ms:`, error);
    throw error;
  }
}

async function soqlFetchAll(url: string, stage: string): Promise<any[]> {
  const pageSize = 50000;
  const rows: any[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const pageUrl = `${url}&$limit=${pageSize}&$offset=${offset}`;
    const page = await soqlFetch(pageUrl, stage);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

// ZIP → assessor neighbourhood keys, cached independently for seven days.
const zipNbhdCache = new Map<string, { nbhds: string[]; fetchedAt: number }>();
const zipResultCache = new Map<string, { result: TransactionTrendsResult; fetchedAt: number }>();
const zipInflight = new Map<string, Promise<TransactionTrendsResult>>();
const zipRefreshInflight = new Map<string, Promise<TransactionTrendsResult>>();

async function getNbhdsForZip(zip: string): Promise<string[]> {
  const cached = zipNbhdCache.get(zip);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) return cached.nbhds;

  // Assessor property_zip often contains ZIP+4; equality on a five-digit ZIP
  // returns no rows. The bounded text range preserves the ZIP prefix match.
  const nextZip = String(Number(zip) + 1).padStart(5, '0');
  const zipFilter = zip === '99999'
    ? `property_zip like '${zip}%'`
    : `property_zip >= '${zip}' AND property_zip < '${nextZip}'`;
  const params = new URLSearchParams({
    '$select': 'township_name,nbhd',
    '$where': `${zipFilter} AND property_city='CHICAGO'`,
    '$group': 'township_name,nbhd',
    '$limit': '100',
  });
  const rows = await soqlFetch(`${ASSESSOR_UNIVERSE}?${params.toString()}`, `ZIP ${zip} neighborhoods`);
  const nbhds = [...new Set(rows
    .map((row) => assessorNbhdToSaleHistoryKey(String(row.township_name || ''), row.nbhd))
    .filter((nbhd): nbhd is string => nbhd !== null))];

  if (!nbhds.length) throw new Error(`No assessor neighborhoods were returned for ZIP ${zip}; sales cannot be scoped`);
  zipNbhdCache.set(zip, { nbhds, fetchedAt: Date.now() });
  console.log(`[TransactionTrends] ZIP ${zip}: ${nbhds.length} nbhds -> ${nbhds.join(', ')}`);
  return nbhds;
}

export function buildNbhdFilter(nbhds: string[]): string {
  return `nbhd in (${nbhds.map((nbhd) => `'${nbhd}'`).join(',')})`;
}

function blankCounts(): NbhdCounts {
  return { singleFamily: 0, unit2to4: 0, condo: 0, commercial: 0 };
}

export function aggregateCounts(rows: any[]): Map<number, NbhdCounts> {
  const counts = new Map<number, NbhdCounts>();
  for (const year of TARGET_YEARS) counts.set(year, blankCounts());
  for (const row of rows) {
    const year = Math.round(Number(row.year));
    const category = classifyClass(String(row.class || ''));
    if (!TARGET_YEARS.includes(year) || !category) continue;
    counts.get(year)![category] += Math.max(0, parseInt(String(row.cnt), 10) || 0);
  }
  return counts;
}

export function calculateMedianPrices(rows: Array<{ class?: unknown; sale_price?: unknown }>): Partial<Record<CatKey, number | null>> {
  const buckets: Record<CatKey, number[]> = {
    singleFamily: [],
    unit2to4: [],
    condo: [],
    commercial: [],
  };
  for (const row of rows) {
    const category = classifyClass(String(row.class || ''));
    if (row.sale_price == null || String(row.sale_price).trim() === '') continue;
    const price = Number(row.sale_price);
    if (category && Number.isFinite(price)) buckets[category].push(price);
  }

  const medians: Partial<Record<CatKey, number | null>> = {};
  for (const category of CATEGORIES) {
    const values = buckets[category].sort((a, b) => a - b);
    medians[category] = values.length
      ? (values.length % 2
        ? values[Math.floor(values.length / 2)]
        : (values[values.length / 2 - 1] + values[values.length / 2]) / 2)
      : null;
  }
  return medians;
}

function pctChange(prev: number, curr: number): number | null {
  if (!prev) return null;
  return Math.round(((curr - prev) / prev) * 1000) / 10;
}

async function fetchZipTrends(zip: string): Promise<TransactionTrendsResult> {
  const nbhds = await getNbhdsForZip(zip);
  const counts = new Map<number, NbhdCounts>(TARGET_YEARS.map((year) => [year, blankCounts()]));
  const latestCompleteYear = TARGET_YEARS.filter((year) => year < new Date().getFullYear()).at(-1);
  let medianPrices: Partial<Record<CatKey, number | null>> | undefined =
    latestCompleteYear === undefined ? undefined : calculateMedianPrices([]);

  if (nbhds.length) {
    const nbhdFilter = buildNbhdFilter(nbhds);
    const countParams = new URLSearchParams({
      '$select': 'year,nbhd,class,count(*) as cnt',
      '$where': `sale_date >= '${TARGET_YEARS[0]}-01-01' AND sale_date < '${TARGET_YEARS[TARGET_YEARS.length - 1] + 1}-01-01' AND ${SALE_FILTERS} AND ${nbhdFilter}`,
      '$group': 'year,nbhd,class',
    });
    const medianParams = latestCompleteYear === undefined ? null : new URLSearchParams({
      '$select': 'class,sale_price',
      '$where': `sale_date >= '${latestCompleteYear}-01-01' AND sale_date < '${latestCompleteYear + 1}-01-01' AND ${SALE_FILTERS} AND ${nbhdFilter}`,
    });
    const [saleRows, priceRows] = await Promise.all([
      soqlFetchAll(`${SALE_HISTORY}?${countParams.toString()}`, `ZIP ${zip} sale counts`),
      medianParams ? soqlFetchAll(`${SALE_HISTORY}?${medianParams.toString()}`, `ZIP ${zip} prices`) : Promise.resolve([]),
    ]);
    if (!saleRows.length) {
      throw new Error(`Cook County returned no sale-count rows for ZIP ${zip}; cannot confirm zero sales`);
    }
    const nbhdCounts = aggregateCounts(saleRows);
    for (const [year, yearCounts] of nbhdCounts) {
      for (const category of CATEGORIES) counts.get(year)![category] += yearCounts[category];
    }

    if (latestCompleteYear !== undefined) {
      medianPrices = calculateMedianPrices(priceRows);
    }
  }

  const years: YearSnapshot[] = TARGET_YEARS.map((year) => {
    const current = counts.get(year)!;
    const snapshot: YearSnapshot = {
      year,
      ...current,
      total: current.singleFamily + current.unit2to4 + current.condo + current.commercial,
    };
    if (year === latestCompleteYear && medianPrices) snapshot.medianPrice = medianPrices;
    return snapshot;
  });

  const yoyChanges = years.map((current, index): YoYChange => {
    if (index === 0) return { singleFamily: null, unit2to4: null, condo: null, commercial: null, total: null };
    const previous = years[index - 1];
    return {
      singleFamily: pctChange(previous.singleFamily, current.singleFamily),
      unit2to4: pctChange(previous.unit2to4, current.unit2to4),
      condo: pctChange(previous.condo, current.condo),
      commercial: pctChange(previous.commercial, current.commercial),
      total: pctChange(previous.total, current.total),
    };
  });

  return { zip, years, yoyChanges };
}

function refreshZip(zip: string, cache?: TransactionTrendsCache): Promise<TransactionTrendsResult> {
  const inflight = zipRefreshInflight.get(zip);
  if (inflight) return inflight;
  const requestedAt = Date.now();
  const request = fetchZipTrends(zip)
    .then(async (result) => {
      // Start time is the ordering key for overlapping refreshes across instances.
      const fetchedAt = requestedAt;
      zipResultCache.set(zip, { result, fetchedAt });
      if (cache) {
        try {
          await cache.write(zip, result, fetchedAt);
        } catch (error) {
          console.error(`[TransactionTrends] ZIP ${zip} could not save shared cache:`, error);
        }
      }
      return result;
    })
    .catch((error) => {
      console.error(`[TransactionTrends] ZIP ${zip} transaction trends failed:`, error);
      throw error;
    })
    .finally(() => zipRefreshInflight.delete(zip));
  zipRefreshInflight.set(zip, request);
  return request;
}

export async function getTransactionTrends(zip: string, cache?: TransactionTrendsCache): Promise<TransactionTrendsResult> {
  const cached = zipResultCache.get(zip);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) return cached.result;
  const inflight = zipInflight.get(zip);
  if (inflight) return inflight;

  const request = (async () => {
    let persisted: Awaited<ReturnType<TransactionTrendsCache['read']>> = null;
    try {
      persisted = cache ? await cache.read(zip) : null;
    } catch (error) {
      console.error(`[TransactionTrends] ZIP ${zip} shared cache read failed; using available source data:`, error);
      if (cached) {
        void refreshZip(zip, cache).catch(() => {});
        return {
          ...cached.result,
          isStale: true,
          lastUpdated: new Date(cached.fetchedAt).toISOString(),
        };
      }
      return refreshZip(zip, cache);
    }
    if (persisted) {
      const valid = persisted.result?.zip === zip
        && Array.isArray(persisted.result.years)
        && persisted.result.years.length === TARGET_YEARS.length
        && persisted.result.years.every((year, index) => year.year === TARGET_YEARS[index]);
      if (!valid) {
        console.error(`[TransactionTrends] ZIP ${zip} shared cache has an invalid response; fetching again`);
      } else if (Number.isFinite(persisted.fetchedAt)) {
        if (Date.now() - persisted.fetchedAt < CACHE_TTL) {
          zipResultCache.set(zip, persisted);
          return persisted.result;
        }
        // Answer immediately from the last successful source snapshot while
        // revalidating in the background. Never present it as live data.
        void refreshZip(zip, cache).catch(() => {});
        return {
          ...persisted.result,
          isStale: true,
          lastUpdated: new Date(persisted.fetchedAt).toISOString(),
        };
      }
    }
    return refreshZip(zip, cache);
  })()
    .finally(() => zipInflight.delete(zip));
  zipInflight.set(zip, request);
  return request;
}