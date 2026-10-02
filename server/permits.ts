import fs from 'fs';
import path from 'path';
import { stripCensusUnitArtifact } from './utils/addressNormalize';

interface ContractorInfo {
  type: string;
  name: string;
}

interface BuildingPermit {
  id: string;
  permitNumber: string;
  permitType: string;
  workDescription: string;
  issueDate: string;
  estimatedCost: number | null;
  status: string;
  streetNumber: string;
  streetDirection: string;
  streetName: string;
  ownerName: string | null;
  architectName: string | null;
  architectType: string | null;
  expediterName: string | null;
  contractors: ContractorInfo[];
  /** All four contact slots, including engineers and other design contacts. */
  contacts?: ContractorInfo[];
}

interface BuildingViolation {
  id: string;
  violationDate: string;
  violationCode: string;
  violationDescription: string;
  violationStatus: string;
  statusDate: string;
  streetNumber: string;
  streetDirection: string;
  streetName: string;
}

export interface PermitSummary {
  totalPermits: number;
  mostRecent: {
    date: string;
    type: string;
    status: string;
    cost: number | null;
  } | null;
  byType: {
    newConstruction: number;
    renovation: number;
    repair: number;
    demolition: number;
    other: number;
  };
  totalEstimatedCost: number;
  expiredOrIncomplete: number;
  permits: BuildingPermit[];
  olderPermitsSummary?: {
    count: number;
    earliestYear: number;
    latestYear: number;
    totalEstimatedCost: number;
  } | null;
  olderPermits?: BuildingPermit[];
  constructionTypeInferred?: string | null;
  parseError?: boolean;
  apiError?: boolean;
  parsedAddress?: { streetNumber: string; streetDirection: string; streetName: string };
}

export interface ViolationSummary {
  openViolations: number;
  totalViolationsLast5Years: number;
  violationsByType: Record<string, number>;
  statusBreakdown: {
    open: number;
    complied: number;
    other: number;
  };
  violations: BuildingViolation[];
  olderViolationsSummary?: {
    count: number;
    earliestYear: number;
    latestYear: number;
    hasRepeatPattern: boolean;
    message: string;
  } | null;
  olderViolations?: BuildingViolation[];
  parseError?: boolean;
  apiError?: boolean;
  parsedAddress?: { streetNumber: string; streetDirection: string; streetName: string };
}

interface ParsedAddress {
  streetNumber: string;
  streetDirection: string;
  streetName: string;
}

const SUFFIX_MAP: Record<string, string> = {
  'STREET': 'ST', 'AVENUE': 'AVE', 'DRIVE': 'DR', 'ROAD': 'RD',
  'BOULEVARD': 'BLVD', 'COURT': 'CT', 'PLACE': 'PL', 'LANE': 'LN',
  'TERRACE': 'TER', 'CIRCLE': 'CIR', 'PARKWAY': 'PKWY', 'HIGHWAY': 'HWY',
  'WAY': 'WAY', 'PATH': 'PATH', 'TRAIL': 'TRL', 'PLAZA': 'PLZ'
};

function normalizeSuffix(streetName: string): string {
  for (const [full, abbr] of Object.entries(SUFFIX_MAP)) {
    const fullPattern = new RegExp(`\\s+${full}\\.?$`, 'i');
    if (fullPattern.test(streetName)) {
      return streetName.replace(fullPattern, ` ${abbr}`);
    }
  }
  return streetName.replace(/\.$/, '');
}

function stripStreetSuffix(streetName: string): string {
  const suffixes = ['ST', 'AVE', 'DR', 'RD', 'BLVD', 'CT', 'PL', 'LN', 'TER', 'CIR', 'PKWY', 'HWY', 'WAY', 'PATH', 'TRL', 'PLZ',
    'STREET', 'AVENUE', 'DRIVE', 'ROAD', 'BOULEVARD', 'COURT', 'PLACE', 'LANE', 'TERRACE', 'CIRCLE', 'PARKWAY', 'HIGHWAY', 'TRAIL', 'PLAZA'];
  const pattern = new RegExp(`\\s+(${suffixes.join('|')})\\.?$`, 'i');
  return streetName.replace(pattern, '').trim();
}

