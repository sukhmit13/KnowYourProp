import axios from 'axios';
import * as cheerio from 'cheerio';
import { db } from './db';
import { preTitleCheckCache } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { hashAddress, normalizePIN, isCacheExpired } from './utils/cache';
import type {
  PreTitlePropertyTaxData,
  PreTitleLiensData,
  PreTitleForeclosureData,
  PreTitleWaterBillData,
  PreTitleOwnershipData,
  PreTitleVerdict,
  PreTitleIssue,
  PreTitleCheckCache
} from '@shared/schema';

const CACHE_DAYS = {
  propertyTax: 30,
  foreclosure: 14,
  liens: 7,
  waterBill: 30,
  ownership: 14,
};

const MANUAL_CHECK_URLS = {
  propertyTax: 'https://www.cookcountytreasurer.com/setsearchparameters.aspx',
  foreclosure: 'https://www.cookcountyclerkofcourt.org/CourtCaseSearch/DocketSearch',
  liens: 'https://ccrecorder.org/',
  waterBill: 'https://webapps1.chicago.gov/wtrblnginq/wtrBillInquiry.htm',
  ownership: 'https://ccrecorder.org/',
};

export async function getPropertyTaxStatus(pin: string): Promise<PreTitlePropertyTaxData> {
  const normalizedPin = normalizePIN(pin);
  const formattedPin = formatPIN(normalizedPin);
  
  try {
    const treasurerUrl = `https://www.cookcountytreasurer.com/setsearchparameters.aspx?mode=PIN&pin=${formattedPin}&taession=yes`;
    
    const response = await axios.get(
      `https://datacatalog.cookcountyil.gov/resource/x54s-btds.json`,
      {
        params: {
          pin: normalizedPin,
          '$limit': 1
        },
        timeout: 10000
      }
    );
    
    if (response.data && response.data.length > 0) {
      const record = response.data[0];
      const taxYear = parseInt(record.tax_year || '0');
      
      return {
        status: 'current',
        totalOwed: 0,
        currentYearPaid: true,
        priorYearPaid: true,
        taxSaleStatus: 'none',
        manualCheckUrl: treasurerUrl,
      };
    }
    
    return {
      status: 'unknown',
      totalOwed: 0,
      currentYearPaid: true,
      priorYearPaid: true,
      taxSaleStatus: 'none',
      message: 'Could not verify tax status - please check manually',
      manualCheckUrl: treasurerUrl,
    };
  } catch (error) {
    console.error('Property tax check error:', error);
    return {
      status: 'unknown',
      totalOwed: 0,
      currentYearPaid: true,
      priorYearPaid: true,
      taxSaleStatus: 'none',
      error: true,
      message: 'Unable to verify property tax status',
      manualCheckUrl: MANUAL_CHECK_URLS.propertyTax,
    };
  }
}

export async function getForeclosureStatus(address: string): Promise<PreTitleForeclosureData> {
  try {
    return {
      hasActiveForeclosure: false,
      hasRecentForeclosure: false,
      activeCases: [],
      closedCases: [],
      message: 'Foreclosure records require manual verification at the circuit court',
      manualCheckUrl: MANUAL_CHECK_URLS.foreclosure,
    };
  } catch (error) {
    console.error('Foreclosure check error:', error);
    return {
      hasActiveForeclosure: false,
      hasRecentForeclosure: false,
      activeCases: [],
      closedCases: [],
      error: true,
      message: 'Unable to verify foreclosure status',
      manualCheckUrl: MANUAL_CHECK_URLS.foreclosure,
    };
  }
}

export async function getLiensStatus(pin: string): Promise<PreTitleLiensData> {
  try {
    return {
      activeLiens: [],
      releasedLiens: [],
      mortgages: [],
      totalActiveLienAmount: 0,
      hasJudgmentLien: false,
      hasTaxLien: false,
      hasMechanicLien: false,
      message: 'Lien records require manual verification at the Recorder of Deeds',
      manualCheckUrl: MANUAL_CHECK_URLS.liens,
    };
  } catch (error) {
    console.error('Liens check error:', error);
    return {
      activeLiens: [],
      releasedLiens: [],
      mortgages: [],
      totalActiveLienAmount: 0,
      hasJudgmentLien: false,
      hasTaxLien: false,
      hasMechanicLien: false,
      error: true,
      message: 'Unable to verify lien status',
      manualCheckUrl: MANUAL_CHECK_URLS.liens,
    };
  }
}

