const ASSESSOR_UNIVERSE = 'https://datacatalog.cookcountyil.gov/resource/c49d-89sn.json';
const SALE_HISTORY = 'https://datacatalog.cookcountyil.gov/resource/wvhk-k5uv.json';

const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
const TARGET_YEARS = [2022, 2023, 2024, 2025];

// Cook County assessor township_name → town_code (hardcoded from empirical testing)
const TOWNSHIP_TO_CODE: Record<string, string> = {
  'Hyde Park':     '70',
  'Jefferson':     '71',
  'Lake':          '72',
  'Lake View':     '73',
  'North Chicago': '74',
  'Rogers Park':   '75',
  'South Chicago': '76',
  'West Chicago':  '77',
  // suburban townships that appear in Chicago property_city results
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

// All Chicago assessor town_codes used for sale history filtering
const CHICAGO_TOWN_CODES = Object.values(TOWNSHIP_TO_CODE);

export interface YearSnapshot {
  year: number;
  singleFamily: number;
  unit2to4: number;
  condo: number;
  commercial: number;
  total: number;
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
  ranking: {
    rank: number;
    totalZips: number;
    mostRecentYear: number;
    totalTransactions: number;
  };
}

type CatKey = 'singleFamily' | 'unit2to4' | 'condo' | 'commercial';

function classifyClass(cls: string): CatKey | null {
  const n = parseInt(cls, 10);
  if ([202, 203, 205, 207, 208, 209].includes(n)) return 'singleFamily';
  if ([211, 212, 213, 214, 215, 218].includes(n)) return 'unit2to4';
  if ([297, 298, 299].includes(n)) return 'condo';
  if (n >= 300 && n < 400) return 'commercial';
  return null;
}

async function soqlFetch(url: string): Promise<any[]> {
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Socrata HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error('Non-array response from Socrata');
  return data;
}

// Global sale-history cache: nbhd (5-digit) → year → category counts
type NbhdCounts = Record<CatKey, number>;
type NbhdYearMap = Map<number, NbhdCounts>;

interface SaleHistoryCache {
  nbhdData: Map<string, NbhdYearMap>;
  fetchedAt: number;
}

let saleHistCache: SaleHistoryCache | null = null;
let saleHistPromise: Promise<void> | null = null;

// Per-ZIP nbhd cache: zip → list of 5-digit sale_history nbhds
const zipNbhdCache = new Map<string, { nbhds: string[]; fetchedAt: number }>();
// Per-ZIP totals for ranking: zip → year → total
const zipTotalsCache = new Map<string, Map<number, number>>();

async function buildSaleHistCache(): Promise<void> {
  if (saleHistCache && Date.now() - saleHistCache.fetchedAt < CACHE_TTL) return;
  if (saleHistPromise) return saleHistPromise;

  saleHistPromise = (async () => {
    try {
      console.log('[TransactionTrends] Fetching Chicago sale history...');

      const townFilter = CHICAGO_TOWN_CODES.map(tc => `township_code='${tc}'`).join(' OR ');
      const url =
        `${SALE_HISTORY}?$select=year,nbhd,class,count(*)+as+cnt` +
        `&$where=sale_date>='2022-01-01'` +
        `+AND+sale_filter_less_than_10k=false` +
        `+AND+sale_filter_deed_type=false` +
        `+AND+(${encodeURIComponent(townFilter)})` +
        `&$group=year,nbhd,class&$limit=200000`;

      const saleRows = await soqlFetch(url);

      const nbhdData = new Map<string, NbhdYearMap>();
      for (const row of saleRows) {
        const year = Math.round(parseFloat(row.year));
        if (!TARGET_YEARS.includes(year)) continue;
        const cat = classifyClass(row.class as string);
        if (!cat) continue;
        const cnt = parseInt(row.cnt, 10) || 0;
        const nbhd = String(row.nbhd || '');
        if (!nbhdData.has(nbhd)) nbhdData.set(nbhd, new Map());
        const ym = nbhdData.get(nbhd)!;
        if (!ym.has(year)) ym.set(year, { singleFamily: 0, unit2to4: 0, condo: 0, commercial: 0 });
        ym.get(year)![cat] += cnt;
      }

      saleHistCache = { nbhdData, fetchedAt: Date.now() };
      console.log(`[TransactionTrends] Sale history cache: ${nbhdData.size} nbhds`);
    } catch (err) {
      console.error('[TransactionTrends] Sale history cache failed:', (err as Error).message);
    } finally {
      saleHistPromise = null;
    }
  })();

  return saleHistPromise;
}

async function getNbhdsForZip(zip: string): Promise<string[]> {
  const cached = zipNbhdCache.get(zip);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) return cached.nbhds;

  try {
    // Query assessor universe for this ZIP's (township_name, nbhd) combinations
    // No $group — dedup in JS (much faster than server-side grouping)
    const rows = await soqlFetch(
      `${ASSESSOR_UNIVERSE}?$select=township_name,nbhd` +
      `&$where=property_zip+like+'${zip}%25'+AND+property_city='CHICAGO'` +
      `&$limit=500`
    );

    const seen = new Set<string>();
    const nbhds: string[] = [];
    for (const row of rows) {
      const tc = TOWNSHIP_TO_CODE[row.township_name as string];
      if (!tc) continue;
      const nbhdPadded = String(row.nbhd || '').padStart(3, '0');
      const saleHistNbhd = tc + nbhdPadded;
      if (!seen.has(saleHistNbhd)) { seen.add(saleHistNbhd); nbhds.push(saleHistNbhd); }
    }

    zipNbhdCache.set(zip, { nbhds, fetchedAt: Date.now() });
    console.log(`[TransactionTrends] ZIP ${zip}: ${nbhds.length} nbhds -> ${nbhds.join(', ')}`);
    return nbhds;
  } catch (err) {
    console.error(`[TransactionTrends] getNbhdsForZip(${zip}) failed:`, (err as Error).message);
    return [];
  }
}

