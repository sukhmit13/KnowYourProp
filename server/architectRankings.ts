const FIVE_YEARS_AGO = '2020-01-01T00:00:00';
const BASE_URL = 'https://data.cityofchicago.org/resource/ydr8-5enu.json';
const CACHE_TTL = 6 * 60 * 60 * 1000;

export interface ArchitectEntry {
  name: string;
  isSelfCert: boolean;
  hasSelfCert: boolean;
  totalProjects: number;
  totalValue: number;
  newConstructionCount: number;
  renovationCount: number;
  selfCertCount: number;
  singleFamilyCount: number;
  multiFamilyCount: number;
  mixedUseCommercialCount: number;
  industrialCount: number;
  lastPermitDate: string | null;
}

export interface ExpeditorEntry {
  name: string;
  totalProjects: number;
  totalValue: number;
  newConstructionCount: number;
  renovationCount: number;
  singleFamilyCount: number;
  multiFamilyCount: number;
  mixedUseCommercialCount: number;
  industrialCount: number;
  lastPermitDate: string | null;
}

let architectCache: { data: ArchitectEntry[]; fetchedAt: number } | null = null;
let expeditorCache: { data: ExpeditorEntry[]; fetchedAt: number } | null = null;

async function soql(params: string): Promise<any[]> {
  const url = `${BASE_URL}?${params}`;
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'ChicagoRealEstateApp/1.0', Accept: 'application/json' },
    signal: AbortSignal.timeout(25000),
  });
  if (!resp.ok) throw new Error(`Socrata error ${resp.status}`);
  return resp.json();
}

function buildGrouped(where: string, select: string, group: string, limit = 2000): string {
  return `$select=${encodeURIComponent(select)}&$where=${encodeURIComponent(where)}&$group=${encodeURIComponent(group)}&$order=${encodeURIComponent('total DESC')}&$limit=${limit}`;
}

