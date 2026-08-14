/**
 * Business Locations module - queries locally stored business data
 * Includes: EV stations, gas stations, hotels, restaurants, coffee shops, bars
 */

import * as fs from 'fs';
import * as path from 'path';

interface EvStation {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  latitude: number;
  longitude: number;
  phone: string | null;
  accessDays: string | null;
  evNetwork: string | null;
  evLevel2Count: number | null;
  dcFastCount: number | null;
  dateLastConfirmed: string | null;
}

interface BusinessLocation {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  latitude: number;
  longitude: number;
  licenseNumber?: string;
  licenseDescription?: string;
  communityArea: string | null;
  neighborhood: string | null;
}

interface EvStationData {
  generatedAt: string;
  totalStations: number;
  stations: EvStation[];
}

interface BusinessData {
  generatedAt: string;
  totalLocations?: number;
  totalStations?: number;
  locations?: BusinessLocation[];
  stations?: BusinessLocation[];
}

interface NearbyEvStation extends EvStation {
  distanceMiles: number;
}

interface NearbyBusinessLocation extends BusinessLocation {
  distanceMiles: number;
}

// Cache for loaded data
let evStationData: EvStationData | null = null;
let gasStationData: BusinessData | null = null;
let hotelData: BusinessData | null = null;
let restaurantData: BusinessData | null = null;
let coffeeShopData: BusinessData | null = null;
let barData: BusinessData | null = null;
let dayCareData: BusinessData | null = null;

function loadEvStationData(): EvStationData | null {
  if (evStationData) return evStationData;
  
  const dataPath = path.join(process.cwd(), 'server', 'data', 'ev_stations.json');
  
  if (!fs.existsSync(dataPath)) {
    console.log('EV station data file not found. Run: npx tsx scripts/build_ev_index.ts');
    return null;
  }
  
  try {
    const content = fs.readFileSync(dataPath, 'utf-8');
    evStationData = JSON.parse(content);
    console.log(`Loaded ${evStationData?.totalStations || 0} EV stations from local data`);
    return evStationData;
  } catch (error) {
    console.error('Error loading EV station data:', error);
    return null;
  }
}

function loadBusinessData(filename: string, label: string): BusinessData | null {
  const dataPath = path.join(process.cwd(), 'server', 'data', filename);
  
  if (!fs.existsSync(dataPath)) {
    console.log(`${label} data file not found. Run: npx tsx scripts/build_ev_index.ts`);
    return null;
  }
  
  try {
    const content = fs.readFileSync(dataPath, 'utf-8');
    const data = JSON.parse(content);
    const count = data.totalLocations || data.totalStations || 0;
    console.log(`Loaded ${count} ${label} from local data`);
    return data;
  } catch (error) {
    console.error(`Error loading ${label} data:`, error);
    return null;
  }
}

function calculateDistanceMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
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

export function findNearbyEvStations(
  lat: number, 
  lon: number, 
  radiusMiles: number = 3, 
  limit: number = 10
): { stations: NearbyEvStation[]; totalFound: number; within1Mile: number; within2Miles: number; within3Miles: number } | null {
  const data = loadEvStationData();
  
  if (!data || !data.stations) {
    return null;
  }
  
  const nearbyStations: NearbyEvStation[] = data.stations
    .map(station => {
      const distanceMiles = calculateDistanceMiles(lat, lon, station.latitude, station.longitude);
      return {
        ...station,
        distanceMiles: Math.round(distanceMiles * 100) / 100,
      };
    })
    .filter(station => station.distanceMiles <= radiusMiles)
    .sort((a, b) => a.distanceMiles - b.distanceMiles);
  
  return {
    stations: nearbyStations.slice(0, limit),
    totalFound: nearbyStations.length,
    within1Mile: nearbyStations.filter(s => s.distanceMiles <= 1).length,
    within2Miles: nearbyStations.filter(s => s.distanceMiles <= 2).length,
    within3Miles: nearbyStations.filter(s => s.distanceMiles <= 3).length,
  };
}

