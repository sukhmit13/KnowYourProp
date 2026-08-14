import * as fs from 'fs';
import * as path from 'path';
import { classifyPermitSpecialty, normalizeContractorName, generateContractorSlug, SPECIALTY_DISPLAY_NAMES } from '../server/utils/contractorClassification';

const COMMUNITY_AREA_NAMES: Record<number, string> = {
  1: "Rogers Park", 2: "West Ridge", 3: "Uptown", 4: "Lincoln Square", 5: "North Center",
  6: "Lake View", 7: "Lincoln Park", 8: "Near North Side", 9: "Edison Park", 10: "Norwood Park",
  11: "Jefferson Park", 12: "Forest Glen", 13: "North Park", 14: "Albany Park", 15: "Portage Park",
  16: "Irving Park", 17: "Dunning", 18: "Montclare", 19: "Belmont Cragin", 20: "Hermosa",
  21: "Avondale", 22: "Logan Square", 23: "Humboldt Park", 24: "West Town", 25: "Austin",
  26: "West Garfield Park", 27: "East Garfield Park", 28: "Near West Side", 29: "North Lawndale",
  30: "South Lawndale", 31: "Lower West Side", 32: "Loop", 33: "Near South Side", 34: "Armour Square",
  35: "Douglas", 36: "Oakland", 37: "Fuller Park", 38: "Grand Boulevard", 39: "Kenwood",
  40: "Washington Park", 41: "Hyde Park", 42: "Woodlawn", 43: "South Shore", 44: "Chatham",
  45: "Avalon Park", 46: "South Chicago", 47: "Burnside", 48: "Calumet Heights", 49: "Roseland",
  50: "Pullman", 51: "South Deering", 52: "East Side", 53: "West Pullman", 54: "Riverdale",
  55: "Hegewisch", 56: "Garfield Ridge", 57: "Archer Heights", 58: "Brighton Park", 59: "McKinley Park",
  60: "Bridgeport", 61: "New City", 62: "West Elsdon", 63: "Gage Park", 64: "Clearing",
  65: "West Lawn", 66: "Chicago Lawn", 67: "West Englewood", 68: "Englewood", 69: "Greater Grand Crossing",
  70: "Ashburn", 71: "Auburn Gresham", 72: "Beverly", 73: "Washington Heights", 74: "Mount Greenwood",
  75: "Morgan Park", 76: "O'Hare", 77: "Edgewater"
};

interface RawPermit {
  id?: string;
  permit_?: string;
  permit_type?: string;
  work_description?: string;
  issue_date?: string;
  reported_cost?: string;
  street_number?: string;
  street_direction?: string;
  street_name?: string;
  suffix?: string;
  community_area?: string;
  ward?: string;
  contact_1_name?: string;
  contact_1_type?: string;
  contact_2_name?: string;
  contact_2_type?: string;
  contact_3_name?: string;
  contact_3_type?: string;
}

interface ContractorData {
  id: string;
  name: string;
  totalPermits: number;
  yearsActive: number;
  firstPermitDate: string;
  lastPermitDate: string;
  isActive: boolean;
  primarySpecialty: string;
  specializationScore: number;
  specialtyBreakdown: Record<string, number>;
  secondarySpecialties: string[];
  topNeighborhoods: { name: string; communityArea: number; count: number }[];
  totalReportedValue: number;
  avgProjectValue: number;
  permitsByYear: Record<string, number>;
  recentActivity: number;
  recentProjects: {
    address: string;
    date: string;
    specialty: string;
    description: string;
    reportedValue: number;
  }[];
}

interface ContractorIndex {
  contractors: ContractorData[];
  specialtyIndexes: Record<string, string[]>;
  neighborhoodIndexes: Record<string, string[]>;
  lastUpdated: string;
  totalContractors: number;
  totalPermits: number;
  specialtyCounts: Record<string, number>;
}

async function fetchAllPermits(): Promise<RawPermit[]> {
  const allPermits: RawPermit[] = [];
  const limit = 50000;
  let offset = 0;
  
  const fiveYearsAgo = new Date();
  fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
  const dateFilter = fiveYearsAgo.toISOString().split('T')[0];
  
  console.log(`Fetching permits from ${dateFilter} onwards...`);
  
  while (true) {
    const url = `https://data.cityofchicago.org/resource/ydr8-5enu.json?$limit=${limit}&$offset=${offset}&$where=issue_date >= '${dateFilter}'&$order=issue_date DESC`;
    
    console.log(`Fetching batch at offset ${offset}...`);
    
    try {
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' }
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json() as RawPermit[];
      console.log(`  Received ${data.length} permits`);
      
      if (data.length === 0) break;
      
      allPermits.push(...data);
      offset += limit;
      
      if (data.length < limit) break;
      
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      // Fail hard: a partial permit set must never be written as a "successful"
      // rebuild, or the rankings would silently lose contractors/permits.
      throw new Error(`Fetch failed at offset ${offset}: ${error instanceof Error ? error.message : error}`);
    }
  }
  
  console.log(`Total permits fetched: ${allPermits.length}`);
  return allPermits;
}

