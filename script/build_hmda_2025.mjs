import { execSync } from 'child_process';
import { createReadStream, writeFileSync, readFileSync, existsSync, unlinkSync } from 'fs';
import { createInterface } from 'readline';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../server/data');

const YEAR = parseInt(process.argv[2] || '2025', 10);
if (isNaN(YEAR) || YEAR < 2018 || YEAR > 2100) {
  console.error(`Invalid year: ${process.argv[2]}`);
  process.exit(1);
}
const TMP = path.join(os.tmpdir(), `hmda_cook_${YEAR}.csv`);

const ACTION_LABELS = {
  '1': 'Originated', '2': 'Approved Not Accepted', '3': 'Denied',
  '4': 'Withdrawn', '5': 'Incomplete', '6': 'Purchased',
  '7': 'Preapproval Denied', '8': 'Preapproval Approved Not Accepted',
};
const LOAN_TYPE_LABELS = { '1': 'Conventional', '2': 'FHA', '3': 'VA', '4': 'USDA' };
const OCCUPANCY_LABELS = { '1': 'Principal Residence', '2': 'Second Residence', '3': 'Investment Property' };
const DENIAL_REASON_LABELS = {
  '1': 'Debt-to-income ratio', '2': 'Employment history', '3': 'Credit history',
  '4': 'Collateral', '5': 'Insufficient cash', '6': 'Unverifiable information',
  '7': 'Credit application incomplete', '8': 'Mortgage insurance denied', '9': 'Other',
};
const SEX_LABELS = {
  '1': 'Male', '2': 'Female', '3': 'Information not provided',
  '4': 'Joint', '5': 'Not applicable', '6': 'Both male and female',
};

const VALUE_BINS = [
  { key: '<$100k',      min: 0,       max: 100000 },
  { key: '$100k-$200k', min: 100000,  max: 200000 },
  { key: '$200k-$300k', min: 200000,  max: 300000 },
  { key: '$300k-$500k', min: 300000,  max: 500000 },
  { key: '$500k-$750k', min: 500000,  max: 750000 },
  { key: '$750k-$1M',   min: 750000,  max: 1000000 },
  { key: '>$1M',        min: 1000000, max: Infinity },
];
const INCOME_BINS = [
  { key: '<$50k',       min: 0,   max: 50 },
  { key: '$50k-$75k',  min: 50,  max: 75 },
  { key: '$75k-$100k', min: 75,  max: 100 },
  { key: '$100k-$150k',min: 100, max: 150 },
  { key: '$150k-$200k',min: 150, max: 200 },
  { key: '>$200k',     min: 200, max: Infinity },
];
const DTI_BINS = [
  { key: '<20%',     test: v => v < 20 },
  { key: '20%-36%',  test: v => v >= 20 && v < 36 },
  { key: '36%-43%',  test: v => v >= 36 && v < 43 },
  { key: '43%-50%',  test: v => v >= 43 && v < 50 },
  { key: '>50%',     test: v => v >= 50 },
];

function binValue(v) {
  for (const b of VALUE_BINS) if (v >= b.min && v < b.max) return b.key;
  return null;
}
function binIncome(v) {
  for (const b of INCOME_BINS) if (v >= b.min && v < b.max) return b.key;
  return null;
}
function binDti(v) {
  for (const b of DTI_BINS) if (b.test(v)) return b.key;
  return null;
}

function buildAgg() {
  return {
    total: 0,
    byAction: {}, byProductType: {}, byOccupancy: {},
    byLoanType: {}, byEthnicity: {}, byDwellingCategory: {},
    byRace: {}, byAge: {}, bySex: {},
    byDenialReason: {}, byDti: {},
    incomeSamples: [],
    valueSamples: [], rateFirstLienSamples: [],
    // Lender (LEI) tracking
    byLei: {},          // lei -> total app count
    byLeiClosed: {},    // lei -> originated count
    byLeiDenied: {},    // lei -> denied count
    byLeiRate: {},      // lei -> [first-lien rates]
    // Per-action aggregations for originated (1) and denied (3)
    originated: { total: 0, byRace: {}, byEthnicity: {}, byAge: {}, bySex: {}, byIncomeBin: {}, byDti: {}, incomeSamples: [],
                  byLoanType: {}, byProductType: {}, byOccupancy: {}, byDwellingCategory: {}, valueSamples: [] },
    denied:     { total: 0, byRace: {}, byEthnicity: {}, byAge: {}, bySex: {}, byIncomeBin: {}, byDti: {}, byDenialReason: {}, incomeSamples: [],
                  byLoanType: {}, byProductType: {}, byOccupancy: {} },
  };
}