function findNearbyBusinessLocations(
  data: BusinessData | null,
  lat: number, 
  lon: number, 
  radiusMiles: number = 3, 
  limit: number = 10
): { locations: NearbyBusinessLocation[]; totalFound: number; within1Mile: number; within2Miles: number; within3Miles: number } | null {
  if (!data) return null;
  
  const locations = data.locations || data.stations || [];
  if (!locations.length) return null;
  
  const seen = new Set<string>();
  const nearbyLocations: NearbyBusinessLocation[] = locations
    .map(loc => {
      const distanceMiles = calculateDistanceMiles(lat, lon, loc.latitude, loc.longitude);
      return {
        ...loc,
        distanceMiles: Math.round(distanceMiles * 100) / 100,
      };
    })
    .filter(loc => loc.distanceMiles <= radiusMiles)
    .sort((a, b) => a.distanceMiles - b.distanceMiles)
    .filter(loc => {
      const key = `${(loc.name || '').trim().toUpperCase()}|${(loc.address || '').trim().toUpperCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  
  return {
    locations: nearbyLocations.slice(0, limit),
    totalFound: nearbyLocations.length,
    within1Mile: nearbyLocations.filter(loc => loc.distanceMiles <= 1).length,
    within2Miles: nearbyLocations.filter(loc => loc.distanceMiles <= 2).length,
    within3Miles: nearbyLocations.filter(loc => loc.distanceMiles <= 3).length,
  };
}

export function findNearbyGasStations(
  lat: number, 
  lon: number, 
  radiusMiles: number = 3, 
  limit: number = 10
): { stations: NearbyBusinessLocation[]; totalFound: number; within1Mile: number; within2Miles: number; within3Miles: number } | null {
  if (!gasStationData) {
    gasStationData = loadBusinessData('gas_stations.json', 'gas stations');
  }
  
  const result = findNearbyBusinessLocations(gasStationData, lat, lon, radiusMiles, limit);
  if (!result) return null;
  
  return {
    stations: result.locations,
    totalFound: result.totalFound,
    within1Mile: result.within1Mile,
    within2Miles: result.within2Miles,
    within3Miles: result.within3Miles,
  };
}

// Check if a hotel name indicates it's a short-term rental (Airbnb, vacation rental, shared housing)
function isShortTermRental(name: string): boolean {
  const upperName = name.toUpperCase();
  const shortTermPatterns = [
    'AIRBNB',
    'AIR BNB',
    'VACATION',
    'VRBO',
    'SHARED HOUSING',
    'SHORT TERM',
    'SHORT-TERM',
    'RENTAL UNIT',
    'HOME SHARE',
    'HOMESHARE',
  ];
  return shortTermPatterns.some(pattern => upperName.includes(pattern));
}

interface NearbyBusinessLocationWithType extends NearbyBusinessLocation {
  isShortTermRental: boolean;
}

export interface HotelSearchResult {
  locations: NearbyBusinessLocationWithType[];
  totalFound: number;
  within1Mile: number;
  within2Miles: number;
  within3Miles: number;
  shortTermRentals: {
    totalFound: number;
    within1Mile: number;
    within2Miles: number;
    within3Miles: number;
  };
}

export function findNearbyHotels(
  lat: number, 
  lon: number, 
  radiusMiles: number = 3, 
  limit: number = 10
): HotelSearchResult | null {
  if (!hotelData) {
    hotelData = loadBusinessData('hotels.json', 'hotels');
  }
  
  if (!hotelData) return null;
  
  const locations = hotelData.locations || hotelData.stations || [];
  
  // Calculate distances and categorize all locations
  const allWithDistance = locations
    .filter(loc => loc.latitude && loc.longitude)
    .map(loc => ({
      ...loc,
      distanceMiles: parseFloat(calculateDistanceMiles(lat, lon, loc.latitude, loc.longitude).toFixed(2)),
      isShortTermRental: isShortTermRental(loc.name),
    }))
    .filter(loc => loc.distanceMiles <= radiusMiles)
    .sort((a, b) => a.distanceMiles - b.distanceMiles);
  
  // Separate traditional hotels/motels from short-term rentals
  const traditionalHotels = allWithDistance.filter(loc => !loc.isShortTermRental);
  const shortTermRentals = allWithDistance.filter(loc => loc.isShortTermRental);
  
  return {
    // Return only traditional hotels in the main list
    locations: traditionalHotels.slice(0, limit),
    totalFound: traditionalHotels.length,
    within1Mile: traditionalHotels.filter(loc => loc.distanceMiles <= 1).length,
    within2Miles: traditionalHotels.filter(loc => loc.distanceMiles <= 2).length,
    within3Miles: traditionalHotels.filter(loc => loc.distanceMiles <= 3).length,
    // Separate tally for short-term rentals
    shortTermRentals: {
      totalFound: shortTermRentals.length,
      within1Mile: shortTermRentals.filter(loc => loc.distanceMiles <= 1).length,
      within2Miles: shortTermRentals.filter(loc => loc.distanceMiles <= 2).length,
      within3Miles: shortTermRentals.filter(loc => loc.distanceMiles <= 3).length,
    },
  };
}

export function findNearbyRestaurants(
  lat: number, 
  lon: number, 
  radiusMiles: number = 3, 
  limit: number = 10
): { locations: NearbyBusinessLocation[]; totalFound: number; within1Mile: number; within2Miles: number; within3Miles: number } | null {
  if (!restaurantData) {
    restaurantData = loadBusinessData('restaurants.json', 'restaurants');
  }
  
  return findNearbyBusinessLocations(restaurantData, lat, lon, radiusMiles, limit);
}

export function findNearbyCoffeeShops(
  lat: number, 
  lon: number, 
  radiusMiles: number = 3, 
  limit: number = 10
): { locations: NearbyBusinessLocation[]; totalFound: number; within1Mile: number; within2Miles: number; within3Miles: number } | null {
  if (!coffeeShopData) {
    coffeeShopData = loadBusinessData('coffee_shops.json', 'coffee shops');
  }
  
  return findNearbyBusinessLocations(coffeeShopData, lat, lon, radiusMiles, limit);
}

export function findNearbyBars(
  lat: number, 
  lon: number, 
  radiusMiles: number = 3, 
  limit: number = 10
): { locations: NearbyBusinessLocation[]; totalFound: number; within1Mile: number; within2Miles: number; within3Miles: number } | null {
  if (!barData) {
    barData = loadBusinessData('bars.json', 'bars/taverns');
  }
  
  return findNearbyBusinessLocations(barData, lat, lon, radiusMiles, limit);
}

export function findNearbyDayCares(
  lat: number, 
  lon: number, 
  radiusMiles: number = 3, 
  limit: number = 20
): { locations: NearbyBusinessLocation[]; totalFound: number; within1Mile: number; within2Miles: number; within3Miles: number } | null {
  if (!dayCareData) {
    dayCareData = loadBusinessData('day_care_centers.json', 'day care centers');
  }
  
  return findNearbyBusinessLocations(dayCareData, lat, lon, radiusMiles, limit);
}

export function reloadStationData(): void {
  evStationData = null;
  gasStationData = null;
  hotelData = null;
  restaurantData = null;
  coffeeShopData = null;
  barData = null;
  dayCareData = null;
  loadEvStationData();
}
