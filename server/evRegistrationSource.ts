import { load } from 'cheerio';

export const EV_SOURCE_URL = 'https://www.ilsos.gov/departments/vehicles/statistics/electric.html';
export interface EVReportLink { year: number; month: number; url: string }
export interface EVReport extends EVReportLink {
  reportDate: string;
  cookCounty: number;
  chicago: number;
  zipCounts: Record<string, number>;
  zipTableComplete: boolean;
  sourceLastModified?: string;
}

export function discoverEVReports(html: string): EVReportLink[] {
  const $ = load(html);
  const reports = new Map<string, EVReportLink>();
  $('a[href]').each((_, element) => {
    const url = new URL($(element).attr('href')!, EV_SOURCE_URL);
    const match = url.pathname.match(/\/electric\/(\d{4})\/electric(\d{2})(\d{2})(\d{2})\.pdf$/i);
    if (!match || url.protocol !== 'https:' || url.hostname !== 'www.ilsos.gov') return;
    const year = Number(match[1]), month = Number(match[2]);
    if (month < 1 || month > 12 || Number(match[4]) !== year % 100) return;
    const key = `${year}-${month}`;
    if (reports.has(key) && reports.get(key)!.url !== url.href) throw new Error(`Ambiguous EV report links for ${key}`);
    reports.set(key, { year, month, url: url.href });
  });
  if (!reports.size) throw new Error('No official EV report links found');
  return Array.from(reports.values()).sort((a, b) => a.year - b.year || a.month - b.month);
}

export function parseEVReport(text: string, link: EVReportLink, sourceLastModified?: string, allowMissingZipCounts = false): EVReport {
  // Accept native PDF text and agent-extracted Markdown tables used for a verified backfill.
  const lines = text.replace(/\|/g, ' ').split(/\r?\n/).map(line => line.trim().replace(/\.{2,}/g, ' ').replace(/\s+/g, ' '));
  const date = lines.join('\n').match(/COUNTY TOTALS AS OF\s*(\d{2})\/(\d{2})\/(\d{4})/i);
  const zipDate = lines.join('\n').match(/ZIP\s*CODE TOTALS AS OF\s*(\d{2})\/(\d{2})\/(\d{4})/i);
  if (!date || !zipDate || date.slice(1).join('-') !== zipDate.slice(1).join('-') ||
      Number(date[1]) !== link.month || Number(date[3]) !== link.year) throw new Error('EV report date does not match its published month');
  const iso = `${date[3]}-${date[1]}-${date[2]}`;
  if (new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) !== iso) throw new Error('Invalid EV report date');
  const count = (value: string) => {
    const n = Number(value.replace(/,/g, ''));
    if (!Number.isSafeInteger(n) || n < 0) throw new Error('Invalid EV registration count');
    return n;
  };
  const zipStart = lines.findIndex(line => /ZIP\s*CODE TOTALS AS OF/i.test(line));
  const countyLines = lines.slice(0, zipStart);
  const countyRow = countyLines.find(line => /^COOK\s+[\d,]+$/.test(line));
  const chicagoRow = countyLines.find(line => /^CHICAGO\s+[\d,]+$/.test(line));
  if (!countyRow || !chicagoRow) throw new Error('Official Cook County or Chicago total missing');
  const cookCounty = count(countyRow.split(' ').at(-1)!);
  const chicago = count(chicagoRow.split(' ').at(-1)!);
  if (cookCounty < 1000 || chicago < 100 || chicago > cookCounty) throw new Error('EV county totals failed sanity checks');
  const zipCounts: Record<string, number> = {};
  let parsedRows = 0;
  const missingRegionalCounts: string[] = [];
  for (const line of lines.slice(zipStart + 1)) {
    const missing = line.match(/^(.+?)\s+(\d{5})$/);
    if (missing) {
      parsedRows++;
      if (/^60[678]/.test(missing[2])) missingRegionalCounts.push(missing[2]);
      continue;
    }
    const row = line.match(/^(.+?)\s+(\d{5})\s+([\d,]+)$/);
    if (!row) continue;
    parsedRows++;
    const zip = row[2];
    if (!/^60[678]/.test(zip)) continue;
    if (Object.hasOwn(zipCounts, zip)) throw new Error(`Duplicate EV ZIP row ${zip}`);
    zipCounts[zip] = count(row[3]);
  }
  if (parsedRows < 500 || Object.keys(zipCounts).length < 40) throw new Error('EV ZIP table incomplete');
  if (missingRegionalCounts.length && !allowMissingZipCounts) throw new Error('EV ZIP count cells could not be read; prior data retained');
  return { ...link, reportDate: iso, cookCounty, chicago, zipCounts, sourceLastModified, zipTableComplete: !missingRegionalCounts.length };
}

/** No URLs containing credentials, response bodies, or provider errors are logged. */
export async function fetchEVSource(url: string): Promise<{ body: Buffer; lastModified?: string }> {
  const source = new URL(url);
  if (source.protocol !== 'https:' || source.hostname !== 'www.ilsos.gov' ||
      !(url === EV_SOURCE_URL || /^\/content\/dam\/departments\/vehicles\/statistics\/electric\/\d{4}\/electric\d{6}\.pdf$/.test(source.pathname))) {
    throw new Error('Unapproved EV source URL');
  }
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (response.ok) {
      const body = Buffer.from(await response.arrayBuffer());
      if (body.length > 10_000_000) throw new Error('EV source exceeds size limit');
      return { body, lastModified: response.headers.get('last-modified') ?? undefined };
    }
  } catch { /* Retry the same official source through the existing proxy. */ }
  const key = process.env.SCRAPINGBEE_API_KEY;
  if (!key) throw new Error('EV source blocked; SCRAPINGBEE_API_KEY is required');
  const proxy = new URL('https://app.scrapingbee.com/api/v1/');
  proxy.search = new URLSearchParams({ api_key: key, url, render_js: 'false' }).toString();
  let response: Response;
  try { response = await fetch(proxy, { signal: AbortSignal.timeout(65_000) }); }
  catch { throw new Error('EV source proxy request timed out or failed'); }
  if (!response.ok) throw new Error(`EV source proxy HTTP ${response.status}${response.status === 401 ? ' — replace the configured scraping credential' : ''}`);
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length > 10_000_000) throw new Error('EV source exceeds size limit');
  // Proxy response timestamps are not the origin's publication timestamps.
  return { body };
}

export async function downloadEVReport(link: EVReportLink): Promise<EVReport> {
  const { body, lastModified } = await fetchEVSource(link.url);
  if (!body.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('EV source did not return a PDF');
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: body, verbosity: 0 });
  try { return parseEVReport((await parser.getText()).text, link, lastModified); }
  finally { await parser.destroy(); }
}