function inc(map, key) { map[key] = (map[key] || 0) + 1; }

function toSortedArray(map, labelMap) {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => ({ key, label: labelMap ? (labelMap[key] || key) : key, count, pct: 0 }));
}

function withPct(arr, total) {
  return arr.map(r => ({ ...r, pct: total > 0 ? Math.round(r.count / total * 1000) / 10 : 0 }));
}

function finalizeSubAgg(sub, includeDenialReason) {
  const t = sub.total;
  if (t === 0) return null;
  const incSorted = [...sub.incomeSamples].sort((a, b) => a - b);
  const medIncome = incSorted.length > 0 ? incSorted[Math.floor(incSorted.length / 2)] : null;

  // Property value median + bins (originated only)
  const valSorted = [...(sub.valueSamples || [])].sort((a, b) => a - b);
  const medianPropertyValue = valSorted.length > 0 ? valSorted[Math.floor(valSorted.length / 2)] : null;
  const valueBinCounts = {};
  for (const v of valSorted) {
    const b = binValue(v);
    if (b) valueBinCounts[b] = (valueBinCounts[b] || 0) + 1;
  }
  const byPropertyValueBin = VALUE_BINS
    .filter(b => valueBinCounts[b.key])
    .map(b => ({ label: b.key, key: b.key, count: valueBinCounts[b.key], pct: valSorted.length > 0 ? Math.round(valueBinCounts[b.key] / valSorted.length * 1000) / 10 : 0 }));

  const out = {
    total: t,
    byRace:            withPct(toSortedArray(sub.byRace,             null),              t),
    byEthnicity:       withPct(toSortedArray(sub.byEthnicity,        null),              t),
    byAge:             withPct(toSortedArray(sub.byAge,              null),              t),
    bySex:             withPct(toSortedArray(sub.bySex,              null),              t),
    byIncomeBin:       withPct(toSortedArray(sub.byIncomeBin,        null),              t),
    byDti:             withPct(toSortedArray(sub.byDti,              null),              t),
    medianIncome:      medIncome,
    byLoanType:        withPct(toSortedArray(sub.byLoanType    || {}, LOAN_TYPE_LABELS), t),
    byProductType:     withPct(toSortedArray(sub.byProductType || {}, null),             t),
    byOccupancy:       withPct(toSortedArray(sub.byOccupancy   || {}, OCCUPANCY_LABELS), t),
    byDwellingCategory:withPct(toSortedArray(sub.byDwellingCategory || {}, null),        t),
    byPropertyValueBin,
    medianPropertyValue,
  };
  if (includeDenialReason) {
    out.byDenialReason = withPct(toSortedArray(sub.byDenialReason, DENIAL_REASON_LABELS), t);
  }
  return out;
}

