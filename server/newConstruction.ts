import * as turf from '@turf/turf';

interface RawPermit {
  permit_: string;
  permit_type: string;
  work_description: string;
  issue_date: string;
  reported_cost: string;
  community_area: string;
  latitude: string;
  longitude: string;
  contact_1_zipcode?: string;
  street_number?: string;
  street_direction?: string;
  street_name?: string;
  contact_1_name?: string;
  contact_1_type?: string;
  contact_2_name?: string;
  contact_2_type?: string;
  contact_3_name?: string;
  contact_3_type?: string;
  contact_4_name?: string;
  contact_4_type?: string;
}

interface CategoryStats {
  count: number;
  totalCost: number;
  avgCost: number;
  skewed?: boolean;
}

interface NewConstructionStats {
  totalPermits: number;
  byCategory: {
    singleFamily: CategoryStats;
    multifamily: CategoryStats;
    commercial: CategoryStats;
  };
  byYear: Record<string, { total: number; singleFamily: number; multifamily: number; commercial: number }>;
  trendDirection: 'increasing' | 'decreasing' | 'stable';
  latestIssueDate?: string;
}

export interface NewConstructionResponse {
  communityArea: NewConstructionStats | null;
  communityAreaNumber: string;
  communityAreaName: string;
  zipCode: NewConstructionStats | null;
  zip: string;
  periodStart: string;
  periodEnd: string;
  dataSource: string;
}

const COMMUNITY_AREA_NAMES: Record<string, string> = {
  '1': 'Rogers Park', '2': 'West Ridge', '3': 'Uptown', '4': 'Lincoln Square',
  '5': 'North Center', '6': 'Lake View', '7': 'Lincoln Park', '8': 'Near North Side',
  '9': 'Edison Park', '10': 'Norwood Park', '11': 'Jefferson Park', '12': 'Forest Glen',
  '13': 'North Park', '14': 'Albany Park', '15': 'Portage Park', '16': 'Irving Park',
  '17': 'Dunning', '18': 'Montclare', '19': 'Belmont Cragin', '20': 'Hermosa',
  '21': 'Avondale', '22': 'Logan Square', '23': 'Humboldt Park', '24': 'West Town',
  '25': 'Austin', '26': 'West Garfield Park', '27': 'East Garfield Park', '28': 'Near West Side',
  '29': 'North Lawndale', '30': 'South Lawndale', '31': 'Lower West Side', '32': 'Loop',
  '33': 'Near South Side', '34': 'Armour Square', '35': 'Douglas', '36': 'Oakland',
  '37': 'Fuller Park', '38': 'Grand Boulevard', '39': 'Kenwood', '40': 'Washington Park',
  '41': 'Hyde Park', '42': 'Woodlawn', '43': 'South Shore', '44': 'Chatham',
  '45': 'Avalon Park', '46': 'South Chicago', '47': 'Burnside', '48': 'Calumet Heights',
  '49': 'Roseland', '50': 'Pullman', '51': 'South Deering', '52': 'East Side',
  '53': 'West Pullman', '54': 'Riverdale', '55': 'Hegewisch', '56': 'Garfield Ridge',
  '57': 'Archer Heights', '58': 'Brighton Park', '59': 'McKinley Park', '60': 'Bridgeport',
  '61': 'New City', '62': 'West Elsdon', '63': 'Gage Park', '64': 'Clearing',
  '65': 'West Lawn', '66': 'Chicago Lawn', '67': 'West Englewood', '68': 'Englewood',
  '69': 'Greater Grand Crossing', '70': 'Ashburn', '71': 'Auburn Gresham', '72': 'Beverly',
  '73': 'Washington Heights', '74': 'Mount Greenwood', '75': 'Morgan Park',
  '76': "O'Hare", '77': 'Edgewater',
};

