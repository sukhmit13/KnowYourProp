import * as fs from 'fs';
import * as path from 'path';

interface ZipCapacityData {
  zip_code: string;
  ccap_kids: number;
  num_centers: number;
  capacity_0_23mo: number;
  capacity_2yr: number;
  capacity_3_K: number;
  total_capacity: number;
  capacity_0_2_total: number;
  avg_center_size: number;
}

interface MarketAnalysis {
  zip_code: string;
  kids_0_2: number;
  kids_3_4: number;
  total_kids: number;
  capacity_0_2: number;
  capacity_3_K: number;
  total_capacity: number;
  num_centers: number;
  infant_toddler_gap: number;
  preschool_gap: number;
  total_gap: number;
  infant_toddler_ratio: number;
  preschool_ratio: number;
  total_ratio: number;
  centers_needed_infant: number;
  centers_needed_preschool: number;
  centers_needed_total: number;
  recommendation: 'INFANT-FOCUSED' | 'PRESCHOOL-FOCUSED' | 'BALANCED';
  avg_center_size: number;
}

function loadZipCapacityData(): Map<string, ZipCapacityData> {
  const csvPath = path.join('server/data', 'chicago_capacity_by_zip.csv');
  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',');
  
  const dataMap = new Map<string, ZipCapacityData>();
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    const data: ZipCapacityData = {
      zip_code: values[0],
      ccap_kids: Number(values[1]),
      num_centers: Number(values[2]),
      capacity_0_23mo: Number(values[3]),
      capacity_2yr: Number(values[4]),
      capacity_3_K: Number(values[5]),
      total_capacity: Number(values[6]),
      capacity_0_2_total: Number(values[7]),
      avg_center_size: Number(values[8])
    };
    dataMap.set(data.zip_code, data);
  }
  
  return dataMap;
}

export function analyze_childcare_market(
  zip_code: string,
  kids_0_2: number,
  kids_3_4: number,
  total_kids: number
): MarketAnalysis | null {
  const dataMap = loadZipCapacityData();
  const zipData = dataMap.get(zip_code);
  
  if (!zipData) {
    console.error(`No data found for ZIP code: ${zip_code}`);
    return null;
  }
  
  const capacity_0_2 = zipData.capacity_0_2_total;
  const capacity_3_K = zipData.capacity_3_K;
  const total_capacity = zipData.total_capacity;
  const num_centers = zipData.num_centers;
  const avg_center_size = zipData.avg_center_size;
  
  const infant_toddler_gap = kids_0_2 - capacity_0_2;
  const preschool_gap = kids_3_4 - capacity_3_K;
  const total_gap = total_kids - total_capacity;
  
  const infant_toddler_ratio = capacity_0_2 > 0 ? kids_0_2 / capacity_0_2 : Infinity;
  const preschool_ratio = capacity_3_K > 0 ? kids_3_4 / capacity_3_K : Infinity;
  const total_ratio = total_capacity > 0 ? total_kids / total_capacity : Infinity;
  
  const centers_needed_infant = Math.ceil(Math.max(0, infant_toddler_gap) / avg_center_size);
  const centers_needed_preschool = Math.ceil(Math.max(0, preschool_gap) / avg_center_size);
  const centers_needed_total = Math.ceil(Math.max(0, total_gap) / avg_center_size);
  
  let recommendation: 'INFANT-FOCUSED' | 'PRESCHOOL-FOCUSED' | 'BALANCED';
  if (infant_toddler_ratio > preschool_ratio * 1.1) {
    recommendation = 'INFANT-FOCUSED';
  } else if (preschool_ratio > infant_toddler_ratio * 1.1) {
    recommendation = 'PRESCHOOL-FOCUSED';
  } else {
    recommendation = 'BALANCED';
  }
  
  return {
    zip_code,
    kids_0_2,
    kids_3_4,
    total_kids,
    capacity_0_2,
    capacity_3_K,
    total_capacity,
    num_centers,
    infant_toddler_gap,
    preschool_gap,
    total_gap,
    infant_toddler_ratio,
    preschool_ratio,
    total_ratio,
    centers_needed_infant,
    centers_needed_preschool,
    centers_needed_total,
    recommendation,
    avg_center_size
  };
}

export function format_analysis(analysis: MarketAnalysis): string {
  const lines = [
    '╔══════════════════════════════════════════════════════════════╗',
    '║           CHILDCARE MARKET ANALYSIS                         ║',
    '╠══════════════════════════════════════════════════════════════╣',
    `║ ZIP Code: ${analysis.zip_code.padEnd(51)}║`,
    '╠══════════════════════════════════════════════════════════════╣',
    '║ POPULATION                                                   ║',
    `║   Children 0-2:           ${analysis.kids_0_2.toLocaleString().padStart(8)}                       ║`,
    `║   Children 3-4:           ${analysis.kids_3_4.toLocaleString().padStart(8)}                       ║`,
    `║   Total Kids:             ${analysis.total_kids.toLocaleString().padStart(8)}                       ║`,
    '╠══════════════════════════════════════════════════════════════╣',
    '║ EXISTING CAPACITY                                            ║',
    `║   Centers:                ${analysis.num_centers.toString().padStart(8)}                       ║`,
    `║   Infant/Toddler (0-2):   ${analysis.capacity_0_2.toLocaleString().padStart(8)} slots                  ║`,
    `║   Preschool (3-K):        ${analysis.capacity_3_K.toLocaleString().padStart(8)} slots                  ║`,
    `║   Total Capacity:         ${analysis.total_capacity.toLocaleString().padStart(8)} slots                  ║`,
    `║   Avg Center Size:        ${analysis.avg_center_size.toString().padStart(8)} slots                  ║`,
    '╠══════════════════════════════════════════════════════════════╣',
    '║ GAP ANALYSIS                                                 ║',
    `║   Infant/Toddler Gap:     ${analysis.infant_toddler_gap.toLocaleString().padStart(8)} children              ║`,
    `║   Preschool Gap:          ${analysis.preschool_gap.toLocaleString().padStart(8)} children              ║`,
    `║   Total Gap:              ${analysis.total_gap.toLocaleString().padStart(8)} children              ║`,
    '╠══════════════════════════════════════════════════════════════╣',
    '║ DEMAND RATIOS (children per slot)                            ║',
    `║   Infant/Toddler:         ${analysis.infant_toddler_ratio.toFixed(2).padStart(8)}x                       ║`,
    `║   Preschool:              ${analysis.preschool_ratio.toFixed(2).padStart(8)}x                       ║`,
    `║   Overall:                ${analysis.total_ratio.toFixed(2).padStart(8)}x                       ║`,
    '╠══════════════════════════════════════════════════════════════╣',
    '║ CENTERS NEEDED TO CLOSE GAP                                  ║',
    `║   For Infant/Toddler:     ${analysis.centers_needed_infant.toString().padStart(8)} centers                ║`,
    `║   For Preschool:          ${analysis.centers_needed_preschool.toString().padStart(8)} centers                ║`,
    `║   Total:                  ${analysis.centers_needed_total.toString().padStart(8)} centers                ║`,
    '╠══════════════════════════════════════════════════════════════╣',
    `║ RECOMMENDATION:           ${analysis.recommendation.padEnd(34)}║`,
    '╚══════════════════════════════════════════════════════════════╝'
  ];
  
  return lines.join('\n');
}

// Test with the provided data
const result = analyze_childcare_market('60642', 649, 397, 1046);
if (result) {
  console.log(format_analysis(result));
} else {
  console.log('Analysis failed - no data found');
}