function parseAddress(address: string): ParsedAddress | null {
  if (!address || address.trim().length < 3) {
    return null;
  }

  const cleanAddress = address.trim().toUpperCase();
  
  const patterns = [
    /^(\d+)\s+([NSEW]\.?)\s+(.+?)(?:,|\s+CHICAGO|\s+IL\b|$)/i,
    /^(\d+)\s+([NSEW])\s+(.+?)(?:\s+(?:ST|AVE|BLVD|DR|RD|CT|PL|WAY|LN|PKWY|TER|CIR)\.?)(?:,|\s+CHICAGO|\s+IL\b|$|\s)/i,
    /^(\d+)\s+([NSEW])\.?\s+(.+?)(?:,|\s+CHICAGO|\s+IL\b|$)/i,
    /^(\d+)\s+(.+?)(?:,|\s+CHICAGO|\s+IL\b|$)/i,
  ];

  for (const pattern of patterns) {
    const match = cleanAddress.match(pattern);
    if (match) {
      const streetNumber = match[1];
      let streetDirection = '';
      let streetName = '';
      
      if (match.length === 4) {
        streetDirection = match[2].replace('.', '').trim();
        streetName = match[3].trim();
      } else {
        const possibleDir = match[2].trim().split(/\s+/)[0];
        if (/^[NSEW]\.?$/.test(possibleDir)) {
          streetDirection = possibleDir.replace('.', '');
          streetName = match[2].trim().substring(possibleDir.length).trim();
        } else {
          streetName = match[2].trim();
        }
      }
      
      streetName = streetName.replace(/\s+/g, ' ').trim();
      streetName = normalizeSuffix(streetName);
      
      if (streetNumber && streetName) {
        return { streetNumber, streetDirection, streetName };
      }
    }
  }
  
  return null;
}

export function categorizePermitType(workType: string, workDescription: string): keyof PermitSummary['byType'] {
  const type = (workType || '').toLowerCase();
  const desc = (workDescription || '').toLowerCase();
  
  if (type.includes('new') || desc.includes('new construction') || desc.includes('erect')) {
    return 'newConstruction';
  }
  if (type.includes('alteration') || type.includes('renovation') || desc.includes('remodel') || desc.includes('alteration')) {
    return 'renovation';
  }
  if (type.includes('repair') || desc.includes('repair')) {
    return 'repair';
  }
  if (type.includes('wrecking') || type.includes('demolition') || desc.includes('demolish')) {
    return 'demolition';
  }
  return 'other';
}

function categorizeViolationType(code: string, description: string): string {
  const desc = (description || '').toLowerCase();
  const codeStr = (code || '').toLowerCase();
  
  if (desc.includes('fire') || codeStr.includes('fire')) return 'Fire Safety';
  if (desc.includes('electric') || codeStr.includes('electric')) return 'Electrical';
  if (desc.includes('struct') || desc.includes('foundation') || desc.includes('wall')) return 'Structural';
  if (desc.includes('plumb') || desc.includes('water') || desc.includes('sewer')) return 'Plumbing';
  if (desc.includes('heat') || desc.includes('furnace') || desc.includes('hvac')) return 'HVAC';
  if (desc.includes('garbage') || desc.includes('refuse') || desc.includes('sanit')) return 'Sanitation';
  if (desc.includes('exterior') || desc.includes('facade') || desc.includes('roof')) return 'Exterior';
  return 'Other';
}

function inferConstructionTypeFromPermits(allPermits: BuildingPermit[]): string | null {
  // Prioritize new construction permits, then fall back to all permits
  const newConst = allPermits.filter(p =>
    /new construction|new building|erect/i.test(p.permitType + ' ' + p.workDescription)
  );
  const candidates = newConst.length > 0 ? newConst : allPermits;

  const rules: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /steel\s*frame|structural\s*steel|metal\s*frame/i,        label: 'Steel frame' },
    { pattern: /reinforced\s*concrete|r\.?c\.?\s*frame|concrete\s*frame/i, label: 'Reinforced concrete frame' },
    { pattern: /precast|pre-cast/i,                                        label: 'Precast concrete' },
    { pattern: /concrete\s*block|cmu|concrete\s*masonry/i,                 label: 'Concrete masonry (CMU)' },
    { pattern: /heavy\s*timber|timber\s*frame/i,                           label: 'Heavy timber frame' },
    { pattern: /wood\s*frame|frame\s*construction|balloon\s*frame|platform\s*frame/i, label: 'Wood frame' },
    { pattern: /\bmasonry\b|\bbrick\b|\bblock\b/i,                         label: 'Masonry' },
    { pattern: /pre-?engineered\s*metal|metal\s*building/i,                label: 'Pre-engineered metal building' },
    { pattern: /\bconcrete\b/i,                                             label: 'Concrete' },
  ];

  for (const permit of candidates) {
    const text = (permit.permitType + ' ' + permit.workDescription).trim();
    for (const rule of rules) {
      if (rule.pattern.test(text)) {
        return rule.label;
      }
    }
  }
  return null;
}

