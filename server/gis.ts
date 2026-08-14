
import fs from 'fs';
import path from 'path';
import { hasUserSpecifiedUnit, stripCensusUnitArtifact } from './utils/addressNormalize';
import * as turf from '@turf/turf';
import axios from 'axios';
import proj4 from 'proj4';
import type { FeatureCollection, Polygon, MultiPolygon, Feature, Point } from 'geojson';

// Define State Plane Illinois East (EPSG:3435) projection for landmark data
// The landmark GeoJSON uses feet-based State Plane coordinates
proj4.defs('EPSG:3435', '+proj=tmerc +lat_0=36.66666666666666 +lon_0=-88.33333333333333 +k=0.9999749999999999 +x_0=300000.0000000001 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=us-ft +no_defs');

// Configuration Constants from instructions
const TIF_NAME_FIELD = 'name'; 
const ZONING_FIELD = 'zone_class';
const COMMUNITY_AREA_FIELD = 'community';
const WARD_ID_FIELD = 'ward_id';

// Chicago Zoning API Configuration
const CHICAGO_ZONING_API_URL = 'https://gisapps.chicago.gov/arcgis/rest/services/ExternalApps/Zoning_update/MapServer/15/query';
const COOK_COUNTY_ASSESSOR_API = 'https://datacatalog.cookcountyil.gov/resource/c49d-89sn.json';
const ZONING_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// Parcel centroid cache (address -> {lat, lon})
interface ParcelCentroid {
  lat: number;
  lon: number;
  pin: string;
}
const parcelCentroidCache = new Map<string, ParcelCentroid | null>();

// Get parcel centroid coordinates from Cook County Assessor API
// These are more accurate than Census coordinates for zoning lookups
async function getParcelCentroid(address: string): Promise<ParcelCentroid | null> {
  // Check cache first
  const cacheKey = address.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (parcelCentroidCache.has(cacheKey)) {
    return parcelCentroidCache.get(cacheKey) || null;
  }

  try {
    // Parse address components
    const match = address.toUpperCase().match(/^(\d+)\s+(?:(N|S|E|W|NORTH|SOUTH|EAST|WEST)\.?\s+)?(.+?)(?:\s+(ST|STREET|AVE|AVENUE|BLVD|BOULEVARD|DR|DRIVE|RD|ROAD|CT|COURT|PL|PLACE|WAY|LN|LANE|TER|TERRACE|PKWY|PARKWAY|CIR|CIRCLE))?(?:,|\s|$)/i);
    
    if (!match) {
      console.log('[PARCEL] Could not parse address:', address);
      parcelCentroidCache.set(cacheKey, null);
      return null;
    }

    const houseNumber = match[1];
    const direction = (match[2] || '').replace(/\./g, '').trim();
    const dirAbbrev = direction === 'NORTH' ? 'N' : direction === 'SOUTH' ? 'S' : direction === 'EAST' ? 'E' : direction === 'WEST' ? 'W' : direction;
    let streetName = (match[3] || '').trim();
    
    // Remove suffix from street name for more flexible matching
    streetName = streetName.replace(/\s+(ST|STREET|AVE|AVENUE|BLVD|BOULEVARD|DR|DRIVE|RD|ROAD|CT|COURT|PL|PLACE|WAY|LN|LANE|TER|TERRACE|PKWY|PARKWAY|CIR|CIRCLE)$/i, '');

    // Build query - use wildcard when direction is missing to match any direction
    let query: string;
    if (dirAbbrev) {
      query = `property_address like '${houseNumber} ${dirAbbrev} ${streetName}%' AND property_city='CHICAGO'`;
    } else {
      query = `property_address like '${houseNumber} %${streetName}%' AND property_city='CHICAGO'`;
    }
    
    const url = `${COOK_COUNTY_ASSESSOR_API}?$where=${encodeURIComponent(query)}&$limit=5`;
    console.log('[PARCEL] Querying Cook County Assessor:', url);
    
    const response = await axios.get(url, { timeout: 10000 });
    
    if (response.data && Array.isArray(response.data) && response.data.length > 0) {
      const record = response.data[0];
      const lat = parseFloat(record.latitude);
      const lon = parseFloat(record.longitude);
      const pin = record.pin;
      
      if (!isNaN(lat) && !isNaN(lon)) {
        console.log(`[PARCEL] Found centroid for ${address}: lat=${lat}, lon=${lon}, pin=${pin}`);
        const result = { lat, lon, pin };
        parcelCentroidCache.set(cacheKey, result);
        return result;
      }
    }
    
    console.log('[PARCEL] No parcel data found for:', address);
    parcelCentroidCache.set(cacheKey, null);
    return null;
  } catch (error) {
    console.error('[PARCEL] Error fetching parcel centroid:', error instanceof Error ? error.message : error);
    return null;
  }
}

// Zoning cache structure
interface ZoningCacheEntry {
  zoneClass: string;
  zoneType: string | null;
  ordinanceDate: string | null;
  updateTimestamp: string | null;
  cachedAt: number;
}

// In-memory cache for zoning lookups (key: "lat,lon" with 5 decimal precision)
const zoningCache = new Map<string, ZoningCacheEntry>();

// Generate cache key from coordinates (rounded to 5 decimals for ~1m precision)
function getZoningCacheKey(lat: number, lon: number): string {
  return `${lat.toFixed(5)},${lon.toFixed(5)}`;
}

// Query live Chicago Zoning API
async function queryChicagoZoningAPI(lat: number, lon: number): Promise<ZoningCacheEntry | null> {
  try {
    // Build point geometry for spatial query with explicit spatial reference
    const geometry = JSON.stringify({
      x: lon,
      y: lat,
      spatialReference: { wkid: 4326 }
    });

    const params = new URLSearchParams({
      geometry: geometry,
      geometryType: 'esriGeometryPoint',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: 'ZONE_CLASS,ZONE_TYPE,ORDINANCE_DATE,UPDATE_TIMESTAMP',
      returnGeometry: 'false',
      f: 'json'
    });

    const fullUrl = `${CHICAGO_ZONING_API_URL}?${params.toString()}`;
    console.log(`[ZONING API] Querying: lat=${lat}, lon=${lon}`);
    console.log(`[ZONING API] Full URL: ${fullUrl}`);
    
    const response = await axios.get(fullUrl, {
      timeout: 5000 // 5 second timeout
    });

    console.log(`[ZONING API] Raw response: ${JSON.stringify(response.data)}`);

    if (response.data && response.data.features && response.data.features.length > 0) {
      const feature = response.data.features[0];
      const attrs = feature.attributes || {};
      
      const entry: ZoningCacheEntry = {
        zoneClass: attrs.ZONE_CLASS || 'Unknown',
        zoneType: attrs.ZONE_TYPE || null,
        ordinanceDate: attrs.ORDINANCE_DATE || null,
        updateTimestamp: attrs.UPDATE_TIMESTAMP || null,
        cachedAt: Date.now()
      };
      
      console.log(`[ZONING API] ZONE_CLASS returned: ${entry.zoneClass}`);
      return entry;
    }
    
    console.log('[ZONING API] No features returned');
    return null;
  } catch (error) {
    console.error('[ZONING API] Error:', error instanceof Error ? error.message : error);
    return null;
  }
}

