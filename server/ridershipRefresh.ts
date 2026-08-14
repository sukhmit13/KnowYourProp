import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RAIL_DATASET = 't2rn-p8d7';
const BUS_DATASET  = 'bynn-gwxy';
const BASE_URL     = 'https://data.cityofchicago.org/resource';
const PAGE_SIZE    = 50000;

export const RAIL_FILE = path.join(__dirname, 'data', 'cta_ridership.json');
export const BUS_FILE  = path.join(__dirname, 'data', 'cta_bus_ridership.json');

const REFRESH_INTERVAL_DAYS = 7;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours — safe for 32-bit setInterval

// Callbacks registered by routes.ts so cache can be cleared after refresh
const onRefreshComplete: Array<() => void> = [];
export function onRidershipRefresh(cb: () => void) {
  onRefreshComplete.push(cb);
}

// Use process-level flag so hot-reloads don't create duplicate schedulers
const g = global as any;

function fileAgeMs(filePath: string): number {
  try { return Date.now() - fs.statSync(filePath).mtimeMs; }
  catch { return Infinity; }
}

function needsRefresh(): boolean {
  const oldestMs = Math.max(fileAgeMs(RAIL_FILE), fileAgeMs(BUS_FILE));
  return oldestMs / (24 * 60 * 60 * 1000) > REFRESH_INTERVAL_DAYS;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchAll(dataset: string, order: string): Promise<any[]> {
  const rows: any[] = [];
  let offset = 0;
  while (true) {
    const params = new URLSearchParams({
      '$limit':  String(PAGE_SIZE),
      '$offset': String(offset),
      '$order':  order,
    });
    const resp = await fetch(`${BASE_URL}/${dataset}.json?${params}`, { signal: AbortSignal.timeout(60000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} from ${dataset}`);
    const page: any[] = await resp.json();
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
    await sleep(500);
  }
  return rows;
}

function toMonthKey(s: string) { return s.substring(0, 7); }

async function refreshRailRidership(): Promise<void> {
  console.log('[ridership-refresh] Fetching CTA rail ridership...');
  const rows = await fetchAll(RAIL_DATASET, 'station_id,month_beginning');
  const out: Record<string, any> = {};
  for (const r of rows) {
    const id = r.station_id; if (!id) continue;
    if (!out[id]) out[id] = { name: r.stationame || '', stationId: id, months: {} };
    const m = toMonthKey(r.month_beginning || ''); if (!m) continue;
    out[id].months[m] = {
      weekday:  Math.round(parseFloat(r.avg_weekday_rides || '0') * 10) / 10,
      saturday: Math.round(parseFloat(r.avg_saturday_rides || '0') * 10) / 10,
      sunday:   Math.round(parseFloat(r.avg_sunday_holiday_rides || '0') * 10) / 10,
      total:    parseInt(r.monthtotal || '0', 10),
    };
  }
  fs.writeFileSync(RAIL_FILE, JSON.stringify(out), 'utf-8');
  console.log(`[ridership-refresh] Rail done — ${Object.keys(out).length} stations, ${rows.length} rows`);
}

async function refreshBusRidership(): Promise<void> {
  console.log('[ridership-refresh] Fetching CTA bus ridership...');
  const rows = await fetchAll(BUS_DATASET, 'route,month_beginning');
  const out: Record<string, any> = {};
  for (const r of rows) {
    const route = r.route; if (!route) continue;
    if (!out[route]) out[route] = { route, routeName: r.routename || '', months: {} };
    const m = toMonthKey(r.month_beginning || ''); if (!m) continue;
    out[route].months[m] = {
      weekday:  Math.round(parseFloat(r.avg_weekday_rides || '0') * 10) / 10,
      saturday: Math.round(parseFloat(r.avg_saturday_rides || '0') * 10) / 10,
      sunday:   Math.round(parseFloat(r.avg_sunday_holiday_rides || '0') * 10) / 10,
      total:    parseInt(r.monthtotal || '0', 10),
    };
  }
  fs.writeFileSync(BUS_FILE, JSON.stringify(out), 'utf-8');
  console.log(`[ridership-refresh] Bus done — ${Object.keys(out).length} routes, ${rows.length} rows`);
}

async function runRefresh(): Promise<void> {
  if (g.__ridershipRefreshing) return;
  g.__ridershipRefreshing = true;
  try {
    await refreshRailRidership();
    await sleep(2000);
    await refreshBusRidership();
    console.log('[ridership-refresh] Complete — notifying cache clear');
    onRefreshComplete.forEach(cb => { try { cb(); } catch {} });
  } catch (err: any) {
    console.error('[ridership-refresh] Error:', err.message);
  } finally {
    g.__ridershipRefreshing = false;
  }
}

export function scheduleRidershipRefresh(): void {
  // Only register one scheduler across all hot-reloads
  if (g.__ridershipScheduled) {
    if (needsRefresh() && !g.__ridershipRefreshing) {
      console.log('[ridership-refresh] Hot-reload detected stale files — refreshing');
      runRefresh();
    }
    return;
  }
  g.__ridershipScheduled = true;

  if (needsRefresh()) {
    const ageDays = Math.round(Math.max(fileAgeMs(RAIL_FILE), fileAgeMs(BUS_FILE)) / (24 * 60 * 60 * 1000));
    console.log(`[ridership-refresh] Files are ${ageDays} days old — refreshing now`);
    runRefresh();
  } else {
    const daysUntil = Math.round(REFRESH_INTERVAL_DAYS - Math.max(fileAgeMs(RAIL_FILE), fileAgeMs(BUS_FILE)) / (24 * 60 * 60 * 1000));
    console.log(`[ridership-refresh] Files current — next refresh in ~${daysUntil} day(s)`);
  }

  setInterval(() => {
    if (needsRefresh() && !g.__ridershipRefreshing) {
      console.log('[ridership-refresh] Scheduled check: refreshing stale data');
      runRefresh();
    }
  }, CHECK_INTERVAL_MS);
}