export async function fetchPermitHistory(address: string): Promise<PermitSummary> {
  const cleaned = stripCensusUnitArtifact(address);
  const parsed = parseAddress(cleaned);
  if (!parsed) {
    return {
      totalPermits: 0,
      mostRecent: null,
      byType: { newConstruction: 0, renovation: 0, repair: 0, demolition: 0, other: 0 },
      totalEstimatedCost: 0,
      expiredOrIncomplete: 0,
      permits: [],
      parseError: true
    };
  }

  const fifteenYearsAgo = new Date();
  fifteenYearsAgo.setFullYear(fifteenYearsAgo.getFullYear() - 15);
  const dateFilter = fifteenYearsAgo.toISOString().split('T')[0];

  let whereClause = `street_number='${parsed.streetNumber}'`;
  if (parsed.streetDirection) {
    whereClause += ` AND street_direction='${parsed.streetDirection}'`;
  }
  
  whereClause += ` AND street_name='${parsed.streetName}'`;
  whereClause += ` AND issue_date >= '${dateFilter}'`;

  const url = `https://data.cityofchicago.org/resource/ydr8-5enu.json?$where=${encodeURIComponent(whereClause)}&$limit=500&$order=issue_date DESC`;

  try {
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' }
    });
    
    if (!response.ok) {
      console.error(`Permit API error: ${response.status}`);
      return {
        totalPermits: 0,
        mostRecent: null,
        byType: { newConstruction: 0, renovation: 0, repair: 0, demolition: 0, other: 0 },
        totalEstimatedCost: 0,
        expiredOrIncomplete: 0,
        permits: [],
        apiError: true,
        parsedAddress: parsed
      };
    }

    const data = await response.json() as any[];
    
    const permits: BuildingPermit[] = data.map((p: any) => {
      let ownerName: string | null = null;
      let architectName: string | null = null;
      let architectType: string | null = null;
      let expediterName: string | null = null;
      const contractors: ContractorInfo[] = [];
      
      for (let i = 1; i <= 4; i++) {
        const contactType = (p[`contact_${i}_type`] || '').toUpperCase();
        const contactName = p[`contact_${i}_name`] || null;
        
        if (contactType === 'OWNER' && !ownerName) {
          ownerName = contactName;
        }
        if (contactType.includes('ARCHITECT') && !architectName) {
          architectName = contactName;
          if (contactType.includes('SELF')) {
            architectType = 'Self-Certified';
          } else {
            architectType = 'Architect';
          }
        }
        // Capture all contractor types
        if (contactType.includes('CONTRACTOR') && contactName) {
          let typeLabel: string;
          const isGeneralContractor = contactType === 'CONTRACTOR-GENERAL CONTRACTOR' || contactType === 'GENERAL CONTRACTOR';
          
          if (isGeneralContractor) {
            // Check if owner is also the general contractor
            if (ownerName && contactName.toUpperCase().trim() === ownerName.toUpperCase().trim()) {
              typeLabel = 'Owner as General Contractor';
            } else {
              typeLabel = 'General Contractor';
            }
          } else {
            // Format: "CONTRACTOR-ELECTRICAL CONTRACTOR" -> "Electrical Contractor"
            let cleaned = contactType.replace('CONTRACTOR-', '').replace(' CONTRACTOR', '');
            cleaned = cleaned.charAt(0) + cleaned.slice(1).toLowerCase();
            typeLabel = cleaned + ' Contractor';
          }
          // Avoid duplicates
          if (!contractors.some(c => c.name === contactName && c.type === typeLabel)) {
            contractors.push({ type: typeLabel, name: contactName });
          }
        }
        if ((contactType === 'EXPEDITER' || contactType === 'EXPEDITOR') && !expediterName) {
          expediterName = contactName;
        }
      }
      
      return {
        id: p.id || p.permit_ || '',
        permitNumber: p.permit_ || '',
        permitType: p.permit_type || '',
        workDescription: p.work_description || '',
        issueDate: p.issue_date || '',
        estimatedCost: p.reported_cost ? parseFloat(p.reported_cost) : null,
        status: p.permit_status || '',
        streetNumber: p.street_number || '',
        streetDirection: p.street_direction || '',
        streetName: p.street_name || '',
        ownerName,
        architectName,
        architectType,
        expediterName,
        contractors,
        contacts: Array.from({ length: 4 }, (_, n) => ({
          type: p[`contact_${n + 1}_type`] || "",
          name: p[`contact_${n + 1}_name`] || "",
        })).filter(c => c.name)
      };
    });

    const fiveYearsAgo = new Date();
    fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
    const fiveYearsAgoDate = fiveYearsAgo.getTime();

    const recentPermits: BuildingPermit[] = [];
    const olderPermits: BuildingPermit[] = [];

    for (const permit of permits) {
      const pDate = new Date(permit.issueDate).getTime();
      if (pDate >= fiveYearsAgoDate) {
        recentPermits.push(permit);
      } else {
        olderPermits.push(permit);
      }
    }

    const byType: PermitSummary['byType'] = {
      newConstruction: 0,
      renovation: 0,
      repair: 0,
      demolition: 0,
      other: 0
    };

    let totalCost = 0;
    let expiredOrIncomplete = 0;

    for (const permit of recentPermits) {
      const category = categorizePermitType(permit.permitType, permit.workDescription);
      byType[category]++;
      
      if (permit.estimatedCost) {
        totalCost += permit.estimatedCost;
      }
      
      const status = (permit.status || '').toLowerCase();
      if (status.includes('expired') || status.includes('revoked') || status.includes('void')) {
        expiredOrIncomplete++;
      }
    }

    const mostRecent = recentPermits.length > 0 ? {
      date: recentPermits[0].issueDate,
      type: recentPermits[0].permitType || recentPermits[0].workDescription.substring(0, 50),
      status: recentPermits[0].status,
      cost: recentPermits[0].estimatedCost
    } : null;

    let olderPermitsSummary = null;
    if (olderPermits.length > 0) {
      const years = olderPermits.map(p => new Date(p.issueDate).getFullYear()).filter(y => !isNaN(y));
      const earliestYear = Math.min(...years);
      const latestYear = Math.max(...years);
      let olderTotalCost = 0;
      for (const p of olderPermits) {
        if (p.estimatedCost) olderTotalCost += p.estimatedCost;
      }
      olderPermitsSummary = {
        count: olderPermits.length,
        earliestYear,
        latestYear,
        totalEstimatedCost: olderTotalCost,
      };
    }

    const constructionTypeInferred = inferConstructionTypeFromPermits([...recentPermits, ...olderPermits]);

    return {
      totalPermits: recentPermits.length,
      mostRecent,
      byType,
      totalEstimatedCost: totalCost,
      expiredOrIncomplete,
      permits: recentPermits,
      olderPermitsSummary,
      olderPermits,
      constructionTypeInferred,
      parsedAddress: parsed
    };
  } catch (error) {
    console.error('Error fetching permits:', error);
    return {
      totalPermits: 0,
      mostRecent: null,
      byType: { newConstruction: 0, renovation: 0, repair: 0, demolition: 0, other: 0 },
      totalEstimatedCost: 0,
      expiredOrIncomplete: 0,
      permits: [],
      apiError: true,
      parsedAddress: parsed
    };
  }
}

