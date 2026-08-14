// Philadelphia L&I (Licenses & Inspections) Permits and Violations
// Data source: OpenDataPhilly / CARTO API
// https://phl.carto.com/api/v2/sql

const CARTO_SQL_URL = 'https://phl.carto.com/api/v2/sql';

function buildCartoUrl(query: string): string {
  return `${CARTO_SQL_URL}?q=${encodeURIComponent(query)}&format=json`;
}

function normalizeAddressForQuery(address: string): string {
  return address
    .toUpperCase()
    .replace(/,\s*(PHILADELPHIA|PHILA|PA|PHILLY)[^,]*/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(',')[0]
    .trim();
}

export interface PhillyPermitData {
  totalPermits: number;
  mostRecent: { date: string; type: string; description: string } | null;
  byType: { newConstruction: number; renovation: number; repair: number; demolition: number; other: number };
  totalEstimatedCost: number;
  expiredOrIncomplete: number;
  permits: PhillyPermit[];
  olderPermitsSummary: { count: number; earliestYear: number; latestYear: number; totalEstimatedCost: number } | null;
  olderPermits: PhillyPermit[];
  addressBreakdown: Record<string, { count: number; totalCost: number }>;
}

export interface PhillyPermit {
  permitnumber: string;
  permitdescription: string;
  status: string;
  issuedate: string | null;
  expirationdate: string | null;
  approvedscope: string | null;
  mostrecentinsp: string | null;
  address: string;
  typeofwork: string | null;
  commercialorresidential: string | null;
  permittype: string | null;
}

export interface PhillyViolationData {
  openViolations: number;
  totalViolationsLast5Years: number;
  violationsByType: Record<string, number>;
  statusBreakdown: { open: number; complied: number; other: number };
  violations: PhillyViolation[];
  mostRecentOpenViolation: PhillyViolation | null;
}

export interface PhillyViolation {
  violationid: string;
  violationcodetitle: string;
  violationstatus: string;
  caseissuedate: string | null;
  casetype: string | null;
  address: string;
  opa_account_num: string | null;
}

function classifyPermitType(permit: PhillyPermit): keyof PhillyPermitData['byType'] {
  const desc = (permit.permitdescription || permit.typeofwork || '').toLowerCase();
  if (desc.includes('new construction') || desc.includes('new building')) return 'newConstruction';
  if (desc.includes('demolition') || desc.includes('raze')) return 'demolition';
  if (desc.includes('renovation') || desc.includes('alteration') || desc.includes('remodel')) return 'renovation';
  if (desc.includes('repair') || desc.includes('maintenance')) return 'repair';
  return 'other';
}

export async function fetchPhillyPermits(address: string): Promise<PhillyPermitData> {
  const streetPart = normalizeAddressForQuery(address);
  const empty: PhillyPermitData = {
    totalPermits: 0,
    mostRecent: null,
    byType: { newConstruction: 0, renovation: 0, repair: 0, demolition: 0, other: 0 },
    totalEstimatedCost: 0,
    expiredOrIncomplete: 0,
    permits: [],
    olderPermitsSummary: null,
    olderPermits: [],
    addressBreakdown: {},
  };

  try {
    const query = `SELECT * FROM permits WHERE upper(address) LIKE '%${streetPart.replace(/'/g, "''")}%' ORDER BY issuedate DESC LIMIT 100`;
    const url = buildCartoUrl(query);
    console.log(`[PHILLY PERMITS] Fetching: ${streetPart}`);

    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) {
      console.error(`[PHILLY PERMITS] CARTO error: ${res.status}`);
      return empty;
    }

    const data = await res.json();
    const rows: PhillyPermit[] = data.rows || [];

    if (rows.length === 0) return empty;

    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 10);
    const recentPermits = rows.filter(p => !p.issuedate || new Date(p.issuedate) >= cutoff);
    const olderPermits = rows.filter(p => p.issuedate && new Date(p.issuedate) < cutoff);

    const byType: PhillyPermitData['byType'] = { newConstruction: 0, renovation: 0, repair: 0, demolition: 0, other: 0 };
    let totalCost = 0;
    let expired = 0;

    for (const p of recentPermits) {
      const type = classifyPermitType(p);
      byType[type]++;
      if (p.status && /expired|incomplete|void/i.test(p.status)) expired++;
    }

    const mostRecent = recentPermits[0] ? {
      date: recentPermits[0].issuedate || '',
      type: recentPermits[0].permittype || recentPermits[0].typeofwork || 'Permit',
      description: recentPermits[0].permitdescription || recentPermits[0].approvedscope || '',
    } : null;

    let olderSummary: PhillyPermitData['olderPermitsSummary'] = null;
    if (olderPermits.length > 0) {
      const years = olderPermits.map(p => p.issuedate ? new Date(p.issuedate).getFullYear() : 0).filter(y => y > 0);
      olderSummary = {
        count: olderPermits.length,
        earliestYear: Math.min(...years),
        latestYear: Math.max(...years),
        totalEstimatedCost: 0,
      };
    }

    return {
      totalPermits: recentPermits.length,
      mostRecent,
      byType,
      totalEstimatedCost: totalCost,
      expiredOrIncomplete: expired,
      permits: recentPermits,
      olderPermitsSummary: olderSummary,
      olderPermits,
      addressBreakdown: { [streetPart]: { count: recentPermits.length, totalCost } },
    };
  } catch (err) {
    console.error('[PHILLY PERMITS] Error:', err);
    return empty;
  }
}

