import { db } from './db';
import { pinLookupCache, type PinLookupResult } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { matchAddress } from './addressMatcher';

const CACHE_DURATION_DAYS = 30;
const ASSESSOR_API_BASE = 'https://datacatalog.cookcountyil.gov/resource/c49d-89sn.json';
const COMMERCIAL_API_BASE = 'https://datacatalog.cookcountyil.gov/resource/csik-bsws.json';
const CHARACTERISTICS_API_BASE = 'https://datacatalog.cookcountyil.gov/resource/x54s-btds.json';
const CONDO_API_BASE = 'https://datacatalog.cookcountyil.gov/resource/3r7i-mrz4.json';
const SALE_HISTORY_API_BASE = 'https://datacatalog.cookcountyil.gov/resource/wvhk-k5uv.json';
const SALE_HISTORY_ARCHIVED_API_BASE = 'https://datacatalog.cookcountyil.gov/resource/93st-4bxh.json';
const APPEAL_HISTORY_API_BASE = 'https://datacatalog.cookcountyil.gov/resource/7pny-nedm.json';
const ASSESSED_VALUES_API_BASE = 'https://datacatalog.cookcountyil.gov/resource/uzyt-m557.json';
const PROXIMITY_API_BASE = 'https://datacatalog.cookcountyil.gov/resource/ydue-e5u3.json';

const DIRECTION_MAP: Record<string, string> = {
  'NORTH': 'N',
  'SOUTH': 'S',
  'EAST': 'E',
  'WEST': 'W',
  'N': 'N',
  'S': 'S',
  'E': 'E',
  'W': 'W',
};

function escapeQuotes(str: string): string {
  return str.replace(/'/g, "''");
}

// Streets whose common shorthand doesn't match the Assessor's stored name.
// Keys are the normalized short form; values are all Assessor variants to try.
const STREET_NAME_ALIASES: Record<string, string[]> = {
  'KING':               ['MARTIN LUTHER KING'],
  'MLK':                ['MARTIN LUTHER KING'],
  'MARTIN LUTHER KING': ['MARTIN LUTHER KING'],  // passthrough — already correct
  'DR KING':            ['MARTIN LUTHER KING'],
};

function normalizeAddress(address: string): {
  houseNumber: string;
  streetDirection: string;
  streetName: string;
  streetSuffix: string;
} {
  const upper = address.toUpperCase().trim();
  
  const match = upper.match(/^(\d+)\s+(?:(N|S|E|W|NORTH|SOUTH|EAST|WEST)\.?\s+)?(.+?)(?:\s+(ST|STREET|AVE|AVENUE|BLVD|BOULEVARD|DR|DRIVE|RD|ROAD|CT|COURT|PL|PLACE|WAY|LN|LANE|TER|TERRACE|PKWY|PARKWAY|CIR|CIRCLE))?(?:,|\s|$)/i);
  
  if (!match) {
    return { houseNumber: '', streetDirection: '', streetName: '', streetSuffix: '' };
  }
  
  const houseNumber = match[1] || '';
  const rawDirection = (match[2] || '').replace(/\./g, '').trim();
  const streetDirection = DIRECTION_MAP[rawDirection] || '';
  let streetName = (match[3] || '').trim();
  const streetSuffix = (match[4] || '').trim();
  
  streetName = streetName.replace(/\s+(ST|STREET|AVE|AVENUE|BLVD|BOULEVARD|DR|DRIVE|RD|ROAD|CT|COURT|PL|PLACE|WAY|LN|LANE|TER|TERRACE|PKWY|PARKWAY|CIR|CIRCLE)$/i, '');
  
  return { houseNumber, streetDirection, streetName, streetSuffix };
}

function createCacheKey(address: string): string {
  const normalized = address.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return normalized;
}

async function queryAssessorByName(
  houseNumber: string,
  streetDirection: string,
  streetName: string,
  lat?: number,
  lon?: number,
  unitNumber?: string
): Promise<{ pin: string | null; confidence: 'high' | 'medium' | 'low' }> {
  const params = new URLSearchParams();
  params.set('$limit', '50');
  
  const escapedStreetName = escapeQuotes(streetName);
  let query: string;
  if (streetDirection) {
    query = `property_address like '${houseNumber} ${streetDirection} ${escapedStreetName}%'`;
  } else {
    query = `property_address like '${houseNumber} %${escapedStreetName}%'`;
  }
  query += ` AND property_city = 'CHICAGO'`;
  
  params.set('$where', query);
  
  const url = `${ASSESSOR_API_BASE}?${params.toString()}`;
  
  const response = await fetch(url, { headers: { 'Accept': 'application/json' } });
  
  if (!response.ok) {
    console.error(`Assessor API error: ${response.status}`);
    return { pin: null, confidence: 'low' };
  }
  
  const data = await response.json();
  
  if (!Array.isArray(data) || data.length === 0) {
    return { pin: null, confidence: 'low' };
  }

  if (unitNumber && data.length > 1) {
    const normalizedUnit = unitNumber.toUpperCase().replace(/^(UNIT|APT|STE|SUITE|#)\s*/i, '').trim();
    const unitMatch = data.find((r: any) => {
      const apt = (r.property_apt_no || '').trim().toUpperCase();
      return apt === normalizedUnit;
    });
    if (unitMatch) {
      const pin = unitMatch.pin || unitMatch.pin14 || null;
      console.log(`[ASSESSOR] Matched unit ${normalizedUnit} to PIN: ${pin}`);
      return { pin, confidence: 'high' };
    }
    const partialMatch = data.find((r: any) => {
      const apt = (r.property_apt_no || '').trim().toUpperCase();
      return apt.includes(normalizedUnit) || normalizedUnit.includes(apt);
    });
    if (partialMatch) {
      const pin = partialMatch.pin || partialMatch.pin14 || null;
      console.log(`[ASSESSOR] Partial unit match ${normalizedUnit} to PIN: ${pin}`);
      return { pin, confidence: 'medium' };
    }
  }
  
  if (data.length === 1) {
    const pin = data[0].pin || data[0].pin14 || null;
    return { pin, confidence: 'high' };
  }
  
  if (lat !== undefined && lon !== undefined) {
    let closestPin: string | null = null;
    let closestDist = Infinity;
    
    for (const record of data) {
      const recLat = parseFloat(record.latitude || record.lat);
      const recLon = parseFloat(record.longitude || record.lon || record.lng);
      
      if (!isNaN(recLat) && !isNaN(recLon)) {
        const dist = Math.sqrt(Math.pow(recLat - lat, 2) + Math.pow(recLon - lon, 2));
        if (dist < closestDist) {
          closestDist = dist;
          closestPin = record.pin || record.pin14;
        }
      }
    }
    
    if (closestPin && closestDist < 0.001) {
      return { pin: closestPin, confidence: 'high' };
    } else if (closestPin) {
      return { pin: closestPin, confidence: 'medium' };
    }
  }
  
  const firstPin = data[0].pin || data[0].pin14 || null;
  return { pin: firstPin, confidence: 'medium' };
}

async function lookupPinFromAssessor(
  houseNumber: string,
  streetDirection: string,
  streetName: string,
  lat?: number,
  lon?: number,
  unitNumber?: string
): Promise<{ pin: string | null; confidence: 'high' | 'medium' | 'low' }> {
  try {
    // Primary lookup using the street name as parsed from the input
    const primary = await queryAssessorByName(houseNumber, streetDirection, streetName, lat, lon, unitNumber);
    if (primary.pin) return primary;

    // If nothing found, check whether the street name has known Assessor aliases
    // (e.g. user types "King Dr" but Assessor stores "Martin Luther King Dr")
    const upperStreet = streetName.toUpperCase().trim();
    const aliases = STREET_NAME_ALIASES[upperStreet];
    if (aliases && aliases.length > 0) {
      for (const alias of aliases) {
        if (alias.toUpperCase() === upperStreet) continue; // skip identity entries
        console.log(`[ASSESSOR] Retrying with street alias: "${streetName}" → "${alias}"`);
        const aliasResult = await queryAssessorByName(houseNumber, streetDirection, alias, lat, lon, unitNumber);
        if (aliasResult.pin) return aliasResult;
      }
    }

    return { pin: null, confidence: 'low' };
  } catch (err) {
    console.error('Error looking up PIN from assessor:', err);
    return { pin: null, confidence: 'low' };
  }
}

interface CommercialLookupResult {
  pin: string | null;
  confidence: 'high' | 'medium' | 'low';
  propertyType?: string;
  commercialData?: {
    bldgSf?: number;
    landSf?: number;
    yearBuilt?: number;
    marketValue?: number;
    propertyTypeUse?: string;
  };
}

// Exempt parcels API (non-profits, government, religious, etc.)
const EXEMPT_PARCELS_API = 'https://datacatalog.cookcountyil.gov/resource/vgzx-68gb.json';

// Geo-based fallback: find nearest parcel by lat/lon
const PARCEL_UNIVERSE_API = 'https://datacatalog.cookcountyil.gov/resource/c49d-89sn.json';

interface ExemptParcelResult {
  pin: string | null;
  ownerName: string | null;
  propertyClass: string | null;
  confidence: 'high' | 'medium' | 'low';
}

async function lookupExemptParcel(
  houseNumber: string,
  streetDirection: string,
  streetName: string,
  lat?: number,
  lon?: number
): Promise<ExemptParcelResult> {
  try {
    // First try address-based lookup
    const escapedStreetName = escapeQuotes(streetName);
    let addressQuery: string;
    if (streetDirection) {
      const addressPattern = `${houseNumber} ${streetDirection} ${escapedStreetName}`;
      addressQuery = `property_address like '%${addressPattern}%' AND property_city = 'CHICAGO'`;
    } else {
      addressQuery = `property_address like '%${houseNumber}%${escapedStreetName}%' AND property_city = 'CHICAGO'`;
    }
    
    const params = new URLSearchParams();
    params.set('$limit', '10');
    params.set('$where', addressQuery);
    
    const url = `${EXEMPT_PARCELS_API}?${params.toString()}`;
    console.log(`[EXEMPT API] Querying by address: ${addressQuery}`);
    
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });
    
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        // Found by address
        const record = data[0];
        console.log(`[EXEMPT API] Found exempt property: ${record.owner_name}`);
        return {
          pin: record.pin,
          ownerName: record.owner_name,
          propertyClass: record.class,
          confidence: data.length === 1 ? 'high' : 'medium',
        };
      }
    }
    
    // If address lookup failed, try lat/lon lookup
    if (lat !== undefined && lon !== undefined) {
      const latDelta = 0.0005; // ~55 meters
      const lonDelta = 0.0005;
      
      const geoParams = new URLSearchParams();
      geoParams.set('$limit', '10');
      geoParams.set('$where', `lat between '${lat - latDelta}' and '${lat + latDelta}' AND lon between '${lon - lonDelta}' and '${lon + lonDelta}' AND property_city = 'CHICAGO'`);
      
      const geoUrl = `${EXEMPT_PARCELS_API}?${geoParams.toString()}`;
      console.log(`[EXEMPT API] Trying geo lookup near ${lat}, ${lon}`);
      
      const geoResponse = await fetch(geoUrl, {
        headers: { 'Accept': 'application/json' },
      });
      
      if (geoResponse.ok) {
        const geoData = await geoResponse.json();
        if (Array.isArray(geoData) && geoData.length > 0) {
          // Find closest by distance
          let closest = geoData[0];
          let closestDist = Infinity;
          
          for (const record of geoData) {
            const recLat = parseFloat(record.lat);
            const recLon = parseFloat(record.lon);
            if (isNaN(recLat) || isNaN(recLon)) continue;
            
            const dist = Math.sqrt(Math.pow(recLat - lat, 2) + Math.pow(recLon - lon, 2));
            if (dist < closestDist) {
              closestDist = dist;
              closest = record;
            }
          }
          
          console.log(`[EXEMPT API] Found nearby exempt property: ${closest.owner_name} at ${closest.property_address}`);
          return {
            pin: closest.pin,
            ownerName: closest.owner_name,
            propertyClass: closest.class,
            confidence: 'low',
          };
        }
      }
    }
    
    return { pin: null, ownerName: null, propertyClass: null, confidence: 'low' };
  } catch (error) {
    console.error('[EXEMPT API] Error:', error);
    return { pin: null, ownerName: null, propertyClass: null, confidence: 'low' };
  }
}