export async function fetchViolationHistory(address: string): Promise<ViolationSummary> {
  const cleaned = address.replace(/,?\s+unit\s+[a-z]{1,4}(?!\w*\d)/gi, '').trim();
  const parsed = parseAddress(cleaned);
  if (!parsed) {
    return {
      openViolations: 0,
      totalViolationsLast5Years: 0,
      violationsByType: {},
      statusBreakdown: { open: 0, complied: 0, other: 0 },
      violations: [],
      parseError: true
    };
  }

  const fifteenYearsAgo = new Date();
  fifteenYearsAgo.setFullYear(fifteenYearsAgo.getFullYear() - 15);
  const dateFilter = fifteenYearsAgo.toISOString().split('T')[0];

  const strippedStreetName = stripStreetSuffix(parsed.streetName);
  
  let whereClause = `street_number='${parsed.streetNumber}'`;
  if (parsed.streetDirection) {
    whereClause += ` AND street_direction='${parsed.streetDirection}'`;
  }
  
  whereClause += ` AND street_name='${strippedStreetName}'`;
  // Fetch ALL violations for the address to capture historical records for summary
  // We'll filter by date/status in code to separate recent vs older

  const url = `https://data.cityofchicago.org/resource/22u3-xenr.json?$where=${encodeURIComponent(whereClause)}&$limit=500&$order=violation_date DESC`;

  try {
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' }
    });
    
    if (!response.ok) {
      console.error(`Violations API error: ${response.status}`);
      return {
        openViolations: 0,
        totalViolationsLast5Years: 0,
        violationsByType: {},
        statusBreakdown: { open: 0, complied: 0, other: 0 },
        violations: [],
        apiError: true,
        parsedAddress: parsed
      };
    }

    const data = await response.json() as any[];
    
    const allViolations: BuildingViolation[] = data.map((v: any) => ({
      id: v.id || '',
      violationDate: v.violation_date || '',
      violationCode: v.violation_code || '',
      violationDescription: v.violation_description || '',
      violationStatus: v.violation_status || '',
      statusDate: v.violation_status_date || '',
      streetNumber: v.street_number || '',
      streetDirection: v.street_direction || '',
      streetName: v.street_name || ''
    }));

    const fiveYearsAgoForViolations = new Date();
    fiveYearsAgoForViolations.setFullYear(fiveYearsAgoForViolations.getFullYear() - 5);
    const fiveYearsAgoDate = fiveYearsAgoForViolations.getTime();
    
    // Separate recent (last 5 years) vs older violations
    const recentOpenViolations: BuildingViolation[] = [];
    const allRecentViolations: BuildingViolation[] = [];
    const olderViolations: BuildingViolation[] = [];
    
    for (const v of allViolations) {
      const vDate = new Date(v.violationDate).getTime();
      const isOpen = (v.violationStatus || '').toUpperCase() === 'OPEN';
      
      if (vDate >= fiveYearsAgoDate) {
        allRecentViolations.push(v);
        if (isOpen) {
          recentOpenViolations.push(v);
        }
      } else {
        olderViolations.push(v);
      }
    }

    // Calculate stats for all recent violations
    const violationsByType: Record<string, number> = {};
    const statusBreakdown = { open: 0, complied: 0, other: 0 };

    for (const violation of allRecentViolations) {
      const type = categorizeViolationType(violation.violationCode, violation.violationDescription);
      violationsByType[type] = (violationsByType[type] || 0) + 1;
      
      const status = (violation.violationStatus || '').toUpperCase();
      if (status === 'OPEN') {
        statusBreakdown.open++;
      } else if (status === 'COMPLIED' || status === 'CLOSED') {
        statusBreakdown.complied++;
      } else {
        statusBreakdown.other++;
      }
    }

    // Analyze older violations for pattern detection
    let olderViolationsSummary = null;
    if (olderViolations.length > 0) {
      const years = olderViolations.map(v => new Date(v.violationDate).getFullYear()).filter(y => !isNaN(y));
      const earliestYear = Math.min(...years);
      const latestYear = Math.max(...years);
      
      // Detect repeat patterns: multiple inspection dates or multiple years
      const uniqueDates = new Set(olderViolations.map(v => v.violationDate.split('T')[0]));
      const uniqueYears = new Set(years);
      const hasRepeatPattern = uniqueDates.size > 1 || uniqueYears.size > 1;
      
      olderViolationsSummary = {
        count: olderViolations.length,
        earliestYear,
        latestYear,
        hasRepeatPattern,
        message: hasRepeatPattern
          ? `${olderViolations.length} records found across ${earliestYear}–${latestYear}, indicating repeated enforcement activity under prior ownership.`
          : `${olderViolations.length} records found. These are commonly marked open in public datasets despite being resolved by DOB. No repeat patterns detected.`
      };
    }

    return {
      openViolations: recentOpenViolations.length,
      totalViolationsLast5Years: allRecentViolations.length,
      violationsByType,
      statusBreakdown,
      violations: recentOpenViolations,
      olderViolationsSummary,
      olderViolations,
      parsedAddress: parsed
    };
  } catch (error) {
    console.error('Error fetching violations:', error);
    return {
      openViolations: 0,
      totalViolationsLast5Years: 0,
      violationsByType: {},
      statusBreakdown: { open: 0, complied: 0, other: 0 },
      violations: [],
      apiError: true,
      parsedAddress: parsed
    };
  }
}