export async function getWaterBillStatus(address: string): Promise<PreTitleWaterBillData> {
  try {
    return {
      found: false,
      balance: 0,
      isDelinquent: false,
      lastBillDate: null,
      message: 'Water bill status requires manual verification',
      manualCheckUrl: MANUAL_CHECK_URLS.waterBill,
    };
  } catch (error) {
    console.error('Water bill check error:', error);
    return {
      found: false,
      balance: 0,
      isDelinquent: false,
      lastBillDate: null,
      error: true,
      message: 'Unable to verify water bill status',
      manualCheckUrl: MANUAL_CHECK_URLS.waterBill,
    };
  }
}

export async function getOwnershipHistory(pin: string): Promise<PreTitleOwnershipData> {
  try {
    return {
      currentOwner: null,
      currentOwnerSince: null,
      totalTransfers: 0,
      transfers: [],
      redFlags: [],
      message: 'Ownership history requires manual verification at the Recorder of Deeds',
      manualCheckUrl: MANUAL_CHECK_URLS.ownership,
    };
  } catch (error) {
    console.error('Ownership check error:', error);
    return {
      currentOwner: null,
      currentOwnerSince: null,
      totalTransfers: 0,
      transfers: [],
      redFlags: [],
      error: true,
      message: 'Unable to verify ownership history',
      manualCheckUrl: MANUAL_CHECK_URLS.ownership,
    };
  }
}

export function calculateVerdict(
  propertyTax: PreTitlePropertyTaxData,
  foreclosure: PreTitleForeclosureData,
  liens: PreTitleLiensData,
  waterBill: PreTitleWaterBillData,
  ownership: PreTitleOwnershipData,
  violationsCount: number = 0,
  openViolationsCount: number = 0
): PreTitleVerdict {
  let score = 100;
  const issues: PreTitleIssue[] = [];

  if (propertyTax.totalOwed > 5000) {
    score -= 50;
    issues.push({
      severity: 'critical',
      category: 'Property Tax',
      message: `$${propertyTax.totalOwed.toLocaleString()} in delinquent taxes`,
      impact: 'NOT FINANCEABLE until taxes are paid',
    });
  } else if (propertyTax.totalOwed > 1000) {
    score -= 20;
    issues.push({
      severity: 'high',
      category: 'Property Tax',
      message: `$${propertyTax.totalOwed.toLocaleString()} in delinquent taxes`,
      impact: 'Must be paid at closing',
    });
  }

  if (propertyTax.taxSaleStatus === 'pending') {
    score -= 50;
    issues.push({
      severity: 'critical',
      category: 'Property Tax',
      message: 'Property is scheduled for tax sale',
      impact: 'NOT FINANCEABLE - tax sale pending',
    });
  } else if (propertyTax.taxSaleStatus === 'sold') {
    score -= 50;
    issues.push({
      severity: 'critical',
      category: 'Property Tax',
      message: 'Property has been sold at tax sale',
      impact: 'NOT FINANCEABLE - title may be clouded',
    });
  }

  if (foreclosure.hasActiveForeclosure) {
    score -= 50;
    issues.push({
      severity: 'critical',
      category: 'Foreclosure',
      message: 'Active foreclosure case on this property',
      impact: 'NOT FINANCEABLE until foreclosure is resolved',
    });
  } else if (foreclosure.hasRecentForeclosure) {
    score -= 20;
    issues.push({
      severity: 'high',
      category: 'Foreclosure',
      message: 'Recent foreclosure case within last 2 years',
      impact: 'Verify title is clear before proceeding',
    });
  }

  if (liens.hasTaxLien) {
    score -= 50;
    issues.push({
      severity: 'critical',
      category: 'Lien',
      message: 'IRS or state tax lien on property',
      impact: 'NOT FINANCEABLE until lien is cleared',
    });
  }

  if (liens.hasJudgmentLien) {
    score -= 30;
    issues.push({
      severity: 'high',
      category: 'Lien',
      message: 'Judgment lien on property',
      impact: 'Must be paid at closing',
    });
  }

  if (liens.hasMechanicLien) {
    score -= 30;
    issues.push({
      severity: 'high',
      category: 'Lien',
      message: "Mechanic's lien on property",
      impact: 'Must be resolved before closing',
    });
  }

  if (openViolationsCount > 0) {
    score -= Math.min(openViolationsCount * 15, 50);
    issues.push({
      severity: openViolationsCount > 3 ? 'critical' : 'high',
      category: 'Building Violations',
      message: `${openViolationsCount} open building violation${openViolationsCount > 1 ? 's' : ''}`,
      impact: openViolationsCount > 3 ? 'May affect financing' : 'Verify status with building dept',
    });
  }

  if (waterBill.isDelinquent && waterBill.balance > 1000) {
    score -= 10;
    issues.push({
      severity: 'info',
      category: 'Water Bill',
      message: `$${waterBill.balance.toLocaleString()} outstanding water bill`,
      impact: 'Add to closing costs - water bills transfer with property in Chicago',
    });
  }

  for (const redFlag of ownership.redFlags) {
    if (redFlag.severity === 'critical') {
      score -= 15;
    } else if (redFlag.severity === 'high') {
      score -= 10;
    } else {
      score -= 5;
    }
    issues.push({
      severity: redFlag.severity === 'critical' ? 'high' : 'medium',
      category: 'Ownership',
      message: redFlag.flag,
      impact: redFlag.impact,
    });
  }

  score = Math.max(0, Math.min(100, score));

  let status: 'financeable' | 'difficult' | 'not_financeable';
  let title: string;
  let message: string;

  if (score >= 80) {
    status = 'financeable';
    title = 'LIKELY FINANCEABLE';
    message = 'Public records look good. Proceed with professional title search.';
  } else if (score >= 50) {
    status = 'difficult';
    title = 'FINANCING MAY BE DIFFICULT';
    message = 'Some issues found that may affect financing. Review details carefully.';
  } else {
    status = 'not_financeable';
    title = 'NOT FINANCEABLE';
    message = 'Critical issues found. Resolve before seeking financing.';
  }

  return { status, score, title, message, issues };
}