function finalize(agg) {
  const { total } = agg;

  const values = agg.valueSamples.filter(Boolean);
  const valueBinCounts = {};
  for (const v of values) {
    const b = binValue(v);
    if (b) valueBinCounts[b] = (valueBinCounts[b] || 0) + 1;
  }
  const byPropertyValueBin = VALUE_BINS
    .filter(b => valueBinCounts[b.key])
    .map(b => ({ label: b.key, key: b.key, count: valueBinCounts[b.key], pct: values.length > 0 ? Math.round(valueBinCounts[b.key] / values.length * 1000) / 10 : 0 }));

  const sorted = [...values].sort((a, b) => a - b);
  const medianPropertyValue = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : null;

  const rates = agg.rateFirstLienSamples.filter(Boolean);
  const avgFirstLienRate = rates.length > 0 ? Math.round(rates.reduce((s, r) => s + r, 0) / rates.length * 1000) / 1000 : null;

  const incSorted = [...agg.incomeSamples].sort((a, b) => a - b);
  const medianIncome = incSorted.length > 0 ? incSorted[Math.floor(incSorted.length / 2)] : null;

  // Compute income bins for overall
  const incomeBinCounts = {};
  for (const v of agg.incomeSamples) {
    const b = binIncome(v);
    if (b) incomeBinCounts[b] = (incomeBinCounts[b] || 0) + 1;
  }
  const byIncomeBin = withPct(
    INCOME_BINS.filter(b => incomeBinCounts[b.key]).map(b => ({ key: b.key, label: b.key, count: incomeBinCounts[b.key], pct: 0 })),
    total
  );

  return {
    total,
    byAction:          withPct(toSortedArray(agg.byAction,          ACTION_LABELS),    total),
    byProductType:     withPct(toSortedArray(agg.byProductType,     null),             total),
    byOccupancy:       withPct(toSortedArray(agg.byOccupancy,       OCCUPANCY_LABELS), total),
    byLoanType:        withPct(toSortedArray(agg.byLoanType,        LOAN_TYPE_LABELS), total),
    byEthnicity:       withPct(toSortedArray(agg.byEthnicity,       null),             total),
    byDwellingCategory:withPct(toSortedArray(agg.byDwellingCategory,null),             total),
    byRace:            withPct(toSortedArray(agg.byRace,            null),             total),
    byAge:             withPct(toSortedArray(agg.byAge,             null),             total),
    bySex:             withPct(toSortedArray(agg.bySex,             null),             total),
    byDenialReason:    withPct(toSortedArray(agg.byDenialReason,    DENIAL_REASON_LABELS), total),
    byDti:             withPct(toSortedArray(agg.byDti,             null),             total),
    byIncomeBin,
    medianIncome,
    byPropertyValueBin,
    medianPropertyValue,
    _avgFirstLienRate: avgFirstLienRate,
    _firstLienRateCount: rates.length,
    _byLei: agg.byLei,
    _byLeiClosed: agg.byLeiClosed,
    _byLeiDenied: agg.byLeiDenied,
    _byLeiRate: agg.byLeiRate,
    originated: finalizeSubAgg(agg.originated, false),
    denied:     finalizeSubAgg(agg.denied,     true),
  };
}

function buildByLender(data, leiNames) {
  const byLei = data._byLei || {};
  const byLeiClosed = data._byLeiClosed || {};
  const byLeiDenied = data._byLeiDenied || {};
  const byLeiRate = data._byLeiRate || {};
  const total = data.total || 1;
  return Object.entries(byLei)
    .sort(([, a], [, b]) => b - a)
    .map(([lei, count]) => {
      const rates = byLeiRate[lei] || [];
      const avgFirstLienRate = rates.length > 0
        ? Math.round(rates.reduce((s, r) => s + r, 0) / rates.length * 1000) / 1000
        : null;
      return {
        lei,
        name: leiNames[lei] || lei,
        count,
        pct: Math.round(count / total * 1000) / 10,
        avgFirstLienRate,
        closedCount: byLeiClosed[lei] || 0,
        deniedCount: byLeiDenied[lei] || 0,
      };
    });
}

function stripPrivateLeiFields(data) {
  const { _byLei, _byLeiClosed, _byLeiDenied, _byLeiRate, ...rest } = data;
  return rest;
}