// Community-area crime ranking (cached citywide aggregate, 77 community areas)
// Grouped by area + primary_type + year over the last ~4 calendar years so we can
// compute violent/property splits, per-1,000-resident rates, and multi-year trends.
let _tractRankingCache: { data: { community_area: string; primary_type: string; year: string; count: string }[]; ts: number } | null = null;
const TRACT_CACHE_TTL = 86400000; // 24 hours

// FBI-style violent crime categories (CPD primary_type values); everything else is property/other
export const VIOLENT_TYPES = new Set([
  'HOMICIDE', 'CRIMINAL SEXUAL ASSAULT', 'CRIM SEXUAL ASSAULT', 'ROBBERY',
  'ASSAULT', 'BATTERY', 'KIDNAPPING', 'HUMAN TRAFFICKING', 'SEX OFFENSE',
]);

// Community-area population (2023 ACS, checked-in cache) keyed by CPD area number
let _caPopulations: Record<string, number> | null = null;
function getCaPopulations(): Record<string, number> {
  if (_caPopulations) return _caPopulations;
  const map: Record<string, number> = {};
  try {
    const raw = fs.readFileSync(path.join(import.meta.dirname, 'data/demographics/acs_community_area.json'), 'utf-8');
    const rows = JSON.parse(raw) as { community_area: string; total_population: string }[];
    for (const r of rows) {
      const num = COMMUNITY_AREA_NUMBERS[r.community_area.toLowerCase().trim()];
      const pop = parseFloat(r.total_population);
      if (num && Number.isFinite(pop) && pop > 0) map[num] = pop;
    }
  } catch (err) {
    console.error('Crime ranking: failed to load community-area populations:', err);
  }
  _caPopulations = map;
  return map;
}

