import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as turf from '@turf/turf';
import { and, asc, desc, eq, isNull, lt, lte, or, sql } from 'drizzle-orm';
import { db } from './db';
import {
  westTownTaxParcels,
  westTownTaxPilotSettings,
  westTownTaxSnapshots,
  type TaxYearEntry,
} from '@shared/schema';
import { scrapeTreasurerDataUncached } from './propertyTax';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSESSOR_API = 'https://datacatalog.cookcountyil.gov/resource/c49d-89sn.json';
const WEST_TOWN_COMMUNITY_AREA = 24;
const SETTINGS_ID = 1;
const SCAN_INTERVAL_MS = 60_000;
const RETRY_DELAY_MS = 30 * 60_000;
const MAX_UNKNOWN_ATTEMPTS = 3;
const IN_PROGRESS_LEASE_MS = 10 * 60_000;
const SCAN_BATCH_LIMIT = Math.max(0, Number.parseInt(process.env.WEST_TOWN_TAX_SCAN_BATCH_LIMIT || '0', 10) || 0);

type ConfirmedStatus = 'current' | 'delinquent' | 'sold';
type PropertyFilter = 'all' | ConfirmedStatus | 'unknown';
const westTownScope = eq(westTownTaxParcels.communityAreaNumber, WEST_TOWN_COMMUNITY_AREA);

interface AssessorParcel {
  pin?: string;
  property_address?: string;
  property_apt_no?: string;
  property_city?: string;
  property_zip?: string;
  latitude?: string;
  longitude?: string;
}

function formatPin(pin: string): string {
  const normalized = pin.replace(/\D/g, '');
  if (normalized.length !== 14) return pin;
  return `${normalized.slice(0, 2)}-${normalized.slice(2, 4)}-${normalized.slice(4, 7)}-${normalized.slice(7, 10)}-${normalized.slice(10)}`;
}

