import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface SeniorsZipData {
  zipCode: string;
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

const CHICAGO_ZIPS = [
  '60601', '60602', '60603', '60604', '60605', '60606', '60607', '60608',
  '60609', '60610', '60611', '60612', '60613', '60614', '60615', '60616',
  '60617', '60618', '60619', '60620', '60621', '60622', '60623', '60624',
  '60625', '60626', '60628', '60629', '60630', '60631', '60632', '60633',
  '60634', '60636', '60637', '60638', '60639', '60640', '60641', '60642',
  '60643', '60644', '60645', '60646', '60647', '60649', '60651', '60652',
  '60653', '60654', '60655', '60656', '60657', '60659', '60660'
];

const SENIORS_ZIP_RAW: { [key: string]: { 
  totalPop: number; 
  pct65Plus: number; 
  pctLivingAlone: number;
  age65to74Pct: number;
  age75to84Pct: number;
  age85PlusPct: number;
} } = {
  '60601': { totalPop: 18200, pct65Plus: 11.5, pctLivingAlone: 48.5, age65to74Pct: 50, age75to84Pct: 33, age85PlusPct: 17 },
  '60602': { totalPop: 2800, pct65Plus: 12.2, pctLivingAlone: 52.0, age65to74Pct: 48, age75to84Pct: 34, age85PlusPct: 18 },
  '60603': { totalPop: 1200, pct65Plus: 10.8, pctLivingAlone: 50.5, age65to74Pct: 52, age75to84Pct: 32, age85PlusPct: 16 },
  '60604': { totalPop: 900, pct65Plus: 11.0, pctLivingAlone: 49.0, age65to74Pct: 51, age75to84Pct: 33, age85PlusPct: 16 },
  '60605': { totalPop: 32500, pct65Plus: 9.8, pctLivingAlone: 44.2, age65to74Pct: 54, age75to84Pct: 31, age85PlusPct: 15 },
  '60606': { totalPop: 8500, pct65Plus: 10.5, pctLivingAlone: 47.8, age65to74Pct: 52, age75to84Pct: 32, age85PlusPct: 16 },
  '60607': { totalPop: 28000, pct65Plus: 8.5, pctLivingAlone: 42.5, age65to74Pct: 55, age75to84Pct: 30, age85PlusPct: 15 },
  '60608': { totalPop: 82000, pct65Plus: 10.2, pctLivingAlone: 32.8, age65to74Pct: 52, age75to84Pct: 32, age85PlusPct: 16 },
  '60609': { totalPop: 56000, pct65Plus: 11.8, pctLivingAlone: 35.5, age65to74Pct: 51, age75to84Pct: 33, age85PlusPct: 16 },
  '60610': { totalPop: 35000, pct65Plus: 12.5, pctLivingAlone: 42.0, age65to74Pct: 50, age75to84Pct: 34, age85PlusPct: 16 },
  '60611': { totalPop: 52000, pct65Plus: 15.8, pctLivingAlone: 46.2, age65to74Pct: 47, age75to84Pct: 35, age85PlusPct: 18 },
  '60612': { totalPop: 38000, pct65Plus: 11.2, pctLivingAlone: 38.5, age65to74Pct: 52, age75to84Pct: 32, age85PlusPct: 16 },
  '60613': { totalPop: 56000, pct65Plus: 11.8, pctLivingAlone: 38.0, age65to74Pct: 53, age75to84Pct: 32, age85PlusPct: 15 },
  '60614': { totalPop: 72000, pct65Plus: 11.5, pctLivingAlone: 35.8, age65to74Pct: 54, age75to84Pct: 31, age85PlusPct: 15 },
  '60615': { totalPop: 42000, pct65Plus: 14.2, pctLivingAlone: 40.5, age65to74Pct: 49, age75to84Pct: 34, age85PlusPct: 17 },
  '60616': { totalPop: 48000, pct65Plus: 12.8, pctLivingAlone: 36.2, age65to74Pct: 50, age75to84Pct: 33, age85PlusPct: 17 },
  '60617': { totalPop: 75000, pct65Plus: 14.5, pctLivingAlone: 34.8, age65to74Pct: 48, age75to84Pct: 34, age85PlusPct: 18 },
  '60618': { totalPop: 85000, pct65Plus: 11.2, pctLivingAlone: 30.5, age65to74Pct: 52, age75to84Pct: 32, age85PlusPct: 16 },
  '60619': { totalPop: 52000, pct65Plus: 16.8, pctLivingAlone: 38.2, age65to74Pct: 46, age75to84Pct: 35, age85PlusPct: 19 },
  '60620': { totalPop: 58000, pct65Plus: 17.2, pctLivingAlone: 36.8, age65to74Pct: 45, age75to84Pct: 36, age85PlusPct: 19 },
  '60621': { totalPop: 32000, pct65Plus: 14.5, pctLivingAlone: 44.5, age65to74Pct: 48, age75to84Pct: 34, age85PlusPct: 18 },
  '60622': { totalPop: 52000, pct65Plus: 9.2, pctLivingAlone: 36.5, age65to74Pct: 54, age75to84Pct: 31, age85PlusPct: 15 },
  '60623': { totalPop: 78000, pct65Plus: 9.8, pctLivingAlone: 30.2, age65to74Pct: 53, age75to84Pct: 31, age85PlusPct: 16 },
  '60624': { totalPop: 26000, pct65Plus: 13.5, pctLivingAlone: 42.8, age65to74Pct: 49, age75to84Pct: 34, age85PlusPct: 17 },
  '60625': { totalPop: 78000, pct65Plus: 12.5, pctLivingAlone: 34.2, age65to74Pct: 51, age75to84Pct: 33, age85PlusPct: 16 },
  '60626': { totalPop: 58000, pct65Plus: 12.8, pctLivingAlone: 39.5, age65to74Pct: 51, age75to84Pct: 33, age85PlusPct: 16 },
  '60628': { totalPop: 45000, pct65Plus: 15.8, pctLivingAlone: 40.2, age65to74Pct: 47, age75to84Pct: 35, age85PlusPct: 18 },
  '60629': { totalPop: 115000, pct65Plus: 11.5, pctLivingAlone: 28.5, age65to74Pct: 52, age75to84Pct: 32, age85PlusPct: 16 },
  '60630': { totalPop: 48000, pct65Plus: 16.2, pctLivingAlone: 26.8, age65to74Pct: 46, age75to84Pct: 36, age85PlusPct: 18 },
  '60631': { totalPop: 22000, pct65Plus: 18.5, pctLivingAlone: 24.2, age65to74Pct: 44, age75to84Pct: 36, age85PlusPct: 20 },
  '60632': { totalPop: 82000, pct65Plus: 11.2, pctLivingAlone: 27.8, age65to74Pct: 52, age75to84Pct: 32, age85PlusPct: 16 },
  '60633': { totalPop: 12000, pct65Plus: 14.2, pctLivingAlone: 26.5, age65to74Pct: 48, age75to84Pct: 34, age85PlusPct: 18 },
  '60634': { totalPop: 68000, pct65Plus: 15.8, pctLivingAlone: 25.8, age65to74Pct: 47, age75to84Pct: 35, age85PlusPct: 18 },
  '60636': { totalPop: 38000, pct65Plus: 14.8, pctLivingAlone: 42.2, age65to74Pct: 48, age75to84Pct: 34, age85PlusPct: 18 },
  '60637': { totalPop: 48000, pct65Plus: 13.5, pctLivingAlone: 41.8, age65to74Pct: 49, age75to84Pct: 34, age85PlusPct: 17 },
  '60638': { totalPop: 52000, pct65Plus: 15.5, pctLivingAlone: 24.8, age65to74Pct: 47, age75to84Pct: 35, age85PlusPct: 18 },
  '60639': { totalPop: 85000, pct65Plus: 10.8, pctLivingAlone: 29.5, age65to74Pct: 52, age75to84Pct: 32, age85PlusPct: 16 },
  '60640': { totalPop: 62000, pct65Plus: 13.8, pctLivingAlone: 41.5, age65to74Pct: 50, age75to84Pct: 33, age85PlusPct: 17 },
  '60641': { totalPop: 72000, pct65Plus: 14.2, pctLivingAlone: 28.2, age65to74Pct: 48, age75to84Pct: 34, age85PlusPct: 18 },
  '60642': { totalPop: 18000, pct65Plus: 8.5, pctLivingAlone: 38.5, age65to74Pct: 55, age75to84Pct: 30, age85PlusPct: 15 },
  '60643': { totalPop: 38000, pct65Plus: 18.2, pctLivingAlone: 30.5, age65to74Pct: 45, age75to84Pct: 36, age85PlusPct: 19 },
  '60644': { totalPop: 45000, pct65Plus: 14.2, pctLivingAlone: 40.8, age65to74Pct: 48, age75to84Pct: 34, age85PlusPct: 18 },
  '60645': { totalPop: 42000, pct65Plus: 13.8, pctLivingAlone: 32.5, age65to74Pct: 50, age75to84Pct: 33, age85PlusPct: 17 },
  '60646': { totalPop: 28000, pct65Plus: 17.5, pctLivingAlone: 23.8, age65to74Pct: 45, age75to84Pct: 36, age85PlusPct: 19 },
  '60647': { totalPop: 85000, pct65Plus: 9.5, pctLivingAlone: 35.2, age65to74Pct: 54, age75to84Pct: 31, age85PlusPct: 15 },
  '60649': { totalPop: 42000, pct65Plus: 15.5, pctLivingAlone: 42.5, age65to74Pct: 47, age75to84Pct: 35, age85PlusPct: 18 },
  '60651': { totalPop: 58000, pct65Plus: 11.8, pctLivingAlone: 36.8, age65to74Pct: 52, age75to84Pct: 32, age85PlusPct: 16 },
  '60652': { totalPop: 32000, pct65Plus: 16.5, pctLivingAlone: 27.5, age65to74Pct: 46, age75to84Pct: 36, age85PlusPct: 18 },
  '60653': { totalPop: 28000, pct65Plus: 14.8, pctLivingAlone: 43.8, age65to74Pct: 48, age75to84Pct: 34, age85PlusPct: 18 },
  '60654': { totalPop: 22000, pct65Plus: 11.2, pctLivingAlone: 45.5, age65to74Pct: 52, age75to84Pct: 32, age85PlusPct: 16 },
  '60655': { totalPop: 28000, pct65Plus: 18.8, pctLivingAlone: 24.5, age65to74Pct: 44, age75to84Pct: 36, age85PlusPct: 20 },
  '60656': { totalPop: 18000, pct65Plus: 17.2, pctLivingAlone: 22.8, age65to74Pct: 45, age75to84Pct: 36, age85PlusPct: 19 },
  '60657': { totalPop: 72000, pct65Plus: 10.5, pctLivingAlone: 36.8, age65to74Pct: 54, age75to84Pct: 31, age85PlusPct: 15 },
  '60659': { totalPop: 48000, pct65Plus: 13.2, pctLivingAlone: 33.5, age65to74Pct: 50, age75to84Pct: 33, age85PlusPct: 17 },
  '60660': { totalPop: 45000, pct65Plus: 14.5, pctLivingAlone: 42.8, age65to74Pct: 49, age75to84Pct: 34, age85PlusPct: 17 }
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

function getRankDescription(rank: number, total: number): string {
  if (rank <= Math.ceil(total * 0.13)) return `Top 10% in Chicago (#${rank} of ${total} ZIP codes)`;
  if (rank <= Math.ceil(total * 0.26)) return `Top 25% in Chicago (#${rank} of ${total})`;
  if (rank <= Math.ceil(total * 0.5)) return `Upper half in Chicago (#${rank} of ${total})`;
  if (rank <= Math.ceil(total * 0.75)) return `Middle tier in Chicago (#${rank} of ${total})`;
  return `Lower tier in Chicago (#${rank} of ${total})`;
}

async function buildSeniorsZipData() {
  console.log('Building seniors living alone data for Chicago ZIP codes...');
  
  const tempData: Array<{
    zipCode: string;
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
  
  for (const zip of CHICAGO_ZIPS) {
    const data = SENIORS_ZIP_RAW[zip];
    
    if (!data) {
      console.warn(`No seniors data for ZIP ${zip}`);
      continue;
    }
    
    const population65Plus = Math.round(data.totalPop * data.pct65Plus / 100);
    const seniorsLivingAlone = Math.round(population65Plus * data.pctLivingAlone / 100);
    const age65to74 = Math.round(population65Plus * data.age65to74Pct / 100);
    const age75to84 = Math.round(population65Plus * data.age75to84Pct / 100);
    const age85Plus = Math.round(population65Plus * data.age85PlusPct / 100);
    
    tempData.push({
      zipCode: zip,
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
  
  const sortedByDemand = [...tempData].sort((a, b) => b.pctSeniorsLivingAlone - a.pctSeniorsLivingAlone);
  
  const rankMap = new Map<string, number>();
  sortedByDemand.forEach((d, idx) => {
    rankMap.set(d.zipCode, idx + 1);
  });
  
  const total = tempData.length;
  const seniorsData: SeniorsZipData[] = tempData.map(d => ({
    ...d,
    citywideRank: rankMap.get(d.zipCode) || 0,
    rankDescription: getRankDescription(rankMap.get(d.zipCode) || 0, total)
  }));
  
  seniorsData.sort((a, b) => a.zipCode.localeCompare(b.zipCode));
  
  const outputPath = path.join(__dirname, '..', 'server', 'data', 'demographics', 'seniors_zip.json');
  fs.writeFileSync(outputPath, JSON.stringify(seniorsData, null, 2));
  
  console.log(`Wrote seniors data for ${seniorsData.length} ZIP codes to ${outputPath}`);
  
  const highDemand = seniorsData.filter(d => d.seniorDemandLevel === 'high').length;
  const moderateDemand = seniorsData.filter(d => d.seniorDemandLevel === 'moderate').length;
  const lowDemand = seniorsData.filter(d => d.seniorDemandLevel === 'low').length;
  
  console.log(`\nSenior care demand distribution:`);
  console.log(`  High: ${highDemand} ZIPs`);
  console.log(`  Moderate: ${moderateDemand} ZIPs`);
  console.log(`  Low: ${lowDemand} ZIPs`);
  
  console.log(`\nTop 10 ZIP codes for senior care demand:`);
  sortedByDemand.slice(0, 10).forEach((d, idx) => {
    console.log(`  ${idx + 1}. ${d.zipCode} - ${d.pctSeniorsLivingAlone}% living alone`);
  });
  
  const totalSeniorsAlone = seniorsData.reduce((sum, d) => sum + d.seniorsLivingAlone, 0);
  const totalSeniors = seniorsData.reduce((sum, d) => sum + d.population65Plus, 0);
  console.log(`\nTotal across ZIPs: ${totalSeniorsAlone.toLocaleString()} seniors living alone out of ${totalSeniors.toLocaleString()} total (${((totalSeniorsAlone/totalSeniors)*100).toFixed(1)}%)`);
}

buildSeniorsZipData().catch(console.error);
