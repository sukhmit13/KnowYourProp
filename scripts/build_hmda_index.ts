import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ACTION_LABELS: Record<string, string> = {
  '1': 'Originated', '2': 'Approved Not Accepted', '3': 'Denied',
  '4': 'Withdrawn', '5': 'Incomplete', '6': 'Purchased',
  '7': 'Preapproval Denied', '8': 'Preapproval Approved Not Accepted',
};
const OCCUPANCY_LABELS: Record<string, string> = {
  '1': 'Principal Residence', '2': 'Second Residence', '3': 'Investment Property',
};
const LOAN_TYPE_LABELS: Record<string, string> = {
  '1': 'Conventional', '2': 'FHA', '3': 'VA', '4': 'USDA/RHS',
};
const DENIAL_LABELS: Record<string, string> = {
  '1': 'Debt-to-income ratio', '2': 'Employment history', '3': 'Credit history',
  '4': 'Collateral', '5': 'Insufficient cash', '6': 'Unverifiable info',
  '7': 'Application incomplete', '8': 'Mortgage insurance denied', '9': 'Other',
  '10': 'Not applicable', '1111': 'Exempt',
};
const CREDIT_SCORE_LABELS: Record<string, string> = {
  '1': 'Equifax Beacon 5.0', '2': 'Experian Fair Isaac', '3': 'FICO Classic 04',
  '4': 'FICO Classic 98', '5': 'VantageScore 2.0', '6': 'VantageScore 3.0',
  '7': 'Multiple models', '8': 'Other model', '9': 'Not applicable',
  '11': 'FICO Score 9', '12': 'FICO Score 10', '14': 'TransRisk Score',
  '15': 'FICO Auto Score', '1111': 'Exempt',
};
const VALUE_BINS = ['<$100k', '$100k-$200k', '$200k-$300k', '$300k-$500k', '$500k-$750k', '>$750k'];
const INCOME_BINS = ['<$50k', '$50k-$75k', '$75k-$100k', '$100k-$150k', '$150k-$200k', '>$200k'];
const DTI_ORDER = ['<20%', '20%-36%', '36%-43%', '43%-50%', '50%-60%', '>60%'];

function incomeToLabel(val: number): string {
  if (val < 50)  return '<$50k';
  if (val < 75)  return '$50k-$75k';
  if (val < 100) return '$75k-$100k';
  if (val < 150) return '$100k-$150k';
  if (val < 200) return '$150k-$200k';
  return '>$200k';
}

function dtiToLabel(raw: string): string | null {
  if (!raw || raw === 'NA' || raw === 'Exempt' || raw === '1111') return null;
  if (raw.includes('%')) {
    if (raw === '<20%') return '<20%';
    if (raw.includes('<36')) return '20%-36%';
    if (raw.startsWith('3')) return '36%-43%';
    if (raw.startsWith('4') && !raw.startsWith('45') && !raw.startsWith('46') && !raw.startsWith('47') && !raw.startsWith('48') && !raw.startsWith('49')) return '36%-43%';
    if (raw.startsWith('45%') || raw.startsWith('46%') || raw.startsWith('47%') || raw.startsWith('48%') || raw.startsWith('49%')) return '43%-50%';
    if (raw.startsWith('40%') || raw.startsWith('41%') || raw.startsWith('42%') || raw.startsWith('43%') || raw.startsWith('44%')) return '36%-43%';
    if (raw.startsWith('50%')) return '50%-60%';
    if (raw.startsWith('>60') || raw.startsWith('6')) return '>60%';
    return null;
  }
  const n = parseFloat(raw);
  if (isNaN(n)) return null;
  if (n < 20) return '<20%';
  if (n < 36) return '20%-36%';
  if (n < 43) return '36%-43%';
  if (n < 50) return '43%-50%';
  if (n <= 60) return '50%-60%';
  return '>60%';
}

interface RawStats {
  total: number;
  byAction: Record<string, number>;
  byProductType: Record<string, number>;
  byOccupancy: Record<string, number>;
  byLoanType: Record<string, number>;
  byEthnicity: Record<string, number>;
  byRace: Record<string, number>;
  byAge: Record<string, number>;
  byDenialReason: Record<string, number>;
  byCreditScoreType: Record<string, number>;
  byDwellingCategory: Record<string, number>;
  byPropertyValueBin: Record<string, number>;
  propertyValueSum: number;
  propertyValueCount: number;
  byLei: Record<string, number>;
  byIncomeBin: Record<string, number>;
  incomeSum: number;
  incomeCount: number;
  byDti: Record<string, number>;
  bySex: Record<string, number>;
}

