import ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';

const EXCEL_FILE = 'attached_assets/ECE_DataFY24_v2_Replit_1769982988480.xlsx';
const OUTPUT_DIR = 'server/data';

async function extractCCAsData(workbook: ExcelJS.Workbook): Promise<void> {
  const sheet = workbook.getWorksheet('CCAs');
  if (!sheet) {
    console.error('CCAs sheet not found');
    return;
  }

  const rawData: any[][] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber < 4) return;
    rawData.push((row.values as any[]).slice(1).map((v: any) => v ?? ''));
  });
  
  const results: any[] = [];
  
  for (let i = 1; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row || !row[0]) continue;
    
    const communityArea = String(row[0] || '').trim();
    
    if (communityArea === 'Statewide' || communityArea === 'Chicago city' || communityArea === '') {
      continue;
    }
    
    const ccap_children_0_1 = Number(row[6]) || 0;
    const ccap_children_2 = Number(row[7]) || 0;
    const ccap_children_3_4 = Number(row[8]) || 0;
    const ccap_children_5 = Number(row[9]) || 0;
    const ccap_children_total = Number(row[10]) || 0;
    
    const ccap_licensed_centers = Number(row[11]) || 0;
    const ccap_licensed_family = Number(row[13]) || 0;
    
    const num_centers = Number(row[16]) || 0;
    const center_capacity_0_23mo = Number(row[17]) || 0;
    const center_capacity_2yr = Number(row[18]) || 0;
    const center_capacity_3_K = Number(row[19]) || 0;
    const center_total_capacity = Number(row[20]) || 0;
    
    const num_family_homes = Number(row[21]) || 0;
    const family_capacity_0_23mo = Number(row[22]) || 0;
    const family_capacity_2yr = Number(row[23]) || 0;
    const family_capacity_3_K = Number(row[24]) || 0;
    const family_total_capacity = Number(row[25]) || 0;
    
    const excelrate_center_sites = Number(row[26]) || 0;
    const excelrate_center_circle = Number(row[27]) || 0;
    const excelrate_center_bronze = Number(row[28]) || 0;
    const excelrate_center_silver = Number(row[29]) || 0;
    const excelrate_center_gold = Number(row[30]) || 0;
    
    const excelrate_family_sites = Number(row[31]) || 0;
    const excelrate_family_circle = Number(row[32]) || 0;
    const excelrate_family_bronze = Number(row[33]) || 0;
    const excelrate_family_silver = Number(row[34]) || 0;
    const excelrate_family_gold = Number(row[35]) || 0;
    
    const total_providers = num_centers + num_family_homes;
    const capacity_0_23mo = center_capacity_0_23mo + family_capacity_0_23mo;
    const capacity_2yr = center_capacity_2yr + family_capacity_2yr;
    const capacity_3_K = center_capacity_3_K + family_capacity_3_K;
    const total_capacity = center_total_capacity + family_total_capacity;
    const capacity_0_2_total = capacity_0_23mo + capacity_2yr;
    
    const avg_center_size = num_centers > 0 ? Math.round(center_total_capacity / num_centers) : 0;
    const avg_family_home_size = num_family_homes > 0 ? Math.round(family_total_capacity / num_family_homes) : 0;
    const avg_provider_size = total_providers > 0 ? Math.round(total_capacity / total_providers) : 0;
    
    const pct_slots_ccap = total_capacity > 0 ? Math.round((ccap_children_total / total_capacity) * 100) : 0;
    
    const excelrate_sites = excelrate_center_sites + excelrate_family_sites;
    const excelrate_circle = excelrate_center_circle + excelrate_family_circle;
    const excelrate_bronze = excelrate_center_bronze + excelrate_family_bronze;
    const excelrate_silver = excelrate_center_silver + excelrate_family_silver;
    const excelrate_gold = excelrate_center_gold + excelrate_family_gold;
    const pct_excelrate = total_providers > 0 ? Math.round((excelrate_sites / total_providers) * 100) : 0;
    
    results.push({
      community_area: communityArea,
      num_centers,
      center_capacity_0_23mo,
      center_capacity_2yr,
      center_capacity_3_K,
      center_total_capacity,
      avg_center_size,
      num_family_homes,
      family_capacity_0_23mo,
      family_capacity_2yr,
      family_capacity_3_K,
      family_total_capacity,
      avg_family_home_size,
      total_providers,
      capacity_0_23mo,
      capacity_2yr,
      capacity_3_K,
      total_capacity,
      capacity_0_2_total,
      avg_provider_size,
      ccap_licensed_centers,
      ccap_licensed_family,
      ccap_children_total,
      pct_slots_ccap,
      excelrate_center_sites,
      excelrate_center_circle,
      excelrate_center_bronze,
      excelrate_center_silver,
      excelrate_center_gold,
      excelrate_family_sites,
      excelrate_family_circle,
      excelrate_family_bronze,
      excelrate_family_silver,
      excelrate_family_gold,
      excelrate_sites,
      excelrate_circle,
      excelrate_bronze,
      excelrate_silver,
      excelrate_gold,
      pct_excelrate
    });
  }
  
  const outputPath = path.join(OUTPUT_DIR, 'chicago_capacity_by_cca.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`Saved ${results.length} CCA records to ${outputPath}`);
}

