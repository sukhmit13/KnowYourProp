import * as cheerio from 'cheerio';
import type { SbifEligibilityResult } from '@shared/schema';

const SBIF_URL = 'https://somercor.com/sbif/';
const CACHE_DURATION_MS = 6 * 60 * 60 * 1000;

interface SbifCache {
  authorizedDistricts: Set<string>;
  rolloutInfo: string | null;
  lastFetched: Date;
  rawDistrictNames: string[];
}

let sbifCache: SbifCache | null = null;

function normalizeDistrictName(name: string): string {
  return name
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\bTIF\b/gi, '')
    .replace(/\bREDEVELOPMENT\s+PROJECT\s+AREA\b/gi, '')
    .replace(/\bRPA\b/gi, '')
    .trim();
}

async function fetchAndParseSbifPage(): Promise<SbifCache | null> {
  try {
    console.log('Fetching SBIF data from SomerCor...');
    const response = await fetch(SBIF_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ChicagoEligibilityScreener/1.0)',
      },
    });

    if (!response.ok) {
      console.error(`Failed to fetch SBIF page: ${response.status} ${response.statusText}`);
      return null;
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const authorizedDistricts = new Set<string>();
    const rawDistrictNames: string[] = [];

    $('select option, .tif-list li, .district-list li, [data-tif], .sbif-district').each((_, el) => {
      const text = $(el).text().trim();
      if (text && text.length > 2 && !text.toLowerCase().includes('select')) {
        rawDistrictNames.push(text);
        authorizedDistricts.add(normalizeDistrictName(text));
      }
    });

    $('option').each((_, el) => {
      const text = $(el).text().trim();
      const value = $(el).attr('value');
      if (text && text.length > 2 && value && value !== '' && !text.toLowerCase().includes('select')) {
        rawDistrictNames.push(text);
        authorizedDistricts.add(normalizeDistrictName(text));
      }
    });

    $('ul li, ol li').each((_, el) => {
      const text = $(el).text().trim();
      if (text.match(/TIF|redevelopment|district/i) && text.length < 100) {
        rawDistrictNames.push(text);
        authorizedDistricts.add(normalizeDistrictName(text));
      }
    });

    let rolloutInfo: string | null = null;
    $('p, div, span').each((_, el) => {
      const text = $(el).text().trim();
      if (text.match(/rollout|schedule|open|accepting|application/i) && text.length < 500) {
        if (!rolloutInfo || text.length > rolloutInfo.length) {
          rolloutInfo = text;
        }
      }
    });

    console.log(`Parsed ${authorizedDistricts.size} unique SBIF-authorized districts from SomerCor`);
    if (authorizedDistricts.size > 0) {
      console.log('Sample districts:', Array.from(authorizedDistricts).slice(0, 5));
    }

    const uniqueRawNames = rawDistrictNames.filter((name, index, arr) => arr.indexOf(name) === index);
    
    return {
      authorizedDistricts,
      rolloutInfo,
      lastFetched: new Date(),
      rawDistrictNames: uniqueRawNames,
    };
  } catch (err) {
    console.error('Error fetching/parsing SBIF page:', err);
    return null;
  }
}

async function getSbifCache(): Promise<SbifCache | null> {
  const now = new Date();
  
  if (sbifCache && (now.getTime() - sbifCache.lastFetched.getTime()) < CACHE_DURATION_MS) {
    return sbifCache;
  }

  const newCache = await fetchAndParseSbifPage();
  if (newCache) {
    sbifCache = newCache;
  }
  
  return sbifCache;
}

export async function evaluateSbifEligibility(tifName: string | null): Promise<SbifEligibilityResult> {
  const verificationUrl = SBIF_URL;

  if (!tifName || tifName === 'Not in TIF District' || tifName === 'Data not configured') {
    return {
      tif: {
        inTif: false,
        districtName: null,
      },
      sbif: {
        authorized: false,
        status: 'not_scheduled',
        statusLabel: 'Not eligible (not in a TIF district)',
        verificationUrl,
        notes: 'SBIF is only available for properties within designated TIF districts.',
      },
      lastUpdated: null,
    };
  }

  const cache = await getSbifCache();
  
  if (!cache || cache.authorizedDistricts.size === 0) {
    return {
      tif: {
        inTif: true,
        districtName: tifName,
      },
      sbif: {
        authorized: false,
        status: 'unknown',
        statusLabel: 'Unable to verify SBIF authorization',
        verificationUrl,
        notes: 'Could not fetch current SBIF-authorized districts from SomerCor. Please verify manually.',
      },
      lastUpdated: null,
    };
  }

  const normalizedTifName = normalizeDistrictName(tifName);
  
  let isAuthorized = cache.authorizedDistricts.has(normalizedTifName);
  const districtsArray = Array.from(cache.authorizedDistricts);
  
  if (!isAuthorized) {
    for (const district of districtsArray) {
      if (district.includes(normalizedTifName) || normalizedTifName.includes(district)) {
        isAuthorized = true;
        break;
      }
    }
  }

  if (!isAuthorized) {
    const tifWords = normalizedTifName.split(' ').filter(w => w.length > 3);
    for (const district of districtsArray) {
      const matchCount = tifWords.filter(word => district.includes(word)).length;
      if (matchCount >= 2 || (tifWords.length === 1 && matchCount === 1)) {
        isAuthorized = true;
        break;
      }
    }
  }

  let status: 'open' | 'upcoming' | 'not_scheduled' = 'not_scheduled';
  let statusLabel = '';
  
  if (isAuthorized) {
    if (cache.rolloutInfo?.match(/now\s+open|currently\s+accepting|open\s+for/i)) {
      status = 'open';
      statusLabel = 'SBIF Authorized - Currently Open';
    } else if (cache.rolloutInfo?.match(/upcoming|scheduled|coming\s+soon/i)) {
      status = 'upcoming';
      statusLabel = 'SBIF Authorized - Upcoming Rollout';
    } else {
      status = 'open';
      statusLabel = 'SBIF Authorized';
    }
  } else {
    status = 'not_scheduled';
    statusLabel = 'Not eligible (SBIF not authorized for this TIF)';
  }

  return {
    tif: {
      inTif: true,
      districtName: tifName,
    },
    sbif: {
      authorized: isAuthorized,
      status,
      statusLabel,
      verificationUrl,
      notes: isAuthorized 
        ? cache.rolloutInfo || 'Verify current application windows on SomerCor website.'
        : `This TIF district is not currently on the SBIF-authorized list. ${cache.authorizedDistricts.size} districts are currently authorized.`,
    },
    lastUpdated: cache.lastFetched.toISOString(),
  };
}

export async function refreshSbifCache(): Promise<void> {
  sbifCache = null;
  await getSbifCache();
}

export async function getSbifAuthorizedDistricts(): Promise<string[]> {
  const cache = await getSbifCache();
  return cache ? cache.rawDistrictNames : [];
}