async function processCsv(filePath) {
  const tractData = {};
  const rl = createInterface({ input: createReadStream(filePath, 'utf8'), crlfDelay: Infinity });
  let headers = null;
  let colIdx = {};
  let rowCount = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    const cols = line.split(',');
    if (!headers) {
      headers = cols.map(h => h.trim());
      headers.forEach((h, i) => colIdx[h] = i);
      console.log(`Headers: ${headers.length} columns`);
      // Warn about missing columns
      const needed = ['derived_race','applicant_age','applicant_sex','income','debt_to_income_ratio','denial_reason_1'];
      const missing = needed.filter(f => colIdx[f] === undefined);
      if (missing.length) console.warn('  Warning: missing columns:', missing.join(', '));
      continue;
    }

    rowCount++;
    if (rowCount % 25000 === 0) process.stdout.write(`  ${rowCount.toLocaleString()} records...\r`);

    const tract = cols[colIdx['census_tract']]?.trim();
    if (!tract || tract === 'NA' || !tract.startsWith('17031')) continue;

    if (!tractData[tract]) tractData[tract] = buildAgg();
    const agg = tractData[tract];
    agg.total++;

    const action = cols[colIdx['action_taken']]?.trim();
    if (action && action !== 'NA') inc(agg.byAction, action);

    const loanProduct = cols[colIdx['derived_loan_product_type']]?.trim();
    if (loanProduct && loanProduct !== 'NA') inc(agg.byProductType, loanProduct);

    const occupancy = cols[colIdx['occupancy_type']]?.trim();
    if (occupancy && occupancy !== 'NA') inc(agg.byOccupancy, occupancy);

    const loanType = cols[colIdx['loan_type']]?.trim();
    if (loanType && loanType !== 'NA') inc(agg.byLoanType, loanType);

    const ethnicity = cols[colIdx['derived_ethnicity']]?.trim();
    if (ethnicity && ethnicity !== 'NA') inc(agg.byEthnicity, ethnicity);

    const dwelling = cols[colIdx['derived_dwelling_category']]?.trim();
    if (dwelling && dwelling !== 'NA') inc(agg.byDwellingCategory, dwelling);

    const race = cols[colIdx['derived_race']]?.trim();
    if (race && race !== 'NA') inc(agg.byRace, race);

    const age = cols[colIdx['applicant_age']]?.trim();
    if (age && age !== 'NA' && age !== '8888' && age !== '9999') inc(agg.byAge, age);

    const sexRaw = cols[colIdx['applicant_sex_name']]?.trim() || cols[colIdx['applicant_sex']]?.trim();
    const sex = (sexRaw && SEX_LABELS[sexRaw]) ? SEX_LABELS[sexRaw] : (sexRaw && sexRaw !== 'NA' && !/^\d+$/.test(sexRaw) ? sexRaw : null);
    if (sex && sex !== 'Not applicable' && sex !== 'Information not provided') inc(agg.bySex, sex);

    const incomeRaw = parseFloat(cols[colIdx['income']]?.trim());
    if (!isNaN(incomeRaw) && incomeRaw > 0 && incomeRaw < 10000) {
      agg.incomeSamples.push(incomeRaw);
    }

    const dtiRaw = cols[colIdx['debt_to_income_ratio']]?.trim();
    if (dtiRaw && dtiRaw !== 'NA' && dtiRaw !== 'Exempt') {
      // HMDA DTI: could be a range like "36%-<43%" or a number
      const dtiNum = parseFloat(dtiRaw.replace('%', '').split('<')[0].split('-')[0]);
      if (!isNaN(dtiNum)) {
        const bin = binDti(dtiNum);
        if (bin) inc(agg.byDti, bin);
      } else {
        // Handle range strings like "36%-<43%"
        const rangeMatch = dtiRaw.match(/^(\d+)%?-?/);
        if (rangeMatch) {
          const lo = parseFloat(rangeMatch[1]);
          if (!isNaN(lo)) {
            const bin = binDti(lo);
            if (bin) inc(agg.byDti, bin);
          }
        } else if (dtiRaw === '<20%') inc(agg.byDti, '<20%');
        else if (dtiRaw === '>60%') inc(agg.byDti, '>50%');
        else if (!isNaN(parseFloat(dtiRaw))) { const bin = binDti(parseFloat(dtiRaw)); if (bin) inc(agg.byDti, bin); }
      }
    }

    const denial1 = cols[colIdx['denial_reason-1']]?.trim() || cols[colIdx['denial_reason_1']]?.trim();
    if (denial1 && denial1 !== 'NA' && denial1 !== '10' && denial1 !== '1111') inc(agg.byDenialReason, denial1);

    const propVal = parseFloat(cols[colIdx['property_value']]?.trim());
    if (!isNaN(propVal) && propVal > 0) agg.valueSamples.push(propVal);

    const rate = parseFloat(cols[colIdx['interest_rate']]?.trim());
    const lien = cols[colIdx['lien_status']]?.trim();
    if (!isNaN(rate) && lien === '1') agg.rateFirstLienSamples.push(rate);

    const lei = cols[colIdx['lei']]?.trim();
    if (lei && lei !== 'NA' && lei !== '') {
      inc(agg.byLei, lei);
      if (action === '1') inc(agg.byLeiClosed, lei);
      if (action === '3') inc(agg.byLeiDenied, lei);
      if (!isNaN(rate) && lien === '1') {
        if (!agg.byLeiRate[lei]) agg.byLeiRate[lei] = [];
        agg.byLeiRate[lei].push(rate);
      }
    }

    // Per-action sub-aggregations
    const subAgg = action === '1' ? agg.originated : action === '3' ? agg.denied : null;
    if (subAgg) {
      subAgg.total++;
      if (race && race !== 'NA') inc(subAgg.byRace, race);
      if (ethnicity && ethnicity !== 'NA') inc(subAgg.byEthnicity, ethnicity);
      if (age && age !== 'NA' && age !== '8888' && age !== '9999') inc(subAgg.byAge, age);
      if (sex && sex !== 'Not applicable' && sex !== 'Information not provided') inc(subAgg.bySex, sex);
      if (!isNaN(incomeRaw) && incomeRaw > 0 && incomeRaw < 10000) {
        subAgg.incomeSamples.push(incomeRaw);
        const inBin = binIncome(incomeRaw);
        if (inBin) inc(subAgg.byIncomeBin, inBin);
      }
      if (dtiRaw && dtiRaw !== 'NA' && dtiRaw !== 'Exempt') {
        const dtiNum = parseFloat(dtiRaw.replace('%', '').split('<')[0].split('-')[0]);
        if (!isNaN(dtiNum)) { const bin = binDti(dtiNum); if (bin) inc(subAgg.byDti, bin); }
        else if (dtiRaw === '<20%') inc(subAgg.byDti, '<20%');
        else if (dtiRaw === '>60%') inc(subAgg.byDti, '>50%');
      }
      if (action === '3' && denial1 && denial1 !== 'NA' && denial1 !== '10' && denial1 !== '1111') inc(subAgg.byDenialReason, denial1);
      // Loan product/type/occupancy/dwelling (same fields tracked at top level)
      if (loanType && loanType !== 'NA') inc(subAgg.byLoanType, loanType);
      if (loanProduct && loanProduct !== 'NA') inc(subAgg.byProductType, loanProduct);
      if (occupancy && occupancy !== 'NA') inc(subAgg.byOccupancy, occupancy);
      if (dwelling && dwelling !== 'NA' && subAgg.byDwellingCategory) inc(subAgg.byDwellingCategory, dwelling);
      if (!isNaN(propVal) && propVal > 0 && subAgg.valueSamples) subAgg.valueSamples.push(propVal);
    }
  }

  console.log(`\nProcessed ${rowCount.toLocaleString()} rows, ${Object.keys(tractData).length} Cook County tracts`);
  return tractData;
}

