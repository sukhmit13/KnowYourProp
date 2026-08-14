const CENSUS_2010_URL = 'https://data.cityofchicago.org/resource/kn9c-c2s2.json?$limit=100&$order=ca';
const ACS_2023_URL = "https://data.cityofchicago.org/resource/t68z-cikk.json?$limit=100&$where=acs_year='2023'";

const TTL_2010 = 1000 * 60 * 60 * 24 * 7;
const TTL_2023 = 1000 * 60 * 60 * 24;

interface CacheEntry<T> { data: T[]; ts: number }
let cache2010: CacheEntry<Raw2010Record> | null = null;
let cache2023: CacheEntry<Raw2023Record> | null = null;

interface Raw2010Record {
  ca: string;
  community_area_name: string;
  percent_of_housing_crowded?: string;
  percent_households_below_poverty?: string;
  percent_aged_16_unemployed?: string;
  percent_aged_25_without_high_school_diploma?: string;
  percent_aged_under_18_or_over_64?: string;
  per_capita_income_?: string;
  hardship_index?: string;
}

interface Raw2023Record {
  acs_year: string;
  community_area: string;
  under_25_000?: string;
  _25_000_to_49_999?: string;
  _50_000_to_74_999?: string;
  _75_000_to_125_000?: string;
  _125_000?: string;
  male_0_to_17?: string;
  male_18_to_24?: string;
  male_25_to_34?: string;
  male_35_to_49?: string;
  male_50_to_64?: string;
  male_65?: string;
  female_0_to_17?: string;
  female_18_to_24?: string;
  female_25_to_34?: string;
  female_35_to_49?: string;
  female_50_to_64?: string;
  female_65?: string;
  total_population?: string;
  white?: string;
  black_or_african_american?: string;
  american_indian_or_alaska?: string;
  asian?: string;
  native_hawaiin_or_pacific?: string;
  other_race?: string;
  multiracial?: string;
  white_not_hispanic_or_latino?: string;
  hispanic_or_latino?: string;
  record_id: string;
}

export interface TrendValue {
  year2010: number | null;
  year2023: number | null;
  percentChange: number | null;
  direction: 'up' | 'down' | 'stable' | null;
}

export interface TrendMetric {
  label: string;
  year2010: string;
  year2023: string;
  change: string;
  direction: 'up' | 'down' | 'stable';
  isPositive: boolean;
}

export interface ChartDataPoint {
  name: string;
  value2010: number | null;
  value2023: number | null;
}

export interface DemographicTrends {
  communityArea: string;
  dataSource: string;
  metrics: TrendMetric[];
  chartData: ChartDataPoint[];
}

