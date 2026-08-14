import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';
import { createWriteStream } from 'fs';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import AdmZip from 'adm-zip';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GTFS_CACHE_DIR = path.join(__dirname, 'data', 'gtfs');
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

interface Stop {
  stopId: string;
  stopName: string;
  lat: number;
  lon: number;
  routeType: number; // 1 = rail, 3 = bus
  agency: 'CTA' | 'Metra';
  routes: string[];
  parentStationId?: string;
}

interface TransitResult {
  stopName: string;
  distance: number; // in miles
  routes: string[];
  agency: 'CTA' | 'Metra';
  type: 'rail' | 'bus';
  stationId?: string;
  direction?: 'NS' | 'EW'; // bus routes only — orientation derived from stop spread
}

let ctaStops: Stop[] = [];
let metraStops: Stop[] = [];
let lastRefresh: number = 0;
let isInitialized = false;
let initInProgress = false;
let initRetryTimer: ReturnType<typeof setTimeout> | null = null;

const GTFS_SOURCES = {
  cta: 'https://www.transitchicago.com/downloads/sch_data/google_transit.zip',
  metra: 'https://schedules.metrarail.com/gtfs/schedule.zip'
};

function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = createWriteStream(destPath);
    
    const request = protocol.get(url, { 
      headers: { 
        'User-Agent': 'ChicagoEligibilityScreener/1.0'
      },
      timeout: 120000
    }, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          file.close();
          if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
          return downloadFile(redirectUrl, destPath).then(resolve).catch(reject);
        }
      }
      
      if (response.statusCode !== 200) {
        file.close();
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }

      const expectedSize = parseInt(response.headers['content-length'] || '0', 10);
      let downloadedSize = 0;

      response.on('data', (chunk: Buffer) => {
        downloadedSize += chunk.length;
      });
      
      response.pipe(file);
      file.on('finish', () => {
        file.close(() => {
          if (expectedSize > 0 && downloadedSize < expectedSize) {
            console.error(`Download incomplete: got ${downloadedSize} of ${expectedSize} bytes`);
            if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
            reject(new Error(`Download incomplete: ${downloadedSize}/${expectedSize} bytes`));
          } else {
            console.log(`Download complete: ${downloadedSize} bytes`);
            resolve();
          }
        });
      });
      file.on('error', (err) => {
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
        reject(err);
      });
    });

    request.on('timeout', () => {
      request.destroy();
      file.close();
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
      reject(new Error('Download timeout'));
    });

    request.on('error', (err) => {
      file.close();
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
      reject(err);
    });
  });
}

function extractFromZip(zipPath: string, fileName: string): string {
  const extractDir = path.join(path.dirname(zipPath), path.basename(zipPath, '.zip'));
  
  if (!fs.existsSync(extractDir)) {
    fs.mkdirSync(extractDir, { recursive: true });
  }
  
  try {
    const zip = new AdmZip(zipPath);
    const entry = zip.getEntry(fileName);
    if (!entry) {
      throw new Error(`File ${fileName} not found in ZIP`);
    }
    zip.extractEntryTo(entry, extractDir, false, true);
  } catch (err) {
    console.error(`Error extracting ${fileName} from ${zipPath}:`, err);
    throw err;
  }
  
  return path.join(extractDir, fileName);
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim().replace(/"/g, ''));
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim().replace(/"/g, ''));
  return result;
}

async function parseCSV(filePath: string): Promise<Record<string, string>[]> {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  
  const results: Record<string, string>[] = [];
  const fileStream = createReadStream(filePath);
  const rl = createInterface({ input: fileStream, crlfDelay: Infinity });
  
  let headers: string[] = [];
  let isFirst = true;
  
  for await (const line of rl) {
    if (isFirst) {
      headers = parseCSVLine(line);
      isFirst = false;
      continue;
    }
    
    const values = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = values[i] || '';
    });
    results.push(row);
  }
  
  return results;
}

/**
 * Stream stop_times.txt without loading all rows into memory.
 * Builds stop→route type/name maps on the fly using an already-built trip→route map.
 */
