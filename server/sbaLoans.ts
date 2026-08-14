import { createInterface } from 'readline';
import { Readable } from 'stream';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FALLBACK_7A  = 'https://data.sba.gov/sites/default/files/uploaded_resources/FOIA_7a_FY2020_Present_asof_260630.csv';
const FALLBACK_504 = 'https://data.sba.gov/sites/default/files/uploaded_resources/FOIA_504_FY2010_Present_asof_260630.csv';

function loadSBAUrls(): { csv7a: string; csv504: string } {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'sba_config.json'), 'utf-8'));
    if (cfg.csv7a && cfg.csv504) return { csv7a: cfg.csv7a, csv504: cfg.csv504 };
  } catch {}
  return { csv7a: FALLBACK_7A, csv504: FALLBACK_504 };
}

const sbaCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

export function clearSBACache(): void {
  sbaCache.clear();
  console.log('[SBA] Cache cleared — will reload with updated CSV URLs');
}

// Column indices are resolved from each CSV's header row at stream time.
// SBA reshuffled columns during their Aug 2026 open-data portal migration
// (CKAN → Drupal); hardcoded indices silently read the wrong columns.
// Each entry lists acceptable header names (first match wins).
const FIELDS_7A: Record<string, string[]> = {
  borrname: ['BorrName'], borrstreet: ['BorrStreet'], borrcity: ['BorrCity'],
  borrstate: ['BorrState'], borrzip: ['BorrZip'], bankname: ['BankName'],
  grossapproval: ['GrossApproval'], approvaldate: ['ApprovalDate'],
  approvalfiscalyear: ['ApprovalFY', 'ApprovalFiscalYear'],
  naicscode: ['NaicsCode'], naicsdescription: ['NaicsDescription'],
  jobssupported: ['JobsSupported'], loanstatus: ['LoanStatus'],
  subprogram: ['Subprogram', 'SubprogramDescription', 'ProcessingMethod'],
  projectcounty: ['ProjectCounty'], projectstate: ['ProjectState'],
};

const FIELDS_504: Record<string, string[]> = {
  borrname: ['BorrName'], borrstreet: ['BorrStreet'], borrcity: ['BorrCity'],
  borrstate: ['BorrState'], borrzip: ['BorrZip'], cdc_name: ['CDC_Name'],
  grossapproval: ['GrossApproval'], approvaldate: ['ApprovalDate'],
  approvalfiscalyear: ['ApprovalFY', 'ApprovalFiscalYear'],
  naicscode: ['NaicsCode'], naicsdescription: ['NaicsDescription'],
  jobssupported: ['JobsSupported'], loanstatus: ['LoanStatus'],
  projectcounty: ['ProjectCounty'], projectstate: ['ProjectState'],
};

// Resolve field → column index from a parsed header row. Throws (fails loudly)
// if a required field is missing so a format change never yields empty results.
function resolveColumns(header: string[], fields: Record<string, string[]>, label: string): Record<string, number> {
  const norm = header.map(h => h.replace(/^\uFEFF/, '').trim().toLowerCase());
  const idx: Record<string, number> = {};
  const missing: string[] = [];
  for (const [field, candidates] of Object.entries(fields)) {
    const i = candidates.map(c => norm.indexOf(c.toLowerCase())).find(v => v >= 0);
    if (i === undefined) missing.push(field);
    else idx[field] = i;
  }
  if (missing.length) throw new Error(`[SBA] ${label} CSV header missing expected columns: ${missing.join(', ')} — header: ${header.slice(0, 45).join(',')}`);
  return idx;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuote = !inQuote; }
    } else if (ch === ',' && !inQuote) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

async function streamCSVForZip(
  url: string,
  zip: string,
  fields: Record<string, string[]>,
  label: string,
): Promise<{ idx: Record<string, number>; rows: string[][] } | null> {
  const rows: string[][] = [];
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(30000),
      headers: { 'Accept': 'text/csv, */*', 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok || !res.body) {
      console.error(`[SBA] ${label} CSV fetch failed: HTTP ${res.status} for ${url}`);
      return null;
    }

    const nodeStream = (Readable as any).fromWeb
      ? (Readable as any).fromWeb(res.body)
      : Readable.from(res.body as any);

    const rl = createInterface({ input: nodeStream, crlfDelay: Infinity });
    let idx: Record<string, number> | null = null;

    for await (const line of rl) {
      if (!idx) {
        idx = resolveColumns(parseCSVLine(line), fields, label);
        continue;
      }
      if (!line.includes(zip)) continue;
      const cols = parseCSVLine(line);
      if ((cols[idx.borrzip] || '').replace(/\D/g, '').slice(0, 5) === zip) {
        rows.push(cols);
      }
    }
    if (!idx) return null;
    return { idx, rows };
  } catch (err) {
    console.error('[SBA] Stream error:', err instanceof Error ? err.message : err);
    return null;
  }
}