function crimeTier(saferThanPercent: number): string {
  if (saferThanPercent >= 75) return 'Low crime';
  if (saferThanPercent >= 50) return 'Below-average crime';
  if (saferThanPercent >= 30) return 'Average crime';
  if (saferThanPercent >= 15) return 'Above-average crime';
  return 'High crime';
}

// Map community area name (Title Case or UPPER) → CPD community_area number string
const COMMUNITY_AREA_NUMBERS: Record<string, string> = {
  'rogers park': '1', 'west ridge': '2', 'uptown': '3', 'lincoln square': '4',
  'north center': '5', 'lake view': '6', 'lincoln park': '7', 'near north side': '8',
  'edison park': '9', 'norwood park': '10', 'jefferson park': '11', 'forest glen': '12',
  'north park': '13', 'albany park': '14', 'portage park': '15', 'irving park': '16',
  'dunning': '17', 'montclare': '18', 'belmont cragin': '19', 'hermosa': '20',
  'avondale': '21', 'logan square': '22', 'humboldt park': '23', 'west town': '24',
  'austin': '25', 'west garfield park': '26', 'east garfield park': '27', 'near west side': '28',
  'north lawndale': '29', 'south lawndale': '30', 'lower west side': '31', 'loop': '32',
  'near south side': '33', 'armour square': '34', 'douglas': '35', 'oakland': '36',
  'fuller park': '37', 'grand boulevard': '38', 'kenwood': '39', 'washington park': '40',
  'hyde park': '41', 'woodlawn': '42', 'south shore': '43', 'chatham': '44',
  'avalon park': '45', 'south chicago': '46', 'burnside': '47', 'calumet heights': '48',
  'roseland': '49', 'pullman': '50', 'south deering': '51', 'east side': '52',
  'west pullman': '53', 'riverdale': '54', 'hegewisch': '55', 'garfield ridge': '56',
  'archer heights': '57', 'brighton park': '58', 'mckinley park': '59', 'bridgeport': '60',
  'new city': '61', 'west elsdon': '62', 'gage park': '63', 'clearing': '64',
  'west lawn': '65', 'chicago lawn': '66', 'west englewood': '67', 'englewood': '68',
  'greater grand crossing': '69', 'ashburn': '70', 'auburn gresham': '71', 'beverly': '72',
  'washington heights': '73', 'mount greenwood': '74', 'morgan park': '75',
  'ohare': '76', "o'hare": '76', 'edgewater': '77',
};