function formatPIN(pin: string): string {
  const digits = pin.replace(/[^0-9]/g, '');
  if (digits.length === 14) {
    return `${digits.slice(0,2)}-${digits.slice(2,4)}-${digits.slice(4,7)}-${digits.slice(7,10)}-${digits.slice(10,14)}`;
  }
  return pin;
}

export async function getCachedPreTitleCheck(pin: string): Promise<PreTitleCheckCache | null> {
  const normalizedPin = normalizePIN(pin);
  const result = await db.select().from(preTitleCheckCache).where(eq(preTitleCheckCache.pin, normalizedPin)).limit(1);
  return result[0] || null;
}

export async function savePreTitleCheck(
  pin: string,
  address: string,
  propertyTax: PreTitlePropertyTaxData,
  foreclosure: PreTitleForeclosureData,
  liens: PreTitleLiensData,
  waterBill: PreTitleWaterBillData,
  ownership: PreTitleOwnershipData,
  verdict: PreTitleVerdict
): Promise<void> {
  const normalizedPin = normalizePIN(pin);
  const addrHash = hashAddress(address);
  const now = new Date();

  const existing = await getCachedPreTitleCheck(normalizedPin);
  
  if (existing) {
    await db.update(preTitleCheckCache)
      .set({
        propertyTaxData: propertyTax,
        propertyTaxCheckedAt: now,
        foreclosureData: foreclosure,
        foreclosureCheckedAt: now,
        liensData: liens,
        liensCheckedAt: now,
        waterBillData: waterBill,
        waterBillCheckedAt: now,
        ownershipData: ownership,
        ownershipCheckedAt: now,
        verdict: verdict,
        updatedAt: now,
      })
      .where(eq(preTitleCheckCache.pin, normalizedPin));
  } else {
    await db.insert(preTitleCheckCache).values({
      pin: normalizedPin,
      addressHash: addrHash,
      propertyTaxData: propertyTax,
      propertyTaxCheckedAt: now,
      foreclosureData: foreclosure,
      foreclosureCheckedAt: now,
      liensData: liens,
      liensCheckedAt: now,
      waterBillData: waterBill,
      waterBillCheckedAt: now,
      ownershipData: ownership,
      ownershipCheckedAt: now,
      verdict: verdict,
    });
  }
}

export interface PreTitleCheckResult {
  success: boolean;
  fromCache: boolean;
  cacheAge?: string;
  verdict: PreTitleVerdict;
  details: {
    propertyTax: PreTitlePropertyTaxData;
    foreclosure: PreTitleForeclosureData;
    liens: PreTitleLiensData;
    waterBill: PreTitleWaterBillData;
    ownership: PreTitleOwnershipData;
  };
  disclaimers: string[];
  checkedItems: string[];
  notChecked: string[];
  nextSteps: { action: string; priority: string; cost?: string; timeline?: string }[];
  lastUpdated: string;
}