function categorizePermit(workDescription: string): 'singleFamily' | 'multifamily' | 'commercial' {
  const desc = workDescription.toUpperCase();

  if (desc.includes('TENT') || desc.includes('STAGE') || desc.includes('ERECTION STARTS')) {
    return 'commercial';
  }

  if (desc.includes('SINGLE FAMILY') || desc.includes('SINGLE-FAMILY') || 
      desc.includes('SFR') || desc.includes('S.F.R') ||
      (desc.includes('R-5') && /\b1\s*(D\.?U\.?|DWELLING)\b/.test(desc))) {
    return 'singleFamily';
  }

  const duMatch = desc.match(/(\d+)\s*(D\.?U\.?|DWELLING\s*UNIT|UNITS?)/i);
  if (duMatch) {
    const count = parseInt(duMatch[1]);
    if (count === 1) return 'singleFamily';
    if (count >= 2) return 'multifamily';
  }

  if (desc.includes('R-5') && !desc.includes('COMMERCIAL') && !desc.includes('MIXED')) {
    if (/\b2\s*(D\.?U\.?|DWELLING)\b/.test(desc) || desc.includes('2 STORY') || desc.includes('TWO STORY')) {
      return desc.includes('APARTMENT') ? 'multifamily' : 'singleFamily';
    }
    return 'singleFamily';
  }

  if (desc.includes('APARTMENT') || desc.includes('R-2') || desc.includes('COACH HOUSE') ||
      desc.includes('ADU') || desc.includes('TOWNHOME') || desc.includes('TOWN HOME') ||
      desc.includes('CONDOMINIUM') || desc.includes('CONDO')) {
    return 'multifamily';
  }

  if (desc.includes('COMMERCIAL') || desc.includes('MIXED USE') || desc.includes('MIXED-USE') ||
      desc.includes('RETAIL') || desc.includes('OFFICE') || desc.includes('RESTAURANT') ||
      desc.includes('WAREHOUSE') || desc.includes('INDUSTRIAL') || desc.includes('HOTEL') ||
      desc.includes('CHURCH') || desc.includes('SCHOOL') || desc.includes('DAYCARE') ||
      desc.includes('DAY CARE') || desc.includes('MEDICAL') || desc.includes('CLINIC') ||
      desc.includes('CARPORT') || desc.includes('CAR WASH') || desc.includes('GAS STATION')) {
    return 'commercial';
  }

  if (desc.includes('RESIDENCE') || desc.includes('RESIDENTIAL')) {
    if (desc.includes('R-2') || /\d+\s*UNIT/.test(desc)) return 'multifamily';
    return 'singleFamily';
  }

  if (desc.includes('GARAGE') && !desc.includes('DWELLING') && !desc.includes('RESIDENCE')) {
    return 'commercial';
  }

  return 'commercial';
}

let cachedPermits: RawPermit[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 24 * 60 * 60 * 1000;

async function fetchAllPermits(): Promise<RawPermit[]> {
  if (cachedPermits && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedPermits;
  }

  const now = new Date();
  // Full first calendar year: pull from Jan 1 three years back so the earliest
  // year in the chart is complete (only the current year is partial / YTD).
  const startDate = `${now.getFullYear() - 3}-01-01`;

  const allPermits: RawPermit[] = [];
  const pageSize = 2000;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const whereClause = encodeURIComponent(`permit_type='PERMIT - NEW CONSTRUCTION' AND issue_date>='${startDate}'`);
    const orderClause = encodeURIComponent('issue_date DESC');
    const selectFields = encodeURIComponent('permit_,permit_type,work_description,issue_date,reported_cost,community_area,latitude,longitude,contact_1_zipcode,street_number,street_direction,street_name,contact_1_name,contact_1_type,contact_2_name,contact_2_type,contact_3_name,contact_3_type,contact_4_name,contact_4_type');
    const url = `https://data.cityofchicago.org/resource/ydr8-5enu.json?$select=${selectFields}&$where=${whereClause}&$limit=${pageSize}&$offset=${offset}&$order=${orderClause}`;
    
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error(`API returned ${response.status}`);
      const data = await response.json() as RawPermit[];
      allPermits.push(...data);
      if (data.length < pageSize) {
        hasMore = false;
      } else {
        offset += pageSize;
      }
    } catch (err) {
      console.error('[NEW CONSTRUCTION] Error fetching permits:', err);
      hasMore = false;
    }
  }

  // Accessory / temporary structures — the city files detached garages, festival
  // stages, tents, canopies, and sheds under "PERMIT - NEW CONSTRUCTION", but they
  // aren't building construction activity. Rule: temporary special-event permits
  // (erection window text) are always excluded; otherwise strip references to the
  // EXISTING building, and if what's actually being built has no building keywords
  // but does have accessory keywords, exclude it.
  const isAccessoryStructure = (desc: string): boolean => {
    const d = (desc || '').toUpperCase();
    if (d.includes('ERECTION STARTS:')) return true; // stages, tents, event structures
    let core = d.replace(/\b(ON|AT|SERVING|CONTAINING|WITHIN)\s+(AN?\s+|THE\s+)?EXISTING[^.]*/g, '');
    core = core.replace(/\bEXISTING\b[^.]*/g, '');
    const buildsBuilding = /\b(STORY|STORIES|RESIDENCE|DWELLING|D\.?U\.?S?\b|APARTMENT|SFR|TOWNHOME|TOWNHOUSE|CONDO|RETAIL|OFFICE|MIXED[- ]?USE|SCHOOL|WAREHOUSE|HOTEL|RESTAURANT)/.test(core);
    if (buildsBuilding) return false;
    return /\b(GARAGE|MOBILE STAGE|STAGE|TENT|CANOPY|CANOPIES|SCAFFOLD|FENCE|SHED|CARPORT|PERGOLA|GAZEBO)\b/.test(core);
  };

  const seenPermits = new Map<string, RawPermit>();
  for (const p of allPermits) {
    const existing = seenPermits.get(p.permit_);
    if (!existing || (p.issue_date || '') > (existing.issue_date || '')) {
      seenPermits.set(p.permit_, p);
    }
  }
  const dedupedAll = Array.from(seenPermits.values());
  const deduplicated = dedupedAll.filter(p => !isAccessoryStructure(p.work_description || ''));
  console.log(`[NEW CONSTRUCTION] Fetched ${allPermits.length} raw permits, deduplicated to ${dedupedAll.length}, ${deduplicated.length} after excluding ${dedupedAll.length - deduplicated.length} accessory/temporary structures`);
  cachedPermits = deduplicated;
  cacheTimestamp = Date.now();
  return deduplicated;
}

