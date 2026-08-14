export interface ListingUnitType {
  floorNumber: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  monthlyRent: number | null;
}

export interface ListingData {
  source: 'redfin' | 'unknown';
  scrapedAt: string;
  unitCount: number | null;
  unitTypes: ListingUnitType[];
  totalMonthlyRent: number | null;
  totalAnnualRent: number | null;
  propertyType: string | null;
  listPrice: number | null;
}

function parseDollarAmount(s: string): number | null {
  if (!s) return null;
  const num = parseFloat(s.replace(/[^0-9.]/g, ''));
  return isNaN(num) || num === 0 ? null : num;
}

function collectFacts(obj: any, depth = 0): Array<{ label: string; value: string }> {
  if (!obj || depth > 25 || typeof obj !== 'object') return [];
  if (Array.isArray(obj)) return obj.flatMap(item => collectFacts(item, depth + 1));

  const facts: Array<{ label: string; value: string }> = [];
  const label = obj.heading || obj.factLabel || obj.name || obj.label || null;
  const value = obj.value || obj.factValue || obj.displayValue || null;
  if (label && value && typeof label === 'string' && typeof value === 'string') {
    facts.push({ label: label.trim(), value: value.trim() });
  }
  for (const v of Object.values(obj)) facts.push(...collectFacts(v, depth + 1));
  return facts;
}

function buildListingDataFromFacts(facts: Array<{ label: string; value: string }>): Partial<ListingData> {
  const result: Partial<ListingData> = { unitTypes: [] };

  const find = (fn: (l: string) => boolean) => facts.find(f => fn(f.label.toLowerCase()));
  const findAll = (fn: (l: string) => boolean) => facts.filter(f => fn(f.label.toLowerCase()));

  const unitCountFact = find(l => l.includes('units in building') || (l.includes('# of units') && !l.includes('bedroom')));
  if (unitCountFact) result.unitCount = parseInt(unitCountFact.value.replace(/[^0-9]/g, '')) || null;

  const propTypeFact = find(l => l === 'property type' || l.includes('property type'));
  if (propTypeFact) result.propertyType = propTypeFact.value;

  const rentFacts = findAll(l => l === 'rent');
  const bedroomFacts = findAll(l => l === '# of bedrooms' || l === 'bedrooms');
  const bathroomFacts = findAll(l => l === '# of bathrooms (total)' || l === 'bathrooms');
  const floorFacts = findAll(l => l === 'floor number');

  if (rentFacts.length > 0) {
    result.unitTypes = rentFacts.map((rf, i) => ({
      floorNumber: floorFacts[i] ? parseInt(floorFacts[i].value) || null : i + 1,
      bedrooms: bedroomFacts[i] ? parseInt(bedroomFacts[i].value) || null : null,
      bathrooms: bathroomFacts[i] ? parseInt(bathroomFacts[i].value) || null : null,
      monthlyRent: parseDollarAmount(rf.value),
    }));
  }

  if (result.unitTypes && result.unitTypes.length > 0) {
    const total = result.unitTypes.reduce((sum, u) => sum + (u.monthlyRent || 0), 0);
    result.totalMonthlyRent = total > 0 ? total : null;
    result.totalAnnualRent = result.totalMonthlyRent ? result.totalMonthlyRent * 12 : null;
  }

  return result;
}

