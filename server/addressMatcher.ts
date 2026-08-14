/**
 * Enhanced Address Matching System
 * Uses Cook County datasets for comprehensive address-to-PIN resolution
 * 
 * Datasets:
 * - 78yw-iddh: Address Points (detailed address components with PIN)
 * - 3723-97qp: Parcel Addresses (PIN to property address mapping)
 * - nj4t-kc8j: Parcel Universe (lat/long, census data)
 */

interface AddressPoint {
  pin: string;
  add_number: string;
  st_predir: string | null;
  st_name: string;
  st_postyp: string | null;
  lst_predir: string | null;
  cmpaddabrv: string;
  addrdeliv: string;
  lat: string;
  long: string;
  placename: string;
}

interface ParcelAddress {
  pin: string;
  prop_address_full: string;
  prop_address_city_name: string;
  year: string;
}

interface ParcelUniverse {
  pin: string;
  lat: string;
  lon: string;
  class: string;
  township_name: string;
  chicago_community_area_name?: string;
  ward_num?: string;
}

interface AddressMatchResult {
  pin: string;
  matchType: 'exact' | 'fuzzy' | 'range' | 'nearby' | 'spatial';
  confidence: number;
  matchedAddress: string;
  lat?: number;
  lon?: number;
  details?: string;
}

// Normalize street direction abbreviations
function normalizeDirection(dir: string | null | undefined): string {
  if (!dir) return '';
  const upper = dir.toUpperCase().trim();
  const map: Record<string, string> = {
    'NORTH': 'N', 'SOUTH': 'S', 'EAST': 'E', 'WEST': 'W',
    'NORTHEAST': 'NE', 'NORTHWEST': 'NW', 'SOUTHEAST': 'SE', 'SOUTHWEST': 'SW'
  };
  return map[upper] || upper;
}

// Normalize street type abbreviations
function normalizeStreetType(type: string | null | undefined): string {
  if (!type) return '';
  const upper = type.toUpperCase().trim();
  const map: Record<string, string> = {
    'AVENUE': 'AVE', 'STREET': 'ST', 'BOULEVARD': 'BLVD', 'DRIVE': 'DR',
    'ROAD': 'RD', 'PLACE': 'PL', 'COURT': 'CT', 'LANE': 'LN',
    'CIRCLE': 'CIR', 'TERRACE': 'TER', 'PARKWAY': 'PKWY', 'WAY': 'WAY'
  };
  return map[upper] || upper;
}

// Parse an address string into components
export function parseAddress(address: string): {
  number: number | null;
  direction: string;
  streetName: string;
  streetType: string;
  unit?: string;
} {
  let normalized = address.toUpperCase().trim()
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ');
  
  // Strip city, state, zip patterns
  // Pattern: CHICAGO IL 60612 or CHICAGO, IL 60612 or just IL 60612
  normalized = normalized
    .replace(/\s+CHICAGO\s+IL\s+\d{5}(-\d{4})?$/i, '')
    .replace(/\s+CHICAGO\s+ILLINOIS\s+\d{5}(-\d{4})?$/i, '')
    .replace(/\s+IL\s+\d{5}(-\d{4})?$/i, '')
    .replace(/\s+ILLINOIS\s+\d{5}(-\d{4})?$/i, '')
    .replace(/\s+CHICAGO\s+IL$/i, '')
    .replace(/\s+CHICAGO\s+ILLINOIS$/i, '')
    .replace(/\s+CHICAGO$/i, '')
    .replace(/\s+\d{5}(-\d{4})?$/i, '')
    .trim();
  
  // Extract unit/apt if present
  let mainAddress = normalized;
  let unit: string | undefined;
  const unitMatch = normalized.match(/\s+(APT|UNIT|STE|SUITE|#|FL|FLOOR)\s*(\S+)$/i);
  if (unitMatch) {
    unit = unitMatch[0].trim();
    mainAddress = normalized.replace(unitMatch[0], '').trim();
  }
  
  // Parse components
  const parts = mainAddress.split(' ');
  
  // Extract street number
  let number: number | null = null;
  let startIdx = 0;
  if (parts.length > 0 && /^\d+(-\d+)?$/.test(parts[0])) {
    // Handle range addresses like "134-206"
    const numPart = parts[0].split('-')[0];
    number = parseInt(numPart, 10);
    startIdx = 1;
  }
  
  // Extract direction (if present)
  let direction = '';
  if (parts.length > startIdx) {
    const possibleDir = normalizeDirection(parts[startIdx]);
    if (['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW'].includes(possibleDir)) {
      direction = possibleDir;
      startIdx++;
    }
  }
  
  // Extract street type (usually last)
  let streetType = '';
  const remaining = parts.slice(startIdx);
  if (remaining.length > 0) {
    const lastPart = remaining[remaining.length - 1];
    const normalizedType = normalizeStreetType(lastPart);
    if (['AVE', 'ST', 'BLVD', 'DR', 'RD', 'PL', 'CT', 'LN', 'CIR', 'TER', 'PKWY', 'WAY'].includes(normalizedType)) {
      streetType = normalizedType;
      remaining.pop();
    }
  }
  
  // Rest is street name
  const streetName = remaining.join(' ');
  
  return { number, direction, streetName, streetType, unit };
}

// Build search query for address points dataset
function buildAddressPointsQuery(parsed: ReturnType<typeof parseAddress>): string {
  const conditions: string[] = [];
  
  if (parsed.number !== null) {
    conditions.push(`add_number='${parsed.number}'`);
  }
  
  if (parsed.direction) {
    conditions.push(`(lst_predir='${parsed.direction}' OR st_predir like '%${parsed.direction === 'N' ? 'NORTH' : parsed.direction === 'S' ? 'SOUTH' : parsed.direction === 'E' ? 'EAST' : parsed.direction === 'W' ? 'WEST' : parsed.direction}%')`);
  }
  
  if (parsed.streetName) {
    conditions.push(`upper(st_name)='${parsed.streetName}'`);
  }
  
  return conditions.join(' AND ');
}

// Fetch with timeout helper
async function fetchWithTimeout(url: string, timeoutMs: number = 8000): Promise<Response | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    return response;
  } catch (error: any) {
    clearTimeout(timeout);
    if (error.name === 'AbortError') {
      console.log('[AddressMatcher] Request timed out');
    }
    return null;
  }
}

