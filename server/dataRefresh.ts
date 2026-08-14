import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, 'data');

// ── Schedule constants ─────────────────────────────────────────────────────
const MONTHLY_DAYS   = 90;
const QUARTERLY_DAYS = 90;
const WEEKLY_DAYS    = 30;
const CHECK_MS       = 6 * 60 * 60 * 1000; // check every 6 hours

// ── Global singleton guard (survives tsx hot-reloads) ──────────────────────
const g = global as any;

// ── Helpers ────────────────────────────────────────────────────────────────
function fileAgeDays(filePath: string): number {
  try { return (Date.now() - fs.statSync(filePath).mtimeMs) / 86_400_000; }
  catch { return Infinity; }
}

function needsRefresh(filePath: string, thresholdDays: number): boolean {
  return fileAgeDays(filePath) > thresholdDays;
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// Escape a string value for use inside a Socrata SoQL single-quoted literal
function soql(value: string): string {
  return value.replace(/'/g, "''");
}

async function socrataFetch(
  dataset: string,
  where: string,
  select: string,
  limit = 50_000,
): Promise<any[]> {
  const base = `https://data.cityofchicago.org/resource/${dataset}.json`;
  const rows: any[] = [];
  let offset = 0;
  while (true) {
    const params = new URLSearchParams({
      '$where': where,
      '$select': select,
      '$limit': String(limit),
      '$offset': String(offset),
    });
    const resp = await fetch(`${base}?${params}`, { signal: AbortSignal.timeout(60_000) });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(`HTTP ${resp.status} from ${dataset}: ${body.substring(0, 200)}`);
    }
    const page: any[] = await resp.json();
    rows.push(...page);
    if (page.length < limit) break;
    offset += limit;
    await sleep(300);
  }
  return rows;
}

// ── Cache-clear callbacks (registered by routes.ts / grocery-stores.ts) ───
type CbList = Array<() => void>;
const callbacks: Record<string, CbList> = { grocery: [], capacity: [], sba: [], zba: [] };
export function onRefresh(key: 'grocery' | 'capacity' | 'sba' | 'zba', cb: () => void) {
  callbacks[key]?.push(cb);
}
function fire(key: string) { (callbacks[key] ?? []).forEach(cb => { try { cb(); } catch {} }); }

// ══════════════════════════════════════════════════════════════════════════
//  MONTHLY REFRESHES
// ══════════════════════════════════════════════════════════════════════════

// ── 1. Grocery stores (Chicago Data Portal 53t8-wyrc) ─────────────────────
async function refreshGrocery(): Promise<void> {
  const storesFile = path.join(DATA, 'grocery_stores.json');
  if (!needsRefresh(storesFile, MONTHLY_DAYS)) return;

  console.log('[data-refresh] Fetching grocery stores...');
  // 53t8-wyrc is a Chicago-only dataset; no city filter needed
  const rows = await socrataFetch(
    '53t8-wyrc',
    'latitude IS NOT NULL',
    'store_name,address,zip_code,latitude,longitude,community_area,community_area_name,square_feet',
  );

  const now = new Date().toISOString();
  const stores = rows.map((r, i) => ({
    id: `grocery-${i}`,
    name: (r.store_name || '').trim(),
    address: (r.address || '').trim(),
    city: 'Chicago',
    state: 'IL',
    zip: (r.zip_code || '').toString().slice(0, 5),
    latitude: parseFloat(r.latitude),
    longitude: parseFloat(r.longitude),
    communityArea: r.community_area_name
      ? String(r.community_area_name).toUpperCase()
      : null,
    communityAreaNumber: r.community_area ? parseInt(r.community_area, 10) : null,
    squareFeet: r.square_feet ? parseInt(r.square_feet, 10) : null,
    isNewStore: false,
  })).filter(s => !isNaN(s.latitude) && !isNaN(s.longitude));

  // by-ZIP index
  const byZipMap: Record<string, any> = {};
  for (const s of stores) {
    const z = (s.zip || '').padStart(5, '0');
    if (!z || z === '00000') continue;
    if (!byZipMap[z]) byZipMap[z] = { zip: z, storeCount: 0, stores: [] };
    byZipMap[z].storeCount++;
    byZipMap[z].stores.push({ name: s.name, address: s.address, squareFeet: s.squareFeet });
  }

  // by-community-area index
  const byCaMap: Record<string, any> = {};
  for (const s of stores) {
    const ca = s.communityArea;
    if (!ca) continue;
    if (!byCaMap[ca]) byCaMap[ca] = { communityArea: ca, communityAreaNumber: s.communityAreaNumber, storeCount: 0, stores: [] };
    byCaMap[ca].storeCount++;
    byCaMap[ca].stores.push({ name: s.name, address: s.address, squareFeet: s.squareFeet });
  }

  fs.writeFileSync(storesFile, JSON.stringify({ generatedAt: now, totalStores: stores.length, stores }));
  fs.writeFileSync(
    path.join(DATA, 'grocery_by_zip.json'),
    JSON.stringify({ generatedAt: now, totalZips: Object.keys(byZipMap).length, data: byZipMap }),
  );
  fs.writeFileSync(
    path.join(DATA, 'grocery_by_community_area.json'),
    JSON.stringify({ generatedAt: now, totalCommunityAreas: Object.keys(byCaMap).length, data: byCaMap }),
  );

  console.log(`[data-refresh] Grocery done — ${stores.length} stores`);
  fire('grocery');
}

// ── 2. Day care centers (Business Licenses r5kz-chrr) ────────────────────
async function refreshDayCenters(): Promise<void> {
  const file = path.join(DATA, 'day_care_centers.json');
  if (!needsRefresh(file, MONTHLY_DAYS)) return;

  console.log('[data-refresh] Fetching day care centers...');

  // Use OR instead of IN() to avoid quoting issues with apostrophes
  const licWhere = [
    "Children''s Services Facility License",
    'Day Care Center 2 - 6 Years',
    'Day Care Center Under 2 Years',
    'Day Care Center Under 2 and 2 - 6 Years',
  ].map(t => `license_description='${soql(t)}'`).join(' OR ');

  const rows = await socrataFetch(
    'r5kz-chrr',
    `city='CHICAGO' AND license_status='AAI' AND (${licWhere})`,
    'id,doing_business_as_name,address,city,state,zip_code,latitude,longitude,community_area,community_area_name,neighborhood,license_description,license_number',
  );

  const now = new Date().toISOString();
  const locations = rows
    .filter(r => r.latitude && r.longitude)
    .map(r => ({
      id: r.id || r.license_number || '',
      name: (r.doing_business_as_name || '').trim(),
      address: (r.address || '').trim(),
      city: (r.city || 'CHICAGO').trim(),
      state: r.state || 'IL',
      zip: (r.zip_code || '').slice(0, 5),
      latitude: parseFloat(r.latitude),
      longitude: parseFloat(r.longitude),
      licenseNumber: r.license_number || '',
      licenseDescription: r.license_description || '',
      communityArea: r.community_area_name ? String(r.community_area_name).toUpperCase() : '',
      neighborhood: r.neighborhood || '',
    }));

  fs.writeFileSync(file, JSON.stringify({ generatedAt: now, totalLocations: locations.length, locations }));
  console.log(`[data-refresh] Day care done — ${locations.length} locations`);
}

// ── 3. Cannabis dispensaries (Illinois IDFPR) ─────────────────────────────
async function refreshCannabis(): Promise<void> {
  const file = path.join(DATA, 'cannabis_dispensaries.json');
  if (!needsRefresh(file, MONTHLY_DAYS)) return;

  console.log('[data-refresh] Fetching cannabis dispensaries...');
  try {
    const resp = await fetch(
      'https://data.illinois.gov/resource/kqnw-kbbf.json?$limit=500',
      { signal: AbortSignal.timeout(30_000) }
    );
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const rows: any[] = await resp.json();
    if (!Array.isArray(rows) || rows.length === 0) throw new Error('Empty or non-array response');

    const byZip: Record<string, any[]> = {};
    const now = new Date().toISOString().slice(0, 10);

    for (const r of rows) {
      const zip = (r.zip_code || r.zip || '').toString().slice(0, 5);
      // Only include Chicago ZIP codes (606xx, 607xx, 608xx)
      if (!/^60[678]/.test(zip)) continue;
      if (!byZip[zip]) byZip[zip] = [];
      byZip[zip].push({
        name: (r.organization_name || r.name || '').trim(),
        address: (r.street_address || r.address || '').trim(),
        city: (r.city || 'Chicago').trim(),
        state: r.state || 'IL',
        zip,
        phone: r.phone || '',
        website: r.website || '',
      });
    }

    const totalCount = Object.values(byZip).reduce((s, arr) => s + arr.length, 0);
    if (totalCount === 0) throw new Error('No Chicago dispensaries found — dataset may have changed format');

    fs.writeFileSync(file, JSON.stringify({
      totalCount,
      lastUpdated: now,
      source: 'Illinois IDFPR via data.illinois.gov',
      byZip,
    }));
    console.log(`[data-refresh] Cannabis done — ${totalCount} dispensaries`);
  } catch (err: any) {
    console.warn(`[data-refresh] Cannabis skip (${err.message}) — keeping existing file`);
  }
}

// ── 4. Minority contractors (Chicago MBE/WBE) ─────────────────────────────
async function refreshMinorityContractors(): Promise<void> {
  const file = path.join(DATA, 'minority_contractors.json');
  if (!needsRefresh(file, MONTHLY_DAYS)) return;

  console.log('[data-refresh] Fetching minority contractors...');
  try {
    const resp = await fetch(
      'https://data.cityofchicago.org/resource/qxk4-xbzn.json?$limit=10000',
      { signal: AbortSignal.timeout(60_000) }
    );
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const rows: any[] = await resp.json();
    if (!Array.isArray(rows) || rows.length === 0) throw new Error('Empty or non-array response');

    const records = rows.map(r => ({
      name: (r.company_name || r.vendor_name || r.legal_name || '').trim(),
      certTypes: [r.mbe === 'Y' && 'MBE', r.wbe === 'Y' && 'WBE', r.vbe === 'Y' && 'VBE'].filter(Boolean) as string[],
      ethnicity: r.ethnicity || '',
      capability: r.capability_description || r.naics_description || '',
      ward: r.ward || '',
      communityArea: r.community_area || '',
      phone: r.phone || '',
      email: r.email || '',
      address: (r.address || r.street_address || '').trim(),
      city: r.city || 'Chicago',
      state: r.state || 'IL',
      zip: (r.zip_code || r.zip || '').toString().slice(0, 5),
    })).filter(r => r.name);

    if (records.length === 0) throw new Error('No valid records parsed');

    fs.writeFileSync(file, JSON.stringify(records));
    console.log(`[data-refresh] Minority contractors done — ${records.length} firms`);
  } catch (err: any) {
    console.warn(`[data-refresh] Minority contractors skip (${err.message}) — keeping existing file`);
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  QUARTERLY REFRESHES
// ══════════════════════════════════════════════════════════════════════════

type POISpec = {
  file: string;
  licenseDesc: string | string[];
  nameFilter?: (name: string) => boolean;
};

const POI_SPECS: POISpec[] = [
  {
    file: 'restaurants.json',
    licenseDesc: 'Retail Food Establishment',
    nameFilter: (n) => {
      const u = n.toUpperCase();
      return !u.includes('COFFEE') && !u.includes('CAFE') && !u.includes('ROAST') &&
             !u.includes('ESPRESSO') && !u.includes('BREW') && !u.includes('TEA HOUSE');
    },
  },
  { file: 'bars.json', licenseDesc: 'Tavern' },
  { file: 'hotels.json', licenseDesc: 'Hotel' },
  {
    file: 'coffee_shops.json',
    licenseDesc: 'Retail Food Establishment',
    nameFilter: (n) => {
      const u = n.toUpperCase();
      return u.includes('COFFEE') || u.includes('CAFE') || u.includes('ROAST') ||
             u.includes('ESPRESSO') || u.includes('STARBUCKS') || u.includes('DUNKIN') ||
             u.includes('BREW') || u.includes('BEANERY') || u.includes('CAPPUCCINO');
    },
  },
  { file: 'liquor_stores.json', licenseDesc: 'Package Goods' },
  { file: 'nightclubs.json', licenseDesc: 'Late Hour' },
  { file: 'vet_clinics.json', licenseDesc: 'Veterinary Hospital' },
  { file: 'massage_spas.json', licenseDesc: 'Massage Establishment' },
  { file: 'event_venues.json', licenseDesc: 'Public Place of Amusement' },
  {
    file: 'breweries.json',
    licenseDesc: 'Manufacturing Establishments',
    nameFilter: (n) => {
      const u = n.toUpperCase();
      return u.includes('BREW') || u.includes('BEER') || u.includes('ALE') ||
             u.includes('LAGER') || u.includes('MALT') || u.includes('DISTILL') ||
             u.includes('WINERY') || u.includes('CIDER');
    },
  },
  { file: 'pet_stores.json', licenseDesc: 'Pet Shop' },
];

async function refreshPOI(spec: POISpec): Promise<void> {
  const filePath = path.join(DATA, spec.file);
  if (!needsRefresh(filePath, QUARTERLY_DAYS)) return;

  console.log(`[data-refresh] Fetching ${spec.file}...`);

  const descClause = Array.isArray(spec.licenseDesc)
    ? `(${spec.licenseDesc.map(d => `license_description='${soql(d)}'`).join(' OR ')})`
    : `license_description='${soql(spec.licenseDesc)}'`;

  const rows = await socrataFetch(
    'r5kz-chrr',
    `city='CHICAGO' AND license_status='AAI' AND ${descClause}`,
    'id,doing_business_as_name,address,city,state,zip_code,latitude,longitude,community_area,community_area_name,neighborhood,license_description,license_number',
  );

  const now = new Date().toISOString();
  let locations = rows
    .filter(r => r.latitude && r.longitude)
    .map(r => ({
      id: r.id || r.license_number || '',
      name: (r.doing_business_as_name || '').trim(),
      address: (r.address || '').trim(),
      city: (r.city || 'CHICAGO').trim(),
      state: r.state || 'IL',
      zip: (r.zip_code || '').slice(0, 5),
      latitude: parseFloat(r.latitude),
      longitude: parseFloat(r.longitude),
      licenseNumber: r.license_number || '',
      licenseDescription: r.license_description || '',
      communityArea: r.community_area_name ? String(r.community_area_name).toUpperCase() : '',
      neighborhood: r.neighborhood || '',
    }));

  if (spec.nameFilter) {
    locations = locations.filter(l => spec.nameFilter!(l.name));
  }

  fs.writeFileSync(filePath, JSON.stringify({ generatedAt: now, totalLocations: locations.length, locations }));
  console.log(`[data-refresh] ${spec.file} done — ${locations.length} locations`);
}

// ── Auto repair (LIKE query needs special handling) ───────────────────────
async function refreshAutoRepair(): Promise<void> {
  const filePath = path.join(DATA, 'auto_repair_shops.json');
  if (!needsRefresh(filePath, QUARTERLY_DAYS)) return;

  console.log('[data-refresh] Fetching auto_repair_shops.json...');
  const rows = await socrataFetch(
    'r5kz-chrr',
    "city='CHICAGO' AND license_status='AAI' AND license_description like 'Motor Vehicle Repair%'",
    'id,doing_business_as_name,address,city,state,zip_code,latitude,longitude,community_area,community_area_name,neighborhood,license_description,license_number',
  );

  const now = new Date().toISOString();
  const locations = rows
    .filter(r => r.latitude && r.longitude)
    .map(r => ({
      id: r.id || r.license_number || '',
      name: (r.doing_business_as_name || '').trim(),
      address: (r.address || '').trim(),
      city: (r.city || 'CHICAGO').trim(),
      state: r.state || 'IL',
      zip: (r.zip_code || '').slice(0, 5),
      latitude: parseFloat(r.latitude),
      longitude: parseFloat(r.longitude),
      licenseNumber: r.license_number || '',
      licenseDescription: r.license_description || '',
      communityArea: r.community_area_name ? String(r.community_area_name).toUpperCase() : '',
      neighborhood: r.neighborhood || '',
    }));

  fs.writeFileSync(filePath, JSON.stringify({ generatedAt: now, totalLocations: locations.length, locations }));
  console.log(`[data-refresh] auto_repair_shops.json done — ${locations.length} locations`);
}

// ── EV Stations (Chicago Data Portal fi3z-jc3f) ───────────────────────────
async function refreshEVStations(): Promise<void> {
  const file = path.join(DATA, 'ev_stations.json');
  if (!needsRefresh(file, QUARTERLY_DAYS)) return;

  console.log('[data-refresh] Fetching EV stations...');
  const resp = await fetch(
    "https://data.cityofchicago.org/resource/fi3z-jc3f.json?$limit=2000&$where=fuel_type_code='ELEC' AND status_code='E'",
    { signal: AbortSignal.timeout(30_000) }
  );
  if (!resp.ok) throw new Error(`HTTP ${resp.status} from fi3z-jc3f`);
  const rows: any[] = await resp.json();

  const stations = rows
    .filter(r => r.latitude && r.longitude)
    .map(r => ({
      id: r.id || r.station_id || '',
      name: (r.station_name || '').trim(),
      address: (r.street_address || '').trim(),
      city: r.city || 'Chicago',
      state: r.state || 'IL',
      zip: (r.zip || '').slice(0, 5),
      latitude: parseFloat(r.latitude),
      longitude: parseFloat(r.longitude),
      phone: r.station_phone || '',
      accessDays: r.access_days_time || '',
      evNetwork: r.ev_network || 'Non-Networked',
      evLevel2Count: r.ev_level2_evse_num ? parseInt(r.ev_level2_evse_num) : null,
      dcFastCount: r.ev_dc_fast_count ? parseInt(r.ev_dc_fast_count) : null,
    }));

  fs.writeFileSync(file, JSON.stringify({
    generatedAt: new Date().toISOString(),
    totalStations: stations.length,
    stations,
  }));
  console.log(`[data-refresh] EV stations done — ${stations.length} stations`);
}

// ══════════════════════════════════════════════════════════════════════════
//  WEEKLY: SBA CSV URL auto-update
// ══════════════════════════════════════════════════════════════════════════
async function updateSBAUrls(): Promise<void> {
  const configFile = path.join(DATA, 'sba_config.json');
  if (!needsRefresh(configFile, WEEKLY_DAYS)) return;

  console.log('[data-refresh] Checking SBA CSV URLs...');
  try {
    const existing = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
    let changed = false;

    // SBA migrated their open-data portal off CKAN in Aug 2026 — the old
    // resource_show API is gone. The dataset page now links CSVs directly
    // (filenames carry a quarterly "asof" date suffix), so scrape it.
    const datasetPage = existing.datasetPage || 'https://data.sba.gov/dataset/7a-504-foia';
    const r = await fetch(datasetPage, { signal: AbortSignal.timeout(15_000), redirect: 'follow' });
    if (!r.ok) {
      // Don't touch the config mtime — stay eligible for retry on next check.
      console.warn(`[data-refresh] SBA dataset page returned HTTP ${r.status} — keeping existing URLs, will retry`);
      return;
    }
    const html = await r.text();
    let allFound = true;
    for (const [key, pattern] of [
      ['csv7a', /https:\/\/data\.sba\.gov\/[^"']*FOIA[_-]7a[_-]FY2020[_-]Present[^"']*\.csv/i],
      ['csv504', /https:\/\/data\.sba\.gov\/[^"']*FOIA[_-]504[_-]FY2010[_-]Present[^"']*\.csv/i],
    ] as [string, RegExp][]) {
      const m = html.match(pattern);
      if (m && m[0] !== existing[key]) {
        console.log(`[data-refresh] SBA ${key} URL updated: ${m[0].split('/').pop()}`);
        existing[key] = m[0];
        changed = true;
      } else if (!m) {
        allFound = false;
        console.warn(`[data-refresh] SBA ${key} link not found on dataset page — keeping existing URL, will retry`);
      }
    }
    if (!allFound && !changed) {
      // Nothing found — leave mtime untouched so the next run retries.
      return;
    }

    existing.updatedAt = new Date().toISOString();
    fs.writeFileSync(configFile, JSON.stringify(existing, null, 2));

    if (changed) {
      console.log('[data-refresh] SBA config updated — clearing SBA cache');
      fire('sba');
    } else {
      console.log('[data-refresh] SBA URLs unchanged');
    }
  } catch (err: any) {
    console.warn(`[data-refresh] SBA URL check failed: ${err.message}`);
    try { fs.utimesSync(configFile, new Date(), new Date()); } catch {}
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  ANNUAL: HMDA LAR data (CFPB releases previous year's data each March)
//  Schedule: check in March or later each year; retry every 30 days until
//  the new year's dataset is published (1-year lag: 2025 data → March 2026)
// ══════════════════════════════════════════════════════════════════════════
const HMDA_STATE_FILE = path.join(DATA, 'hmda_refresh_state.json');
const HMDA_RETRY_DAYS = 30;

function hmdaTargetYear(): number {
  // CFPB releases year N-1 data each March; before March we still target N-2
  const now = new Date();
  const month = now.getMonth(); // 0 = Jan, 2 = March
  const year  = now.getFullYear();
  return month >= 2 ? year - 1 : year - 2;
}

function hmdaHasData(year: number): boolean {
  const suffix = year === 2024 ? '' : `_${year}`;
  return fs.existsSync(path.join(DATA, `hmda_by_tract${suffix}.json`));
}

function hmdaReadState(): { lastAttempt: string | null; lastSuccess: string | null; latestYear: number | null } {
  try {
    if (fs.existsSync(HMDA_STATE_FILE)) return JSON.parse(fs.readFileSync(HMDA_STATE_FILE, 'utf-8'));
  } catch {}
  return { lastAttempt: null, lastSuccess: null, latestYear: null };
}

function hmdaWriteState(state: { lastAttempt: string; lastSuccess: string | null; latestYear: number | null }): void {
  try { fs.writeFileSync(HMDA_STATE_FILE, JSON.stringify(state, null, 2)); } catch {}
}

async function refreshHmda(): Promise<void> {
  const targetYear = hmdaTargetYear();
  const now = new Date();

  // Before March: target data year isn't out yet
  if (now.getMonth() < 2) {
    console.log(`[hmda-refresh] Before March — ${targetYear} data not expected yet, skipping`);
    return;
  }

  // Already have this year's data
  if (hmdaHasData(targetYear)) {
    console.log(`[hmda-refresh] ${targetYear} data already present — no refresh needed`);
    return;
  }

  // Check retry throttle (don't hammer CFPB more than once every 30 days)
  const state = hmdaReadState();
  if (state.lastAttempt) {
    const daysSince = (Date.now() - new Date(state.lastAttempt).getTime()) / 86_400_000;
    if (daysSince < HMDA_RETRY_DAYS) {
      const daysLeft = Math.ceil(HMDA_RETRY_DAYS - daysSince);
      console.log(`[hmda-refresh] Last attempt was ${Math.floor(daysSince)}d ago — retry in ~${daysLeft}d`);
      return;
    }
  }

  console.log(`[hmda-refresh] Attempting to download ${targetYear} HMDA Cook County data...`);
  hmdaWriteState({ ...state, lastAttempt: now.toISOString() });

  try {
    const scriptPath = path.join(__dirname, '..', 'script', 'build_hmda_2025.mjs');
    execSync(`node "${scriptPath}" ${targetYear}`, { stdio: 'inherit', timeout: 300_000 });

    // Verify the file was actually written
    if (!hmdaHasData(targetYear)) {
      console.warn(`[hmda-refresh] Script completed but output file missing — will retry in ${HMDA_RETRY_DAYS}d`);
      return;
    }

    hmdaWriteState({ lastAttempt: now.toISOString(), lastSuccess: now.toISOString(), latestYear: targetYear });
    console.log(`[hmda-refresh] ${targetYear} HMDA data successfully downloaded and processed`);
  } catch (err: any) {
    // Exit code 2 from the script = data not published yet
    const notYet = err?.status === 2 || err?.message?.includes('exit code 2');
    if (notYet) {
      console.log(`[hmda-refresh] ${targetYear} HMDA data not yet published — will retry in ${HMDA_RETRY_DAYS}d`);
    } else {
      console.warn(`[hmda-refresh] Download failed: ${err.message} — will retry in ${HMDA_RETRY_DAYS}d`);
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  MAIN SCHEDULER
// ══════════════════════════════════════════════════════════════════════════
// ── Contractor rankings (server/data/contractors/rankings.json) ────────────
// Rebuilt monthly by re-running the build script (fetches 5 years of permits
// from the Chicago Data Portal). Runs async so the event loop is not blocked.
const CONTRACTOR_RANKINGS = path.join(DATA, 'contractors', 'rankings.json');
const CONTRACTOR_REFRESH_DAYS = 30;

async function refreshContractorRankings(): Promise<void> {
  if (!needsRefresh(CONTRACTOR_RANKINGS, CONTRACTOR_REFRESH_DAYS)) return;
  console.log('[data-refresh] Contractor rankings stale — rebuilding (this takes a few minutes)');
  const { exec } = await import('child_process');
  await new Promise<void>((resolve, reject) => {
    exec('npx tsx scripts/build_contractor_index.ts', {
      cwd: path.join(__dirname, '..'),
      timeout: 30 * 60 * 1000,
      maxBuffer: 32 * 1024 * 1024,
    }, (err, _stdout, stderr) => {
      if (err) return reject(new Error(`build_contractor_index failed: ${err.message} ${String(stderr).slice(0, 300)}`));
      resolve();
    });
  });
  console.log('[data-refresh] Contractor rankings rebuilt');
}

// ── ZBA attorney index (zba_cases table) ───────────────────────────────────
// Rebuilt monthly by re-running the build script (scrapes 5 years of ZBA
// resolution PDFs from chicago.gov). The script does an atomic swap with a
// sanity floor, so a failed scrape never wipes the existing index.
const ZBA_REFRESH_DAYS = 30;

// Staleness lives in the DB (zba_index_runs), not a file
async function zbaIndexStale(): Promise<boolean> {
  const { db } = await import('./db');
  const { zbaIndexRuns } = await import('../shared/schema');
  const { desc, eq } = await import('drizzle-orm');
  const [last] = await db.select().from(zbaIndexRuns)
    .where(eq(zbaIndexRuns.status, 'completed'))
    .orderBy(desc(zbaIndexRuns.completedAt))
    .limit(1);
  const ageDays = last?.completedAt
    ? (Date.now() - last.completedAt.getTime()) / 86_400_000
    : Infinity;
  return ageDays > ZBA_REFRESH_DAYS;
}

// Production import path: autoscale deployments can't run the hour-long scrape
// (instances are throttled/killed between requests — spawned builds die silently
// and leave 'processing' rows stuck forever). Instead, dev rebuilds write
// server/data/zba_snapshot.json, which ships with each publish; production
// imports it here in seconds, atomically.
export async function importZbaSnapshot(): Promise<boolean> {
  const snapPath = path.join(DATA, 'zba_snapshot.json');
  if (!fs.existsSync(snapPath)) {
    console.log('[data-refresh] No ZBA snapshot file — skipping import');
    return false;
  }
  const snap = JSON.parse(fs.readFileSync(snapPath, 'utf-8')) as {
    builtAt: string; pdfsProcessed: number;
    cases: Array<Record<string, any>>;
  };
  if (!snap.builtAt || !Array.isArray(snap.cases) || snap.cases.length < 200) {
    console.error('[data-refresh] ZBA snapshot malformed or too small — skipping import');
    return false;
  }

  const { db } = await import('./db');
  const { zbaCases, zbaIndexRuns } = await import('../shared/schema');
  const { eq, and, lt, sql } = await import('drizzle-orm');

  // Clean up runs stuck in 'processing' (dead spawned builds from old deploys)
  await db.update(zbaIndexRuns)
    .set({ status: 'failed', errorMessage: 'stale processing run (process died)', completedAt: new Date() })
    .where(and(eq(zbaIndexRuns.status, 'processing'),
               lt(zbaIndexRuns.createdAt, new Date(Date.now() - 6 * 3600_000))));

  // Already imported this exact snapshot? (marker stored on the run row)
  const marker = `snapshot:${snap.builtAt}`;
  const [existing] = await db.select({ id: zbaIndexRuns.id }).from(zbaIndexRuns)
    .where(and(eq(zbaIndexRuns.status, 'completed'), eq(zbaIndexRuns.errorMessage, marker)))
    .limit(1);
  if (existing) return false;

  console.log(`[data-refresh] Importing ZBA snapshot (${snap.cases.length} cases, built ${snap.builtAt})`);
  const rows = snap.cases.map(c => ({
    ...c,
    decisionDate: c.decisionDate ? new Date(c.decisionDate) : null,
  }));
  await db.transaction(async (tx) => {
    await tx.delete(zbaCases);
    const BATCH = 500;
    for (let i = 0; i < rows.length; i += BATCH) {
      await tx.insert(zbaCases).values(rows.slice(i, i + BATCH) as any);
    }
  });
  await db.insert(zbaIndexRuns).values({
    status: 'completed',
    pdfsProcessed: snap.pdfsProcessed ?? 0,
    casesExtracted: rows.length,
    errorMessage: marker,
    completedAt: new Date(),
  } as any);
  console.log('[data-refresh] ZBA snapshot imported');
  fire('zba');
  return true;
}

async function refreshZbaIndex(): Promise<void> {
  // Production never scrapes — it only imports the bundled snapshot (idempotent, fast)
  if (process.env.NODE_ENV === 'production') {
    await importZbaSnapshot();
    return;
  }

  if (!(await zbaIndexStale())) return;

  console.log('[data-refresh] ZBA attorney index stale — rebuilding (this can take over an hour)');
  // spawn (not exec): the build logs heavily and would overflow exec's maxBuffer,
  // which kills the child mid-run. Keep only a small tail of stderr for errors.
  const { spawn } = await import('child_process');
  await new Promise<void>((resolve, reject) => {
    const child = spawn('npx', ['tsx', 'scripts/build_zba_index.ts'], {
      cwd: path.join(__dirname, '..'),
    });
    let stderrTail = '';
    child.stdout.resume(); // drain and discard
    child.stderr.on('data', (d: Buffer) => {
      stderrTail = (stderrTail + d.toString()).slice(-2000);
    });
    const timer = setTimeout(() => { child.kill('SIGKILL'); }, 3 * 60 * 60 * 1000);
    child.on('error', (err) => { clearTimeout(timer); reject(err); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve();
      reject(new Error(`build_zba_index exited with code ${code}: ${stderrTail.slice(-300)}`));
    });
  });
  console.log('[data-refresh] ZBA attorney index rebuilt');
  fire('zba');
}

async function runAllRefreshes(): Promise<void> {
  if (g.__dataRefreshing) return;
  g.__dataRefreshing = true;
  try {
    // Monthly
    await refreshGrocery().catch(e => console.error('[data-refresh] grocery error:', e.message));
    await sleep(1000);
    await refreshDayCenters().catch(e => console.error('[data-refresh] day-care error:', e.message));
    await sleep(1000);
    await refreshCannabis().catch(e => console.error('[data-refresh] cannabis error:', e.message));
    await sleep(1000);
    await refreshMinorityContractors().catch(e => console.error('[data-refresh] contractors error:', e.message));
    await sleep(1000);

    // Quarterly POI files
    for (const spec of POI_SPECS) {
      await refreshPOI(spec).catch(e => console.error(`[data-refresh] ${spec.file} error:`, e.message));
      await sleep(800);
    }
    await refreshAutoRepair().catch(e => console.error('[data-refresh] auto-repair error:', e.message));
    await sleep(800);

    // EV stations
    await refreshEVStations().catch(e => console.error('[data-refresh] ev-stations error:', e.message));

    // SBA URL check
    await updateSBAUrls().catch(e => console.error('[data-refresh] SBA URL error:', e.message));

    // Annual HMDA (March+, retries every 30 days until published)
    await refreshHmda().catch(e => console.error('[hmda-refresh] error:', e.message));

    // Monthly contractor rankings rebuild (5-year permit index)
    await refreshContractorRankings().catch(e => console.error('[data-refresh] contractor-rankings error:', e.message));

    // Monthly ZBA attorney index rebuild (5-year ZBA resolutions)
    await refreshZbaIndex().catch(e => console.error('[data-refresh] zba-index error:', e.message));

    console.log('[data-refresh] Cycle complete');
  } finally {
    g.__dataRefreshing = false;
  }
}

// DB-backed staleness (ZBA index) is async, so it gets its own trigger path
function maybeRefreshForZba(): void {
  // Production: import the bundled snapshot directly (cheap + idempotent) so a
  // republish with fresher data takes effect even if the last import was recent
  if (process.env.NODE_ENV === 'production') {
    importZbaSnapshot().catch(e => console.error('[data-refresh] zba snapshot import error:', e.message));
    return;
  }
  zbaIndexStale().then(stale => {
    if (stale && !g.__dataRefreshing) {
      console.log('[data-refresh] ZBA attorney index stale — starting refresh cycle');
      runAllRefreshes();
    }
  }).catch(e => console.error('[data-refresh] zba staleness check error:', e.message));
}

export function scheduleDataRefresh(): void {
  if (g.__dataRefreshScheduled) {
    if (!g.__dataRefreshing) {
      const needsNow =
        needsRefresh(path.join(DATA, 'grocery_stores.json'), MONTHLY_DAYS) ||
        needsRefresh(path.join(DATA, 'day_care_centers.json'), MONTHLY_DAYS) ||
        needsRefresh(CONTRACTOR_RANKINGS, CONTRACTOR_REFRESH_DAYS);
      if (needsNow) {
        console.log('[data-refresh] Hot-reload: stale files detected — refreshing');
        runAllRefreshes();
      } else {
        maybeRefreshForZba();
      }
    }
    return;
  }
  g.__dataRefreshScheduled = true;

  const needsMonthly   = needsRefresh(path.join(DATA, 'grocery_stores.json'), MONTHLY_DAYS) ||
                         needsRefresh(path.join(DATA, 'day_care_centers.json'), MONTHLY_DAYS);
  const needsQuarterly = needsRefresh(path.join(DATA, 'restaurants.json'), QUARTERLY_DAYS) ||
                         needsRefresh(path.join(DATA, 'bars.json'), QUARTERLY_DAYS);
  const needsSBA       = needsRefresh(path.join(DATA, 'sba_config.json'), WEEKLY_DAYS);
  const needsContractors = needsRefresh(CONTRACTOR_RANKINGS, CONTRACTOR_REFRESH_DAYS);

  // Log HMDA status on startup
  const hmdaTarget = hmdaTargetYear();
  if (hmdaHasData(hmdaTarget)) {
    console.log(`[hmda-refresh] ${hmdaTarget} data present — next check March ${hmdaTarget + 2}`);
  } else if (new Date().getMonth() < 2) {
    console.log(`[hmda-refresh] Before March — ${hmdaTarget} data not expected yet`);
  } else {
    const hmdaState = hmdaReadState();
    const daysSince = hmdaState.lastAttempt
      ? (Date.now() - new Date(hmdaState.lastAttempt).getTime()) / 86_400_000
      : Infinity;
    const daysLeft = Math.max(0, Math.ceil(HMDA_RETRY_DAYS - daysSince));
    console.log(`[hmda-refresh] ${hmdaTarget} data missing — will attempt in ~${daysLeft}d`);
  }

  if (needsMonthly || needsQuarterly || needsSBA || needsContractors) {
    console.log('[data-refresh] Stale datasets found — starting refresh cycle');
    runAllRefreshes();
  } else {
    const groceryAge = fileAgeDays(path.join(DATA, 'grocery_stores.json'));
    const daysLeft   = Math.max(0, Math.round(MONTHLY_DAYS - groceryAge));
    console.log(`[data-refresh] All datasets current — next refresh in ~${daysLeft} day(s)`);
    maybeRefreshForZba();
  }

  setInterval(() => {
    if (!g.__dataRefreshing) runAllRefreshes();
  }, CHECK_MS);
}
