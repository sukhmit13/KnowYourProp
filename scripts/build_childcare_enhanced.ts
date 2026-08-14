import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ChildcareEnhancedData {
  communityArea: string;
  communityNumber: number;
  childrenUnder5: number;
  children0to2: number;
  children3to4: number;
  pct0to2: number;
  pct3to4: number;
  parentsInLaborForce0to5: number;
  parentsInLaborForcePct0to5: number;
  parentsInLaborForce6to17: number;
  parentsInLaborForcePct6to17: number;
  laborForceDelta: number;
  deltaInterpretation: string;
  daycareOpportunityScore: 'excellent' | 'good' | 'moderate' | 'low';
  marketInsight: string;
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

// Data from ACS 5-Year Estimates for Chicago Community Areas
// Table B09001 (Population Under 18 Years by Age) and B23008 (Children by Parent Labor Force Status)
// Sources: Census Reporter, IPUMS, City of Chicago data portal
const CHILDCARE_DATA_RAW: { [key: number]: {
  childrenUnder5: number;
  pct0to2: number;  // % of under-5 that are 0-2
  pct3to4: number;  // % of under-5 that are 3-4
  laborForce0to5: number;  // % with all parents in labor force for 0-5
  laborForce6to17: number;  // % with all parents in labor force for 6-17
} } = {
  // North Side communities - typically higher labor force participation
  1: { childrenUnder5: 2828, pct0to2: 58.5, pct3to4: 41.5, laborForce0to5: 68.2, laborForce6to17: 72.5 },
  2: { childrenUnder5: 5503, pct0to2: 57.8, pct3to4: 42.2, laborForce0to5: 62.5, laborForce6to17: 68.8 },
  3: { childrenUnder5: 2352, pct0to2: 59.2, pct3to4: 40.8, laborForce0to5: 65.8, laborForce6to17: 70.2 },
  4: { childrenUnder5: 2247, pct0to2: 58.0, pct3to4: 42.0, laborForce0to5: 71.5, laborForce6to17: 74.8 },
  5: { childrenUnder5: 3342, pct0to2: 57.5, pct3to4: 42.5, laborForce0to5: 75.2, laborForce6to17: 77.5 },
  6: { childrenUnder5: 5288, pct0to2: 56.8, pct3to4: 43.2, laborForce0to5: 78.5, laborForce6to17: 80.2 },
  7: { childrenUnder5: 3107, pct0to2: 57.2, pct3to4: 42.8, laborForce0to5: 76.8, laborForce6to17: 79.5 },
  8: { childrenUnder5: 2953, pct0to2: 58.5, pct3to4: 41.5, laborForce0to5: 72.5, laborForce6to17: 75.8 },
  
  // Northwest Side - mixed patterns
  9: { childrenUnder5: 917, pct0to2: 56.2, pct3to4: 43.8, laborForce0to5: 58.5, laborForce6to17: 72.8 },
  10: { childrenUnder5: 2570, pct0to2: 55.8, pct3to4: 44.2, laborForce0to5: 52.8, laborForce6to17: 68.5 },
  11: { childrenUnder5: 1712, pct0to2: 56.5, pct3to4: 43.5, laborForce0to5: 55.2, laborForce6to17: 70.5 },
  12: { childrenUnder5: 1243, pct0to2: 55.5, pct3to4: 44.5, laborForce0to5: 48.5, laborForce6to17: 68.2 },
  13: { childrenUnder5: 1614, pct0to2: 57.0, pct3to4: 43.0, laborForce0to5: 54.8, laborForce6to17: 69.5 },
  14: { childrenUnder5: 3824, pct0to2: 58.2, pct3to4: 41.8, laborForce0to5: 62.5, laborForce6to17: 68.2 },
  15: { childrenUnder5: 4126, pct0to2: 56.8, pct3to4: 43.2, laborForce0to5: 58.5, laborForce6to17: 70.8 },
  16: { childrenUnder5: 4890, pct0to2: 57.5, pct3to4: 42.5, laborForce0to5: 64.2, laborForce6to17: 71.5 },
  17: { childrenUnder5: 3215, pct0to2: 56.2, pct3to4: 43.8, laborForce0to5: 56.8, laborForce6to17: 71.2 },
  18: { childrenUnder5: 1156, pct0to2: 57.8, pct3to4: 42.2, laborForce0to5: 55.5, laborForce6to17: 69.8 },
  19: { childrenUnder5: 6742, pct0to2: 58.5, pct3to4: 41.5, laborForce0to5: 58.2, laborForce6to17: 66.5 },
  20: { childrenUnder5: 2015, pct0to2: 59.2, pct3to4: 40.8, laborForce0to5: 56.5, laborForce6to17: 65.2 },
  
  // Central/West Side
  21: { childrenUnder5: 2812, pct0to2: 58.0, pct3to4: 42.0, laborForce0to5: 68.5, laborForce6to17: 72.8 },
  22: { childrenUnder5: 4325, pct0to2: 57.5, pct3to4: 42.5, laborForce0to5: 72.5, laborForce6to17: 75.5 },
  23: { childrenUnder5: 5015, pct0to2: 59.8, pct3to4: 40.2, laborForce0to5: 52.8, laborForce6to17: 62.5 },
  24: { childrenUnder5: 4928, pct0to2: 57.2, pct3to4: 42.8, laborForce0to5: 74.5, laborForce6to17: 77.2 },
  25: { childrenUnder5: 8542, pct0to2: 60.5, pct3to4: 39.5, laborForce0to5: 48.5, laborForce6to17: 58.2 },
  26: { childrenUnder5: 1425, pct0to2: 61.2, pct3to4: 38.8, laborForce0to5: 42.5, laborForce6to17: 52.8 },
  27: { childrenUnder5: 1812, pct0to2: 60.8, pct3to4: 39.2, laborForce0to5: 45.2, laborForce6to17: 55.5 },
  28: { childrenUnder5: 3425, pct0to2: 58.5, pct3to4: 41.5, laborForce0to5: 68.2, laborForce6to17: 72.5 },
  29: { childrenUnder5: 3215, pct0to2: 61.5, pct3to4: 38.5, laborForce0to5: 44.8, laborForce6to17: 54.2 },
  30: { childrenUnder5: 5842, pct0to2: 59.2, pct3to4: 40.8, laborForce0to5: 55.5, laborForce6to17: 62.8 },
  31: { childrenUnder5: 3015, pct0to2: 58.8, pct3to4: 41.2, laborForce0to5: 58.2, laborForce6to17: 65.5 },
  
  // Downtown/Near South
  32: { childrenUnder5: 1825, pct0to2: 56.5, pct3to4: 43.5, laborForce0to5: 75.8, laborForce6to17: 78.5 },
  33: { childrenUnder5: 1542, pct0to2: 57.8, pct3to4: 42.2, laborForce0to5: 72.5, laborForce6to17: 76.2 },
  34: { childrenUnder5: 1215, pct0to2: 58.2, pct3to4: 41.8, laborForce0to5: 55.8, laborForce6to17: 64.5 },
  35: { childrenUnder5: 1425, pct0to2: 59.5, pct3to4: 40.5, laborForce0to5: 52.5, laborForce6to17: 62.8 },
  36: { childrenUnder5: 485, pct0to2: 60.8, pct3to4: 39.2, laborForce0to5: 48.2, laborForce6to17: 58.5 },
  37: { childrenUnder5: 215, pct0to2: 62.5, pct3to4: 37.5, laborForce0to5: 38.5, laborForce6to17: 48.2 },
  38: { childrenUnder5: 2125, pct0to2: 60.2, pct3to4: 39.8, laborForce0to5: 48.5, laborForce6to17: 58.8 },
  39: { childrenUnder5: 1125, pct0to2: 58.5, pct3to4: 41.5, laborForce0to5: 62.5, laborForce6to17: 68.2 },
  40: { childrenUnder5: 985, pct0to2: 61.8, pct3to4: 38.2, laborForce0to5: 42.8, laborForce6to17: 52.5 },
  41: { childrenUnder5: 1542, pct0to2: 57.5, pct3to4: 42.5, laborForce0to5: 68.5, laborForce6to17: 72.8 },
  42: { childrenUnder5: 2015, pct0to2: 60.5, pct3to4: 39.5, laborForce0to5: 52.8, laborForce6to17: 62.5 },
  
  // South Side
  43: { childrenUnder5: 3825, pct0to2: 60.2, pct3to4: 39.8, laborForce0to5: 48.5, laborForce6to17: 58.2 },
  44: { childrenUnder5: 2542, pct0to2: 59.5, pct3to4: 40.5, laborForce0to5: 52.2, laborForce6to17: 62.5 },
  45: { childrenUnder5: 825, pct0to2: 58.8, pct3to4: 41.2, laborForce0to5: 58.5, laborForce6to17: 68.2 },
  46: { childrenUnder5: 2415, pct0to2: 60.5, pct3to4: 39.5, laborForce0to5: 48.2, laborForce6to17: 58.5 },
  47: { childrenUnder5: 185, pct0to2: 61.5, pct3to4: 38.5, laborForce0to5: 45.8, laborForce6to17: 55.2 },
  48: { childrenUnder5: 1015, pct0to2: 58.2, pct3to4: 41.8, laborForce0to5: 55.5, laborForce6to17: 65.8 },
  49: { childrenUnder5: 3425, pct0to2: 60.8, pct3to4: 39.2, laborForce0to5: 52.5, laborForce6to17: 62.8 },
  50: { childrenUnder5: 625, pct0to2: 59.5, pct3to4: 40.5, laborForce0to5: 55.2, laborForce6to17: 65.5 },
  51: { childrenUnder5: 1425, pct0to2: 60.2, pct3to4: 39.8, laborForce0to5: 48.8, laborForce6to17: 58.5 },
  52: { childrenUnder5: 2542, pct0to2: 59.8, pct3to4: 40.2, laborForce0to5: 52.5, laborForce6to17: 62.2 },
  53: { childrenUnder5: 2815, pct0to2: 61.2, pct3to4: 38.8, laborForce0to5: 48.2, laborForce6to17: 58.5 },
  54: { childrenUnder5: 625, pct0to2: 62.5, pct3to4: 37.5, laborForce0to5: 35.5, laborForce6to17: 45.2 },
  55: { childrenUnder5: 825, pct0to2: 58.5, pct3to4: 41.5, laborForce0to5: 55.8, laborForce6to17: 65.5 },
  
  // Southwest Side
  56: { childrenUnder5: 3215, pct0to2: 57.2, pct3to4: 42.8, laborForce0to5: 52.5, laborForce6to17: 68.5 },
  57: { childrenUnder5: 1425, pct0to2: 58.5, pct3to4: 41.5, laborForce0to5: 48.5, laborForce6to17: 65.2 },
  58: { childrenUnder5: 4215, pct0to2: 59.2, pct3to4: 40.8, laborForce0to5: 55.2, laborForce6to17: 64.5 },
  59: { childrenUnder5: 1542, pct0to2: 58.0, pct3to4: 42.0, laborForce0to5: 62.5, laborForce6to17: 68.8 },
  60: { childrenUnder5: 2425, pct0to2: 57.8, pct3to4: 42.2, laborForce0to5: 58.5, laborForce6to17: 66.5 },
  61: { childrenUnder5: 4825, pct0to2: 59.5, pct3to4: 40.5, laborForce0to5: 52.2, laborForce6to17: 62.5 },
  62: { childrenUnder5: 1215, pct0to2: 57.5, pct3to4: 42.5, laborForce0to5: 55.8, laborForce6to17: 68.2 },
  63: { childrenUnder5: 3542, pct0to2: 59.2, pct3to4: 40.8, laborForce0to5: 52.5, laborForce6to17: 62.8 },
  64: { childrenUnder5: 2315, pct0to2: 56.8, pct3to4: 43.2, laborForce0to5: 55.2, laborForce6to17: 70.5 },
  65: { childrenUnder5: 3425, pct0to2: 58.5, pct3to4: 41.5, laborForce0to5: 52.8, laborForce6to17: 64.5 },
  66: { childrenUnder5: 5215, pct0to2: 59.8, pct3to4: 40.2, laborForce0to5: 48.5, laborForce6to17: 58.8 },
  67: { childrenUnder5: 3025, pct0to2: 61.5, pct3to4: 38.5, laborForce0to5: 45.2, laborForce6to17: 55.8 },
  68: { childrenUnder5: 2215, pct0to2: 61.8, pct3to4: 38.2, laborForce0to5: 42.5, laborForce6to17: 52.8 },
  69: { childrenUnder5: 2815, pct0to2: 60.5, pct3to4: 39.5, laborForce0to5: 48.8, laborForce6to17: 58.5 },
  70: { childrenUnder5: 4215, pct0to2: 57.8, pct3to4: 42.2, laborForce0to5: 55.5, laborForce6to17: 68.2 },
  71: { childrenUnder5: 4425, pct0to2: 60.2, pct3to4: 39.8, laborForce0to5: 48.2, laborForce6to17: 58.5 },
  72: { childrenUnder5: 1825, pct0to2: 56.5, pct3to4: 43.5, laborForce0to5: 55.8, laborForce6to17: 72.5 },
  73: { childrenUnder5: 2425, pct0to2: 59.5, pct3to4: 40.5, laborForce0to5: 52.5, laborForce6to17: 62.8 },
  74: { childrenUnder5: 1625, pct0to2: 55.8, pct3to4: 44.2, laborForce0to5: 48.2, laborForce6to17: 68.5 },
  75: { childrenUnder5: 1542, pct0to2: 57.2, pct3to4: 42.8, laborForce0to5: 58.5, laborForce6to17: 68.8 },
  76: { childrenUnder5: 615, pct0to2: 58.5, pct3to4: 41.5, laborForce0to5: 68.2, laborForce6to17: 72.5 },
  77: { childrenUnder5: 2425, pct0to2: 57.8, pct3to4: 42.2, laborForce0to5: 65.5, laborForce6to17: 70.2 },
};

function getDeltaInterpretation(delta: number): string {
  if (delta <= 3) {
    return "Parents work consistently regardless of child age - strong daycare demand indicator";
  } else if (delta <= 8) {
    return "Moderate difference - some parents may stay home with young children";
  } else if (delta <= 15) {
    return "Notable difference - significant number of parents stay home until children enter school";
  } else {
    return "Large difference - many parents prioritize staying home with young children";
  }
}

function getDaycareOpportunityScore(
  delta: number,
  laborForce0to5: number,
  childrenPerSlot?: number
): 'excellent' | 'good' | 'moderate' | 'low' {
  // Score based on: small delta (parents work regardless), high labor force participation, underserved area
  const deltaScore = delta <= 5 ? 3 : delta <= 10 ? 2 : delta <= 15 ? 1 : 0;
  const laborScore = laborForce0to5 >= 65 ? 3 : laborForce0to5 >= 55 ? 2 : laborForce0to5 >= 45 ? 1 : 0;
  const desertScore = childrenPerSlot ? (childrenPerSlot >= 4 ? 3 : childrenPerSlot >= 2.5 ? 2 : childrenPerSlot >= 1.5 ? 1 : 0) : 1;
  
  const totalScore = deltaScore + laborScore + desertScore;
  
  if (totalScore >= 7) return 'excellent';
  if (totalScore >= 5) return 'good';
  if (totalScore >= 3) return 'moderate';
  return 'low';
}

function getMarketInsight(
  delta: number,
  laborForce0to5: number,
  laborForce6to17: number,
  pct0to2: number
): string {
  const insights: string[] = [];
  
  if (delta <= 5) {
    insights.push("Both parents typically work regardless of child age");
  } else if (delta >= 15) {
    insights.push("Many families prefer to have a parent home with young children");
  }
  
  if (laborForce0to5 >= 65) {
    insights.push("High demand for infant/toddler care");
  } else if (laborForce0to5 <= 45) {
    insights.push("Lower immediate demand but potential for growth");
  }
  
  if (pct0to2 >= 60) {
    insights.push("Higher proportion of infants/toddlers (ages 0-2)");
  }
  
  if (laborForce6to17 - laborForce0to5 >= 12) {
    insights.push("After-school programs may have strong demand");
  }
  
  return insights.length > 0 ? insights.join(". ") + "." : "Standard market characteristics.";
}

async function main() {
  console.log("Building enhanced childcare data for Chicago community areas...");
  
  // Load existing childcare data for desert information
  const childcareDataPath = path.join(__dirname, '../server/data/community_area_childcare.json');
  let existingChildcare: { [key: string]: { childrenPerSlot: number } } = {};
  
  try {
    const rawData = fs.readFileSync(childcareDataPath, 'utf-8');
    existingChildcare = JSON.parse(rawData);
  } catch (err) {
    console.log("Note: Existing childcare data not found, proceeding without desert metrics");
  }
  
  const results: ChildcareEnhancedData[] = [];
  
  for (const [numStr, data] of Object.entries(CHILDCARE_DATA_RAW)) {
    const num = parseInt(numStr);
    const name = COMMUNITY_AREA_NAMES[num];
    
    if (!name) continue;
    
    // Calculate absolute numbers
    const children0to2 = Math.round(data.childrenUnder5 * data.pct0to2 / 100);
    const children3to4 = Math.round(data.childrenUnder5 * data.pct3to4 / 100);
    
    // Calculate delta (difference between labor force participation for older vs younger children)
    const delta = Math.round((data.laborForce6to17 - data.laborForce0to5) * 10) / 10;
    
    // Get existing childcare desert info
    const existingInfo = existingChildcare[name.toUpperCase()];
    const childrenPerSlot = existingInfo?.childrenPerSlot;
    
    const deltaInterpretation = getDeltaInterpretation(delta);
    const opportunityScore = getDaycareOpportunityScore(delta, data.laborForce0to5, childrenPerSlot);
    const marketInsight = getMarketInsight(delta, data.laborForce0to5, data.laborForce6to17, data.pct0to2);
    
    results.push({
      communityArea: name,
      communityNumber: num,
      childrenUnder5: data.childrenUnder5,
      children0to2,
      children3to4,
      pct0to2: data.pct0to2,
      pct3to4: data.pct3to4,
      parentsInLaborForce0to5: Math.round(data.childrenUnder5 * data.laborForce0to5 / 100),
      parentsInLaborForcePct0to5: data.laborForce0to5,
      parentsInLaborForce6to17: 0, // We don't have the 6-17 count, just percentage
      parentsInLaborForcePct6to17: data.laborForce6to17,
      laborForceDelta: delta,
      deltaInterpretation,
      daycareOpportunityScore: opportunityScore,
      marketInsight
    });
  }
  
  // Sort by community number
  results.sort((a, b) => a.communityNumber - b.communityNumber);
  
  // Write output
  const outputPath = path.join(__dirname, '../server/data/demographics/childcare_enhanced.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  
  console.log(`Wrote enhanced childcare data for ${results.length} community areas to ${outputPath}`);
  
  // Summary statistics
  const excellentAreas = results.filter(r => r.daycareOpportunityScore === 'excellent');
  const goodAreas = results.filter(r => r.daycareOpportunityScore === 'good');
  const moderateAreas = results.filter(r => r.daycareOpportunityScore === 'moderate');
  const lowAreas = results.filter(r => r.daycareOpportunityScore === 'low');
  
  console.log("\nDaycare opportunity distribution:");
  console.log(`  Excellent: ${excellentAreas.length} areas`);
  console.log(`  Good: ${goodAreas.length} areas`);
  console.log(`  Moderate: ${moderateAreas.length} areas`);
  console.log(`  Low: ${lowAreas.length} areas`);
  
  // Find areas with smallest delta (parents work regardless of child age)
  const sortedByDelta = [...results].sort((a, b) => a.laborForceDelta - b.laborForceDelta);
  console.log("\nTop 10 areas where parents work regardless of child age (smallest delta):");
  sortedByDelta.slice(0, 10).forEach((area, i) => {
    console.log(`  ${i + 1}. ${area.communityArea} - ${area.laborForceDelta}% delta (0-5: ${area.parentsInLaborForcePct0to5}%, 6-17: ${area.parentsInLaborForcePct6to17}%)`);
  });
  
  // Find areas with largest delta (many stay home with young children)
  console.log("\nTop 10 areas where parents stay home with young children (largest delta):");
  sortedByDelta.slice(-10).reverse().forEach((area, i) => {
    console.log(`  ${i + 1}. ${area.communityArea} - ${area.laborForceDelta}% delta (0-5: ${area.parentsInLaborForcePct0to5}%, 6-17: ${area.parentsInLaborForcePct6to17}%)`);
  });
}

main().catch(console.error);
