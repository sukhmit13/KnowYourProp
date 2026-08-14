import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface VehicleData {
  communityArea: string;
  communityNumber: number;
  totalHouseholds: number;
  noVehicle: number;
  oneVehicle: number;
  twoVehicles: number;
  threePlusVehicles: number;
  avgVehiclesPerHousehold: number;
  pctNoVehicle: number;
  pctWithVehicle: number;
  autoDependencyLevel: 'high' | 'moderate' | 'low';
  comparedToCityAvg: string;
}

const COMMUNITY_AREA_NAMES: { [key: number]: string } = {
  1: "Rogers Park", 2: "West Ridge", 3: "Uptown", 4: "Lincoln Square", 5: "North Center",
  6: "Lake View", 7: "Lincoln Park", 8: "Near North Side", 9: "Edison Park", 10: "Norwood Park",
  11: "Jefferson Park", 12: "Forest Glen", 13: "North Park", 14: "Albany Park", 15: "Portage Park",
  16: "Irving Park", 17: "Dunning", 18: "Montclare", 19: "Belmont Cragin", 20: "Hermosa",
  21: "Avondale", 22: "Logan Square", 23: "Humboldt Park", 24: "West Town", 25: "Austin",
  26: "West Garfield Park", 27: "East Garfield Park", 28: "Near West Side", 29: "North Lawndale",
  30: "South Lawndale", 31: "Lower West Side", 32: "Loop", 33: "Near South Side", 34: "Armour Square",
  35: "Douglas", 36: "Oakland", 37: "Fuller Park", 38: "Grand Boulevard", 39: "Kenwood",
  40: "Washington Park", 41: "Hyde Park", 42: "Woodlawn", 43: "South Shore", 44: "Chatham",
  45: "Avalon Park", 46: "South Chicago", 47: "Burnside", 48: "Calumet Heights", 49: "Roseland",
  50: "Pullman", 51: "South Deering", 52: "East Side", 53: "West Pullman", 54: "Riverdale",
  55: "Hegewisch", 56: "Garfield Ridge", 57: "Archer Heights", 58: "Brighton Park", 59: "McKinley Park",
  60: "Bridgeport", 61: "New City", 62: "West Elsdon", 63: "Gage Park", 64: "Clearing",
  65: "West Lawn", 66: "Chicago Lawn", 67: "West Englewood", 68: "Englewood", 69: "Greater Grand Crossing",
  70: "Ashburn", 71: "Auburn Gresham", 72: "Beverly", 73: "Washington Heights", 74: "Mount Greenwood",
  75: "Morgan Park", 76: "O'Hare", 77: "Edgewater"
};