// Get zoning from live API with GeoJSON fallback
async function getZoningWithCache(lat: number, lon: number, point: Feature<Point>): Promise<string> {
  const cacheKey = getZoningCacheKey(lat, lon);
  
  // Check in-memory cache first
  const cached = zoningCache.get(cacheKey);
  if (cached && (Date.now() - cached.cachedAt) < ZONING_CACHE_TTL_MS) {
    console.log(`[ZONING] Cache hit for ${cacheKey}: ${cached.zoneClass}`);
    return cached.zoneClass;
  }
  
  // Query live Chicago Zoning API first
  console.log(`[ZONING] Cache miss for ${cacheKey}, querying live API...`);
  const apiResult = await queryChicagoZoningAPI(lat, lon);
  if (apiResult) {
    zoningCache.set(cacheKey, apiResult);
    return apiResult.zoneClass;
  }
  
  // API failed - try GeoJSON fallback
  console.log('[ZONING] API failed - trying local GeoJSON fallback...');
  if (geoData.zoning) {
    for (const feature of geoData.zoning.features) {
      if (turf.booleanPointInPolygon(point, feature)) {
        const zoneClass = feature.properties?.[ZONING_FIELD] || 'Unknown';
        console.log(`[ZONING] Found in local GeoJSON: ${zoneClass}`);
        
        // Cache the result from GeoJSON
        const entry: ZoningCacheEntry = {
          zoneClass,
          zoneType: null,
          ordinanceDate: null,
          updateTimestamp: null,
          cachedAt: Date.now()
        };
        zoningCache.set(cacheKey, entry);
        return zoneClass;
      }
    }
    console.log('[ZONING] Not found in local GeoJSON either');
  }
  
  return 'Zoning not found';
}

interface AldermanInfo {
  name: string;
  website?: string;
  wardOffice?: string;
  cityHallAddress?: string;
  cityHallPhone?: string;
  email?: string;
  phone?: string;
}

interface AldermenData {
  [ward: string]: AldermanInfo;
}

interface GeoConfig {
  tif?: FeatureCollection<Polygon | MultiPolygon>;
  zoning?: FeatureCollection<Polygon | MultiPolygon>;
  communityAreas?: FeatureCollection<Polygon | MultiPolygon>;
  wards?: FeatureCollection<Polygon | MultiPolygon>;
  aduZones?: FeatureCollection<Polygon | MultiPolygon>;
}

let aldermenData: AldermenData = {};

// Load GeoJSON data into memory
const dataDir = path.join(process.cwd(), 'server', 'data');
const geoData: GeoConfig = {};

function loadGeoJSON(filename: string): FeatureCollection<Polygon | MultiPolygon> | undefined {
  try {
    const filePath = path.join(dataDir, filename);
    if (fs.existsSync(filePath)) {
      console.log(`Loading GeoJSON: ${filename}`);
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw);
    } else {
      console.warn(`GeoJSON file not found: ${filename} - spatial lookups will be disabled for this layer.`);
      return undefined;
    }
  } catch (err) {
    console.error(`Error loading ${filename}:`, err);
    return undefined;
  }
}