function treasurerUrl(pin: string): string {
  return `https://www.cookcountytreasurer.com/setsearchparameters.aspx?mode=PIN&searchpin=${formatPin(pin)}&isBusiness=false`;
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getWestTownFeature(): any {
  const sourcePath = path.join(__dirname, 'data', 'chicago_community_areas.geojson');
  const data = JSON.parse(fs.readFileSync(sourcePath, 'utf-8'));
  const feature = data.features?.find((candidate: any) => {
    const number = candidate.properties?.area_numbe ?? candidate.properties?.area_num_1;
    return String(number) === String(WEST_TOWN_COMMUNITY_AREA);
  });
  if (!feature) throw new Error('Official West Town community-area polygon was not found');
  return feature;
}

async function getSettings() {
  await db.insert(westTownTaxPilotSettings)
    .values({
      id: SETTINGS_ID,
      scanEnabled: process.env.WEST_TOWN_TAX_SCAN_ENABLED === 'true',
    })
    .onConflictDoNothing();

  const [settings] = await db.select()
    .from(westTownTaxPilotSettings)
    .where(eq(westTownTaxPilotSettings.id, SETTINGS_ID))
    .limit(1);
  if (!settings) throw new Error('Unable to initialize West Town tax pilot settings');
  return settings;
}

function buildAddress(record: AssessorParcel): string | null {
  const address = record.property_address?.trim();
  if (!address) return null;
  const unit = record.property_apt_no?.trim();
  return unit ? `${address} #${unit}` : address;
}

let seedPromise: Promise<{ seeded: boolean; parcelCount: number }> | null = null;

async function seedWestTownTaxPilotInternal(): Promise<{ seeded: boolean; parcelCount: number }> {
  const settings = await getSettings();
  if (settings.universeSeededAt) {
    const [row] = await db.select({ count: sql<number>`count(*)` })
      .from(westTownTaxParcels)
      .where(westTownScope);
    return { seeded: false, parcelCount: toNumber(row?.count) };
  }

  const polygon = getWestTownFeature();
  const [minLongitude, minLatitude, maxLongitude, maxLatitude] = turf.bbox(polygon);
  const rows: AssessorParcel[] = [];
  let offset = 0;
  const limit = 50_000;

  while (true) {
    const params = new URLSearchParams({
      '$select': 'pin,property_address,property_apt_no,property_city,property_zip,latitude,longitude',
      '$where': `property_city = 'CHICAGO' AND latitude between ${minLatitude} and ${maxLatitude} AND longitude between ${minLongitude} and ${maxLongitude}`,
      '$limit': String(limit),
      '$offset': String(offset),
    });
    const response = await fetch(`${ASSESSOR_API}?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) throw new Error(`Cook County Assessor seed query failed with HTTP ${response.status}`);

    const page: AssessorParcel[] = await response.json();
    rows.push(...page);
    if (page.length < limit) break;
    offset += limit;
  }

  const parcels = new Map<string, {
    pin: string;
    address: string | null;
    city: string | null;
    zipCode: string | null;
    latitude: string;
    longitude: string;
    communityAreaNumber: number;
    treasurerBillUrl: string;
  }>();

  for (const record of rows) {
    const pin = (record.pin ?? '').replace(/\D/g, '');
    const latitude = Number(record.latitude);
    const longitude = Number(record.longitude);
    if (pin.length !== 14 || !Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    if (!turf.booleanPointInPolygon(turf.point([longitude, latitude]), polygon)) continue;
    if (parcels.has(pin)) continue;

    parcels.set(pin, {
      pin,
      address: buildAddress(record),
      city: record.property_city?.trim() || null,
      zipCode: record.property_zip?.trim().slice(0, 5) || null,
      latitude: String(latitude),
      longitude: String(longitude),
      communityAreaNumber: WEST_TOWN_COMMUNITY_AREA,
      treasurerBillUrl: treasurerUrl(pin),
    });
  }

  const records = Array.from(parcels.values());
  for (let index = 0; index < records.length; index += 500) {
    await db.insert(westTownTaxParcels)
      .values(records.slice(index, index + 500))
      .onConflictDoNothing();
  }

  const now = new Date();
  await db.update(westTownTaxPilotSettings)
    .set({ universeSeededAt: now, lastActivityAt: now, lastError: null, updatedAt: now })
    .where(eq(westTownTaxPilotSettings.id, SETTINGS_ID));

  return { seeded: true, parcelCount: records.length };
}

export async function seedWestTownTaxPilot(): Promise<{ seeded: boolean; parcelCount: number }> {
  if (!seedPromise) {
    seedPromise = seedWestTownTaxPilotInternal().finally(() => {
      seedPromise = null;
    });
  }
  return seedPromise;
}

function amountDue(taxYears: TaxYearEntry[]): number {
  return taxYears.reduce((sum, year) => sum + Math.max(year.amountDue || 0, 0), 0);
}

function oldestUnpaidYear(taxYears: TaxYearEntry[]): number | null {
  const years = taxYears
    .filter(year => year.amountDue > 0)
    .map(year => year.year)
    .filter(Number.isFinite);
  return years.length ? Math.min(...years) : null;
}

async function claimNextParcel() {
  const now = new Date();
  const [candidate] = await db.select()
    .from(westTownTaxParcels)
    .where(
      and(
        westTownScope,
        or(
          eq(westTownTaxParcels.queueStatus, 'pending'),
          eq(westTownTaxParcels.statusSource, 'existing_property_tax_cache'),
          and(
            eq(westTownTaxParcels.queueStatus, 'retry_wait'),
            or(isNull(westTownTaxParcels.nextAttemptAt), lte(westTownTaxParcels.nextAttemptAt, now)),
          ),
        ),
      ),
    )
    .orderBy(asc(westTownTaxParcels.createdAt), asc(westTownTaxParcels.id))
    .limit(1);
  if (!candidate) return null;

  const [claimed] = await db.update(westTownTaxParcels)
    .set({
      queueStatus: 'in_progress',
      lastAttemptAt: now,
      attemptCount: sql`${westTownTaxParcels.attemptCount} + 1`,
      updatedAt: now,
    })
    .where(
      and(
        eq(westTownTaxParcels.id, candidate.id),
        or(
          eq(westTownTaxParcels.queueStatus, 'pending'),
          eq(westTownTaxParcels.queueStatus, 'retry_wait'),
          eq(westTownTaxParcels.statusSource, 'existing_property_tax_cache'),
        ),
      ),
    )
    .returning();
  return claimed ?? null;
}

async function scanBatchLimitReached(): Promise<boolean> {
  if (!SCAN_BATCH_LIMIT) return false;
  const [row] = await db.select({ count: sql<number>`count(*)` })
    .from(westTownTaxParcels)
    .where(and(
      westTownScope,
      eq(westTownTaxParcels.statusSource, 'pilot_scan'),
      or(
        eq(westTownTaxParcels.queueStatus, 'checked'),
        eq(westTownTaxParcels.queueStatus, 'unknown'),
      ),
    ));
  return toNumber(row?.count) >= SCAN_BATCH_LIMIT;
}

async function recoverAbandonedInProgressParcels(): Promise<void> {
  const now = new Date();
  const leaseExpiredAt = new Date(now.getTime() - IN_PROGRESS_LEASE_MS);
  await db.update(westTownTaxParcels)
    .set({
      queueStatus: 'retry_wait',
      nextAttemptAt: now,
      lastError: 'Recovered after an interrupted Treasurer scan; retry scheduled.',
      updatedAt: now,
    })
    .where(
      and(
        westTownScope,
        eq(westTownTaxParcels.queueStatus, 'in_progress'),
        or(isNull(westTownTaxParcels.lastAttemptAt), lt(westTownTaxParcels.lastAttemptAt, leaseExpiredAt)),
      ),
    );
}

async function recordAttempt(parcel: NonNullable<Awaited<ReturnType<typeof claimNextParcel>>>) {
  const checkedAt = new Date();
  try {
    const result = await scrapeTreasurerDataUncached(parcel.pin);
    const taxYears = result.taxYears ?? [];
    const status = result.paymentStatus;
    const confirmed = (status === 'current' || status === 'delinquent' || status === 'sold') && taxYears.length > 0;
    const due = amountDue(taxYears);
    const oldestYear = oldestUnpaidYear(taxYears);
    const errorMessage = confirmed ? null : 'Treasurer returned no bill detail';
    const terminalUnknown = parcel.attemptCount >= MAX_UNKNOWN_ATTEMPTS;
    const nextStatus = confirmed ? 'checked' : (terminalUnknown ? 'unknown' : 'retry_wait');

    await db.transaction(async tx => {
      await tx.insert(westTownTaxSnapshots).values({
        parcelId: parcel.id,
        pin: parcel.pin,
        attemptNumber: parcel.attemptCount,
        outcome: confirmed ? status : 'unknown',
        amountDue: confirmed ? String(due) : null,
        oldestUnpaidYear: confirmed ? oldestYear : null,
        taxYearsJson: taxYears as any,
        treasurerBillUrl: parcel.treasurerBillUrl,
        errorMessage,
        checkedAt,
      });

      await tx.update(westTownTaxParcels)
        .set({
          queueStatus: nextStatus,
          nextAttemptAt: confirmed || terminalUnknown ? null : new Date(checkedAt.getTime() + RETRY_DELAY_MS),
          lastCheckedAt: checkedAt,
          lastError: errorMessage,
          currentStatus: confirmed ? status : 'unknown',
          currentAmountDue: confirmed ? String(due) : null,
          oldestUnpaidYear: confirmed ? oldestYear : null,
          taxYearsJson: taxYears as any,
          statusSource: 'pilot_scan',
          treasurerBillUrl: parcel.treasurerBillUrl,
          updatedAt: checkedAt,
        })
        .where(and(westTownScope, eq(westTownTaxParcels.id, parcel.id)));

      await tx.update(westTownTaxPilotSettings)
        .set({ lastActivityAt: checkedAt, lastError: errorMessage, updatedAt: checkedAt })
        .where(eq(westTownTaxPilotSettings.id, SETTINGS_ID));
    });
  } catch (error: any) {
    const errorMessage = error?.message || 'Treasurer scan failed unexpectedly';
    const terminalUnknown = parcel.attemptCount >= MAX_UNKNOWN_ATTEMPTS;
    await db.transaction(async tx => {
      await tx.insert(westTownTaxSnapshots).values({
        parcelId: parcel.id,
        pin: parcel.pin,
        attemptNumber: parcel.attemptCount,
        outcome: 'error',
        treasurerBillUrl: parcel.treasurerBillUrl,
        errorMessage,
        checkedAt,
      });
      await tx.update(westTownTaxParcels)
        .set({
          queueStatus: terminalUnknown ? 'unknown' : 'retry_wait',
          nextAttemptAt: terminalUnknown ? null : new Date(checkedAt.getTime() + RETRY_DELAY_MS),
          lastCheckedAt: checkedAt,
          lastError: errorMessage,
          currentStatus: 'unknown',
          statusSource: 'pilot_scan',
          updatedAt: checkedAt,
        })
        .where(and(westTownScope, eq(westTownTaxParcels.id, parcel.id)));
      await tx.update(westTownTaxPilotSettings)
        .set({ lastActivityAt: checkedAt, lastError: errorMessage, updatedAt: checkedAt })
        .where(eq(westTownTaxPilotSettings.id, SETTINGS_ID));
    });
    console.error(`[WEST-TOWN TAX] Scan failed for ${parcel.pin}:`, errorMessage);
  }
}

async function scanOneWestTownParcel(): Promise<void> {
  const g = global as typeof globalThis & { __westTownTaxScanRunning?: boolean };
  if (g.__westTownTaxScanRunning) return;
  g.__westTownTaxScanRunning = true;

  try {
    const settings = await getSettings();
    if (!settings.scanEnabled) return;
    await seedWestTownTaxPilot();
    if (await scanBatchLimitReached()) {
      console.log(`[WEST-TOWN TAX] Scan batch limit reached (${SCAN_BATCH_LIMIT}); leaving remaining parcels queued.`);
      return;
    }
    await recoverAbandonedInProgressParcels();
    const parcel = await claimNextParcel();
    if (!parcel) return;

    const now = new Date();
    await db.update(westTownTaxPilotSettings)
      .set({ lastScannerStartedAt: now, lastActivityAt: now, updatedAt: now })
      .where(eq(westTownTaxPilotSettings.id, SETTINGS_ID));
    await recordAttempt(parcel);
  } catch (error: any) {
    const now = new Date();
    console.error('[WEST-TOWN TAX] Scanner tick failed:', error?.message || error);
    await db.update(westTownTaxPilotSettings)
      .set({ lastActivityAt: now, lastError: error?.message || 'Scanner tick failed', updatedAt: now })
      .where(eq(westTownTaxPilotSettings.id, SETTINGS_ID))
      .catch(() => {});
  } finally {
    g.__westTownTaxScanRunning = false;
  }
}

export function scheduleWestTownTaxPilot(): void {
  const g = global as typeof globalThis & { __westTownTaxScanScheduled?: boolean };
  if (g.__westTownTaxScanScheduled) return;
  g.__westTownTaxScanScheduled = true;

  // Building the parcel universe uses the public Assessor dataset only. The
  // paid CAPTCHA-backed Treasurer scan remains paused unless an operator sets
  // WEST_TOWN_TAX_SCAN_ENABLED=true and restarts the app.
  const configuredState = process.env.WEST_TOWN_TAX_SCAN_ENABLED;
  if (configuredState === 'true' || configuredState === 'false') {
    const now = new Date();
    void getSettings()
      .then(() => db.update(westTownTaxPilotSettings)
        .set({ scanEnabled: configuredState === 'true', updatedAt: now })
        .where(eq(westTownTaxPilotSettings.id, SETTINGS_ID)))
      .then(() => { if (configuredState === 'true') void scanOneWestTownParcel(); })
      .catch(error => console.error('[WEST-TOWN TAX] Scan configuration failed:', error?.message || error));
  }
  void seedWestTownTaxPilot().catch(error => {
    console.error('[WEST-TOWN TAX] Initial universe seed failed:', error?.message || error);
  });
  setInterval(() => { void scanOneWestTownParcel(); }, SCAN_INTERVAL_MS);
  void scanOneWestTownParcel();
}

export async function getWestTownTaxPilotSummary() {
  const settings = await getSettings();
  const [counts] = await db.select({
    total: sql<number>`count(*)`,
    confirmed: sql<number>`count(*) filter (where ${westTownTaxParcels.queueStatus} = 'checked')`,
    pending: sql<number>`count(*) filter (where ${westTownTaxParcels.queueStatus} in ('pending', 'in_progress'))`,
    delinquent: sql<number>`count(*) filter (where ${westTownTaxParcels.queueStatus} = 'checked' and ${westTownTaxParcels.currentStatus} = 'delinquent')`,
    sold: sql<number>`count(*) filter (where ${westTownTaxParcels.queueStatus} = 'checked' and ${westTownTaxParcels.currentStatus} = 'sold')`,
    current: sql<number>`count(*) filter (where ${westTownTaxParcels.queueStatus} = 'checked' and ${westTownTaxParcels.currentStatus} = 'current')`,
    unknown: sql<number>`count(*) filter (where ${westTownTaxParcels.queueStatus} in ('unknown', 'retry_wait'))`,
    lastConfirmedAt: sql<Date | null>`max(${westTownTaxParcels.lastCheckedAt}) filter (where ${westTownTaxParcels.queueStatus} = 'checked')`,
  }).from(westTownTaxParcels).where(and(
    westTownScope,
    eq(westTownTaxParcels.statusSource, 'pilot_scan'),
  ));

  const total = toNumber(counts?.total);
  const confirmed = toNumber(counts?.confirmed);
  return {
    geography: { name: 'West Town', communityAreaNumber: WEST_TOWN_COMMUNITY_AREA, source: 'Official Chicago community-area boundary' },
    scanEnabled: settings.scanEnabled,
    universeSeededAt: settings.universeSeededAt,
    lastScannerStartedAt: settings.lastScannerStartedAt,
    lastActivityAt: settings.lastActivityAt,
    lastError: settings.lastError,
    totalParcels: total,
    confirmedParcels: confirmed,
    coveragePercent: total > 0 ? Math.round((confirmed / total) * 10_000) / 100 : 0,
    pendingParcels: toNumber(counts?.pending),
    delinquentParcels: toNumber(counts?.delinquent),
    soldTaxParcels: toNumber(counts?.sold),
    currentParcels: toNumber(counts?.current),
    unknownOrRetryingParcels: toNumber(counts?.unknown),
    lastConfirmedAt: counts?.lastConfirmedAt ?? null,
  };
}

function resultCondition(filter: PropertyFilter) {
  const visible = or(
    eq(westTownTaxParcels.queueStatus, 'checked'),
    eq(westTownTaxParcels.queueStatus, 'unknown'),
    eq(westTownTaxParcels.queueStatus, 'retry_wait'),
  );
  if (filter === 'all') return visible;
  if (filter === 'unknown') {
    return and(visible, or(
      eq(westTownTaxParcels.currentStatus, 'unknown'),
      eq(westTownTaxParcels.queueStatus, 'unknown'),
      eq(westTownTaxParcels.queueStatus, 'retry_wait'),
    ));
  }
  return and(
    eq(westTownTaxParcels.queueStatus, 'checked'),
    eq(westTownTaxParcels.currentStatus, filter),
  );
}

export async function listWestTownTaxPilotProperties(
  filter: PropertyFilter = 'all',
  page = 1,
  pageSize = 25,
) {
  const where = and(
    westTownScope,
    eq(westTownTaxParcels.statusSource, 'pilot_scan'),
    resultCondition(filter),
  );
  const safePage = Math.max(1, Math.floor(page));
  const safePageSize = Math.min(100, Math.max(1, Math.floor(pageSize)));
  const offset = (safePage - 1) * safePageSize;
  const [totalRow] = await db.select({ count: sql<number>`count(*)` })
    .from(westTownTaxParcels)
    .where(where);
  const rows = await db.select({
    pin: westTownTaxParcels.pin,
    address: westTownTaxParcels.address,
    zipCode: westTownTaxParcels.zipCode,
    queueStatus: westTownTaxParcels.queueStatus,
    paymentStatus: westTownTaxParcels.currentStatus,
    amountDue: westTownTaxParcels.currentAmountDue,
    oldestUnpaidYear: westTownTaxParcels.oldestUnpaidYear,
    lastCheckedAt: westTownTaxParcels.lastCheckedAt,
    lastError: westTownTaxParcels.lastError,
    statusSource: westTownTaxParcels.statusSource,
    treasurerBillUrl: westTownTaxParcels.treasurerBillUrl,
  })
    .from(westTownTaxParcels)
    .where(where)
    .orderBy(desc(westTownTaxParcels.lastCheckedAt), asc(westTownTaxParcels.address), asc(westTownTaxParcels.pin))
    .limit(safePageSize)
    .offset(offset);

  return {
    filter,
    page: safePage,
    pageSize: safePageSize,
    total: toNumber(totalRow?.count),
    properties: rows,
  };
}