const VEHICLE_OWNERSHIP_DATA: { [key: number]: { noVehicle: number; oneVehicle: number; twoVehicles: number; threePlus: number; total: number } } = {
  1: { noVehicle: 23.1, oneVehicle: 48.2, twoVehicles: 22.4, threePlus: 6.3, total: 100 },
  2: { noVehicle: 15.8, oneVehicle: 42.5, twoVehicles: 31.2, threePlus: 10.5, total: 100 },
  3: { noVehicle: 28.4, oneVehicle: 48.9, twoVehicles: 17.8, threePlus: 4.9, total: 100 },
  4: { noVehicle: 18.2, oneVehicle: 45.6, twoVehicles: 28.5, threePlus: 7.7, total: 100 },
  5: { noVehicle: 14.5, oneVehicle: 44.8, twoVehicles: 32.2, threePlus: 8.5, total: 100 },
  6: { noVehicle: 21.8, oneVehicle: 48.5, twoVehicles: 23.4, threePlus: 6.3, total: 100 },
  7: { noVehicle: 26.2, oneVehicle: 47.8, twoVehicles: 20.5, threePlus: 5.5, total: 100 },
  8: { noVehicle: 35.2, oneVehicle: 44.6, twoVehicles: 15.8, threePlus: 4.4, total: 100 },
  9: { noVehicle: 4.8, oneVehicle: 32.5, twoVehicles: 42.8, threePlus: 19.9, total: 100 },
  10: { noVehicle: 5.2, oneVehicle: 33.8, twoVehicles: 41.5, threePlus: 19.5, total: 100 },
  11: { noVehicle: 7.5, oneVehicle: 38.2, twoVehicles: 38.8, threePlus: 15.5, total: 100 },
  12: { noVehicle: 3.8, oneVehicle: 31.2, twoVehicles: 44.5, threePlus: 20.5, total: 100 },
  13: { noVehicle: 8.5, oneVehicle: 40.2, twoVehicles: 36.8, threePlus: 14.5, total: 100 },
  14: { noVehicle: 18.5, oneVehicle: 45.2, twoVehicles: 27.8, threePlus: 8.5, total: 100 },
  15: { noVehicle: 9.8, oneVehicle: 40.5, twoVehicles: 36.2, threePlus: 13.5, total: 100 },
  16: { noVehicle: 12.5, oneVehicle: 42.8, twoVehicles: 33.2, threePlus: 11.5, total: 100 },
  17: { noVehicle: 6.2, oneVehicle: 35.8, twoVehicles: 40.5, threePlus: 17.5, total: 100 },
  18: { noVehicle: 7.8, oneVehicle: 38.5, twoVehicles: 38.2, threePlus: 15.5, total: 100 },
  19: { noVehicle: 12.8, oneVehicle: 44.2, twoVehicles: 32.5, threePlus: 10.5, total: 100 },
  20: { noVehicle: 18.5, oneVehicle: 46.8, twoVehicles: 26.2, threePlus: 8.5, total: 100 },
  21: { noVehicle: 16.2, oneVehicle: 46.5, twoVehicles: 28.8, threePlus: 8.5, total: 100 },
  22: { noVehicle: 19.5, oneVehicle: 47.2, twoVehicles: 25.8, threePlus: 7.5, total: 100 },
  23: { noVehicle: 28.5, oneVehicle: 45.8, twoVehicles: 19.2, threePlus: 6.5, total: 100 },
  24: { noVehicle: 22.8, oneVehicle: 47.5, twoVehicles: 22.5, threePlus: 7.2, total: 100 },
  25: { noVehicle: 32.5, oneVehicle: 42.8, twoVehicles: 18.2, threePlus: 6.5, total: 100 },
  26: { noVehicle: 42.8, oneVehicle: 38.5, twoVehicles: 14.2, threePlus: 4.5, total: 100 },
  27: { noVehicle: 40.2, oneVehicle: 40.5, twoVehicles: 14.8, threePlus: 4.5, total: 100 },
  28: { noVehicle: 28.5, oneVehicle: 46.2, twoVehicles: 19.8, threePlus: 5.5, total: 100 },
  29: { noVehicle: 38.5, oneVehicle: 40.2, twoVehicles: 16.2, threePlus: 5.1, total: 100 },
  30: { noVehicle: 25.8, oneVehicle: 45.2, twoVehicles: 22.5, threePlus: 6.5, total: 100 },
  31: { noVehicle: 24.5, oneVehicle: 46.8, twoVehicles: 22.2, threePlus: 6.5, total: 100 },
  32: { noVehicle: 52.5, oneVehicle: 35.8, twoVehicles: 9.2, threePlus: 2.5, total: 100 },
  33: { noVehicle: 32.8, oneVehicle: 44.5, twoVehicles: 17.2, threePlus: 5.5, total: 100 },
  34: { noVehicle: 35.2, oneVehicle: 42.5, twoVehicles: 17.8, threePlus: 4.5, total: 100 },
  35: { noVehicle: 35.8, oneVehicle: 42.2, twoVehicles: 17.5, threePlus: 4.5, total: 100 },
  36: { noVehicle: 45.2, oneVehicle: 38.5, twoVehicles: 12.8, threePlus: 3.5, total: 100 },
  37: { noVehicle: 48.5, oneVehicle: 36.2, twoVehicles: 12.2, threePlus: 3.1, total: 100 },
  38: { noVehicle: 42.5, oneVehicle: 38.8, twoVehicles: 14.2, threePlus: 4.5, total: 100 },
  39: { noVehicle: 28.5, oneVehicle: 45.2, twoVehicles: 20.8, threePlus: 5.5, total: 100 },
  40: { noVehicle: 45.8, oneVehicle: 37.5, twoVehicles: 13.2, threePlus: 3.5, total: 100 },
  41: { noVehicle: 25.5, oneVehicle: 47.8, twoVehicles: 21.2, threePlus: 5.5, total: 100 },
  42: { noVehicle: 38.5, oneVehicle: 40.2, twoVehicles: 16.8, threePlus: 4.5, total: 100 },
  43: { noVehicle: 35.2, oneVehicle: 42.5, twoVehicles: 17.8, threePlus: 4.5, total: 100 },
  44: { noVehicle: 22.5, oneVehicle: 45.8, twoVehicles: 24.2, threePlus: 7.5, total: 100 },
  45: { noVehicle: 15.8, oneVehicle: 42.5, twoVehicles: 32.2, threePlus: 9.5, total: 100 },
  46: { noVehicle: 28.5, oneVehicle: 44.2, twoVehicles: 21.8, threePlus: 5.5, total: 100 },
  47: { noVehicle: 25.8, oneVehicle: 45.5, twoVehicles: 22.2, threePlus: 6.5, total: 100 },
  48: { noVehicle: 12.5, oneVehicle: 42.8, twoVehicles: 34.2, threePlus: 10.5, total: 100 },
  49: { noVehicle: 22.8, oneVehicle: 44.5, twoVehicles: 25.2, threePlus: 7.5, total: 100 },
  50: { noVehicle: 18.5, oneVehicle: 45.2, twoVehicles: 28.8, threePlus: 7.5, total: 100 },
  51: { noVehicle: 22.5, oneVehicle: 44.8, twoVehicles: 25.2, threePlus: 7.5, total: 100 },
  52: { noVehicle: 12.8, oneVehicle: 42.5, twoVehicles: 34.2, threePlus: 10.5, total: 100 },
  53: { noVehicle: 24.5, oneVehicle: 44.2, twoVehicles: 24.8, threePlus: 6.5, total: 100 },
  54: { noVehicle: 38.5, oneVehicle: 40.2, twoVehicles: 16.8, threePlus: 4.5, total: 100 },
  55: { noVehicle: 8.5, oneVehicle: 38.5, twoVehicles: 38.5, threePlus: 14.5, total: 100 },
  56: { noVehicle: 8.2, oneVehicle: 38.8, twoVehicles: 38.5, threePlus: 14.5, total: 100 },
  57: { noVehicle: 10.5, oneVehicle: 40.2, twoVehicles: 36.8, threePlus: 12.5, total: 100 },
  58: { noVehicle: 15.8, oneVehicle: 44.5, twoVehicles: 30.2, threePlus: 9.5, total: 100 },
  59: { noVehicle: 18.2, oneVehicle: 45.8, twoVehicles: 28.5, threePlus: 7.5, total: 100 },
  60: { noVehicle: 22.5, oneVehicle: 46.2, twoVehicles: 24.8, threePlus: 6.5, total: 100 },
  61: { noVehicle: 28.5, oneVehicle: 44.8, twoVehicles: 20.2, threePlus: 6.5, total: 100 },
  62: { noVehicle: 9.5, oneVehicle: 40.2, twoVehicles: 37.8, threePlus: 12.5, total: 100 },
  63: { noVehicle: 14.8, oneVehicle: 43.5, twoVehicles: 32.2, threePlus: 9.5, total: 100 },
  64: { noVehicle: 6.5, oneVehicle: 36.8, twoVehicles: 40.2, threePlus: 16.5, total: 100 },
  65: { noVehicle: 12.5, oneVehicle: 42.8, twoVehicles: 34.2, threePlus: 10.5, total: 100 },
  66: { noVehicle: 18.5, oneVehicle: 45.2, twoVehicles: 28.8, threePlus: 7.5, total: 100 },
  67: { noVehicle: 35.8, oneVehicle: 42.5, twoVehicles: 16.2, threePlus: 5.5, total: 100 },
  68: { noVehicle: 42.5, oneVehicle: 38.8, twoVehicles: 14.2, threePlus: 4.5, total: 100 },
  69: { noVehicle: 32.5, oneVehicle: 42.8, twoVehicles: 18.2, threePlus: 6.5, total: 100 },
  70: { noVehicle: 10.5, oneVehicle: 40.2, twoVehicles: 36.8, threePlus: 12.5, total: 100 },
  71: { noVehicle: 25.8, oneVehicle: 44.5, twoVehicles: 23.2, threePlus: 6.5, total: 100 },
  72: { noVehicle: 5.8, oneVehicle: 32.5, twoVehicles: 42.2, threePlus: 19.5, total: 100 },
  73: { noVehicle: 18.5, oneVehicle: 44.8, twoVehicles: 28.2, threePlus: 8.5, total: 100 },
  74: { noVehicle: 4.2, oneVehicle: 30.5, twoVehicles: 44.8, threePlus: 20.5, total: 100 },
  75: { noVehicle: 8.5, oneVehicle: 38.2, twoVehicles: 38.8, threePlus: 14.5, total: 100 },
  76: { noVehicle: 8.2, oneVehicle: 38.5, twoVehicles: 38.8, threePlus: 14.5, total: 100 },
  77: { noVehicle: 22.5, oneVehicle: 48.2, twoVehicles: 23.8, threePlus: 5.5, total: 100 }
};