function inc(obj: Record<string, number>, key: string) {
  if (key) obj[key] = (obj[key] || 0) + 1;
}

function mergeInto(dst: Record<string, number>, src: Record<string, number>) {
  for (const [k, v] of Object.entries(src)) dst[k] = (dst[k] || 0) + v;
}

function emptyStats(): RawStats {
  return {
    total: 0, byAction: {}, byProductType: {}, byOccupancy: {}, byLoanType: {},
    byEthnicity: {}, byRace: {}, byAge: {}, byDenialReason: {},
    byCreditScoreType: {}, byDwellingCategory: {}, byPropertyValueBin: {},
    propertyValueSum: 0, propertyValueCount: 0, byLei: {},
    byIncomeBin: {}, incomeSum: 0, incomeCount: 0, byDti: {}, bySex: {},
  };
}

function pct(count: number, total: number): number {
  if (!total) return 0;
  return Math.round((count / total) * 1000) / 10;
}

function toBreakdown(raw: Record<string, number>, total: number, labelMap?: Record<string, string>) {
  return Object.entries(raw)
    .filter(([k]) => k && k !== 'NA' && k !== '' && k !== '10' && k !== '1111')
    .sort(([, a], [, b]) => b - a)
    .map(([key, count]) => ({
      key,
      label: labelMap ? (labelMap[key] || key) : key,
      count,
      pct: pct(count, total),
    }));
}

function finalizeStats(raw: RawStats, leiNames: Record<string, string>) {
  const { total } = raw;
  return {
    total,
    byAction: toBreakdown(raw.byAction, total, ACTION_LABELS),
    byProductType: toBreakdown(raw.byProductType, total),
    byOccupancy: toBreakdown(raw.byOccupancy, total, OCCUPANCY_LABELS),
    byLoanType: toBreakdown(raw.byLoanType, total, LOAN_TYPE_LABELS),
    byEthnicity: toBreakdown(raw.byEthnicity, total),
    byRace: toBreakdown(raw.byRace, total),
    byAge: toBreakdown(raw.byAge, total),
    byDenialReason: toBreakdown(raw.byDenialReason, total, DENIAL_LABELS),
    byCreditScoreType: toBreakdown(raw.byCreditScoreType, total, CREDIT_SCORE_LABELS),
    byDwellingCategory: toBreakdown(raw.byDwellingCategory, total),
    byPropertyValueBin: VALUE_BINS
      .map(label => ({ label, count: raw.byPropertyValueBin[label] || 0, pct: pct(raw.byPropertyValueBin[label] || 0, raw.propertyValueCount) }))
      .filter(b => b.count > 0),
    medianPropertyValue: raw.propertyValueCount > 0 ? Math.round(raw.propertyValueSum / raw.propertyValueCount) : null,
    byLender: Object.entries(raw.byLei)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 25)
      .map(([lei, count]) => ({ lei, name: leiNames[lei] || lei, count, pct: pct(count, total) })),
    byIncomeBin: INCOME_BINS
      .map(label => ({ key: label, label, count: raw.byIncomeBin[label] || 0, pct: pct(raw.byIncomeBin[label] || 0, raw.incomeCount) }))
      .filter(b => b.count > 0),
    medianIncome: raw.incomeCount > 0 ? Math.round(raw.incomeSum / raw.incomeCount) : null,
    byDti: DTI_ORDER
      .map(label => ({ key: label, label, count: raw.byDti[label] || 0, pct: pct(raw.byDti[label] || 0, Object.values(raw.byDti).reduce((a, b) => a + b, 0)) }))
      .filter(b => b.count > 0),
    bySex: toBreakdown(raw.bySex, total),
  };
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, retries = 3): Promise<any> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i === retries - 1) return null;
      await sleep(500 * (i + 1));
    }
  }
}

