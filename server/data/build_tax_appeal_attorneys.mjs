import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'https://datacatalog.cookcountyil.gov/resource/7pny-nedm.json';
const MIN_WINS_AVG = 100;
const TOP_N = 15;
const YEARS = "'2019','2020','2021','2022','2023','2024'";

const RESIDENTIAL_CLASSES = new Set(['Residential']);
const MULTIFAMILY_CLASSES = new Set(['Multi Family', 'Multi Family Incentive']);
const COMMERCIAL_CLASSES  = new Set(['Commercial and Industrial', 'Commercial Incentive', 'Commercial/Industrial Incentive', 'Industrial Incentive and Industrial Brownfield']);

function classifyMajorclass(mc) {
  if (RESIDENTIAL_CLASSES.has(mc)) return 'residential';
  if (MULTIFAMILY_CLASSES.has(mc)) return 'multifamily';
  if (COMMERCIAL_CLASSES.has(mc))  return 'commercial';
  return null;
}

async function fetchWins() {
  const select = 'attorney_firstname,attorney_lastname,attorney_firmname,majorclass,count(*) as wins,sum(assessor_totalvalue) as sum_assessor,sum(bor_totalvalue) as sum_bor';
  const where  = `result='Decrease' AND attorney_lastname IS NOT NULL AND tax_year IN (${YEARS})`;
  const group  = 'attorney_firstname,attorney_lastname,attorney_firmname,majorclass';
  const having = 'count(*) > 10';
  const url = `${BASE}?$select=${encodeURIComponent(select)}&$where=${encodeURIComponent(where)}&$group=${encodeURIComponent(group)}&$having=${encodeURIComponent(having)}&$limit=5000`;

  console.log('Fetching wins aggregated by attorney + majorclass...');
  const r = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  if (d.error) throw new Error(d.message || JSON.stringify(d));
  console.log(`Got ${d.length} attorney-class win rows`);
  return d;
}

function buildRankings(records, filterCategory) {
  const map = new Map();
  for (const rec of records) {
    if (filterCategory !== 'all' && rec.category !== filterCategory) continue;
    const key = `${rec.name}|||${rec.firm}`;
    if (!map.has(key)) map.set(key, { name: rec.name, firm: rec.firm, wins: 0, totalReduction: 0 });
    const m = map.get(key);
    m.wins += rec.wins;
    m.totalReduction += rec.totalReduction;
  }
  const list = Array.from(map.values()).filter(a => a.wins > 0).map(a => ({
    ...a,
    totalAppeals: a.wins, // approximation — we have wins count only
    winRate: 0,           // omitted since we don't have total appeals
    avgReduction: Math.round(a.totalReduction / a.wins),
    totalReduction: Math.round(a.totalReduction),
  }));
  const byWins         = [...list].sort((a, b) => b.wins - a.wins)
    .slice(0, TOP_N).map((a, i) => ({ rank: i + 1, ...a }));
  const byAvgReduction = list.filter(a => a.wins >= MIN_WINS_AVG)
    .sort((a, b) => b.avgReduction - a.avgReduction)
    .slice(0, TOP_N).map((a, i) => ({ rank: i + 1, ...a }));
  return { byWins, byAvgReduction };
}

async function main() {
  const winsRows = await fetchWins();

  // Convert raw API rows into structured records
  const records = winsRows
    .map(r => {
      const cat = classifyMajorclass(r.majorclass);
      if (!cat) return null;
      const wins = parseInt(r.wins) || 0;
      const totalReduction = Math.max(0, (parseFloat(r.sum_assessor) || 0) - (parseFloat(r.sum_bor) || 0));
      return {
        name: `${r.attorney_firstname || ''} ${r.attorney_lastname}`.trim(),
        firm: r.attorney_firmname || '',
        category: cat,
        wins,
        totalReduction,
      };
    })
    .filter(Boolean);

  console.log(`\nProcessing ${records.length} classified records...`);

  const out = {
    byWins:         buildRankings(records, 'all').byWins,
    byAvgReduction: buildRankings(records, 'all').byAvgReduction,
    residential:    buildRankings(records, 'residential'),
    multifamily:    buildRankings(records, 'multifamily'),
    commercial:     buildRankings(records, 'commercial'),
    yearsRange: '2019–2024',
    builtAt: new Date().toISOString(),
  };

  for (const [cat, src] of [['all', out], ['residential', out.residential], ['multifamily', out.multifamily], ['commercial', out.commercial]]) {
    console.log(`\n${cat.toUpperCase()}:`);
    console.log(`  byWins: ${src.byWins.length}, byAvgReduction: ${src.byAvgReduction.length}`);
    if (src.byWins[0])         console.log(`  #1 wins: ${src.byWins[0].name} — ${src.byWins[0].wins.toLocaleString()} wins (${src.byWins[0].firm})`);
    if (src.byAvgReduction[0]) console.log(`  #1 avg: ${src.byAvgReduction[0].name} — $${src.byAvgReduction[0].avgReduction.toLocaleString()} avg (${src.byAvgReduction[0].firm})`);
  }

  const outPath = path.join(__dirname, 'tax_appeal_attorneys.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`\nWrote ${outPath} (${(fs.statSync(outPath).size / 1024).toFixed(1)} KB)`);
}

main().catch(e => { console.error(e); process.exit(1); });