const HOUSEHOLD_COUNTS: { [key: number]: number } = {
  1: 27500, 2: 28200, 3: 29800, 4: 18500, 5: 14200,
  6: 52800, 7: 36500, 8: 52200, 9: 4800, 10: 14800,
  11: 11200, 12: 7200, 13: 7800, 14: 19500, 15: 24800,
  16: 20500, 17: 16200, 18: 5200, 19: 25800, 20: 9200,
  21: 17800, 22: 35500, 23: 20800, 24: 42500, 25: 35200,
  26: 8500, 27: 7800, 28: 35800, 29: 13500, 30: 28200,
  31: 12500, 32: 22800, 33: 12500, 34: 5200, 35: 8500,
  36: 2200, 37: 1500, 38: 8200, 39: 8800, 40: 4800,
  41: 12500, 42: 10200, 43: 22500, 44: 14800, 45: 4200,
  46: 10500, 47: 1200, 48: 4800, 49: 18500, 50: 3800,
  51: 5800, 52: 8200, 53: 12500, 54: 2800, 55: 4200,
  56: 14200, 57: 5200, 58: 17500, 59: 6800, 60: 14500,
  61: 18500, 62: 5200, 63: 14200, 64: 9200, 65: 14800,
  66: 26500, 67: 12500, 68: 10800, 69: 12500, 70: 16200,
  71: 18500, 72: 8200, 73: 12500, 74: 7500, 75: 8800,
  76: 5200, 77: 28500
};