async function fetchLeiNames(leis: string[]): Promise<Record<string, string>> {
  const names: Record<string, string> = {};
  const CONCURRENCY = 20;
  for (let i = 0; i < leis.length; i += CONCURRENCY) {
    const batch = leis.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (lei) => {
      try {
        const res = await fetch(`https://api.gleif.org/api/v1/lei-records/${lei}`, {
          signal: AbortSignal.timeout(8000),
        });
        if (res.ok) {
          const data = await res.json();
          const name = data?.data?.attributes?.entity?.legalName?.name;
          if (name) names[lei] = name;
        }
      } catch { }
    }));
    process.stdout.write(`\r  Fetching LEI names: ${Math.min(i + CONCURRENCY, leis.length)}/${leis.length}`);
    await sleep(100);
  }
  console.log('');
  return names;
}

async function buildTractCommunityMap(uniqueTracts: Set<string>): Promise<Record<string, string>> {
  const caGeo = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../server/data/chicago_community_areas.geojson'), 'utf8')
  );

  const url = `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Census2020/MapServer/6/query?f=json&where=STATE%3D%2717%27+AND+COUNTY%3D%27031%27&outFields=GEOID%2CCENTLAT%2CCENTLON&returnGeometry=false&resultRecordCount=2000`;
  console.log('  Fetching census tract centroids from Census TIGER...');
  const tigerData = await fetchWithRetry(url);

  if (!tigerData?.features?.length) {
    console.warn('  Failed to fetch TIGER data, community area mapping unavailable');
    return {};
  }
  console.log(`  Got ${tigerData.features.length} tract centroids`);

  const { booleanPointInPolygon, point } = await import('@turf/turf') as any;

  const mapping: Record<string, string> = {};
  for (const feat of tigerData.features) {
    const geoid: string = feat.attributes.GEOID;
    if (!uniqueTracts.has(geoid)) continue;
    const lat = parseFloat(feat.attributes.CENTLAT);
    const lon = parseFloat(feat.attributes.CENTLON);
    if (isNaN(lat) || isNaN(lon)) continue;
    const pt = point([lon, lat]);
    for (const caFeat of caGeo.features) {
      try {
        if (booleanPointInPolygon(pt, caFeat)) {
          mapping[geoid] = (caFeat.properties.community as string).toUpperCase();
          break;
        }
      } catch { }
    }
  }
  return mapping;
}

function getPropertyValueBin(val: number): string {
  if (val < 100000) return '<$100k';
  if (val < 200000) return '$100k-$200k';
  if (val < 300000) return '$200k-$300k';
  if (val < 500000) return '$300k-$500k';
  if (val < 750000) return '$500k-$750k';
  return '>$750k';
}

