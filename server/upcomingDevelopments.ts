import Parser from 'rss-parser';

const rssParser = new Parser({
  timeout: 12000,
  headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ChicagoEligibilityScreener/1.0)' },
});

export interface UpcomingDevelopment {
  id: string;
  source: 'permits' | 'blockclub';
  stage: 1 | 2;
  title: string;
  url: string;
  publishDate: string;
  address?: string;
  units?: number;
  stories?: number;
  developer?: string;
  status: string;
  description?: string;
  ordinanceId?: string;
  ward?: number;
  introducedDate?: string;
  neighborhoods: string[];
  lat?: number;
  lon?: number;
  useType?: 'rental' | 'condo' | 'commercial' | 'mixed-use';
}

const DEVELOPMENT_KEYWORDS = [
  'approved', 'proposed', 'plans revealed', 'plans for', 'zoning',
  'apartment', 'apartments', 'mixed-use', 'mixed use', 'tower', 'stories',
  'units', 'development', 'construction starts', 'breaks ground', 'groundbreaking',
  'rendering', 'new building', 'residential building', 'condo', 'condos',
  'affordable housing', 'city council approved', 'alderman approved',
  'permit filed', 'demolition', 'new construction', 'rezoning', 'upzoning',
  'transit-oriented', 'adaptive reuse', 'restaurant', 'hotel', 'retail',
];

export function isDevelopmentArticle(title: string, summary = ''): boolean {
  const combined = `${title} ${summary}`.toLowerCase();
  return DEVELOPMENT_KEYWORDS.some(kw => combined.includes(kw));
}

export function parseUnits(text: string): number | undefined {
  const patterns = [
    /(\d+)[\s-]*(?:unit|apartment|condo|residence)s?(?:\s|,|\.)/i,
    /(?:contain(?:ing)?|with|of|totaling)\s+(\d+)\s+(?:unit|apartment|condo|residence)/i,
    /(\d+)[\s-]*(?:affordable|market[\s-]rate|rental|new)?\s*(?:residential\s+)?units?/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const n = parseInt(m[1]);
      if (n >= 1 && n <= 2000) return n;
    }
  }
  return undefined;
}

export function parseStories(text: string): number | undefined {
  const textToNum: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
    seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
    thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
    seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  };
  const patterns = [
    /(\d+)[\s-]*stor(?:y|ies)/i,
    /(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s+stor(?:y|ies)/i,
    /rises?\s+(\d+)\s+stor(?:y|ies)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const val = m[1].toLowerCase();
      if (textToNum[val] !== undefined) return textToNum[val];
      const n = parseInt(val);
      if (!isNaN(n) && n >= 1 && n <= 200) return n;
    }
  }
  return undefined;
}

export function parseAddress(text: string): string | undefined {
  const p = /(\d{3,5}(?:-\d{1,4})?\s+(?:North|South|East|West|N\.?|S\.?|E\.?|W\.?)\s+[\w]+(?:\s+[\w]+)?(?:\s+(?:Avenue|Ave|Street|St|Road|Rd|Boulevard|Blvd|Drive|Dr|Place|Pl|Court|Ct|Lane|Ln|Parkway|Pkwy))?)/i;
  const m = text.match(p);
  if (m) return m[1].trim().toUpperCase().replace(/\s+/g, ' ');
  return undefined;
}

export function parseUseType(text: string): 'rental' | 'condo' | 'commercial' | 'mixed-use' | undefined {
  const lower = text.toLowerCase();
  const hasRental = /\b(apartment|rental|affordable housing|affordable unit|market[- ]rate unit|renter|multifamily|multi-family)\b/.test(lower);
  const hasCondo = /\b(condo|condominium|for[- ]sale unit|homeowner|ownership unit|condo unit)\b/.test(lower);
  const hasCommercial = /\b(retail|commercial space|office space|hotel|restaurant space|ground[- ]floor retail)\b/.test(lower);
  const isResidential = hasRental || hasCondo;
  if (isResidential && hasCommercial) return 'mixed-use';
  if (hasCondo && hasRental) return 'mixed-use';
  if (hasCondo) return 'condo';
  if (hasRental) return 'rental';
  if (hasCommercial) return 'commercial';
  return undefined;
}

export function parseDeveloper(text: string): string | undefined {
  const patterns = [
    /(?:developer|developed by|by developer)\s+([A-Z][A-Za-z\s&,\.]+?)(?:\s+(?:is|has|will|plan)|,|\.|$)/,
    /(?:project|building|proposal|design)\s+by\s+([A-Z][A-Za-z\s&]+?)(?:,|\.|and\s|$)/i,
    /designed by\s+([A-Z][A-Za-z\s&]+?)(?:,|\.|$)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].trim();
  }
  return undefined;
}

export function extractStatus(title: string): string {
  const lower = title.toLowerCase();
  if (/approv/i.test(lower)) return 'Approved';
  if (/proposed|plans revealed|plans for|would bring|could bring/i.test(lower)) return 'Proposed';
  if (/construction|underway|breaks ground|groundbreaking/i.test(lower)) return 'Under Construction';
  if (/permits?/i.test(lower)) return 'Permitted';
  if (/demolition|demolish/i.test(lower)) return 'Pre-Construction';
  if (/rezoning|rezone|upzoning/i.test(lower)) return 'Zoning Review';
  return 'Proposed';
}