function mergeSubAgg(dest, src) {
  dest.total += src.total;
  for (const [k, v] of Object.entries(src.byRace))         dest.byRace[k]         = (dest.byRace[k]         || 0) + v;
  for (const [k, v] of Object.entries(src.byEthnicity))    dest.byEthnicity[k]    = (dest.byEthnicity[k]    || 0) + v;
  for (const [k, v] of Object.entries(src.byAge))          dest.byAge[k]          = (dest.byAge[k]          || 0) + v;
  for (const [k, v] of Object.entries(src.bySex))          dest.bySex[k]          = (dest.bySex[k]          || 0) + v;
  for (const [k, v] of Object.entries(src.byIncomeBin))    dest.byIncomeBin[k]    = (dest.byIncomeBin[k]    || 0) + v;
  for (const [k, v] of Object.entries(src.byDti))          dest.byDti[k]          = (dest.byDti[k]          || 0) + v;
  if (src.byDenialReason) {
    if (!dest.byDenialReason) dest.byDenialReason = {};
    for (const [k, v] of Object.entries(src.byDenialReason)) dest.byDenialReason[k] = (dest.byDenialReason[k] || 0) + v;
  }
  // Loan product/type/occupancy/dwelling/property value
  if (src.byLoanType)        { for (const [k, v] of Object.entries(src.byLoanType))        dest.byLoanType[k]        = (dest.byLoanType[k]        || 0) + v; }
  if (src.byProductType)     { for (const [k, v] of Object.entries(src.byProductType))     dest.byProductType[k]     = (dest.byProductType[k]     || 0) + v; }
  if (src.byOccupancy)       { for (const [k, v] of Object.entries(src.byOccupancy))       dest.byOccupancy[k]       = (dest.byOccupancy[k]       || 0) + v; }
  if (src.byDwellingCategory){ for (const [k, v] of Object.entries(src.byDwellingCategory))dest.byDwellingCategory[k]= (dest.byDwellingCategory[k]|| 0) + v; }
  if (src.valueSamples && dest.valueSamples)  dest.valueSamples.push(...src.valueSamples);
  dest.incomeSamples.push(...src.incomeSamples);
}