const FETCH_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function load2010(): Promise<Raw2010Record[]> {
  if (cache2010 && Date.now() - cache2010.ts < TTL_2010) return cache2010.data;
  try {
    const res = await fetchWithTimeout(CENSUS_2010_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as Raw2010Record[];
    cache2010 = { data, ts: Date.now() };
    console.log(`Loaded 2010 census data for ${data.length} community areas from Chicago Data Portal`);
    return data;
  } catch (err) {
    console.error('Failed to fetch 2010 census data:', err);
    return cache2010?.data ?? [];
  }
}

async function load2023(): Promise<Raw2023Record[]> {
  if (cache2023 && Date.now() - cache2023.ts < TTL_2023) return cache2023.data;
  try {
    const res = await fetchWithTimeout(ACS_2023_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as Raw2023Record[];
    cache2023 = { data, ts: Date.now() };
    console.log(`Loaded 2023 ACS data for ${data.length} community areas from Chicago Data Portal`);
    return data;
  } catch (err) {
    console.error('Failed to fetch 2023 ACS data:', err);
    return cache2023?.data ?? [];
  }
}

// Warm the cache at startup so context-builder calls always find cached data
export function warmDemographicsCache(): void {
  load2010().catch(() => {});
  load2023().catch(() => {});
}

// Synchronous read of cached data only — never triggers a network fetch.
// Use this in run-creation flows where blocking is unacceptable.
export function getCachedDemographics(communityAreaName: string): { data2010: Raw2010Record | undefined; data2023: Raw2023Record | undefined } {
  const normalized = normalizeAreaName(communityAreaName);
  return {
    data2010: cache2010?.data.find(r => normalizeAreaName(r.community_area_name) === normalized),
    data2023: cache2023?.data.find(r => normalizeAreaName(r.community_area) === normalized),
  };
}

function normalizeAreaName(name: string): string {
  return name.toUpperCase().trim().replace(/'/g, "'");
}

function parseNum(val: string | undefined): number | null {
  if (!val) return null;
  const parsed = parseFloat(val);
  return isNaN(parsed) ? null : parsed;
}

function formatCurrency(val: number | null): string {
  if (val === null) return '—';
  return '$' + val.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function formatNumber(val: number | null): string {
  if (val === null) return '—';
  return val.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function formatPercent(val: number | null): string {
  if (val === null) return '—';
  return val.toFixed(1) + '%';
}

function calcPercentChange(oldVal: number | null, newVal: number | null): { change: number | null; direction: 'up' | 'down' | 'stable' } {
  if (oldVal === null || newVal === null || oldVal === 0) {
    return { change: null, direction: 'stable' };
  }
  const change = ((newVal - oldVal) / Math.abs(oldVal)) * 100;
  const direction = change > 0.5 ? 'up' : change < -0.5 ? 'down' : 'stable';
  return { change, direction };
}

function formatChange(change: number | null, direction: 'up' | 'down' | 'stable'): string {
  if (change === null) return '—';
  const sign = change >= 0 ? '+' : '';
  const arrow = direction === 'up' ? ' ↑' : direction === 'down' ? ' ↓' : '';
  return sign + change.toFixed(1) + '%' + arrow;
}

export async function getDemographicTrends(communityAreaName: string, projectType?: string): Promise<DemographicTrends | null> {
  const [data2010, data2023] = await Promise.all([load2010(), load2023()]);
  const normalized = normalizeAreaName(communityAreaName);

  const record2010 = data2010.find(r => normalizeAreaName(r.community_area_name) === normalized);
  const record2023 = data2023.find(r => normalizeAreaName(r.community_area) === normalized);

  if (!record2023) return null;

  const metrics: TrendMetric[] = [];

  const totalPop2023 = parseNum(record2023.total_population);

  const perCapitaIncome2010 = parseNum(record2010?.per_capita_income_);

  const income2023Under25k = parseNum(record2023.under_25_000) || 0;
  const income202325to50k = parseNum(record2023._25_000_to_49_999) || 0;
  const income202350to75k = parseNum(record2023._50_000_to_74_999) || 0;
  const income202375to125k = parseNum(record2023._75_000_to_125_000) || 0;
  const income2023Over125k = parseNum(record2023._125_000) || 0;
  const totalHouseholds2023 = income2023Under25k + income202325to50k + income202350to75k + income202375to125k + income2023Over125k;

  const estimatedMedianIncome2023 = totalHouseholds2023 > 0
    ? Math.round(
        (income2023Under25k * 15000 +
         income202325to50k * 37500 +
         income202350to75k * 62500 +
         income202375to125k * 100000 +
         income2023Over125k * 175000) / totalHouseholds2023
      )
    : null;

  if (perCapitaIncome2010 !== null) {
    metrics.push({ label: 'Per Capita Income (2010)', year2010: formatCurrency(perCapitaIncome2010), year2023: '—', change: '—', direction: 'stable', isPositive: true });
  }
  if (estimatedMedianIncome2023 !== null) {
    metrics.push({ label: 'Est. Median HH Income (2023)', year2010: '—', year2023: formatCurrency(estimatedMedianIncome2023), change: '—', direction: 'stable', isPositive: true });
  }

  const totalPop2010 = null;
  if (totalPop2023 !== null) {
    metrics.push({ label: 'Population (2023)', year2010: '—', year2023: formatNumber(totalPop2023), change: '—', direction: 'stable', isPositive: true });
  }

  const poverty2010 = parseNum(record2010?.percent_households_below_poverty);
  const lowIncome2023Pct = totalHouseholds2023 > 0
    ? ((income2023Under25k + income202325to50k) / totalHouseholds2023) * 100
    : null;

  if (poverty2010 !== null) {
    metrics.push({ label: '% HH Below Poverty (2010)', year2010: formatPercent(poverty2010), year2023: '—', change: '—', direction: 'stable', isPositive: true });
  }
  if (lowIncome2023Pct !== null) {
    metrics.push({ label: '% HH Income <$50k (2023)', year2010: '—', year2023: formatPercent(lowIncome2023Pct), change: '—', direction: 'stable', isPositive: true });
  }

  const unemployment2010 = parseNum(record2010?.percent_aged_16_unemployed);
  if (unemployment2010 !== null) {
    metrics.push({ label: '% Unemployed (16+) 2010', year2010: formatPercent(unemployment2010), year2023: '—', change: '—', direction: 'stable', isPositive: true });
  }

  const noHS2010 = parseNum(record2010?.percent_aged_25_without_high_school_diploma);
  if (noHS2010 !== null) {
    metrics.push({ label: '% Without HS Diploma (25+) 2010', year2010: formatPercent(noHS2010), year2023: '—', change: '—', direction: 'stable', isPositive: true });
  }

  const male0to17 = parseNum(record2023.male_0_to_17) || 0;
  const female0to17 = parseNum(record2023.female_0_to_17) || 0;
  const children2023 = male0to17 + female0to17;
  const childrenPct2023 = totalPop2023 && totalPop2023 > 0 ? (children2023 / totalPop2023) * 100 : null;

  const male65 = parseNum(record2023.male_65) || 0;
  const female65 = parseNum(record2023.female_65) || 0;
  const seniors2023 = male65 + female65;
  const seniorsPct2023 = totalPop2023 && totalPop2023 > 0 ? (seniors2023 / totalPop2023) * 100 : null;

  const dependent2010 = parseNum(record2010?.percent_aged_under_18_or_over_64);
  const dependentPct2023 = totalPop2023 && totalPop2023 > 0 ? ((children2023 + seniors2023) / totalPop2023) * 100 : null;

  if (dependent2010 !== null || dependentPct2023 !== null) {
    const { change, direction } = calcPercentChange(dependent2010, dependentPct2023);
    metrics.push({ label: '% Under 18 or Over 64', year2010: formatPercent(dependent2010), year2023: formatPercent(dependentPct2023), change: formatChange(change, direction), direction, isPositive: true });
  }

  metrics.push({ label: '% Children Under 18', year2010: '—', year2023: formatPercent(childrenPct2023), change: '—', direction: 'stable', isPositive: true });
  metrics.push({ label: '% Seniors 65+', year2010: '—', year2023: formatPercent(seniorsPct2023), change: '—', direction: 'stable', isPositive: true });

  const white2023 = parseNum(record2023.white) || 0;
  const black2023 = parseNum(record2023.black_or_african_american) || 0;
  const asian2023 = parseNum(record2023.asian) || 0;
  const hispanic2023 = parseNum(record2023.hispanic_or_latino) || 0;
  const whiteNonHispanic2023 = parseNum(record2023.white_not_hispanic_or_latino) || 0;

  const whitePct2023 = totalPop2023 && totalPop2023 > 0 ? (white2023 / totalPop2023) * 100 : null;
  const blackPct2023 = totalPop2023 && totalPop2023 > 0 ? (black2023 / totalPop2023) * 100 : null;
  const asianPct2023 = totalPop2023 && totalPop2023 > 0 ? (asian2023 / totalPop2023) * 100 : null;
  const hispanicPct2023 = totalPop2023 && totalPop2023 > 0 ? (hispanic2023 / totalPop2023) * 100 : null;
  const bipocPct2023 = totalPop2023 && totalPop2023 > 0 ? ((totalPop2023 - whiteNonHispanic2023) / totalPop2023) * 100 : null;

  metrics.push({ label: '% White', year2010: '—', year2023: formatPercent(whitePct2023), change: '—', direction: 'stable', isPositive: true });
  metrics.push({ label: '% Black/African American', year2010: '—', year2023: formatPercent(blackPct2023), change: '—', direction: 'stable', isPositive: true });
  metrics.push({ label: '% Hispanic/Latino', year2010: '—', year2023: formatPercent(hispanicPct2023), change: '—', direction: 'stable', isPositive: true });
  metrics.push({ label: '% Asian', year2010: '—', year2023: formatPercent(asianPct2023), change: '—', direction: 'stable', isPositive: true });
  metrics.push({ label: '% BIPOC', year2010: '—', year2023: formatPercent(bipocPct2023), change: '—', direction: 'stable', isPositive: true });

  const hardship2010 = parseNum(record2010?.hardship_index);
  if (hardship2010 !== null) {
    metrics.push({ label: 'Hardship Index (1-100)', year2010: formatNumber(hardship2010), year2023: '—', change: '—', direction: 'stable', isPositive: true });
  }

  if (projectType) {
    const priorityMetrics: Record<string, string[]> = {
      'senior_housing': ['% Seniors 65+', '% Under 18 or Over 64', 'Per Capita Income', 'Median HH Income', 'Poverty', 'Income <$50k'],
      'childcare': ['% Children Under 18', '% Under 18 or Over 64', 'Population'],
      'affordable_housing': ['Per Capita Income', 'Median HH Income', 'Poverty', 'Income <$50k', 'Population', 'Hardship Index'],
      'retail': ['Population', 'Per Capita Income', 'Median HH Income', '% BIPOC'],
      'restaurant': ['Population', 'Per Capita Income', 'Median HH Income'],
      'healthcare': ['% Seniors 65+', 'Population', '% Under 18 or Over 64'],
      'multifamily': ['Population', 'Per Capita Income', 'Median HH Income', '% BIPOC'],
    };
    const priority = priorityMetrics[projectType.toLowerCase()];
    if (priority) {
      metrics.sort((a, b) => {
        const aIdx = priority.findIndex(p => a.label.includes(p));
        const bIdx = priority.findIndex(p => b.label.includes(p));
        if (aIdx === -1 && bIdx === -1) return 0;
        if (aIdx === -1) return 1;
        if (bIdx === -1) return -1;
        return aIdx - bIdx;
      });
    }
  }

  const chartData: ChartDataPoint[] = [
    { name: '% Dependent (Under 18 or 65+)', value2010: dependent2010, value2023: dependentPct2023 },
  ].filter(d => d.value2010 !== null && d.value2023 !== null);

  return {
    communityArea: record2023.community_area,
    dataSource: '2010: Chicago Data Portal (2008-2012 ACS); 2023: Chicago Data Portal ACS 5-Year Estimates',
    metrics,
    chartData
  };
}

export async function getAllCommunityAreas(): Promise<string[]> {
  const data = await load2023();
  return data.map(r => r.community_area);
}