// Search Address Points dataset (78yw-iddh)
async function searchAddressPoints(address: string): Promise<AddressMatchResult | null> {
  const parsed = parseAddress(address);
  
  if (!parsed.streetName) {
    return null;
  }
  
  try {
    // Try exact match first
    let query = buildAddressPointsQuery(parsed);
    let url = `https://datacatalog.cookcountyil.gov/resource/78yw-iddh.json?$limit=10&$where=${encodeURIComponent(query)}&placename=Chicago`;
    
    let response = await fetchWithTimeout(url);
    if (!response || !response.ok) {
      console.log('[AddressMatcher] Address Points API error or timeout');
      return null;
    }
    
    let results: AddressPoint[] = await response.json();
    
    // Filter to Chicago only
    results = results.filter(r => 
      r.placename?.toUpperCase() === 'CHICAGO' || 
      r.cmpaddabrv?.includes('CHICAGO')
    );
    
    if (results.length > 0) {
      const match = results[0];
      return {
        pin: match.pin,
        matchType: 'exact',
        confidence: 100,
        matchedAddress: match.cmpaddabrv || match.addrdeliv,
        lat: parseFloat(match.lat),
        lon: parseFloat(match.long),
        details: 'Matched via Address Points dataset'
      };
    }
    
    // Try nearby address match - search for addresses within ±100 of target number
    if (parsed.streetName && parsed.number !== null) {
      const lowerBound = Math.max(0, parsed.number - 100);
      const upperBound = parsed.number + 100;
      const fuzzyQuery = `upper(st_name)='${parsed.streetName}'${parsed.direction ? ` AND lst_predir='${parsed.direction}'` : ''} AND add_number >= '${lowerBound}' AND add_number <= '${upperBound}'`;
      url = `https://datacatalog.cookcountyil.gov/resource/78yw-iddh.json?$limit=50&$where=${encodeURIComponent(fuzzyQuery)}&placename=Chicago`;
      
      response = await fetchWithTimeout(url);
      if (response && response.ok) {
        results = await response.json();
        
        if (results.length > 0) {
          // Find closest address number
          let closest: AddressPoint | null = null;
          let closestDiff = Infinity;
          
          for (const r of results) {
            const addrNum = parseInt(r.add_number, 10);
            if (!isNaN(addrNum)) {
              const diff = Math.abs(addrNum - parsed.number);
              if (diff < closestDiff) {
                closestDiff = diff;
                closest = r;
              }
            }
          }
          
          if (closest && closestDiff <= 50) {
            return {
              pin: closest.pin,
              matchType: closestDiff === 0 ? 'exact' : 'range',
              confidence: closestDiff === 0 ? 100 : Math.max(50, 100 - closestDiff * 2),
              matchedAddress: closest.cmpaddabrv || closest.addrdeliv,
              lat: parseFloat(closest.lat),
              lon: parseFloat(closest.long),
              details: closestDiff === 0 
                ? 'Matched via Address Points dataset'
                : `Address ${parsed.number} likely within parcel at ${closest.add_number} (diff: ${closestDiff})`
            };
          }
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error('[AddressMatcher] Error searching address points:', error);
    return null;
  }
}

// Search Parcel Addresses dataset (3723-97qp) - most reliable for range matching
async function searchParcelAddresses(address: string): Promise<AddressMatchResult | null> {
  const parsed = parseAddress(address);
  
  if (!parsed.streetName || parsed.number === null) {
    return null;
  }
  
  try {
    // Search for addresses with similar street numbers on the same street
    // For 148 S California, find 134 S California which is the actual parcel
    
    // Create a search pattern that looks for addresses starting with nearby numbers
    // e.g., for 148, search for "1__ S CALIFORNIA" pattern
    const numStr = parsed.number.toString();
    const searchBase = numStr.length >= 2 ? numStr.substring(0, numStr.length - 1) : numStr;
    
    // Search for addresses starting with same leading digits (e.g., "1" for 100-199)
    const searchPattern = `${searchBase}%${parsed.direction ? parsed.direction + ' ' : ''}${parsed.streetName}`;
    const url = `https://datacatalog.cookcountyil.gov/resource/3723-97qp.json?$limit=50&$where=upper(prop_address_full) like '${encodeURIComponent(searchPattern)}%25' AND prop_address_city_name='CHICAGO'&$order=year DESC`;
    
    console.log(`[AddressMatcher] Searching Parcel Addresses: ${searchPattern}`);
    const response = await fetchWithTimeout(url);
    if (!response || !response.ok) {
      console.log('[AddressMatcher] Parcel Addresses API error or timeout');
      return null;
    }
    
    const results: ParcelAddress[] = await response.json();
    console.log(`[AddressMatcher] Parcel Addresses found ${results.length} results`);
    
    if (results.length > 0) {
      // Deduplicate by PIN (same property may appear multiple times across years)
      const byPin = new Map<string, ParcelAddress>();
      for (const r of results) {
        if (!byPin.has(r.pin)) {
          byPin.set(r.pin, r);
        }
      }
      
      // Find the closest address number
      let closest: ParcelAddress | null = null;
      let closestDiff = Infinity;
      
      for (const r of Array.from(byPin.values())) {
        // Parse the address number from prop_address_full
        const addrMatch = r.prop_address_full?.match(/^(\d+)/);
        if (addrMatch) {
          const addrNum = parseInt(addrMatch[1], 10);
          const diff = Math.abs(addrNum - parsed.number!);
          console.log(`[AddressMatcher] Comparing ${addrNum} vs ${parsed.number}: diff = ${diff}`);
          if (diff < closestDiff) {
            closestDiff = diff;
            closest = r;
          }
        }
      }
      
      if (closest && closestDiff <= 100) {
        // Get coordinates from Parcel Universe
        const coords = await getParcelCoordinates(closest.pin);
        
        console.log(`[AddressMatcher] Best match: ${closest.prop_address_full} (PIN: ${closest.pin}, diff: ${closestDiff})`);
        
        return {
          pin: closest.pin,
          matchType: closestDiff === 0 ? 'exact' : 'range',
          confidence: closestDiff === 0 ? 95 : Math.max(60, 95 - closestDiff),
          matchedAddress: closest.prop_address_full,
          lat: coords?.lat,
          lon: coords?.lon,
          details: closestDiff === 0 
            ? 'Matched via Parcel Addresses dataset'
            : `Address ${parsed.number} likely within parcel at ${closest.prop_address_full} (diff: ${closestDiff})`
        };
      }
    }
    
    return null;
  } catch (error) {
    console.error('[AddressMatcher] Error searching parcel addresses:', error);
    return null;
  }
}

// Get coordinates from Parcel Universe dataset
async function getParcelCoordinates(pin: string): Promise<{ lat: number; lon: number } | null> {
  try {
    const url = `https://datacatalog.cookcountyil.gov/resource/nj4t-kc8j.json?pin=${pin}&$limit=1&$order=year DESC`;
    const response = await fetchWithTimeout(url, 5000);
    
    if (!response || !response.ok) {
      return null;
    }
    
    const results: ParcelUniverse[] = await response.json();
    
    if (results.length > 0 && results[0].lat && results[0].lon) {
      return {
        lat: parseFloat(results[0].lat),
        lon: parseFloat(results[0].lon)
      };
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

// Main address matching function
export async function matchAddress(address: string): Promise<AddressMatchResult | null> {
  console.log(`[AddressMatcher] Matching address: ${address}`);
  
  const parsed = parseAddress(address);
  console.log(`[AddressMatcher] Parsed:`, parsed);
  
  // 1. Try Address Points dataset for exact match
  let result = await searchAddressPoints(address);
  if (result && result.confidence >= 80) {
    console.log(`[AddressMatcher] Found via Address Points: ${result.pin} (${result.confidence}%)`);
    return result;
  }
  
  // 2. Try Parcel Addresses dataset (best for range matching)
  const parcelResult = await searchParcelAddresses(address);
  if (parcelResult && (!result || parcelResult.confidence > result.confidence)) {
    result = parcelResult;
    console.log(`[AddressMatcher] Found via Parcel Addresses: ${result.pin} (${result.confidence}%)`);
  }
  
  if (result) {
    return result;
  }
  
  console.log(`[AddressMatcher] No match found for: ${address}`);
  return null;
}

// Export for use in pinResolver
export { AddressMatchResult };
