import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface SeniorsData {
  communityArea: string;
  communityNumber: number;
  totalPopulation: number;
  population65Plus: number;
  pct65Plus: number;
  age65to74: number;
  age75to84: number;
  age85Plus: number;
  seniorsLivingAlone: number;
  pctSeniorsLivingAlone: number;
  seniorDemandLevel: 'high' | 'moderate' | 'low';
  comparedToCityAvg: string;
  citywideRank: number;
  rankDescription: string;
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

const SENIORS_DATA_RAW: { [key: number]: { 
  totalPop: number; 
  pct65Plus: number; 
  pctLivingAlone: number;
  age65to74Pct: number;
  age75to84Pct: number;
  age85PlusPct: number;
} } = {
  1: { totalPop: 54991, pct65Plus: 11.8, pctLivingAlone: 38.2, age65to74Pct: 52, age75to84Pct: 32, age85PlusPct: 16 },
  2: { totalPop: 71942, pct65Plus: 14.2, pctLivingAlone: 28.5, age65to74Pct: 48, age75to84Pct: 35, age85PlusPct: 17 },
  3: { totalPop: 56362, pct65Plus: 15.8, pctLivingAlone: 42.5, age65to74Pct: 50, age75to84Pct: 33, age85PlusPct: 17 },
  4: { totalPop: 39493, pct65Plus: 13.5, pctLivingAlone: 35.8, age65to74Pct: 51, age75to84Pct: 33, age85PlusPct: 16 },
  5: { totalPop: 31867, pct65Plus: 10.8, pctLivingAlone: 28.2, age65to74Pct: 54, age75to84Pct: 31, age85PlusPct: 15 },
  6: { totalPop: 94368, pct65Plus: 9.5, pctLivingAlone: 35.5, age65to74Pct: 55, age75to84Pct: 30, age85PlusPct: 15 },
  7: { totalPop: 69146, pct65Plus: 12.3, pctLivingAlone: 32.9, age65to74Pct: 53, age75to84Pct: 33, age85PlusPct: 14 },
  8: { totalPop: 80484, pct65Plus: 14.5, pctLivingAlone: 45.2, age65to74Pct: 48, age75to84Pct: 34, age85PlusPct: 18 },
  9: { totalPop: 11525, pct65Plus: 18.5, pctLivingAlone: 22.5, age65to74Pct: 45, age75to84Pct: 35, age85PlusPct: 20 },
  10: { totalPop: 37023, pct65Plus: 19.8, pctLivingAlone: 24.8, age65to74Pct: 44, age75to84Pct: 36, age85PlusPct: 20 },
  11: { totalPop: 26276, pct65Plus: 16.2, pctLivingAlone: 26.5, age65to74Pct: 46, age75to84Pct: 35, age85PlusPct: 19 },
  12: { totalPop: 18508, pct65Plus: 17.8, pctLivingAlone: 21.2, age65to74Pct: 45, age75to84Pct: 36, age85PlusPct: 19 },
  13: { totalPop: 18508, pct65Plus: 15.5, pctLivingAlone: 28.8, age65to74Pct: 47, age75to84Pct: 35, age85PlusPct: 18 },
  14: { totalPop: 51542, pct65Plus: 11.2, pctLivingAlone: 32.5, age65to74Pct: 52, age75to84Pct: 32, age85PlusPct: 16 },
  15: { totalPop: 65340, pct65Plus: 14.8, pctLivingAlone: 27.5, age65to74Pct: 48, age75to84Pct: 34, age85PlusPct: 18 },
  16: { totalPop: 53359, pct65Plus: 12.5, pctLivingAlone: 29.8, age65to74Pct: 50, age75to84Pct: 33, age85PlusPct: 17 },
  17: { totalPop: 42164, pct65Plus: 16.5, pctLivingAlone: 25.5, age65to74Pct: 46, age75to84Pct: 35, age85PlusPct: 19 },
  18: { totalPop: 13792, pct65Plus: 15.2, pctLivingAlone: 26.8, age65to74Pct: 47, age75to84Pct: 35, age85PlusPct: 18 },
  19: { totalPop: 78117, pct65Plus: 10.5, pctLivingAlone: 28.2, age65to74Pct: 52, age75to84Pct: 32, age85PlusPct: 16 },
  20: { totalPop: 24062, pct65Plus: 9.8, pctLivingAlone: 30.5, age65to74Pct: 54, age75to84Pct: 31, age85PlusPct: 15 },
  21: { totalPop: 40051, pct65Plus: 8.5, pctLivingAlone: 32.8, age65to74Pct: 55, age75to84Pct: 30, age85PlusPct: 15 },
  22: { totalPop: 72352, pct65Plus: 9.2, pctLivingAlone: 34.5, age65to74Pct: 54, age75to84Pct: 31, age85PlusPct: 15 },
  23: { totalPop: 54165, pct65Plus: 11.5, pctLivingAlone: 35.8, age65to74Pct: 52, age75to84Pct: 32, age85PlusPct: 16 },
  24: { totalPop: 77017, pct65Plus: 8.8, pctLivingAlone: 36.2, age65to74Pct: 55, age75to84Pct: 30, age85PlusPct: 15 },
  25: { totalPop: 97104, pct65Plus: 14.5, pctLivingAlone: 38.5, age65to74Pct: 48, age75to84Pct: 34, age85PlusPct: 18 },
  26: { totalPop: 17433, pct65Plus: 12.8, pctLivingAlone: 42.5, age65to74Pct: 50, age75to84Pct: 33, age85PlusPct: 17 },
  27: { totalPop: 20116, pct65Plus: 13.5, pctLivingAlone: 40.8, age65to74Pct: 49, age75to84Pct: 34, age85PlusPct: 17 },
  28: { totalPop: 67881, pct65Plus: 10.2, pctLivingAlone: 38.5, age65to74Pct: 52, age75to84Pct: 32, age85PlusPct: 16 },
  29: { totalPop: 34794, pct65Plus: 12.5, pctLivingAlone: 42.2, age65to74Pct: 50, age75to84Pct: 33, age85PlusPct: 17 },
  30: { totalPop: 73595, pct65Plus: 8.5, pctLivingAlone: 28.5, age65to74Pct: 55, age75to84Pct: 30, age85PlusPct: 15 },
  31: { totalPop: 35769, pct65Plus: 10.8, pctLivingAlone: 32.5, age65to74Pct: 52, age75to84Pct: 32, age85PlusPct: 16 },
  32: { totalPop: 42298, pct65Plus: 11.5, pctLivingAlone: 48.5, age65to74Pct: 50, age75to84Pct: 33, age85PlusPct: 17 },
  33: { totalPop: 28795, pct65Plus: 8.5, pctLivingAlone: 42.8, age65to74Pct: 54, age75to84Pct: 31, age85PlusPct: 15 },
  34: { totalPop: 13569, pct65Plus: 12.2, pctLivingAlone: 35.5, age65to74Pct: 50, age75to84Pct: 33, age85PlusPct: 17 },
  35: { totalPop: 18238, pct65Plus: 13.8, pctLivingAlone: 40.2, age65to74Pct: 49, age75to84Pct: 34, age85PlusPct: 17 },
  36: { totalPop: 5918, pct65Plus: 14.5, pctLivingAlone: 45.8, age65to74Pct: 48, age75to84Pct: 34, age85PlusPct: 18 },
  37: { totalPop: 2567, pct65Plus: 15.2, pctLivingAlone: 48.2, age65to74Pct: 47, age75to84Pct: 35, age85PlusPct: 18 },
  38: { totalPop: 21929, pct65Plus: 15.5, pctLivingAlone: 44.5, age65to74Pct: 47, age75to84Pct: 35, age85PlusPct: 18 },
  39: { totalPop: 17841, pct65Plus: 16.8, pctLivingAlone: 38.2, age65to74Pct: 46, age75to84Pct: 35, age85PlusPct: 19 },
  40: { totalPop: 11717, pct65Plus: 14.2, pctLivingAlone: 46.5, age65to74Pct: 48, age75to84Pct: 34, age85PlusPct: 18 },
  41: { totalPop: 29456, pct65Plus: 14.8, pctLivingAlone: 35.5, age65to74Pct: 48, age75to84Pct: 34, age85PlusPct: 18 },
  42: { totalPop: 27086, pct65Plus: 13.5, pctLivingAlone: 42.8, age65to74Pct: 49, age75to84Pct: 34, age85PlusPct: 17 },
  43: { totalPop: 53971, pct65Plus: 15.8, pctLivingAlone: 40.5, age65to74Pct: 47, age75to84Pct: 35, age85PlusPct: 18 },
  44: { totalPop: 31710, pct65Plus: 18.5, pctLivingAlone: 35.2, age65to74Pct: 45, age75to84Pct: 36, age85PlusPct: 19 },
  45: { totalPop: 9478, pct65Plus: 17.2, pctLivingAlone: 28.5, age65to74Pct: 46, age75to84Pct: 36, age85PlusPct: 18 },
  46: { totalPop: 28062, pct65Plus: 13.8, pctLivingAlone: 38.2, age65to74Pct: 49, age75to84Pct: 34, age85PlusPct: 17 },
  47: { totalPop: 2527, pct65Plus: 16.5, pctLivingAlone: 35.8, age65to74Pct: 46, age75to84Pct: 36, age85PlusPct: 18 },
  48: { totalPop: 13088, pct65Plus: 19.5, pctLivingAlone: 30.2, age65to74Pct: 44, age75to84Pct: 36, age85PlusPct: 20 },
  49: { totalPop: 43346, pct65Plus: 16.8, pctLivingAlone: 36.5, age65to74Pct: 46, age75to84Pct: 35, age85PlusPct: 19 },
  50: { totalPop: 7298, pct65Plus: 17.2, pctLivingAlone: 32.8, age65to74Pct: 46, age75to84Pct: 36, age85PlusPct: 18 },
  51: { totalPop: 15109, pct65Plus: 14.5, pctLivingAlone: 35.5, age65to74Pct: 48, age75to84Pct: 34, age85PlusPct: 18 },
  52: { totalPop: 23042, pct65Plus: 12.8, pctLivingAlone: 28.5, age65to74Pct: 50, age75to84Pct: 33, age85PlusPct: 17 },
  53: { totalPop: 29651, pct65Plus: 15.5, pctLivingAlone: 38.2, age65to74Pct: 47, age75to84Pct: 35, age85PlusPct: 18 },
  54: { totalPop: 6482, pct65Plus: 11.8, pctLivingAlone: 45.5, age65to74Pct: 51, age75to84Pct: 33, age85PlusPct: 16 },
  55: { totalPop: 10027, pct65Plus: 14.5, pctLivingAlone: 25.8, age65to74Pct: 48, age75to84Pct: 34, age85PlusPct: 18 },
  56: { totalPop: 35854, pct65Plus: 16.2, pctLivingAlone: 24.5, age65to74Pct: 46, age75to84Pct: 36, age85PlusPct: 18 },
  57: { totalPop: 14196, pct65Plus: 14.8, pctLivingAlone: 26.8, age65to74Pct: 48, age75to84Pct: 35, age85PlusPct: 17 },
  58: { totalPop: 45053, pct65Plus: 10.5, pctLivingAlone: 28.2, age65to74Pct: 52, age75to84Pct: 32, age85PlusPct: 16 },
  59: { totalPop: 15923, pct65Plus: 11.8, pctLivingAlone: 30.5, age65to74Pct: 51, age75to84Pct: 33, age85PlusPct: 16 },
  60: { totalPop: 33702, pct65Plus: 12.5, pctLivingAlone: 32.8, age65to74Pct: 50, age75to84Pct: 33, age85PlusPct: 17 },
  61: { totalPop: 43628, pct65Plus: 11.2, pctLivingAlone: 35.5, age65to74Pct: 52, age75to84Pct: 32, age85PlusPct: 16 },
  62: { totalPop: 13952, pct65Plus: 15.5, pctLivingAlone: 24.2, age65to74Pct: 47, age75to84Pct: 35, age85PlusPct: 18 },
  63: { totalPop: 39894, pct65Plus: 11.8, pctLivingAlone: 26.5, age65to74Pct: 51, age75to84Pct: 33, age85PlusPct: 16 },
  64: { totalPop: 24861, pct65Plus: 17.5, pctLivingAlone: 23.8, age65to74Pct: 45, age75to84Pct: 36, age85PlusPct: 19 },
  65: { totalPop: 33236, pct65Plus: 13.2, pctLivingAlone: 27.5, age65to74Pct: 49, age75to84Pct: 34, age85PlusPct: 17 },
  66: { totalPop: 55196, pct65Plus: 12.8, pctLivingAlone: 32.5, age65to74Pct: 50, age75to84Pct: 33, age85PlusPct: 17 },
  67: { totalPop: 29252, pct65Plus: 14.5, pctLivingAlone: 42.8, age65to74Pct: 48, age75to84Pct: 34, age85PlusPct: 18 },
  68: { totalPop: 24369, pct65Plus: 15.2, pctLivingAlone: 45.5, age65to74Pct: 47, age75to84Pct: 35, age85PlusPct: 18 },
  69: { totalPop: 31471, pct65Plus: 16.8, pctLivingAlone: 40.2, age65to74Pct: 46, age75to84Pct: 35, age85PlusPct: 19 },
  70: { totalPop: 41498, pct65Plus: 15.5, pctLivingAlone: 25.8, age65to74Pct: 47, age75to84Pct: 35, age85PlusPct: 18 },
  71: { totalPop: 45196, pct65Plus: 17.2, pctLivingAlone: 38.5, age65to74Pct: 46, age75to84Pct: 35, age85PlusPct: 19 },
  72: { totalPop: 21992, pct65Plus: 18.8, pctLivingAlone: 22.5, age65to74Pct: 44, age75to84Pct: 36, age85PlusPct: 20 },
  73: { totalPop: 27629, pct65Plus: 17.5, pctLivingAlone: 32.8, age65to74Pct: 45, age75to84Pct: 36, age85PlusPct: 19 },
  74: { totalPop: 19093, pct65Plus: 19.2, pctLivingAlone: 20.5, age65to74Pct: 44, age75to84Pct: 36, age85PlusPct: 20 },
  75: { totalPop: 22544, pct65Plus: 17.8, pctLivingAlone: 28.5, age65to74Pct: 45, age75to84Pct: 36, age85PlusPct: 19 },
  76: { totalPop: 12756, pct65Plus: 12.5, pctLivingAlone: 28.2, age65to74Pct: 50, age75to84Pct: 33, age85PlusPct: 17 },
  77: { totalPop: 56521, pct65Plus: 14.5, pctLivingAlone: 40.8, age65to74Pct: 48, age75to84Pct: 34, age85PlusPct: 18 }
};

const CITY_AVG_SENIORS_LIVING_ALONE = 33.5;

function getSeniorDemandLevel(pctLivingAlone: number): 'high' | 'moderate' | 'low' {
  if (pctLivingAlone >= 38) return 'high';
  if (pctLivingAlone >= 28) return 'moderate';
  return 'low';
}

function getComparedToCityAvg(pctLivingAlone: number): string {
  const diff = ((pctLivingAlone - CITY_AVG_SENIORS_LIVING_ALONE) / CITY_AVG_SENIORS_LIVING_ALONE) * 100;
  if (diff > 5) return `${Math.round(diff)}% above city average`;
  if (diff < -5) return `${Math.abs(Math.round(diff))}% below city average`;
  return 'Near city average';
}

function getRankDescription(rank: number): string {
  if (rank <= 10) return `Top 10 in Chicago (#${rank} of 77)`;
  if (rank <= 20) return `Top 20 in Chicago (#${rank} of 77)`;
  if (rank <= 38) return `Upper half in Chicago (#${rank} of 77)`;
  if (rank <= 58) return `Middle tier in Chicago (#${rank} of 77)`;
  return `Lower tier in Chicago (#${rank} of 77)`;
}

async function buildSeniorsData() {
  console.log('Building seniors living alone data for Chicago community areas...');
  
  // First pass: collect all data
  const tempData: Array<{
    communityArea: string;
    communityNumber: number;
    totalPopulation: number;
    population65Plus: number;
    pct65Plus: number;
    age65to74: number;
    age75to84: number;
    age85Plus: number;
    seniorsLivingAlone: number;
    pctSeniorsLivingAlone: number;
    seniorDemandLevel: 'high' | 'moderate' | 'low';
    comparedToCityAvg: string;
  }> = [];
  
  for (const [numStr, name] of Object.entries(COMMUNITY_AREA_NAMES)) {
    const num = parseInt(numStr);
    const data = SENIORS_DATA_RAW[num];
    
    if (!data) {
      console.warn(`No seniors data for community area ${num}: ${name}`);
      continue;
    }
    
    const population65Plus = Math.round(data.totalPop * data.pct65Plus / 100);
    const seniorsLivingAlone = Math.round(population65Plus * data.pctLivingAlone / 100);
    const age65to74 = Math.round(population65Plus * data.age65to74Pct / 100);
    const age75to84 = Math.round(population65Plus * data.age75to84Pct / 100);
    const age85Plus = Math.round(population65Plus * data.age85PlusPct / 100);
    
    tempData.push({
      communityArea: name,
      communityNumber: num,
      totalPopulation: data.totalPop,
      population65Plus,
      pct65Plus: data.pct65Plus,
      age65to74,
      age75to84,
      age85Plus,
      seniorsLivingAlone,
      pctSeniorsLivingAlone: data.pctLivingAlone,
      seniorDemandLevel: getSeniorDemandLevel(data.pctLivingAlone),
      comparedToCityAvg: getComparedToCityAvg(data.pctLivingAlone)
    });
  }
  
  // Sort by pctSeniorsLivingAlone descending to calculate ranks (higher = rank 1)
  const sortedByDemand = [...tempData].sort((a, b) => b.pctSeniorsLivingAlone - a.pctSeniorsLivingAlone);
  
  // Create rank map
  const rankMap = new Map<number, number>();
  sortedByDemand.forEach((d, idx) => {
    rankMap.set(d.communityNumber, idx + 1);
  });
  
  // Add ranks to data
  const seniorsData: SeniorsData[] = tempData.map(d => ({
    ...d,
    citywideRank: rankMap.get(d.communityNumber) || 0,
    rankDescription: getRankDescription(rankMap.get(d.communityNumber) || 0)
  }));
  
  // Sort by community number for output
  seniorsData.sort((a, b) => a.communityNumber - b.communityNumber);
  
  const outputPath = path.join(__dirname, '..', 'server', 'data', 'demographics', 'seniors_living_alone.json');
  fs.writeFileSync(outputPath, JSON.stringify(seniorsData, null, 2));
  
  console.log(`Wrote seniors data for ${seniorsData.length} community areas to ${outputPath}`);
  
  const highDemand = seniorsData.filter(d => d.seniorDemandLevel === 'high').length;
  const moderateDemand = seniorsData.filter(d => d.seniorDemandLevel === 'moderate').length;
  const lowDemand = seniorsData.filter(d => d.seniorDemandLevel === 'low').length;
  
  console.log(`\nSenior care demand distribution:`);
  console.log(`  High: ${highDemand} areas`);
  console.log(`  Moderate: ${moderateDemand} areas`);
  console.log(`  Low: ${lowDemand} areas`);
  
  // Show top 10 areas
  console.log(`\nTop 10 areas for senior care demand:`);
  sortedByDemand.slice(0, 10).forEach((d, idx) => {
    console.log(`  ${idx + 1}. ${d.communityArea} - ${d.pctSeniorsLivingAlone}% living alone`);
  });
  
  const totalSeniorsAlone = seniorsData.reduce((sum, d) => sum + d.seniorsLivingAlone, 0);
  const totalSeniors = seniorsData.reduce((sum, d) => sum + d.population65Plus, 0);
  console.log(`\nCitywide: ${totalSeniorsAlone.toLocaleString()} seniors living alone out of ${totalSeniors.toLocaleString()} total (${((totalSeniorsAlone/totalSeniors)*100).toFixed(1)}%)`);
}

buildSeniorsData().catch(console.error);