export async function getArchitectRankings(): Promise<ArchitectEntry[]> {
  if (architectCache && Date.now() - architectCache.fetchedAt < CACHE_TTL) {
    return architectCache.data;
  }

  const archWhere = `contact_1_type in('ARCHITECT','SELF CERT ARCHITECT') AND issue_date>'${FIVE_YEARS_AGO}'`;

  const [base, newCon, reno, sfr, mfr, com, ind, lastDates] = await Promise.all([
    soql(buildGrouped(
      archWhere,
      'contact_1_name,contact_1_type,count(*) as total,sum(reported_cost) as total_value',
      'contact_1_name,contact_1_type',
    )),
    soql(buildGrouped(
      `${archWhere} AND permit_type='PERMIT - NEW CONSTRUCTION'`,
      'contact_1_name,count(*) as total',
      'contact_1_name',
    )),
    soql(buildGrouped(
      `${archWhere} AND permit_type='PERMIT - RENOVATION/ALTERATION'`,
      'contact_1_name,count(*) as total',
      'contact_1_name',
    )),
    soql(buildGrouped(
      `${archWhere} AND (upper(work_description) like '%SINGLE FAMILY%' OR upper(work_description) like '% SFR%' OR upper(work_description) like '%S.F.R%')`,
      'contact_1_name,count(*) as total',
      'contact_1_name',
    )),
    soql(buildGrouped(
      `${archWhere} AND (upper(work_description) like '%APARTMENT%' OR upper(work_description) like '%MULTI-FAMILY%' OR upper(work_description) like '%MULTIFAMILY%' OR upper(work_description) like '% D.U.%' OR upper(work_description) like '%DWELLING UNIT%')`,
      'contact_1_name,count(*) as total',
      'contact_1_name',
    )),
    soql(buildGrouped(
      `${archWhere} AND (upper(work_description) like '%COMMERCIAL%' OR upper(work_description) like '%MIXED USE%' OR upper(work_description) like '%MIXED-USE%' OR upper(work_description) like '%RETAIL%' OR upper(work_description) like '%OFFICE%')`,
      'contact_1_name,count(*) as total',
      'contact_1_name',
    )),
    soql(buildGrouped(
      `${archWhere} AND (upper(work_description) like '%INDUSTRIAL%' OR upper(work_description) like '%WAREHOUSE%' OR upper(work_description) like '%MANUFACTURING%')`,
      'contact_1_name,count(*) as total',
      'contact_1_name',
    )),
    soql(`$select=${encodeURIComponent('contact_1_name,max(issue_date) as last_date')}&$where=${encodeURIComponent(archWhere)}&$group=${encodeURIComponent('contact_1_name')}&$limit=2000`),
  ]);

  function indexBy(arr: any[], key: string): Map<string, number> {
    const m = new Map<string, number>();
    for (const r of arr) {
      const name = (r[key] || '').toUpperCase().trim();
      m.set(name, parseInt(r.total || '0'));
    }
    return m;
  }

  const newConMap = indexBy(newCon, 'contact_1_name');
  const renoMap = indexBy(reno, 'contact_1_name');
  const sfrMap = indexBy(sfr, 'contact_1_name');
  const mfrMap = indexBy(mfr, 'contact_1_name');
  const comMap = indexBy(com, 'contact_1_name');
  const indMap = indexBy(ind, 'contact_1_name');
  const lastDateMap = new Map<string, string>();
  for (const r of lastDates) {
    const name = (r.contact_1_name || '').toUpperCase().trim();
    lastDateMap.set(name, r.last_date || '');
  }

  const merged = new Map<string, ArchitectEntry>();
  for (const r of base) {
    const rawName = (r.contact_1_name || '').trim();
    const name = rawName.toUpperCase();
    const isSelf = r.contact_1_type === 'SELF CERT ARCHITECT';
    const cnt = parseInt(r.total || '0');

    if (merged.has(name)) {
      const ex = merged.get(name)!;
      ex.totalProjects += cnt;
      ex.totalValue += parseFloat(r.total_value || '0');
      if (isSelf) { ex.selfCertCount += cnt; ex.hasSelfCert = true; }
    } else {
      merged.set(name, {
        name: rawName,
        isSelfCert: isSelf,
        hasSelfCert: isSelf,
        totalProjects: cnt,
        totalValue: parseFloat(r.total_value || '0'),
        newConstructionCount: newConMap.get(name) || 0,
        renovationCount: renoMap.get(name) || 0,
        selfCertCount: isSelf ? cnt : 0,
        singleFamilyCount: sfrMap.get(name) || 0,
        multiFamilyCount: mfrMap.get(name) || 0,
        mixedUseCommercialCount: comMap.get(name) || 0,
        industrialCount: indMap.get(name) || 0,
        lastPermitDate: lastDateMap.get(name) || null,
      });
    }
  }

  const results = Array.from(merged.values()).filter(e => e.totalProjects >= 3);
  architectCache = { data: results, fetchedAt: Date.now() };
  console.log(`[ARCHITECT RANKINGS] Cached ${results.length} architects`);
  return results;
}