function extractContractor(permit: RawPermit): string | null {
  for (let i = 1; i <= 3; i++) {
    const contactType = (permit[`contact_${i}_type` as keyof RawPermit] as string || '').toUpperCase();
    const contactName = permit[`contact_${i}_name` as keyof RawPermit] as string || null;
    
    if (contactType.includes('CONTRACTOR') && contactName) {
      return normalizeContractorName(contactName);
    }
  }
  return null;
}

function formatAddress(permit: RawPermit): string {
  const parts = [
    permit.street_number,
    permit.street_direction,
    permit.street_name,
    permit.suffix
  ].filter(Boolean);
  return parts.join(' ');
}

async function buildContractorIndex(): Promise<void> {
  console.log('Building contractor index...\n');
  
  const permits = await fetchAllPermits();
  
  const contractorPermits = new Map<string, RawPermit[]>();
  
  for (const permit of permits) {
    const contractor = extractContractor(permit);
    if (!contractor || contractor === 'OWNER') continue;
    
    if (!contractorPermits.has(contractor)) {
      contractorPermits.set(contractor, []);
    }
    contractorPermits.get(contractor)!.push(permit);
  }
  
  console.log(`\nFound ${contractorPermits.size} unique contractors`);
  
  const contractors: ContractorData[] = [];
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  
  for (const [name, permitList] of contractorPermits.entries()) {
    if (permitList.length < 3) continue;
    
    const specialtyCount: Record<string, number> = {};
    const neighborhoodCount: Record<number, number> = {};
    const yearCount: Record<string, number> = {};
    let totalValue = 0;
    const costs: number[] = [];
    let recentCount = 0;
    
    const sortedPermits = [...permitList].sort((a, b) => 
      new Date(b.issue_date || 0).getTime() - new Date(a.issue_date || 0).getTime()
    );
    
    const dates = permitList
      .map(p => p.issue_date ? new Date(p.issue_date) : null)
      .filter((d): d is Date => d !== null && !isNaN(d.getTime()));
    
    if (dates.length === 0) continue;
    
    const firstDate = new Date(Math.min(...dates.map(d => d.getTime())));
    const lastDate = new Date(Math.max(...dates.map(d => d.getTime())));
    
    for (const permit of permitList) {
      const classification = classifyPermitSpecialty({
        work_description: permit.work_description,
        permit_type: permit.permit_type
      });
      for (const specialty of classification.all) {
        specialtyCount[specialty] = (specialtyCount[specialty] || 0) + 1;
      }
      
      if (permit.community_area) {
        const ca = parseInt(permit.community_area, 10);
        if (!isNaN(ca)) {
          neighborhoodCount[ca] = (neighborhoodCount[ca] || 0) + 1;
        }
      }
      
      if (permit.issue_date) {
        const year = permit.issue_date.substring(0, 4);
        yearCount[year] = (yearCount[year] || 0) + 1;
        
        const issueDate = new Date(permit.issue_date);
        if (issueDate >= ninetyDaysAgo) {
          recentCount++;
        }
      }
      
      if (permit.reported_cost) {
        const cost = parseFloat(permit.reported_cost);
        if (!isNaN(cost) && cost > 0) {
          totalValue += cost;
          costs.push(cost);
        }
      }
    }
    
    let avgValue = 0;
    if (costs.length > 0) {
      costs.sort((a, b) => a - b);
      const trimStart = Math.floor(costs.length * 0.05);
      const trimEnd = Math.ceil(costs.length * 0.95);
      const trimmedCosts = costs.slice(trimStart, trimEnd);
      if (trimmedCosts.length > 0) {
        avgValue = Math.round(trimmedCosts.reduce((a, b) => a + b, 0) / trimmedCosts.length);
      }
    }
    
    const sortedSpecialties = Object.entries(specialtyCount)
      .sort((a, b) => b[1] - a[1]);
    const primarySpecialty = sortedSpecialties[0]?.[0] || 'general';
    const primaryCount = sortedSpecialties[0]?.[1] || 0;
    const specializationScore = Math.round((primaryCount / permitList.length) * 100);
    const secondarySpecialties = sortedSpecialties
      .slice(1)
      .filter(([_, count]) => count >= 10)
      .map(([specialty]) => specialty);
    
    const topNeighborhoods = Object.entries(neighborhoodCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([ca, count]) => ({
        name: COMMUNITY_AREA_NAMES[parseInt(ca)] || `Area ${ca}`,
        communityArea: parseInt(ca),
        count
      }));
    
    const yearsActive = Math.round(
      (lastDate.getTime() - firstDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000) * 10
    ) / 10;
    
    const recentProjects = sortedPermits.slice(0, 20).map(p => {
      const classification = classifyPermitSpecialty({
        work_description: p.work_description,
        permit_type: p.permit_type
      });
      return {
        address: formatAddress(p),
        date: p.issue_date || '',
        specialty: classification.primary,
        description: (p.work_description || '').substring(0, 100),
        reportedValue: p.reported_cost ? parseFloat(p.reported_cost) : 0
      };
    });
    
    contractors.push({
      id: generateContractorSlug(name),
      name,
      totalPermits: permitList.length,
      yearsActive: Math.max(yearsActive, 0.1),
      firstPermitDate: firstDate.toISOString().split('T')[0],
      lastPermitDate: lastDate.toISOString().split('T')[0],
      isActive: lastDate >= thirtyDaysAgo,
      primarySpecialty,
      specializationScore,
      specialtyBreakdown: specialtyCount,
      secondarySpecialties,
      topNeighborhoods,
      totalReportedValue: Math.round(totalValue),
      avgProjectValue: avgValue,
      permitsByYear: yearCount,
      recentActivity: recentCount,
      recentProjects
    });
  }
  
  contractors.sort((a, b) => b.totalPermits - a.totalPermits);
  
  const specialtyIndexes: Record<string, string[]> = {};
  const neighborhoodIndexes: Record<string, string[]> = {};
  const specialtyCounts: Record<string, number> = {};
  
  for (const specialty of Object.keys(SPECIALTY_DISPLAY_NAMES)) {
    const matching = contractors
      .filter(c => c.primarySpecialty === specialty || c.specialtyBreakdown[specialty] > 0)
      .sort((a, b) => (b.specialtyBreakdown[specialty] || 0) - (a.specialtyBreakdown[specialty] || 0))
      .map(c => c.id);
    specialtyIndexes[specialty] = matching;
    specialtyCounts[specialty] = matching.length;
  }
  
  for (const [caNum, caName] of Object.entries(COMMUNITY_AREA_NAMES)) {
    const caId = parseInt(caNum);
    const matching = contractors
      .filter(c => c.topNeighborhoods.some(n => n.communityArea === caId))
      .sort((a, b) => {
        const aCount = a.topNeighborhoods.find(n => n.communityArea === caId)?.count || 0;
        const bCount = b.topNeighborhoods.find(n => n.communityArea === caId)?.count || 0;
        return bCount - aCount;
      })
      .map(c => c.id);
    neighborhoodIndexes[caName] = matching;
  }
  
  const index: ContractorIndex = {
    contractors,
    specialtyIndexes,
    neighborhoodIndexes,
    lastUpdated: new Date().toISOString(),
    totalContractors: contractors.length,
    totalPermits: permits.length,
    specialtyCounts
  };
  
  // Sanity check before publishing — 5 years of Chicago permits is always in
  // the six figures; a much smaller set means the fetch was incomplete.
  if (permits.length < 100_000 || contractors.length < 1_000) {
    throw new Error(`Refusing to write suspiciously small index (${permits.length} permits, ${contractors.length} contractors)`);
  }

  // Atomic write: build to a temp file, then rename over the live file.
  const outputPath = path.join(process.cwd(), 'server/data/contractors/rankings.json');
  const tmpPath = `${outputPath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(index, null, 2));
  fs.renameSync(tmpPath, outputPath);
  
  console.log(`\nContractor index saved to ${outputPath}`);
  console.log(`Total contractors indexed: ${contractors.length}`);
  console.log(`Total permits processed: ${permits.length}`);
  console.log('\nTop 10 contractors by permit count:');
  contractors.slice(0, 10).forEach((c, i) => {
    console.log(`  ${i + 1}. ${c.name} - ${c.totalPermits} permits (${SPECIALTY_DISPLAY_NAMES[c.primarySpecialty] || c.primarySpecialty})`);
  });
}

buildContractorIndex().catch((err) => {
  console.error(err);
  process.exit(1);
});
