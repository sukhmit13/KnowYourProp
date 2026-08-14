/**
 * Build script to download and store business location data locally.
 * Run this script periodically (e.g., weekly) to update the local dataset.
 * 
 * Usage: npx tsx scripts/build_ev_index.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(process.cwd(), 'server', 'data');
const EV_OUTPUT_FILE = path.join(DATA_DIR, 'ev_stations.json');
const GAS_OUTPUT_FILE = path.join(DATA_DIR, 'gas_stations.json');
const HOTELS_OUTPUT_FILE = path.join(DATA_DIR, 'hotels.json');
const RESTAURANTS_OUTPUT_FILE = path.join(DATA_DIR, 'restaurants.json');
const COFFEE_SHOPS_OUTPUT_FILE = path.join(DATA_DIR, 'coffee_shops.json');
const BARS_OUTPUT_FILE = path.join(DATA_DIR, 'bars.json');
const LIQUOR_STORES_OUTPUT_FILE = path.join(DATA_DIR, 'liquor_stores.json');
const DAY_CARE_OUTPUT_FILE = path.join(DATA_DIR, 'day_care_centers.json');
const MASSAGE_SPA_OUTPUT_FILE = path.join(DATA_DIR, 'massage_spas.json');
const AUTO_REPAIR_OUTPUT_FILE = path.join(DATA_DIR, 'auto_repair_shops.json');
const PET_STORES_OUTPUT_FILE = path.join(DATA_DIR, 'pet_stores.json');
const VET_CLINICS_OUTPUT_FILE = path.join(DATA_DIR, 'vet_clinics.json');
const NIGHTCLUBS_OUTPUT_FILE = path.join(DATA_DIR, 'nightclubs.json');
const EVENT_VENUES_OUTPUT_FILE = path.join(DATA_DIR, 'event_venues.json');
const BREWERIES_OUTPUT_FILE = path.join(DATA_DIR, 'breweries.json');

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
  licenseNumber: string;
  licenseDescription: string;
  communityArea: string | null;
  neighborhood: string | null;
}

async function fetchEvStations(): Promise<EvStation[]> {
  console.log('Fetching EV charging stations from Chicago Data Portal...');
  
  // Alternative Fuel Locations dataset (fi3z-jc3f) - filter for electric only
  // Using simple filter for ELEC fuel type, then filtering public access in code
  const url = `https://data.cityofchicago.org/resource/fi3z-jc3f.json?fuel_type_code=ELEC&$limit=5000`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch EV stations: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  console.log(`Fetched ${data.length} raw records from API`);
  
  const stations: EvStation[] = data
    .filter((station: any) => {
      const lat = parseFloat(station.latitude);
      const lon = parseFloat(station.longitude);
      // Filter for valid coordinates and public access
      const hasValidCoords = !isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0;
      const isPublic = station.groups_with_access_code === 'Public' || 
                       station.groups_with_access_code === 'Public - Credit card at all times';
      return hasValidCoords && isPublic;
    })
    .map((station: any) => ({
      id: station.id || `ev-${Math.random().toString(36).substr(2, 9)}`,
      name: station.station_name || 'Unknown Station',
      address: station.street_address || '',
      city: station.city || 'Chicago',
      state: station.state || 'IL',
      zip: station.zip || '',
      latitude: parseFloat(station.latitude),
      longitude: parseFloat(station.longitude),
      phone: station.station_phone || null,
      accessDays: station.access_days_time || null,
      evNetwork: station.ev_network || null,
      evLevel2Count: station.ev_level2_evse_num ? parseInt(station.ev_level2_evse_num) : null,
      dcFastCount: station.ev_dc_fast_count ? parseInt(station.ev_dc_fast_count) : null,
      dateLastConfirmed: station.date_last_confirmed || null,
    }));
  
  console.log(`Processed ${stations.length} valid EV stations with coordinates`);
  return stations;
}

async function fetchBusinessLicenses(licenseDescriptions: string[], label: string): Promise<BusinessLocation[]> {
  console.log(`Fetching ${label} from Chicago Business Licenses...`);
  
  const allLocations: BusinessLocation[] = [];
  
  for (const licenseDesc of licenseDescriptions) {
    const encodedDesc = encodeURIComponent(licenseDesc);
    const url = `https://data.cityofchicago.org/resource/r5kz-chrr.json?license_description=${encodedDesc}&$limit=10000`;
    
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`Failed to fetch ${licenseDesc}: ${response.status} ${response.statusText}`);
      continue;
    }
    
    const data = await response.json();
    console.log(`  - ${licenseDesc}: ${data.length} records`);
    
    const locations: BusinessLocation[] = data
      .filter((license: any) => {
        const lat = parseFloat(license.latitude);
        const lon = parseFloat(license.longitude);
        return !isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0;
      })
      .map((license: any) => ({
        id: `${license.license_number || 'unk'}-${license.date_issued || Math.random().toString(36).substr(2, 6)}`,
        name: license.doing_business_as_name || license.legal_name || 'Unknown',
        address: license.address || '',
        city: license.city || 'Chicago',
        state: license.state || 'IL',
        zip: license.zip_code || '',
        latitude: parseFloat(license.latitude),
        longitude: parseFloat(license.longitude),
        licenseNumber: license.license_number || '',
        licenseDescription: license.license_description || licenseDesc,
        communityArea: license.community_area_name || null,
        neighborhood: license.neighborhood || null,
      }));
    
    allLocations.push(...locations);
  }
  
  // Deduplicate by coordinates
  const uniqueLocations = new Map<string, BusinessLocation>();
  for (const loc of allLocations) {
    const key = `${loc.latitude.toFixed(4)},${loc.longitude.toFixed(4)}`;
    if (!uniqueLocations.has(key)) {
      uniqueLocations.set(key, loc);
    }
  }
  
  const result = Array.from(uniqueLocations.values());
  console.log(`Processed ${result.length} unique ${label} with coordinates`);
  return result;
}

async function main() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    
    // Fetch and save EV stations
    const evStations = await fetchEvStations();
    const evOutput = {
      generatedAt: new Date().toISOString(),
      totalStations: evStations.length,
      stations: evStations,
    };
    fs.writeFileSync(EV_OUTPUT_FILE, JSON.stringify(evOutput, null, 2));
    console.log(`Successfully saved ${evStations.length} EV stations to ${EV_OUTPUT_FILE}`);
    
    const chicagoEvStations = evStations.filter(s => 
      s.city.toLowerCase() === 'chicago' || 
      (s.latitude >= 41.6 && s.latitude <= 42.1 && s.longitude >= -88.0 && s.longitude <= -87.5)
    );
    console.log(`${chicagoEvStations.length} EV stations are in the Chicago area`);
    
    // Fetch and save gas stations (Filling Station)
    const gasStations = await fetchBusinessLicenses(['Filling Station'], 'gas stations');
    const gasOutput = {
      generatedAt: new Date().toISOString(),
      totalLocations: gasStations.length,
      stations: gasStations,
    };
    fs.writeFileSync(GAS_OUTPUT_FILE, JSON.stringify(gasOutput, null, 2));
    console.log(`Successfully saved ${gasStations.length} gas stations to ${GAS_OUTPUT_FILE}`);
    
    // Fetch and save hotels
    const hotels = await fetchBusinessLicenses(['Hotel', 'Vacation Rental'], 'hotels');
    const hotelsOutput = {
      generatedAt: new Date().toISOString(),
      totalLocations: hotels.length,
      locations: hotels,
    };
    fs.writeFileSync(HOTELS_OUTPUT_FILE, JSON.stringify(hotelsOutput, null, 2));
    console.log(`Successfully saved ${hotels.length} hotels to ${HOTELS_OUTPUT_FILE}`);
    
    // Fetch and save restaurants
    const restaurants = await fetchBusinessLicenses(
      ['Retail Food Establishment', 'Limited Business License'],
      'restaurants'
    );
    const restaurantsOutput = {
      generatedAt: new Date().toISOString(),
      totalLocations: restaurants.length,
      locations: restaurants,
    };
    fs.writeFileSync(RESTAURANTS_OUTPUT_FILE, JSON.stringify(restaurantsOutput, null, 2));
    console.log(`Successfully saved ${restaurants.length} restaurants to ${RESTAURANTS_OUTPUT_FILE}`);
    
    // Fetch and save coffee shops (subset filtered by name patterns)
    // We'll filter from the restaurants data for coffee-related names
    const coffeeKeywords = ['coffee', 'cafe', 'café', 'starbucks', 'dunkin', 'espresso', 'brew', 'roast'];
    const coffeeShops = restaurants.filter(r => {
      const nameLower = r.name.toLowerCase();
      return coffeeKeywords.some(kw => nameLower.includes(kw));
    });
    const coffeeOutput = {
      generatedAt: new Date().toISOString(),
      totalLocations: coffeeShops.length,
      locations: coffeeShops,
    };
    fs.writeFileSync(COFFEE_SHOPS_OUTPUT_FILE, JSON.stringify(coffeeOutput, null, 2));
    console.log(`Successfully saved ${coffeeShops.length} coffee shops to ${COFFEE_SHOPS_OUTPUT_FILE}`);
    
    // Fetch and save bars/taverns
    const bars = await fetchBusinessLicenses(['Tavern'], 'bars/taverns');
    const barsOutput = {
      generatedAt: new Date().toISOString(),
      totalLocations: bars.length,
      locations: bars,
    };
    fs.writeFileSync(BARS_OUTPUT_FILE, JSON.stringify(barsOutput, null, 2));
    console.log(`Successfully saved ${bars.length} bars to ${BARS_OUTPUT_FILE}`);
    
    // Fetch and save liquor stores (Package Goods license)
    const liquorStores = await fetchBusinessLicenses(['Package Goods'], 'liquor stores');
    const liquorOutput = {
      generatedAt: new Date().toISOString(),
      totalLocations: liquorStores.length,
      locations: liquorStores,
    };
    fs.writeFileSync(LIQUOR_STORES_OUTPUT_FILE, JSON.stringify(liquorOutput, null, 2));
    console.log(`Successfully saved ${liquorStores.length} liquor stores to ${LIQUOR_STORES_OUTPUT_FILE}`);
    
    // Fetch and save day care centers
    const dayCares = await fetchBusinessLicenses([
      'Children\'s Services Facility License',
      'Day Care Center 2 - 6 Years',
      'Day Care Center Under 2 Years',
      'Day Care Center Under 2 and 2 - 6 Years'
    ], 'day care centers');
    const dayCareOutput = {
      generatedAt: new Date().toISOString(),
      totalLocations: dayCares.length,
      locations: dayCares,
    };
    fs.writeFileSync(DAY_CARE_OUTPUT_FILE, JSON.stringify(dayCareOutput, null, 2));
    console.log(`Successfully saved ${dayCares.length} day care centers to ${DAY_CARE_OUTPUT_FILE}`);
    
    // Fetch and save massage/spa establishments
    const massageSpas = await fetchBusinessLicenses(['Massage Establishment'], 'massage/spa establishments');
    const massageSpaOutput = {
      generatedAt: new Date().toISOString(),
      totalLocations: massageSpas.length,
      locations: massageSpas,
    };
    fs.writeFileSync(MASSAGE_SPA_OUTPUT_FILE, JSON.stringify(massageSpaOutput, null, 2));
    console.log(`Successfully saved ${massageSpas.length} massage/spa establishments to ${MASSAGE_SPA_OUTPUT_FILE}`);
    
    // Fetch and save auto repair shops
    const autoRepairs = await fetchBusinessLicenses([
      'Motor Vehicle Repair : Engine Only (Class II)',
      'Motor Vehicle Repair: Engine/Body(Class III)',
      'Motor Vehicle Repair; Specialty(Class I)'
    ], 'auto repair shops');
    const autoRepairOutput = {
      generatedAt: new Date().toISOString(),
      totalLocations: autoRepairs.length,
      locations: autoRepairs,
    };
    fs.writeFileSync(AUTO_REPAIR_OUTPUT_FILE, JSON.stringify(autoRepairOutput, null, 2));
    console.log(`Successfully saved ${autoRepairs.length} auto repair shops to ${AUTO_REPAIR_OUTPUT_FILE}`);
    
    // Fetch and save pet stores
    const petStores = await fetchBusinessLicenses(['Pet Shop'], 'pet stores');
    const petStoreOutput = {
      generatedAt: new Date().toISOString(),
      totalLocations: petStores.length,
      locations: petStores,
    };
    fs.writeFileSync(PET_STORES_OUTPUT_FILE, JSON.stringify(petStoreOutput, null, 2));
    console.log(`Successfully saved ${petStores.length} pet stores to ${PET_STORES_OUTPUT_FILE}`);
    
    // Fetch and save veterinary clinics
    const vetClinics = await fetchBusinessLicenses(['Veterinary Hospital'], 'veterinary clinics');
    const vetClinicOutput = {
      generatedAt: new Date().toISOString(),
      totalLocations: vetClinics.length,
      locations: vetClinics,
    };
    fs.writeFileSync(VET_CLINICS_OUTPUT_FILE, JSON.stringify(vetClinicOutput, null, 2));
    console.log(`Successfully saved ${vetClinics.length} veterinary clinics to ${VET_CLINICS_OUTPUT_FILE}`);
    
    // Fetch and save nightclubs (Late Hour + Music and Dance licenses)
    const nightclubs = await fetchBusinessLicenses(['Late Hour', 'Music and Dance'], 'nightclubs');
    const nightclubOutput = {
      generatedAt: new Date().toISOString(),
      totalLocations: nightclubs.length,
      locations: nightclubs,
    };
    fs.writeFileSync(NIGHTCLUBS_OUTPUT_FILE, JSON.stringify(nightclubOutput, null, 2));
    console.log(`Successfully saved ${nightclubs.length} nightclubs to ${NIGHTCLUBS_OUTPUT_FILE}`);
    
    // Fetch and save event venues
    const eventVenues = await fetchBusinessLicenses(['Public Place of Amusement'], 'event venues');
    const eventVenueOutput = {
      generatedAt: new Date().toISOString(),
      totalLocations: eventVenues.length,
      locations: eventVenues,
    };
    fs.writeFileSync(EVENT_VENUES_OUTPUT_FILE, JSON.stringify(eventVenueOutput, null, 2));
    console.log(`Successfully saved ${eventVenues.length} event venues to ${EVENT_VENUES_OUTPUT_FILE}`);
    
    // Fetch manufacturing establishments and filter for breweries/distilleries
    const manufacturing = await fetchBusinessLicenses(['Manufacturing Establishments'], 'manufacturing');
    const breweryKeywords = ['brew', 'distill', 'winery', 'wine', 'beer', 'spirits', 'mead', 'cider', 'vodka', 'whiskey', 'gin', 'rum'];
    const breweries = manufacturing.filter(m => {
      const nameLower = m.name.toLowerCase();
      return breweryKeywords.some(kw => nameLower.includes(kw));
    });
    const breweryOutput = {
      generatedAt: new Date().toISOString(),
      totalLocations: breweries.length,
      locations: breweries,
    };
    fs.writeFileSync(BREWERIES_OUTPUT_FILE, JSON.stringify(breweryOutput, null, 2));
    console.log(`Successfully saved ${breweries.length} breweries/distilleries to ${BREWERIES_OUTPUT_FILE}`);
    
    console.log('\n=== Summary ===');
    console.log(`EV Stations: ${evStations.length}`);
    console.log(`Gas Stations: ${gasStations.length}`);
    console.log(`Hotels: ${hotels.length}`);
    console.log(`Restaurants: ${restaurants.length}`);
    console.log(`Coffee Shops: ${coffeeShops.length}`);
    console.log(`Bars/Taverns: ${bars.length}`);
    console.log(`Liquor Stores: ${liquorStores.length}`);
    console.log(`Day Care Centers: ${dayCares.length}`);
    console.log(`Massage/Spa: ${massageSpas.length}`);
    console.log(`Auto Repair Shops: ${autoRepairs.length}`);
    console.log(`Pet Stores: ${petStores.length}`);
    console.log(`Veterinary Clinics: ${vetClinics.length}`);
    console.log(`Nightclubs: ${nightclubs.length}`);
    console.log(`Event Venues: ${eventVenues.length}`);
    console.log(`Breweries/Distilleries: ${breweries.length}`);
    
  } catch (error) {
    console.error('Error building business index:', error);
    process.exit(1);
  }
}

main();