async function tryRedfinStingray(url: string): Promise<Partial<ListingData> | null> {
  const propertyIdMatch = url.match(/\/home\/(\d+)/);
  if (!propertyIdMatch) return null;
  const propertyId = propertyIdMatch[1];

  const endpoints = [
    `https://www.redfin.com/stingray/api/home/details/belowTheFold?propertyId=${propertyId}&accessLevel=3&pageType=1`,
    `https://www.redfin.com/stingray/api/home/details/aboveTheFold?propertyId=${propertyId}&accessLevel=3`,
  ];

  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(endpoint, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'Accept-Language': 'en-US,en;q=0.9',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://www.redfin.com/',
          'X-Requested-With': 'XMLHttpRequest',
        },
      });
      clearTimeout(timeout);

      if (!response.ok) continue;
      const rawText = await response.text();
      const jsonStart = rawText.indexOf('{');
      if (jsonStart === -1) continue;
      const parsed = JSON.parse(rawText.substring(jsonStart));
      if (!parsed?.payload) continue;

      const facts = collectFacts(parsed.payload);
      const data = buildListingDataFromFacts(facts);
      if (data.totalMonthlyRent || data.unitCount) {
        console.log(`[LISTING SCRAPER] Stingray success (${facts.length} facts, ${data.unitTypes?.length} unit types)`);
        return data;
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') console.log(`[LISTING SCRAPER] Stingray failed:`, err.message);
    }
  }
  return null;
}

async function tryScrapingBee(url: string): Promise<Partial<ListingData> | null> {
  const apiKey = process.env.SCRAPINGBEE_API_KEY;
  if (!apiKey) { console.log('[LISTING SCRAPER] No SCRAPINGBEE_API_KEY set'); return null; }

  try {
    const sbUrl = new URL('https://app.scrapingbee.com/api/v1/');
    sbUrl.searchParams.set('api_key', apiKey);
    sbUrl.searchParams.set('url', url);
    sbUrl.searchParams.set('render_js', 'false');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const response = await fetch(sbUrl.toString(), { signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) return null;

    const html = await response.text();
    return parseRedfinHtml(html);
  } catch (err: any) {
    console.error('[LISTING SCRAPER] ScrapingBee failed:', err.message);
    return null;
  }
}

function parseRedfinHtml(html: string): Partial<ListingData> | null {
  const result: Partial<ListingData> = { unitTypes: [] };

  const unitCountMatch = html.match(/(?:# Of Units in Building|Number of Units)[^:]*:\s*(\d+)/i);
  if (unitCountMatch) result.unitCount = parseInt(unitCountMatch[1]);

  const propTypeMatch = html.match(/Property Type[^:]*:\s*([A-Za-z\s]+?)(?:<|\n|&)/i);
  if (propTypeMatch) result.propertyType = propTypeMatch[1].trim();

  const rentMatches = [...html.matchAll(/\bRent[^:]*:\s*\$([0-9,]+)/gi)];
  if (rentMatches.length > 0) {
    result.unitTypes = rentMatches.map((m, i) => ({
      floorNumber: i + 1,
      bedrooms: null,
      bathrooms: null,
      monthlyRent: parseDollarAmount(m[1]),
    }));
    const total = result.unitTypes.reduce((sum, u) => sum + (u.monthlyRent || 0), 0);
    result.totalMonthlyRent = total > 0 ? total : null;
    result.totalAnnualRent = result.totalMonthlyRent ? result.totalMonthlyRent * 12 : null;
  }

  return (result.unitCount || result.totalMonthlyRent) ? result : null;
}

export async function scrapeListingUrl(url: string): Promise<ListingData | null> {
  try {
    const hostname = new URL(url).hostname;
    let data: Partial<ListingData> | null = null;

    if (hostname.includes('redfin.com')) {
      console.log('[LISTING SCRAPER] Starting Redfin scrape for:', url);
      data = await tryRedfinStingray(url);
      if (!data) data = await tryScrapingBee(url);
    }

    if (!data) {
      console.log('[LISTING SCRAPER] No data extracted for URL:', url);
      return null;
    }

    return {
      source: 'redfin',
      scrapedAt: new Date().toISOString(),
      unitCount: data.unitCount ?? null,
      unitTypes: data.unitTypes ?? [],
      totalMonthlyRent: data.totalMonthlyRent ?? null,
      totalAnnualRent: data.totalAnnualRent ?? null,
      propertyType: data.propertyType ?? null,
      listPrice: data.listPrice ?? null,
    };
  } catch (err: any) {
    console.error('[LISTING SCRAPER] Unexpected error:', err.message);
    return null;
  }
}
