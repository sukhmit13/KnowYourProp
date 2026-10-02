import { db } from '../db';
import { zbaCases, repVerifications, zbaIndexRuns, ardcVerifications } from '@shared/schema';
import type { ZbaCase, RepVerification, RepresentativeSummary, ZbaSummaryResponse, RepVerificationStatus } from '@shared/schema';
import { eq, gte, desc, sql, and } from 'drizzle-orm';
import * as cheerio from 'cheerio';
import { normalizeProName as normalizeRepName } from '@shared/normalizeProName';

const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
const ARDC_CACHE_DAYS = 30; // Cache ARDC results for 30 days
let wardSummaryCache: Map<number, { data: ZbaSummaryResponse; timestamp: number }> = new Map();
let citySummaryCache: { data: ZbaSummaryResponse; timestamp: number } | null = null;

function getHeuristic(
  representativeRaw: string | null,
  applicantName: string | null
): 'likely_attorney' | 'likely_not_attorney' | null {
  if (!representativeRaw) return null;
  
  const rawUpper = representativeRaw.toUpperCase();
  if (rawUpper.includes('ATTORNEY') || rawUpper.includes('ESQ') || rawUpper.includes('LAW')) {
    return 'likely_attorney';
  }
  
  if (applicantName) {
    const normRep = normalizeRepName(representativeRaw);
    const normApp = normalizeRepName(applicantName);
    if (normRep && normApp && normRep === normApp) {
      return 'likely_not_attorney';
    }
  }
  
  return null;
}

// Check if a case is self-represented
function isCaseSelfRep(c: ZbaCase): boolean {
  if (!c.representativeRaw) return false;
  
  const rawUpper = c.representativeRaw.toUpperCase();
  
  // Check for explicit self-rep markers
  if (rawUpper.includes('SAME AS APPLICANT') || 
      rawUpper.includes('SELF-REPRESENTED') ||
      rawUpper.includes('SELF REPRESENTED') ||
      rawUpper === 'SELF') {
    return true;
  }
  
  // Check if applicant name matches representative name
  if (c.applicantName && c.representativeNorm) {
    const normApp = normalizeRepName(c.applicantName);
    if (normApp && normApp === c.representativeNorm) {
      return true;
    }
  }
  
  return false;
}

async function getVerificationStatuses(): Promise<Map<string, RepVerificationStatus>> {
  const verifications = await db.select().from(repVerifications);
  const map = new Map<string, RepVerificationStatus>();
  for (const v of verifications) {
    map.set(v.representativeNorm, v.status as RepVerificationStatus);
  }
  return map;
}

async function getArdcVerifications(): Promise<Map<string, boolean>> {
  const verifications = await db.select().from(ardcVerifications);
  const map = new Map<string, boolean>();
  for (const v of verifications) {
    if (v.isAttorney !== null) {
      map.set(v.representativeNorm, v.isAttorney);
    }
  }
  return map;
}

// Search IARDC for attorney by name
async function searchIardc(firstName: string, lastName: string): Promise<{ found: boolean; ardcNumber?: string }> {
  try {
    const searchUrl = `https://www.iardc.org/Lawyer/Search`;
    
    // Make POST request to IARDC search
    const formData = new URLSearchParams();
    formData.append('FirstName', firstName);
    formData.append('LastName', lastName);
    formData.append('StateList', 'IL');
    
    const response = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });
    
    if (!response.ok) {
      console.error(`IARDC search failed: ${response.status}`);
      return { found: false };
    }
    
    const html = await response.text();
    const $ = cheerio.load(html);
    
    // Check if any results were returned
    const resultRows = $('table.table tbody tr');
    if (resultRows.length > 0) {
      // Look for ARDC number in the first result
      const firstRow = resultRows.first();
      const ardcLink = firstRow.find('a[href*="/Lawyer/Detail/"]');
      const ardcNumber = ardcLink.attr('href')?.match(/\/Detail\/(\d+)/)?.[1];
      return { found: true, ardcNumber };
    }
    
    return { found: false };
  } catch (err) {
    console.error('IARDC search error:', err);
    return { found: false };
  }
}