async function extractZipCodesData(workbook: ExcelJS.Workbook): Promise<void> {
  const sheetName = 'Zip Codes (ZCTA 2020)';
  const sheet = workbook.getWorksheet(sheetName);
  if (!sheet) {
    console.error(`Sheet "${sheetName}" not found. Available sheets:`, workbook.worksheets.map(ws => ws.name));
    return;
  }

  const rawData: any[][] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber < 4) return;
    rawData.push((row.values as any[]).slice(1).map((v: any) => v ?? ''));
  });
  
  const results: any[] = [];
  
  for (let i = 1; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row || !row[0]) continue;
    
    const zipCode = String(row[0] || '').trim();
    
    if (zipCode === 'Statewide' || zipCode === '') {
      continue;
    }
    
    if (!zipCode.startsWith('606') && !zipCode.startsWith('608')) {
      continue;
    }
    
    const ccap_children_0_1 = Number(row[6]) || 0;
    const ccap_children_2 = Number(row[7]) || 0;
    const ccap_children_3_4 = Number(row[8]) || 0;
    const ccap_children_5 = Number(row[9]) || 0;
    const ccap_children_total = Number(row[10]) || 0;
    
    const ccap_licensed_centers = Number(row[11]) || 0;
    const ccap_licensed_family = Number(row[13]) || 0;
    
    const num_centers = Number(row[16]) || 0;
    const center_capacity_0_23mo = Number(row[17]) || 0;
    const center_capacity_2yr = Number(row[18]) || 0;
    const center_capacity_3_K = Number(row[19]) || 0;
    const center_total_capacity = Number(row[20]) || 0;
    
    const num_family_homes = Number(row[21]) || 0;
    const family_capacity_0_23mo = Number(row[22]) || 0;
    const family_capacity_2yr = Number(row[23]) || 0;
    const family_capacity_3_K = Number(row[24]) || 0;
    const family_total_capacity = Number(row[25]) || 0;
    
    const excelrate_center_sites = Number(row[26]) || 0;
    const excelrate_center_circle = Number(row[27]) || 0;
    const excelrate_center_bronze = Number(row[28]) || 0;
    const excelrate_center_silver = Number(row[29]) || 0;
    const excelrate_center_gold = Number(row[30]) || 0;
    
    const excelrate_family_sites = Number(row[31]) || 0;
    const excelrate_family_circle = Number(row[32]) || 0;
    const excelrate_family_bronze = Number(row[33]) || 0;
    const excelrate_family_silver = Number(row[34]) || 0;
    const excelrate_family_gold = Number(row[35]) || 0;
    
    const total_providers = num_centers + num_family_homes;
    const capacity_0_23mo = center_capacity_0_23mo + family_capacity_0_23mo;
    const capacity_2yr = center_capacity_2yr + family_capacity_2yr;
    const capacity_3_K = center_capacity_3_K + family_capacity_3_K;
    const total_capacity = center_total_capacity + family_total_capacity;
    const capacity_0_2_total = capacity_0_23mo + capacity_2yr;
    
    const avg_center_size = num_centers > 0 ? Math.round(center_total_capacity / num_centers) : 0;
    const avg_family_home_size = num_family_homes > 0 ? Math.round(family_total_capacity / num_family_homes) : 0;
    const avg_provider_size = total_providers > 0 ? Math.round(total_capacity / total_providers) : 0;
    
    const pct_slots_ccap = total_capacity > 0 ? Math.round((ccap_children_total / total_capacity) * 100) : 0;
    
    const excelrate_sites = excelrate_center_sites + excelrate_family_sites;
    const excelrate_circle = excelrate_center_circle + excelrate_family_circle;
    const excelrate_bronze = excelrate_center_bronze + excelrate_family_bronze;
    const excelrate_silver = excelrate_center_silver + excelrate_family_silver;
    const excelrate_gold = excelrate_center_gold + excelrate_family_gold;
    const pct_excelrate = total_providers > 0 ? Math.round((excelrate_sites / total_providers) * 100) : 0;
    
    results.push({
      zip_code: zipCode,
      num_centers,
      center_capacity_0_23mo,
      center_capacity_2yr,
      center_capacity_3_K,
      center_total_capacity,
      avg_center_size,
      num_family_homes,
      family_capacity_0_23mo,
      family_capacity_2yr,
      family_capacity_3_K,
      family_total_capacity,
      avg_family_home_size,
      total_providers,
      capacity_0_23mo,
      capacity_2yr,
      capacity_3_K,
      total_capacity,
      capacity_0_2_total,
      avg_provider_size,
      ccap_licensed_centers,
      ccap_licensed_family,
      ccap_children_total,
      pct_slots_ccap,
      excelrate_center_sites,
      excelrate_center_circle,
      excelrate_center_bronze,
      excelrate_center_silver,
      excelrate_center_gold,
      excelrate_family_sites,
      excelrate_family_circle,
      excelrate_family_bronze,
      excelrate_family_silver,
      excelrate_family_gold,
      excelrate_sites,
      excelrate_circle,
      excelrate_bronze,
      excelrate_silver,
      excelrate_gold,
      pct_excelrate
    });
  }
  
  const outputPath = path.join(OUTPUT_DIR, 'chicago_capacity_by_zip.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`Saved ${results.length} ZIP code records to ${outputPath}`);
}

async function main() {
  console.log('Reading Excel file...');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(EXCEL_FILE);
  console.log('Available sheets:', workbook.worksheets.map(ws => ws.name));
  
  await extractCCAsData(workbook);
  await extractZipCodesData(workbook);
  
  console.log('Done!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