// Load aldermen data
function loadAldermenData(): AldermenData {
  try {
    const filePath = path.join(dataDir, 'aldermen.json');
    if (fs.existsSync(filePath)) {
      console.log('Loading aldermen data');
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Error loading aldermen.json:', err);
  }
  return {};
}

// Council-member stats (years in office, attendance) from chicago.councilmatic.org
interface AldermanStats { name: string; yearsInOffice: string; attendance: string; councilmaticUrl?: string; }
let aldermenStatsData: Record<string, AldermanStats> = {};

function loadAldermenStatsData(): Record<string, AldermanStats> {
  try {
    const filePath = path.join(dataDir, 'aldermenStats.json');
    if (fs.existsSync(filePath)) {
      console.log('Loading aldermen stats data');
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (err) {
    console.error('Error loading aldermenStats.json:', err);
  }
  return {};
}

export function getAldermanStatsForWard(ward: string): AldermanStats | null {
  return aldermenStatsData[ward] || null;
}

// Initialize data
export function initGIS() {
  aldermenStatsData = loadAldermenStatsData();
  geoData.tif = loadGeoJSON('chicago_tif.geojson');
  geoData.zoning = loadGeoJSON('chicago_zoning.geojson');
  geoData.communityAreas = loadGeoJSON('chicago_community_areas.geojson');
  geoData.wards = loadGeoJSON('chicago_wards.geojson');
  geoData.aduZones = loadGeoJSON('chicago_adu_zones.geojson');
  aldermenData = loadAldermenData();
}

// Get alderman info for a ward
export function getAldermanForWard(ward: string): AldermanInfo | null {
  return aldermenData[ward] || null;
}

// In-memory cache for ADU RS zone lookups (keyed by "lat,lon")
interface AduZoneResult {
  zone: string;
  display: string;
  limitations: string;
}
const aduZoneCache = new Map<string, AduZoneResult | null>();

// Determine ADU eligibility based on zoning and location
// Per Chicago Zoning Ordinance §17-7-0570:
//   RT, RM, B, C1, C2 → eligible by zoning alone
//   RS1, RS2, RS3     → query Chicago's live ADU Allowed RS Areas service
const ADU_SERVICE_URL =
  'https://services7.arcgis.com/A03QrhyHnDaUmK0W/arcgis/rest/services/ADUAllowedRS2AA_view/FeatureServer/0/query';

export async function lookupAduZoneByCoordinates(lat: number, lon: number, zoning?: string | null): Promise<AduZoneResult | null> {
  const zoningUpper = (zoning || '').toUpperCase();

  // RT, RM, any B, C1, or C2 → eligible by zoning alone (no API call needed)
  if (/^(RT|RM|B[0-9\-]|C1|C2)/.test(zoningUpper)) {
    return { zone: 'Zoning-Eligible', display: 'Eligible by zoning classification.', limitations: 'No Limitations' };
  }

  // Only RS1, RS2, RS3 need the live polygon check
  const isRS = /^RS-?[123]/.test(zoningUpper);
  if (!isRS) return null;

  const cacheKey = `${lat.toFixed(5)},${lon.toFixed(5)}`;
  if (aduZoneCache.has(cacheKey)) return aduZoneCache.get(cacheKey)!;

  try {
    const params = new URLSearchParams({
      geometry: `${lon},${lat}`,
      geometryType: 'esriGeometryPoint',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: 'Zone,Display_Te,Text',
      f: 'json',
    });
    const res = await fetch(`${ADU_SERVICE_URL}?${params}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`ADU service HTTP ${res.status}`);
    const data = await res.json() as {
      features?: Array<{ attributes: { Zone?: string; Display_Te?: string; Text?: string } }>;
    };
    const attrs = data.features?.[0]?.attributes;
    if (!attrs) {
      aduZoneCache.set(cacheKey, null);
      return null;
    }
    const result: AduZoneResult = {
      zone: attrs.Zone || 'RS Area',
      display: attrs.Display_Te || '',
      limitations: attrs.Text || 'No Limitations',
    };
    aduZoneCache.set(cacheKey, result);
    return result;
  } catch (err: any) {
    console.error('[ADU] Live lookup failed, falling back to local GeoJSON:', err.message);
    // Fallback to local GeoJSON if the live API is unavailable
    if (geoData.aduZones) {
      const point = turf.point([lon, lat]);
      for (const feature of geoData.aduZones.features) {
        if (turf.booleanPointInPolygon(point, feature)) {
          const zone = feature.properties?.area || 'RS Area';
          const result: AduZoneResult = { zone, display: '', limitations: 'No Limitations' };
          aduZoneCache.set(cacheKey, result);
          return result;
        }
      }
    }
    aduZoneCache.set(cacheKey, null);
    return null;
  }
}

// Census Geocoder Response Type
interface CensusResponse {
  result: {
    addressMatches: Array<{
      coordinates: { x: number; y: number };
      addressComponents: {
        zip?: string;
      };
      geographies: {
        "Census Tracts": Array<{ GEOID: string }>;
      };
      matchedAddress: string;
    }>;
  };
}

export interface GISResult {
  lat: number;
  lon: number;
  tractGeoid: string | null;
  zipCode: string | null;
  tifName: string | null;
  zoning: string | null;
  communityArea: string | null;
  ward: string | null;
  alderman: string | null;
  aldermanUrl: string | null;
  aldermanPhone: string | null;
  aldermanEmail: string | null;
  aldermanWardOffice: string | null;
  aldermanYearsInOffice: string | null;
  aldermanAttendance: string | null;
  aldermanCouncilmaticUrl: string | null;
  opportunityZone: boolean;
  aduZone: string | null;
  aduZoneDisplay: string | null;
  aduZoneLimitations: string | null;
  formattedAddress: string;
  city: 'chicago' | 'philadelphia';
}

export async function lookupLocation(address: string): Promise<GISResult> {
  // Normalize address before sending to Census — remove country suffix, abbreviate state names
  // The Census geocoder fails on "Illinois" (must be "IL"), "United States", etc.
  const normalizeForCensus = (addr: string): string => {
    return addr
      .replace(/,?\s*United States$/i, '')
      .replace(/,?\s*US$/i, '')
      .replace(/,?\s*USA$/i, '')
      .replace(/,\s*Illinois\b/gi, ', IL')
      .replace(/,\s*Pennsylvania\b/gi, ', PA')
      .replace(/,\s*Indiana\b/gi, ', IN')
      .replace(/,\s*Wisconsin\b/gi, ', WI')
      .replace(/,\s*Michigan\b/gi, ', MI')
      .replace(/,\s*Ohio\b/gi, ', OH')
      .replace(/\s+/g, ' ')
      .trim();
  };

  // Also abbreviate spelled-out street directions and suffixes for stricter Census endpoints
  const abbreviateStreet = (addr: string): string => {
    return addr
      .replace(/\bNorth\b(?=\s+\w)/g, 'N')
      .replace(/\bSouth\b(?=\s+\w)/g, 'S')
      .replace(/\bEast\b(?=\s+\w)/g, 'E')
      .replace(/\bWest\b(?=\s+\w)/g, 'W')
      .replace(/\bStreet\b/gi, 'St')
      .replace(/\bAvenue\b/gi, 'Ave')
      .replace(/\bBoulevard\b/gi, 'Blvd')
      .replace(/\bDrive\b/gi, 'Dr')
      .replace(/\bRoad\b/gi, 'Rd')
      .replace(/\bCourt\b/gi, 'Ct')
      .replace(/\bPlace\b/gi, 'Pl')
      .replace(/\bLane\b/gi, 'Ln')
      .replace(/\bParkway\b/gi, 'Pkwy')
      .replace(/\bTerrace\b/gi, 'Ter')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const normalizedAddress = normalizeForCensus(address);

  // Quick city pre-check from address string (before Census call)
  // Used to skip Chicago-specific API calls for Philadelphia addresses
  const isLikelyPhilly = /philadelphia|phila(,| |$)|philly|\b191\d{2}\b|\b190\d{2}\b/i.test(normalizedAddress);

  // Helper: call the Census geographies endpoint and return parsed data
  const callGeographies = async (addr: string) => {
    const encoded = encodeURIComponent(addr);
    const url = `https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?address=${encoded}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`;
    console.log(`Geocoding URL: ${url}`);
    const resp = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!resp.ok) throw new Error(`Census API error: ${resp.statusText}`);
    return (await resp.json()) as CensusResponse;
  };

  // Helper: fall back to locations endpoint (more lenient) + reverse-geocode tract
  const callLocationsWithTract = async (addr: string) => {
    const encoded = encodeURIComponent(addr);
    const locUrl = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encoded}&benchmark=Public_AR_Current&format=json`;
    console.log(`[Geocode fallback] Locations URL: ${locUrl}`);
    const locResp = await fetch(locUrl, { signal: AbortSignal.timeout(12000) });
    if (!locResp.ok) return null;
    const locData = await locResp.json() as any;
    const locMatches = locData?.result?.addressMatches;
    if (!locMatches || locMatches.length === 0) return null;
    const locMatch = locMatches[0];
    const { x: locLon, y: locLat } = locMatch.coordinates;
    // Reverse-geocode coordinates to get Census tract
    const revUrl = `https://geocoding.geo.census.gov/geocoder/geographies/coordinates?x=${locLon}&y=${locLat}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`;
    let tractGeoid: string | null = null;
    try {
      const revResp = await fetch(revUrl, { signal: AbortSignal.timeout(8000) });
      if (revResp.ok) {
        const revData = await revResp.json() as any;
        tractGeoid = revData?.result?.geographies?.['Census Tracts']?.[0]?.GEOID || null;
      }
    } catch (_) {}
    return { matchedAddress: locMatch.matchedAddress, lon: locLon, lat: locLat, tractGeoid, zip: locMatch.addressComponents?.zip || null };
  };

  // 1. Try geographies endpoint with normalized address
  let data = await callGeographies(normalizedAddress);

  // 2. If not found, retry with abbreviated street directions/suffixes
  if (!data.result.addressMatches || data.result.addressMatches.length === 0) {
    const abbreviated = abbreviateStreet(normalizedAddress);
    if (abbreviated !== normalizedAddress) {
      console.log(`[Geocode retry] Abbreviated form: ${abbreviated}`);
      data = await callGeographies(abbreviated);
    }
  }

  // Helper: reverse-geocode lat/lon to Census tract GEOID
  const reverseGeocodeTract = async (lon: number, lat: number): Promise<string | null> => {
    try {
      const revUrl = `https://geocoding.geo.census.gov/geocoder/geographies/coordinates?x=${lon}&y=${lat}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`;
      const revResp = await fetch(revUrl, { signal: AbortSignal.timeout(8000) });
      if (!revResp.ok) return null;
      const revData = await revResp.json() as any;
      return revData?.result?.geographies?.['Census Tracts']?.[0]?.GEOID || null;
    } catch (_) { return null; }
  };

  // Helper: Nominatim (OpenStreetMap) geocoder — free, no key required, broad coverage
  const callNominatim = async (addr: string) => {
    const encoded = encodeURIComponent(addr);
    const url = `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1&addressdetails=1&countrycodes=us`;
    console.log(`[Geocode fallback] Nominatim URL: ${url}`);
    try {
      const resp = await fetch(url, {
        signal: AbortSignal.timeout(10000),
        headers: { 'User-Agent': 'ChicagoEligibilityScreener/1.0 (knowyourprop.com)' }
      });
      if (!resp.ok) return null;
      const results = await resp.json() as any[];
      if (!results || results.length === 0) return null;
      const r = results[0];
      const nomLon = parseFloat(r.lon);
      const nomLat = parseFloat(r.lat);
      const zip: string | null = r.address?.postcode || null;
      // Build a clean formatted address from Nominatim components
      const houseNum = r.address?.house_number || '';
      const road = r.address?.road || '';
      const city = r.address?.city || r.address?.town || r.address?.village || 'Chicago';
      const stateAbbr = r.address?.state === 'Illinois' ? 'IL' : (r.address?.state || 'IL');
      const displayName: string = [houseNum, road].filter(Boolean).join(' ').trim()
        ? `${[houseNum, road].filter(Boolean).join(' ')}, ${city}, ${stateAbbr}${zip ? ' ' + zip : ''}`
        : r.display_name || addr;
      const tractGeoid = await reverseGeocodeTract(nomLon, nomLat);
      return { matchedAddress: displayName, lon: nomLon, lat: nomLat, tractGeoid, zip };
    } catch (_) { return null; }
  };

  // 3. If still not found, fall back to Census locations endpoint + reverse tract lookup
  let fallbackResult: { matchedAddress: string; lon: number; lat: number; tractGeoid: string | null; zip: string | null } | null = null;
  if (!data.result.addressMatches || data.result.addressMatches.length === 0) {
    console.log(`[Geocode fallback] Trying Census locations endpoint for: ${normalizedAddress}`);
    fallbackResult = await callLocationsWithTract(normalizedAddress);
    if (!fallbackResult) {
      fallbackResult = await callLocationsWithTract(abbreviateStreet(normalizedAddress));
    }
  }

  // 4. Final fallback: Nominatim (OpenStreetMap)
  if (!fallbackResult && (!data.result.addressMatches || data.result.addressMatches.length === 0)) {
    console.log(`[Geocode fallback] Trying Nominatim for: ${normalizedAddress}`);
    fallbackResult = await callNominatim(normalizedAddress);
    if (!fallbackResult) {
      fallbackResult = await callNominatim(abbreviateStreet(normalizedAddress));
    }
    if (!fallbackResult) {
      throw new Error('Address not found. Please include the full city and state (e.g. "Chicago, IL" or "Philadelphia, PA") and use a valid street address.');
    }
  }

  // Use first match (from geographies or fallback)
  const userSpecifiedUnit = hasUserSpecifiedUnit(address);
  let lon: number, lat: number, formattedAddress: string, tractGeoid: string | null, zipCode: string | null;
  let match: (typeof data.result.addressMatches)[0] | null = null;

  if (fallbackResult) {
    lon = fallbackResult.lon;
    lat = fallbackResult.lat;
    tractGeoid = fallbackResult.tractGeoid;
    zipCode = fallbackResult.zip;
    formattedAddress = userSpecifiedUnit ? fallbackResult.matchedAddress : stripCensusUnitArtifact(fallbackResult.matchedAddress);
  } else {
    match = data.result.addressMatches[0];
    lon = match.coordinates.x;
    lat = match.coordinates.y;
    formattedAddress = userSpecifiedUnit ? match.matchedAddress : stripCensusUnitArtifact(match.matchedAddress);
    tractGeoid = match.geographies["Census Tracts"]?.[0]?.GEOID || null;
    zipCode = match.addressComponents?.zip || null;
  }
  if (!zipCode) {
    const zipMatch = formattedAddress.match(/\b(\d{5})(?:-\d{4})?\b/);
    zipCode = zipMatch ? zipMatch[1] : null;
  }

  // 2. Perform Spatial Lookups
  const point = turf.point([lon, lat]);
  
  let tifName: string | null = "Data not configured";
  if (geoData.tif) {
    tifName = "Not in TIF District";
    console.log(`Checking TIF for point: ${lat}, ${lon}`);
    for (const feature of geoData.tif.features) {
      if (turf.booleanPointInPolygon(point, feature)) {
        tifName = feature.properties?.[TIF_NAME_FIELD] || "Unknown TIF";
        console.log(`Matched TIF: ${tifName}`);
        break;
      }
    }
  }

  // Use parcel centroid coordinates for more accurate zoning lookup (Chicago only)
  let zoningLat = lat;
  let zoningLon = lon;
  let zoning: string | null = null;

  if (!isLikelyPhilly) {
    const parcelData = await getParcelCentroid(formattedAddress);
    if (parcelData) {
      console.log(`[ZONING] Using parcel centroid coordinates: ${parcelData.lat}, ${parcelData.lon} (instead of Census: ${lat}, ${lon})`);
      zoningLat = parcelData.lat;
      zoningLon = parcelData.lon;
    } else {
      console.log(`[ZONING] No parcel data available, using Census coordinates: ${lat}, ${lon}`);
    }
    const zoningPoint = turf.point([zoningLon, zoningLat]);
    zoning = await getZoningWithCache(zoningLat, zoningLon, zoningPoint);
  }

  // 3. Community Area lookup
  let communityArea: string | null = "Data not configured";
  if (geoData.communityAreas) {
    communityArea = "Unknown Community Area";
    for (const feature of geoData.communityAreas.features) {
      if (turf.booleanPointInPolygon(point, feature)) {
        const name = feature.properties?.[COMMUNITY_AREA_FIELD];
        if (name) {
          // Convert from uppercase to title case for better display
          communityArea = name.split(' ')
            .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
        }
        break;
      }
    }
  }

  // 4. Ward lookup
  let ward: string | null = null;
  let alderman: string | null = null;
  let aldermanUrl: string | null = null;
  let aldermanPhone: string | null = null;
  let aldermanEmail: string | null = null;
  let aldermanWardOffice: string | null = null;
  let aldermanYearsInOffice: string | null = null;
  let aldermanAttendance: string | null = null;
  let aldermanCouncilmaticUrl: string | null = null;
  if (geoData.wards) {
    for (const feature of geoData.wards.features) {
      if (turf.booleanPointInPolygon(point, feature)) {
        ward = feature.properties?.[WARD_ID_FIELD] || null;
        if (ward) {
          const aldermanInfo = getAldermanForWard(ward);
          if (aldermanInfo) {
            alderman = aldermanInfo.name;
            aldermanUrl = aldermanInfo.website || null;
            aldermanPhone = aldermanInfo.phone || null;
            aldermanEmail = aldermanInfo.email || null;
            aldermanWardOffice = aldermanInfo.wardOffice || null;
          }
          const aldermanStats = getAldermanStatsForWard(ward);
          if (aldermanStats) {
            aldermanYearsInOffice = aldermanStats.yearsInOffice || null;
            aldermanAttendance = aldermanStats.attendance || null;
            aldermanCouncilmaticUrl = aldermanStats.councilmaticUrl || null;
          }
        }
        break;
      }
    }
  }

  // 5. Opportunity Zone check
  // Common OZ tracts in Chicago (Subset for verification)
  const OZ_TRACTS = new Set([
    "17031242900", "17031243000", "17031250100", "17031250200", 
    "17031250300", "17031260100", "17031260200", "17031260300",
    "17031835700", "17031842400", "17031834400"
  ]);

  const opportunityZone = tractGeoid ? OZ_TRACTS.has(tractGeoid) : false;

  // 6. ADU Zone lookup — per Chicago Zoning Ordinance §17-7-0570
  const aduZone = await lookupAduZoneByCoordinates(lat, lon, zoning);

  // Detect city from Census response state/county info
  const stateCode = match?.addressComponents?.state || match?.geographies["States"]?.[0]?.STUSAB || '';
  const countyName = (match?.geographies["Counties"]?.[0]?.NAME || '').toUpperCase();
  const city: 'chicago' | 'philadelphia' =
    (stateCode === 'PA' && (countyName.includes('PHILADELPHIA') || zipCode?.startsWith('19')))
      ? 'philadelphia'
      : 'chicago';

  return {
    lat,
    lon,
    tractGeoid,
    zipCode,
    tifName: city === 'philadelphia' ? null : tifName,
    zoning: city === 'philadelphia' ? null : zoning,
    communityArea: city === 'philadelphia' ? null : communityArea,
    ward: city === 'philadelphia' ? null : ward,
    alderman: city === 'philadelphia' ? null : alderman,
    aldermanUrl: city === 'philadelphia' ? null : aldermanUrl,
    aldermanPhone: city === 'philadelphia' ? null : aldermanPhone,
    aldermanEmail: city === 'philadelphia' ? null : aldermanEmail,
    aldermanWardOffice: city === 'philadelphia' ? null : aldermanWardOffice,
    aldermanYearsInOffice: city === 'philadelphia' ? null : aldermanYearsInOffice,
    aldermanAttendance: city === 'philadelphia' ? null : aldermanAttendance,
    aldermanCouncilmaticUrl: city === 'philadelphia' ? null : aldermanCouncilmaticUrl,
    opportunityZone,
    aduZone: city === 'philadelphia' ? null : (aduZone?.zone || null),
    aduZoneDisplay: city === 'philadelphia' ? null : (aduZone?.display || null),
    aduZoneLimitations: city === 'philadelphia' ? null : (aduZone?.limitations || null),
    formattedAddress,
    city,
  };
}

// ── Official landmarks (uct4-hrvh) cache ──────────────────────────────────
interface OfficialLandmark {
  name: string;
  id: string;
  address: string;
  lat: number;  // centroid latitude
  lon: number;  // centroid longitude
  geometry: any; // original GeoJSON geometry (Polygon or MultiPolygon) for PIP check
}

let officialLandmarksCache: OfficialLandmark[] | null = null;
let officialLandmarksLastFetched = 0;
const OFFICIAL_LANDMARKS_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function loadOfficialLandmarks(): Promise<OfficialLandmark[]> {
  const now = Date.now();
  if (officialLandmarksCache && (now - officialLandmarksLastFetched) < OFFICIAL_LANDMARKS_TTL) {
    return officialLandmarksCache;
  }
  try {
    const resp = await fetch(
      'https://data.cityofchicago.org/resource/uct4-hrvh.json?$limit=500&$select=name,id,address,the_geom',
      { signal: AbortSignal.timeout(20000) }
    );
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json() as any[];
    const results: OfficialLandmark[] = [];
    for (const r of data) {
      if (!r.the_geom?.coordinates) continue;
      try {
        // Compute centroid from Polygon or MultiPolygon footprint
        const centroid = turf.centroid(r.the_geom);
        results.push({
          name: r.name ?? '',
          id: r.id ?? '',
          address: r.address ?? '',
          lat: centroid.geometry.coordinates[1],
          lon: centroid.geometry.coordinates[0],
          geometry: r.the_geom,
        });
      } catch {
        // Skip if centroid calculation fails
      }
    }
    officialLandmarksCache = results;
    officialLandmarksLastFetched = now;
    console.log(`[OFFICIAL LANDMARKS] Cached ${officialLandmarksCache.length} records from uct4-hrvh`);
    return officialLandmarksCache;
  } catch (err: any) {
    console.warn('[OFFICIAL LANDMARKS] Failed to load:', err.message);
    return officialLandmarksCache ?? [];
  }
}

// ── CHRS WGS84 data (chicago_chrs.geojson) ────────────────────────────────
const chrsPath = path.join(process.cwd(), 'server', 'data', 'chicago_chrs.geojson');
let chrsData: FeatureCollection | null = null;

function loadChrsData(): FeatureCollection | null {
  if (chrsData) return chrsData;
  if (fs.existsSync(chrsPath)) {
    try {
      const raw = fs.readFileSync(chrsPath, 'utf-8');
      chrsData = JSON.parse(raw) as FeatureCollection;
      console.log(`[CHRS] Loaded ${chrsData.features.length} CHRS features (WGS84)`);
      return chrsData;
    } catch (err) {
      console.error('[CHRS] Error loading CHRS data:', err);
      return null;
    }
  }
  return null;
}

// Parse KML text from a CHRS KMZ file into GeoJSON features
function parseChrsKml(kmlText: string): any[] {
  const features: any[] = [];
  const placemarkRe = /<Placemark[^>]*>([\s\S]*?)<\/Placemark>/g;
  let match;

  while ((match = placemarkRe.exec(kmlText)) !== null) {
    const content = match[1];

    // Extract CDATA description
    const descMatch = content.match(/<description>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/description>/i);
    const descHtml = descMatch ? descMatch[1] : '';

    // Parse ALL_CAPS key-value pairs from HTML table rows
    const props: Record<string, string | null> = {};
    const tdRe = /<td>([A-Z][A-Z_0-9]*)<\/td>\s*<td>([^<]*)<\/td>/g;
    let tdMatch;
    while ((tdMatch = tdRe.exec(descHtml)) !== null) {
      const k = tdMatch[1];
      const v = tdMatch[2].trim()
        .replace(/&lt;Null&gt;/gi, '')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
      props[k] = ['', 'Null', 'NULL', '.'].includes(v) ? null : v;
    }

    // Extract polygon coordinates
    const coordMatch = content.match(/<coordinates>([\s\S]*?)<\/coordinates>/i);
    if (!coordMatch) continue;
    const pts: [number, number][] = [];
    for (const c of coordMatch[1].trim().split(/\s+/)) {
      const parts = c.split(',');
      if (parts.length >= 2) {
        const lon = parseFloat(parts[0]);
        const lat = parseFloat(parts[1]);
        if (!isNaN(lon) && !isNaN(lat)) pts.push([lon, lat]);
      }
    }
    if (pts.length < 3) continue;

    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [pts] },
      properties: props,
    });
  }

  return features;
}

// Re-download CHRS KMZ from Chicago Data Portal and regenerate chicago_chrs.geojson
export async function refreshChrsData(): Promise<{ success: boolean; features?: number; error?: string }> {
  try {
    // Get current blob ID from dataset metadata
    const metaResp = await fetch('https://data.cityofchicago.org/api/views/cmb2-8jw8.json', {
      signal: AbortSignal.timeout(15000)
    });
    if (!metaResp.ok) throw new Error(`Metadata fetch failed: ${metaResp.status}`);
    const meta = await metaResp.json() as any;
    const blobId = meta.blobId as string;
    if (!blobId) throw new Error('No blob ID found in dataset metadata');

    // Download KMZ blob
    const kmzResp = await fetch(`https://data.cityofchicago.org/api/file_data/${blobId}`, {
      signal: AbortSignal.timeout(90000)
    });
    if (!kmzResp.ok) throw new Error(`KMZ download failed: ${kmzResp.status}`);
    const kmzBuffer = Buffer.from(await kmzResp.arrayBuffer());

    // Unzip KMZ to get KML
    const AdmZip = (await import('adm-zip')).default as any;
    const zip = new AdmZip(kmzBuffer);
    const entries = zip.getEntries();
    const kmlEntry = entries.find((e: any) => e.entryName.endsWith('.kml'));
    if (!kmlEntry) throw new Error('No .kml file found in KMZ');
    const kmlText = kmlEntry.getData().toString('utf-8');

    // Parse KML → GeoJSON features
    const features = parseChrsKml(kmlText);
    if (features.length < 1000) throw new Error(`Too few features parsed: ${features.length} (expected ~9000+)`);

    // Write updated GeoJSON
    const geojson = {
      type: 'FeatureCollection',
      metadata: {
        source: 'Chicago Historic Resources Survey - Red and Orange Buildings',
        sourceDataset: 'cmb2-8jw8',
        blobId,
        sourceUrl: 'https://data.cityofchicago.org/Historic-Preservation/Chicago-Historic-Resources-Survey-Red-and-Orange-B/cmb2-8jw8/about_data',
        updatedAt: new Date().toISOString(),
      },
      features,
    };
    fs.writeFileSync(chrsPath, JSON.stringify(geojson));
    chrsData = null; // clear in-memory cache
    console.log(`[CHRS REFRESH] Saved ${features.length} features to chicago_chrs.geojson`);
    return { success: true, features: features.length };
  } catch (err: any) {
    console.error('[CHRS REFRESH] Failed:', err.message);
    return { success: false, error: err.message };
  }
}

// ── Landmark Districts (rkur-ce6h) ────────────────────────────────────────
const ldPath = path.join(process.cwd(), 'server', 'data', 'chicago_landmark_districts.geojson');
let ldData: FeatureCollection | null = null;

function loadLandmarkDistricts(): FeatureCollection | null {
  if (ldData) return ldData;
  if (fs.existsSync(ldPath)) {
    try {
      const raw = fs.readFileSync(ldPath, 'utf-8');
      ldData = JSON.parse(raw) as FeatureCollection;
      console.log(`[LANDMARK DISTRICTS] Loaded ${ldData.features.length} districts`);
      return ldData;
    } catch (err) {
      console.error('[LANDMARK DISTRICTS] Error loading:', err);
      return null;
    }
  }
  return null;
}

function getDistrictInfo(lat: number, lon: number): { isLandmarkDistrict: boolean; landmarkDistrictName: string | null; landmarkDistrictId: string | null } {
  const districts = loadLandmarkDistricts();
  if (!districts) return { isLandmarkDistrict: false, landmarkDistrictName: null, landmarkDistrictId: null };
  const pt = turf.point([lon, lat]);
  for (const feature of districts.features) {
    if (!feature.geometry) continue;
    try {
      if (turf.booleanPointInPolygon(pt, feature as any)) {
        const props = feature.properties || {};
        return {
          isLandmarkDistrict: true,
          landmarkDistrictName: (props.NAME || props.name) ?? null,
          landmarkDistrictId: (props.NUMBER_ || props.number_) ?? null,
        };
      }
    } catch { continue; }
  }
  return { isLandmarkDistrict: false, landmarkDistrictName: null, landmarkDistrictId: null };
}

function parseLandmarkDistrictsKml(kmlText: string): any[] {
  const features: any[] = [];
  const placemarkRe = /<Placemark[^>]*>([\s\S]*?)<\/Placemark>/g;
  let match;
  while ((match = placemarkRe.exec(kmlText)) !== null) {
    const content = match[1];
    const nameMatch = content.match(/<name>([^<]+)<\/name>/);
    const districtName = nameMatch ? nameMatch[1].trim() : null;
    const props: Record<string, string | null> = { NAME: districtName };
    const descMatch = content.match(/<description>([\s\S]*?)<\/description>/i);
    if (descMatch) {
      const tdRe = /<td>([A-Z_0-9]+)<\/td>\s*<td>([^<]*)<\/td>/g;
      let tdMatch;
      while ((tdMatch = tdRe.exec(descMatch[1])) !== null) {
        props[tdMatch[1]] = tdMatch[2].trim() || null;
      }
    }
    const polygons: [number, number][][] = [];
    const polyRe = /<Polygon>([\s\S]*?)<\/Polygon>/g;
    let polyMatch;
    while ((polyMatch = polyRe.exec(content)) !== null) {
      const coordMatch = polyMatch[1].match(/<coordinates>([\s\S]*?)<\/coordinates>/i);
      if (!coordMatch) continue;
      const pts: [number, number][] = [];
      for (const c of coordMatch[1].trim().split(/\s+/)) {
        const parts = c.split(',');
        if (parts.length >= 2) {
          const lon = parseFloat(parts[0]); const lat = parseFloat(parts[1]);
          if (!isNaN(lon) && !isNaN(lat)) pts.push([lon, lat]);
        }
      }
      if (pts.length >= 3) polygons.push(pts);
    }
    if (polygons.length === 0) continue;
    const geometry = polygons.length === 1
      ? { type: 'Polygon', coordinates: [polygons[0]] }
      : { type: 'MultiPolygon', coordinates: polygons.map(p => [p]) };
    features.push({ type: 'Feature', geometry, properties: props });
  }
  return features;
}

export async function refreshLandmarkDistrictsData(): Promise<{ success: boolean; features?: number; error?: string }> {
  try {
    const metaResp = await fetch('https://data.cityofchicago.org/api/views/rkur-ce6h.json', { signal: AbortSignal.timeout(15000) });
    if (!metaResp.ok) throw new Error(`Metadata fetch failed: ${metaResp.status}`);
    const meta = await metaResp.json() as any;
    const blobId = meta.blobId as string;
    if (!blobId) throw new Error('No blob ID found in metadata');
    const kmzResp = await fetch(`https://data.cityofchicago.org/api/file_data/${blobId}`, { signal: AbortSignal.timeout(60000) });
    if (!kmzResp.ok) throw new Error(`KMZ download failed: ${kmzResp.status}`);
    const kmzBuffer = Buffer.from(await kmzResp.arrayBuffer());
    const AdmZip = (await import('adm-zip')).default as any;
    const zip = new AdmZip(kmzBuffer);
    const kmlEntry = zip.getEntries().find((e: any) => e.entryName.endsWith('.kml'));
    if (!kmlEntry) throw new Error('No KML file found in KMZ');
    const kmlText = kmlEntry.getData().toString('utf-8');
    const features = parseLandmarkDistrictsKml(kmlText);
    if (features.length < 20) throw new Error(`Too few features: ${features.length}`);
    const geojson = {
      type: 'FeatureCollection',
      metadata: { source: 'Chicago Landmark Districts', sourceDataset: 'rkur-ce6h', updatedAt: new Date().toISOString() },
      features,
    };
    fs.writeFileSync(ldPath, JSON.stringify(geojson));
    ldData = null;
    console.log(`[LANDMARK DISTRICTS REFRESH] Saved ${features.length} districts`);
    return { success: true, features: features.length };
  } catch (err: any) {
    console.error('[LANDMARK DISTRICTS REFRESH] Failed:', err.message);
    return { success: false, error: err.message };
  }
}

// Landmark data cache
let landmarkData: FeatureCollection | null = null;

function loadLandmarkData(): FeatureCollection | null {
  if (landmarkData) return landmarkData;
  
  const landmarkPath = path.join(process.cwd(), 'server', 'data', 'chicago_landmarks.geojson');
  if (fs.existsSync(landmarkPath)) {
    try {
      const raw = fs.readFileSync(landmarkPath, 'utf-8');
      landmarkData = JSON.parse(raw) as FeatureCollection;
      console.log(`[LANDMARKS] Loaded ${landmarkData.features.length} landmark features`);
      return landmarkData;
    } catch (err) {
      console.error('[LANDMARKS] Error loading landmark data:', err);
      return null;
    }
  }
  console.log('[LANDMARKS] No landmark file found at:', landmarkPath);
  return null;
}

export interface LandmarkResult {
  isLandmark: boolean;
  isOfficialLandmark: boolean;
  officialLandmarkName: string | null;
  isLandmarkDistrict: boolean;
  landmarkDistrictName: string | null;
  landmarkDistrictId: string | null;
  landmarkName: string | null;
  landmarkId: number | null;
  address: string | null;
  decade: number | null;
  designationDate: string | null;
  classId: number | null;
  className: string | null;
  colorId: number | null;
  colorTag: string | null;
}

// Class ID mapping (based on typical Chicago landmark classifications)
const LANDMARK_CLASS_NAMES: Record<number, string> = {
  1: 'Historic Resource Survey',
  2: 'National Register',
  3: 'Chicago Landmark',
  4: 'Landmark District',
  5: 'Significant Building',
};

// COLOR_ID mapping for Chicago Historic Resources Survey tags
// Based on CHRS color-coding system
const LANDMARK_COLOR_TAGS: Record<number, string> = {
  1: 'Orange', // Community/local significance
  2: 'Red',    // National significance (best of the best)
  3: 'Yellow', // Significant within concentration
  5: 'Green',  // Pre-1940s, slightly altered
  6: 'Purple', // Pre-1940s, extensively altered
};

// Helper to normalize address for comparison
function normalizeAddress(addr: string): string {
  return addr
    .toUpperCase()
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\bSTREET\b/g, 'ST')
    .replace(/\bAVENUE\b/g, 'AVE')
    .replace(/\bBOULEVARD\b/g, 'BLVD')
    .replace(/\bDRIVE\b/g, 'DR')
    .replace(/\bROAD\b/g, 'RD')
    .replace(/\bPLACE\b/g, 'PL')
    .replace(/\bCOURT\b/g, 'CT')
    .replace(/\bNORTH\b/g, 'N')
    .replace(/\bSOUTH\b/g, 'S')
    .replace(/\bEAST\b/g, 'E')
    .replace(/\bWEST\b/g, 'W')
    .trim();
}