export async function getExpeditorRankings(): Promise<ExpeditorEntry[]> {
  if (expeditorCache && Date.now() - expeditorCache.fetchedAt < CACHE_TTL) {
    return expeditorCache.data;
  }

  const expWhere1 = `contact_1_type in('EXPEDITOR','EXPEDITER') AND issue_date>'${FIVE_YEARS_AGO}'`;
  const expWhere2 = `contact_2_type in('EXPEDITOR','EXPEDITER') AND issue_date>'${FIVE_YEARS_AGO}'`;

  const buildExpQuery = (where: string, nameField: string, extraWhere = '') => {
    const full = extraWhere ? `${where} AND ${extraWhere}` : where;
    return soql(buildGrouped(
      full,
      `${nameField},count(*) as total,sum(reported_cost) as total_value`,
      nameField,
    ));
  };

  const [base1, base2, newCon1, newCon2, reno1, reno2, sfr1, sfr2, mfr1, mfr2, com1, com2, ind1, ind2, last1, last2] = await Promise.all([
    buildExpQuery(expWhere1, 'contact_1_name'),
    buildExpQuery(expWhere2, 'contact_2_name'),
    buildExpQuery(expWhere1, 'contact_1_name', `permit_type='PERMIT - NEW CONSTRUCTION'`),
    buildExpQuery(expWhere2, 'contact_2_name', `permit_type='PERMIT - NEW CONSTRUCTION'`),
    buildExpQuery(expWhere1, 'contact_1_name', `permit_type='PERMIT - RENOVATION/ALTERATION'`),
    buildExpQuery(expWhere2, 'contact_2_name', `permit_type='PERMIT - RENOVATION/ALTERATION'`),
    buildExpQuery(expWhere1, 'contact_1_name', `upper(work_description) like '%SINGLE FAMILY%' OR upper(work_description) like '% SFR%'`),
    buildExpQuery(expWhere2, 'contact_2_name', `upper(work_description) like '%SINGLE FAMILY%' OR upper(work_description) like '% SFR%'`),
    buildExpQuery(expWhere1, 'contact_1_name', `upper(work_description) like '%APARTMENT%' OR upper(work_description) like '%MULTI-FAMILY%' OR upper(work_description) like '%DWELLING UNIT%'`),
    buildExpQuery(expWhere2, 'contact_2_name', `upper(work_description) like '%APARTMENT%' OR upper(work_description) like '%MULTI-FAMILY%' OR upper(work_description) like '%DWELLING UNIT%'`),
    buildExpQuery(expWhere1, 'contact_1_name', `upper(work_description) like '%COMMERCIAL%' OR upper(work_description) like '%MIXED USE%' OR upper(work_description) like '%RETAIL%'`),
    buildExpQuery(expWhere2, 'contact_2_name', `upper(work_description) like '%COMMERCIAL%' OR upper(work_description) like '%MIXED USE%' OR upper(work_description) like '%RETAIL%'`),
    buildExpQuery(expWhere1, 'contact_1_name', `upper(work_description) like '%INDUSTRIAL%' OR upper(work_description) like '%WAREHOUSE%'`),
    buildExpQuery(expWhere2, 'contact_2_name', `upper(work_description) like '%INDUSTRIAL%' OR upper(work_description) like '%WAREHOUSE%'`),
    soql(`$select=${encodeURIComponent('contact_1_name,max(issue_date) as last_date')}&$where=${encodeURIComponent(expWhere1)}&$group=${encodeURIComponent('contact_1_name')}&$limit=2000`),
    soql(`$select=${encodeURIComponent('contact_2_name,max(issue_date) as last_date')}&$where=${encodeURIComponent(expWhere2)}&$group=${encodeURIComponent('contact_2_name')}&$limit=2000`),
  ]);

  function mergeRows(rows1: any[], nameKey1: string, rows2: any[], nameKey2: string): Map<string, { total: number; value: number }> {
    const m = new Map<string, { total: number; value: number }>();
    for (const r of [...rows1.map(r => ({ n: r[nameKey1], t: r.total, v: r.total_value })), ...rows2.map(r => ({ n: r[nameKey2], t: r.total, v: r.total_value }))]) {
      const name = (r.n || '').toUpperCase().trim();
      if (!name) continue;
      const ex = m.get(name) || { total: 0, value: 0 };
      ex.total += parseInt(r.t || '0');
      ex.value += parseFloat(r.v || '0');
      m.set(name, ex);
    }
    return m;
  }

  function mergeCount(rows1: any[], key1: string, rows2: any[], key2: string): Map<string, number> {
    const m = new Map<string, number>();
    for (const { rows, key } of [{ rows: rows1, key: key1 }, { rows: rows2, key: key2 }]) {
      for (const r of rows) {
        const name = (r[key] || '').toUpperCase().trim();
        if (!name) continue;
        m.set(name, (m.get(name) || 0) + parseInt(r.total || '0'));
      }
    }
    return m;
  }

  const baseMap = mergeRows(base1, 'contact_1_name', base2, 'contact_2_name');
  const newConMap = mergeCount(newCon1, 'contact_1_name', newCon2, 'contact_2_name');
  const renoMap = mergeCount(reno1, 'contact_1_name', reno2, 'contact_2_name');
  const sfrMap = mergeCount(sfr1, 'contact_1_name', sfr2, 'contact_2_name');
  const mfrMap = mergeCount(mfr1, 'contact_1_name', mfr2, 'contact_2_name');
  const comMap = mergeCount(com1, 'contact_1_name', com2, 'contact_2_name');
  const indMap = mergeCount(ind1, 'contact_1_name', ind2, 'contact_2_name');

  const lastDateMap = new Map<string, string>();
  for (const r of [...last1.map((r: any) => ({ n: r.contact_1_name, d: r.last_date })), ...last2.map((r: any) => ({ n: r.contact_2_name, d: r.last_date }))]) {
    const name = (r.n || '').toUpperCase().trim();
    if (!name) continue;
    const existing = lastDateMap.get(name);
    if (!existing || (r.d && r.d > existing)) lastDateMap.set(name, r.d);
  }

  const results: ExpeditorEntry[] = [];
  for (const [name, { total, value }] of baseMap.entries()) {
    if (total < 2) continue;
    const rawName = name;
    results.push({
      name: rawName,
      totalProjects: total,
      totalValue: value,
      newConstructionCount: newConMap.get(name) || 0,
      renovationCount: renoMap.get(name) || 0,
      singleFamilyCount: sfrMap.get(name) || 0,
      multiFamilyCount: mfrMap.get(name) || 0,
      mixedUseCommercialCount: comMap.get(name) || 0,
      industrialCount: indMap.get(name) || 0,
      lastPermitDate: lastDateMap.get(name) || null,
    });
  }

  results.sort((a, b) => b.totalProjects - a.totalProjects);
  expeditorCache = { data: results, fetchedAt: Date.now() };
  console.log(`[EXPEDITOR RANKINGS] Cached ${results.length} expeditors`);
  return results;
}