async function lookupPinByLocation(
  lat: number,
  lon: number
): Promise<{ pin: string | null; nearestAddress: string | null }> {
  try {
    // Search within ~200 meters using lat/lon bounding box
    const latDelta = 0.002; // ~220 meters
    const lonDelta = 0.002;
    
    const params = new URLSearchParams();
    params.set('$limit', '10');
    params.set('$select', 'pin,property_address,latitude,longitude');
    params.set('$where', `latitude between ${lat - latDelta} and ${lat + latDelta} AND longitude between ${lon - lonDelta} and ${lon + lonDelta}`);
    
    const url = `${PARCEL_UNIVERSE_API}?${params.toString()}`;
    console.log(`[GEO FALLBACK] Querying parcels near ${lat}, ${lon}`);
    
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });
    
    if (!response.ok) {
      console.error(`[GEO FALLBACK] API error: ${response.status}`);
      return { pin: null, nearestAddress: null };
    }
    
    const data = await response.json();
    
    if (!Array.isArray(data) || data.length === 0) {
      console.log('[GEO FALLBACK] No parcels found in area');
      return { pin: null, nearestAddress: null };
    }
    
    // Find the closest parcel by distance
    let closestPin: string | null = null;
    let closestAddress: string | null = null;
    let closestDist = Infinity;
    
    for (const record of data) {
      const recLat = parseFloat(record.latitude);
      const recLon = parseFloat(record.longitude);
      if (isNaN(recLat) || isNaN(recLon)) continue;
      
      const dist = Math.sqrt(Math.pow(recLat - lat, 2) + Math.pow(recLon - lon, 2));
      if (dist < closestDist) {
        closestDist = dist;
        closestPin = record.pin;
        closestAddress = record.property_address;
      }
    }
    
    if (closestPin) {
      console.log(`[GEO FALLBACK] Found nearest parcel: ${closestAddress} (PIN: ${closestPin})`);
      return { pin: closestPin, nearestAddress: closestAddress };
    }
    
    return { pin: null, nearestAddress: null };
  } catch (error) {
    console.error('[GEO FALLBACK] Error:', error);
    return { pin: null, nearestAddress: null };
  }
}

async function lookupCommercialByPin(pin: string): Promise<CommercialLookupResult> {
  try {
    const cleanPin = pin.replace(/[^0-9]/g, '');
    const params = new URLSearchParams();
    params.set('$where', `pin='${cleanPin}'`);
    params.set('$select', 'property_address');
    params.set('$limit', '1');
    const resp = await fetch(`${ASSESSOR_API_BASE}?${params.toString()}`, {
      headers: { 'Accept': 'application/json' },
    });
    if (!resp.ok) return { pin: null, confidence: 'low' };
    const data = await resp.json();
    if (!Array.isArray(data) || data.length === 0 || !data[0].property_address) {
      return { pin: null, confidence: 'low' };
    }
    const registeredAddress = data[0].property_address as string;
    console.log(`[COMMERCIAL BY PIN] Got registered address: ${registeredAddress}`);
    const { houseNumber: hn, streetDirection: sd, streetName: sn } = normalizeAddress(registeredAddress);
    if (!hn || !sn) return { pin: null, confidence: 'low' };
    return lookupPinFromCommercial(hn, sd, sn);
  } catch (e) {
    return { pin: null, confidence: 'low' };
  }
}