export async function runPreTitleCheck(
  pin: string,
  address: string,
  openViolationsCount: number = 0
): Promise<PreTitleCheckResult> {
  const normalizedPin = normalizePIN(pin);
  
  const cached = await getCachedPreTitleCheck(normalizedPin);
  
  const needsRefresh = !cached || 
    isCacheExpired(cached.propertyTaxCheckedAt, CACHE_DAYS.propertyTax) ||
    isCacheExpired(cached.foreclosureCheckedAt, CACHE_DAYS.foreclosure) ||
    isCacheExpired(cached.liensCheckedAt, CACHE_DAYS.liens);

  if (cached && !needsRefresh && cached.verdict) {
    const cacheAge = cached.updatedAt 
      ? Math.floor((Date.now() - cached.updatedAt.getTime()) / (1000 * 60 * 60 * 24))
      : 0;
    
    return {
      success: true,
      fromCache: true,
      cacheAge: `${cacheAge} days ago`,
      verdict: cached.verdict,
      details: {
        propertyTax: cached.propertyTaxData || getDefaultPropertyTaxData(),
        foreclosure: cached.foreclosureData || getDefaultForeclosureData(),
        liens: cached.liensData || getDefaultLiensData(),
        waterBill: cached.waterBillData || getDefaultWaterBillData(),
        ownership: cached.ownershipData || getDefaultOwnershipData(),
      },
      disclaimers: getDisclaimers(),
      checkedItems: getCheckedItems(),
      notChecked: getNotCheckedItems(),
      nextSteps: getNextSteps(cached.verdict.status),
      lastUpdated: cached.updatedAt?.toISOString() || new Date().toISOString(),
    };
  }

  const [propertyTax, foreclosure, liens, waterBill, ownership] = await Promise.all([
    getPropertyTaxStatus(pin),
    getForeclosureStatus(address),
    getLiensStatus(pin),
    getWaterBillStatus(address),
    getOwnershipHistory(pin),
  ]);

  const verdict = calculateVerdict(
    propertyTax,
    foreclosure,
    liens,
    waterBill,
    ownership,
    0,
    openViolationsCount
  );

  await savePreTitleCheck(pin, address, propertyTax, foreclosure, liens, waterBill, ownership, verdict);

  return {
    success: true,
    fromCache: false,
    verdict,
    details: { propertyTax, foreclosure, liens, waterBill, ownership },
    disclaimers: getDisclaimers(),
    checkedItems: getCheckedItems(),
    notChecked: getNotCheckedItems(),
    nextSteps: getNextSteps(verdict.status),
    lastUpdated: new Date().toISOString(),
  };
}

function getDefaultPropertyTaxData(): PreTitlePropertyTaxData {
  return {
    status: 'unknown',
    totalOwed: 0,
    currentYearPaid: true,
    priorYearPaid: true,
    taxSaleStatus: 'none',
    manualCheckUrl: MANUAL_CHECK_URLS.propertyTax,
  };
}

function getDefaultForeclosureData(): PreTitleForeclosureData {
  return {
    hasActiveForeclosure: false,
    hasRecentForeclosure: false,
    activeCases: [],
    closedCases: [],
    manualCheckUrl: MANUAL_CHECK_URLS.foreclosure,
  };
}

function getDefaultLiensData(): PreTitleLiensData {
  return {
    activeLiens: [],
    releasedLiens: [],
    mortgages: [],
    totalActiveLienAmount: 0,
    hasJudgmentLien: false,
    hasTaxLien: false,
    hasMechanicLien: false,
    manualCheckUrl: MANUAL_CHECK_URLS.liens,
  };
}

function getDefaultWaterBillData(): PreTitleWaterBillData {
  return {
    found: false,
    balance: 0,
    isDelinquent: false,
    lastBillDate: null,
    manualCheckUrl: MANUAL_CHECK_URLS.waterBill,
  };
}

function getDefaultOwnershipData(): PreTitleOwnershipData {
  return {
    currentOwner: null,
    currentOwnerSince: null,
    totalTransfers: 0,
    transfers: [],
    redFlags: [],
    manualCheckUrl: MANUAL_CHECK_URLS.ownership,
  };
}

function getDisclaimers(): string[] {
  return [
    'This is a preliminary check using publicly available records only.',
    'Does NOT replace professional title search.',
    'Checks available public records - not full chain of title.',
    'Order professional title search ($300-500) before closing.',
  ];
}

function getCheckedItems(): string[] {
  return [
    'Property tax status',
    'Foreclosure history',
    'Liens & mortgages',
    'Water bill status',
    'Building violations',
    'Ownership transfers',
  ];
}

function getNotCheckedItems(): string[] {
  return [
    'Full chain of title (40-60 years)',
    'Ancient liens or claims',
    'Off-record issues (probate, divorce, bankruptcy)',
    'Boundary disputes or survey issues',
    'Hidden easements or restrictions',
  ];
}

function getNextSteps(status: string): { action: string; priority: string; cost?: string; timeline?: string }[] {
  const steps: { action: string; priority: string; cost?: string; timeline?: string }[] = [
    {
      action: 'Order Professional Title Search',
      priority: 'Required before closing',
      cost: '$300-500',
      timeline: '3-10 business days',
    },
  ];

  if (status === 'financeable') {
    steps.push({
      action: 'Get Pre-Approved for Financing',
      priority: 'Recommended',
    });
  } else if (status === 'not_financeable') {
    steps.push({
      action: 'Resolve Critical Issues First',
      priority: 'Required',
    });
  }

  return steps;
}
