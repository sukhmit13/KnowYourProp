import fs from 'fs';
import path from 'path';
import { discoverEVReports, downloadEVReport, EV_SOURCE_URL, fetchEVSource, type EVReport } from './evRegistrationSource';

export interface EVPoint { year: number; month: number; count: number }
export interface EVData {
  lastUpdated: string;
  dataSource: string;
  sourceUrl: string;
  note?: string;
  cookCountyMonthly: EVPoint[];
  chicagoMonthly: EVPoint[];
  byZipCode: Record<string, EVPoint[]>;
  reports?: Record<string, { url: string; reportDate: string; sourceLastModified?: string; zipTableComplete: boolean }>;
  refresh?: { lastCheckedAt?: string; nextCheckAt: string; lateChecks: number; lastError?: string };
}
export const EV_DATA_FILE = path.join(process.cwd(), 'server', 'data', 'ev_registrations.json');
export const EV_CHECK_DAY = 19;
const globalState = global as typeof global & { __evRegistrationRefresh?: Promise<void> };
const key = (point: { year: number; month: number }) => `${point.year}-${String(point.month).padStart(2, '0')}`;

function chicagoDate(now: Date) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(now);
  const get = (name: string) => Number(parts.find(part => part.type === name)!.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}
function chicagoSix(year: number, month: number, day: number): Date {
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hourCycle: 'h23' }).format(date));
  return new Date(date.getTime() - (hour - 6) * 3_600_000);
}
export function nextEVMonthlyCheck(now: Date): Date {
  const { year, month } = chicagoDate(now);
  const current = chicagoSix(year, month, EV_CHECK_DAY);
  return current > now ? current : chicagoSix(year, month + 1, EV_CHECK_DAY);
}
function nextEVRetry(now: Date) {
  const { year, month, day } = chicagoDate(now);
  return chicagoSix(year, month, day + 1);
}
function writeData(file: string, data: EVData) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
  fs.renameSync(tmp, file);
}
export function mergeEVReports(original: EVData, reports: EVReport[], now: Date): EVData {
  const data = structuredClone(original);
  data.reports ??= {};
  const trackedZips = new Set(Object.keys(original.byZipCode));
  const upsert = (series: EVPoint[], report: EVReport, count: number) => {
    const index = series.findIndex(point => key(point) === key(report));
    const point = { year: report.year, month: report.month, count };
    if (index < 0) series.push(point); else series[index] = point;
    series.sort((a, b) => a.year - b.year || a.month - b.month);
  };
  for (const report of reports) {
    const previousZips = Object.entries(data.byZipCode).filter(([, rows]) =>
      rows.some(row => key(row) === key(report))).map(([zip]) => zip);
    if (previousZips.some(zip => !Object.hasOwn(report.zipCounts, zip))) throw new Error('EV refresh would erase an existing monthly ZIP observation');
    upsert(data.cookCountyMonthly, report, report.cookCounty);
    upsert(data.chicagoMonthly, report, report.chicago);
    for (const [zip, count] of Object.entries(report.zipCounts)) {
      if (!trackedZips.has(zip)) continue;
      upsert(data.byZipCode[zip] ??= [], report, count);
    }
    data.reports[key(report)] = { url: report.url, reportDate: report.reportDate, sourceLastModified: report.sourceLastModified, zipTableComplete: report.zipTableComplete };
  }
  if (reports.length) data.lastUpdated = now.toISOString();
  data.sourceUrl = EV_SOURCE_URL;
  data.dataSource = 'Illinois Secretary of State - Electric Vehicle Statistics';
  data.note = 'Official monthly county and ZIP report observations; missing ZIP months are not filled or interpolated.';
  return data;
}

export function importEVReports(reports: EVReport[], file = EV_DATA_FILE, now = new Date()) {
  const previous: EVData = JSON.parse(fs.readFileSync(file, 'utf8'));
  const data = mergeEVReports(previous, reports, now);
  data.refresh = { lastCheckedAt: now.toISOString(), nextCheckAt: nextEVMonthlyCheck(now).toISOString(), lateChecks: 0 };
  writeData(file, data);
  return data;
}

export function refreshEVRegistrations(force = false): Promise<void> {
  if (globalState.__evRegistrationRefresh) return globalState.__evRegistrationRefresh;
  globalState.__evRegistrationRefresh = runEVRefresh({ force }).finally(() => { globalState.__evRegistrationRefresh = undefined; });
  return globalState.__evRegistrationRefresh;
}
export async function runEVRefresh({
  force = false, file = EV_DATA_FILE, now = new Date(),
  fetchIndex = fetchEVSource, download = downloadEVReport,
} = {}) {
  const previous: EVData = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!force && previous.refresh && new Date(previous.refresh.nextCheckAt) > now) return;
  const lateChecks = (previous.refresh?.lateChecks ?? 0) + 1;
  const retry = lateChecks < 14 ? nextEVRetry(now) : nextEVMonthlyCheck(now);
  try {
    const index = await fetchIndex(EV_SOURCE_URL);
    const { year, month, day } = chicagoDate(now);
    const latestAllowed = `${year}-${String(month).padStart(2, '0')}`;
    // Before the check day, the previous month's report is the expected vintage.
    const expectedPeriod = new Date(Date.UTC(year, month - 1 - (day < EV_CHECK_DAY ? 1 : 0), 1)).toISOString().slice(0, 7);
    const links = discoverEVReports(index.body.toString('utf8')).filter(link => key(link) <= latestAllowed);
    // Preserve audited history; fetch new months and retry explicitly incomplete backfills.
    const first = previous.cookCountyMonthly.map(key).sort()[0];
    if (!first) throw new Error('Verified EV history is missing');
    const missing = links.filter(link => key(link) >= first &&
      (!previous.cookCountyMonthly.some(point => key(point) === key(link)) ||
       previous.reports?.[key(link)]?.zipTableComplete === false));
    const reports: EVReport[] = [];
    for (const link of missing) reports.push(await download(link));
    const current: EVData = JSON.parse(fs.readFileSync(file, 'utf8'));
    const data = mergeEVReports(current, reports, now);
    const currentPublished = data.cookCountyMonthly.some(point => key(point) === expectedPeriod);
    data.refresh = {
      lastCheckedAt: now.toISOString(), nextCheckAt: (currentPublished ? nextEVMonthlyCheck(now) : retry).toISOString(),
      lateChecks: currentPublished ? 0 : lateChecks,
    };
    writeData(file, data);
    console.log(`[ev-refresh] Imported ${reports.length} report(s); latest ${data.cookCountyMonthly.map(key).sort().at(-1)}; next check ${data.refresh.nextCheckAt}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'EV refresh failed';
    const current: EVData = JSON.parse(fs.readFileSync(file, 'utf8'));
    // A manual backfill may have completed while this network request was pending.
    if (current.lastUpdated === previous.lastUpdated) {
      current.refresh = { ...current.refresh, lastCheckedAt: now.toISOString(), nextCheckAt: retry.toISOString(), lateChecks, lastError: message };
      writeData(file, current);
    }
    throw error;
  }
}