async function lookupPinFromCommercial(
  houseNumber: string,
  streetDirection: string,
  streetName: string
): Promise<CommercialLookupResult> {
  try {
    const params = new URLSearchParams();
    params.set('$limit', '10');
    
    const escapedStreetName = escapeQuotes(streetName);
    let query: string;
    if (streetDirection) {
      const addressPattern = `${houseNumber} ${streetDirection} ${escapedStreetName}`;
      query = `address like '%${addressPattern}%'`;
    } else {
      query = `address like '%${houseNumber}%${escapedStreetName}%'`;
    }
    
    params.set('$where', query);
    
    const url = `${COMMERCIAL_API_BASE}?${params.toString()}`;
    console.log(`[COMMERCIAL API] Querying: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      console.error(`Commercial API error: ${response.status}`);
      return { pin: null, confidence: 'low' };
    }
    
    const data = await response.json();
    
    if (!Array.isArray(data) || data.length === 0) {
      // Try street name aliases before giving up
      const upperStreet = streetName.toUpperCase().trim();
      const aliases = STREET_NAME_ALIASES[upperStreet];
      if (aliases && aliases.length > 0) {
        for (const alias of aliases) {
          if (alias.toUpperCase() === upperStreet) continue;
          console.log(`[COMMERCIAL API] Retrying with street alias: "${streetName}" → "${alias}"`);
          return lookupPinFromCommercial(houseNumber, streetDirection, alias);
        }
      }
      console.log('[COMMERCIAL API] No results found');
      return { pin: null, confidence: 'low' };
    }
    
    console.log(`[COMMERCIAL API] Found ${data.length} results`);
    
    const record = data[0];
    const pin = record.keypin || record.pins?.split(',')[0]?.trim() || null;
    const propertyType = record.property_type_use || null;
    
    // Capture all populated fields from commercial dataset
    const commercialData: Record<string, any> = {};
    
    // Core property info
    if (record.keypin) commercialData.keypin = record.keypin;
    if (record.pins) commercialData.pins = record.pins;
    if (record.property_type_use) commercialData.propertyTypeUse = record.property_type_use;
    if (record.bldgsf) commercialData.bldgSf = parseFloat(record.bldgsf);
    if (record.landsf) commercialData.landSf = parseFloat(record.landsf);
    if (record.yearbuilt) commercialData.yearBuilt = parseFloat(record.yearbuilt);
    if (record.finalmarketvalue) commercialData.marketValue = parseFloat(record.finalmarketvalue);
    if (record.finalmarketvalue_sf) commercialData.marketValuePerSf = parseFloat(record.finalmarketvalue_sf);
    if (record.finalmarketvalue_unit) commercialData.marketValuePerUnit = parseFloat(record.finalmarketvalue_unit);
    
    // Location info
    if (record.township) commercialData.township = record.township;
    if (record.taxdist) commercialData.taxDistrict = record.taxdist;
    if (record.address) commercialData.address = record.address;
    
    // Class & rating
    if (record.class_es) commercialData.classEstimate = record.class_es;
    if (record.investmentrating) commercialData.investmentRating = record.investmentrating;
    if (record.sheet) commercialData.sheet = record.sheet;
    if (record.year) commercialData.assessmentYear = record.year;
    
    // Income & expense data
    if (record.noi) commercialData.noi = parseFloat(record.noi);
    if (record.egi) commercialData.egi = parseFloat(record.egi);
    if (record.pgi) commercialData.pgi = parseFloat(record.pgi);
    if (record.exp) commercialData.expenseRatio = parseFloat(record.exp);
    if (record.totalexp) commercialData.totalExpenses = parseFloat(record.totalexp);
    if (record.caprate) commercialData.capRate = parseFloat(record.caprate);
    if (record.vacancy) commercialData.vacancyRate = parseFloat(record.vacancy);
    if (record.adj_rent_sf) commercialData.adjustedRentPerSf = parseFloat(record.adj_rent_sf);
    
    // Commercial space info
    if (record.aprx_comm_sf && parseFloat(record.aprx_comm_sf) > 0) {
      commercialData.commercialSf = parseFloat(record.aprx_comm_sf);
    }
    
    // Unit breakdown (for multifamily)
    if (record.tot_units && parseFloat(record.tot_units) > 0) {
      commercialData.totalUnits = parseFloat(record.tot_units);
    }
    if (record.studiounits && parseFloat(record.studiounits) > 0) {
      commercialData.studioUnits = parseFloat(record.studiounits);
    }
    if (record._1brunits && parseFloat(record._1brunits) > 0) {
      commercialData.oneBrUnits = parseFloat(record._1brunits);
    }
    if (record._2brunits && parseFloat(record._2brunits) > 0) {
      commercialData.twoBrUnits = parseFloat(record._2brunits);
    }
    if (record._3brunits && parseFloat(record._3brunits) > 0) {
      commercialData.threeBrUnits = parseFloat(record._3brunits);
    }
    if (record._4brunits && parseFloat(record._4brunits) > 0) {
      commercialData.fourBrUnits = parseFloat(record._4brunits);
    }
    
    // Excess land
    if (record.excesslandarea && parseFloat(record.excesslandarea) > 0) {
      commercialData.excessLandArea = parseFloat(record.excesslandarea);
    }
    if (record.excesslandval && parseFloat(record.excesslandval) > 0) {
      commercialData.excessLandValue = parseFloat(record.excesslandval);
    }
    
    return {
      pin,
      confidence: data.length === 1 ? 'high' : 'medium',
      propertyType,
      commercialData,
    };
    
  } catch (err) {
    console.error('Error looking up PIN from commercial API:', err);
    return { pin: null, confidence: 'low' };
  }
}

// Fetch building characteristics from Cook County dataset
async function fetchBuildingCharacteristics(pin: string): Promise<Record<string, any> | null> {
  try {
    // Remove dashes from PIN for API query
    const cleanPin = pin.replace(/[^0-9]/g, '');
    
    const url = `${CHARACTERISTICS_API_BASE}?pin=${cleanPin}&$order=year DESC&$limit=1`;
    console.log(`[CHARACTERISTICS API] Querying: ${url}`);
    
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });
    
    if (!response.ok) {
      console.error(`Characteristics API error: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    if (!Array.isArray(data) || data.length === 0) {
      console.log('[CHARACTERISTICS API] No results found for PIN:', cleanPin);
      return await fetchCondoCharacteristics(cleanPin);
    }
    
    const record = data[0];
    console.log('[CHARACTERISTICS API] Found characteristics data');
    
    // Build characteristics object, only including fields with actual values
    const chars: Record<string, any> = {};
    
    // Core building info
    if (record.char_yrblt && parseFloat(record.char_yrblt) > 0) {
      chars.yearBuilt = Math.floor(parseFloat(record.char_yrblt));
    }
    if (record.char_bldg_sf && parseFloat(record.char_bldg_sf) > 0) {
      chars.buildingSf = Math.floor(parseFloat(record.char_bldg_sf));
    }
    if (record.char_land_sf && parseFloat(record.char_land_sf) > 0) {
      chars.landSf = Math.floor(parseFloat(record.char_land_sf));
    }
    
    // Room counts
    if (record.char_beds && parseFloat(record.char_beds) > 0) {
      chars.bedrooms = Math.floor(parseFloat(record.char_beds));
    }
    if (record.char_rooms && parseFloat(record.char_rooms) > 0) {
      chars.rooms = Math.floor(parseFloat(record.char_rooms));
    }
    if (record.char_fbath && parseFloat(record.char_fbath) > 0) {
      chars.fullBaths = Math.floor(parseFloat(record.char_fbath));
    }
    if (record.char_hbath && parseFloat(record.char_hbath) > 0) {
      chars.halfBaths = Math.floor(parseFloat(record.char_hbath));
    }
    if (record.char_frpl && parseFloat(record.char_frpl) > 0) {
      chars.fireplaces = Math.floor(parseFloat(record.char_frpl));
    }
    
    // Building type and quality
    if (record.char_type_resd && record.char_type_resd !== 'None') {
      chars.buildingType = record.char_type_resd;
    }
    if (record.char_cnst_qlty && record.char_cnst_qlty !== 'None') {
      chars.constructionQuality = record.char_cnst_qlty;
    }
    if (record.char_use && record.char_use !== 'None') {
      chars.use = record.char_use;
    }
    
    // Garage info
    if (record.char_gar1_size && record.char_gar1_size !== '0 cars' && record.char_gar1_size !== 'None') {
      chars.garageSize = record.char_gar1_size;
    }
    if (record.char_gar1_cnst && record.char_gar1_cnst !== 'None') {
      chars.garageConstruction = record.char_gar1_cnst;
    }
    if (record.char_gar1_att && record.char_gar1_att === 'Yes') {
      chars.garageAttached = true;
    }
    
    // Basement
    if (record.char_bsmt && record.char_bsmt !== 'None') {
      chars.basement = record.char_bsmt;
    }
    if (record.char_bsmt_fin && record.char_bsmt_fin !== 'None' && record.char_bsmt_fin !== 'Unfinished') {
      chars.basementFinish = record.char_bsmt_fin;
    }
    
    // Attic
    if (record.char_attic_type && record.char_attic_type !== 'None') {
      chars.atticType = record.char_attic_type;
    }
    if (record.char_attic_fnsh && record.char_attic_fnsh !== 'None') {
      chars.atticFinish = record.char_attic_fnsh;
    }
    
    // Construction details
    if (record.char_ext_wall && record.char_ext_wall !== 'None') {
      chars.exteriorWall = record.char_ext_wall;
    }
    if (record.char_roof_cnst && record.char_roof_cnst !== 'None') {
      chars.roofConstruction = record.char_roof_cnst;
    }
    
    // Systems
    if (record.char_heat && record.char_heat !== 'None') {
      chars.heating = record.char_heat;
    }
    if (record.char_air && record.char_air !== 'None' && record.char_air !== 'No Central A/C') {
      chars.airConditioning = record.char_air;
    }
    
    // Condition
    if (record.char_repair_cnd && record.char_repair_cnd !== 'None') {
      chars.repairCondition = record.char_repair_cnd;
    }
    
    // Porch
    if (record.char_porch && record.char_porch !== 'None') {
      chars.porch = record.char_porch;
    }
    
    // Class info
    if (record.class) {
      chars.propertyClass = record.class;
    }
    if (record.year) {
      chars.assessmentYear = record.year;
    }
    
    if (Object.keys(chars).length > 0) {
      const condoData = await fetchCondoCharacteristics(cleanPin);
      if (condoData) {
        for (const [key, val] of Object.entries(condoData)) {
          if (val !== undefined && val !== null && !(key in chars)) {
            chars[key] = val;
          }
        }
        chars.isCondo = true;
      }
      return chars;
    }
    
    return await fetchCondoCharacteristics(cleanPin);
    
  } catch (err) {
    console.error('Error fetching building characteristics:', err);
    return null;
  }
}

async function fetchCondoCharacteristics(pin: string): Promise<Record<string, any> | null> {
  try {
    const cleanPin = pin.replace(/[^0-9]/g, '');
    
    const url = `${CONDO_API_BASE}?pin=${cleanPin}&$order=year DESC&$limit=1`;
    console.log(`[CONDO API] Querying: ${url}`);
    
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });
    
    if (!response.ok) {
      console.error(`Condo API error: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    if (!Array.isArray(data) || data.length === 0) {
      console.log('[CONDO API] No condo results for PIN:', cleanPin);
      return null;
    }
    
    const record = data[0];
    console.log('[CONDO API] Found condo characteristics data');
    
    const chars: Record<string, any> = {};
    chars.isCondo = true;
    
    if (record.char_yrblt && parseFloat(record.char_yrblt) > 0) {
      chars.yearBuilt = Math.floor(parseFloat(record.char_yrblt));
    }
    if (record.char_building_sf && parseFloat(record.char_building_sf) > 0) {
      chars.buildingSf = Math.floor(parseFloat(record.char_building_sf));
    }
    if (record.char_unit_sf && parseFloat(record.char_unit_sf) > 0) {
      chars.unitSf = Math.floor(parseFloat(record.char_unit_sf));
    }
    if (record.char_land_sf && parseFloat(record.char_land_sf) > 0) {
      chars.landSf = Math.floor(parseFloat(record.char_land_sf));
    }
    if (record.char_bedrooms && parseFloat(record.char_bedrooms) > 0) {
      chars.bedrooms = Math.floor(parseFloat(record.char_bedrooms));
    }
    if (record.char_full_baths && parseFloat(record.char_full_baths) > 0) {
      chars.fullBaths = Math.floor(parseFloat(record.char_full_baths));
    }
    if (record.char_half_baths && parseFloat(record.char_half_baths) > 0) {
      chars.halfBaths = Math.floor(parseFloat(record.char_half_baths));
    }
    if (record.char_building_pins && parseInt(record.char_building_pins) > 0) {
      chars.buildingUnits = parseInt(record.char_building_pins);
    }
    if (record.char_building_non_units && parseInt(record.char_building_non_units) > 0) {
      chars.nonResidentialUnits = parseInt(record.char_building_non_units);
    }
    if (record.tieback_proration_rate && parseFloat(record.tieback_proration_rate) > 0) {
      chars.prorationRate = parseFloat(record.tieback_proration_rate);
    }
    if (record.tieback_key_pin) {
      chars.tiebackKeyPin = record.tieback_key_pin;
    }
    if (record.is_parking_space === true || record.is_parking_space === 'true') {
      chars.isParkingSpace = true;
    }
    if (record.is_common_area === true || record.is_common_area === 'true') {
      chars.isCommonArea = true;
    }
    if (record.bldg_is_mixed_use === true || record.bldg_is_mixed_use === 'true') {
      chars.isMixedUse = true;
    }
    if (record.class) {
      chars.propertyClass = record.class;
    }
    if (record.year) {
      chars.assessmentYear = record.year;
    }
    chars.use = 'Condominium';
    
    return Object.keys(chars).length > 1 ? chars : null;
  } catch (err) {
    console.error('Error fetching condo characteristics:', err);
    return null;
  }
}

export interface SaleRecord {
  saleDate: string;
  salePrice: number;
  sellerName: string;
  buyerName: string;
  deedType: string;
  docNo: string;
  year: string;
}

export async function fetchSaleHistory(pin: string): Promise<SaleRecord[] | null> {
  try {
    const cleanPin = pin.replace(/[^0-9]/g, '');
    
    const url = `${SALE_HISTORY_API_BASE}?pin=${cleanPin}&$order=sale_date DESC&$limit=10`;
    console.log(`[SALE HISTORY API] Querying: ${url}`);
    
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    
    if (!response.ok) {
      console.error(`Sale History API error: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    if (!Array.isArray(data) || data.length === 0) {
      console.log('[SALE HISTORY API] No sales found in primary dataset for PIN:', cleanPin);
      
      // Try archived sales dataset as fallback
      try {
        const archivedUrl = `${SALE_HISTORY_ARCHIVED_API_BASE}?pin=${cleanPin}&$order=sale_date DESC&$limit=10`;
        console.log(`[SALE HISTORY API] Trying archived dataset: ${archivedUrl}`);
        const archivedResponse = await fetch(archivedUrl, {
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(8000),
        });
        if (archivedResponse.ok) {
          const archivedData = await archivedResponse.json();
          if (Array.isArray(archivedData) && archivedData.length > 0) {
            console.log(`[SALE HISTORY API] Found ${archivedData.length} records in archived dataset`);
            // Process archived data with same field mapping
            const archivedSales: SaleRecord[] = archivedData.map((record: any) => ({
              saleDate: record.sale_date || '',
              salePrice: record.sale_price ? parseFloat(record.sale_price) : 0,
              sellerName: record.seller_name || '',
              buyerName: record.buyer_name || '',
              deedType: record.mydec_deed_type || record.deed_type || '',
              docNo: record.doc_no || '',
              year: record.year || '',
            })).filter((sale: SaleRecord) => sale.salePrice > 0);
            
            if (archivedSales.length > 0) {
              return archivedSales;
            }
          }
        }
      } catch (archivedErr) {
        console.log('[SALE HISTORY API] Archived dataset lookup failed (may not exist):', archivedErr);
      }
      
      return null;
    }
    
    console.log(`[SALE HISTORY API] Found ${data.length} sale records`);
    
    const currentYear = new Date().getFullYear();
    const sales: SaleRecord[] = data.map((record: any) => {
      // The doc_no often encodes the recording year in its first 2 digits (e.g., "2525310001" = 2025)
      // This is more reliable than sale_date which can be incorrect in the API
      let correctedSaleDate = record.sale_date || '';
      const docNo = record.doc_no || '';
      
      if (docNo && docNo.length >= 2) {
        const docYearPrefix = docNo.substring(0, 2);
        const docYear = parseInt(docYearPrefix);
        // Valid year prefixes: 19-30 (1919-2030)
        if (docYear >= 19 && docYear <= 30) {
          const fullYear = docYear < 50 ? 2000 + docYear : 1900 + docYear;
          // Only correct if the resulting year is not in the future
          if (fullYear <= currentYear && correctedSaleDate) {
            const originalDate = new Date(correctedSaleDate);
            const originalYear = originalDate.getFullYear();
            // If the doc_no year is different and more recent, use it
            if (fullYear !== originalYear && fullYear > originalYear) {
              console.log(`[SALE HISTORY] Correcting year from ${originalYear} to ${fullYear} based on doc_no: ${docNo}`);
              originalDate.setFullYear(fullYear);
              correctedSaleDate = originalDate.toISOString();
            }
          }
        }
      }
      
      return {
        saleDate: correctedSaleDate,
        salePrice: record.sale_price ? parseFloat(record.sale_price) : 0,
        sellerName: record.seller_name || '',
        buyerName: record.buyer_name || '',
        deedType: record.mydec_deed_type || record.deed_type || '',
        docNo: docNo,
        year: record.year || '',
      };
    }).filter((sale: SaleRecord) => {
      if (!sale.salePrice) return false;
      // Exclude sales with future dates — these are data errors in the source API
      if (sale.saleDate) {
        const saleYear = new Date(sale.saleDate).getFullYear();
        if (saleYear > currentYear) return false;
      }
      return true;
    });
    
    return sales.length > 0 ? sales : null;
    
  } catch (err) {
    console.error('Error fetching sale history:', err);
    return null;
  }
}

interface AssessedValueRecord {
  year: string;
  propertyClass: string;
  mailedLand: number;
  mailedBuilding: number;
  mailedTotal: number;
  certifiedLand: number;
  certifiedBuilding: number;
  certifiedTotal: number;
  boardLand?: number;
  boardBuilding?: number;
  boardTotal?: number;
}

async function fetchAssessedValues(pin: string): Promise<AssessedValueRecord[] | null> {
  try {
    const cleanPin = pin.replace(/[^0-9]/g, '');
    
    const url = `${ASSESSED_VALUES_API_BASE}?pin=${cleanPin}`;
    console.log(`[ASSESSED VALUES API] Querying: ${url}`);
    
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });
    
    if (!response.ok) {
      console.error(`Assessed Values API error: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    if (!Array.isArray(data) || data.length === 0) {
      console.log('[ASSESSED VALUES API] No results found for PIN:', cleanPin);
      return null;
    }
    
    console.log(`[ASSESSED VALUES API] Found ${data.length} assessment records`);
    
    // Cook County assessments lag by 1 year — cap at currentYear-1 (e.g. max 2025 when running in 2026)
    const maxAssessYear = new Date().getFullYear() - 1;
    const values: AssessedValueRecord[] = data
      .filter((record: any) => {
        const yr = parseInt(record.year);
        return yr <= maxAssessYear && ((parseFloat(record.certified_tot) > 0) || (parseFloat(record.mailed_tot) > 0));
      })
      .map((record: any) => ({
        year: String(parseInt(record.year) || 0),
        propertyClass: record.class || '',
        mailedLand: parseFloat(record.mailed_land) || 0,
        mailedBuilding: parseFloat(record.mailed_bldg) || 0,
        mailedTotal: parseFloat(record.mailed_tot) || 0,
        certifiedLand: parseFloat(record.certified_land) || 0,
        certifiedBuilding: parseFloat(record.certified_bldg) || 0,
        certifiedTotal: parseFloat(record.certified_tot) || 0,
        boardLand: record.board_land ? parseFloat(record.board_land) : undefined,
        boardBuilding: record.board_bldg ? parseFloat(record.board_bldg) : undefined,
        boardTotal: record.board_tot ? parseFloat(record.board_tot) : undefined,
      }))
      .sort((a: AssessedValueRecord, b: AssessedValueRecord) => parseInt(b.year) - parseInt(a.year));
    
    return values.length > 0 ? values : null;
    
  } catch (err) {
    console.error('Error fetching assessed values:', err);
    return null;
  }
}

interface AppealRecord {
  taxYear: string;
  appealType: string;
  appealReason: string;
  assessorLandValue: number;
  assessorImprovementValue: number;
  assessorTotalValue: number;
  borLandValue: number;
  borImprovementValue: number;
  borTotalValue: number;
  result: string;
  changeReason: string;
  attorneyFirstName?: string;
  attorneyLastName?: string;
  attorneyFirmName?: string;
  appellant: string;
}

async function fetchAppealHistory(pin: string): Promise<AppealRecord[] | null> {
  try {
    const cleanPin = pin.replace(/[^0-9]/g, '');
    
    const url = `${APPEAL_HISTORY_API_BASE}?pin=${cleanPin}&$order=tax_year DESC&$limit=20`;
    console.log(`[APPEAL HISTORY API] Querying: ${url}`);
    
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });
    
    if (!response.ok) {
      console.error(`Appeal History API error: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    if (!Array.isArray(data) || data.length === 0) {
      console.log('[APPEAL HISTORY API] No results found for PIN:', cleanPin);
      return null;
    }
    
    console.log(`[APPEAL HISTORY API] Found ${data.length} appeal records`);
    
    const appeals: AppealRecord[] = data.map((record: any) => {
      return {
        taxYear: record.tax_year || '',
        appealType: record.appealtype || '',
        appealReason: record.appealtypedescription || '',
        assessorLandValue: parseFloat(record.assessor_landvalue) || 0,
        assessorImprovementValue: parseFloat(record.assessor_improvementvalue) || 0,
        assessorTotalValue: parseFloat(record.assessor_totalvalue) || 0,
        borLandValue: parseFloat(record.bor_landvalue) || 0,
        borImprovementValue: parseFloat(record.bor_improvementvalue) || 0,
        borTotalValue: parseFloat(record.bor_totalvalue) || 0,
        result: record.result || '',
        changeReason: record.changereasondescription || record.nochangereasondescription || '',
        attorneyFirstName: record.attorney_firstname || undefined,
        attorneyLastName: record.attorney_lastname || undefined,
        attorneyFirmName: record.attorney_firmname || undefined,
        appellant: record.appellant || '',
      };
    });
    
    return appeals.length > 0 ? appeals : null;
    
  } catch (err) {
    console.error('Error fetching appeal history:', err);
    return null;
  }
}

interface ExemptionRecord {
  year: string;
  homeowner: number | null;
  senior: number | null;
  seniorFreeze: number | null;
  disabledPersons: number | null;
  disabledVeterans: number | null;
  returningVeterans: number | null;
  longtimeHomeowner: number | null;
  homeImprovement: number | null;
}

async function fetchExemptionHistory(pin: string): Promise<ExemptionRecord[] | null> {
  try {
    const cleanPin = pin.replace(/[^0-9]/g, '');
    const url = `https://www.cookcountyassessor.com/pin/${cleanPin}`;
    console.log(`[EXEMPTION SCRAPER] Fetching: ${url}`);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });

    if (!response.ok) {
      console.error(`[EXEMPTION SCRAPER] HTTP error: ${response.status}`);
      return null;
    }

    const html = await response.text();

    const exemptionStart = html.indexOf('detail-exemption--status');
    if (exemptionStart === -1) {
      console.log('[EXEMPTION SCRAPER] No exemption section found in page');
      return null;
    }

    // Grab the exemption section (generous window)
    const section = html.substring(exemptionStart, exemptionStart + 12000);

    // Parse column headers by extracting content between pt-header row start and first pt-body row
    const columnOrder: string[] = [];
    const headerRowStart = section.indexOf('pt-header equal-height');
    const firstBodyRowStart = section.indexOf('pt-body equal-height');
    if (headerRowStart !== -1 && firstBodyRowStart !== -1 && firstBodyRowStart > headerRowStart) {
      const headerSlice = section.substring(headerRowStart, firstBodyRowStart);
      const colMatches = headerSlice.matchAll(/<div class="col-xs-\d+">([\s\S]*?)<\/div>/g);
      for (const m of colMatches) {
        columnOrder.push(m[1].trim().replace(/\s+/g, ' '));
      }
    }
    // columnOrder[0] is blank (year column), rest are exemption names

    const parseValue = (raw: string): number | null => {
      const clean = raw.replace(/<[^>]*>/g, '').trim();
      if (!clean || clean === 'N/A' || clean === '-' || clean === '') return null;
      const num = parseFloat(clean.replace(/[$,\s]/g, ''));
      return isNaN(num) ? null : num;
    };

    const mapColToField = (colName: string): keyof ExemptionRecord | null => {
      const n = colName.toLowerCase();
      if (n.includes('senior freeze') || n.includes('freeze')) return 'seniorFreeze';
      if (n.includes('senior')) return 'senior';
      if (n.includes('homeowner') && !n.includes('longtime')) return 'homeowner';
      if (n.includes('longtime')) return 'longtimeHomeowner';
      if (n.includes('disabled persons')) return 'disabledPersons';
      if (n.includes('disabled veterans') || (n.includes('disabled') && n.includes('vet'))) return 'disabledVeterans';
      if (n.includes('returning')) return 'returningVeterans';
      if (n.includes('home improvement') || n.includes('improvement')) return 'homeImprovement';
      return null;
    };

    // Find all pt-body rows
    const records: ExemptionRecord[] = [];
    const bodyRowPattern = /<div class="row pt-body equal-height">([\s\S]*?)(?=<div class="row|<\/div>\s*<\/div>\s*<\/div>\s*<\/div>)/g;
    let rowMatch: RegExpExecArray | null;

    while ((rowMatch = bodyRowPattern.exec(section)) !== null) {
      const rowHtml = rowMatch[1];
      const cellMatches = [...rowHtml.matchAll(/<div class="col-xs-\d+[^"]*">([\s\S]*?)<\/div>/g)];
      if (cellMatches.length < 2) continue;

      const yearRaw = cellMatches[0][1].replace(/<[^>]*>/g, '').trim();
      if (!/^\d{4}$/.test(yearRaw)) continue;

      const rec: ExemptionRecord = {
        year: yearRaw,
        homeowner: null, senior: null, seniorFreeze: null,
        disabledPersons: null, disabledVeterans: null,
        returningVeterans: null, longtimeHomeowner: null, homeImprovement: null,
      };

      // Map each data column to a field using the header order
      for (let i = 1; i < cellMatches.length; i++) {
        const headerName = columnOrder[i] || '';
        const field = mapColToField(headerName);
        if (field) {
          (rec as any)[field] = parseValue(cellMatches[i][1]);
        }
      }

      records.push(rec);
    }

    console.log(`[EXEMPTION SCRAPER] Parsed ${records.length} exemption year records for PIN ${cleanPin}`);
    return records.length > 0 ? records : null;

  } catch (err) {
    console.error('[EXEMPTION SCRAPER] Error:', err);
    return null;
  }
}

interface CacheResult {
  pin: string | null;
  confidence: 'high' | 'medium' | 'low' | 'none';
  source: string | null;
  propertyType: string | null;
  commercialData: any | null;
  isNegativeCache: boolean;
}

async function getCachedPin(cacheKey: string): Promise<CacheResult | null> {
  const cached = await db.select()
    .from(pinLookupCache)
    .where(eq(pinLookupCache.addressHash, cacheKey))
    .limit(1);
  
  if (cached.length === 0) {
    return null;
  }
  
  const record = cached[0];
  const now = new Date();
  const cacheExpiry = new Date(now.getTime() - CACHE_DURATION_DAYS * 24 * 60 * 60 * 1000);
  
  if (record.cachedAt && record.cachedAt < cacheExpiry) {
    return null;
  }
  
  return {
    pin: record.pin,
    confidence: (record.confidence as 'high' | 'medium' | 'low' | 'none') || 'none',
    source: record.source || null,
    propertyType: record.propertyType || null,
    commercialData: record.commercialData || null,
    isNegativeCache: !record.pin,
  };
}

interface CachePinOptions {
  pin: string | null;
  confidence: string;
  source: string;
  propertyType?: string | null;
  commercialData?: any | null;
  nearestAddress?: string | null;
}

async function cachePin(cacheKey: string, address: string, options: CachePinOptions): Promise<void> {
  const existing = await db.select()
    .from(pinLookupCache)
    .where(eq(pinLookupCache.addressHash, cacheKey))
    .limit(1);
  
  if (existing.length > 0) {
    await db.update(pinLookupCache)
      .set({
        pin: options.pin,
        confidence: options.confidence,
        source: options.source,
        propertyType: options.propertyType,
        commercialData: options.commercialData,
        cachedAt: new Date(),
      })
      .where(eq(pinLookupCache.addressHash, cacheKey));
  } else {
    await db.insert(pinLookupCache).values({
      addressHash: cacheKey,
      normalizedAddress: address.toUpperCase(),
      pin: options.pin,
      confidence: options.confidence,
      source: options.source,
      propertyType: options.propertyType,
      commercialData: options.commercialData,
    });
  }
}

// Look up address from a PIN using the assessor API
export async function lookupAddressFromPin(pin: string): Promise<string | null> {
  try {
    const cleanPin = pin.replace(/[^0-9]/g, '');
    const url = `${ASSESSOR_API_BASE}?pin=${cleanPin}&$limit=1`;
    
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });
    
    if (!response.ok) {
      console.error(`Assessor API error looking up address for PIN ${cleanPin}: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    if (!Array.isArray(data) || data.length === 0) {
      console.log(`[PIN->ADDRESS] No address found for PIN: ${cleanPin}`);
      return null;
    }
    
    const address = data[0].property_address;
    const city = data[0].property_city || 'CHICAGO';
    const zip = data[0].property_zip || '';
    
    if (address) {
      const fullAddress = `${address}, ${city}, IL${zip ? ' ' + zip : ''}`;
      console.log(`[PIN->ADDRESS] Found address for PIN ${cleanPin}: ${fullAddress}`);
      return fullAddress;
    }
    
    return null;
  } catch (err) {
    console.error('Error looking up address from PIN:', err);
    return null;
  }
}

// Get all unique addresses for a property's associated PINs
export async function getAssociatedAddresses(primaryAddress: string, associatedPins: string[]): Promise<string[]> {
  const addresses = new Set<string>();
  
  // Normalize primary address for comparison
  const normalizedPrimary = primaryAddress.toUpperCase().replace(/[^A-Z0-9]/g, '');
  addresses.add(primaryAddress);
  
  // Look up address for each associated PIN
  const addressPromises = associatedPins.map(pin => lookupAddressFromPin(pin.trim()));
  const results = await Promise.all(addressPromises);
  
  for (const addr of results) {
    if (addr) {
      // Check if this is a different address from primary
      const normalizedAddr = addr.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (normalizedAddr !== normalizedPrimary) {
        addresses.add(addr);
      }
    }
  }
  
  return Array.from(addresses);
}

export async function resolvePinFromAddress(
  address: string,
  lat?: number,
  lon?: number
): Promise<PinLookupResult> {
  const cacheKey = createCacheKey(address);
  
  const cached = await getCachedPin(cacheKey);
  if (cached) {
    if (cached.isNegativeCache) {
      // If we now have coordinates, bypass the negative cache and try the geo fallback —
      // the original lookup likely ran before coordinates were available.
      if (lat !== undefined && lon !== undefined) {
        console.log('[PIN RESOLVER] Negative cache found but coordinates available — bypassing to attempt geo fallback...');
        // Fall through to resolution logic below
      } else {
        return {
          pin: null,
          source: 'cache',
          confidence: 'none',
          error: 'No matching property found (cached)',
        };
      }
    } else {
    // Fetch fresh sale history, characteristics, appeal history, assessed values, and exemptions even when PIN is cached
    // (these aren't stored in cache and may have updated)
    const [characteristicsData, saleHistory, appealHistory, assessedValues, exemptionHistory] = cached.pin ? await Promise.all([
      fetchBuildingCharacteristics(cached.pin),
      fetchSaleHistory(cached.pin),
      fetchAppealHistory(cached.pin),
      fetchAssessedValues(cached.pin),
      fetchExemptionHistory(cached.pin),
    ]) : [null, null, null, null, null];

    // If cached result has no commercial data, try the PIN-based commercial lookup now
    // (handles stale cache entries created before the lookupCommercialByPin fallback was added)
    let resolvedCommercialData = cached.commercialData || null;
    let resolvedPropertyType = cached.propertyType || null;
    if (!resolvedCommercialData && cached.pin) {
      const commercialByPin = await lookupCommercialByPin(cached.pin);
      if (commercialByPin?.commercialData) {
        resolvedCommercialData = commercialByPin.commercialData;
        resolvedPropertyType = commercialByPin.propertyType || resolvedPropertyType;
        // Update the cache entry so future requests don't need to re-fetch
        await cachePin(cacheKey, address, {
          pin: cached.pin,
          confidence: cached.confidence,
          source: cached.source ? `${cached.source.replace(/\+commercial$/, '')}+commercial` : 'cache+commercial',
          propertyType: resolvedPropertyType,
          commercialData: resolvedCommercialData,
        });
      }
    }
    
    // Return full cached data including propertyType and commercialData
    return {
      pin: cached.pin,
      source: (cached.source as 'assessor_api' | 'commercial_api') || 'cache',
      confidence: cached.confidence as 'high' | 'medium' | 'low',
      propertyType: resolvedPropertyType || undefined,
      commercialData: resolvedCommercialData || undefined,
      characteristicsData: characteristicsData || undefined,
      saleHistory: saleHistory || undefined,
      appealHistory: appealHistory || undefined,
      assessedValues: assessedValues || undefined,
      exemptionHistory: exemptionHistory || undefined,
    };
  }
  }
  
  const unitMatch = address.match(/\s+(?:Unit|Apt|Ste|Suite|#|FL|Floor)\s*(\S+)/i);
  const unitNumber = unitMatch ? unitMatch[1].replace(/[,;]+$/, '').toUpperCase() : undefined;
  const addressForLookup = address.replace(/\s+(?:Unit|Apt|Ste|Suite|#|FL|Floor)\s*\S+/gi, '').replace(/\s+/g, ' ').trim();
  const { houseNumber, streetDirection, streetName } = normalizeAddress(addressForLookup);
  
  if (!houseNumber || !streetName) {
    return {
      pin: null,
      source: 'none',
      confidence: 'none',
      error: 'Could not parse address',
    };
  }
  
  const result = await lookupPinFromAssessor(houseNumber, streetDirection, streetName, lat, lon, unitNumber);
  
  // Always try to get commercial data for additional property info (building SF, NOI, etc.)
  // Commercial properties often have no building characteristics in the residential API
  console.log('[PIN RESOLVER] Checking commercial dataset for additional property data...');
  const commercialResult = await lookupPinFromCommercial(houseNumber, streetDirection, streetName);
  
  if (result.pin) {
    // PIN found from assessor API - enrich with commercial data, characteristics, sale history, appeal history, assessed values, and exemptions
    const [characteristicsData, saleHistory, appealHistory, assessedValues, exemptionHistory] = await Promise.all([
      fetchBuildingCharacteristics(result.pin),
      fetchSaleHistory(result.pin),
      fetchAppealHistory(result.pin),
      fetchAssessedValues(result.pin),
      fetchExemptionHistory(result.pin),
    ]);
    
    await cachePin(cacheKey, address, {
      pin: result.pin,
      confidence: result.confidence,
      source: commercialResult.commercialData ? 'assessor_api+commercial' : 'assessor_api',
      propertyType: commercialResult.propertyType,
      commercialData: commercialResult.commercialData,
    });
    return {
      pin: result.pin,
      source: commercialResult.commercialData ? 'assessor_api+commercial' : 'assessor_api',
      confidence: result.confidence,
      propertyType: commercialResult.propertyType,
      commercialData: commercialResult.commercialData,
      characteristicsData: characteristicsData || undefined,
      saleHistory: saleHistory || undefined,
      appealHistory: appealHistory || undefined,
      assessedValues: assessedValues || undefined,
      exemptionHistory: exemptionHistory || undefined,
    };
  }
  
  // If assessor API failed but commercial API found the PIN
  if (commercialResult.pin) {
    // Fetch building characteristics, sale history, appeal history, assessed values, and exemptions
    const [characteristicsData, saleHistory, appealHistory, assessedValues, exemptionHistory] = await Promise.all([
      fetchBuildingCharacteristics(commercialResult.pin),
      fetchSaleHistory(commercialResult.pin),
      fetchAppealHistory(commercialResult.pin),
      fetchAssessedValues(commercialResult.pin),
      fetchExemptionHistory(commercialResult.pin),
    ]);
    
    await cachePin(cacheKey, address, {
      pin: commercialResult.pin,
      confidence: commercialResult.confidence,
      source: 'commercial_api',
      propertyType: commercialResult.propertyType,
      commercialData: commercialResult.commercialData,
    });
    return {
      pin: commercialResult.pin,
      source: 'commercial_api',
      confidence: commercialResult.confidence,
      propertyType: commercialResult.propertyType,
      commercialData: commercialResult.commercialData,
      characteristicsData: characteristicsData || undefined,
      saleHistory: saleHistory || undefined,
      appealHistory: appealHistory || undefined,
      assessedValues: assessedValues || undefined,
      exemptionHistory: exemptionHistory || undefined,
    };
  }
  
  // Try enhanced address matching (Address Points + Parcel Addresses datasets)
  console.log('[PIN RESOLVER] Trying enhanced address matching...');
  const addressMatchResult = await matchAddress(address);
  if (addressMatchResult && addressMatchResult.pin) {
    console.log(`[PIN RESOLVER] Address matcher found PIN: ${addressMatchResult.pin} (${addressMatchResult.matchType}, ${addressMatchResult.confidence}%)`);
    
    // If address-based commercial lookup found nothing, retry using the PIN to get
    // the Cook County registered address (e.g. "1438 W LAKE" → registered as "1440 W LAKE")
    let finalCommercialResult = commercialResult;
    if (!commercialResult.commercialData) {
      console.log(`[PIN RESOLVER] No commercial data from input address — retrying via registered address for PIN ${addressMatchResult.pin}...`);
      const pinCommercialResult = await lookupCommercialByPin(addressMatchResult.pin);
      if (pinCommercialResult.commercialData) {
        finalCommercialResult = pinCommercialResult;
      }
    }

    const [characteristicsData, saleHistory, appealHistory, assessedValues, exemptionHistory] = await Promise.all([
      fetchBuildingCharacteristics(addressMatchResult.pin),
      fetchSaleHistory(addressMatchResult.pin),
      fetchAppealHistory(addressMatchResult.pin),
      fetchAssessedValues(addressMatchResult.pin),
      fetchExemptionHistory(addressMatchResult.pin),
    ]);
    
    // Determine confidence level from percentage
    const confidenceLevel: 'high' | 'medium' | 'low' = 
      addressMatchResult.confidence >= 80 ? 'high' :
      addressMatchResult.confidence >= 50 ? 'medium' : 'low';
    
    await cachePin(cacheKey, address, {
      pin: addressMatchResult.pin,
      confidence: confidenceLevel,
      source: finalCommercialResult.commercialData ? `address_matcher_${addressMatchResult.matchType}+commercial` : `address_matcher_${addressMatchResult.matchType}`,
      propertyType: finalCommercialResult.propertyType,
      commercialData: finalCommercialResult.commercialData,
    });
    
    return {
      pin: addressMatchResult.pin,
      source: `address_matcher` as any,
      confidence: confidenceLevel,
      propertyType: finalCommercialResult.propertyType,
      commercialData: finalCommercialResult.commercialData,
      characteristicsData: characteristicsData || undefined,
      saleHistory: saleHistory || undefined,
      appealHistory: appealHistory || undefined,
      assessedValues: assessedValues || undefined,
      exemptionHistory: exemptionHistory || undefined,
      note: addressMatchResult.details || `Matched via ${addressMatchResult.matchType} (${addressMatchResult.confidence}% confidence)`,
      nearestAddress: addressMatchResult.matchedAddress !== address ? addressMatchResult.matchedAddress : undefined,
    };
  }
  
  // Try exempt parcel lookup (for non-profits, government, religious properties)
  console.log('[PIN RESOLVER] Checking exempt parcels database...');
  const exemptResult = await lookupExemptParcel(houseNumber, streetDirection, streetName, lat, lon);
  if (exemptResult.pin) {
    const [characteristicsData, saleHistory, appealHistory, assessedValues, exemptionHistory] = await Promise.all([
      fetchBuildingCharacteristics(exemptResult.pin),
      fetchSaleHistory(exemptResult.pin),
      fetchAppealHistory(exemptResult.pin),
      fetchAssessedValues(exemptResult.pin),
      fetchExemptionHistory(exemptResult.pin),
    ]);
    
    await cachePin(cacheKey, address, {
      pin: exemptResult.pin,
      confidence: exemptResult.confidence,
      source: 'exempt_api',
      propertyType: exemptResult.ownerName || undefined,
    });
    
    return {
      pin: exemptResult.pin,
      source: 'exempt_api' as any,
      confidence: exemptResult.confidence,
      propertyType: `Exempt - ${exemptResult.ownerName || 'Tax Exempt Property'}`,
      characteristicsData: characteristicsData || undefined,
      saleHistory: saleHistory || undefined,
      appealHistory: appealHistory || undefined,
      assessedValues: assessedValues || undefined,
      exemptionHistory: exemptionHistory || undefined,
      note: exemptResult.ownerName ? `Tax-exempt property owned by: ${exemptResult.ownerName}` : undefined,
    };
  }
  
  // Try geo-based fallback if we have lat/lon coordinates
  if (lat !== undefined && lon !== undefined) {
    console.log('[PIN RESOLVER] Trying geo-based fallback with lat/lon...');
    const geoResult = await lookupPinByLocation(lat, lon);
    if (geoResult.pin) {
      const [characteristicsData, saleHistory, appealHistory, assessedValues, exemptionHistory] = await Promise.all([
        fetchBuildingCharacteristics(geoResult.pin),
        fetchSaleHistory(geoResult.pin),
        fetchAppealHistory(geoResult.pin),
        fetchAssessedValues(geoResult.pin),
        fetchExemptionHistory(geoResult.pin),
      ]);
      
      await cachePin(cacheKey, address, {
        pin: geoResult.pin,
        confidence: 'low',
        source: 'geo_fallback',
        nearestAddress: geoResult.nearestAddress,
      });
      
      return {
        pin: geoResult.pin,
        source: 'geo_fallback' as any,
        confidence: 'low',
        nearestAddress: geoResult.nearestAddress || undefined,
        characteristicsData: characteristicsData || undefined,
        saleHistory: saleHistory || undefined,
        appealHistory: appealHistory || undefined,
        assessedValues: assessedValues || undefined,
        exemptionHistory: exemptionHistory || undefined,
        note: `Property not found in assessor database. Showing nearest parcel: ${geoResult.nearestAddress}`,
      };
    }
  }
  
  // Cache negative result
  await cachePin(cacheKey, address, {
    pin: null,
    confidence: 'none',
    source: 'none',
  });
  
  return {
    pin: null,
    source: 'none',
    confidence: 'none',
    error: 'No matching property found. This may be a tax-exempt or non-profit property not in the Cook County Assessor database.',
  };
}

export interface ProximityData {
  dataYear: string;
  numPinsInHalfMile: number;
  foreclosures: {
    countInHalfMilePast5Years: number;
    per1000Pins: number;
    dataYear: string;
  };
  schools: {
    countInHalfMile: number;
    dataYear: string;
  };
  park: {
    name: string;
    distanceFt: number;
    dataYear: string;
  } | null;
  hospital: {
    name: string;
    distanceFt: number;
    dataYear: string;
  } | null;
  university: {
    name: string;
    distanceFt: number;
    dataYear: string;
  } | null;
  stadium: {
    name: string;
    distanceFt: number;
    dataYear: string;
  } | null;
  highway: {
    name: string;
    distanceFt: number;
    dailyTraffic: number;
    dataYear: string;
  } | null;
  vacantLand: {
    distanceFt: number;
    nearestPin: string;
    dataYear: string;
  } | null;
  ctaStop: {
    name: string;
    distanceFt: number;
    routeName: string;
    dataYear: string;
  } | null;
  metraStop: {
    name: string;
    distanceFt: number;
    routeName: string;
    dataYear: string;
  } | null;
  bikeTrail: {
    distanceFt: number;
    dataYear: string;
  } | null;
  water: {
    name: string;
    distanceFt: number;
    dataYear: string;
  } | null;
  lakeMichigan: {
    distanceFt: number;
    dataYear: string;
  } | null;
  airportNoise: number | null;
  busStops: {
    countInHalfMile: number;
    dataYear: string;
  };
}

export async function fetchProximityData(pin14: string): Promise<ProximityData | null> {
  try {
    const pin10 = pin14.replace(/-/g, '').substring(0, 10);
    
    console.log(`[PROXIMITY API] Querying for PIN10: ${pin10}`);
    
    const url = `${PROXIMITY_API_BASE}?pin10=${pin10}&$order=year DESC&$limit=5`;
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });
    
    if (!response.ok) {
      console.error(`[PROXIMITY API] Error: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    if (!Array.isArray(data) || data.length === 0) {
      console.log(`[PROXIMITY API] No data found for PIN10: ${pin10}`);
      return null;
    }
    
    const row = data[0];
    console.log(`[PROXIMITY API] Found data for year: ${row.year}, total rows: ${data.length}`);
    
    return {
      dataYear: row.year || '',
      numPinsInHalfMile: parseInt(row.num_pin_in_half_mile) || 0,
      foreclosures: {
        countInHalfMilePast5Years: parseInt(row.num_foreclosure_in_half_mile_past_5_years) || 0,
        per1000Pins: parseFloat(row.num_foreclosure_per_1000_pin_past_5_years) || 0,
        dataYear: row.num_foreclosure_data_year || row.year || '',
      },
      schools: {
        countInHalfMile: parseInt(row.num_school_in_half_mile) || 0,
        dataYear: row.num_school_data_year || row.year || '',
      },
      park: row.nearest_park_name ? {
        name: row.nearest_park_name,
        distanceFt: parseFloat(row.nearest_park_dist_ft) || 0,
        dataYear: row.nearest_park_data_year || row.year || '',
      } : null,
      hospital: row.nearest_hospital_name ? {
        name: row.nearest_hospital_name,
        distanceFt: parseFloat(row.nearest_hospital_dist_ft) || 0,
        dataYear: row.nearest_hospital_data_year || row.year || '',
      } : null,
      university: row.nearest_university_name ? {
        name: row.nearest_university_name,
        distanceFt: parseFloat(row.nearest_university_dist_ft) || 0,
        dataYear: row.nearest_university_data_year || row.year || '',
      } : null,
      stadium: row.nearest_stadium_name ? {
        name: row.nearest_stadium_name,
        distanceFt: parseFloat(row.nearest_stadium_dist_ft) || 0,
        dataYear: row.nearest_stadium_data_year || row.year || '',
      } : null,
      highway: row.nearest_road_highway_name ? {
        name: row.nearest_road_highway_name,
        distanceFt: parseFloat(row.nearest_road_highway_dist_ft) || 0,
        dailyTraffic: parseFloat(row.nearest_road_highway_daily_traffic) || 0,
        dataYear: row.nearest_road_highway_data_year || row.year || '',
      } : null,
      vacantLand: row.nearest_vacant_land_pin10 ? {
        distanceFt: parseFloat(row.nearest_vacant_land_dist_ft) || 0,
        nearestPin: row.nearest_vacant_land_pin10,
        dataYear: row.nearest_vacant_land_data_year || row.year || '',
      } : null,
      ctaStop: row.nearest_cta_stop_name ? {
        name: row.nearest_cta_stop_name,
        distanceFt: parseFloat(row.nearest_cta_stop_dist_ft) || 0,
        routeName: row.nearest_cta_route_name || '',
        dataYear: row.nearest_cta_stop_data_year || row.year || '',
      } : null,
      metraStop: row.nearest_metra_stop_name ? {
        name: row.nearest_metra_stop_name,
        distanceFt: parseFloat(row.nearest_metra_stop_dist_ft) || 0,
        routeName: row.nearest_metra_route_name || '',
        dataYear: row.nearest_metra_stop_data_year || row.year || '',
      } : null,
      bikeTrail: row.nearest_bike_trail_dist_ft ? {
        distanceFt: parseFloat(row.nearest_bike_trail_dist_ft) || 0,
        dataYear: row.nearest_bike_trail_data_year || row.year || '',
      } : null,
      water: row.nearest_water_name ? {
        name: row.nearest_water_name,
        distanceFt: parseFloat(row.nearest_water_dist_ft) || 0,
        dataYear: row.nearest_water_data_year || row.year || '',
      } : null,
      lakeMichigan: row.lake_michigan_dist_ft ? {
        distanceFt: parseFloat(row.lake_michigan_dist_ft) || 0,
        dataYear: row.lake_michigan_data_year || row.year || '',
      } : null,
      airportNoise: row.airport_dnl_total ? parseFloat(row.airport_dnl_total) : null,
      busStops: {
        countInHalfMile: parseInt(row.num_bus_stop_in_half_mile) || 0,
        dataYear: row.num_bus_stop_data_year || row.year || '',
      },
    };
  } catch (error) {
    console.error('[PROXIMITY API] Error:', error);
    return null;
  }
}
