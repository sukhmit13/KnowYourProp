// CHA Opportunity Areas — census tracts where CHA Housing Choice Voucher holders
// receive enhanced payment standards (higher max rents).
// Definition: poverty rate < 20% per ACS 5-Year Estimates (HUD/CHA standard).

export interface ChaOpportunityResult {
  isOpportunityArea: boolean;
  povertyRate: number | null;
  tractFips: string | null;
  source: string;
  lastChecked: string;
}

const chaCache = new Map<string, { result: ChaOpportunityResult; cachedAt: number }>();
const CACHE_MS = 24 * 60 * 60 * 1000;

function parseTractFips(fips: string): { state: string; county: string; tract: string } | null {
  const clean = fips.replace(/\D/g, '');
  if (clean.length !== 11) return null;
  return { state: clean.slice(0, 2), county: clean.slice(2, 5), tract: clean.slice(5) };
}

export async function checkChaOpportunityArea(censusTractFips: string): Promise<ChaOpportunityResult> {
  const key = censusTractFips;
  const cached = chaCache.get(key);
  if (cached && Date.now() - cached.cachedAt < CACHE_MS) return cached.result;

  const parts = parseTractFips(censusTractFips);
  if (!parts) {
    return { isOpportunityArea: false, povertyRate: null, tractFips: censusTractFips, source: "ACS 5-Year Estimates", lastChecked: new Date().toISOString() };
  }

  try {
    const apiKey = process.env.CENSUS_API_KEY || '';
    // B17001_001E = total population for poverty determination
    // B17001_002E = population below poverty level
    const url = `https://api.census.gov/data/2022/acs/acs5?get=B17001_001E,B17001_002E&for=tract:${parts.tract}&in=state:${parts.state}+county:${parts.county}&key=${apiKey}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Census API HTTP ${res.status}`);

    const data: string[][] = await res.json();
    // data[0] = headers, data[1] = values
    if (!data || data.length < 2) throw new Error('No data returned');

    const headers = data[0];
    const values = data[1];
    const totalIdx = headers.indexOf('B17001_001E');
    const povertyIdx = headers.indexOf('B17001_002E');

    const total = parseInt(values[totalIdx] || '0', 10);
    const inPoverty = parseInt(values[povertyIdx] || '0', 10);

    if (total === 0) throw new Error('Zero population in tract');

    const povertyRate = Math.round((inPoverty / total) * 1000) / 10; // one decimal
    const isOpportunityArea = povertyRate < 20;

    const result: ChaOpportunityResult = {
      isOpportunityArea,
      povertyRate,
      tractFips: censusTractFips,
      source: "ACS 5-Year Estimates (2022) — CHA standard: poverty rate < 20%",
      lastChecked: new Date().toISOString(),
    };
    chaCache.set(key, { result, cachedAt: Date.now() });
    return result;
  } catch (err) {
    console.error("[CHA Opportunity] Error:", err);
    return { isOpportunityArea: false, povertyRate: null, tractFips: censusTractFips, source: "ACS 5-Year Estimates", lastChecked: new Date().toISOString() };
  }
}