async function fetchLeiNames(leis, existingNames) {
  const missing = leis.filter(l => !existingNames[l]);
  if (missing.length === 0) return existingNames;
  console.log(`Fetching names for ${missing.length} new LEIs from FFIEC...`);
  const result = { ...existingNames };
  const BATCH = 50;
  for (let i = 0; i < missing.length; i += BATCH) {
    const batch = missing.slice(i, i + BATCH);
    try {
      const resp = await fetch(
        `https://ffiec.cfpb.gov/v2/public/institutions?lei=${batch.join(',')}&fields=lei,name`,
        { signal: AbortSignal.timeout(15000) }
      );
      if (resp.ok) {
        const data = await resp.json();
        for (const inst of (data.institutions || [])) {
          if (inst.lei && inst.name) result[inst.lei] = inst.name;
        }
      }
    } catch {}
  }
  return result;
}

async function main() {
  console.log(`=== Building HMDA data for year ${YEAR} ===`);
  const tractMap = JSON.parse(readFileSync(path.join(DATA_DIR, 'hmda_tract_community_map.json'), 'utf-8'));

  // Load existing lender names to avoid re-fetching
  const lendersPath = path.join(DATA_DIR, 'hmda_lenders.json');
  const existingLeiNames = existsSync(lendersPath)
    ? JSON.parse(readFileSync(lendersPath, 'utf-8'))
    : {};

  const URL = `https://ffiec.cfpb.gov/v2/data-browser-api/view/csv?years=${YEAR}&counties=17031&actions_taken=1,2,3,4,5,6,7,8`;
  console.log(`Downloading ${YEAR} Cook County HMDA LAR via curl...`);
  execSync(`curl -sL --max-time 180 "${URL}" -o "${TMP}"`, { stdio: 'inherit' });

  const lines = parseInt(execSync(`wc -l < "${TMP}"`).toString().trim());
  console.log(`Downloaded ${lines.toLocaleString()} lines`);

  if (lines < 1000) {
    try { unlinkSync(TMP); } catch {}
    console.error(`Only ${lines} lines returned — ${YEAR} data likely not yet published. Exiting.`);
    process.exit(2);
  }

  const tractData = await processCsv(TMP);

  // Collect all unique LEIs and resolve names
  const allLeis = new Set();
  for (const agg of Object.values(tractData)) {
    for (const lei of Object.keys(agg.byLei)) allLeis.add(lei);
  }
  console.log(`Resolving names for ${allLeis.size} unique LEIs...`);
  const leiNames = await fetchLeiNames([...allLeis], existingLeiNames);
  // Save updated lender names
  writeFileSync(lendersPath, JSON.stringify(leiNames));
  console.log(`  Saved hmda_lenders.json (${Object.keys(leiNames).length} total lenders)`);

  const byTract = {};
  for (const [tract, agg] of Object.entries(tractData)) byTract[tract] = finalize(agg);

  const byCommAgg = {};
  for (const [tract, agg] of Object.entries(tractData)) {
    const community = tractMap[tract];
    if (!community) continue;
    const key = community.toUpperCase();
    if (!byCommAgg[key]) byCommAgg[key] = buildAgg();
    const ca = byCommAgg[key];
    ca.total += agg.total;
    for (const [k, v] of Object.entries(agg.byAction))          ca.byAction[k]          = (ca.byAction[k]          || 0) + v;
    for (const [k, v] of Object.entries(agg.byProductType))     ca.byProductType[k]     = (ca.byProductType[k]     || 0) + v;
    for (const [k, v] of Object.entries(agg.byOccupancy))       ca.byOccupancy[k]       = (ca.byOccupancy[k]       || 0) + v;
    for (const [k, v] of Object.entries(agg.byLoanType))        ca.byLoanType[k]        = (ca.byLoanType[k]        || 0) + v;
    for (const [k, v] of Object.entries(agg.byEthnicity))       ca.byEthnicity[k]       = (ca.byEthnicity[k]       || 0) + v;
    for (const [k, v] of Object.entries(agg.byDwellingCategory))ca.byDwellingCategory[k]= (ca.byDwellingCategory[k]|| 0) + v;
    for (const [k, v] of Object.entries(agg.byRace))            ca.byRace[k]            = (ca.byRace[k]            || 0) + v;
    for (const [k, v] of Object.entries(agg.byAge))             ca.byAge[k]             = (ca.byAge[k]             || 0) + v;
    for (const [k, v] of Object.entries(agg.bySex))             ca.bySex[k]             = (ca.bySex[k]             || 0) + v;
    for (const [k, v] of Object.entries(agg.byDenialReason))    ca.byDenialReason[k]    = (ca.byDenialReason[k]    || 0) + v;
    for (const [k, v] of Object.entries(agg.byDti))             ca.byDti[k]             = (ca.byDti[k]             || 0) + v;
    // Merge LEI maps
    for (const [k, v] of Object.entries(agg.byLei))      ca.byLei[k]      = (ca.byLei[k]      || 0) + v;
    for (const [k, v] of Object.entries(agg.byLeiClosed))ca.byLeiClosed[k]= (ca.byLeiClosed[k]|| 0) + v;
    for (const [k, v] of Object.entries(agg.byLeiDenied))ca.byLeiDenied[k]= (ca.byLeiDenied[k]|| 0) + v;
    for (const [k, v] of Object.entries(agg.byLeiRate)) {
      if (!ca.byLeiRate[k]) ca.byLeiRate[k] = [];
      ca.byLeiRate[k].push(...v);
    }
    ca.incomeSamples.push(...agg.incomeSamples);
    ca.valueSamples.push(...agg.valueSamples);
    ca.rateFirstLienSamples.push(...agg.rateFirstLienSamples);
    mergeSubAgg(ca.originated, agg.originated);
    mergeSubAgg(ca.denied,     agg.denied);
  }
  const byCommunity = {};
  for (const [key, agg] of Object.entries(byCommAgg)) byCommunity[key] = finalize(agg);

  // Attach byLender to each tract and community, strip private fields
  const byTractFinal = {};
  for (const [tract, data] of Object.entries(byTract)) {
    byTractFinal[tract] = { ...stripPrivateLeiFields(data), byLender: buildByLender(data, leiNames) };
  }
  const byCommunityFinal = {};
  for (const [key, data] of Object.entries(byCommunity)) {
    byCommunityFinal[key] = { ...stripPrivateLeiFields(data), byLender: buildByLender(data, leiNames) };
  }

  const suffix = YEAR === 2024 ? '' : `_${YEAR}`;

  const tractPath = path.join(DATA_DIR, `hmda_by_tract${suffix}.json`);
  writeFileSync(tractPath, JSON.stringify(byTractFinal));
  console.log(`Saved ${tractPath} (${Object.keys(byTractFinal).length} tracts)`);

  const caPath = path.join(DATA_DIR, `hmda_by_community${suffix}.json`);
  writeFileSync(caPath, JSON.stringify(byCommunityFinal));
  console.log(`Saved ${caPath} (${Object.keys(byCommunityFinal).length} community areas)`);

  const ratesTractPath = path.join(DATA_DIR, 'hmda_rates_by_tract.json');
  if (existsSync(ratesTractPath)) {
    const rt = JSON.parse(readFileSync(ratesTractPath, 'utf-8'));
    let updated = 0;
    for (const [tract, data] of Object.entries(byTractFinal)) {
      if (data._avgFirstLienRate === null) continue;
      if (!rt[tract]) rt[tract] = {};
      rt[tract][`y${YEAR}`] = { avgFirstLienRate: data._avgFirstLienRate, firstLienRateCount: data._firstLienRateCount };
      updated++;
    }
    writeFileSync(ratesTractPath, JSON.stringify(rt));
    console.log(`Updated hmda_rates_by_tract.json (${updated} tracts)`);
  }

  const ratesCaPath = path.join(DATA_DIR, 'hmda_rates_by_community.json');
  if (existsSync(ratesCaPath)) {
    const rc = JSON.parse(readFileSync(ratesCaPath, 'utf-8'));
    let updated = 0;
    for (const [key, data] of Object.entries(byCommunityFinal)) {
      if (data._avgFirstLienRate === null) continue;
      if (!rc[key]) rc[key] = {};
      rc[key][`y${YEAR}`] = { avgFirstLienRate: data._avgFirstLienRate, firstLienRateCount: data._firstLienRateCount };
      updated++;
    }
    writeFileSync(ratesCaPath, JSON.stringify(rc));
    console.log(`Updated hmda_rates_by_community.json (${updated} community areas)`);
  }

  // Build global Cook County lender rankings for this year and update hmda_lender_rankings.json
  const globalByLei = {}, globalByLeiClosed = {}, globalByLeiDenied = {}, globalByLeiRate = {}, globalTotal = { v: 0 };
  for (const agg of Object.values(tractData)) {
    globalTotal.v += agg.total;
    for (const [k, v] of Object.entries(agg.byLei))       globalByLei[k]       = (globalByLei[k]       || 0) + v;
    for (const [k, v] of Object.entries(agg.byLeiClosed)) globalByLeiClosed[k] = (globalByLeiClosed[k] || 0) + v;
    for (const [k, v] of Object.entries(agg.byLeiDenied)) globalByLeiDenied[k] = (globalByLeiDenied[k] || 0) + v;
    for (const [k, v] of Object.entries(agg.byLeiRate)) {
      if (!globalByLeiRate[k]) globalByLeiRate[k] = [];
      globalByLeiRate[k].push(...v);
    }
  }

  // Sort by closed loans descending
  const byClosedRanked = Object.entries(globalByLei)
    // Sort by LEI key — destructuring the entry VALUE here (previous bug) made
    // every lookup undefined and left the list in insertion order.
    .sort(([leiA], [leiB]) => (globalByLeiClosed[leiB] || 0) - (globalByLeiClosed[leiA] || 0))
    .slice(0, 100)
    .map(([lei], i) => ({
      rank: i + 1,
      lei,
      name: leiNames[lei] || lei,
      closed: globalByLeiClosed[lei] || 0,
      fhaClosed: 0,
      subordinateClosed: 0,
      helocClosed: 0,
      totalApps: globalByLei[lei] || 0,
      winRate: Math.round((globalByLeiClosed[lei] || 0) / (globalByLei[lei] || 1) * 100),
      fhaPct: 0,
      subordinatePct: 0,
    }));

  // Sort by lowest avg first-lien rate (min 10 closed)
  const byLowestRateRanked = Object.entries(globalByLeiRate)
    .filter(([lei, rates]) => (globalByLeiClosed[lei] || 0) >= 10 && rates.length >= 10)
    .map(([lei, rates]) => {
      const avg = Math.round(rates.reduce((s, r) => s + r, 0) / rates.length * 1000) / 1000;
      return { lei, avg, count: rates.length };
    })
    .sort((a, b) => a.avg - b.avg)
    .slice(0, 100)
    .map(({ lei, avg, count }, i) => ({
      rank: i + 1,
      lei,
      name: leiNames[lei] || lei,
      closed: globalByLeiClosed[lei] || 0,
      totalApps: globalByLei[lei] || 0,
      winRate: Math.round((globalByLeiClosed[lei] || 0) / (globalByLei[lei] || 1) * 100),
      avgFirstLienRate: avg,
      firstLienRateCount: count,
    }));

  const rankingsPath = path.join(DATA_DIR, 'hmda_lender_rankings.json');
  const existingRankings = existsSync(rankingsPath)
    ? JSON.parse(readFileSync(rankingsPath, 'utf-8'))
    : { byClosed: [], byFHAClosed: [], bySubordinate: [], byLowestRate: [], yearsRange: '' };

  const prevYearsRange = existingRankings.yearsRange || '';
  const newYearsRange = prevYearsRange.includes(String(YEAR))
    ? prevYearsRange
    : prevYearsRange ? `${prevYearsRange}–${YEAR}` : String(YEAR);

  const updatedRankings = {
    ...existingRankings,
    [`byClosed${YEAR}`]: byClosedRanked,
    [`byLowestRate${YEAR}`]: byLowestRateRanked,
    yearsRange: newYearsRange,
    builtAt: new Date().toISOString(),
  };
  // If byClosed doesn't include this year's data yet, make this year the primary
  updatedRankings.byClosed = byClosedRanked;
  updatedRankings.byLowestRate = byLowestRateRanked;

  writeFileSync(rankingsPath, JSON.stringify(updatedRankings));
  console.log(`Updated hmda_lender_rankings.json (${byClosedRanked.length} lenders by closed, ${byLowestRateRanked.length} by rate)`);

  try { unlinkSync(TMP); } catch {}

  console.log(`\n=== ${YEAR} HMDA data complete ===`);
  console.log(`  Tracts: ${Object.keys(byTractFinal).length}, Community areas: ${Object.keys(byCommunityFinal).length}`);
}

main().catch(err => { console.error(err); process.exit(1); });