// Verify a representative against IARDC and cache the result
export async function verifyRepresentativeArdc(representativeNorm: string, displayName: string): Promise<boolean | null> {
  // Check cache first
  const cached = await db.select()
    .from(ardcVerifications)
    .where(eq(ardcVerifications.representativeNorm, representativeNorm))
    .limit(1);
  
  if (cached.length > 0) {
    const cacheAge = Date.now() - (cached[0].checkedAt?.getTime() || 0);
    if (cacheAge < ARDC_CACHE_DAYS * 24 * 60 * 60 * 1000) {
      return cached[0].isAttorney;
    }
  }
  
  // Parse name into first/last
  const nameParts = displayName.trim().split(/\s+/);
  if (nameParts.length < 2) {
    return null; // Can't search with just one name
  }
  
  const firstName = nameParts[0];
  const lastName = nameParts[nameParts.length - 1];
  
  const result = await searchIardc(firstName, lastName);
  
  // Cache the result
  await db.insert(ardcVerifications)
    .values({
      representativeNorm,
      isAttorney: result.found,
      ardcNumber: result.ardcNumber || null,
      checkedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: ardcVerifications.representativeNorm,
      set: {
        isAttorney: result.found,
        ardcNumber: result.ardcNumber || null,
        checkedAt: new Date(),
      },
    });
  
  return result.found;
}

async function computeSummary(
  cases: ZbaCase[],
  verificationMap: Map<string, RepVerificationStatus>,
  ardcVerificationMap: Map<string, boolean>
): Promise<ZbaSummaryResponse> {
  const repGroups = new Map<string, ZbaCase[]>();
  let selfRepCaseCount = 0;
  
  for (const c of cases) {
    if (!c.representativeNorm) continue;
    if (!repGroups.has(c.representativeNorm)) {
      repGroups.set(c.representativeNorm, []);
    }
    repGroups.get(c.representativeNorm)!.push(c);
    
    // Count self-rep cases
    const isSelfRepCase = isCaseSelfRep(c);
    if (isSelfRepCase) {
      selfRepCaseCount++;
    }
  }
  
  const representatives: RepresentativeSummary[] = [];
  
  repGroups.forEach((caseList, repNorm) => {
    if (caseList.length === 0) return;
    
    let approvedCount = 0;
    let deniedCount = 0;
    let withdrawnCount = 0;
    let otherCount = 0;
    let mostRecentDate: Date | null = null;
    let isSelfRep = false;
    
    const firstCase = caseList[0];
    
    for (const c of caseList) {
      switch (c.outcome) {
        case 'APPROVED': approvedCount++; break;
        case 'DENIED': deniedCount++; break;
        case 'WITHDRAWN': withdrawnCount++; break;
        default: otherCount++; break;
      }
      
      // Track most recent case date
      if (c.decisionDate) {
        const caseDate = new Date(c.decisionDate);
        if (!mostRecentDate || caseDate > mostRecentDate) {
          mostRecentDate = caseDate;
        }
      }
      
      // Check if this is self-representation
      if (c.applicantName && c.representativeNorm) {
        const normApp = normalizeRepName(c.applicantName);
        if (normApp === c.representativeNorm) {
          isSelfRep = true;
        }
      }
    }
    
    // Also check for SELF-REPRESENTED marker
    if (repNorm === 'SELF-REPRESENTED' || repNorm.includes('SELF')) {
      isSelfRep = true;
    }
    
    const totalCases = caseList.length;
    const approvalRate = totalCases >= 5 ? Math.round((approvedCount / totalCases) * 100) : null;
    
    // Get ARDC verification status
    const isVerifiedAttorney = ardcVerificationMap.has(repNorm) ? ardcVerificationMap.get(repNorm)! : null;
    
    representatives.push({
      representativeNorm: repNorm,
      representativeDisplay: firstCase.representativeRaw || repNorm,
      totalCases,
      approvedCount,
      deniedCount,
      withdrawnCount,
      otherCount,
      approvalRate,
      verificationStatus: verificationMap.get(repNorm) || 'unknown',
      likelyAttorneyHeuristic: getHeuristic(firstCase.representativeRaw, firstCase.applicantName),
      mostRecentCaseDate: mostRecentDate ? mostRecentDate.toISOString().split('T')[0] : null,
      isSelfRep,
      isVerifiedAttorney,
    });
  });
  
  representatives.sort((a, b) => b.totalCases - a.totalCases);
  
  // Return the union of top 10 by volume and top 10 by recency so the client
  // can offer either sort without missing reps (order here: volume-first).
  const byRecency = [...representatives].sort((a, b) =>
    (b.mostRecentCaseDate || '').localeCompare(a.mostRecentCaseDate || '') || b.totalCases - a.totalCases);
  const keep = new Set([
    ...representatives.slice(0, 10).map(r => r.representativeNorm),
    ...byRecency.slice(0, 10).map(r => r.representativeNorm),
  ]);
  
  return {
    representatives: representatives.filter(r => keep.has(r.representativeNorm)),
    totalCases: cases.length,
    totalRepresentatives: repGroups.size,
    selfRepCaseCount,
  };
}