function computeStats(permits: RawPermit[]): NewConstructionStats {
  const sf: CategoryStats = { count: 0, totalCost: 0, avgCost: 0 };
  const mf: CategoryStats = { count: 0, totalCost: 0, avgCost: 0 };
  const cm: CategoryStats = { count: 0, totalCost: 0, avgCost: 0 };
  const byYear: Record<string, { total: number; singleFamily: number; multifamily: number; commercial: number }> = {};
  const costs: Record<'singleFamily' | 'multifamily' | 'commercial', number[]> = { singleFamily: [], multifamily: [], commercial: [] };
  let latestIssueDate = '';

  for (const p of permits) {
    const cat = categorizePermit(p.work_description || '');
    const cost = parseFloat(p.reported_cost) || 0;
    const year = p.issue_date?.substring(0, 4) || 'Unknown';
    if (p.issue_date && p.issue_date > latestIssueDate) latestIssueDate = p.issue_date;

    if (!byYear[year]) byYear[year] = { total: 0, singleFamily: 0, multifamily: 0, commercial: 0 };
    byYear[year].total++;
    byYear[year][cat]++;

    if (cost > 1) costs[cat].push(cost);
    if (cat === 'singleFamily') {
      sf.count++;
      if (cost > 1) sf.totalCost += cost;
    } else if (cat === 'multifamily') {
      mf.count++;
      if (cost > 1) mf.totalCost += cost;
    } else {
      cm.count++;
      if (cost > 1) cm.totalCost += cost;
    }
  }

  sf.avgCost = sf.count > 0 ? Math.round(sf.totalCost / sf.count) : 0;
  mf.avgCost = mf.count > 0 ? Math.round(mf.totalCost / mf.count) : 0;
  cm.avgCost = cm.count > 0 ? Math.round(cm.totalCost / cm.count) : 0;

  // Skew flag: mean dominated by outliers — mean ≫ median (>2×) or one permit
  // is more than half the category's declared value.
  const skewFor = (arr: number[], stat: CategoryStats): boolean => {
    if (arr.length < 3 || stat.totalCost <= 0) return false;
    const sorted = [...arr].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const mean = stat.totalCost / arr.length;
    const maxShare = sorted[sorted.length - 1] / stat.totalCost;
    return (median > 0 && mean / median > 2) || maxShare > 0.5;
  };
  sf.skewed = skewFor(costs.singleFamily, sf);
  mf.skewed = skewFor(costs.multifamily, mf);
  cm.skewed = skewFor(costs.commercial, cm);

  // Trend: trailing 12 months vs the 12 months before that — calendar-year
  // comparison would be biased because the current year is partial (YTD).
  let trendDirection: 'increasing' | 'decreasing' | 'stable' = 'stable';
  {
    const nowMs = Date.now();
    const ms12 = 365 * 24 * 60 * 60 * 1000;
    let recent = 0, prev = 0;
    for (const p of permits) {
      const t = p.issue_date ? Date.parse(p.issue_date) : NaN;
      if (isNaN(t)) continue;
      if (t >= nowMs - ms12) recent++;
      else if (t >= nowMs - 2 * ms12) prev++;
    }
    if (recent > prev * 1.1) trendDirection = 'increasing';
    else if (recent < prev * 0.9) trendDirection = 'decreasing';
  }

  return {
    totalPermits: permits.length,
    byCategory: { singleFamily: sf, multifamily: mf, commercial: cm },
    byYear,
    trendDirection,
    latestIssueDate: latestIssueDate ? latestIssueDate.substring(0, 10) : undefined,
  };
}

