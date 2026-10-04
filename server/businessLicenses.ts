import * as turf from '@turf/turf';
import { licenseComparisonDates, compareCorridorLicenses } from '@shared/corridorLicenseComparison';
import {
  groupLicenseEstablishments,
  type LicenseCategory,
  type NearbyLicense,
  type NearbyLicensesResponse,
} from '@shared/businessLicenses';

interface RawLicense {
  id: string;
  license_id: string;
  legal_name: string;
  doing_business_as_name: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  license_description: string;
  license_start_date: string;
  license_status: string;
  latitude: string;
  longitude: string;
  application_type: string;
  business_activity: string;
}

export type { NearbyLicense, NearbyLicensesResponse } from '@shared/businessLicenses';

let cachedLicenses: RawLicense[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 6 * 60 * 60 * 1000;

const LICENSE_TYPES = [
  'Liquor License',
  'Retail Food Establishment',
  'Tavern',
  'Package Goods',
  'Consumption on Premises - Incidental Activity',
  'Manufacturing Establishment',
  'Public Place of Amusement',
  'Late Hour',
  'Outdoor Patio',
];

function categorizeLicense(desc: string, activity?: string): LicenseCategory {
  const upper = desc.toUpperCase();
  const actUpper = (activity || '').toUpperCase();
  if (actUpper.includes('SALE OF ART')) {
    return 'gallery';
  }
  if (actUpper.includes('HOTEL')) {
    return 'hotel';
  }
  if (upper.includes('LIQUOR') || upper.includes('TAVERN') || upper.includes('PACKAGE GOODS') || upper.includes('CONSUMPTION ON PREMISES') || upper.includes('LATE HOUR')) {
    return 'liquor';
  }
  if (upper.includes('RETAIL FOOD') || upper.includes('FOOD')) {
    return 'food';
  }
  if (upper.includes('PUBLIC PLACE OF AMUSEMENT') || upper.includes('OUTDOOR PATIO')) {
    return 'entertainment';
  }
  if (upper.includes('MANUFACTURING')) {
    return 'manufacturing';
  }
  return 'other';
}

async function fetchRecentLicenses(): Promise<RawLicense[]> {
  if (cachedLicenses && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedLicenses;
  }

  const { historyStart: startDate, end: endDate } = licenseComparisonDates();

  const licenseFilter = LICENSE_TYPES.map(t => `license_description='${t}'`).join(' OR ');
  const whereClause = encodeURIComponent(
    `license_status='AAI' AND application_type='ISSUE' AND license_start_date>='${startDate}' AND license_start_date<'${endDate}' AND (${licenseFilter})`
  );
  const selectFields = encodeURIComponent(
    'id,license_id,legal_name,doing_business_as_name,address,city,state,zip_code,license_description,business_activity,license_start_date,license_status,latitude,longitude,application_type'
  );

  const allLicenses: RawLicense[] = [];
  const pageSize = 2000;

  const BUSINESS_ACTIVITY_TYPES = [
    'Hotel - 7 or More Sleeping Rooms',
    'Sale of Art',
  ];
  const activityFilter = BUSINESS_ACTIVITY_TYPES.map(t => `business_activity='${t}'`).join(' OR ');
  const activityWhereClause = encodeURIComponent(
    `license_status='AAI' AND application_type='ISSUE' AND license_start_date>='${startDate}' AND license_start_date<'${endDate}' AND (${activityFilter})`
  );

  const queries = [
    { where: whereClause, label: 'license_description' },
    { where: activityWhereClause, label: 'business_activity' },
  ];

  for (const q of queries) {
    let offset = 0;
    let hasMore = true;
    while (hasMore) {
      const url = `https://data.cityofchicago.org/resource/r5kz-chrr.json?$select=${selectFields}&$where=${q.where}&$limit=${pageSize}&$offset=${offset}&$order=license_start_date%20DESC,id%20ASC`;
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
        if (!response.ok) throw new Error(`API returned ${response.status} for ${q.label}`);
        const data = await response.json() as RawLicense[];
        allLicenses.push(...data);
        if (data.length < pageSize) {
          hasMore = false;
        } else {
          offset += pageSize;
        }
      } catch (err) {
        console.error(`[BUSINESS LICENSES] Error fetching ${q.label}:`, (err as Error).message);
        throw new Error(`Could not load complete business license data (${q.label})`);
      }
    }
  }

  const seen = new Map<string, RawLicense>();
  for (const l of allLicenses) {
    const key = l.id || `${l.license_id}|${l.license_start_date}|${l.doing_business_as_name || l.legal_name}|${l.address}`;
    const existing = seen.get(key);
    if (!existing || (l.license_start_date || '') > (existing.license_start_date || '')) {
      seen.set(key, l);
    }
  }
  const deduped = Array.from(seen.values());

  console.log(`[BUSINESS LICENSES] Fetched ${allLicenses.length} raw, deduplicated to ${deduped.length} (last 36 months)`);
  cachedLicenses = deduped;
  cacheTimestamp = Date.now();
  return deduped;
}