export async function getWardSummary(ward: number, years: number = 5): Promise<ZbaSummaryResponse> {
  const cached = wardSummaryCache.get(ward);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION_MS) {
    return cached.data;
  }
  
  const cutoffDate = new Date();
  cutoffDate.setFullYear(cutoffDate.getFullYear() - years);
  
  const cases = await db.select()
    .from(zbaCases)
    .where(and(
      eq(zbaCases.ward, ward),
      gte(zbaCases.decisionDate, cutoffDate)
    ));
  
  const verificationMap = await getVerificationStatuses();
  const ardcMap = await getArdcVerifications();
  const summary = await computeSummary(cases, verificationMap, ardcMap);
  
  wardSummaryCache.set(ward, { data: summary, timestamp: Date.now() });
  return summary;
}

export async function getCitySummary(years: number = 5): Promise<ZbaSummaryResponse> {
  if (citySummaryCache && Date.now() - citySummaryCache.timestamp < CACHE_DURATION_MS) {
    return citySummaryCache.data;
  }
  
  const cutoffDate = new Date();
  cutoffDate.setFullYear(cutoffDate.getFullYear() - years);
  
  const cases = await db.select()
    .from(zbaCases)
    .where(gte(zbaCases.decisionDate, cutoffDate));
  
  const verificationMap = await getVerificationStatuses();
  const ardcMap = await getArdcVerifications();
  const summary = await computeSummary(cases, verificationMap, ardcMap);
  
  citySummaryCache = { data: summary, timestamp: Date.now() };
  return summary;
}

export async function setRepVerification(
  representativeNorm: string,
  status: RepVerificationStatus
): Promise<void> {
  await db.insert(repVerifications)
    .values({
      representativeNorm,
      status,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: repVerifications.representativeNorm,
      set: {
        status,
        updatedAt: new Date(),
      },
    });
  
  wardSummaryCache.clear();
  citySummaryCache = null;
}

export async function isIndexBuilt(): Promise<boolean> {
  const count = await db.select({ count: sql<number>`count(*)` }).from(zbaCases);
  return (count[0]?.count || 0) > 0;
}

export async function getIndexRuns(): Promise<typeof zbaIndexRuns.$inferSelect[]> {
  return db.select()
    .from(zbaIndexRuns)
    .orderBy(desc(zbaIndexRuns.createdAt))
    .limit(10);
}

export function clearCache(): void {
  wardSummaryCache.clear();
  citySummaryCache = null;
}
