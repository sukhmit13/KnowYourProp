/**
 * Grocery stores module - provides grocery store data by ZIP code and community area
 * Similar to childcare module pattern, with distance calculation support
 */

import * as fs from 'fs';
import * as path from 'path';
import * as turf from '@turf/turf';

interface GroceryStoreBase {
  name: string;
  address: string;
  squareFeet: number | null;
}

interface GroceryStoreWithCoords extends GroceryStoreBase {
  id: string;
  city: string;
  state: string;
  zip: string;
  latitude: number;
  longitude: number;
  communityArea: string | null;
  communityAreaNumber: number | null;
  isNewStore: boolean;
}

interface GroceryStoreWithDistance extends GroceryStoreBase {
  distance: number; // in miles
}

interface GroceryByZipEntry {
  zip: string;
  storeCount: number;
  stores: GroceryStoreBase[];
}

interface GroceryByCommunityAreaEntry {
  communityArea: string;
  communityAreaNumber: number | null;
  storeCount: number;
  stores: GroceryStoreBase[];
}

interface GroceryByZipData {
  generatedAt: string;
  totalZips: number;
  data: Record<string, GroceryByZipEntry>;
}

interface GroceryByCommunityAreaData {
  generatedAt: string;
  totalCommunityAreas: number;
  data: Record<string, GroceryByCommunityAreaEntry>;
}

interface GroceryStoresData {
  generatedAt: string;
  totalStores: number;
  stores: GroceryStoreWithCoords[];
}

export interface GroceryAccessData {
  storeCount: number;
  stores: GroceryStoreWithDistance[];
  sources: {
    dataSource: string;
    dataYear: string;
  };
}

let groceryByZipData: GroceryByZipData | null = null;
let groceryByCommunityAreaData: GroceryByCommunityAreaData | null = null;
let allGroceryStores: GroceryStoreWithCoords[] = [];
let dataLoaded = false;

function loadGroceryData(): void {
  if (dataLoaded) return;

  try {
    const zipPath = path.join(process.cwd(), 'server', 'data', 'grocery_by_zip.json');
    const caPath = path.join(process.cwd(), 'server', 'data', 'grocery_by_community_area.json');
    const storesPath = path.join(process.cwd(), 'server', 'data', 'grocery_stores.json');

    if (fs.existsSync(zipPath)) {
      const content = fs.readFileSync(zipPath, 'utf-8');
      groceryByZipData = JSON.parse(content);
      console.log(`Loaded grocery data for ${groceryByZipData?.totalZips || 0} ZIP codes`);
    }

    if (fs.existsSync(caPath)) {
      const content = fs.readFileSync(caPath, 'utf-8');
      groceryByCommunityAreaData = JSON.parse(content);
      console.log(`Loaded grocery data for ${groceryByCommunityAreaData?.totalCommunityAreas || 0} community areas`);
    }

    if (fs.existsSync(storesPath)) {
      const content = fs.readFileSync(storesPath, 'utf-8');
      const data = JSON.parse(content) as GroceryStoresData;
      allGroceryStores = data.stores;
      console.log(`Loaded ${allGroceryStores.length} grocery stores with coordinates`);
    }

    dataLoaded = true;
  } catch (err) {
    console.error('Error loading grocery data:', err);
  }
}

export function initGroceryData(): void {
  loadGroceryData();
}

export function resetGroceryCache(): void {
  groceryByZipData = null;
  groceryByCommunityAreaData = null;
  allGroceryStores = [];
  dataLoaded = false;
  console.log('[grocery-stores] Cache cleared — will reload on next request');
}

function normalizeZip(zip: string | number): string {
  return String(zip).padStart(5, '0').substring(0, 5);
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const from = turf.point([lon1, lat1]);
  const to = turf.point([lon2, lat2]);
  return turf.distance(from, to, { units: 'miles' });
}

export function getGroceryAccessByZip(zipCode: string, lat?: number, lon?: number): GroceryAccessData | null {
  if (!dataLoaded) {
    loadGroceryData();
  }

  if (!groceryByZipData) return null;

  const zip = normalizeZip(zipCode);
  const entry = groceryByZipData.data[zip];

  if (!entry) {
    return {
      storeCount: 0,
      stores: [],
      sources: {
        dataSource: 'Chicago Data Portal - Grocery Store Status',
        dataYear: '2024',
      },
    };
  }

  // If we have lat/lon, find matching stores with coordinates and calculate distances
  let storesWithDistance: GroceryStoreWithDistance[];
  
  if (lat !== undefined && lon !== undefined && allGroceryStores.length > 0) {
    // Find stores in this ZIP with coordinates
    const storesInZip = allGroceryStores.filter(s => normalizeZip(s.zip) === zip);
    storesWithDistance = storesInZip
      .map(store => ({
        name: store.name,
        address: store.address,
        squareFeet: store.squareFeet,
        distance: calculateDistance(lat, lon, store.latitude, store.longitude),
      }))
      .sort((a, b) => a.distance - b.distance);
  } else {
    // No coordinates, just return stores without distance
    storesWithDistance = entry.stores.map(store => ({
      ...store,
      distance: 0,
    }));
  }

  return {
    storeCount: entry.storeCount,
    stores: storesWithDistance,
    sources: {
      dataSource: 'Chicago Data Portal - Grocery Store Status',
      dataYear: '2024',
    },
  };
}

export function getGroceryAccessByCommunityArea(communityArea: string, lat?: number, lon?: number): GroceryAccessData | null {
  if (!dataLoaded) {
    loadGroceryData();
  }

  if (!groceryByCommunityAreaData) return null;

  const normalizedCA = communityArea.toUpperCase().trim().replace(/\s+/g, ' ');
  const entry = groceryByCommunityAreaData.data[normalizedCA];

  if (!entry) {
    return {
      storeCount: 0,
      stores: [],
      sources: {
        dataSource: 'Chicago Data Portal - Grocery Store Status',
        dataYear: '2024',
      },
    };
  }

  // If we have lat/lon, find matching stores with coordinates and calculate distances
  let storesWithDistance: GroceryStoreWithDistance[];
  
  if (lat !== undefined && lon !== undefined && allGroceryStores.length > 0) {
    // Find stores in this community area with coordinates
    const storesInCA = allGroceryStores.filter(s => 
      s.communityArea && s.communityArea.toUpperCase() === normalizedCA
    );
    storesWithDistance = storesInCA
      .map(store => ({
        name: store.name,
        address: store.address,
        squareFeet: store.squareFeet,
        distance: calculateDistance(lat, lon, store.latitude, store.longitude),
      }))
      .sort((a, b) => a.distance - b.distance);
  } else {
    // No coordinates, just return stores without distance
    storesWithDistance = entry.stores.map(store => ({
      ...store,
      distance: 0,
    }));
  }

  return {
    storeCount: entry.storeCount,
    stores: storesWithDistance,
    sources: {
      dataSource: 'Chicago Data Portal - Grocery Store Status',
      dataYear: '2024',
    },
  };
}
