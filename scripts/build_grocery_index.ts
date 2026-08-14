/**
 * Build grocery store index from Chicago Data Portal
 * 
 * Data sources:
 * - Grocery stores: https://data.cityofchicago.org/resource/53t8-wyrc.json
 * - Community areas GeoJSON: https://data.cityofchicago.org/resource/3e26-zek2.geojson
 * 
 * Run with: npx tsx scripts/build_grocery_index.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const GROCERY_API_URL = 'https://data.cityofchicago.org/resource/53t8-wyrc.json?$limit=10000';
const COMMUNITY_AREAS_URL = 'https://data.cityofchicago.org/resource/3e26-zek2.geojson';

interface GroceryStoreRaw {
  store_name?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  latitude?: string;
  longitude?: string;
  community_area?: string;
  community_area_name?: string;
  square_feet?: string;
  new_store?: string;
}

interface GroceryStore {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  latitude: number;
  longitude: number;
  communityArea: string | null;
  communityAreaNumber: number | null;
  squareFeet: number | null;
  isNewStore: boolean;
}

interface CommunityAreaFeature {
  type: string;
  properties: {
    area_num_1?: string;
    area_numbe?: string;
    community?: string;
  };
  geometry: any;
}

interface GroceryByZip {
  zip: string;
  storeCount: number;
  stores: { name: string; address: string; squareFeet: number | null }[];
}

interface GroceryByCommunityArea {
  communityArea: string;
  communityAreaNumber: number | null;
  storeCount: number;
  stores: { name: string; address: string; squareFeet: number | null }[];
}

async function fetchData<T>(url: string): Promise<T> {
  console.log(`Fetching: ${url}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return await response.json() as T;
}

async function buildGroceryIndex() {
  console.log('Building grocery store index...\n');

  const dataDir = path.join(process.cwd(), 'server', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Fetch grocery store data
  const rawStores = await fetchData<GroceryStoreRaw[]>(GROCERY_API_URL);
  console.log(`Fetched ${rawStores.length} grocery stores`);

  // Fetch community areas GeoJSON for reference
  const communityAreasGeoJSON = await fetchData<{ features: CommunityAreaFeature[] }>(COMMUNITY_AREAS_URL);
  console.log(`Fetched ${communityAreasGeoJSON.features.length} community areas`);

  // Build community area lookup map
  const communityAreaNames = new Map<string, string>();
  for (const feature of communityAreasGeoJSON.features) {
    const num = feature.properties.area_num_1 || feature.properties.area_numbe;
    const name = feature.properties.community;
    if (num && name) {
      communityAreaNames.set(num, name.toUpperCase());
    }
  }

  // Process grocery stores
  const stores: GroceryStore[] = rawStores
    .filter(store => store.latitude && store.longitude && store.store_name)
    .map((store, idx) => {
      const caNum = store.community_area ? parseInt(store.community_area) : null;
      return {
        id: `grocery-${idx}`,
        name: store.store_name || 'Unknown',
        address: store.address || '',
        city: store.city || 'Chicago',
        state: store.state || 'IL',
        zip: store.zip_code || '',
        latitude: parseFloat(store.latitude!),
        longitude: parseFloat(store.longitude!),
        communityArea: store.community_area_name?.toUpperCase() || 
                       (caNum ? communityAreaNames.get(String(caNum)) : null) || null,
        communityAreaNumber: caNum,
        squareFeet: store.square_feet ? parseInt(store.square_feet) : null,
        isNewStore: store.new_store === 'Y' || store.new_store === 'Yes',
      };
    });

  console.log(`Processed ${stores.length} valid grocery stores`);

  // Group by ZIP code
  const byZip = new Map<string, GroceryByZip>();
  for (const store of stores) {
    if (!store.zip) continue;
    const zip = store.zip.substring(0, 5); // Normalize to 5 digits
    if (!byZip.has(zip)) {
      byZip.set(zip, { zip, storeCount: 0, stores: [] });
    }
    const entry = byZip.get(zip)!;
    entry.storeCount++;
    entry.stores.push({
      name: store.name,
      address: store.address,
      squareFeet: store.squareFeet,
    });
  }

  // Group by community area
  const byCommunityArea = new Map<string, GroceryByCommunityArea>();
  for (const store of stores) {
    if (!store.communityArea) continue;
    const ca = store.communityArea.toUpperCase();
    if (!byCommunityArea.has(ca)) {
      byCommunityArea.set(ca, { 
        communityArea: ca, 
        communityAreaNumber: store.communityAreaNumber,
        storeCount: 0, 
        stores: [] 
      });
    }
    const entry = byCommunityArea.get(ca)!;
    entry.storeCount++;
    entry.stores.push({
      name: store.name,
      address: store.address,
      squareFeet: store.squareFeet,
    });
  }

  // Write output files
  const groceryData = {
    generatedAt: new Date().toISOString(),
    totalStores: stores.length,
    stores,
  };

  const groceryByZipData = {
    generatedAt: new Date().toISOString(),
    totalZips: byZip.size,
    data: Object.fromEntries(byZip),
  };

  const groceryByCommunityAreaData = {
    generatedAt: new Date().toISOString(),
    totalCommunityAreas: byCommunityArea.size,
    data: Object.fromEntries(byCommunityArea),
  };

  // Save files
  fs.writeFileSync(
    path.join(dataDir, 'grocery_stores.json'),
    JSON.stringify(groceryData, null, 2)
  );
  console.log(`Saved grocery_stores.json (${stores.length} stores)`);

  fs.writeFileSync(
    path.join(dataDir, 'grocery_by_zip.json'),
    JSON.stringify(groceryByZipData, null, 2)
  );
  console.log(`Saved grocery_by_zip.json (${byZip.size} ZIP codes)`);

  fs.writeFileSync(
    path.join(dataDir, 'grocery_by_community_area.json'),
    JSON.stringify(groceryByCommunityAreaData, null, 2)
  );
  console.log(`Saved grocery_by_community_area.json (${byCommunityArea.size} community areas)`);

  // Save community areas GeoJSON for reference
  fs.writeFileSync(
    path.join(dataDir, 'community_areas.geojson'),
    JSON.stringify(communityAreasGeoJSON, null, 2)
  );
  console.log(`Saved community_areas.geojson`);

  console.log('\nGrocery store index built successfully!');
  console.log(`Total stores: ${stores.length}`);
  console.log(`ZIP codes with stores: ${byZip.size}`);
  console.log(`Community areas with stores: ${byCommunityArea.size}`);
}

buildGroceryIndex().catch(console.error);