export async function getNearbyBusinessLicenses(lat: number, lng: number, radiusMiles = 1, includeHistory = false): Promise<NearbyLicensesResponse> {
  const licenses = await fetchRecentLicenses();
  const fromPoint = turf.point([lng, lat]);
  const nearby: NearbyLicense[] = [];
  const { currentStart: currentDate, priorStart: priorDate, end: endDate } = licenseComparisonDates();

  for (const l of licenses) {
    const pLat = parseFloat(l.latitude);
    const pLng = parseFloat(l.longitude);
    if (isNaN(pLat) || isNaN(pLng)) continue;

    const toPoint = turf.point([pLng, pLat]);
    const dist = turf.distance(fromPoint, toPoint, { units: 'miles' });
    if (dist <= radiusMiles) {
      nearby.push({
        businessName: l.doing_business_as_name || l.legal_name || 'Unknown',
        address: l.address || 'Address unavailable',
        licenseType: l.license_description || '',
        licenseCategory: categorizeLicense(l.license_description || '', l.business_activity || ''),
        startDate: l.license_start_date?.substring(0, 10) || '',
        distanceMiles: Math.round(dist * 100) / 100,
        latitude: pLat,
        longitude: pLng,
      });
    }
  }

  const currentLicenses = nearby.filter((license) => license.startDate >= currentDate && license.startDate < endDate);
  const priorLicenses = nearby.filter((license) => license.startDate >= priorDate && license.startDate < currentDate);

  currentLicenses.sort((a, b) => {
    const distDiff = a.distanceMiles - b.distanceMiles;
    if (distDiff !== 0) return distDiff;
    return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
  });

  return {
    licenses: currentLicenses,
    totalCount: groupLicenseEstablishments(currentLicenses).length,
    licenseCount: currentLicenses.length,
    priorPeriodCount: groupLicenseEstablishments(priorLicenses).length,
    changePct: groupLicenseEstablishments(priorLicenses).length === 0
      ? null
      : Math.round(((groupLicenseEstablishments(currentLicenses).length - groupLicenseEstablishments(priorLicenses).length) / groupLicenseEstablishments(priorLicenses).length) * 1000) / 10,
    radiusMiles,
    periodMonths: 12,
    issuanceComparison: compareCorridorLicenses(nearby),
    ...(includeHistory ? { issuanceHistory: nearby } : {}),
  };
}

export interface ArtGallery {
  businessName: string;
  address: string;
  licenseType: string;
  applicationType: string;
  startDate: string;
  distanceMiles: number;
  latitude: number;
  longitude: number;
}

export interface ArtGalleriesResponse {
  galleries: ArtGallery[];
  totalCount: number;
  radiusMiles: number;
}

let cachedGalleries: RawLicense[] | null = null;
let galleryCacheTimestamp = 0;

async function fetchArtGalleries(): Promise<RawLicense[]> {
  if (cachedGalleries && Date.now() - galleryCacheTimestamp < CACHE_TTL) {
    return cachedGalleries;
  }

  const selectFields = encodeURIComponent(
    'id,license_id,legal_name,doing_business_as_name,address,city,state,zip_code,license_description,business_activity,license_start_date,license_status,latitude,longitude,application_type'
  );
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 2);
  const galleryCutoff = cutoff.toISOString().split('T')[0];
  const whereClause = encodeURIComponent(
    `license_status='AAI' AND business_activity='Sale of Art' AND license_start_date>='${galleryCutoff}'`
  );

  const allGalleries: RawLicense[] = [];
  const pageSize = 2000;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const url = `https://data.cityofchicago.org/resource/r5kz-chrr.json?$select=${selectFields}&$where=${whereClause}&$limit=${pageSize}&$offset=${offset}&$order=license_start_date%20DESC`;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error(`API returned ${response.status}`);
      const data = await response.json() as RawLicense[];
      allGalleries.push(...data);
      if (data.length < pageSize) {
        hasMore = false;
      } else {
        offset += pageSize;
      }
    } catch (err) {
      console.error('[ART GALLERIES] Error fetching:', (err as Error).message);
      hasMore = false;
    }
  }

  const seen = new Map<string, RawLicense>();
  for (const l of allGalleries) {
    const key = `${l.license_id}`;
    const existing = seen.get(key);
    if (!existing || (l.license_start_date || '') > (existing.license_start_date || '')) {
      seen.set(key, l);
    }
  }
  const deduped = Array.from(seen.values());

  console.log(`[ART GALLERIES] Fetched ${allGalleries.length} raw, deduplicated to ${deduped.length}`);
  cachedGalleries = deduped;
  galleryCacheTimestamp = Date.now();
  return deduped;
}