export async function fetchPhillyViolations(address: string): Promise<PhillyViolationData> {
  const streetPart = normalizeAddressForQuery(address);
  const empty: PhillyViolationData = {
    openViolations: 0,
    totalViolationsLast5Years: 0,
    violationsByType: {},
    statusBreakdown: { open: 0, complied: 0, other: 0 },
    violations: [],
    mostRecentOpenViolation: null,
  };

  try {
    const fiveYearsAgo = new Date();
    fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
    const cutoffStr = fiveYearsAgo.toISOString().split('T')[0];

    const query = `SELECT * FROM violations WHERE upper(address) LIKE '%${streetPart.replace(/'/g, "''")}%' ORDER BY caseissuedate DESC LIMIT 100`;
    const url = buildCartoUrl(query);
    console.log(`[PHILLY VIOLATIONS] Fetching: ${streetPart}`);

    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) {
      console.error(`[PHILLY VIOLATIONS] CARTO error: ${res.status}`);
      return empty;
    }

    const data = await res.json();
    const rows: PhillyViolation[] = data.rows || [];

    if (rows.length === 0) return empty;

    const recent = rows.filter(v => !v.caseissuedate || v.caseissuedate >= cutoffStr);
    const openViolations = rows.filter(v => v.violationstatus && /open|active/i.test(v.violationstatus));

    const violationsByType: Record<string, number> = {};
    const statusBreakdown = { open: 0, complied: 0, other: 0 };

    for (const v of rows) {
      const type = v.casetype || v.violationcodetitle || 'Unknown';
      violationsByType[type] = (violationsByType[type] || 0) + 1;
      const status = (v.violationstatus || '').toLowerCase();
      if (status.includes('open') || status.includes('active')) statusBreakdown.open++;
      else if (status.includes('compli')) statusBreakdown.complied++;
      else statusBreakdown.other++;
    }

    return {
      openViolations: openViolations.length,
      totalViolationsLast5Years: recent.length,
      violationsByType,
      statusBreakdown,
      violations: rows,
      mostRecentOpenViolation: openViolations[0] || null,
    };
  } catch (err) {
    console.error('[PHILLY VIOLATIONS] Error:', err);
    return empty;
  }
}

export async function fetchPhillyPermitsAndViolations(address: string) {
  const [permitsData, violationsData] = await Promise.all([
    fetchPhillyPermits(address),
    fetchPhillyViolations(address),
  ]);
  return { permitsData, violationsData };
}