// City API Color Code mapping
const CITY_COLOR_CODE_MAP: Record<string, { colorId: number; colorTag: string }> = {
  'OR': { colorId: 1, colorTag: 'Orange' },
  'RD': { colorId: 2, colorTag: 'Red' },
  'YL': { colorId: 3, colorTag: 'Yellow' },
  'GN': { colorId: 5, colorTag: 'Green' },
  'PR': { colorId: 6, colorTag: 'Purple' },
};

// Fallback to Chicago city landmark API when local data doesn't have a match
export async function queryLandmarkAPI(searchAddress: string): Promise<LandmarkResult | null> {
  try {
    // Parse address components - extract street number, direction, and street name
    // Example: "2139 W Chicago Avenue, Chicago, IL" -> [2139, W, CHICAGO]
    const normalized = searchAddress.toUpperCase().replace(/[.,]/g, '');
    const match = normalized.match(/^(\d+)\s+([NSEW])\s+([A-Z]+)/);
    if (!match) {
      console.log('[LANDMARK API] Could not parse address:', searchAddress);
      return null;
    }
    
    const [, streetNum, direction, streetName] = match;
    
    // Query the city's landmark search API
    const url = `https://webapps1.chicago.gov/landmarksweb/LandmarkBuildingServlet?street_number=${streetNum}&direction=${direction.toUpperCase()}&street=${encodeURIComponent(streetName.toUpperCase())}&action=searchByAddress`;
    
    console.log('[LANDMARK API] Querying:', url);
    
    const response = await axios.get(url, { timeout: 10000, validateStatus: () => true });
    const html = response.data as string;
    if (response.status === 404 || html.includes('Page not found!!!')) {
      console.log('[LANDMARK API] City API returned 404 for:', searchAddress);
      return null;
    }
    
    // Check if we got a building detail page
    if (!html.includes('Details for building at')) {
      console.log('[LANDMARK API] No building found');
      return null;
    }
    
    // Extract color code from response (e.g., "Color Code: (GN)")
    const colorMatch = html.match(/Color Code:\s*<\/td>\s*<td[^>]*>\s*\(([A-Z]{2})\)/i);
    const colorCode = colorMatch ? colorMatch[1].toUpperCase() : null;
    
    // Extract address
    const addrMatch = html.match(/Address:\s*<\/td>\s*<td[^>]*>\s*\(([^)]+)\)\s*([^<]+)/i);
    const fullAddress = addrMatch ? `${addrMatch[1]} ${addrMatch[2]}`.trim() : searchAddress;
    
    // Extract classification
    const classMatch = html.match(/Classification:\s*<\/td>\s*<td[^>]*>\s*(\d+)/i);
    const classId = classMatch ? parseInt(classMatch[1]) : 1;
    
    // Extract decade/constructed
    const decadeMatch = html.match(/Constructed:\s*<\/td>\s*<td[^>]*>\s*Started in\s*(\d{4})?/i);
    const startYear = decadeMatch && decadeMatch[1] ? parseInt(decadeMatch[1]) : null;
    const decade = startYear ? Math.floor(startYear / 10) * 10 : null;
    
    if (colorCode && CITY_COLOR_CODE_MAP[colorCode]) {
      const colorInfo = CITY_COLOR_CODE_MAP[colorCode];
      console.log(`[LANDMARK API] Found: ${fullAddress}, Color: ${colorInfo.colorTag}`);
      
      return {
        isLandmark: true,
        isOfficialLandmark: false,
        officialLandmarkName: null,
        isLandmarkDistrict: false,
        landmarkDistrictName: null,
        landmarkDistrictId: null,
        landmarkName: null,
        landmarkId: null,
        address: fullAddress,
        decade,
        designationDate: null,
        classId,
        className: classId ? (LANDMARK_CLASS_NAMES[classId] || `Class ${classId}`) : null,
        colorId: colorInfo.colorId,
        colorTag: colorInfo.colorTag,
      };
    }
    
    console.log('[LANDMARK API] No color code found in response');
    return null;
  } catch (err) {
    // Silently fail - city API may be unavailable
    console.log('[LANDMARK API] City API unavailable or returned error');
    return null;
  }
}