function findCommunityAreaNumber(name: string): string | null {
  const normalized = name.toLowerCase().trim();
  for (const [num, areaName] of Object.entries(COMMUNITY_AREA_NAMES)) {
    if (areaName.toLowerCase() === normalized) return num;
  }
  for (const [num, areaName] of Object.entries(COMMUNITY_AREA_NAMES)) {
    if (areaName.toLowerCase().includes(normalized) || normalized.includes(areaName.toLowerCase())) return num;
  }
  return null;
}

export interface NearbyPermit {
  permitNumber: string;
  address: string;
  category: 'singleFamily' | 'multifamily' | 'commercial';
  workDescription: string;
  issueDate: string;
  reportedCost: number;
  distanceMiles: number;
  latitude: number;
  longitude: number;
  ownerName?: string;
  architectName?: string;
  contractorName?: string;
  stories?: number;
  units?: number;
  parkingSpaces?: number;
  buildingUse?: string;
}

function extractContacts(p: RawPermit): { ownerName?: string; architectName?: string; contractorName?: string } {
  const contacts: { name?: string; type?: string }[] = [
    { name: p.contact_1_name, type: p.contact_1_type },
    { name: p.contact_2_name, type: p.contact_2_type },
    { name: p.contact_3_name, type: p.contact_3_type },
    { name: p.contact_4_name, type: p.contact_4_type },
  ];
  let ownerName: string | undefined;
  let architectName: string | undefined;
  let contractorName: string | undefined;
  for (const c of contacts) {
    if (!c.name || !c.type) continue;
    const t = c.type.toUpperCase();
    if (t.includes('OWNER') && !ownerName) ownerName = c.name;
    if (t.includes('ARCHITECT') && !architectName) architectName = c.name;
    if (t.includes('GENERAL CONTRACTOR') && !contractorName) contractorName = c.name;
  }
  return { ownerName, architectName, contractorName };
}

function parseWorkDescription(desc: string): { stories?: number; units?: number; parkingSpaces?: number; buildingUse?: string } {
  const d = desc.toUpperCase();

  const storyMatch = d.match(/(\d+)[\s-](?:STORY|STORIES|STOR|FL(?:OOR)?S?)\b/) ||
                     d.match(/(\d+)[\s-]FL\b/);
  const stories = storyMatch ? parseInt(storyMatch[1]) : undefined;

  const unitMatch = d.match(/(\d+)\s*(?:D\.?U\.?|DWELLING\s*UNITS?|UNITS?(?:\s+RESID)?|APARTMENTS?)\b/) ||
                    d.match(/(\d+)[\s-]UNIT\b/i);
  const rawUnits = unitMatch ? parseInt(unitMatch[1]) : undefined;
  const units = rawUnits && rawUnits > 0 ? rawUnits : undefined;

  const parkMatch = d.match(/(\d+)[\s-](?:PARKING\s*SPACES?|CAR\s*GARAGE|CAR\s*PARKING|STALLS?|SPACES?\s*PARKING|PARKING\s*STALLS?)/) ||
                    d.match(/(\d+)[\s-]CAR\b/);
  const parkingSpaces = parkMatch ? parseInt(parkMatch[1]) : undefined;

  let buildingUse: string | undefined;
  if (d.includes('MIXED USE') || d.includes('MIXED-USE')) buildingUse = 'Mixed Use';
  else if (d.includes('RETAIL')) buildingUse = 'Retail';
  else if (d.includes('OFFICE')) buildingUse = 'Office';
  else if (d.includes('RESTAURANT')) buildingUse = 'Restaurant';
  else if (d.includes('HOTEL') || d.includes('MOTEL')) buildingUse = 'Hotel';
  else if (d.includes('WAREHOUSE')) buildingUse = 'Warehouse';
  else if (d.includes('INDUSTRIAL') || d.includes('MANUFACTURING')) buildingUse = 'Industrial';
  else if (d.includes('SCHOOL') || d.includes('EDUCATIONAL')) buildingUse = 'School';
  else if (d.includes('CHURCH') || d.includes('RELIGIOUS')) buildingUse = 'Religious';
  else if (d.includes('DAYCARE') || d.includes('DAY CARE')) buildingUse = 'Day Care';
  else if (d.includes('MEDICAL') || d.includes('CLINIC') || d.includes('HEALTH')) buildingUse = 'Medical';
  else if (d.includes('CONDOMINIUM') || d.includes('CONDO')) buildingUse = 'Condominium';
  else if (d.includes('APARTMENT')) buildingUse = 'Apartment';
  else if (d.includes('TOWNHOME') || d.includes('TOWN HOME') || d.includes('TOWNHOUSE')) buildingUse = 'Townhome';
  else if (d.includes('SINGLE FAMILY') || d.includes('SINGLE-FAMILY') || d.includes('SFR') || d.includes('RESIDENCE')) buildingUse = 'Single Family';
  else if (d.includes('GARAGE') && !d.includes('DWELLING')) buildingUse = 'Garage';
  else if (d.includes('PARKING')) buildingUse = 'Parking';

  return { stories, units, parkingSpaces, buildingUse };
}

