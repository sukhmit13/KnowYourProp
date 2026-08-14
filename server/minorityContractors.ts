import * as fs from 'fs';
import * as path from 'path';

const FIVE_YEARS_AGO = '2020-01-01T00:00:00';
const BASE_URL = 'https://data.cityofchicago.org/resource/ydr8-5enu.json';
const CACHE_TTL = 6 * 60 * 60 * 1000;

export interface MinorityContractorEntry {
  name: string;
  certTypes: string[];
  ethnicity: string;
  capability: string;
  ward: string;
  communityArea: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  permitCount: number;
  permitValue: number;
  newConstructionCount: number;
  renovationCount: number;
  lastPermitDate: string | null;
}

interface RawDirectoryEntry {
  name: string;
  certTypes: string[];
  ethnicity: string;
  capability: string;
  ward: string;
  communityArea: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zip: string;
}

let cache: { data: MinorityContractorEntry[]; fetchedAt: number } | null = null;

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,'"!@#$%^&*()]/g, '')
    .replace(/\b(llc|inc|corp|co|ltd|lp|incorporated|company|enterprises|enterprise|services|group|solutions|construction|contractors|contractor|consulting|management|associates|partners)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function soql(params: string): Promise<any[]> {
  const url = `${BASE_URL}?${params}`;
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'ChicagoRealEstateApp/1.0', Accept: 'application/json' },
    signal: AbortSignal.timeout(25000),
  });
  if (!resp.ok) throw new Error(`Socrata error ${resp.status}`);
  return resp.json();
}

function buildGrouped(where: string, select: string, group: string, limit = 3000): string {
  return `$select=${encodeURIComponent(select)}&$where=${encodeURIComponent(where)}&$group=${encodeURIComponent(group)}&$order=${encodeURIComponent('total DESC')}&$limit=${limit}`;
}

export async function getMinorityContractorRankings(): Promise<MinorityContractorEntry[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) {
    return cache.data;
  }

  const dataPath = path.join(process.cwd(), 'server', 'data', 'minority_contractors.json');
  const rawDirectory: RawDirectoryEntry[] = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

  const normalizedLookup = new Map<string, RawDirectoryEntry>();
  for (const entry of rawDirectory) {
    const key = normalizeName(entry.name);
    if (key) normalizedLookup.set(key, entry);
  }

  const gcWhere = `contact_1_type in('CONTRACTOR-GENERAL CONTRACTOR','OWNER AS GENERAL CONTRACTOR','CONTRACTOR') AND issue_date>'${FIVE_YEARS_AGO}'`;
  const newConWhere = `${gcWhere} AND permit_type='PERMIT - NEW CONSTRUCTION'`;
  const renoWhere = `${gcWhere} AND permit_type='PERMIT - RENOVATION/ALTERATION'`;

  const [base, newCon, reno, lastDates] = await Promise.all([
    soql(buildGrouped(
      gcWhere,
      'contact_1_name,count(*) as total,sum(reported_cost) as total_value',
      'contact_1_name',
    )),
    soql(buildGrouped(
      newConWhere,
      'contact_1_name,count(*) as total',
      'contact_1_name',
    )),
    soql(buildGrouped(
      renoWhere,
      'contact_1_name,count(*) as total',
      'contact_1_name',
    )),
    soql(`$select=${encodeURIComponent('contact_1_name,max(issue_date) as last_date')}&$where=${encodeURIComponent(gcWhere)}&$group=${encodeURIComponent('contact_1_name')}&$limit=3000`),
  ]);

  const newConMap = new Map<string, number>();
  for (const r of newCon) newConMap.set(r.contact_1_name, parseInt(r.total) || 0);

  const renoMap = new Map<string, number>();
  for (const r of reno) renoMap.set(r.contact_1_name, parseInt(r.total) || 0);

  const lastDateMap = new Map<string, string>();
  for (const r of lastDates) {
    if (r.last_date) lastDateMap.set(r.contact_1_name, r.last_date.slice(0, 10));
  }

  const permitStats = new Map<string, { total: number; value: number; permitName: string }>();
  for (const r of base) {
    const pName = r.contact_1_name as string;
    const normKey = normalizeName(pName);
    if (normalizedLookup.has(normKey)) {
      const existing = permitStats.get(normKey);
      const total = parseInt(r.total) || 0;
      const value = parseFloat(r.total_value) || 0;
      if (!existing || total > existing.total) {
        permitStats.set(normKey, { total, value, permitName: pName });
      }
    }
  }

  const results: MinorityContractorEntry[] = rawDirectory.map(entry => {
    const normKey = normalizeName(entry.name);
    const stats = permitStats.get(normKey);
    const permitName = stats?.permitName;
    return {
      ...entry,
      permitCount: stats?.total ?? 0,
      permitValue: stats?.value ?? 0,
      newConstructionCount: permitName ? (newConMap.get(permitName) ?? 0) : 0,
      renovationCount: permitName ? (renoMap.get(permitName) ?? 0) : 0,
      lastPermitDate: permitName ? (lastDateMap.get(permitName) ?? null) : null,
    };
  });

  cache = { data: results, fetchedAt: Date.now() };
  return results;
}