async function buildStopRouteMapsFromStopTimes(
  stopTimesPath: string,
  tripToRoute: Map<string, string>,
  routeInfoMap: Map<string, { type: number; name: string; shortName: string; longName: string }>,
  stopToRouteTypes: Map<string, Set<number>>,
  stopToRouteNames: Map<string, Set<string>>
): Promise<void> {
  const fileStream = createReadStream(stopTimesPath);
  const rl = createInterface({ input: fileStream, crlfDelay: Infinity });

  let headers: string[] = [];
  let isFirst = true;

  for await (const line of rl) {
    if (isFirst) {
      headers = parseCSVLine(line);
      isFirst = false;
      continue;
    }
    const values = parseCSVLine(line);
    const stopId = values[headers.indexOf('stop_id')]?.trim();
    const tripId = values[headers.indexOf('trip_id')]?.trim();
    if (!stopId || !tripId) continue;

    const routeId = tripToRoute.get(tripId);
    if (!routeId) continue;
    const routeInfo = routeInfoMap.get(routeId.trim());
    if (!routeInfo) continue;

    if (!stopToRouteTypes.has(stopId)) {
      stopToRouteTypes.set(stopId, new Set());
      stopToRouteNames.set(stopId, new Set());
    }
    stopToRouteTypes.get(stopId)!.add(routeInfo.type);
    stopToRouteNames.get(stopId)!.add(routeInfo.name);
  }
}