const CHICAGO_NEIGHBORHOODS = [
  'avondale', 'logan square', 'wicker park', 'bucktown', 'west town', 'ukrainian village',
  'humboldt park', 'hermosa', 'irving park', 'north center', 'lakeview', 'lake view',
  'lincoln park', 'lincoln square', 'ravenswood', 'uptown', 'edgewater', 'andersonville',
  'rogers park', 'albany park', 'portage park', 'belmont cragin', 'austin',
  'near west side', 'west loop', 'fulton market', 'river north', 'near north side',
  'gold coast', 'streeterville', 'south loop', 'pilsen', 'little village', 'bridgeport',
  'back of the yards', 'bronzeville', 'kenwood', 'hyde park', 'woodlawn', 'south shore',
  'englewood', 'chatham', 'north lawndale', 'east garfield park', 'west garfield park',
  'roseland', 'auburn gresham', 'pullman', 'chinatown', 'douglas', 'new city',
  'west ridge', 'jefferson park', 'norwood park', 'forest glen', 'north park',
  'dunning', 'montclare', 'lower west side', 'armour square', 'grand boulevard',
  'greater grand crossing', 'ashburn', 'beverly', 'morgan park', 'gage park',
  'chicago lawn', 'west englewood', 'mckinley park', 'brighton park', 'archer heights',
  'garfield ridge', 'south chicago', 'south deering', 'west pullman', 'hegewisch',
  'clearing', 'west elsdon', 'west lawn', 'washington park', 'oakland', 'fuller park',
];

// Map neighborhood/community area names to Chicago community area numbers (for permit filtering)
const COMMUNITY_AREA_NUMBERS: Record<string, string> = {
  'rogers park': '1', 'west ridge': '2', 'uptown': '3', 'lincoln square': '4',
  'north center': '5', 'lake view': '6', 'lakeview': '6', 'lincoln park': '7',
  'near north side': '8', 'river north': '8', 'gold coast': '8', 'streeterville': '8',
  'edison park': '9', 'norwood park': '10', 'jefferson park': '11', 'forest glen': '12',
  'north park': '13', 'albany park': '14', 'portage park': '15', 'irving park': '16',
  'dunning': '17', 'montclare': '18', 'belmont cragin': '19', 'hermosa': '20',
  'avondale': '21', 'logan square': '22', 'humboldt park': '23',
  'west town': '24', 'wicker park': '24', 'bucktown': '24', 'ukrainian village': '24',
  'austin': '25', 'west garfield park': '26', 'east garfield park': '27',
  'near west side': '28', 'west loop': '28', 'fulton market': '28',
  'north lawndale': '29', 'south lawndale': '30', 'little village': '30',
  'lower west side': '31', 'pilsen': '31', 'loop': '32', 'near south side': '33',
  'south loop': '33', 'armour square': '34', 'chinatown': '34', 'bridgeport': '60',
  'douglas': '35', 'bronzeville': '35', 'oakland': '36', 'fuller park': '37',
  'grand boulevard': '38', 'kenwood': '39', 'washington park': '40', 'hyde park': '41',
  'woodlawn': '42', 'south shore': '43', 'chatham': '44', 'avalon park': '45',
  'south chicago': '46', 'burnside': '47', 'calumet heights': '48', 'roseland': '49',
  'pullman': '50', 'south deering': '51', 'east side': '52', 'west pullman': '53',
  'riverdale': '54', 'hegewisch': '55', 'garfield ridge': '56', 'archer heights': '57',
  'brighton park': '58', 'mckinley park': '59', 'new city': '61', 'back of the yards': '61',
  'west elsdon': '62', 'gage park': '63', 'clearing': '64', 'west lawn': '65',
  'chicago lawn': '66', 'west englewood': '67', 'englewood': '68',
  'greater grand crossing': '69', 'ashburn': '70', 'auburn gresham': '71',
  'beverly': '72', 'washington heights': '73', 'mount greenwood': '74',
  'morgan park': '75', "o'hare": '76', 'edgewater': '77', 'andersonville': '77',
  'ravenswood': '4',
};