// Extract street number from address
function extractStreetNumber(addr: string): string | null {
  const match = addr.match(/^(\d+)/);
  return match ? match[1] : null;
}

export async function checkLandmarkStatus(lat: number, lon: number, searchAddress?: string): Promise<LandmarkResult> {
  const landmarks = loadLandmarkData();
  // Check landmark district status synchronously (fast, local file)
  const districtInfo = getDistrictInfo(lat, lon);

  if (!landmarks) {
    return {
      isLandmark: districtInfo.isLandmarkDistrict,
      isOfficialLandmark: false,
      officialLandmarkName: null,
      ...districtInfo,
      landmarkName: null,
      landmarkId: null,
      address: null,
      decade: null,
      designationDate: null,
      classId: null,
      className: null,
      colorId: null,
      colorTag: null,
    };
  }
  
  // Convert WGS84 (lat/lon) to State Plane Illinois East (EPSG:3435)
  // proj4 expects [lon, lat] order
  const statePlaneCoords = proj4('EPSG:4326', 'EPSG:3435', [lon, lat]);
  const spX = statePlaneCoords[0];
  const spY = statePlaneCoords[1];
  
  // Create a point in State Plane coordinates
  const point = turf.point([spX, spY]);
  
  // Helper to build result from feature
  function buildResult(feature: Feature<Polygon | MultiPolygon>): LandmarkResult {
    const props = feature.properties || {};
    
    // Build address from components
    let address: string | null = null;
    if (props.LOW_ADDR && props.STREET_NAM) {
      const addrNum = props.LOW_ADDR !== props.HIGH_ADDR 
        ? `${props.LOW_ADDR}-${props.HIGH_ADDR}` 
        : String(props.LOW_ADDR);
      const dir = props.DIRECTION !== '.' ? props.DIRECTION : '';
      const streetType = props.STREET_TYP !== '.' ? props.STREET_TYP : '';
      address = `${addrNum} ${dir} ${props.STREET_NAM} ${streetType}`.replace(/\s+/g, ' ').trim();
    }
    
    const classId = props.CLASS_ID || null;
    const className = classId ? (LANDMARK_CLASS_NAMES[classId] || `Class ${classId}`) : null;
    const colorId = props.COLOR_ID || null;
    const colorTag = colorId ? (LANDMARK_COLOR_TAGS[colorId] || null) : null;
    
    return {
      isLandmark: true,
      isOfficialLandmark: false,
      officialLandmarkName: null,
      ...districtInfo,
      landmarkName: props.LANDMARKNA && props.LANDMARKNA.trim() ? props.LANDMARKNA.trim() : null,
      landmarkId: props.LANDMARK_I || null,
      address,
      decade: props.DECADE || null,
      designationDate: props.DESIGNATIO || null,
      classId,
      className,
      colorId,
      colorTag,
    };
  }
  
  // First pass: exact point-in-polygon check
  for (const feature of landmarks.features) {
    if (!feature.geometry) continue;
    
    try {
      if (turf.booleanPointInPolygon(point, feature as Feature<Polygon | MultiPolygon>)) {
        return buildResult(feature as Feature<Polygon | MultiPolygon>);
      }
    } catch (err) {
      // Skip invalid geometries
      continue;
    }
  }
  
  // Second pass: find nearest landmark within 100 feet buffer
  // Landmark polygons are building footprints - geocoded points may fall outside
  // Since coordinates are in State Plane feet, we calculate distance manually
  const BUFFER_FEET = 100;
  let nearestFeature: Feature<Polygon | MultiPolygon> | null = null;
  let nearestDistance = Infinity;
  
  // Helper to calculate min distance from point to polygon in State Plane feet
  function distanceToPolygon(px: number, py: number, polygon: Feature<Polygon | MultiPolygon>): number {
    let minDist = Infinity;
    
    const rings = polygon.geometry.type === 'Polygon' 
      ? [polygon.geometry.coordinates[0]] 
      : polygon.geometry.coordinates.map(p => p[0]);
    
    for (const ring of rings) {
      // Check distance to each edge
      for (let i = 0; i < ring.length - 1; i++) {
        const [x1, y1] = ring[i];
        const [x2, y2] = ring[i + 1];
        
        // Distance from point to line segment
        const dx = x2 - x1;
        const dy = y2 - y1;
        const lenSq = dx * dx + dy * dy;
        
        let t = 0;
        if (lenSq > 0) {
          t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
        }
        
        const nearestX = x1 + t * dx;
        const nearestY = y1 + t * dy;
        const dist = Math.sqrt((px - nearestX) ** 2 + (py - nearestY) ** 2);
        
        if (dist < minDist) {
          minDist = dist;
        }
      }
    }
    
    return minDist;
  }
  
  for (const feature of landmarks.features) {
    if (!feature.geometry) continue;
    
    try {
      // Calculate distance in State Plane feet
      const distance = distanceToPolygon(spX, spY, feature as Feature<Polygon | MultiPolygon>);
      
      if (distance < BUFFER_FEET && distance < nearestDistance) {
        nearestDistance = distance;
        nearestFeature = feature as Feature<Polygon | MultiPolygon>;
      }
    } catch (err) {
      // Skip invalid geometries
      continue;
    }
  }
  
  if (nearestFeature) {
    // If we have a search address, verify the landmark address matches
    // This prevents false positives from nearby but different buildings
    if (searchAddress) {
      const result = buildResult(nearestFeature);
      if (result.address) {
        const searchNum = extractStreetNumber(searchAddress);
        const landmarkNum = extractStreetNumber(result.address);
        
        // Also check against the feature's raw LOW_ADDR/HIGH_ADDR range
        // so that a search at e.g. 1431 accepts a landmark at 1413-1427
        const featProps = nearestFeature.properties || {};
        const lowAddr = featProps.LOW_ADDR ? parseInt(featProps.LOW_ADDR) : null;
        const highAddr = featProps.HIGH_ADDR ? parseInt(featProps.HIGH_ADDR) : null;
        const searchNumInt = searchNum ? parseInt(searchNum) : null;
        const withinRange = searchNumInt && lowAddr && highAddr
          ? searchNumInt >= lowAddr && searchNumInt <= highAddr
          : false;

        const searchStreet = normalizeAddress(searchAddress).split(' ').slice(1, 4).join(' ');
        const landmarkStreet = normalizeAddress(result.address).split(' ').slice(1, 4).join(' ');
        const sameStreet = searchStreet === landmarkStreet;

        // Street numbers must match exactly or fall within the landmark's address range on the same street
        if (searchNum && landmarkNum && searchNum !== landmarkNum && (!withinRange || !sameStreet)) {
          console.log(`[LANDMARK] Buffer match rejected: searched for ${searchAddress} (${searchNum}), found ${result.address} (${landmarkNum})`);
          // Fall through to API lookup below
        } else {
          console.log(`[LANDMARK] Found nearby landmark within ${nearestDistance.toFixed(1)} feet, address verified`);
          return result;
        }
      } else {
        console.log(`[LANDMARK] Found nearby landmark within ${nearestDistance.toFixed(1)} feet, address verified`);
        return result;
      }
    } else {
      console.log(`[LANDMARK] Found nearby landmark within ${nearestDistance.toFixed(1)} feet`);
      return buildResult(nearestFeature);
    }
  }
  
  // Fallback: Query city's live API if local data doesn't have a match
  if (searchAddress) {
    console.log(`[LANDMARK] Local data miss, trying city API for: ${searchAddress}`);
    const apiResult = await queryLandmarkAPI(searchAddress);
    if (apiResult) {
      return { ...apiResult, ...districtInfo, isLandmark: apiResult.isLandmark || districtInfo.isLandmarkDistrict };
    }
  }

  // Secondary fallback: WGS84 point-in-polygon check against chicago_chrs.geojson
  // Covers buildings that State Plane projection may miss due to coordinate conversion edge cases
  const chrs = loadChrsData();
  if (chrs) {
    const wgsPoint = turf.point([lon, lat]);
    for (const feature of chrs.features) {
      if (!feature.geometry) continue;
      try {
        if (turf.booleanPointInPolygon(wgsPoint, feature as Feature<Polygon | MultiPolygon>)) {
          const props = feature.properties || {};
          const colorId = props.COLOR_ID ? parseInt(props.COLOR_ID) : null;
          const colorTag = colorId ? (LANDMARK_COLOR_TAGS[colorId] || null) : null;
          const classId = props.CLASS_ID ? parseInt(props.CLASS_ID) : null;
          let address: string | null = null;
          if (props.LOW_ADDR && props.STREET_NAME) {
            const dir = props.DIRECTION && props.DIRECTION !== 'Null' ? props.DIRECTION : '';
            const streetType = props.STREET_TYPE && props.STREET_TYPE !== 'Null' ? props.STREET_TYPE : '';
            address = `${props.LOW_ADDR} ${dir} ${props.STREET_NAME} ${streetType}`.replace(/\s+/g, ' ').trim();
          }
          console.log(`[LANDMARK] WGS84 CHRS match at ${address || 'unknown address'}`);
          return {
            isLandmark: true,
            isOfficialLandmark: false,
            officialLandmarkName: null,
            ...districtInfo,
            landmarkName: null,
            landmarkId: props.LANDMARK_ID ? parseInt(props.LANDMARK_ID) : null,
            address,
            decade: props.DECADE ? parseInt(props.DECADE) : null,
            designationDate: props.DESIGNATION_DATE || null,
            classId,
            className: classId ? (LANDMARK_CLASS_NAMES[classId] || `Class ${classId}`) : null,
            colorId,
            colorTag,
          };
        }
      } catch { continue; }
    }
  }

  // Last resort: check official Chicago Landmark designation (uct4-hrvh, 412 records)
  // This catches officially designated landmarks that CHRS polygon check might miss
  try {
    const officials = await loadOfficialLandmarks();
    const wgsPoint2 = turf.point([lon, lat]);
    // Use point-in-polygon against the actual building footprint geometry first
    // Fall back to centroid proximity (0.001° ≈ 330 ft) if PIP fails
    const match = officials.find(o => {
      try {
        return turf.booleanPointInPolygon(wgsPoint2, o.geometry);
      } catch {
        return Math.abs(o.lat - lat) < 0.001 && Math.abs(o.lon - lon) < 0.001;
      }
    });
    if (match) {
      console.log(`[LANDMARK] Official designation match: ${match.name} (${match.address})`);
      return {
        isLandmark: true,
        isOfficialLandmark: true,
        officialLandmarkName: match.name,
        ...districtInfo,
        landmarkName: match.name,
        landmarkId: null,
        address: match.address,
        decade: null,
        designationDate: null,
        classId: 3,
        className: 'Chicago Landmark',
        colorId: null,
        colorTag: null,
      };
    }
  } catch (err) {
    console.warn('[LANDMARK] Official landmark check failed:', err);
  }

  return {
    isLandmark: districtInfo.isLandmarkDistrict,
    isOfficialLandmark: false,
    officialLandmarkName: null,
    ...districtInfo,
    landmarkName: null,
    landmarkId: null,
    address: null,
    decade: null,
    designationDate: null,
    classId: null,
    className: null,
    colorId: null,
    colorTag: null,
  };
}