export interface CrimeCategoryRanking {
  count: number;
  ratePer1000: number | null;
  saferThanPercent: number;
  tier: string;
}

export async function fetchCrimeTractRanking(communityAreaName: string): Promise<{
  tractCount: number;
  saferThanPercent: number;
  cityMedianCount: number;
  totalTracts: number;
  tier: string;
  communityArea: string;
  population: number | null;
  perCapita: boolean;
  violent: CrimeCategoryRanking;
  property: CrimeCategoryRanking;
  trend: { years: { year: number; count: number }[]; yoyPercent: number | null; threeYearPercent: number | null } | null;
} | null> {
  try {
    const areaKey = communityAreaName.toLowerCase().trim();
    const areaNum = COMMUNITY_AREA_NUMBERS[areaKey];
    if (!areaNum) {
      console.warn(`Crime ranking: unknown community area "${communityAreaName}"`);
      return null;
    }

    const now = Date.now();
    const currentYear = new Date().getFullYear();
    const startYear = currentYear - 3; // 3 full prior years + current YTD
    let rows: { community_area: string; primary_type: string; year: string; count: string }[];

    if (_tractRankingCache && now - _tractRankingCache.ts < TRACT_CACHE_TTL) {
      rows = _tractRankingCache.data;
    } else {
      const url = `https://data.cityofchicago.org/resource/ijzp-q8t2.json?$select=community_area,primary_type,year,count(*) as count&$where=${encodeURIComponent(`year >= ${startYear} AND community_area IS NOT NULL`)}&$group=community_area,primary_type,year&$limit=50000`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) {
        console.error('Crime ranking fetch failed:', res.status, await res.text());
        return null;
      }
      rows = await res.json() as typeof rows;
      _tractRankingCache = { data: rows, ts: now };
      console.log(`Crime ranking: loaded ${rows.length} area/type/year rows`);
    }

    const populations = getCaPopulations();

    // Ranking window: last full calendar year only, so per-1,000 rates are true
    // annual rates and the percentile doesn't shift with the current partial year
    const rankYear = currentYear - 1;
    // Per-area aggregates over the ranking window
    const totals: Record<string, { all: number; violent: number; property: number }> = {};
    // Per-year totals for the target area (trend)
    const targetYearTotals: Record<number, number> = {};

    for (const r of rows) {
      const num = String(parseInt(r.community_area, 10));
      const year = parseInt(r.year, 10);
      const count = parseInt(r.count, 10);
      if (!Number.isFinite(year) || !Number.isFinite(count)) continue;
      if (num === areaNum) targetYearTotals[year] = (targetYearTotals[year] || 0) + count;
      if (year !== rankYear) continue;
      const t = totals[num] || (totals[num] = { all: 0, violent: 0, property: 0 });
      t.all += count;
      if (VIOLENT_TYPES.has(r.primary_type?.toUpperCase?.() || '')) t.violent += count;
      else t.property += count;
    }

    const areaNums = Object.keys(totals);
    const target = totals[areaNum] || { all: 0, violent: 0, property: 0 };
    const population = populations[areaNum] ?? null;

    // Legacy overall raw-count percentile (kept for backwards compatibility)
    const allCounts = areaNums.map(n => totals[n].all).sort((a, b) => a - b);
    const cityMedianCount = allCounts[Math.floor(allCounts.length / 2)] ?? 0;
    const saferThanPercent = Math.round((allCounts.filter(c => c > target.all).length / Math.max(1, allCounts.length)) * 100);

    // Per-capita category ranking: compare rates per 1,000 residents across areas with known population
    const rankCategory = (key: 'violent' | 'property'): CrimeCategoryRanking => {
      const count = target[key];
      const rated = areaNums
        .filter(n => populations[n])
        .map(n => totals[n][key] / populations[n] * 1000);
      if (population && rated.length >= 10) {
        const rate = count / population * 1000;
        const pct = Math.round((rated.filter(r => r > rate).length / rated.length) * 100);
        return { count, ratePer1000: Math.round(rate * 10) / 10, saferThanPercent: pct, tier: crimeTier(pct) };
      }
      // Fallback: raw-count percentile if population unknown
      const counts = areaNums.map(n => totals[n][key]);
      const pct = Math.round((counts.filter(c => c > count).length / Math.max(1, counts.length)) * 100);
      return { count, ratePer1000: null, saferThanPercent: pct, tier: crimeTier(pct) };
    };

    // Trend: full calendar years only (current partial year would skew the comparison)
    const trendYears = [currentYear - 3, currentYear - 2, currentYear - 1]
      .filter(y => targetYearTotals[y] != null)
      .map(y => ({ year: y, count: targetYearTotals[y] }));
    let trend: { years: { year: number; count: number }[]; yoyPercent: number | null; threeYearPercent: number | null } | null = null;
    if (trendYears.length >= 2) {
      const last = trendYears[trendYears.length - 1];
      const prev = trendYears[trendYears.length - 2];
      const first = trendYears[0];
      const yoyPercent = prev.count > 0 ? Math.round(((last.count - prev.count) / prev.count) * 100) : null;
      const threeYearPercent = first.year !== prev.year && first.count > 0 ? Math.round(((last.count - first.count) / first.count) * 100) : null;
      trend = { years: trendYears, yoyPercent, threeYearPercent };
    }

    return {
      tractCount: target.all,
      saferThanPercent,
      cityMedianCount,
      totalTracts: allCounts.length,
      tier: crimeTier(saferThanPercent),
      communityArea: communityAreaName,
      population,
      perCapita: population != null,
      violent: rankCategory('violent'),
      property: rankCategory('property'),
      trend,
    };
  } catch (err) {
    console.error('Crime tract ranking error:', err);
    return null;
  }
}