// Detect neighborhoods in text AND url slug (converts hyphens to spaces)
export function detectNeighborhoods(text: string, url?: string): string[] {
  const urlAsText = url ? url.toLowerCase().replace(/-/g, ' ').replace(/[\/\?#]/g, ' ') : '';
  const combined = `${text.toLowerCase()} ${urlAsText}`;
  return CHICAGO_NEIGHBORHOODS.filter(n => combined.includes(n));
}

let devCache: { data: UpcomingDevelopment[]; fetchedAt: number } | null = null;
const CACHE_TTL = 4 * 60 * 60 * 1000;

async function fetchBlockClubDevelopments(): Promise<UpcomingDevelopment[]> {
  const feed = await rssParser.parseURL('https://blockclubchicago.org/feed/');
  const items: UpcomingDevelopment[] = [];
  for (const item of feed.items.slice(0, 80)) {
    const title = item.title || '';
    const rawSummary = (item.summary || (item as any).content || '');
    const summary = rawSummary.replace(/<[^>]+>/g, '');
    const url = item.link || '';
    // Check both article text AND the URL slug for neighborhood names and development keywords
    if (!isDevelopmentArticle(title, summary) && !isDevelopmentArticle(title, url)) continue;
    const combined = `${title} ${summary}`;
    items.push({
      id: `blockclub-${url || title}`,
      source: 'blockclub',
      stage: 2,
      title,
      url,
      publishDate: item.pubDate || item.isoDate || '',
      address: parseAddress(title) || parseAddress(summary.substring(0, 600)),
      units: parseUnits(combined),
      stories: parseStories(combined),
      developer: parseDeveloper(combined),
      status: extractStatus(title),
      description: summary.substring(0, 280).trim(),
      neighborhoods: detectNeighborhoods(combined, url),
      useType: parseUseType(combined),
    });
  }
  return items;
}

// Chicago Data Portal: recent new construction permits — reliable, official source
// Fetches city-wide so results can be cached once and filtered per-neighborhood downstream
async function fetchChicagoPermits(): Promise<UpcomingDevelopment[]> {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const dateStr = sixMonthsAgo.toISOString().split('T')[0];

  const where = encodeURIComponent(`issue_date > '${dateStr}'`);
  const url = `https://data.cityofchicago.org/resource/ydr8-5enu.json?permit_type=PERMIT+-+NEW+CONSTRUCTION&$where=${where}&$order=issue_date+DESC&$limit=500&$select=permit_,street_number,street_direction,street_name,suffix,community_area,ward,issue_date,work_description,contact_1_name,latitude,longitude`;

  const resp = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'ChicagoEligibilityScreener/1.0' },
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) throw new Error(`Chicago permits API ${resp.status}`);
  const permits: any[] = await resp.json();

  return permits.map((p: any) => {
    const streetAddr = [p.street_number, p.street_direction, p.street_name, p.suffix].filter(Boolean).join(' ').toUpperCase();
    const caNum = p.community_area ? String(parseInt(p.community_area)) : '';
    const neighborhoodName = Object.entries(COMMUNITY_AREA_NUMBERS).find(([, v]) => v === caNum)?.[0] || '';
    const desc = (p.work_description || '').substring(0, 280);
    const ward = p.ward ? parseInt(p.ward) : undefined;
    const lat = p.latitude ? parseFloat(p.latitude) : undefined;
    const lon = p.longitude ? parseFloat(p.longitude) : undefined;
    return {
      id: `permit-${p.permit_ || p.id}`,
      source: 'permits' as const,
      stage: 1 as const,
      title: `New Construction Permit — ${streetAddr}`,
      url: `https://data.cityofchicago.org/Buildings/Building-Permits/ydr8-5enu/about_data`,
      publishDate: p.issue_date || '',
      address: streetAddr,
      units: parseUnits(desc),
      stories: parseStories(desc),
      developer: p.contact_1_name || undefined,
      status: 'Permitted',
      description: desc,
      ordinanceId: p.permit_,
      ward,
      neighborhoods: neighborhoodName ? [neighborhoodName] : [],
      lat,
      lon,
      useType: parseUseType(desc),
    };
  });
}

export async function getUpcomingDevelopments(): Promise<UpcomingDevelopment[]> {
  if (devCache && Date.now() - devCache.fetchedAt < CACHE_TTL) {
    return devCache.data;
  }

  const all: UpcomingDevelopment[] = [];

  try {
    const bc = await fetchBlockClubDevelopments();
    all.push(...bc);
    console.log(`[UPCOMING DEV] BlockClub: ${bc.length}`);
  } catch (err) {
    console.error('[UPCOMING DEV] BlockClub error:', err);
  }

  try {
    const permits = await fetchChicagoPermits();
    all.push(...permits);
    console.log(`[UPCOMING DEV] Chicago Permits: ${permits.length}`);
  } catch (err) {
    console.error('[UPCOMING DEV] Chicago Permits error:', err);
  }

  const seen = new Set<string>();
  const deduped = all.filter(item => {
    const key = item.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  devCache = { data: deduped, fetchedAt: Date.now() };
  console.log(`[UPCOMING DEV] Cached ${deduped.length} total items`);
  return deduped;
}

export function filterDevelopmentsByNeighborhood(
  items: UpcomingDevelopment[],
  allowedAreas: Set<string>,
): UpcomingDevelopment[] {
  if (allowedAreas.size === 0) return items;
  return items.filter(item =>
    item.neighborhoods.some(n => allowedAreas.has(n))
  );
}

export function getCommunityAreaNums(neighborhood: string, communityArea: string): string[] {
  const nums = new Set<string>();
  const candidates = [neighborhood.toLowerCase(), communityArea.toLowerCase()];
  for (const c of candidates) {
    const num = COMMUNITY_AREA_NUMBERS[c];
    if (num) nums.add(num);
  }
  return Array.from(nums);
}