// Stream CSV for Cook County lender aggregation
async function streamCSVForCookCounty(
  url: string,
  fields: Record<string, string[]>,
  lenderField: string,
  minYear: number,
  label: string,
): Promise<Map<string, { count: number; total: number; minYear: number; maxYear: number }>> {
  const lenders = new Map<string, { count: number; total: number; minYear: number; maxYear: number }>();
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(45000),
      headers: { 'Accept': 'text/csv, */*', 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok || !res.body) {
      throw new Error(`[SBA City] ${label} CSV fetch failed: HTTP ${res.status} for ${url}`);
    }

    const nodeStream = (Readable as any).fromWeb
      ? (Readable as any).fromWeb(res.body)
      : Readable.from(res.body as any);

    const rl = createInterface({ input: nodeStream, crlfDelay: Infinity });
    let idx: Record<string, number> | null = null;

    for await (const line of rl) {
      if (!idx) {
        idx = resolveColumns(parseCSVLine(line), fields, label);
        continue;
      }
      // Quick pre-filter (case-insensitive; new CSVs quote every field, so
      // don't assume unquoted ",IL," delimiters)
      if (!/cook/i.test(line)) continue;

      const cols = parseCSVLine(line);
      if ((cols[idx.projectcounty] || '').toUpperCase().trim() !== 'COOK') continue;
      if ((cols[idx.projectstate] || '').trim() !== 'IL') continue;

      const year = parseInt(cols[idx.approvalfiscalyear] || '0');
      if (year < minYear) continue;

      const lender = (cols[idx[lenderField]] || '').trim();
      if (!lender) continue;

      const amount = parseFloat(cols[idx.grossapproval] || '0') || 0;
      const cur = lenders.get(lender) ?? { count: 0, total: 0, minYear: year, maxYear: year };
      lenders.set(lender, {
        count: cur.count + 1,
        total: cur.total + amount,
        minYear: Math.min(cur.minYear, year),
        maxYear: Math.max(cur.maxYear, year),
      });
    }
  } catch (err) {
    // Fail loudly — a silently-empty map would be cached for a week as
    // "no lenders" by the caller.
    console.error('[SBA City] Stream error:', err instanceof Error ? err.message : err);
    throw err;
  }
  return lenders;
}