function computeZipTotals(zip: string, nbhds: string[], nbhdData: Map<string, NbhdYearMap>): Map<number, number> {
  const yearTotals = new Map<number, number>();
  for (const nbhd of nbhds) {
    const ym = nbhdData.get(nbhd);
    if (!ym) continue;
    for (const [year, cats] of ym) {
      const t = cats.singleFamily + cats.unit2to4 + cats.condo + cats.commercial;
      yearTotals.set(year, (yearTotals.get(year) || 0) + t);
    }
  }
  zipTotalsCache.set(zip, yearTotals);
  return yearTotals;
}

function pctChange(prev: number, curr: number): number | null {
  if (!prev) return null;
  return Math.round(((curr - prev) / prev) * 1000) / 10;
}

export async function getTransactionTrends(zip: string): Promise<TransactionTrendsResult | null> {
  // Kick off both in parallel: sale history (global) and nbhd mapping (per-ZIP)
  const [, nbhds] = await Promise.all([buildSaleHistCache(), getNbhdsForZip(zip)]);

  if (!saleHistCache) return null;

  const { nbhdData } = saleHistCache;

  // Aggregate counts for this ZIP across all years
  const yearMap = new Map<number, NbhdCounts>();
  for (const y of TARGET_YEARS) yearMap.set(y, { singleFamily: 0, unit2to4: 0, condo: 0, commercial: 0 });

  for (const nbhd of nbhds) {
    const ym = nbhdData.get(nbhd);
    if (!ym) continue;
    for (const [year, cats] of ym) {
      if (!yearMap.has(year)) continue;
      const yd = yearMap.get(year)!;
      yd.singleFamily += cats.singleFamily;
      yd.unit2to4 += cats.unit2to4;
      yd.condo += cats.condo;
      yd.commercial += cats.commercial;
    }
  }

  const years: YearSnapshot[] = TARGET_YEARS.map(year => {
    const c = yearMap.get(year)!;
    return {
      year,
      singleFamily: c.singleFamily,
      unit2to4: c.unit2to4,
      condo: c.condo,
      commercial: c.commercial,
      total: c.singleFamily + c.unit2to4 + c.condo + c.commercial,
    };
  });

  const yoyChanges: YoYChange[] = years.map((curr, i) => {
    if (i === 0) return { singleFamily: null, unit2to4: null, condo: null, commercial: null, total: null };
    const prev = years[i - 1];
    return {
      singleFamily: pctChange(prev.singleFamily, curr.singleFamily),
      unit2to4: pctChange(prev.unit2to4, curr.unit2to4),
      condo: pctChange(prev.condo, curr.condo),
      commercial: pctChange(prev.commercial, curr.commercial),
      total: pctChange(prev.total, curr.total),
    };
  });

  // Ranking: compute totals for this ZIP and rank vs other cached ZIPs
  const thisZipTotals = computeZipTotals(zip, nbhds, nbhdData);
  const mostRecentYear = TARGET_YEARS.slice().reverse().find(y => (yearMap.get(y)?.singleFamily || 0) + (yearMap.get(y)?.condo || 0) > 0) ?? TARGET_YEARS[TARGET_YEARS.length - 1];
  const thisZipTotal = thisZipTotals.get(mostRecentYear) ?? 0;

  const allZipTotals: Array<{ zip: string; total: number }> = [];
  for (const [z, ytMap] of zipTotalsCache) {
    const t = ytMap.get(mostRecentYear) ?? 0;
    if (t > 0) allZipTotals.push({ zip: z, total: t });
  }
  allZipTotals.sort((a, b) => b.total - a.total);
  const rank = allZipTotals.findIndex(z => z.zip === zip) + 1;

  return {
    zip,
    years,
    yoyChanges,
    ranking: {
      rank: rank || allZipTotals.length + 1,
      totalZips: allZipTotals.length,
      mostRecentYear,
      totalTransactions: thisZipTotal,
    },
  };
}
