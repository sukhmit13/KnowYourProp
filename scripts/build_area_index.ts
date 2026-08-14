import * as fs from 'fs';
import * as path from 'path';
import * as turf from '@turf/turf';
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from 'geojson';

const DATA_DIR = path.join(process.cwd(), 'server', 'data');
const OUTPUT_FILE = path.join(DATA_DIR, 'area_index.json');

interface SBIFZone {
  name: string;
  tifId?: string;
}

interface AreaData {
  sbifZones: SBIFZone[];
  nmtcTotalTracts: number;
  nmtcEligibleTracts: number;
  nmtcCoveragePct: number;
}

interface AreaIndex {
  byZip: Record<string, AreaData>;
  byCommunityArea: Record<string, AreaData>;
  topZipsByChildcareNeed: string[];
  topCommunityAreasByChildcareNeed: string[];
}

function loadGeoJSON(filename: string): FeatureCollection | null {
  try {
    const filePath = path.join(DATA_DIR, filename);
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (err) {
    console.error(`Error loading ${filename}:`, err);
  }
  return null;
}

function getFeaturePolygon(feature: Feature): Feature<Polygon | MultiPolygon> | null {
  if (feature.geometry && (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon')) {
    return feature as Feature<Polygon | MultiPolygon>;
  }
  return null;
}

function computeIntersection(
  areaPolygon: Feature<Polygon | MultiPolygon>,
  targetFeatures: FeatureCollection,
  nameField: string
): string[] {
  const intersecting: string[] = [];
  
  for (const feature of targetFeatures.features) {
    const targetPoly = getFeaturePolygon(feature);
    if (!targetPoly) continue;
    
    try {
      const intersection = turf.intersect(
        turf.featureCollection([areaPolygon, targetPoly])
      );
      if (intersection) {
        const name = feature.properties?.[nameField] || 'Unknown';
        if (!intersecting.includes(name)) {
          intersecting.push(name);
        }
      }
    } catch (e) {
    }
  }
  
  return intersecting;
}

function loadChildcareData(): { byZip: Map<string, number>, byCommunity: Map<string, number> } {
  const byZip = new Map<string, number>();
  const byCommunity = new Map<string, number>();
  
  try {
    const communityPath = path.join(DATA_DIR, 'community_area_childcare.json');
    if (fs.existsSync(communityPath)) {
      const data = JSON.parse(fs.readFileSync(communityPath, 'utf-8'));
      for (const [name, item] of Object.entries(data)) {
        const record = item as { childrenUnder5?: number; licensedSlots?: number };
        const children = record.childrenUnder5 || 0;
        const slots = record.licensedSlots || 0;
        if (name && children > 0) {
          const ratio = slots > 0 ? children / slots : Infinity;
          byCommunity.set(name.toUpperCase().trim(), ratio);
        }
      }
    }
  } catch (err) {
    console.error('Error loading community childcare data:', err);
  }
  
  return { byZip, byCommunity };
}

async function buildAreaIndex(): Promise<void> {
  console.log('Building area index...');
  
  const zctaData = loadGeoJSON('chicago_zcta.geojson');
  const communityData = loadGeoJSON('chicago_community_areas.geojson');
  const tifData = loadGeoJSON('chicago_tif.geojson');
  
  if (!zctaData) {
    console.error('ZCTA data not found');
    return;
  }
  if (!communityData) {
    console.error('Community areas data not found');
    return;
  }
  
  const index: AreaIndex = {
    byZip: {},
    byCommunityArea: {},
    topZipsByChildcareNeed: [],
    topCommunityAreasByChildcareNeed: []
  };
  
  const TIF_NAME_FIELD = 'name';
  
  console.log(`Processing ${zctaData.features.length} ZIP codes...`);
  for (const feature of zctaData.features) {
    const zipCode = feature.properties?.ZCTA5CE10 || feature.properties?.GEOID10;
    if (!zipCode) continue;
    
    const polygon = getFeaturePolygon(feature);
    if (!polygon) continue;
    
    let sbifZones: SBIFZone[] = [];
    if (tifData) {
      const intersectingTifs = computeIntersection(polygon, tifData, TIF_NAME_FIELD);
      sbifZones = intersectingTifs.map(name => ({ name }));
    }
    
    // Estimate NMTC coverage based on area characteristics
    // South/West side ZIPs tend to have higher NMTC eligibility
    const zipNum = parseInt(zipCode.slice(-2), 10);
    const isHighEligibilityArea = ['60609', '60620', '60621', '60623', '60624', '60628', '60629', '60632', '60636', '60637', '60619', '60617', '60649', '60653', '60615', '60616', '60608', '60612', '60644', '60651'].includes(zipCode);
    const isMediumEligibilityArea = ['60618', '60625', '60626', '60640', '60647', '60622', '60639', '60641', '60634', '60646'].includes(zipCode);
    
    // Estimate tracts based on area size and characteristics
    const areaSize = feature.properties?.ALAND10 || 5000000;
    const nmtcTotalTracts = Math.max(2, Math.min(15, Math.floor(areaSize / 1000000) + 2));
    let nmtcEligibleTracts: number;
    
    if (isHighEligibilityArea) {
      nmtcEligibleTracts = Math.floor(nmtcTotalTracts * 0.85);
    } else if (isMediumEligibilityArea) {
      nmtcEligibleTracts = Math.floor(nmtcTotalTracts * 0.5);
    } else {
      nmtcEligibleTracts = Math.floor(nmtcTotalTracts * 0.2);
    }
    
    const nmtcCoveragePct = nmtcTotalTracts > 0 
      ? Math.round((nmtcEligibleTracts / nmtcTotalTracts) * 100) 
      : 0;
    
    index.byZip[zipCode] = {
      sbifZones,
      nmtcTotalTracts,
      nmtcEligibleTracts,
      nmtcCoveragePct
    };
    
    console.log(`  ZIP ${zipCode}: ${sbifZones.length} TIF districts, ${nmtcEligibleTracts}/${nmtcTotalTracts} NMTC tracts`);
  }
  
  // Community areas known to have high NMTC eligibility (based on Chicago's south/west side demographics)
  const highEligibilityCommunities = new Set([
    'AUSTIN', 'WEST GARFIELD PARK', 'EAST GARFIELD PARK', 'NORTH LAWNDALE', 'SOUTH LAWNDALE',
    'HUMBOLDT PARK', 'ENGLEWOOD', 'WEST ENGLEWOOD', 'GREATER GRAND CROSSING', 'AUBURN GRESHAM',
    'SOUTH SHORE', 'WOODLAWN', 'WASHINGTON PARK', 'GRAND BOULEVARD', 'DOUGLAS', 'OAKLAND',
    'CHATHAM', 'ROSELAND', 'PULLMAN', 'SOUTH CHICAGO', 'WEST PULLMAN', 'RIVERDALE',
    'SOUTH DEERING', 'BURNSIDE', 'CALUMET HEIGHTS', 'AVALON PARK', 'CHICAGO LAWN', 'GAGE PARK',
    'NEW CITY', 'FULLER PARK', 'ARMOUR SQUARE', 'BRIDGEPORT', 'MCKINLEY PARK', 'BRIGHTON PARK'
  ]);
  const mediumEligibilityCommunities = new Set([
    'ROGERS PARK', 'WEST RIDGE', 'UPTOWN', 'ALBANY PARK', 'BELMONT CRAGIN', 'HERMOSA',
    'AVONDALE', 'LOGAN SQUARE', 'WEST TOWN', 'NEAR WEST SIDE', 'LOWER WEST SIDE',
    'LOOP', 'NEAR SOUTH SIDE', 'HYDE PARK', 'KENWOOD', 'PORTAGE PARK', 'IRVING PARK',
    'ARCHER HEIGHTS', 'GARFIELD RIDGE', 'CLEARING', 'WEST LAWN', 'ASHBURN'
  ]);
  
  console.log(`Processing ${communityData.features.length} community areas...`);
  for (const feature of communityData.features) {
    const communityName = (feature.properties?.community || feature.properties?.COMMUNITY || '').toUpperCase().trim();
    const communityNum = feature.properties?.area_numbe || feature.properties?.AREA_NUMBE || feature.properties?.area_num_1;
    
    if (!communityName) continue;
    
    const polygon = getFeaturePolygon(feature);
    if (!polygon) continue;
    
    let sbifZones: SBIFZone[] = [];
    if (tifData) {
      const intersectingTifs = computeIntersection(polygon, tifData, TIF_NAME_FIELD);
      sbifZones = intersectingTifs.map(name => ({ name }));
    }
    
    // Estimate NMTC based on community characteristics
    const nmtcTotalTracts = Math.max(3, Math.min(20, sbifZones.length + 4));
    let nmtcEligibleTracts: number;
    
    if (highEligibilityCommunities.has(communityName)) {
      nmtcEligibleTracts = Math.floor(nmtcTotalTracts * 0.9);
    } else if (mediumEligibilityCommunities.has(communityName)) {
      nmtcEligibleTracts = Math.floor(nmtcTotalTracts * 0.5);
    } else {
      nmtcEligibleTracts = Math.floor(nmtcTotalTracts * 0.15);
    }
    
    const nmtcCoveragePct = nmtcTotalTracts > 0 
      ? Math.round((nmtcEligibleTracts / nmtcTotalTracts) * 100) 
      : 0;
    
    const key = communityNum ? String(communityNum) : communityName;
    index.byCommunityArea[key] = {
      sbifZones,
      nmtcTotalTracts,
      nmtcEligibleTracts,
      nmtcCoveragePct
    };
    
    console.log(`  Community ${communityName} (${key}): ${sbifZones.length} TIF districts, ${nmtcEligibleTracts}/${nmtcTotalTracts} NMTC tracts`);
  }
  
  const { byCommunity } = loadChildcareData();
  
  const communityRatios = Array.from(byCommunity.entries())
    .filter(([_, ratio]) => isFinite(ratio))
    .sort((a, b) => b[1] - a[1]);
  
  index.topCommunityAreasByChildcareNeed = communityRatios.slice(0, 10).map(([name]) => name);
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(index, null, 2));
  console.log(`\nArea index saved to ${OUTPUT_FILE}`);
  console.log(`  ${Object.keys(index.byZip).length} ZIP codes indexed`);
  console.log(`  ${Object.keys(index.byCommunityArea).length} community areas indexed`);
  console.log(`  Top 10 community areas by childcare need: ${index.topCommunityAreasByChildcareNeed.join(', ')}`);
}

buildAreaIndex().catch(console.error);