async function main() {
  console.log('=== Building HMDA Index ===\n');

  const csvPath = path.join(__dirname, '../attached_assets/county_17031_1772055551506.csv');
  const tractStats: Record<string, RawStats> = {};
  const uniqueLeis = new Set<string>();
  const uniqueTracts = new Set<string>();
  let header: string[] = [];
  let rowCount = 0;

  console.log('Step 1: Parsing CSV...');
  const rl = readline.createInterface({ input: fs.createReadStream(csvPath) });

  for await (const line of rl) {
    if (!header.length) { header = line.split(','); continue; }
    rowCount++;
    if (rowCount % 20000 === 0) process.stdout.write(`\r  Parsed ${rowCount} rows...`);

    const parts = line.split(',');
    const g = (name: string) => parts[header.indexOf(name)] || '';

    const tract = g('census_tract');
    if (!tract || tract === 'NA') continue;
    uniqueTracts.add(tract);
    const lei = g('lei');
    if (lei) uniqueLeis.add(lei);

    if (!tractStats[tract]) tractStats[tract] = emptyStats();
    const s = tractStats[tract];
    s.total++;

    inc(s.byAction, g('action_taken'));
    inc(s.byProductType, g('derived_loan_product_type'));
    inc(s.byOccupancy, g('occupancy_type'));
    inc(s.byLoanType, g('loan_type'));
    inc(s.byEthnicity, g('derived_ethnicity'));
    inc(s.byRace, g('derived_race'));

    const age = g('applicant_age');
    if (age && age !== '8888' && age !== '9999') inc(s.byAge, age);

    const denial = g('denial_reason-1');
    if (denial && denial !== '10' && denial !== '') inc(s.byDenialReason, denial);

    const cs = g('applicant_credit_score_type');
    if (cs && cs !== '9' && cs !== '1111') inc(s.byCreditScoreType, cs);

    inc(s.byDwellingCategory, g('derived_dwelling_category'));
    const sex = g('derived_sex');
    if (sex && sex !== 'Sex Not Available') inc(s.bySex, sex);
    if (lei) inc(s.byLei, lei);

    const pv = parseFloat(g('property_value'));
    if (!isNaN(pv) && pv > 0 && pv < 10000000) {
      inc(s.byPropertyValueBin, getPropertyValueBin(pv));
      s.propertyValueSum += pv;
      s.propertyValueCount++;
    }

    const incRaw = parseFloat(g('income'));
    if (!isNaN(incRaw) && incRaw > 0 && incRaw < 10000) {
      const incLabel = incomeToLabel(incRaw);
      inc(s.byIncomeBin, incLabel);
      s.incomeSum += incRaw;
      s.incomeCount++;
    }

    const dtiLabel = dtiToLabel(g('debt_to_income_ratio'));
    if (dtiLabel) inc(s.byDti, dtiLabel);
  }
  console.log(`\n  Done: ${rowCount} rows, ${uniqueTracts.size} tracts, ${uniqueLeis.size} LEIs\n`);

  console.log('Step 2: Building tract → community area mapping...');
  const tractCommunityMap = await buildTractCommunityMap(uniqueTracts);
  console.log(`  Mapped ${Object.keys(tractCommunityMap).length} tracts to community areas\n`);

  console.log('Step 3: Fetching lender names from FFIEC API...');
  const leiNames = await fetchLeiNames([...uniqueLeis]);
  console.log(`  Got ${Object.keys(leiNames).length} institution names\n`);

  console.log('Step 4: Aggregating by community area...');
  const communityStats: Record<string, RawStats> = {};
  for (const [tract, community] of Object.entries(tractCommunityMap)) {
    if (!tractStats[tract]) continue;
    if (!communityStats[community]) communityStats[community] = emptyStats();
    const src = tractStats[tract];
    const dst = communityStats[community];
    dst.total += src.total;
    mergeInto(dst.byAction, src.byAction);
    mergeInto(dst.byProductType, src.byProductType);
    mergeInto(dst.byOccupancy, src.byOccupancy);
    mergeInto(dst.byLoanType, src.byLoanType);
    mergeInto(dst.byEthnicity, src.byEthnicity);
    mergeInto(dst.byRace, src.byRace);
    mergeInto(dst.byAge, src.byAge);
    mergeInto(dst.byDenialReason, src.byDenialReason);
    mergeInto(dst.byCreditScoreType, src.byCreditScoreType);
    mergeInto(dst.byDwellingCategory, src.byDwellingCategory);
    mergeInto(dst.byPropertyValueBin, src.byPropertyValueBin);
    dst.propertyValueSum += src.propertyValueSum;
    dst.propertyValueCount += src.propertyValueCount;
    mergeInto(dst.byLei, src.byLei);
    mergeInto(dst.byIncomeBin, src.byIncomeBin);
    dst.incomeSum += src.incomeSum;
    dst.incomeCount += src.incomeCount;
    mergeInto(dst.byDti, src.byDti);
    mergeInto(dst.bySex, src.bySex);
  }
  console.log(`  ${Object.keys(communityStats).length} community areas\n`);

  console.log('Step 5: Writing output files...');
  const dataDir = path.join(__dirname, '../server/data');

  const tractIndex: Record<string, any> = {};
  for (const [tract, raw] of Object.entries(tractStats)) {
    tractIndex[tract] = finalizeStats(raw, leiNames);
  }
  fs.writeFileSync(path.join(dataDir, 'hmda_by_tract.json'), JSON.stringify(tractIndex));
  console.log(`  hmda_by_tract.json (${uniqueTracts.size} tracts)`);

  const communityIndex: Record<string, any> = {};
  for (const [ca, raw] of Object.entries(communityStats)) {
    communityIndex[ca] = finalizeStats(raw, leiNames);
  }
  fs.writeFileSync(path.join(dataDir, 'hmda_by_community.json'), JSON.stringify(communityIndex));
  console.log(`  hmda_by_community.json (${Object.keys(communityIndex).length} community areas)`);

  fs.writeFileSync(path.join(dataDir, 'hmda_lenders.json'), JSON.stringify(leiNames));
  console.log(`  hmda_lenders.json (${Object.keys(leiNames).length} lenders)`);

  fs.writeFileSync(path.join(dataDir, 'hmda_tract_community_map.json'), JSON.stringify(tractCommunityMap));
  console.log(`  hmda_tract_community_map.json\n`);

  console.log('=== HMDA index build complete! ===');
}

main().catch(console.error);