export interface NearbyConstructionResponse {
  permits: NearbyPermit[];
  totalCount: number;
  radiusMiles: number;
  periodMonths: number;
  periodStart?: string;
}

export async function getNearbyNewConstruction(lat: number, lng: number, radiusMiles = 0.5): Promise<NearbyConstructionResponse> {
  const permits = await fetchAllPermits();
  const fromPoint = turf.point([lng, lat]);
  const nearby: NearbyPermit[] = [];

  for (const p of permits) {
    const pLat = parseFloat(p.latitude);
    const pLng = parseFloat(p.longitude);
    if (isNaN(pLat) || isNaN(pLng)) continue;

    const toPoint = turf.point([pLng, pLat]);
    const dist = turf.distance(fromPoint, toPoint, { units: 'miles' });
    if (dist <= radiusMiles) {
      const parts = [p.street_number, p.street_direction, p.street_name].filter(Boolean);
      const address = parts.length > 0 ? parts.join(' ') : 'Address unavailable';
      const contacts = extractContacts(p);
      const parsed = parseWorkDescription(p.work_description || '');
      nearby.push({
        permitNumber: p.permit_,
        address,
        category: categorizePermit(p.work_description || ''),
        workDescription: p.work_description || '',
        issueDate: p.issue_date?.substring(0, 10) || '',
        reportedCost: parseFloat(p.reported_cost) || 0,
        distanceMiles: Math.round(dist * 100) / 100,
        latitude: pLat,
        longitude: pLng,
        ...contacts,
        ...parsed,
      });
    }
  }

  const byAddress = new Map<string, NearbyPermit>();
  for (const np of nearby) {
    const key = `${np.latitude.toFixed(5)},${np.longitude.toFixed(5)}`;
    const existing = byAddress.get(key);
    if (!existing || np.reportedCost > existing.reportedCost) {
      byAddress.set(key, np);
    }
  }
  const deduped = Array.from(byAddress.values());
  deduped.sort((a, b) => a.distanceMiles - b.distanceMiles);

  return {
    permits: deduped,
    totalCount: deduped.length,
    radiusMiles,
    periodMonths: 36,
    periodStart: `${new Date().getFullYear() - 3}-01-01`,
  };
}

export async function getNewConstructionStats(communityAreaNameOrNumber: string, zipCode: string): Promise<NewConstructionResponse> {
  const permits = await fetchAllPermits();

  const now = new Date();

  let communityAreaNumber = communityAreaNameOrNumber;
  if (communityAreaNameOrNumber && !/^\d+$/.test(communityAreaNameOrNumber)) {
    communityAreaNumber = findCommunityAreaNumber(communityAreaNameOrNumber) || '';
  }

  const caPermits = communityAreaNumber ? permits.filter(p => p.community_area === communityAreaNumber) : [];
  const zipPermits = zipCode ? permits.filter(p => p.contact_1_zipcode === zipCode) : [];

  return {
    communityArea: caPermits.length > 0 ? computeStats(caPermits) : null,
    communityAreaNumber: communityAreaNumber || '',
    communityAreaName: communityAreaNumber ? (COMMUNITY_AREA_NAMES[communityAreaNumber] || `Area ${communityAreaNumber}`) : communityAreaNameOrNumber,
    zipCode: zipPermits.length > 0 ? computeStats(zipPermits) : null,
    zip: zipCode,
    periodStart: `${now.getFullYear() - 3}-01-01`,
    periodEnd: now.toISOString().split('T')[0],
    dataSource: 'City of Chicago Building Permits · excludes garages, stages & other accessory structures',
  };
}