function topLenders(rows: string[][], nameCol: number, amountCol: number, n = 5) {
  const map = new Map<string, { count: number; total: number }>();
  for (const r of rows) {
    const name = (r[nameCol] || 'Unknown').trim().replace(/^"(.+)"$/, '$1') || 'Unknown';
    const amt = parseFloat(r[amountCol]) || 0;
    const cur = map.get(name) ?? { count: 0, total: 0 };
    map.set(name, { count: cur.count + 1, total: cur.total + amt });
  }
  return [...map.entries()]
    .map(([name, s]) => ({ name, count: s.count, totalAmount: s.total }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

function parseDate(s: string): string | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export async function getSBALoans(zipCode: string) {
  const zip = zipCode.replace(/\D/g, '').slice(0, 5);
  if (!zip || zip.length < 5) return null;

  const cached = sbaCache.get(zip);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`[SBA] Cache hit for ZIP ${zip}`);
    return cached.data;
  }

  console.log(`[SBA] Streaming CSVs for ZIP ${zip}`);
  const start = Date.now();

  const { csv7a, csv504 } = loadSBAUrls();
  const [res7a, res504] = await Promise.all([
    streamCSVForZip(csv7a, zip, FIELDS_7A, '7(a)'),
    streamCSVForZip(csv504, zip, FIELDS_504, '504'),
  ]);

  // Fail loudly if either stream failed outright — a cached empty result
  // would show "no lending activity" for a week.
  if (!res7a || !res504) {
    throw new Error(`[SBA] CSV stream failed (7a: ${res7a ? 'ok' : 'failed'}, 504: ${res504 ? 'ok' : 'failed'}) — not caching`);
  }
  const { idx: i7, rows: rawRows7a } = res7a;
  const { idx: i5, rows: rawRows504 } = res504;

  // Both programs must cover the same window the UI advertises (FY2020–present).
  // The 7(a) source file already starts at FY2020, but the 504 file goes back
  // to FY2010 — without this filter, pre-2020 504 loans leak in under the
  // "FY2020–present" label and skew counts/amounts/lender rankings.
  const MIN_FY = 2020;
  const byMinFY = (idx: Record<string, number>) => (r: string[]) => {
    const fy = parseInt(r[idx.approvalfiscalyear] || '0');
    return fy >= MIN_FY;
  };
  const rows7a = rawRows7a.filter(byMinFY(i7));
  const rows504 = rawRows504.filter(byMinFY(i5));

  console.log(`[SBA] Done in ${Date.now() - start}ms — 7(a): ${rows7a.length} rows (${rawRows7a.length} raw), 504: ${rows504.length} rows (${rawRows504.length} raw)`);

  const loans7a = rows7a
    .map(r => ({
      borrowerName: r[i7.borrname] || '',
      address: r[i7.borrstreet] || '',
      city: r[i7.borrcity] || '',
      amount: parseFloat(r[i7.grossapproval]) || 0,
      approvalDate: parseDate(r[i7.approvaldate]),
      approvalYear: r[i7.approvalfiscalyear] ? parseInt(r[i7.approvalfiscalyear]) : null,
      naicsDescription: r[i7.naicsdescription] || '',
      jobsSupported: r[i7.jobssupported] ? parseInt(r[i7.jobssupported]) : 0,
      lender: r[i7.bankname] || '',
      loanStatus: r[i7.loanstatus] || '',
      subprogram: r[i7.subprogram] || '',
    }))
    .sort((a, b) => (b.approvalDate || '').localeCompare(a.approvalDate || ''));

  const loans504 = rows504
    .map(r => ({
      borrowerName: r[i5.borrname] || '',
      address: r[i5.borrstreet] || '',
      city: r[i5.borrcity] || '',
      amount: parseFloat(r[i5.grossapproval]) || 0,
      approvalDate: parseDate(r[i5.approvaldate]),
      approvalYear: r[i5.approvalfiscalyear] ? parseInt(r[i5.approvalfiscalyear]) : null,
      naicsDescription: r[i5.naicsdescription] || '',
      jobsSupported: r[i5.jobssupported] ? parseInt(r[i5.jobssupported]) : 0,
      lender: r[i5.cdc_name] || '',
      loanStatus: r[i5.loanstatus] || '',
    }))
    .sort((a, b) => (b.approvalDate || '').localeCompare(a.approvalDate || ''));

  const total7aAmount = loans7a.reduce((s, l) => s + l.amount, 0);
  const total504Amount = loans504.reduce((s, l) => s + l.amount, 0);

  const result = {
    zip,
    loans7a,
    loans504,
    summary: {
      total7aLoans: loans7a.length,
      total504Loans: loans504.length,
      total7aAmount,
      total504Amount,
      totalLoans: loans7a.length + loans504.length,
      totalAmount: total7aAmount + total504Amount,
      top7aLenders: topLenders(rows7a, i7.bankname, i7.grossapproval),
      top504Lenders: topLenders(rows504, i5.cdc_name, i5.grossapproval),
      yearRange: (() => {
        const years = [
          ...loans7a.map(l => l.approvalYear),
          ...loans504.map(l => l.approvalYear),
        ].filter(Boolean) as number[];
        return years.length ? { min: Math.min(...years), max: Math.max(...years) } : null;
      })(),
    },
  };

  sbaCache.set(zip, { data: result, timestamp: Date.now() });
  return result;
}

function mapToRanked(
  map: Map<string, { count: number; total: number; minYear: number; maxYear: number }>,
  sortBy: 'count' | 'avg',
  minDeals = 1
) {
  return [...map.entries()]
    .filter(([, s]) => s.count >= minDeals)
    .map(([name, s]) => ({
      name,
      dealCount: s.count,
      totalAmount: s.total,
      avgAmount: s.count > 0 ? Math.round(s.total / s.count) : 0,
      yearRange: s.minYear === s.maxYear ? `${s.minYear}` : `${s.minYear}–${s.maxYear}`,
    }))
    .sort((a, b) => sortBy === 'count' ? b.dealCount - a.dealCount : b.avgAmount - a.avgAmount)
    .slice(0, 25);
}

export async function getCookCountyCommercialLenders() {
  const cacheKey = 'cook-county-lenders';
  const cached = sbaCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log('[SBA City] Cache hit');
    return cached.data;
  }

  const currentYear = new Date().getFullYear();
  const minYear = currentYear - 5; // last 5 fiscal years
  console.log(`[SBA City] Streaming Cook County lenders (FY >= ${minYear})`);
  const start = Date.now();

  const { csv7a, csv504 } = loadSBAUrls();
  const [lenders7a, lenders504] = await Promise.all([
    streamCSVForCookCounty(csv7a, FIELDS_7A, 'bankname', minYear, '7(a)'),
    streamCSVForCookCounty(csv504, FIELDS_504, 'cdc_name', minYear, '504'),
  ]);

  console.log(`[SBA City] Done in ${Date.now() - start}ms — 7(a) lenders: ${lenders7a.size}, 504 lenders: ${lenders504.size}`);

  const result = {
    by7aDeals: mapToRanked(lenders7a, 'count'),
    by504Deals: mapToRanked(lenders504, 'count'),
    by7aAvg: mapToRanked(lenders7a, 'avg', 3),
    by504Avg: mapToRanked(lenders504, 'avg', 2),
    summary: {
      total7aLenders: lenders7a.size,
      total504Lenders: lenders504.size,
      total7aDeals: [...lenders7a.values()].reduce((s, l) => s + l.count, 0),
      total504Deals: [...lenders504.values()].reduce((s, l) => s + l.count, 0),
      yearsRange: `${minYear}–${currentYear}`,
    },
    builtAt: new Date().toISOString(),
  };

  sbaCache.set(cacheKey, { data: result, timestamp: Date.now() });
  return result;
}