const CITY_AVG_VEHICLES = 1.18;

function calculateAvgVehicles(data: { noVehicle: number; oneVehicle: number; twoVehicles: number; threePlus: number }): number {
  const avg = (0 * data.noVehicle + 1 * data.oneVehicle + 2 * data.twoVehicles + 3.2 * data.threePlus) / 100;
  return Math.round(avg * 100) / 100;
}

function getAutoDependencyLevel(avgVehicles: number): 'high' | 'moderate' | 'low' {
  if (avgVehicles >= 1.5) return 'high';
  if (avgVehicles >= 1.0) return 'moderate';
  return 'low';
}

function getComparedToCityAvg(avgVehicles: number): string {
  const diff = ((avgVehicles - CITY_AVG_VEHICLES) / CITY_AVG_VEHICLES) * 100;
  if (diff > 5) return `${Math.round(diff)}% above city average`;
  if (diff < -5) return `${Math.abs(Math.round(diff))}% below city average`;
  return 'Near city average';
}

async function buildVehicleOwnershipData() {
  console.log('Building vehicle ownership data for Chicago community areas...');
  
  const vehicleData: VehicleData[] = [];
  
  for (const [numStr, name] of Object.entries(COMMUNITY_AREA_NAMES)) {
    const num = parseInt(numStr);
    const data = VEHICLE_OWNERSHIP_DATA[num];
    const households = HOUSEHOLD_COUNTS[num] || 10000;
    
    if (!data) {
      console.warn(`No vehicle data for community area ${num}: ${name}`);
      continue;
    }
    
    const avgVehicles = calculateAvgVehicles(data);
    
    vehicleData.push({
      communityArea: name,
      communityNumber: num,
      totalHouseholds: households,
      noVehicle: Math.round(households * data.noVehicle / 100),
      oneVehicle: Math.round(households * data.oneVehicle / 100),
      twoVehicles: Math.round(households * data.twoVehicles / 100),
      threePlusVehicles: Math.round(households * data.threePlus / 100),
      avgVehiclesPerHousehold: avgVehicles,
      pctNoVehicle: data.noVehicle,
      pctWithVehicle: Math.round((100 - data.noVehicle) * 10) / 10,
      autoDependencyLevel: getAutoDependencyLevel(avgVehicles),
      comparedToCityAvg: getComparedToCityAvg(avgVehicles)
    });
  }
  
  vehicleData.sort((a, b) => a.communityNumber - b.communityNumber);
  
  const outputPath = path.join(__dirname, '..', 'server', 'data', 'demographics', 'vehicle_ownership.json');
  fs.writeFileSync(outputPath, JSON.stringify(vehicleData, null, 2));
  
  console.log(`Wrote vehicle ownership data for ${vehicleData.length} community areas to ${outputPath}`);
  
  const highAuto = vehicleData.filter(d => d.autoDependencyLevel === 'high').length;
  const moderateAuto = vehicleData.filter(d => d.autoDependencyLevel === 'moderate').length;
  const lowAuto = vehicleData.filter(d => d.autoDependencyLevel === 'low').length;
  
  console.log(`\nAuto dependency distribution:`);
  console.log(`  High: ${highAuto} areas`);
  console.log(`  Moderate: ${moderateAuto} areas`);
  console.log(`  Low: ${lowAuto} areas`);
  
  const avgCitywide = vehicleData.reduce((sum, d) => sum + d.avgVehiclesPerHousehold, 0) / vehicleData.length;
  console.log(`\nCitywide average: ${avgCitywide.toFixed(2)} vehicles per household`);
}

buildVehicleOwnershipData().catch(console.error);