// Crime statistics within radius
export async function fetchCrimeStats(lat: number, lng: number, radiusMiles: number = 0.25): Promise<{
  totalCrimes: number;
  crimesByType: Record<string, number>;
  timeframe: string;
  apiError?: boolean;
}> {
  // Convert miles to meters (0.25 miles = ~402 meters)
  const radiusMeters = radiusMiles * 1609.34;
  
  // Get crimes from last 12 months
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const dateFilter = oneYearAgo.toISOString().split('T')[0];
  
  const whereClause = `within_circle(location, ${lat}, ${lng}, ${radiusMeters}) AND date_of_occurrence >= '${dateFilter}'`;
  
  try {
    // Get total count
    const countUrl = `https://data.cityofchicago.org/resource/x2n5-8w5q.json?$where=${encodeURIComponent(whereClause)}&$select=count(*)`;
    const countResponse = await fetch(countUrl, {
      headers: { 'Accept': 'application/json' }
    });
    
    if (!countResponse.ok) {
      console.error(`Crime API count error: ${countResponse.status}`);
      return { totalCrimes: 0, crimesByType: {}, timeframe: 'Last 12 months', apiError: true };
    }
    
    const countData = await countResponse.json() as any[];
    const totalCrimes = parseInt(countData[0]?.count || '0', 10);
    
    // Get breakdown by crime type
    const typeUrl = `https://data.cityofchicago.org/resource/x2n5-8w5q.json?$where=${encodeURIComponent(whereClause)}&$select=_primary_decsription,count(*)&$group=_primary_decsription&$order=count(*) DESC&$limit=10`;
    const typeResponse = await fetch(typeUrl, {
      headers: { 'Accept': 'application/json' }
    });
    
    const crimesByType: Record<string, number> = {};
    if (typeResponse.ok) {
      const typeData = await typeResponse.json() as any[];
      for (const item of typeData) {
        if (item._primary_decsription) {
          crimesByType[item._primary_decsription] = parseInt(item.count || '0', 10);
        }
      }
    }
    
    return {
      totalCrimes,
      crimesByType,
      timeframe: 'Last 12 months'
    };
  } catch (error) {
    console.error('Error fetching crime stats:', error);
    return { totalCrimes: 0, crimesByType: {}, timeframe: 'Last 12 months', apiError: true };
  }
}