export interface GeneralContractorEntry {
  name: string;
  isOwnerGC: boolean;
  totalProjects: number;
  totalValue: number;
  newConstructionCount: number;
  renovationCount: number;
  singleFamilyCount: number;
  multiFamilyCount: number;
  mixedUseCommercialCount: number;
  industrialCount: number;
  lastPermitDate: string | null;
}

let gcCache: { data: GeneralContractorEntry[]; fetchedAt: number } | null = null;

export async function getGeneralContractorRankings(): Promise<GeneralContractorEntry[]> {
  if (gcCache && Date.now() - gcCache.fetchedAt < CACHE_TTL) {
    return gcCache.data;
  }

  const gcWhere = `contact_1_type in('CONTRACTOR-GENERAL CONTRACTOR','OWNER AS GENERAL CONTRACTOR') AND issue_date>'${FIVE_YEARS_AGO}'`;

  const [base, newCon, reno, sfr, mfr, com, ind, lastDates] = await Promise.all([
    soql(buildGrouped(
      gcWhere,
      'contact_1_name,contact_1_type,count(*) as total,sum(reported_cost) as total_value',
      'contact_1_name,contact_1_type',
    )),
    soql(buildGrouped(
      `${gcWhere} AND permit_type='PERMIT - NEW CONSTRUCTION'`,
      'contact_1_name,count(*) as total',
      'contact_1_name',
    )),
    soql(buildGrouped(
      `${gcWhere} AND permit_type='PERMIT - RENOVATION/ALTERATION'`,
      'contact_1_name,count(*) as total',
      'contact_1_name',
    )),
    soql(buildGrouped(
      `${gcWhere} AND (upper(work_description) like '%SINGLE FAMILY%' OR upper(work_description) like '% SFR%' OR upper(work_description) like '%S.F.R%')`,
      'contact_1_name,count(*) as total',
      'contact_1_name',
    )),
    soql(buildGrouped(
      `${gcWhere} AND (upper(work_description) like '%APARTMENT%' OR upper(work_description) like '%MULTI-FAMILY%' OR upper(work_description) like '%MULTIFAMILY%' OR upper(work_description) like '% D.U.%' OR upper(work_description) like '%DWELLING UNIT%')`,
      'contact_1_name,count(*) as total',
      'contact_1_name',
    )),
    soql(buildGrouped(
      `${gcWhere} AND (upper(work_description) like '%COMMERCIAL%' OR upper(work_description) like '%MIXED USE%' OR upper(work_description) like '%MIXED-USE%' OR upper(work_description) like '%RETAIL%' OR upper(work_description) like '%OFFICE%')`,
      'contact_1_name,count(*) as total',
      'contact_1_name',
    )),
    soql(buildGrouped(
      `${gcWhere} AND (upper(work_description) like '%INDUSTRIAL%' OR upper(work_description) like '%WAREHOUSE%' OR upper(work_description) like '%MANUFACTURING%')`,
      'contact_1_name,count(*) as total',
      'contact_1_name',
    )),
    soql(`$select=${encodeURIComponent('contact_1_name,max(issue_date) as last_date')}&$where=${encodeURIComponent(gcWhere)}&$group=${encodeURIComponent('contact_1_name')}&$limit=2000`),
  ]);

  function indexByCount(arr: any[], key: string): Map<string, number> {
    const m = new Map<string, number>();
    for (const r of arr) {
      const name = (r[key] || '').toUpperCase().trim();
      m.set(name, parseInt(r.total || '0'));
    }
    return m;
  }

  const newConMap = indexByCount(newCon, 'contact_1_name');
  const renoMap = indexByCount(reno, 'contact_1_name');
  const sfrMap = indexByCount(sfr, 'contact_1_name');
  const mfrMap = indexByCount(mfr, 'contact_1_name');
  const comMap = indexByCount(com, 'contact_1_name');
  const indMap = indexByCount(ind, 'contact_1_name');
  const lastDateMap = new Map<string, string>();
  for (const r of lastDates) {
    const name = (r.contact_1_name || '').toUpperCase().trim();
    lastDateMap.set(name, r.last_date || '');
  }

  const merged = new Map<string, GeneralContractorEntry>();
  for (const r of base) {
    const rawName = (r.contact_1_name || '').trim();
    const name = rawName.toUpperCase();
    const isOwner = r.contact_1_type === 'OWNER AS GENERAL CONTRACTOR';
    const cnt = parseInt(r.total || '0');

    if (merged.has(name)) {
      const ex = merged.get(name)!;
      ex.totalProjects += cnt;
      ex.totalValue += parseFloat(r.total_value || '0');
    } else {
      merged.set(name, {
        name: rawName,
        isOwnerGC: isOwner,
        totalProjects: cnt,
        totalValue: parseFloat(r.total_value || '0'),
        newConstructionCount: newConMap.get(name) || 0,
        renovationCount: renoMap.get(name) || 0,
        singleFamilyCount: sfrMap.get(name) || 0,
        multiFamilyCount: mfrMap.get(name) || 0,
        mixedUseCommercialCount: comMap.get(name) || 0,
        industrialCount: indMap.get(name) || 0,
        lastPermitDate: lastDateMap.get(name) || null,
      });
    }
  }

  const results = Array.from(merged.values()).filter(e => e.totalProjects >= 3);
  results.sort((a, b) => b.totalProjects - a.totalProjects);
  gcCache = { data: results, fetchedAt: Date.now() };
  console.log(`[GC RANKINGS] Cached ${results.length} general contractors`);
  return results;
}