export async function getNearbyArtGalleries(lat: number, lng: number, radiusMiles = 1.0): Promise<ArtGalleriesResponse> {
  const licenses = await fetchArtGalleries();
  const fromPoint = turf.point([lng, lat]);
  const galleries: ArtGallery[] = [];

  for (const l of licenses) {
    const pLat = parseFloat(l.latitude);
    const pLng = parseFloat(l.longitude);
    if (isNaN(pLat) || isNaN(pLng)) continue;

    const toPoint = turf.point([pLng, pLat]);
    const dist = turf.distance(fromPoint, toPoint, { units: 'miles' });
    if (dist <= radiusMiles) {
      galleries.push({
        businessName: l.doing_business_as_name || l.legal_name || 'Unknown',
        address: l.address || 'Address unavailable',
        licenseType: l.license_description || '',
        applicationType: l.application_type || '',
        startDate: l.license_start_date?.substring(0, 10) || '',
        distanceMiles: Math.round(dist * 100) / 100,
        latitude: pLat,
        longitude: pLng,
      });
    }
  }

  const dedupedGalleries: ArtGallery[] = [];
  const seenKeys = new Set<string>();
  for (const g of galleries) {
    const key = `${g.businessName.toUpperCase()}|${g.address.toUpperCase()}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      dedupedGalleries.push(g);
    }
  }

  dedupedGalleries.sort((a, b) => a.distanceMiles - b.distanceMiles);

  return {
    galleries: dedupedGalleries,
    totalCount: dedupedGalleries.length,
    radiusMiles,
  };
}

export interface BusinessLicenseRecord {
  businessName: string;
  licenseType: string;
  applicationType: string;
  status: string;
  statusLabel: string;
  issuedDate: string;
  expirationDate: string;
  accountNumber: string;
  licenseNumber: string;
}

export interface BusinessLicenseHistoryResponse {
  records: BusinessLicenseRecord[];
  totalCount: number;
  found: boolean;
}

function statusLabel(code: string): string {
  switch (code) {
    case 'AAI': return 'Active';
    case 'AAC': return 'Cancelled';
    case 'REV': return 'Revoked';
    case 'INV': return 'Inactive';
    default: return code || 'Unknown';
  }
}

function appTypeLabel(code: string): string {
  switch (code) {
    case 'ISSUE': return 'New';
    case 'RENEW': return 'Renewal';
    case 'C_CNCL': return 'City Cancelled';
    case 'C_LOC': return 'Location Cancelled';
    case 'C_EXPA': return 'Expired';
    case 'CANC': return 'Cancelled';
    case 'REAPP': return 'Reapplication';
    default: return code || '';
  }
}

export async function getBusinessLicenseHistory(address: string): Promise<BusinessLicenseHistoryResponse> {
  const firstLine = address.split(',')[0].toUpperCase().replace(/\./g, '').trim().replace(/'/g, "''");
  const params = new URLSearchParams({
    '$where': `upper(address) like '${firstLine}%'`,
    '$limit': '200',
    '$order': 'date_issued DESC',
  });
  const url = `https://data.cityofchicago.org/resource/r5kz-chrr.json?${params}`;

  let data: any[] = [];
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (resp.ok) {
      data = await resp.json() as any[];
    }
  } catch (err: any) {
    console.error('[business-license-history] fetch error:', err.message);
  }

  const records: BusinessLicenseRecord[] = data.map((r: any) => ({
    businessName: r.doing_business_as_name || r.legal_name || 'Unknown',
    licenseType: r.license_description || '',
    applicationType: appTypeLabel(r.application_type || ''),
    status: r.license_status || '',
    statusLabel: statusLabel(r.license_status || ''),
    issuedDate: r.date_issued ? r.date_issued.substring(0, 10) : '',
    expirationDate: r.expiration_date ? r.expiration_date.substring(0, 10) : '',
    accountNumber: r.account_number || '',
    licenseNumber: r.license_number || '',
  }));

  console.log(`[business-license-history] ${address} → ${records.length} records`);
  return { records, totalCount: records.length, found: records.length > 0 };
}