async function loadGTFSData(agency: 'CTA' | 'Metra', zipUrl: string): Promise<Stop[]> {
  const zipFileName = agency.toLowerCase() + '_gtfs.zip';
  const zipPath = path.join(GTFS_CACHE_DIR, zipFileName);
  const processedCachePath = path.join(GTFS_CACHE_DIR, agency.toLowerCase() + '_stops_processed.json');

  // Fast path: if a pre-processed JSON cache exists and is newer than the zip, use it directly.
  // This makes subsequent server restarts nearly instant instead of re-parsing GTFS.
  if (fs.existsSync(processedCachePath) && fs.existsSync(zipPath)) {
    const cacheAge = Date.now() - fs.statSync(processedCachePath).mtimeMs;
    const zipAge = Date.now() - fs.statSync(zipPath).mtimeMs;
    if (cacheAge < CACHE_DURATION_MS && cacheAge <= zipAge + 5000) {
      try {
        const cached = JSON.parse(fs.readFileSync(processedCachePath, 'utf8')) as Stop[];
        const railCount = cached.filter(s => s.routeType === 1 || s.routeType === 2).length;
        const busCount = cached.filter(s => s.routeType === 3).length;
        console.log(`Loaded ${cached.length} ${agency} stops from processed cache (${railCount} rail, ${busCount} bus)`);
        return cached;
      } catch {
        // Corrupt cache — fall through to full parse
      }
    }
  }

  // Check if we need to download
  let needsDownload = true;
  if (fs.existsSync(zipPath)) {
    const stats = fs.statSync(zipPath);
    if (Date.now() - stats.mtimeMs < CACHE_DURATION_MS) {
      needsDownload = false;
      console.log(`Using cached ${agency} GTFS data`);
    }
  }
  
  if (needsDownload) {
    console.log(`Downloading ${agency} GTFS data from ${zipUrl}...`);
    try {
      await downloadFile(zipUrl, zipPath);
      console.log(`Downloaded ${agency} GTFS data`);
    } catch (err) {
      console.error(`Failed to download ${agency} GTFS:`, err);
      if (fs.existsSync(zipPath)) {
        console.log(`Using stale cached ${agency} GTFS data`);
      } else {
        return [];
      }
    }
  }
  
  // Extract and parse stops.txt
  let stopsPath: string;
  let routesPath: string;
  let stopTimesPath: string;
  let tripsPath: string;
  
  try {
    stopsPath = extractFromZip(zipPath, 'stops.txt');
    routesPath = extractFromZip(zipPath, 'routes.txt');
  } catch (err) {
    console.error(`Failed to extract ${agency} GTFS files:`, err);
    if (fs.existsSync(zipPath)) {
      console.log(`Deleting corrupt ${agency} GTFS cache for re-download on next attempt`);
      try { fs.unlinkSync(zipPath); } catch {}
    }
    return [];
  }
  
  const stopsData = await parseCSV(stopsPath);
  const routesData = await parseCSV(routesPath);
  
  // Build route info map with both short and long names
  const routeInfoMap = new Map<string, { type: number; name: string; shortName: string; longName: string }>();
  for (const route of routesData) {
    const routeId = route.route_id?.trim();
    const routeType = parseInt(route.route_type) || 3;
    const shortName = (route.route_short_name || '').trim();
    const longName = (route.route_long_name || '').trim();
    
    // For CTA buses, format as "49 Western" or "X49 Western Express"
    // For CTA rail, use long name like "Blue Line"
    // For Metra, use long name like "Milwaukee West"
    let displayName: string;
    if (agency === 'CTA' && routeType === 3 && shortName) {
      // Bus: combine number + name
      displayName = shortName + (longName ? ' ' + longName : '');
    } else {
      // Rail or other: use long name
      displayName = longName || shortName || routeId;
    }
    
    routeInfoMap.set(routeId, { type: routeType, name: displayName, shortName, longName });
  }
  
  // Parse stop_times and trips to map stops to route types and names
  let stopToRouteTypes = new Map<string, Set<number>>();
  let stopToRouteNames = new Map<string, Set<string>>();
  
  try {
    const stopTimesPath = extractFromZip(zipPath, 'stop_times.txt');
    const tripsPath = extractFromZip(zipPath, 'trips.txt');

    // trips.txt is small — load into memory to build trip→route map
    const tripsData = await parseCSV(tripsPath);
    const tripToRoute = new Map<string, string>();
    for (const trip of tripsData) {
      tripToRoute.set(trip.trip_id, trip.route_id);
    }

    // stop_times.txt is huge (millions of rows) — stream it instead of loading into memory
    await buildStopRouteMapsFromStopTimes(stopTimesPath, tripToRoute, routeInfoMap, stopToRouteTypes, stopToRouteNames);
    console.log(`Parsed ${stopToRouteTypes.size} ${agency} stop-route mappings`);
  } catch (err) {
    console.log(`Could not parse stop_times/trips for ${agency}, using heuristics`);
  }
  
  const stops: Stop[] = [];
  const seenStops = new Map<string, Stop>();
  
  for (const stop of stopsData) {
    const stopId = stop.stop_id;
    let stopName = stop.stop_name;
    const lat = parseFloat(stop.stop_lat);
    const lon = parseFloat(stop.stop_lon);
    const locationType = parseInt(stop.location_type) || 0;
    
    if (isNaN(lat) || isNaN(lon)) continue;
    
    // Skip entries (location_type = 2) and boarding areas (4)
    if (locationType === 2 || locationType === 4) continue;
    
    // Determine route type
    let routeType = 3; // default to bus
    let routes: string[] = [];
    
    if (agency === 'CTA') {
      const routeTypes = stopToRouteTypes.get(stopId);
      const routeNames = stopToRouteNames.get(stopId);
      
      if (routeTypes && routeTypes.size > 0) {
        // Use actual route_type from GTFS (1 = subway/metro, 3 = bus)
        routeType = routeTypes.has(1) ? 1 : 3;
        if (routeNames) {
          routes = Array.from(routeNames).slice(0, 3);
        }
      } else {
        // Fallback: Rail stops typically have parent_station or are location_type=1
        if (locationType === 1 || (stop.parent_station && stop.parent_station.length > 0)) {
          routeType = 1;
        }
      }
    } else if (agency === 'Metra') {
      routeType = 2; // Metra is commuter rail
      const routeNames = stopToRouteNames.get(stopId);
      if (routeNames) {
        routes = Array.from(routeNames);
      }
    }
    
    // For bus stops, just clean up the name but keep direction for uniqueness
    // For rail, strip the line name since we track it separately in routes
    let normalizedName = stopName.replace(/\s+/g, ' ').trim();
    if (routeType === 1 || routeType === 2) {
      // Remove line names from station name (they're in routes array)
      normalizedName = normalizedName
        .replace(/\s*\((Green|Blue|Red|Brown|Orange|Pink|Purple|Yellow)\s*Line\)\s*/gi, '')
        .replace(/\s*-\s*(Green|Blue|Red|Brown|Orange|Pink|Purple|Yellow)\s*/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
    }
    
    // Use just coordinates + routeType for deduplication (3 decimal = ~350ft grid)
    // This keeps one stop per location per mode
    const key = `${lat.toFixed(3)}-${lon.toFixed(3)}-${routeType}`;
    
    if (seenStops.has(key)) {
      const existing = seenStops.get(key)!;
      routes.forEach(r => {
        if (!existing.routes.includes(r)) {
          existing.routes.push(r);
        }
      });
      if (!existing.parentStationId && stop.parent_station) {
        existing.parentStationId = stop.parent_station;
      } else if (!existing.parentStationId && locationType === 1) {
        existing.parentStationId = stopId;
      }
      continue;
    }
    
    let parentStationId: string | undefined;
    if (agency === 'CTA' && (routeType === 1)) {
      if (locationType === 1) {
        parentStationId = stopId;
      } else if (stop.parent_station && stop.parent_station.length > 0) {
        parentStationId = stop.parent_station;
      }
    }

    const stopEntry: Stop = {
      stopId,
      stopName: normalizedName,
      lat,
      lon,
      routeType,
      agency,
      routes,
      parentStationId
    };
    
    seenStops.set(key, stopEntry);
    stops.push(stopEntry);
  }
  
  const railCount = stops.filter(s => s.routeType === 1 || s.routeType === 2).length;
  const busCount = stops.filter(s => s.routeType === 3).length;
  console.log(`Loaded ${stops.length} ${agency} stops (${railCount} rail, ${busCount} bus)`);

  // Save processed stops to JSON so the next server restart can skip GTFS re-parsing
  try {
    fs.writeFileSync(processedCachePath, JSON.stringify(stops));
    console.log(`Saved ${agency} processed stop cache (${stops.length} stops)`);
  } catch (err) {
    console.error(`Could not save ${agency} processed stop cache:`, err);
  }

  return stops;
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export async function initTransit(retryCount: number = 0): Promise<void> {
  if (isInitialized && Date.now() - lastRefresh < CACHE_DURATION_MS) {
    return;
  }

  if (initInProgress) {
    return;
  }
  
  if (!fs.existsSync(GTFS_CACHE_DIR)) {
    fs.mkdirSync(GTFS_CACHE_DIR, { recursive: true });
  }
  
  initInProgress = true;
  console.log(`Initializing transit data${retryCount > 0 ? ` (retry ${retryCount})` : ''}...`);
  
  try {
    const [ctaResult, metraResult] = await Promise.allSettled([
      loadGTFSData('CTA', GTFS_SOURCES.cta),
      loadGTFSData('Metra', GTFS_SOURCES.metra)
    ]);
    
    const cta = ctaResult.status === 'fulfilled' ? ctaResult.value : [];
    const metra = metraResult.status === 'fulfilled' ? metraResult.value : [];

    if (ctaResult.status === 'rejected') {
      console.error('CTA GTFS load failed:', ctaResult.reason);
    }
    if (metraResult.status === 'rejected') {
      console.error('Metra GTFS load failed:', metraResult.reason);
    }

    if (cta.length > 0 || metra.length > 0) {
      ctaStops = cta;
      metraStops = metra;
      lastRefresh = Date.now();
      isInitialized = true;
      console.log(`Transit data initialized: ${ctaStops.length} CTA stops, ${metraStops.length} Metra stops`);
      
      if ((cta.length === 0 || metra.length === 0) && retryCount < 3) {
        console.log('Partial transit data loaded, scheduling retry for missing data...');
        scheduleRetry(retryCount + 1);
      }
    } else {
      console.error('No transit data loaded from either source');
      if (retryCount < 5) {
        scheduleRetry(retryCount + 1);
      } else {
        console.error('Transit init: exhausted all retries');
      }
    }
  } catch (err) {
    console.error('Failed to initialize transit data:', err);
    if (retryCount < 5) {
      scheduleRetry(retryCount + 1);
    }
  } finally {
    initInProgress = false;
  }
}

function scheduleRetry(retryCount: number) {
  if (initRetryTimer) {
    clearTimeout(initRetryTimer);
  }
  const delay = Math.min(15000 * retryCount, 60000);
  console.log(`Scheduling transit data retry in ${delay / 1000}s...`);
  initRetryTimer = setTimeout(() => {
    initTransit(retryCount).catch(err => console.error('Transit retry error:', err));
  }, delay);
}

export function findNearestTransit(lat: number, lon: number, maxResults: number = 5): {
  ctaRail: TransitResult[];
  ctaBus: TransitResult[];
  metra: TransitResult[];
} {
  const busMaxDistance = 0.5; // 0.5 mile radius for bus stops
  const railMaxDistance = 2.0; // 2 mile radius for train stations
  
  // Find CTA rail stations (2 mile radius)
  // Deduplicate by station name - each station appears once with all its lines
  const allRailStops = ctaStops
    .filter(s => s.routeType === 1)
    .map(s => ({
      ...s,
      distance: haversineDistance(lat, lon, s.lat, s.lon)
    }))
    .filter(s => s.distance <= railMaxDistance)
    .sort((a, b) => a.distance - b.distance);
  
  const stationMap = new Map<string, typeof allRailStops[0]>();
  for (const stop of allRailStops) {
    const groupKey = stop.parentStationId || `${stop.stopName}-${stop.lat.toFixed(3)}-${stop.lon.toFixed(3)}`;
    const existing = stationMap.get(groupKey);
    if (!existing) {
      stationMap.set(groupKey, { ...stop });
    } else {
      const existingRoutes = new Set(existing.routes);
      for (const route of stop.routes) {
        existingRoutes.add(route);
      }
      existing.routes = Array.from(existingRoutes);
    }
  }
  
  const ctaRailStops = Array.from(stationMap.values())
    .sort((a, b) => a.distance - b.distance)
    .slice(0, maxResults);
  
  // Find CTA bus stops (0.5 mile radius)
  // Deduplicate by route number - show closest stop for each unique bus line
  const allBusStops = ctaStops
    .filter(s => s.routeType === 3)
    .map(s => ({
      ...s,
      distance: haversineDistance(lat, lon, s.lat, s.lon)
    }))
    .filter(s => s.distance <= busMaxDistance)
    .sort((a, b) => a.distance - b.distance);
  
  // Group by route number, keeping closest stop per route
  // Each route (49, X49, 65, etc.) appears once with its closest stop
  const routeStops = new Map<string, { stop: typeof allBusStops[0]; routeKey: string }>();
  for (const stop of allBusStops) {
    // Process each route at this stop
    for (const routeName of stop.routes) {
      // Extract route number (e.g., "X49" from "X49 Western Express", "65" from "65 Grand")
      const match = routeName.match(/^(X?\d+[A-Z]?)/i);
      const routeKey = match ? match[1].toUpperCase() : routeName;
      
      if (!routeStops.has(routeKey)) {
        // Create a stop entry with just this route
        routeStops.set(routeKey, {
          stop: { ...stop, routes: [routeName] },
          routeKey
        });
      }
    }
  }
  
  // Sort by distance (closest first)
  const nearestBusRoutes = Array.from(routeStops.values())
    .sort((a, b) => a.stop.distance - b.stop.distance)
    .slice(0, 5); // Top 5 unique routes

  // Derive each route's orientation (N–S vs E–W) from the geographic spread of
  // ALL its stops citywide — a route on a N–S street spans far more latitude
  // than longitude. Computed, never hardcoded per route.
  const routeOrientation = (routeKey: string): 'NS' | 'EW' | undefined => {
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity, n = 0;
    for (const s of ctaStops) {
      if (s.routeType !== 3) continue;
      let onRoute = false;
      for (const r of s.routes) {
        const m = r.match(/^(X?\d+[A-Z]?)/i);
        if ((m ? m[1].toUpperCase() : r) === routeKey) { onRoute = true; break; }
      }
      if (!onRoute) continue;
      n++;
      if (s.lat < minLat) minLat = s.lat;
      if (s.lat > maxLat) maxLat = s.lat;
      if (s.lon < minLon) minLon = s.lon;
      if (s.lon > maxLon) maxLon = s.lon;
    }
    if (n < 4) return undefined;
    const latMiles = (maxLat - minLat) * 69;      // deg latitude → miles
    const lonMiles = (maxLon - minLon) * 51.5;    // deg longitude → miles at ~41.9°N
    if (latMiles === 0 && lonMiles === 0) return undefined;
    return latMiles >= lonMiles ? 'NS' : 'EW';
  };
  const busDirections = new Map<string, 'NS' | 'EW' | undefined>(
    nearestBusRoutes.map(r => [r.routeKey, routeOrientation(r.routeKey)])
  );
  const ctaBusStops = nearestBusRoutes.map(r => ({ ...r.stop, routeKey: r.routeKey }));
  
  // Find Metra stations (2 mile radius)
  const metraStations = metraStops
    .map(s => ({
      ...s,
      distance: haversineDistance(lat, lon, s.lat, s.lon)
    }))
    .filter(s => s.distance <= railMaxDistance)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, maxResults);
  
  return {
    ctaRail: ctaRailStops.map(s => ({
      stopName: s.stopName,
      distance: Math.round(s.distance * 100) / 100,
      routes: s.routes,
      agency: s.agency,
      type: 'rail' as const,
      stationId: s.parentStationId
    })),
    ctaBus: ctaBusStops.map(s => ({
      stopName: s.stopName,
      distance: Math.round(s.distance * 100) / 100,
      routes: s.routes,
      agency: s.agency,
      type: 'bus' as const,
      direction: busDirections.get((s as any).routeKey)
    })),
    metra: metraStations.map(s => ({
      stopName: s.stopName,
      distance: Math.round(s.distance * 100) / 100,
      routes: s.routes,
      agency: s.agency,
      type: 'rail' as const,
      stationId: s.stopId
    }))
  };
}

export function isTransitInitialized(): boolean {
  return isInitialized;
}

// TOD (Transit-Oriented Development) Status
interface TODQualifyingRoutes {
  qualifying_routes: string[];
  route_names: Record<string, string>;
  tod_radius_miles: number;
}

let todQualifyingRoutes: TODQualifyingRoutes | null = null;

function loadTODRoutes(): TODQualifyingRoutes {
  if (todQualifyingRoutes) return todQualifyingRoutes;
  
  const todPath = path.join(__dirname, 'data', 'tod_qualifying_bus_routes.json');
  if (fs.existsSync(todPath)) {
    todQualifyingRoutes = JSON.parse(fs.readFileSync(todPath, 'utf-8'));
    return todQualifyingRoutes!;
  } else {
    todQualifyingRoutes = {
      qualifying_routes: ['9', '20', '22', '36', '49', '66', '72', '79', 'X9'],
      route_names: {
        '9': 'Ashland', '20': 'Madison', '22': 'Clark', '36': 'Broadway',
        '49': 'Western', '66': 'Chicago', '72': 'North', '79': '79th Street', 'X9': 'Ashland Express'
      },
      tod_radius_miles: 0.25
    };
    return todQualifyingRoutes;
  }
}

export interface TODStatus {
  inTOD: boolean;
  todType: 'Rail Station' | 'High-Frequency Bus' | null;
  nearestStation: string | null;
  stationType: 'CTA Rail' | 'Metra' | null;
  busRoute: string | null;
  busRouteName: string | null;
  distance: number | null;
  closestRailStation: { name: string; type: string; distance: number } | null;
  closestQualifyingBus: { name: string; route: string; routeName: string; distance: number } | null;
  qualifyingBusRoutes: string[];
}

export function checkTODStatus(transitData: {
  ctaRail: TransitResult[];
  ctaBus: TransitResult[];
  metra: TransitResult[];
}): TODStatus {
  const todRoutes = loadTODRoutes();
  const TOD_RADIUS = todRoutes.tod_radius_miles;
  
  // Check 1: CTA Rail stations
  const closestCTARail = transitData.ctaRail[0];
  if (closestCTARail && closestCTARail.distance <= TOD_RADIUS) {
    return {
      inTOD: true,
      todType: 'Rail Station',
      nearestStation: closestCTARail.stopName,
      stationType: 'CTA Rail',
      busRoute: null,
      busRouteName: null,
      distance: closestCTARail.distance,
      closestRailStation: { name: closestCTARail.stopName, type: 'CTA Rail', distance: closestCTARail.distance },
      closestQualifyingBus: null,
      qualifyingBusRoutes: todRoutes.qualifying_routes
    };
  }
  
  // Check 2: Metra stations
  const closestMetra = transitData.metra[0];
  if (closestMetra && closestMetra.distance <= TOD_RADIUS) {
    return {
      inTOD: true,
      todType: 'Rail Station',
      nearestStation: closestMetra.stopName,
      stationType: 'Metra',
      busRoute: null,
      busRouteName: null,
      distance: closestMetra.distance,
      closestRailStation: { name: closestMetra.stopName, type: 'Metra', distance: closestMetra.distance },
      closestQualifyingBus: null,
      qualifyingBusRoutes: todRoutes.qualifying_routes
    };
  }
  
  // Check 3: High-frequency bus routes
  const qualifyingBusStops = transitData.ctaBus.filter(stop =>
    stop.routes.some(route => todRoutes.qualifying_routes.includes(route))
  );
  
  const closestQualifyingBus = qualifyingBusStops[0];
  if (closestQualifyingBus && closestQualifyingBus.distance <= TOD_RADIUS) {
    const qualifyingRoute = closestQualifyingBus.routes.find(r => todRoutes.qualifying_routes.includes(r)) || closestQualifyingBus.routes[0];
    return {
      inTOD: true,
      todType: 'High-Frequency Bus',
      nearestStation: closestQualifyingBus.stopName,
      stationType: null,
      busRoute: qualifyingRoute,
      busRouteName: todRoutes.route_names[qualifyingRoute] || qualifyingRoute,
      distance: closestQualifyingBus.distance,
      closestRailStation: null,
      closestQualifyingBus: {
        name: closestQualifyingBus.stopName,
        route: qualifyingRoute,
        routeName: todRoutes.route_names[qualifyingRoute] || qualifyingRoute,
        distance: closestQualifyingBus.distance
      },
      qualifyingBusRoutes: todRoutes.qualifying_routes
    };
  }
  
  // Not in TOD - find closest qualifying transit for display
  const closestRail = closestCTARail && closestMetra 
    ? (closestCTARail.distance < closestMetra.distance ? closestCTARail : closestMetra)
    : (closestCTARail || closestMetra);
  
  const railType = closestRail === closestMetra ? 'Metra' : 'CTA Rail';
  
  return {
    inTOD: false,
    todType: null,
    nearestStation: null,
    stationType: null,
    busRoute: null,
    busRouteName: null,
    distance: null,
    closestRailStation: closestRail ? { name: closestRail.stopName, type: railType, distance: closestRail.distance } : null,
    closestQualifyingBus: closestQualifyingBus ? {
      name: closestQualifyingBus.stopName,
      route: closestQualifyingBus.routes.find(r => todRoutes.qualifying_routes.includes(r)) || closestQualifyingBus.routes[0],
      routeName: todRoutes.route_names[closestQualifyingBus.routes.find(r => todRoutes.qualifying_routes.includes(r)) || ''] || '',
      distance: closestQualifyingBus.distance
    } : null,
    qualifyingBusRoutes: todRoutes.qualifying_routes
  };
}
