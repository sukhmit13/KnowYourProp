import { manualPropertyPatchSchema } from "./manualPropertyPatch";
import { childcareCitywideCcapStats } from "./childcareCcapStats";

import type { Express, Request, Response, NextFunction } from "express";
import type { Run } from "@shared/schema";
import { hasUserSpecifiedUnit, stripCensusUnitArtifact } from './utils/addressNormalize';
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api, errorSchemas } from "@shared/routes";
import { z } from "zod";
import { initGIS, lookupLocation, getAldermanForWard, getAldermanStatsForWard, checkLandmarkStatus, queryLandmarkAPI, lookupAduZoneByCoordinates, loadOfficialLandmarks, refreshChrsData, refreshLandmarkDistrictsData } from "./gis";
import * as turf from '@turf/turf';
import { getZoningInfo } from "@shared/zoningData";
import { BUSINESS_USES, checkZoningCompatibility, getBusinessUseCategories, getBusinessUsesByCategory } from "@shared/businessUses";
import { loadChildcareData, getChildcareAccess, getCommunityAreaChildcareAccess } from "./childcare";
import { initGroceryData, getGroceryAccessByZip, getGroceryAccessByCommunityArea, resetGroceryCache } from "./grocery-stores";
import { evaluateSbifEligibility } from "./sbif";
import { checkNmtcEligibility } from "./nmtc";
import { initIncentivesChecker, checkIncentives } from "./incentivesChecker";
import { checkHubZoneEligibility } from "./hubzone";
import { checkQctEligibility } from "./qct";
import { checkChaOpportunityArea } from "./chaOpportunity";
import { checkLocationIncentives } from "./locationIncentives";
import { initTransit, findNearestTransit, isTransitInitialized, checkTODStatus } from "./transit";
import { getPropertyTax } from "./propertyTax";
import {
  getWestTownTaxPilotSummary,
  listWestTownTaxPilotProperties,
  scheduleWestTownTaxPilot,
} from "./westTownTaxPilot";
import { getLienData, searchOwnerLiensOnly } from "./lienSearch";
import { NEIGHBORHOOD_NEWS_DAYS, hasCurrentNeighborhoodWindow } from "@shared/newsWindows";
import { resolvePinFromAddress, getAssociatedAddresses, fetchProximityData } from "./pinResolver";
import { createPropertyContext, getPropertyContext, resolvePropertyIdForAddress, validateContextObject } from "./propertyContext";
import { extractPropertyContext } from "./propertyContextExtraction";
import type { PropertyContext } from "@shared/propertyContext";
import { findNearbyEvStations, findNearbyGasStations, findNearbyHotels, findNearbyRestaurants, findNearbyCoffeeShops, findNearbyBars, findNearbyDayCares } from "./ev-stations";
import { getDemographicTrends, warmDemographicsCache, getCachedDemographics } from "./demographics";
import { fetchPermitHistory, fetchViolationHistory, fetchCrimeStats, fetchCrimeTractRanking, categorizePermitType } from "./permits";
import { getContractorSearchMatch } from "./utils/contractorSearch";
import { alignChildcareChildrenUnder5, getChildcareEnhancedRanks } from "./childcareEnhancedRanks";
import { getNewConstructionStats, getNearbyNewConstruction } from "./newConstruction";
import { getSBALoans, getCookCountyCommercialLenders } from "./sbaLoans";
import { readCachedCrexi } from "./crexi";
import { readCachedPeerspace } from "./peerspace";
import { fetchGooglePlacesData, type GooglePlace } from "./google-places";
import { derivePlacesSearchTerm } from "@shared/placesSearch";
import { getVehicleOwnership, getSeniorsData } from "./localDemographics";
import { getHmdaRankings } from "./hmdaRankings";
import { resolveUserFromToken } from "./auth";
import { buildPropertyInsightContentPrompt } from "./prompts/reportPromptBuilder";
import { validateInsightReportContent, renderInsightReport } from "./insightReportTemplate";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load polygon data for maps
let zctaData: any = null;
let communityAreasData: any = null;
let wardsData: any = null;
let tifData: any = null;
let neighborhoodsData: any = null;

function loadPolygonData() {
  try {
    const zctaPath = path.join(__dirname, 'data', 'chicago_zcta.geojson');
    const caPath = path.join(__dirname, 'data', 'chicago_community_areas.geojson');
    const wardsPath = path.join(__dirname, 'data', 'chicago_wards.geojson');
    const tifPath = path.join(__dirname, 'data', 'chicago_tif.geojson');
    
    if (fs.existsSync(zctaPath)) {
      zctaData = JSON.parse(fs.readFileSync(zctaPath, 'utf-8'));
    }
    if (fs.existsSync(caPath)) {
      communityAreasData = JSON.parse(fs.readFileSync(caPath, 'utf-8'));
    }
    if (fs.existsSync(wardsPath)) {
      wardsData = JSON.parse(fs.readFileSync(wardsPath, 'utf-8'));
      console.log(`Loaded ward data for ${wardsData?.features?.length || 0} wards`);
    }
    if (fs.existsSync(tifPath)) {
      tifData = JSON.parse(fs.readFileSync(tifPath, 'utf-8'));
      console.log(`Loaded TIF data for ${tifData?.features?.length || 0} TIF districts`);
    }
    const neighPath = path.join(__dirname, 'data', 'chicago_neighborhoods.geojson');
    if (fs.existsSync(neighPath)) {
      neighborhoodsData = JSON.parse(fs.readFileSync(neighPath, 'utf-8'));
      console.log(`Loaded neighborhood data for ${neighborhoodsData?.features?.length || 0} neighborhoods`);
    }
  } catch (err) {
    console.error('Error loading polygon data:', err);
  }
}

function lookupNeighborhoodByCoordinates(lat: number, lon: number): string | null {
  if (!neighborhoodsData) return null;
  const point = turf.point([lon, lat]);
  for (const feature of neighborhoodsData.features) {
    if (turf.booleanPointInPolygon(point, feature)) {
      return feature.properties?.pri_neigh || null;
    }
  }
  return null;
}

function lookupWardByCoordinates(lat: number, lon: number): { 
  ward: string | null; 
  alderman: string | null; 
  aldermanUrl: string | null;
  aldermanPhone: string | null;
  aldermanEmail: string | null;
  aldermanWardOffice: string | null;
  aldermanYearsInOffice: string | null;
  aldermanAttendance: string | null;
  aldermanCouncilmaticUrl: string | null;
} {
  if (!wardsData) {
    return { ward: null, alderman: null, aldermanUrl: null, aldermanPhone: null, aldermanEmail: null, aldermanWardOffice: null, aldermanYearsInOffice: null, aldermanAttendance: null, aldermanCouncilmaticUrl: null };
  }
  
  const point = turf.point([lon, lat]);
  for (const feature of wardsData.features) {
    if (turf.booleanPointInPolygon(point, feature)) {
      const ward = feature.properties?.ward_id || null;
      if (ward) {
        const aldermanInfo = getAldermanForWard(ward);
        const aldermanStats = getAldermanStatsForWard(ward);
        return {
          ward,
          alderman: aldermanInfo?.name || null,
          aldermanUrl: aldermanInfo?.website || null,
          aldermanPhone: aldermanInfo?.phone || null,
          aldermanEmail: aldermanInfo?.email || null,
          aldermanWardOffice: aldermanInfo?.wardOffice || null,
          aldermanYearsInOffice: aldermanStats?.yearsInOffice || null,
          aldermanAttendance: aldermanStats?.attendance || null,
          aldermanCouncilmaticUrl: aldermanStats?.councilmaticUrl || null
        };
      }
    }
  }
  return { ward: null, alderman: null, aldermanUrl: null, aldermanPhone: null, aldermanEmail: null, aldermanWardOffice: null, aldermanYearsInOffice: null, aldermanAttendance: null, aldermanCouncilmaticUrl: null };
}

// Rate Limiting
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 600; // 600 requests per minute (page loads fire 30-50 parallel requests)
const ipRequests = new Map<string, { count: number; startTime: number }>();

function rateLimiter(req: Request, res: Response, next: NextFunction) {
  const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  
  const record = ipRequests.get(ip);
  if (!record) {
    ipRequests.set(ip, { count: 1, startTime: now });
    return next();
  }

  if (now - record.startTime > RATE_LIMIT_WINDOW) {
    // Reset window
    record.count = 1;
    record.startTime = now;
    return next();
  }

  if (record.count >= RATE_LIMIT_MAX) {
    return res.status(429).json({ message: "Too many requests, please try again later." });
  }

  record.count++;
  next();
}

// Fetches assessor improvement characteristics for a PIN (building sf, land sf, year built)
async function fetchAssessorCharsForPin(pin: string): Promise<{ buildingSf: number | null; landSf: number | null; yearBuilt: number | null; stories: number | null }> {
  const empty = { buildingSf: null, landSf: null, yearBuilt: null, stories: null };
  try {
    const cleanPin = pin.replace(/-/g, '');
    const url = `https://datacatalog.cookcountyil.gov/resource/c49d-89sn.json?$where=${encodeURIComponent(`pin14='${cleanPin}'`)}&$limit=1&$select=char_bldg_sf,char_land_sf,char_yrblt,char_type_resd`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return empty;
    const data: any[] = await res.json();
    if (!data?.length) return empty;
    const r = data[0];
    const buildingSf = r.char_bldg_sf && parseFloat(r.char_bldg_sf) > 0 ? Math.floor(parseFloat(r.char_bldg_sf)) : null;
    const landSf = r.char_land_sf && parseFloat(r.char_land_sf) > 0 ? Math.floor(parseFloat(r.char_land_sf)) : null;
    const yearBuilt = r.char_yrblt && parseFloat(r.char_yrblt) > 1800 ? Math.floor(parseFloat(r.char_yrblt)) : null;
    // Parse stories from char_type_resd (e.g. "1 Story", "2 Story", "3+ Story")
    let stories: number | null = null;
    if (r.char_type_resd) {
      const m = String(r.char_type_resd).match(/(\d+)/);
      if (m) stories = parseInt(m[1]);
    }
    return { buildingSf, landSf, yearBuilt, stories };
  } catch (_) {
    return empty;
  }
}

// Builds a rich context block for a single run+geocode for use in the AI chat
async function buildPropertyChatContext(run: any, geo: any): Promise<string> {
  const lines: string[] = [`ADDRESS: ${run.address}`];

  // Basic geocode fields
  if (geo?.zoning) lines.push(`ZONING CODE: ${geo.zoning}`);
  if (geo?.tifName) lines.push(`TIF DISTRICT: ${geo.tifName}`);
  if (geo?.communityArea) lines.push(`COMMUNITY AREA: ${geo.communityArea}`);
  if (geo?.zipCode) lines.push(`ZIP CODE: ${geo.zipCode}`);
  if (geo) lines.push(`OPPORTUNITY ZONE: ${geo.opportunityZone ? 'Yes' : 'No'}`);

  // Run fields
  if (run.lastProjectType) lines.push(`SELECTED PROJECT USE: ${run.lastProjectType}`);
  if (run.lastRole) lines.push(`USER ROLE: ${run.lastRole}`);
  if (run.lastTransactionType) lines.push(`TRANSACTION TYPE: ${run.lastTransactionType}`);
  if (run.lastFreeformDescription) lines.push(`PROJECT DESCRIPTION: ${run.lastFreeformDescription}`);
  if (run.askingPrice) lines.push(`ASKING PRICE: $${run.askingPrice.toLocaleString()}`);
  if (run.scenarios?.length) {
    lines.push(`SCENARIOS: ${run.scenarios.map((s: any) => `${s.name} (${s.projectType}, ${s.sponsorType})`).join('; ')}`);
  }

  // Never skip location-derived sections silently: if no geocode row exists,
  // say so up front — every affected section below also emits its own marker.
  if (!geo) {
    console.error('[EVIDENCE] no geocode resolved for run', run.id, run.address);
    lines.push(
      '\n[EXTRACTION FAILED — no geocode resolved for this address. Zoning, FAR, permitted uses, transit, demographics, childcare, and rental market data could not be read. Do not state or imply anything about them.]'
    );
  }

  // Resolve property physical characteristics — prefer manually-entered values,
  // fall back to Cook County Assessor API using the cached PIN
  let buildingSf: number | null = run.manualBuildingSqFt || null;
  let landSf: number | null = run.manualLandSqFt || null;
  let manualStories: number | null = run.manualStories || null;
  let yearBuilt: number | null = null;
  let dataSource = 'manually entered';

  if (!buildingSf || !landSf) {
    // Try to get PIN from cache and fetch from assessor API
    // Key format must match pinResolver's createCacheKey: toUpperCase, strip non-alphanumeric
    const addressHash = run.address.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const pin = await storage.getPinForAddress(addressHash).catch(() => null);
    if (pin) {
      // First try improvement characteristics API (fast, no cache)
      const chars = await fetchAssessorCharsForPin(pin);
      if (!buildingSf && chars.buildingSf) { buildingSf = chars.buildingSf; dataSource = 'Cook County Assessor'; }
      if (!landSf && chars.landSf) { landSf = chars.landSf; dataSource = 'Cook County Assessor'; }
      if (!manualStories && chars.stories) { manualStories = chars.stories; }
      if (chars.yearBuilt) yearBuilt = chars.yearBuilt;

      // Fallback: use the same property tax API the frontend uses — it has richer data
      if (!buildingSf || !landSf) {
        try {
          const taxData = await getPropertyTax(pin, { address: run.address });
          if (!buildingSf && taxData.buildingSquareFeet) { buildingSf = taxData.buildingSquareFeet; dataSource = 'Cook County Assessor (property tax)'; }
          if (!landSf && taxData.landSquareFeet) { landSf = taxData.landSquareFeet; dataSource = 'Cook County Assessor (property tax)'; }
          if (!manualStories && taxData.stories) { manualStories = taxData.stories; }
          if (!yearBuilt && taxData.yearBuilt) { yearBuilt = taxData.yearBuilt; }
        } catch (e) {
          console.error('[EVIDENCE] block failed: assessorTaxFallback', e);
          lines.push(
            '[EXTRACTION FAILED — assessor property-tax fallback could not be read; building/land square footage below may be incomplete. Missing figures are unread, not absent from the public record.]'
          );
        }
      }
    }
  }

  // Inject physical property data (source tagged so Claude knows these are real numbers)
  lines.push(`\nPHYSICAL PROPERTY DATA (source: ${dataSource}):`);
  if (buildingSf) lines.push(`  Building Square Feet: ${buildingSf.toLocaleString()} sf`);
  if (landSf) lines.push(`  Lot (Land) Square Feet: ${landSf.toLocaleString()} sf`);
  if (manualStories) lines.push(`  Stories: ${manualStories}`);
  if (yearBuilt) lines.push(`  Year Built: ${yearBuilt}`);
  if (run.askingPrice) lines.push(`  Asking Price: $${Number(run.askingPrice).toLocaleString()}`);

  // Zoning details + use compatibility matrix
  if (geo?.zoning) {
    const zoningInfo = getZoningInfo(geo.zoning);
    if (zoningInfo) {
      lines.push(`\nZONING DETAILS:`);
      lines.push(`  Name: ${zoningInfo.name}`);
      if (zoningInfo.description) lines.push(`  Description: ${zoningInfo.description}`);
      if (zoningInfo.allowedUses?.length) lines.push(`  Allowed Uses: ${zoningInfo.allowedUses.join(', ')}`);
      if (zoningInfo.maxFAR) lines.push(`  Max FAR: ${zoningInfo.maxFAR}`);
      if (zoningInfo.maxHeight) lines.push(`  Max Height: ${zoningInfo.maxHeight}`);
      if (zoningInfo.parkingMin) lines.push(`  Parking Minimum: ${zoningInfo.parkingMin}`);
      lines.push(`  Residential Allowed: ${zoningInfo.residentialAllowed ? 'Yes' : 'No'}`);
      lines.push(`  Commercial Allowed: ${zoningInfo.commercialAllowed ? 'Yes' : 'No'}`);
      lines.push(`  Industrial Allowed: ${zoningInfo.industrialAllowed ? 'Yes' : 'No'}`);

      // FAR analysis — concrete numbers for this specific property
      const maxFARParsed = zoningInfo.maxFAR ? parseFloat(String(zoningInfo.maxFAR)) : NaN;
      if (landSf && !isNaN(maxFARParsed)) {
        const maxFAR = maxFARParsed;
        const maxBuildableSf = Math.floor(landSf * maxFAR);
        lines.push(`\nFAR ANALYSIS (this property):`);
        lines.push(`  Lot Size: ${landSf.toLocaleString()} sf`);
        lines.push(`  Zoning Max FAR: ${maxFAR}`);
        lines.push(`  Max Buildable Floor Area: ${maxBuildableSf.toLocaleString()} sf (= ${landSf.toLocaleString()} × ${maxFAR})`);
        if (buildingSf) {
          const currentFAR = (buildingSf / landSf).toFixed(2);
          const remainingSf = maxBuildableSf - buildingSf;
          lines.push(`  Current Building: ${buildingSf.toLocaleString()} sf`);
          lines.push(`  Current FAR: ${currentFAR}`);
          lines.push(`  Remaining FAR Capacity: ${remainingSf > 0 ? remainingSf.toLocaleString() + ' sf' : 'None — at or over FAR limit'}`);
        }
      } else {
        const missing = !landSf && isNaN(maxFARParsed) ? 'lot size and the zoning FAR limit' : (!landSf ? 'lot size' : 'the zoning FAR limit');
        lines.push(
          `\nFAR ANALYSIS: [EXTRACTION FAILED — ${missing} could not be read, so buildable floor area could not be computed. Do not state or imply anything about FAR or buildable capacity.]`
        );
      }
    } else {
      lines.push(
        `\nZONING DETAILS: [EXTRACTION FAILED — zoning code ${geo.zoning} is not in the zoning reference data, so zoning details, FAR, and permitted uses could not be read. Do not state or imply anything about them.]`
      );
    }

    // Build use-compatibility table grouped by category (in-memory, fast)
    const permittedByCategory: Record<string, string[]> = {};
    const specialByCategory: Record<string, string[]> = {};
    for (const category of getBusinessUseCategories()) {
      for (const use of getBusinessUsesByCategory(category)) {
        const result = checkZoningCompatibility(use.name, geo.zoning);
        if (result.permission === 'permitted') {
          if (!permittedByCategory[category]) permittedByCategory[category] = [];
          if (permittedByCategory[category].length < 5) permittedByCategory[category].push(use.name);
        } else if (result.permission === 'special_use') {
          if (!specialByCategory[category]) specialByCategory[category] = [];
          if (specialByCategory[category].length < 4) specialByCategory[category].push(use.name);
        }
      }
    }
    const permittedEntries = Object.entries(permittedByCategory).filter(([, u]) => u.length > 0);
    const specialEntries = Object.entries(specialByCategory).filter(([, u]) => u.length > 0);
    if (permittedEntries.length > 0) {
      lines.push(`\nPERMITTED USES IN THIS ZONE (by category):`);
      for (const [cat, uses] of permittedEntries) lines.push(`  ${cat}: ${uses.join(', ')}`);
    }
    if (specialEntries.length > 0) {
      lines.push(`USES REQUIRING SPECIAL USE PERMIT:`);
      for (const [cat, uses] of specialEntries) lines.push(`  ${cat}: ${uses.join(', ')}`);
    }
  } else {
    lines.push(
      '\nZONING DETAILS: [EXTRACTION FAILED — no zoning resolved for this address, so zoning details, FAR, and permitted uses could not be read. Do not state or imply anything about them.]'
    );
  }

  // Transit proximity + TOD
  const transitLat = geo?.lat != null ? parseFloat(String(geo.lat)) : NaN;
  const transitLon = geo?.lon != null ? parseFloat(String(geo.lon)) : NaN;
  if (!isNaN(transitLat) && !isNaN(transitLon)) {
    const lat = transitLat;
    const lon = transitLon;
    try {
      const transit = findNearestTransit(lat, lon, 5);
      lines.push(`\nTRANSIT PROXIMITY:`);
      if (transit.ctaRail.length > 0) {
        lines.push(`  CTA Rail: ${transit.ctaRail.map(s => `${s.stopName} (${s.routes.join('/')}, ${s.distance.toFixed(2)} mi)`).join('; ')}`);
      } else {
        lines.push(`  CTA Rail: None within 2 miles`);
      }
      if (transit.ctaBus.length > 0) {
        lines.push(`  CTA Bus: ${transit.ctaBus.slice(0, 5).map(s => `Rte ${s.routes[0]} at ${s.stopName} (${s.distance.toFixed(2)} mi)`).join('; ')}`);
      }
      if (transit.metra.length > 0) {
        lines.push(`  Metra: ${transit.metra.map(s => `${s.stopName} (${s.routes.join('/')}, ${s.distance.toFixed(2)} mi)`).join('; ')}`);
      } else {
        lines.push(`  Metra: None within 2 miles`);
      }
      const tod = checkTODStatus(transit);
      lines.push(`  TOD Eligible: ${tod.inTOD ? `Yes — ${tod.todType} (${tod.nearestStation || tod.busRoute}, ${tod.distance?.toFixed(2)} mi)` : 'No'}`);
    } catch (e) {
      console.error('[EVIDENCE] block failed: transit', e);
      lines.push(
        '\nTRANSIT PROXIMITY: [EXTRACTION FAILED — transit data could not be read. Do not state or imply anything about transit access or TOD status.]'
      );
    }
  } else {
    lines.push(
      '\nTRANSIT PROXIMITY: [EXTRACTION FAILED — no coordinates resolved for this address, so transit data could not be read. Do not state or imply anything about transit access or TOD status.]'
    );
  }

  // Community demographics — use only already-cached data to avoid blocking run creation
  if (geo?.communityArea) {
    try {
      const cached = getCachedDemographics(geo.communityArea);
      if (cached.data2023) {
        lines.push(`\nCOMMUNITY DEMOGRAPHICS (${geo.communityArea}):`);
        const r = cached.data2023;
        const pop = r.total_population ? Number(r.total_population).toLocaleString() : null;
        if (pop) lines.push(`  Population (2023): ${pop}`);
        if (r.hispanic_or_latino && r.total_population) lines.push(`  % Hispanic/Latino: ${(Number(r.hispanic_or_latino)/Number(r.total_population)*100).toFixed(1)}%`);
        if (r.black_or_african_american && r.total_population) lines.push(`  % Black/African American: ${(Number(r.black_or_african_american)/Number(r.total_population)*100).toFixed(1)}%`);
        if (cached.data2010?.per_capita_income_) lines.push(`  Per Capita Income (2010): $${Number(cached.data2010.per_capita_income_).toLocaleString()}`);
        if (cached.data2010?.hardship_index) lines.push(`  Hardship Index: ${cached.data2010.hardship_index}`);
      } else {
        lines.push(
          `\nCOMMUNITY DEMOGRAPHICS: [EXTRACTION FAILED — no cached demographic data for ${geo.communityArea}, so demographics could not be read. Do not state or imply anything about area demographics.]`
        );
      }
    } catch (e) {
      console.error('[EVIDENCE] block failed: demographics', e);
      lines.push(
        '\nCOMMUNITY DEMOGRAPHICS: [EXTRACTION FAILED — demographic data could not be read. Do not state or imply anything about area demographics.]'
      );
    }
  } else {
    lines.push(
      '\nCOMMUNITY DEMOGRAPHICS: [EXTRACTION FAILED — no community area resolved for this address, so demographic data could not be read. Do not state or imply anything about area demographics.]'
    );
  }

  // Childcare blocks — gated on the user's selected project use (STEP C).
  // Full analysis only for childcare projects; a single amenity line for
  // residential projects; omitted entirely when no project use is selected
  // or the selected use is a non-childcare commercial type.
  const CHILDCARE_PROJECT_TYPES = ['Day Care Center', 'School (Private)', 'School (Private K-12)'];
  const RESIDENTIAL_PROJECT_TYPES = [
    'Detached House', 'Two-Flat', 'Townhouse', 'Multi-Unit Residential',
    'Elderly Housing', 'Single-Room Occupancy (SRO)', 'Artist Live/Work Space',
    'Accessory Dwelling Unit (ADU)', 'Additional Dwelling Unit',
  ];
  const selectedUse: string | null = run.lastProjectType ?? null;

  if (selectedUse && CHILDCARE_PROJECT_TYPES.includes(selectedUse)) {
    // Childcare data by ZIP
    if (geo?.zipCode) {
      try {
        const cc = await getChildcareAccess(geo.zipCode);
        if (cc) {
          lines.push(`\nCHILDCARE ACCESS (ZIP ${geo.zipCode}):`);
          lines.push(`  Status: ${cc.statusLabel}`);
          lines.push(`  Children Under 5: ${cc.childrenUnder5.toLocaleString()}`);
          lines.push(`  Licensed Slots: ${cc.licensedSlots.toLocaleString()} (${cc.centerSlots} center, ${cc.familyHomeSlots} home-based)`);
          if (cc.childrenPerSlot !== null) lines.push(`  Children Per Slot: ${cc.childrenPerSlot} (>3.0 = childcare desert)`);
        } else {
          lines.push(
            `\nCHILDCARE ACCESS (ZIP ${geo.zipCode}): [EXTRACTION FAILED — no childcare data could be read for this ZIP. Do not state or imply anything about childcare supply or demand.]`
          );
        }
      } catch (e) {
        console.error('[EVIDENCE] block failed: childcareZip', e);
        lines.push(
          '\nCHILDCARE ACCESS (ZIP): [EXTRACTION FAILED — childcare data could not be read. Do not state or imply anything about childcare supply or demand.]'
        );
      }
    } else {
      lines.push(
        '\nCHILDCARE ACCESS (ZIP): [EXTRACTION FAILED — no ZIP resolved for this address, so childcare data could not be read. Do not state or imply anything about childcare supply or demand.]'
      );
    }

    // Childcare data by community area (supplementary)
    if (geo?.communityArea) {
      try {
        const cc = await getCommunityAreaChildcareAccess(geo.communityArea);
        if (cc) {
          lines.push(`CHILDCARE ACCESS (${geo.communityArea} community area):`);
          lines.push(`  Status: ${cc.statusLabel}`);
          lines.push(`  Children Under 5: ${cc.childrenUnder5.toLocaleString()}`);
          lines.push(`  Licensed Slots: ${cc.licensedSlots.toLocaleString()}`);
          if (cc.childrenPerSlot !== null) lines.push(`  Children Per Slot: ${cc.childrenPerSlot}`);
        } else {
          lines.push(
            `CHILDCARE ACCESS (${geo.communityArea} community area): [EXTRACTION FAILED — no childcare data could be read for this community area. Do not state or imply anything about childcare supply or demand.]`
          );
        }
      } catch (e) {
        console.error('[EVIDENCE] block failed: childcareCommunityArea', e);
        lines.push(
          'CHILDCARE ACCESS (community area): [EXTRACTION FAILED — childcare data could not be read. Do not state or imply anything about childcare supply or demand.]'
        );
      }
    } else {
      lines.push(
        'CHILDCARE ACCESS (community area): [EXTRACTION FAILED — no community area resolved for this address, so childcare data could not be read. Do not state or imply anything about childcare supply or demand.]'
      );
    }
  } else if (selectedUse && RESIDENTIAL_PROJECT_TYPES.includes(selectedUse) && geo?.zipCode) {
    // One amenity line only — never a business-opportunity framing
    try {
      const cc = await getChildcareAccess(geo.zipCode);
      if (cc && cc.childrenPerSlot !== null) {
        lines.push(`\nNeighborhood childcare access: ${cc.childrenPerSlot} children per licensed slot in ZIP ${geo.zipCode} (${cc.statusLabel}) — amenity context only, not a business opportunity.`);
      }
    } catch (e) {
      console.error('[EVIDENCE] block failed: childcareAmenity', e);
    }
  }
  // No project use selected, or a non-childcare commercial use → childcare data omitted entirely.

  return lines.join('\n');
}

// ── INSIGHT REPORT GENERATOR ──────────────────────────────────────────────────
// Model used for one-page Property Insight Report generation.
// Override via the REPORT_MODEL env var without touching code.
const REPORT_MODEL = process.env.REPORT_MODEL || "claude-sonnet-5";

// Official Chicago Landmark designation check (uct4-hrvh, 412 landmarks).
// Point-in-polygon against building footprints, with a coordinate-proximity
// fallback. Shared by POST /api/incentives and the insight-report evidence
// builder so both paths use identical logic.
async function checkOfficialLandmarkFlag(lat: number, lon: number): Promise<{ isOfficial: boolean; name: string | null }> {
  try {
    const officials = await loadOfficialLandmarks();
    const qPoint = turf.point([lon, lat]);
    const match = officials.find(o => {
      try {
        return turf.booleanPointInPolygon(qPoint, o.geometry);
      } catch {
        return Math.abs(o.lat - lat) < 0.001 && Math.abs(o.lon - lon) < 0.001;
      }
    });
    return { isOfficial: !!match, name: match?.name ?? null };
  } catch (e) {
    console.warn('[landmark] Official landmark lookup failed:', e);
    return { isOfficial: false, name: null };
  }
}

// Zod validation for PATCH /api/runs/:id/report-context — mirrors
// ReportContextData in server/storage.ts (submittedAt/locked are set server-side)
const reportContextPatchSchema = z.object({
  projectType: z.string().nullable().optional(),
  funnelAnswers: z.object({
    role: z.string().nullable().optional(),
    transactionType: z.string().nullable().optional(),
    projectType: z.string().nullable().optional(),
    freeformDescription: z.string().nullable().optional(),
    referralNeeds: z.array(z.string()).nullable().optional(),
  }).optional(),
  manualProperty: z.object({
    manualBuildingSqFt: z.number().nullable().optional(),
    manualLandSqFt: z.number().nullable().optional(),
    manualStories: z.number().nullable().optional(),
    sourceListingUrl: z.string().nullable().optional(),
    askingPrice: z.number().nullable().optional(),
  }).optional(),
  valuation: z.object({
    purchasePrice: z.number().nullable().optional(),
    noiOption: z.string().nullable().optional(),
    manualNoi: z.number().nullable().optional(),
    loanType: z.string().nullable().optional(),
    interestRate: z.number().nullable().optional(),
    annualTaxes: z.number().nullable().optional(),
    annualInsurance: z.number().nullable().optional(),
    grossIncome: z.number().nullable().optional(),
    rentalNoiOption: z.string().nullable().optional(),
    sbaBusinessPrice: z.number().nullable().optional(),
    sbaRealEstatePrice: z.number().nullable().optional(),
    sbaBusinessDownPercent: z.number().nullable().optional(),
    sbaBusinessTermYears: z.number().nullable().optional(),
    sbaBusinessInterestRate: z.number().nullable().optional(),
    sbaRealEstateDownPercent: z.number().nullable().optional(),
    sbaRealEstateTermYears: z.number().nullable().optional(),
    sbaRealEstateInterestRate: z.number().nullable().optional(),
    computed: z.object({
      purchasePrice: z.number().nullable().optional(),
      selectedNoi: z.number().nullable().optional(),
      noiSource: z.string().nullable().optional(),
      downPayment: z.number().nullable().optional(),
      loanAmount: z.number().nullable().optional(),
      annualDebtService: z.number().nullable().optional(),
      annualCashFlow: z.number().nullable().optional(),
      dscr: z.number().nullable().optional(),
      capRate: z.number().nullable().optional(),
      roi: z.number().nullable().optional(),
    }).passthrough().nullable().optional(),
  }).passthrough().optional(),
}).passthrough();

// Assembles the full evidence package (base context + tax + lien + rental
// market blocks) for a run WITHOUT calling the model. Used by the report
// generator and by the dev-only evidence inspection endpoint.
async function buildInsightReportEvidence(runId: number, opts?: { publicRecordOnly?: boolean }): Promise<{ run: any; geo: any; pin: string | null; fullContext: string; coverage: { checked: string[]; missing: string[] } }> {
  const loaded = await storage.getRun(runId);
  if (!loaded) throw new Error('Run not found');

  // Public-record mode ("as-is" insight report): strip every user deal input
  // BEFORE evidence assembly — buildPropertyChatContext folds funnel answers,
  // project context, and saved valuation/deal terms into the evidence text, so
  // gating the prompt lines alone is not enough.
  const run = opts?.publicRecordOnly
    ? {
        ...loaded,
        lastProjectType: null,
        lastRole: null,
        lastTransactionType: null,
        lastFreeformDescription: null,
        reportContext: null,
      }
    : loaded;

  // Any-age lookup: a stale geocode row still carries valid zoning,
  // coordinates, and community area — do not treat staleness as absence here.
  const geo = await storage.getGeocodeAnyAge(run.address.trim().toLowerCase());

  // Build base property context (reuse existing function)
  const baseContext = await buildPropertyChatContext(run, geo);

  // Augment with lien + tax data if a PIN is available
  const addressHash = run.address.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const pin = await storage.getPinForAddress(addressHash).catch((e) => {
    console.error('[EVIDENCE] PIN lookup failed:', e);
    return null;
  });

  const extraLines: string[] = [];

  if (!pin) {
    extraLines.push(
      '\nPROPERTY TAX DATA: [EXTRACTION FAILED — no PIN resolved for this address, so tax data could not be read from the source. Do not state or imply anything about its contents.]'
    );
    extraLines.push(
      '\nRECORDER OF DEEDS / LIEN DATA: [EXTRACTION FAILED — no PIN resolved for this address, so sale history and lien data could not be read from the source. Do not state or imply anything about their contents.]'
    );
  }

  if (pin) {
    // Property tax data
    try {
      const taxData = await getPropertyTax(pin);
      if (taxData) {
        extraLines.push('\nPROPERTY TAX DATA:');
        if (taxData.totalAnnualTaxAmount) {
          const annual = Number(taxData.totalAnnualTaxAmount);
          extraLines.push(`  Annual Tax Amount: $${annual.toLocaleString()} ($${Math.round(annual / 12).toLocaleString()}/month)`);
        }
        if (taxData.paymentStatus) extraLines.push(`  Payment Status: ${taxData.paymentStatus}`);
        if (taxData.taxYears?.length) {
          const recent = taxData.taxYears.slice(0, 3);
          extraLines.push(`  Recent Years: ${recent.map((y: any) => `${y.year}: $${Number(y.billed || y.amountDue || 0).toLocaleString()}`).join(', ')}`);
        }
        if (taxData.treasurerBillUrl) extraLines.push(`  Treasurer URL: ${taxData.treasurerBillUrl}`);
      }
    } catch (e) {
      console.error('[EVIDENCE] block failed: propertyTax', e);
      extraLines.push(
        '\nPROPERTY TAX DATA: [EXTRACTION FAILED — this data could not be read from the source. Do not state or imply anything about its contents.]'
      );
    }

    // Lien / Recorder of Deeds data
    try {
      const lienData = await getLienData(pin);
      if (lienData) {
        extraLines.push('\nRECORDER OF DEEDS / LIEN DATA:');
        if (lienData.ownerName) extraLines.push(`  Current Owner: ${lienData.ownerName}`);
        if (lienData.deedGrantor) extraLines.push(`  Prior Owner (Grantor): ${lienData.deedGrantor}`);
        if (lienData.deedGrantee) extraLines.push(`  Current Owner (Grantee): ${lienData.deedGrantee}`);
        const docsRaw = (lienData.documents || []) as any[];
        // Dedupe: cached scrapes can contain the same document twice
        const seenDocs = new Set<string>();
        const docs = docsRaw.filter((d: any) => {
          const key = d.documentNumber || `${d.documentType}|${d.recordedDate}|${d.amount}`;
          if (seenDocs.has(key)) return false;
          seenDocs.add(key);
          return true;
        });
        if (docs.length > 0) {
          extraLines.push(`  Recorded Documents: ${docs.length} total`);
          const parseDate = (s: any) => { const t = Date.parse(s || ''); return isNaN(t) ? 0 : t; };
          const sorted = [...docs].sort((a: any, b: any) => parseDate(b.recordedDate) - parseDate(a.recordedDate));
          const fmtAmount = (d: any) => d.amount ? `$${Number(d.amount).toLocaleString()}` : 'amount not captured';

          // 1) Most recent deed/sale — always shown
          const deeds = sorted.filter((d: any) => d.category === 'deed');
          if (deeds.length > 0) {
            const deed: any = deeds[0];
            const grantor = deed.grantor || lienData.deedGrantor || 'grantor not captured';
            const grantee = deed.grantee || lienData.deedGrantee || 'grantee not captured';
            extraLines.push(`  Most Recent Deed/Sale: ${deed.documentType || 'DEED'} recorded ${deed.recordedDate || 'date unknown'} — ${fmtAmount(deed)} — grantor: ${grantor} — grantee: ${grantee}`);
          } else {
            extraLines.push('  Most Recent Deed/Sale: no deed documents present in recorder data');
          }

          // 2) Every foreclosure / lis pendens / lien record — never truncated
          const CRITICAL_CATEGORIES = new Set(['foreclosure', 'litigation', 'lien', 'mechanic', 'judgment', 'federal_tax', 'state_tax', 'support', 'other_lien']);
          const critical = sorted.filter((d: any) => CRITICAL_CATEGORIES.has(d.category) || (d.documentType || '').toUpperCase().includes('LIS PENDENS'));
          if (critical.length > 0) {
            const fcCount = critical.filter((d: any) => d.category === 'foreclosure' || (d.documentType || '').toUpperCase().includes('LIS PENDENS')).length;
            if (fcCount > 0) extraLines.push(`  FORECLOSURE ALERT: ${fcCount} foreclosure/lis pendens record(s) found`);
            extraLines.push(`  Foreclosure/Lien Records (all ${critical.length} shown):`);
            for (const c of critical) {
              extraLines.push(`    - ${c.documentType}: recorded ${c.recordedDate || 'date unknown'} — ${fmtAmount(c)}${c.isReleased ? ' [RELEASED]' : ''}`);
            }
          } else {
            extraLines.push('  Foreclosure/Lien Records: none found in recorder data');
          }

          // 3) Up to 15 additional most-recent documents
          const shown = new Set<any>([...(deeds.length > 0 ? [deeds[0]] : []), ...critical]);
          const rest = sorted.filter((d: any) => !shown.has(d));
          const recent = rest.slice(0, 15);
          if (recent.length > 0) {
            extraLines.push(`  Other Recent Documents (${recent.length} most recent):`);
            for (const r of recent) {
              extraLines.push(`    - ${r.documentType}: recorded ${r.recordedDate || 'date unknown'} — ${fmtAmount(r)}`);
            }
          }

          // 4) Remainder summarized as a count by type
          const remainder = rest.slice(15);
          if (remainder.length > 0) {
            const byType = new Map<string, number>();
            for (const r of remainder) {
              const t = r.documentType || 'UNKNOWN TYPE';
              byType.set(t, (byType.get(t) || 0) + 1);
            }
            const summary = [...byType.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${n} ${t}`).join(', ');
            extraLines.push(`  Plus ${remainder.length} additional documents: ${summary}`);
          }
        }
        const ownerLiens = (lienData.ownerLiens || []) as any[];
        if (ownerLiens.length > 0) {
          extraLines.push(`  Personal Liens Against Owner (all ${ownerLiens.length} shown):`);
          for (const l of ownerLiens) {
            extraLines.push(`    - ${l.documentType}: recorded ${l.recordedDate || 'date unknown'} — ${l.amount ? `$${Number(l.amount).toLocaleString()}` : 'amount not captured'}${l.isReleased ? ' [RELEASED]' : ''}`);
          }
        }
      }
    } catch (e) {
      console.error('[EVIDENCE] block failed: recorderOfDeeds', e);
      extraLines.push(
        '\nRECORDER OF DEEDS / LIEN DATA: [EXTRACTION FAILED — this data could not be read from the source. Do not state or imply anything about its contents, including sale history.]'
      );
    }
  }

  // RentCast market data (if available in cache) — absence is always marked,
  // never silent: no ZIP, no cached row, and read errors each emit a marker.
  if (geo?.zipCode) {
    try {
      const { db: drizzleDb } = await import('./db');
      const { sql: sqlTag } = await import('drizzle-orm');
      const rows = await drizzleDb.execute(sqlTag`SELECT data FROM rentcast_cache WHERE cache_key = ${geo.zipCode} AND cache_type = 'market' LIMIT 1`);
      const rcRow = (rows as any).rows?.[0] || (rows as any[])[0];
      if (rcRow?.data) {
        const rc = typeof rcRow.data === 'string' ? JSON.parse(rcRow.data) : rcRow.data;
        extraLines.push(`\nRENTAL MARKET DATA (RentCast, ZIP ${geo.zipCode}):`);
        const ov = rc.overall || {};
        if (ov.avgRent) extraLines.push(`  Average Rent: $${Number(ov.avgRent).toLocaleString()}/month`);
        if (ov.medianRent) extraLines.push(`  Median Rent: $${Number(ov.medianRent).toLocaleString()}/month`);
        if (ov.avgPricePerSqft) extraLines.push(`  Avg Rent/SF: $${ov.avgPricePerSqft}/month`);
        if (ov.minRent && ov.maxRent) extraLines.push(`  Rent Range: $${Number(ov.minRent).toLocaleString()}–$${Number(ov.maxRent).toLocaleString()}/month`);
        if (ov.totalListings) extraLines.push(`  Listings Sampled: ${ov.totalListings}`);
        if (Array.isArray(rc.byBedroom) && rc.byBedroom.length > 0) {
          extraLines.push('  Rent by Bedroom (median):');
          for (const br of rc.byBedroom) {
            if (br?.medianRent) extraLines.push(`    ${br.label || `${br.bedrooms}BR`}: $${Number(br.medianRent).toLocaleString()}/month`);
          }
        }
      } else {
        console.error('[EVIDENCE] block missing: rentcast — no cached market row for ZIP', geo.zipCode);
        extraLines.push(
          `\nRENTAL MARKET DATA (RentCast, ZIP ${geo.zipCode}): [EXTRACTION FAILED — no rental market data was read for this ZIP (not cached). Do not state or imply anything about rents or the rental market.]`
        );
      }
    } catch (e) {
      console.error('[EVIDENCE] block failed: rentcast', e);
      extraLines.push(
        '\nRENTAL MARKET DATA (RentCast): [EXTRACTION FAILED — this data could not be read from the source. Do not state or imply anything about its contents.]'
      );
    }
  } else {
    extraLines.push(
      '\nRENTAL MARKET DATA (RentCast): [EXTRACTION FAILED — no ZIP resolved for this address, so rental market data could not be read. Do not state or imply anything about rents or the rental market.]'
    );
  }

  // ── Additional evidence blocks (dataset gap fill) ─────────────────────────
  const glat = geo?.lat != null ? parseFloat(String(geo.lat)) : NaN;
  const glon = geo?.lon != null ? parseFloat(String(geo.lon)) : NaN;
  const hasCoords = !isNaN(glat) && !isNaN(glon);

  // Landmark status (local GeoJSON + city API)
  let landmarkResult: any = null;
  if (hasCoords) {
    try {
      landmarkResult = await checkLandmarkStatus(glat, glon, run.address);
      extraLines.push('\nLANDMARK STATUS:');
      extraLines.push(`  Official Chicago Landmark: ${landmarkResult.isOfficialLandmark ? `YES${landmarkResult.officialLandmarkName ? ` — ${landmarkResult.officialLandmarkName}` : ''}` : 'No'}`);
      extraLines.push(`  Landmark District: ${landmarkResult.isLandmarkDistrict ? `YES — ${landmarkResult.landmarkDistrictName || 'name not captured'}` : 'No'}`);
      if (landmarkResult.isLandmark && landmarkResult.landmarkName) {
        extraLines.push(`  Historic Resources Survey (CHRS) entry: ${landmarkResult.landmarkName}${landmarkResult.decade ? ` (built ~${landmarkResult.decade}s)` : ''}`);
      } else if (!landmarkResult.isOfficialLandmark && !landmarkResult.isLandmarkDistrict) {
        extraLines.push('  Historic Resources Survey (CHRS): no entry at this location');
      }
    } catch (e) {
      console.error('[EVIDENCE] block failed: landmark', e);
      extraLines.push('\nLANDMARK STATUS: [EXTRACTION FAILED — landmark data could not be read from the source. Do not state or imply anything about landmark or historic status.]');
    }
  } else {
    extraLines.push('\nLANDMARK STATUS: [EXTRACTION FAILED — no coordinates resolved for this address. Do not state or imply anything about landmark or historic status.]');
  }

  // SBIF eligibility (depends on TIF district)
  try {
    const sbif = await evaluateSbifEligibility(geo?.tifName ?? null);
    extraLines.push('\nSBIF ELIGIBILITY (Small Business Improvement Fund):');
    if (!sbif.tif.inTif) {
      extraLines.push('  Not in a TIF district — SBIF requires a TIF location, so this property is not SBIF-eligible.');
    } else {
      extraLines.push(`  TIF District: ${sbif.tif.districtName}`);
      extraLines.push(`  SBIF Status: ${sbif.sbif.statusLabel}${sbif.sbif.authorized ? '' : ' (TIF not currently SBIF-authorized)'}`);
      if (sbif.sbif.notes) extraLines.push(`  Notes: ${sbif.sbif.notes}`);
    }
  } catch (e) {
    console.error('[EVIDENCE] block failed: sbif', e);
    extraLines.push('\nSBIF ELIGIBILITY: [EXTRACTION FAILED — SBIF data could not be read from the source. Do not state or imply anything about SBIF eligibility.]');
  }

  // NMTC eligibility (census tract distress)
  if (hasCoords) {
    try {
      const nmtc = await checkNmtcEligibility(glat, glon);
      extraLines.push('\nNMTC ELIGIBILITY (New Markets Tax Credit):');
      extraLines.push(`  Status: ${nmtc.statusLabel}`);
      extraLines.push(`  Tract Distress: ${nmtc.distressLabel}`);
      const dd = nmtc.distressDetails;
      if (dd) {
        const parts: string[] = [];
        if (dd.povertyRate != null) parts.push(`poverty rate ${dd.povertyRate}%`);
        if (dd.pctMedianFamilyIncome != null) parts.push(`median family income ${dd.pctMedianFamilyIncome}% of area median`);
        if (dd.unemploymentRate != null) parts.push(`unemployment ${dd.unemploymentRate}%`);
        if (parts.length) extraLines.push(`  Tract Metrics: ${parts.join(', ')}`);
      }
    } catch (e) {
      console.error('[EVIDENCE] block failed: nmtc', e);
      extraLines.push('\nNMTC ELIGIBILITY: [EXTRACTION FAILED — NMTC data could not be read from the source. Do not state or imply anything about NMTC eligibility.]');
    }
  } else {
    extraLines.push('\nNMTC ELIGIBILITY: [EXTRACTION FAILED — no coordinates resolved for this address. Do not state or imply anything about NMTC eligibility.]');
  }

  // Location incentive areas (industrial corridor, enterprise zone, etc.)
  if (hasCoords) {
    try {
      const li = await checkLocationIncentives(glat, glon);
      extraLines.push('\nLOCATION INCENTIVE AREAS:');
      const inAreas: string[] = [];
      if (li.industrialCorridor.inCorridor) inAreas.push(`Industrial Corridor: ${li.industrialCorridor.name}${li.industrialCorridor.region ? ` (${li.industrialCorridor.region})` : ''}`);
      if (li.enterpriseZone.inZone) inAreas.push(`Enterprise Zone: ${li.enterpriseZone.zoneName || 'yes'}`);
      if (li.empowermentZone.inZone) inAreas.push(`Empowerment Zone: ${li.empowermentZone.zoneName || 'yes'}`);
      if (li.enterpriseCommunity.inCommunity) inAreas.push(`Enterprise Community: ${li.enterpriseCommunity.name || 'yes'}`);
      if (li.investSouthWest.inArea) inAreas.push(`INVEST South/West Area: ${li.investSouthWest.communityArea || 'yes'}`);
      if (li.nofEligibleArea.inEligibleArea) inAreas.push(`Neighborhood Opportunity Fund (NOF) Eligible Area${li.nofEligibleArea.ward ? ` (Ward ${li.nofEligibleArea.ward})` : ''}`);
      if (inAreas.length) {
        for (const a of inAreas) extraLines.push(`  In ${a}`);
      } else {
        extraLines.push('  Not in any special incentive area (industrial corridor, enterprise/empowerment zone, INVEST South/West, or NOF eligible area).');
      }
    } catch (e) {
      console.error('[EVIDENCE] block failed: locationIncentives', e);
      extraLines.push('\nLOCATION INCENTIVE AREAS: [EXTRACTION FAILED — location incentive data could not be read from the source. Do not state or imply anything about incentive areas.]');
    }
  } else {
    extraLines.push('\nLOCATION INCENTIVE AREAS: [EXTRACTION FAILED — no coordinates resolved for this address. Do not state or imply anything about incentive areas.]');
  }

  // Config-driven incentive program screening (same engine as the property page)
  if (hasCoords) {
    try {
      const projectCategory = run.lastProjectType
        ? (BUSINESS_USES.find(b => b.name === run.lastProjectType)?.category ?? null)
        : null;
      const official = await checkOfficialLandmarkFlag(glat, glon);
      const screenResults = await checkIncentives({
        lat: glat,
        lon: glon,
        projectCategory,
        projectType: run.lastProjectType ?? null,
        isLandmark: landmarkResult?.isLandmark ?? null,
        isOfficialLandmark: official.isOfficial,
        isLandmarkDistrict: landmarkResult?.isLandmarkDistrict ?? null,
        landmarkDistrictName: landmarkResult?.landmarkDistrictName ?? null,
        tractGeoid: geo?.tractGeoid ?? null,
        zipCode: geo?.zipCode ?? null,
        zoningCode: geo?.zoning ?? null,
        unitCount: (run.listingData as any)?.unitCount ?? null,
      });
      extraLines.push('\nINCENTIVE PROGRAM SCREENING (automated checker):');
      extraLines.push(`  Screened with project use: ${run.lastProjectType || 'none selected'}${projectCategory ? ` (category: ${projectCategory})` : ''}`);
      const trunc = (s: string) => (s || '').length > 220 ? `${s.slice(0, 217)}...` : (s || '');
      const positive = screenResults.filter(r => r.status === 'in_area' || r.status === 'potentially_eligible');
      const manual = screenResults.filter(r => r.status === 'manual_check');
      const reqIssues = screenResults.filter(r => r.isRequirement && (r.status === 'not_in_area' || r.status === 'not_applicable'));
      if (positive.length) {
        for (const r of positive) extraLines.push(`  [${r.status === 'in_area' ? 'IN AREA' : 'POTENTIALLY ELIGIBLE'}] ${r.name}: ${trunc(r.statement)}`);
      } else {
        extraLines.push('  No location- or project-based incentive programs matched this property.');
      }
      if (manual.length) extraLines.push(`  Manual verification needed: ${manual.map(r => r.name).join('; ')}`);
      for (const r of reqIssues) extraLines.push(`  [REQUIREMENT NOT MET] ${r.name}: ${trunc(r.statement)}`);
    } catch (e) {
      console.error('[EVIDENCE] block failed: incentiveScreening', e);
      extraLines.push('\nINCENTIVE PROGRAM SCREENING: [EXTRACTION FAILED — the incentive checker could not be run. Do not state or imply anything about program eligibility beyond the individual blocks above.]');
    }
  } else {
    extraLines.push('\nINCENTIVE PROGRAM SCREENING: [EXTRACTION FAILED — no coordinates resolved for this address. Do not state or imply anything about program eligibility.]');
  }

  // MLS listing data scraped from the listing URL (if this run had one)
  const listing = run.listingData as any;
  if (listing && (listing.unitCount || listing.unitTypes?.length || listing.listPrice || listing.totalMonthlyRent)) {
    extraLines.push(`\nMLS LISTING DATA (scraped from listing URL, source: ${listing.source || 'unknown'}):`);
    if (listing.propertyType) extraLines.push(`  Property Type: ${listing.propertyType}`);
    if (listing.listPrice) extraLines.push(`  List Price: $${Number(listing.listPrice).toLocaleString()}`);
    if (listing.unitCount) extraLines.push(`  Unit Count: ${listing.unitCount}`);
    if (listing.totalMonthlyRent) extraLines.push(`  Total Rent (all units): $${Number(listing.totalMonthlyRent).toLocaleString()}/month${listing.totalAnnualRent ? ` ($${Number(listing.totalAnnualRent).toLocaleString()}/year)` : ''}`);
    const units = Array.isArray(listing.unitTypes) ? listing.unitTypes.slice(0, 12) : [];
    if (units.length) {
      extraLines.push('  Units:');
      for (const u of units) {
        const bed = u.bedrooms != null ? `${u.bedrooms}BR` : 'BR?';
        const bath = u.bathrooms != null ? `/${u.bathrooms}BA` : '';
        const rent = u.monthlyRent != null ? ` — $${Number(u.monthlyRent).toLocaleString()}/mo` : ' — rent not listed';
        extraLines.push(`    - ${bed}${bath}${rent}`);
      }
    }
  } else {
    extraLines.push('\nMLS LISTING DATA: [EXTRACTION FAILED — no listing details were scraped for this run (no listing URL, or scrape found no unit/price data). Do not state or imply anything about listed units, rents, or list price.]');
  }

  // Nearby competitors via Google Places (needs a project use to derive the search)
  if (run.lastProjectType && hasCoords) {
    try {
      const term = derivePlacesSearchTerm(run.lastProjectType, run.lastFreeformDescription);
      const terms = (term || '').split(',').map((t: string) => t.trim()).filter(Boolean).slice(0, 3);
      if (terms.length) {
        const withTimeout = <T,>(p: Promise<T>, ms: number) => Promise.race([
          p,
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Places timeout')), ms)),
        ]);
        const settled = await Promise.allSettled(terms.map(t => withTimeout(fetchGooglePlacesData(glat, glon, t), 8000)));
        const seen = new Set<string>();
        const merged: GooglePlace[] = [];
        let anyOk = false;
        for (const s of settled) {
          if (s.status !== 'fulfilled') continue;
          anyOk = true;
          for (const p of ((s.value as any).places || [])) {
            const key = `${(p.name || '').toUpperCase()}|${(p.address || '').toUpperCase()}`;
            if (!seen.has(key)) { seen.add(key); merged.push(p); }
          }
        }
        if (!anyOk) throw new Error('All Places searches failed');
        merged.sort((a, b) => (a.distanceMiles ?? 99) - (b.distanceMiles ?? 99));
        extraLines.push(`\nNEARBY COMPETITORS (Google Places, search: "${terms.join(', ')}", within 1 mile):`);
        if (merged.length === 0) {
          extraLines.push('  No matching businesses found within 1 mile.');
        } else {
          extraLines.push(`  ${merged.length} matching business(es) found; closest ${Math.min(merged.length, 6)} shown:`);
          for (const p of merged.slice(0, 6)) {
            const dist = p.distanceMiles != null ? `${p.distanceMiles} mi` : 'distance unknown';
            const rating = p.rating != null ? `rating ${p.rating}${p.reviewsCount != null ? ` (${p.reviewsCount} reviews)` : ''}` : 'no rating';
            extraLines.push(`    - ${p.name} — ${dist} — ${rating}`);
          }
        }
      } else {
        extraLines.push('\nNEARBY COMPETITORS (Google Places): [EXTRACTION FAILED — no usable search term could be derived. Do not state or imply anything about nearby competitors.]');
      }
    } catch (e) {
      console.error('[EVIDENCE] block failed: googlePlaces', e);
      extraLines.push('\nNEARBY COMPETITORS (Google Places): [EXTRACTION FAILED — competitor data could not be read from the source. Do not state or imply anything about nearby competitors.]');
    }
  } else {
    extraLines.push(`\nNEARBY COMPETITORS (Google Places): [EXTRACTION FAILED — ${!hasCoords ? 'no coordinates resolved for this address' : 'no project use selected for this run'}, so no competitor search was performed. Do not state or imply anything about nearby competitors.]`);
  }

  // Commercial for-lease market (LoopNet/Crexi via Apify) — cache-read ONLY.
  // fetchCrexiData starts a paid actor run on cache miss; never call it here.
  if (geo?.zipCode) {
    const crexi = readCachedCrexi(geo.zipCode);
    if (crexi) {
      extraLines.push(`\nCOMMERCIAL LEASE MARKET (LoopNet, ZIP ${geo.zipCode}, data fetched ${String(crexi.fetchedAt).slice(0, 10)}):`);
      if (crexi.count === 0) {
        extraLines.push('  No commercial for-lease listings found in this ZIP.');
      } else {
        extraLines.push(`  Active For-Lease Listings: ${crexi.count}${crexi.corridorListingCount ? ` (${crexi.corridorListingCount} on the same corridor)` : ''}`);
        if (crexi.avgPricePerSqFtYear != null) extraLines.push(`  Average Asking Rent: $${crexi.avgPricePerSqFtYear}/SF/year`);
        if (crexi.medianSqFt != null) extraLines.push(`  Median Size: ${Number(crexi.medianSqFt).toLocaleString()} SF${crexi.minSqFt != null && crexi.maxSqFt != null ? ` (range ${Number(crexi.minSqFt).toLocaleString()}–${Number(crexi.maxSqFt).toLocaleString()} SF)` : ''}`);
        const top = [...crexi.listings].sort((a, b) => Number(b.onCorridor) - Number(a.onCorridor) || (a.distanceMiles ?? 99) - (b.distanceMiles ?? 99)).slice(0, 3);
        if (top.length) {
          extraLines.push('  Sample Listings:');
          for (const l of top) {
            const size = l.sizeSqFt != null ? `${Number(l.sizeSqFt).toLocaleString()} SF` : 'size unknown';
            const price = l.pricePerSqFtYear != null ? `$${l.pricePerSqFtYear}/SF/yr` : (l.totalMonthly != null ? `$${Number(l.totalMonthly).toLocaleString()}/mo` : 'price unknown');
            extraLines.push(`    - ${l.address || 'address not listed'} — ${size} — ${price}${l.leaseType ? ` — ${l.leaseType}` : ''}${l.onCorridor ? ' — same corridor' : ''}`);
          }
        }
      }
    } else {
      extraLines.push(`\nCOMMERCIAL LEASE MARKET (LoopNet, ZIP ${geo.zipCode}): [EXTRACTION FAILED — no commercial lease data cached for this ZIP (it is fetched on demand when the property page is viewed). Do not state or imply anything about commercial lease rates or availability.]`);
    }
  } else {
    extraLines.push('\nCOMMERCIAL LEASE MARKET (LoopNet): [EXTRACTION FAILED — no ZIP resolved for this address. Do not state or imply anything about commercial lease rates or availability.]');
  }

  // Hourly space market (Peerspace via Apify) — cache-read ONLY (same reason).
  if (geo?.zipCode) {
    const peer = readCachedPeerspace(geo.zipCode);
    if (peer) {
      extraLines.push(`\nHOURLY SPACE MARKET (Peerspace, ZIP ${geo.zipCode}, data fetched ${String(peer.fetchedAt).slice(0, 10)}):`);
      if (peer.count === 0) {
        extraLines.push('  No hourly rental venues found near this ZIP.');
      } else {
        extraLines.push(`  Venues Found: ${peer.count}`);
        if (peer.avgPricePerHour != null) extraLines.push(`  Average Rate: $${peer.avgPricePerHour}/hour${peer.minPricePerHour != null && peer.maxPricePerHour != null ? ` (range $${peer.minPricePerHour}–$${peer.maxPricePerHour}/hour)` : ''}`);
        const topVenues = peer.listings.slice(0, 3);
        if (topVenues.length) {
          extraLines.push('  Sample Venues:');
          for (const v of topVenues) {
            const price = v.pricePerHour != null ? `$${v.pricePerHour}/hr` : 'rate unknown';
            const cap = v.capacity != null ? ` — capacity ${v.capacity}` : '';
            extraLines.push(`    - ${v.title || 'untitled venue'} — ${price}${cap}`);
          }
        }
      }
    } else {
      extraLines.push(`\nHOURLY SPACE MARKET (Peerspace, ZIP ${geo.zipCode}): [EXTRACTION FAILED — no hourly space data cached for this ZIP (it is fetched on demand when the property page is viewed). Do not state or imply anything about hourly space rates.]`);
    }
  } else {
    extraLines.push('\nHOURLY SPACE MARKET (Peerspace): [EXTRACTION FAILED — no ZIP resolved for this address. Do not state or imply anything about hourly space rates.]');
  }

  // Vehicle ownership (community-area level, local ACS-derived dataset)
  const vo = getVehicleOwnership(geo?.communityArea);
  if (vo) {
    extraLines.push(`\nVEHICLE OWNERSHIP (${vo.communityArea} community area):`);
    extraLines.push(`  Households with a Vehicle: ${vo.pctWithVehicle}% (no vehicle: ${vo.pctNoVehicle}%)`);
    extraLines.push(`  Avg Vehicles per Household: ${vo.avgVehiclesPerHousehold} — ${vo.autoDependencyLevel} auto dependency (${vo.comparedToCityAvg})`);
  } else {
    extraLines.push('\nVEHICLE OWNERSHIP: [EXTRACTION FAILED — no community area resolved for this address, so vehicle ownership data could not be read. Do not state or imply anything about car ownership rates.]');
  }

  // Senior population (only when relevant to the selected project use)
  const seniorRelevant = /senior|assisted|nursing|memory care|adult day|residential|apartment|housing|multi|medical|clinic|home care/i.test(run.lastProjectType || '');
  if (seniorRelevant) {
    const sr = getSeniorsData(geo?.communityArea);
    if (sr) {
      extraLines.push(`\nSENIOR POPULATION (${sr.communityArea} community area):`);
      extraLines.push(`  Residents 65+: ${sr.population65Plus.toLocaleString()} (${sr.pct65Plus}% of population)`);
      extraLines.push(`  Seniors Living Alone: ${sr.seniorsLivingAlone.toLocaleString()} (${sr.pctSeniorsLivingAlone}% of seniors)`);
      extraLines.push(`  Senior Demand Level: ${sr.seniorDemandLevel} — ${sr.comparedToCityAvg} (${sr.rankDescription})`);
    } else {
      extraLines.push('\nSENIOR POPULATION: [EXTRACTION FAILED — no community area resolved for this address, so senior population data could not be read. Do not state or imply anything about the senior population.]');
    }
  }

  let fullContext = baseContext + (extraLines.length ? '\n' + extraLines.join('\n') : '');

  // ── Deterministic coverage checklist ───────────────────────────────────────
  // Every expected evidence section must appear as data OR as its explicit
  // marker. Missing sections are logged loudly and flagged to the model, but
  // NEVER block generation (generation is a paid user action).
  const isDaycareOrSchoolRun = /day care|daycare|school/i.test(run.lastProjectType || '');
  const coverageChecks: Array<{ name: string; pattern: RegExp; applies: boolean }> = [
    { name: 'physical_property', pattern: /PHYSICAL PROPERTY DATA/, applies: true },
    { name: 'zoning', pattern: /ZONING DETAILS|ZONING CODE|Zoning:/i, applies: true },
    { name: 'tif_district', pattern: /TIF DISTRICT/i, applies: true },
    { name: 'opportunity_zone', pattern: /OPPORTUNITY ZONE/i, applies: true },
    { name: 'transit', pattern: /TRANSIT PROXIMITY/, applies: true },
    { name: 'community_demographics', pattern: /COMMUNITY DEMOGRAPHICS/, applies: true },
    { name: 'childcare', pattern: /CHILDCARE ACCESS/, applies: isDaycareOrSchoolRun },
    { name: 'property_tax', pattern: /PROPERTY TAX DATA/, applies: true },
    { name: 'recorder_liens', pattern: /RECORDER OF DEEDS/, applies: true },
    { name: 'rental_market', pattern: /RENTAL MARKET DATA/, applies: true },
    { name: 'landmark', pattern: /LANDMARK STATUS/, applies: true },
    { name: 'sbif', pattern: /SBIF ELIGIBILITY/, applies: true },
    { name: 'nmtc', pattern: /NMTC ELIGIBILITY/, applies: true },
    { name: 'location_incentive_areas', pattern: /LOCATION INCENTIVE AREAS/, applies: true },
    { name: 'incentive_screening', pattern: /INCENTIVE PROGRAM SCREENING/, applies: true },
    { name: 'mls_listing', pattern: /MLS LISTING DATA/, applies: true },
    { name: 'competitors', pattern: /NEARBY COMPETITORS/, applies: true },
    { name: 'commercial_lease_market', pattern: /COMMERCIAL LEASE MARKET/, applies: true },
    { name: 'hourly_space_market', pattern: /HOURLY SPACE MARKET/, applies: true },
    { name: 'vehicle_ownership', pattern: /VEHICLE OWNERSHIP/, applies: true },
    { name: 'senior_population', pattern: /SENIOR POPULATION/, applies: seniorRelevant },
  ];
  const missingSections = coverageChecks.filter(c => c.applies && !c.pattern.test(fullContext)).map(c => c.name);
  if (missingSections.length) {
    console.error(`[EVIDENCE COVERAGE] run ${runId}: MISSING sections: ${missingSections.join(', ')}`);
    fullContext += `\n\n[COVERAGE WARNING — the following expected evidence sections are absent from this package: ${missingSections.join(', ')}. Treat each as unread; do not state or imply anything about their contents.]`;
  } else {
    console.log(`[EVIDENCE COVERAGE] run ${runId}: all ${coverageChecks.filter(c => c.applies).length} applicable sections present`);
  }
  const coverage = {
    checked: coverageChecks.filter(c => c.applies).map(c => c.name),
    missing: missingSections,
  };

  // [DIAG] Prose diagnostics (STEP B)
  console.log('[DIAG] fullContext chars:', fullContext.length, '~tokens:', Math.round(fullContext.length / 4));
  console.log('[DIAG] EXTRACTION FAILED markers:', (fullContext.match(/EXTRACTION FAILED/g) ?? []).length);
  const saleWindow = fullContext.match(/.{0,150}(Deed\/Sale|[Ss]old).{0,250}/)?.[0];
  console.log('[DIAG] sale window:', saleWindow ?? 'NO SALE TEXT FOUND');
  for (const k of ['Zoning', 'tax', 'Recorder', 'lien', 'rent', 'Day Care', 'transit', 'FORECLOSURE']) {
    console.log(`[DIAG] contains "${k}":`, fullContext.includes(k));
  }

  return { run, geo, pin: pin ?? null, fullContext, coverage };
}

async function generateInsightReportContent(
  runId: number,
  opts?: {
    /** "as_is" = public-record read: no user deal inputs (project use, context, valuation) in the prompt. */
    mode?: 'tailored' | 'as_is';
    /** Called with the count of findings the model has finished streaming — drives REAL progress. */
    onFinding?: (count: number) => void;
  },
): Promise<object> {
  const asIs = opts?.mode === 'as_is';
  // as-is: the evidence builder itself strips user deal inputs (see
  // buildInsightReportEvidence) — the returned `run` is already sanitized.
  const { run, geo, pin, fullContext } = await buildInsightReportEvidence(runId, { publicRecordOnly: asIs });

  // Assemble funnel signals ("as-is" = public-record only; no user-deal flags)
  const funnelLines: string[] = [];
  if (!asIs) {
    if (run.lastProjectType) funnelLines.push(`funnel.project_type: ${run.lastProjectType}`);
    if (run.lastRole) funnelLines.push(`funnel.user_profile: ${run.lastRole}`);
    if (run.lastTransactionType) funnelLines.push(`funnel.intent: ${run.lastTransactionType}`);
    if (run.lastFreeformDescription) funnelLines.push(`funnel.intended_use: ${run.lastFreeformDescription}`);
  } else {
    funnelLines.push('funnel: none — the user requested a PUBLIC-RECORD read. Do not assume any intended use, deal terms, or user plans; synthesize from the public record only.');
  }

  // Derive requires_zoning_relief from project use vs zoning (conservative: only set true if explicit mismatch)
  let requiresZoningRelief = false;
  if (!asIs && run.lastProjectType && geo?.zoning) {
    const compat = checkZoningCompatibility(run.lastProjectType, geo.zoning);
    requiresZoningRelief = compat.permission === 'not_allowed';
  }
  if (!asIs) funnelLines.push(`funnel.requires_zoning_relief: ${requiresZoningRelief}`);

  // Valuation from reportContext — full fidelity: any saved pricing/NOI signal
  // (manual, rental-derived, or SBA split) produces a valuation block. The old
  // purchasePrice||manualNoi gate silently dropped rental-NOI and SBA-only runs.
  const rc = run.reportContext as any;
  const v = rc?.valuation;
  const cm = v?.computed;
  const hasValuationSignal = !asIs && !!(v && (
    v.purchasePrice || v.manualNoi || v.grossIncome ||
    v.sbaBusinessPrice || v.sbaRealEstatePrice ||
    cm?.purchasePrice || cm?.selectedNoi
  ));
  if (hasValuationSignal) {
    funnelLines.push('funnel.valuation:');
    const effPrice = v.purchasePrice ?? cm?.purchasePrice;
    if (effPrice) funnelLines.push(`  purchase_price: $${Number(effPrice).toLocaleString()}`);
    const effNoi = v.manualNoi ?? cm?.selectedNoi;
    if (effNoi) funnelLines.push(`  noi: $${Number(effNoi).toLocaleString()}/year${cm?.noiSource ? ` (source: ${cm.noiSource})` : ''}`);
    if (v.grossIncome) funnelLines.push(`  gross_rental_income: $${Number(v.grossIncome).toLocaleString()}/year`);
    if (v.loanType) funnelLines.push(`  loan_type: ${v.loanType}`);
    if (v.interestRate) funnelLines.push(`  interest_rate: ${v.interestRate}%`);
    if (v.sbaBusinessPrice) funnelLines.push(`  sba_business_price: $${Number(v.sbaBusinessPrice).toLocaleString()} (${v.sbaBusinessDownPercent ?? 10}% down, ${v.sbaBusinessTermYears ?? 10}yr @ ${v.sbaBusinessInterestRate ?? 10.25}%)`);
    if (v.sbaRealEstatePrice) funnelLines.push(`  sba_real_estate_price: $${Number(v.sbaRealEstatePrice).toLocaleString()} (${v.sbaRealEstateDownPercent ?? 10}% down, ${v.sbaRealEstateTermYears ?? 25}yr @ ${v.sbaRealEstateInterestRate ?? 6.0}%)`);
    if (v.annualTaxes) funnelLines.push(`  annual_taxes_input: $${Number(v.annualTaxes).toLocaleString()}`);
    if (v.annualInsurance) funnelLines.push(`  annual_insurance_input: $${Number(v.annualInsurance).toLocaleString()}`);
    if (cm) {
      if (cm.downPayment != null) funnelLines.push(`  down_payment: $${Number(cm.downPayment).toLocaleString()}`);
      if (cm.loanAmount != null) funnelLines.push(`  loan_amount: $${Number(cm.loanAmount).toLocaleString()}`);
      if (cm.annualDebtService != null) funnelLines.push(`  annual_debt_service: $${Number(cm.annualDebtService).toLocaleString()}`);
      if (cm.annualCashFlow != null) funnelLines.push(`  annual_cash_flow: $${Number(cm.annualCashFlow).toLocaleString()}`);
      if (cm.dscr != null) funnelLines.push(`  dscr: ${cm.dscr}`);
      if (cm.capRate != null) funnelLines.push(`  cap_rate: ${cm.capRate}%`);
      if (cm.roi != null) funnelLines.push(`  cash_on_cash_roi: ${cm.roi}%`);
    }
  } else {
    funnelLines.push('funnel.valuation: null');
  }

  const generationDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Chicago' });

  // Assemble the structured property context for the prompt builder.
  // Canonical property_context fields come from the stored context (one per run);
  // the full evidence package and funnel signals are carried alongside so the
  // model sees everything the app knows about the property in one place.
  const storedContext = await getPropertyContext(runId).catch(() => null);
  // as-is: ui_context/onepager_context may carry user-derived material from
  // context extraction — drop them entirely and keep only public-record facts
  // (snapshot/sections/sources) plus our own generation metadata.
  const contextInput = {
    property_id: storedContext?.property_id ?? pin ?? run.address,
    report_id: storedContext?.report_id ?? String(runId),
    property_snapshot: storedContext?.property_snapshot ?? null,
    sections: storedContext?.sections ?? null,
    ui_context: {
      ...(asIs ? {} : (storedContext?.ui_context ?? {})),
      report_generation_date: generationDate,
      funnel_signals: funnelLines,
    },
    onepager_context: {
      ...(asIs ? {} : (storedContext?.onepager_context ?? {})),
      raw_property_evidence: fullContext,
    },
    source_index: storedContext?.source_index ?? [],
  };

  // Content-only pipeline: the model returns structured JSON content; the
  // fixed template (server/insightReportTemplate.ts) owns the entire design.
  // This cuts output tokens (and generation time) by more than half versus
  // asking the model to write full HTML+CSS.
  const assembledPrompt = buildPropertyInsightContentPrompt(contextInput);

  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Streaming is required by the SDK for high max_tokens values; we still
  // collect the complete message before parsing, so behavior is unchanged.
  // The model's leading "thinking" block counts against max_tokens and can be
  // large on complex evidence; 32000 keeps generous headroom over the
  // ~2-3K-token JSON so we never truncate (see claude-sonnet-5 quirks).
  // Cap the model's silent "thinking" phase — with full-HTML generation it
  // was spending ~12K tokens (2+ min) reasoning before writing. Adaptive
  // thinking at medium effort keeps the analytical quality while cutting most
  // of that dead time. These two fields are claude-sonnet-5-specific and not
  // yet in the SDK types (thinking.type "enabled" is rejected by this model),
  // so only this small extras object is untyped — the rest stays checked.
  const modelExtras = { thinking: { type: 'adaptive' }, output_config: { effort: 'medium' } } as Record<string, unknown>;

  // The model occasionally overruns a per-field length cap or emits invalid
  // JSON. Rather than failing the whole request (a user-facing 500), retry
  // once with the exact validation error appended so the model can fix it.
  const MAX_ATTEMPTS = 2;
  let lastErr: any = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const promptForAttempt = attempt === 1
      ? assembledPrompt
      : `${assembledPrompt}\n\nIMPORTANT: Your previous response was rejected with this validation error:\n"${String(lastErr?.message || lastErr)}"\nRegenerate the FULL JSON, fixing that problem (shorten the offending text well under its limit) while keeping everything else equivalent.`;
    const stream = client.messages.stream({
      model: REPORT_MODEL,
      max_tokens: 32000,
      messages: [{ role: 'user', content: promptForAttempt }],
      ...modelExtras,
    });
    // REAL progress: each finding carries exactly one "status":"red|yellow|green"
    // — count them as they stream (never a timer). Each validation-retry
    // attempt explicitly resets the count to 0 so the bar never shows a stale
    // count from a rejected attempt.
    if (opts?.onFinding) {
      opts.onFinding(0);
      let streamed = '';
      stream.on('text', (t: string) => {
        streamed += t;
        const n = (streamed.match(/"status"\s*:\s*"(red|yellow|green)"/g) || []).length;
        opts.onFinding!(Math.min(n, 8));
      });
    }
    const response = await stream.finalMessage();

    console.log(`[INSIGHT REPORT] run ${runId} attempt ${attempt} token usage: input=${response.usage?.input_tokens} output=${response.usage?.output_tokens} stop_reason=${response.stop_reason} prompt_chars=${promptForAttempt.length}`);

    try {
      const raw = response.content
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text || '')
        .join('')
        .trim();
      if (!raw) throw new Error(`Insight report generation returned no text (stop_reason: ${response.stop_reason})`);
      if (response.stop_reason === 'max_tokens') throw new Error('Insight report generation hit the token limit and was truncated — not saving partial content');

      // Strip markdown fences if Claude wrapped the JSON anyway, then parse + validate + render.
      const jsonText = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
      let parsed: any;
      try {
        parsed = JSON.parse(jsonText);
      } catch (e: any) {
        throw new Error(`Insight report content was not valid JSON (${e?.message}) — not saving`);
      }
      const content = validateInsightReportContent(parsed);
      const html = renderInsightReport(run.address, generationDate, content);
      return { html };
    } catch (err: any) {
      lastErr = err;
      console.error(`[insight-report] run ${runId} attempt ${attempt} failed validation: ${err?.message}`);
    }
  }
  throw lastErr;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Initialize GIS data, childcare data, grocery data, polygon data, and transit data
  initGIS();
  void loadChildcareData();
  initGroceryData();
  loadPolygonData();
  initTransit().catch(err => console.error('Transit init error:', err));
  void initIncentivesChecker().catch(err => console.error('Incentives checker init error:', err));
  warmDemographicsCache();

  // Apply rate limiter to API routes
  app.use('/api', rateLimiter);

  // === PUBLIC REPORT ACCESS (no auth required) ===

  app.get('/api/public/run/:runId', async (req, res) => {
    const runId = parseInt(req.params.runId);
    if (isNaN(runId)) return res.status(404).json({ message: 'Invalid ID' });
    const run = await storage.getRun(runId);
    if (!run) return res.status(404).json({ message: 'Report not found' });
    if (!run.purchasedAt) return res.status(403).json({ message: 'This report has not been purchased' });
    res.json(run);
  });

  // === RUNS ===

  app.get(api.runs.list.path, async (req, res) => {
    const bearer = req.headers.authorization?.startsWith("Bearer ")
      ? await resolveUserFromToken(req.headers.authorization.slice(7).trim()) : null;
    const userId = req.user?.email ?? bearer?.email ?? null;
    if (!userId) return res.json([]);
    const runs = await storage.getRuns(userId);
    res.json(runs);
  });

  app.get(api.runs.get.path, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(404).json({ message: "Invalid ID" });

    let run = await storage.getRun(id);
    if (!run) return res.status(404).json({ message: "Run not found" });
    const bearer = req.headers.authorization?.startsWith("Bearer ")
      ? await resolveUserFromToken(req.headers.authorization.slice(7).trim()) : null;
    const email = req.user?.email ?? bearer?.email;
    if (!email || (run.userId ?? "").toLowerCase() !== email.toLowerCase()) {
      return res.status(404).json({ message: "Run not found" });
    }

    // Auto-unlock for trial users who still have reports remaining
    const trialUser = req.user && typeof req.user.trialReportsRemaining === 'number' && req.user.trialReportsRemaining > 0;
    if (trialUser && !run.purchasedAt) {
      run = (await storage.markRunAsPurchased(id)) as any || run;
      await storage.decrementTrialReport(req.user!.id);
      // Refresh the session so the new count is reflected immediately
      if (req.user) {
        req.user.trialReportsRemaining = (req.user.trialReportsRemaining as number) - 1;
      }
      console.log(`[TRIAL] Auto-unlocked run ${id} for user ${req.user!.id} — ${(req.user!.trialReportsRemaining as number)} trial(s) remaining`);
    }

    res.json(run);
  });

  app.post(api.runs.create.path, async (req, res) => {
    try {
      // Session cookie OR Bearer token (iframe contexts block cookies — same pattern as loadOwnedRun)
      let authUser = (req.isAuthenticated?.() && req.user) ? req.user : null;
      if (!authUser) {
        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith('Bearer ')) {
          const { resolveUserFromToken } = await import('./auth.js');
          authUser = await resolveUserFromToken(authHeader.slice(7).trim());
        }
      }
      if (!authUser) {
        return res.status(401).json({ message: 'You must be signed in to run a report.' });
      }
      // Team accounts are paused from creating new reports during the redesign.
      const { isPausedTeamMember } = await import('./teamAccounts.js');
      if (isPausedTeamMember(authUser.email)) {
        return res.status(403).json({ message: 'New reports are paused while the site is being redesigned. Sukhmit will reach out when it\'s ready for your feedback.' });
      }
      req.user = authUser;
      const input = api.runs.create.input.parse(req.body);
      if (input.address && !hasUserSpecifiedUnit(input.address)) {
        input.address = stripCensusUnitArtifact(input.address);
      }
      // Auto-label duplicate-address runs so scenarios are distinguishable in the sidebar/header.
      // Count+insert run atomically (advisory lock) so concurrent creates can't get the same number.
      const run = await storage.createRunWithAutoLabel({ ...input, userId: req.user!.email });

      // Auto-create the empty property memory context for this run.
      // Non-blocking: a context failure must never fail run creation.
      try {
        const { propertyId } = await resolvePropertyIdForAddress(run.address);
        await createPropertyContext(run.id, propertyId);
      } catch (ctxErr) {
        console.error(`[PROPERTY CONTEXT] Failed to auto-create context for run ${run.id}:`, ctxErr);
      }

      res.status(201).json(run);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  // === PROPERTY MEMORY CONTEXT (read-only inspection) ===
  // Dev-only: returns the canonical property_context object for a run, plus a
  // live validation report. Never mounted in prod — the context contains
  // owner/lien data keyed by guessable run ids. Write access is
  // server-internal only (server/propertyContext.ts).
  if (process.env.NODE_ENV === 'development') {
    app.get('/api/property-context/:runId', async (req, res) => {
      const runId = parseInt(req.params.runId);
      if (isNaN(runId)) return res.status(404).json({ message: "Invalid run ID" });

      const context = await getPropertyContext(runId);
      if (!context) return res.status(404).json({ message: `No property context exists for run ${runId}` });

      res.json({
        context,
        validation: validateContextObject(context as PropertyContext),
      });
    });
  }

  app.delete(api.runs.delete.path, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(404).json({ message: "Invalid ID" });
    const run = await storage.getRun(id);
    if (!req.user || !run || (run.userId ?? "").toLowerCase() !== req.user.email.toLowerCase()) {
      return res.status(404).json({ message: "Run not found" });
    }
    await storage.deleteRun(id);
    res.status(204).send();
  });

  // Delete all runs
  app.delete('/api/runs', async (req, res) => {
    try {
      const userId = req.user?.email;
      if (!userId) return res.status(401).json({ message: 'Not authenticated' });
      await storage.deleteAllRuns(userId);
      res.status(204).send();
    } catch (err) {
      console.error('Delete all runs error:', err);
      res.status(500).json({ message: "Failed to delete all runs" });
    }
  });

  // Toggle favorite
  app.patch('/api/runs/:id/favorite', async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(404).json({ message: "Invalid ID" });
    
    const run = await storage.toggleFavoriteRun(id);
    if (!run) return res.status(404).json({ message: "Run not found" });
    
    res.json(run);
  });

  // Update scenario label (distinguishes duplicate-address runs). Owner-only.
  app.patch('/api/runs/:id/label', async (req, res) => {
    const owned = await loadOwnedRun(req, res);
    if (!owned) return;
    const raw = req.body?.label;
    const label = typeof raw === 'string' && raw.trim() ? raw.trim().slice(0, 60) : null;
    const run = await storage.updateRunLabel(owned.id, label);
    if (!run) return res.status(404).json({ message: "Run not found" });
    res.json(run);
  });

  // Update project use
  app.patch('/api/runs/:id/project-type', async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(404).json({ message: "Invalid ID" });
    
    const { projectType } = req.body;
    const run = await storage.updateRunProjectType(id, projectType || null);
    if (!run) return res.status(404).json({ message: "Run not found" });
    
    res.json(run);
  });

  // Update all funnel answers (role, transactionType, projectType, freeformDescription)
  app.patch('/api/runs/:id/funnel-answers', async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(404).json({ message: "Invalid ID" });

    const { role, transactionType, projectType, freeformDescription, referralNeeds } = req.body;
    const run = await storage.updateRunFunnelAnswers(id, {
      role: role || null,
      transactionType: transactionType || null,
      projectType: projectType || null,
      freeformDescription: freeformDescription || null,
      referralNeeds: Array.isArray(referralNeeds) && referralNeeds.length > 0 ? referralNeeds : null,
    });
    if (!run) return res.status(404).json({ message: "Run not found" });

    res.json(run);
  });

  // Update manual property data (user-entered square footage, stories, etc.)
  app.patch('/api/runs/:id/manual-property', async (req, res) => {
    const owned = await loadOwnedRun(req, res);
    if (!owned) return;
    const parsed = manualPropertyPatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid property measurements", errors: parsed.error.flatten() });
    const run = await storage.updateRunManualProperty(owned.id, parsed.data);
    if (!run) return res.status(404).json({ message: "Run not found" });
    
    res.json(run);
  });

  app.patch('/api/runs/:id/report-context', async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(404).json({ message: "Invalid ID" });

    const run = await storage.getRun(id);
    if (!run) return res.status(404).json({ message: "Run not found" });
    if (!req.user || !req.isAuthenticated()) {
      return res.status(401).json({ message: "You must be signed in to save report inputs." });
    }
    const isSubscriber = req.user.plan === 'subscriber';
    if (!run.purchasedAt && !isSubscriber) {
      return res.status(403).json({ message: "Only subscribers can re-run reports." });
    }

    const parsed = reportContextPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid report context payload", errors: parsed.error.flatten().fieldErrors });
    }
    const updated = await storage.updateRunReportContext(id, {
      ...parsed.data,
      submittedAt: new Date().toISOString(),
      locked: !isSubscriber,
    } as any);
    if (!updated) return res.status(404).json({ message: "Run not found" });

    res.json(updated);
  });

  // GET /api/runs/:id/listing-data — Scrape and cache MLS listing details (units, rents)
  app.get('/api/runs/:id/listing-data', async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid ID' });
    const run = await storage.getRun(id);
    if (!run) return res.status(404).json({ message: 'Run not found' });
    // Only scrape if sourceListingUrl is an actual HTTP URL (not a plain address string)
    const isValidUrl = run.sourceListingUrl && /^https?:\/\//i.test(run.sourceListingUrl);
    if (!isValidUrl) return res.json(null);

    // Return cached data if available
    if ((run as any).listingData) return res.json((run as any).listingData);

    // Scrape and cache
    try {
      const { scrapeListingUrl } = await import('./listingScraper.js');
      const data = await scrapeListingUrl(run.sourceListingUrl);
      if (data) {
        await storage.updateRunListingData(id, data);
        return res.json(data);
      }
      return res.json(null);
    } catch (err) {
      console.error('[LISTING DATA] Scrape failed:', err);
      return res.json(null);
    }
  });

  // Listing Snapshot — on-demand AI web-search lookup of the active listing.
  // GET returns the cached snapshot (or null); POST generates/refreshes it.
  // Both are owner-only: POST triggers a PAID Anthropic web-search call, so it is
  // additionally serialized per run (no concurrent duplicates) with a cooldown.
  const listingSnapshotInFlight = new Set<string>();
  const listingSnapshotLastRun = new Map<number, number>();
  const LISTING_SNAPSHOT_COOLDOWN_MS = 60 * 1000;
  const LISTING_SNAPSHOT_ADDRESS_CACHE_MS = 7 * 24 * 60 * 60 * 1000; // reuse same-address snapshots < 7 days old

  const loadOwnedRun = async (req: any, res: any): Promise<Run | null> => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ message: 'Invalid ID' }); return null; }
    // Session cookie OR Bearer token (iframe contexts block cookies — same pattern as /api/auth/me)
    let authUser = (req.isAuthenticated?.() && req.user) ? req.user : null;
    if (!authUser) {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        const { resolveUserFromToken } = await import('./auth.js');
        authUser = await resolveUserFromToken(authHeader.slice(7).trim());
      }
    }
    if (!authUser) { res.status(401).json({ message: 'You must be signed in.' }); return null; }
    req.user = authUser;
    const run = await storage.getRun(id);
    // 404 for both missing and non-owned runs — don't reveal which.
    // Email compare is case-insensitive: legacy accounts differ in casing.
    if (!run || (run.userId ?? '').toLowerCase() !== (req.user.email ?? '').toLowerCase()) { res.status(404).json({ message: 'Run not found' }); return null; }
    return run;
  };

  app.get('/api/runs/:id/listing-snapshot', async (req, res) => {
    const run = await loadOwnedRun(req, res);
    if (!run) return;
    return res.json((run as any).listingSnapshot ?? null);
  });

  // GET /api/runs/:id/pdf — server-generated PDF report (purpose-built document,
  // not a webpage print). Owner-gated + requires subscription or purchase,
  // matching the insight-report access rule.
  app.get('/api/runs/:id/pdf', async (req, res) => {
    const run = await loadOwnedRun(req, res);
    if (!run) return;
    const isSubscriber = (req.user as any)?.plan === 'subscriber';
    if (!isSubscriber && !run.purchasedAt) {
      return res.status(403).json({ message: 'Access requires a purchase or subscription' });
    }
    try {
      const { renderRunPdf } = await import('./reportPdf.js');
      let ward: { ward: string | null; alderman: string | null; aldermanPhone?: string | null } = { ward: null, alderman: null };
      try {
        const geo = await storage.getGeocodeAnyAge(run.address.trim().toLowerCase());
        if (geo) ward = lookupWardByCoordinates(parseFloat(geo.lat), parseFloat(geo.lon));
      } catch { /* ward stays unavailable — rendered as em-dash, not fatal */ }
      const pdf = await renderRunPdf(run, ward, { preparedFor: (req.user as any)?.email });
      const slug = run.address.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="knowyourprop-report-${slug}.pdf"`);
      return res.end(pdf);
    } catch (err: any) {
      console.error('[REPORT PDF] Generation failed:', err);
      return res.status(500).json({ message: 'PDF generation failed — please try again' });
    }
  });

  app.post('/api/runs/:id/listing-snapshot', async (req, res) => {
    const run = await loadOwnedRun(req, res);
    if (!run) return;
    const address = ((run as any).facts)?.formattedAddress || run.address;
    if (!address) return res.status(400).json({ message: 'Run has no address' });
    const force = req.body?.force === true || req.query?.force === '1';
    // In-flight lock is address-scoped (per user) so two runs of the same address can't
    // both launch a paid lookup concurrently.
    const addrKey = `${String((run as any).userId || '').toLowerCase()}|${run.address.toLowerCase()}`;
    if (listingSnapshotInFlight.has(addrKey)) {
      return res.status(409).json({ message: 'A listing lookup for this property is already running.' });
    }
    const last = listingSnapshotLastRun.get(run.id);
    if (last && Date.now() - last < LISTING_SNAPSHOT_COOLDOWN_MS) {
      return res.status(429).json({ message: 'Please wait a minute before re-checking this listing.' });
    }
    listingSnapshotInFlight.add(addrKey);
    try {
      // Reuse a recent snapshot from another run of the same address (same user) — avoids
      // paying for a duplicate lookup. A manual "Re-check" passes force to bypass.
      // Checked inside the lock so a concurrent lookup's fresh result is seen.
      if (!force) {
        try {
          const cached = await storage.findRecentListingSnapshotForAddress(
            String((run as any).userId || ''), run.address, run.id, LISTING_SNAPSHOT_ADDRESS_CACHE_MS
          );
          if (cached) {
            await storage.updateRunListingSnapshot(run.id, cached);
            return res.json(cached);
          }
        } catch (e) {
          console.error('[LISTING SNAPSHOT] Address-cache lookup failed (continuing to live fetch):', e);
        }
      }
      const { fetchListingSnapshot } = await import('./listingSnapshot.js');
      const snapshot = await fetchListingSnapshot(address);
      await storage.updateRunListingSnapshot(run.id, snapshot);
      listingSnapshotLastRun.set(run.id, Date.now());
      return res.json(snapshot);
    } catch (err) {
      console.error('[LISTING SNAPSHOT] Failed:', err);
      return res.status(502).json({ message: 'Listing lookup failed — please try again' });
    } finally {
      listingSnapshotInFlight.delete(addrKey);
    }
  });

  // === CRIME TAKEAWAY (cached AI summary rendered atop the crime section) ===
  // Generated once per run from the crime data the client already fetched;
  // regenerated only when that data changes (dataHash mismatch). Never called
  // on plain page views — the GET just returns the stored JSON.
  const crimeTakeawayInFlight = new Set<number>();

  // CSRF guard for cookie-authenticated paid-model POSTs: browsers always send
  // an Origin header on cross-site POSTs, so reject any Origin whose host isn't
  // ours. Absent Origin (curl, server-to-server, bearer-token tools) is allowed.
  const rejectCrossOrigin = (req: any, res: any): boolean => {
    const origin = req.headers.origin as string | undefined;
    if (!origin) return false;
    try {
      const originHost = new URL(origin).host;
      const selfHost = String(req.headers.host || '');
      if (originHost && selfHost && originHost !== selfHost) {
        res.status(403).json({ message: 'Cross-origin request rejected' });
        return true;
      }
    } catch { /* malformed Origin — fall through and allow same-origin check to pass */ }
    return false;
  };

  app.get('/api/runs/:id/crime-takeaway', async (req, res) => {
    const run = await loadOwnedRun(req, res);
    if (!run) return;
    return res.json((run as any).crimeTakeaway ?? null);
  });

  app.post('/api/runs/:id/crime-takeaway', async (req, res) => {
    if (rejectCrossOrigin(req, res)) return;
    const run = await loadOwnedRun(req, res);
    if (!run) return;
    // The POST body is only a trigger — every figure is derived server-side from
    // the run's own address (geocode cache → live lookup) and the same crime
    // sources the report uses. Client-submitted numbers are never trusted.
    let lat: number | null = null, lng: number | null = null, communityArea: string | null = null;
    let zoningCode: string | null = null;
    const cachedGeo = await storage.getGeocode(run.address).catch(() => undefined);
    if (cachedGeo?.lat && cachedGeo?.lon) {
      lat = Number(cachedGeo.lat); lng = Number(cachedGeo.lon);
      communityArea = cachedGeo.communityArea ?? null;
      zoningCode = (cachedGeo as any).zoning ?? null;
    } else {
      const geo = await lookupLocation(run.address).catch(() => null);
      if (geo?.lat && geo?.lon) { lat = geo.lat; lng = geo.lon; communityArea = geo.communityArea ?? null; zoningCode = (geo as any).zoning ?? null; }
    }
    // Commercial-framing flag (guardrail: only unlocks the security-planning
    // clause; derived from the address's own zoning record, never the client).
    const zInfo = zoningCode ? getZoningInfo(zoningCode) : null;
    const subjectIsCommercial = !!zInfo && (zInfo as any).category != null && (zInfo as any).category !== 'residential';
    if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ message: 'Could not geocode this address for crime data' });
    }
    if (!communityArea) {
      return res.status(400).json({ message: 'No community area found for this address' });
    }
    const [nearby, quarterMile, rankingRaw] = await Promise.all([
      fetchCrimeStats(lat, lng, 0.0473),
      fetchCrimeStats(lat, lng, 0.25),
      fetchCrimeTractRanking(communityArea),
    ]);
    if ((nearby as any)?.apiError || (quarterMile as any)?.apiError) {
      return res.status(503).json({ message: 'Crime data unavailable' });
    }
    if (!rankingRaw?.violent || !rankingRaw?.property) {
      return res.status(503).json({ message: 'Community-area crime ranking unavailable' });
    }
    const crime = { nearby, quarterMile };
    const ranking = {
      violent: rankingRaw.violent,
      property: rankingRaw.property,
      trend: rankingRaw.trend ?? null,
    };
    // Hash the server-derived inputs — regenerate only when the data changed
    const { createHash } = await import('crypto');
    const dataHash = createHash('sha256').update(JSON.stringify({
      pv: 2, // prompt version — bump when the generation guardrails change
      sc: subjectIsCommercial, // commercial clause is content — regenerate if zoning status changes
      n: crime.nearby.totalCrimes, nt: crime.nearby.crimesByType,
      q: crime.quarterMile.totalCrimes, qt: crime.quarterMile.crimesByType,
      v: ranking.violent, p: ranking.property, t: ranking.trend ?? null,
    })).digest('hex').slice(0, 24);
    const cached = (run as any).crimeTakeaway;
    // A successful takeaway with the same data is final; a failed (null-headline)
    // record only holds until the cooldown lapses, then we try again.
    if (cached && cached.dataHash === dataHash && cached.headline) return res.json(cached);
    // Cooldown: paid model call at most once per 10 minutes per run, even if the
    // submitted data keeps changing (blocks sequential cost-exhaustion abuse).
    if (cached?.generatedAt && Date.now() - new Date(cached.generatedAt).getTime() < 10 * 60 * 1000) {
      return res.json(cached);
    }
    if (crimeTakeawayInFlight.has(run.id)) {
      return res.status(409).json({ message: 'Takeaway generation already running for this report.' });
    }
    crimeTakeawayInFlight.add(run.id);
    try {
      // Step 1 — pre-compute every figure, category, and favor in code.
      // The model phrases these facts; it never computes or supplies a number.
      const { generateTakeaway } = await import('./takeaway');
      const { VIOLENT_TYPES } = await import('./permits');
      const favorFromSaferThan = (pct: number) => pct >= 75 ? 'good' : pct >= 30 ? 'neutral' : 'bad';
      const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
      const isViolent = (t: string) => VIOLENT_TYPES.has(t.toUpperCase());
      const qmEntries = Object.entries(crime.quarterMile.crimesByType).sort(([, a], [, b]) => b - a);
      const blockEntries = Object.entries(crime.nearby.crimesByType).sort(([, a], [, b]) => b - a);
      const violentCount = qmEntries.filter(([t]) => isViolent(t)).reduce((s, [, c]) => s + c, 0);
      const trendYears = ranking.trend?.years?.length ? ranking.trend.years : null;
      const yoy = ranking.trend?.yoyPercent ?? null;
      const takeawayData = {
        address: run.address,
        communityArea: communityArea ?? undefined,
        subjectIsCommercial,
        local: {
          within250ftCount: crime.nearby.totalCrimes,
          withinQuarterMileCount: crime.quarterMile.totalCrimes,
          topTypeBlock: blockEntries[0] ? blockEntries[0][0].toLowerCase() : null,
          breakdownQuarterMile: qmEntries.slice(0, 12).map(([type, count]) => ({
            type: titleCase(type), count, category: isViolent(type) ? 'violent' : 'property',
          })),
          violentShare: {
            count: violentCount,
            total: crime.quarterMile.totalCrimes,
            pct: Math.round((violentCount / Math.max(1, crime.quarterMile.totalCrimes)) * 100),
          },
        },
        ranks: {
          violent: {
            ratePer1000: ranking.violent.ratePer1000, saferThanPct: ranking.violent.saferThanPercent,
            tier: ranking.violent.tier, favor: favorFromSaferThan(ranking.violent.saferThanPercent),
          },
          property: {
            ratePer1000: ranking.property.ratePer1000, saferThanPct: ranking.property.saferThanPercent,
            tier: ranking.property.tier, favor: favorFromSaferThan(ranking.property.saferThanPercent),
          },
        },
        trend: trendYears ? {
          years: trendYears.map((y: any) => ({ y: y.year, n: y.count })),
          yoyPct: yoy != null ? Math.abs(yoy) : null,
          sinceBasePct: ranking.trend?.threeYearPercent != null ? Math.abs(ranking.trend.threeYearPercent) : null,
          direction: yoy != null ? (yoy <= 0 ? 'down' : 'up') : null,
          favor: yoy != null ? (yoy <= 0 ? 'good' : 'bad') : 'neutral',
        } : null,
      };
      // Canonical metric → code-computed favor map: every bullet MUST cite one of
      // these metrics, and its favor must equal the code-computed value.
      const metricFavors: Record<string, string> = {
        'ranks.violent': takeawayData.ranks.violent.favor,
        'ranks.property': takeawayData.ranks.property.favor,
        // Mix/character bullet is contextual per the crime-sensitivity spec ("insight") — never a favorability verdict
        'local.violentShare': 'neutral',
        'local.within250ftCount': 'neutral',
        'local.withinQuarterMileCount': 'neutral',
        'local.breakdownQuarterMile': 'neutral',
        'local.topTypeBlock': 'neutral',
        ...(takeawayData.trend ? { 'trend': takeawayData.trend.favor } : {}),
      };
      // Steps 2–3 — model call + deterministic validation; reject → retry once → null.
      const result = await generateTakeaway('crime', takeawayData, metricFavors);
      const takeaway = result ? {
        headline: result.headline,
        // keep the client's tone vocabulary (good/neu/bad)
        bullets: result.bullets.map(b => ({ tone: b.favor === 'neutral' ? 'neu' : b.favor, text: b.text, metric: b.metric })),
        dataHash,
        generatedAt: new Date().toISOString(),
      } : {
        // Fail closed: persist the null result (with hash) so we don't re-bill on
        // every page view; the client renders nothing for a headline-less record.
        headline: null,
        bullets: [],
        dataHash,
        generatedAt: new Date().toISOString(),
      };
      await storage.saveCrimeTakeaway(run.id, takeaway);
      return res.json(takeaway);
    } catch (err) {
      console.error('[CRIME TAKEAWAY] Generation failed:', err);
      return res.status(502).json({ message: 'Takeaway generation failed' });
    } finally {
      crimeTakeawayInFlight.delete(run.id);
    }
  });

  // === TRANSIT TAKEAWAY (same hardened pattern as the crime takeaway) ===
  const transitTakeawayInFlight = new Set<number>();

  app.get('/api/runs/:id/transit-takeaway', async (req, res) => {
    const run = await loadOwnedRun(req, res);
    if (!run) return;
    return res.json((run as any).transitTakeaway ?? null);
  });

  app.post('/api/runs/:id/transit-takeaway', async (req, res) => {
    if (rejectCrossOrigin(req, res)) return;
    const run = await loadOwnedRun(req, res);
    if (!run) return;
    // Trigger-only: every figure is derived server-side from the run's address.
    let lat: number | null = null, lng: number | null = null;
    const cachedGeo = await storage.getGeocode(run.address).catch(() => undefined);
    if (cachedGeo?.lat && cachedGeo?.lon) {
      lat = Number(cachedGeo.lat); lng = Number(cachedGeo.lon);
    } else {
      const geo = await lookupLocation(run.address).catch(() => null);
      if (geo?.lat && geo?.lon) { lat = geo.lat; lng = geo.lon; }
    }
    if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ message: 'Could not geocode this address for transit data' });
    }
    if (!isTransitInitialized()) return res.status(503).json({ message: 'Transit data still loading' });
    const nearest = findNearestTransit(lat, lng, 5);
    const walkMin = (miles: number) => Math.round(miles * 20);

    // Access tier — computed verdict, drives headline favor and the section badge.
    // Strong = rapid transit (L or Metra) within ~10-min walk AND 2+ bus routes
    // within ~5-min walk; Moderate = one of those; Limited = neither.
    const nearestRail = nearest.ctaRail[0] ?? null;
    const nearestMetra = nearest.metra[0] ?? null;
    const rapidWithin10 = [nearestRail, nearestMetra].some(s => s && Number(s.distance) <= 0.5);
    const closeBusRoutes = nearest.ctaBus.filter(s => Number(s.distance) <= 0.25).length;
    const accessTier = rapidWithin10 && closeBusRoutes >= 2 ? 'Strong' : (rapidWithin10 || closeBusRoutes >= 2) ? 'Moderate' : 'Limited';
    const tierFavor = accessTier === 'Strong' ? 'good' : accessTier === 'Moderate' ? 'neutral' : 'bad';

    // Ridership ranks via the same internal endpoints the report page uses.
    const port = process.env.PORT || 5000;
    const internal = async (pathname: string, body?: unknown) => {
      try {
        const r = await fetch(`http://127.0.0.1:${port}${pathname}`, body === undefined ? undefined
          : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        return r.ok ? await r.json() : null;
      } catch { return null; }
    };
    const busRouteNums = nearest.ctaBus.map(s => {
      const m = String(s.routes?.[0] ?? '').match(/^(X?\d+[A-Z]?)/i);
      return m ? m[1].toUpperCase() : null;
    }).filter(Boolean);
    const [ctaRide, busRide] = await Promise.all([
      nearest.ctaRail.length ? internal('/api/cta-ridership', { stations: nearest.ctaRail.slice(0, 2) }) : null,
      busRouteNums.length ? internal('/api/cta-bus-ridership', { routes: busRouteNums }) : null,
    ]);
    const pctBusier = (rank: number, total: number) => (rank > 0 && total > 0) ? Math.round(((total - rank) / total) * 100) : null;
    const station = ctaRide?.stations?.[0] ?? null;
    const busByRoute: Record<string, any> = {};
    for (const rt of busRide?.routes ?? []) busByRoute[String(rt.route).toUpperCase()] = rt;

    // Note: run.address is deliberately excluded — numbers inside it would be
    // whitelisted by the string-number tracing and weaken anti-fabrication.
    const takeawayData: any = {
      accessTier: { tier: `${accessTier} access`, favor: tierFavor },
      rail: nearestRail ? {
        station: nearestRail.stopName.split(/[-/]/)[0].trim(),
        line: nearestRail.routes?.[0] ?? null,
        walkMin: walkMin(Number(nearestRail.distance)),
        miles: Number(nearestRail.distance),
        ...(station && station.weekdayRank > 0 ? {
          rank: station.weekdayRank, ofStations: station.totalStationsRanked,
          busierThanPct: pctBusier(station.weekdayRank, station.totalStationsRanked),
          avgWeekday: station.latest?.weekday ?? null,
          trendPct3yr: station.trendPct ?? null,
        } : {}),
        favor: Number(nearestRail.distance) <= 0.5 ? 'good' : 'neutral',
      } : null,
      metra: nearestMetra ? {
        station: nearestMetra.stopName,
        lines: nearestMetra.routes ?? [],
        walkMin: walkMin(Number(nearestMetra.distance)),
        miles: Number(nearestMetra.distance),
        favor: Number(nearestMetra.distance) <= 0.5 ? 'good' : 'neutral',
      } : null,
      bus: nearest.ctaBus.length ? {
        routesNearby: nearest.ctaBus.length,
        closest: nearest.ctaBus.slice(0, 2).map(s => {
          const m = String(s.routes?.[0] ?? '').match(/^(X?\d+[A-Z]?)/i);
          const num = m ? m[1].toUpperCase() : '';
          const rd = busByRoute[num];
          return {
            route: s.routes?.[0] ?? '',
            walkMin: walkMin(Number(s.distance)),
            direction: s.direction === 'NS' ? 'north-south' : s.direction === 'EW' ? 'east-west' : null,
            ...(rd && rd.weekdayRank > 0 ? {
              rank: rd.weekdayRank, ofRoutes: rd.totalRoutesRanked,
              busierThanPct: pctBusier(rd.weekdayRank, rd.totalRoutesRanked),
              trendPct3yr: rd.trendPct ?? null,
            } : {}),
          };
        }),
        coversBothDirections: (() => {
          const dirs = nearest.ctaBus.slice(0, 2).map(s => s.direction).filter(Boolean);
          return dirs.length === 2 && dirs[0] !== dirs[1];
        })(),
        favor: closeBusRoutes >= 2 ? 'good' : 'neutral',
      } : null,
    };

    const { createHash } = await import('crypto');
    // 'transit-v2': prompt-version salt — bump when the transit takeaway prompt changes so cached outputs regenerate
    const dataHash = createHash('sha256').update('transit-v2' + JSON.stringify(takeawayData)).digest('hex').slice(0, 24);
    const cached = (run as any).transitTakeaway;
    if (cached && cached.dataHash === dataHash && cached.headline) return res.json(cached);
    if (cached?.generatedAt && Date.now() - new Date(cached.generatedAt).getTime() < 10 * 60 * 1000) {
      return res.json(cached);
    }
    if (transitTakeawayInFlight.has(run.id)) {
      return res.status(409).json({ message: 'Takeaway generation already running for this report.' });
    }
    transitTakeawayInFlight.add(run.id);
    try {
      const { generateTakeaway } = await import('./takeaway');
      const metricFavors: Record<string, string> = {
        'accessTier': tierFavor,
        ...(takeawayData.rail ? { 'rail': takeawayData.rail.favor } : {}),
        ...(takeawayData.metra ? { 'metra': takeawayData.metra.favor } : {}),
        ...(takeawayData.bus ? { 'bus': takeawayData.bus.favor } : {}),
      };
      const result = await generateTakeaway('transit', takeawayData, metricFavors);
      const takeaway = result ? {
        headline: result.headline,
        bullets: result.bullets.map(b => ({ tone: b.favor === 'neutral' ? 'neu' : b.favor, text: b.text, metric: b.metric })),
        accessTier,
        dataHash,
        generatedAt: new Date().toISOString(),
      } : { headline: null, bullets: [], accessTier, dataHash, generatedAt: new Date().toISOString() };
      await storage.saveTransitTakeaway(run.id, takeaway);
      return res.json(takeaway);
    } catch (err) {
      console.error('[TRANSIT TAKEAWAY] Generation failed:', err);
      return res.status(502).json({ message: 'Takeaway generation failed' });
    } finally {
      transitTakeawayInFlight.delete(run.id);
    }
  });

  const schoolsTakeawayInFlight = new Set<number>();

  app.get('/api/runs/:id/schools-takeaway', async (req, res) => {
    const run = await loadOwnedRun(req, res);
    if (!run) return;
    return res.json((run as any).schoolsTakeaway ?? null);
  });

  app.post('/api/runs/:id/schools-takeaway', async (req, res) => {
    if (rejectCrossOrigin(req, res)) return;
    const run = await loadOwnedRun(req, res);
    if (!run) return;
    // Trigger-only: every figure is derived server-side from the run's address.
    let lat: number | null = null, lng: number | null = null;
    const cachedGeo = await storage.getGeocode(run.address).catch(() => undefined);
    if (cachedGeo?.lat && cachedGeo?.lon) {
      lat = Number(cachedGeo.lat); lng = Number(cachedGeo.lon);
    } else {
      const geo = await lookupLocation(run.address).catch(() => null);
      if (geo?.lat && geo?.lon) { lat = geo.lat; lng = geo.lon; }
    }
    if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ message: 'Could not geocode this address for schools data' });
    }
    const { getNearbySchools } = await import('./schoolsNearby');
    let schools: any;
    try {
      schools = await getNearbySchools(lat, lng, 1.5);
    } catch {
      return res.status(503).json({ message: 'Schools data unavailable' });
    }

    // Mirror the client's display rules exactly (schoolsDisplay.ts):
    const RATING_SCORE: Record<string, number> = { 'Level 1+': 5, 'Level 1': 4, 'Level 2+': 3, 'Level 2': 2, 'Level 3': 1 };
    const score = (r?: string) => (r ? RATING_SCORE[r] ?? 0 : 0);
    // K–8 dedupe: drop "middle" entries that are the same schools re-listed.
    const otherIds = new Set<string>([...(schools.elementary ?? []), ...(schools.high ?? [])].map((s: any) => s.schoolId));
    const middle = (schools.middle ?? []).filter((s: any) => !otherIds.has(s.schoolId));
    const closest = (list: any[]) => list.length ? list.reduce((a, b) => ((a.distanceMiles ?? Infinity) <= (b.distanceMiles ?? Infinity) ? a : b)) : null;
    // Verdict weighs the assigned (closest boundary) school heavily — it's the default.
    const verdict = (list: any[]): { label: string; favor: string; assigned: any } | null => {
      const rated = list.filter((s: any) => score(s.overallRating) > 0);
      if (rated.length === 0) return null;
      const strong = rated.filter((s: any) => score(s.overallRating) >= 4).length;
      const weak = rated.filter((s: any) => score(s.overallRating) <= 2).length;
      const assigned = closest(list.filter((s: any) => s.attendanceBoundary));
      const aScore = assigned ? score(assigned.overallRating) : 0;
      if (aScore >= 4 && strong >= 2) return { label: 'Strong', favor: 'good', assigned };
      if (aScore === 1 && strong < 2) return { label: 'Limited', favor: 'bad', assigned };
      if (aScore > 0) return { label: 'Mixed', favor: 'neutral', assigned };
      if (strong * 2 > rated.length) return { label: 'Strong', favor: 'good', assigned };
      if (weak * 2 > rated.length) return { label: 'Limited', favor: 'bad', assigned };
      return { label: 'Mixed', favor: 'neutral', assigned };
    };
    const levelBlock = (list: any[]) => {
      if (!list.length) return null;
      const v = verdict(list);
      const near = closest(list);
      return {
        verdict: v ? v.label : null,
        schoolsNearby: list.length,
        assigned: v?.assigned ? {
          name: v.assigned.name,
          cpsRating: v.assigned.overallRating ?? null,
          miles: v.assigned.distanceMiles != null ? Number(v.assigned.distanceMiles.toFixed(2)) : null,
        } : null,
        closest: near ? {
          name: near.name,
          miles: near.distanceMiles != null ? Number(near.distanceMiles.toFixed(2)) : null,
        } : null,
        favor: v ? v.favor : 'neutral',
      };
    };
    // Note: run.address is deliberately excluded — numbers inside it would be
    // whitelisted by the string-number tracing and weaken anti-fabrication.
    const takeawayData: any = {
      radiusMiles: schools.radiusMiles,
      elementary: levelBlock(schools.elementary ?? []),
      middle: middle.length ? levelBlock(middle) : null,
      high: levelBlock(schools.high ?? []),
    };
    if (!takeawayData.elementary && !takeawayData.middle && !takeawayData.high) {
      return res.status(404).json({ message: 'No schools found within the radius' });
    }

    const { createHash } = await import('crypto');
    const dataHash = createHash('sha256').update(JSON.stringify(takeawayData)).digest('hex').slice(0, 24);
    const cached = (run as any).schoolsTakeaway;
    if (cached && cached.dataHash === dataHash && cached.headline) return res.json(cached);
    if (cached?.generatedAt && Date.now() - new Date(cached.generatedAt).getTime() < 10 * 60 * 1000) {
      return res.json(cached);
    }
    if (schoolsTakeawayInFlight.has(run.id)) {
      return res.status(409).json({ message: 'Takeaway generation already running for this report.' });
    }
    schoolsTakeawayInFlight.add(run.id);
    try {
      const { generateTakeaway } = await import('./takeaway');
      const metricFavors: Record<string, string> = {
        ...(takeawayData.elementary ? { 'elementary': takeawayData.elementary.favor } : {}),
        ...(takeawayData.middle ? { 'middle': takeawayData.middle.favor } : {}),
        ...(takeawayData.high ? { 'high': takeawayData.high.favor } : {}),
      };
      const result = await generateTakeaway('schools', takeawayData, metricFavors);
      const takeaway = result ? {
        headline: result.headline,
        bullets: result.bullets.map(b => ({ tone: b.favor === 'neutral' ? 'neu' : b.favor, text: b.text, metric: b.metric })),
        dataHash,
        generatedAt: new Date().toISOString(),
      } : { headline: null, bullets: [], dataHash, generatedAt: new Date().toISOString() };
      await storage.saveSchoolsTakeaway(run.id, takeaway);
      return res.json(takeaway);
    } catch (err) {
      console.error('[SCHOOLS TAKEAWAY] Generation failed:', err);
      return res.status(502).json({ message: 'Takeaway generation failed' });
    } finally {
      schoolsTakeawayInFlight.delete(run.id);
    }
  });

  // === NEWS COVERAGE TAKEAWAY (site-specific; report-data-first verification) ===
  const newsTakeawayInFlight = new Set<number>();

  async function enrichNewsMetaWithCachedArticleLocation(metaItems: any[], subjectAddress: string): Promise<any[]> {
    const [{ resolveArticleAddressPoint }, { getDevelopmentCorridor }] = await Promise.all([
      import('./newsArticleLocation'),
      import('./developmentPipeline'),
    ]);
    const newsArticleGeocodeLookups = new Map<string, Promise<any>>();
    const readCachedGeocode = (addressKey: string) => {
      const key = addressKey.trim().toLowerCase();
      let lookup = newsArticleGeocodeLookups.get(key);
      if (!lookup) {
        if (newsArticleGeocodeLookups.size >= 60) return Promise.resolve(undefined);
        lookup = storage.getGeocodeAnyAge(key).catch(() => undefined);
        newsArticleGeocodeLookups.set(key, lookup);
      }
      return lookup;
    };
    return Promise.all(metaItems.map(async item => {
      const articleText = `${item.articleTitle ?? item.title ?? ''} ${item.articleSummary ?? item.summary ?? item.snippet ?? ''}`;
      const matchedAddress = String(item.matched ?? item.matched_address ?? '');
      const tier = item.tier === 'adjacent' ? 'adjacent' as const : 'parcel' as const;
      const identity = matchedAddress
        ? await resolveArticleAddressPoint({
          text: articleText,
          matchedAddress,
          tier,
          subjectAddress,
        }, readCachedGeocode)
        : null;
      const corridor = identity
        ? getDevelopmentCorridor(identity.address, identity.latitude, identity.longitude)
        : null;
      const { raw: _raw, matched: _matched, articleTitle: _articleTitle, articleSummary: _articleSummary, ...publicItem } = item;
      return {
        ...publicItem,
        corridor,
        matchedArticleAddress: identity?.address ?? null,
        locationVerification: identity
          ? 'article address identity matched cached geocode coordinates'
          : 'address-search association only; article-owned coordinates not verified',
      };
    }));
  }

  app.get('/api/runs/:id/news-takeaway', async (req, res) => {
    const run = await loadOwnedRun(req, res);
    if (!run) return;
    const cached = (run as any).newsTakeaway;
    if (!cached) return res.json(null);
    const meta = Array.isArray(cached.meta)
      ? await enrichNewsMetaWithCachedArticleLocation(cached.meta, run.address)
      : [];
    return res.json({ ...cached, meta });
  });

  app.post('/api/runs/:id/news-takeaway', async (req, res) => {
    if (rejectCrossOrigin(req, res)) return;
    const run = await loadOwnedRun(req, res);
    if (!run) return;
    // The POST body may name a co-parcel address (an extra article-search term
    // only — it can never change the subject or any verified value). Everything
    // else is derived server-side from the run's own data.
    let coParcelAddress: string | null = null;
    const rawCo = (req.body?.coParcelAddress ?? '').toString().trim();
    if (rawCo && rawCo.length <= 100 && /^[0-9][\w\s.,#'’\/-]+$/.test(rawCo) &&
        rawCo.split(',')[0].toLowerCase() !== run.address.split(',')[0].toLowerCase()) {
      coParcelAddress = rawCo;
    }
    const { findAddressArticles } = await import('./newsMonitor');
    const [subjectArticles, coArticles] = await Promise.all([
      findAddressArticles(run.address, 1095).catch(() => []),
      coParcelAddress ? findAddressArticles(coParcelAddress, 1095).catch(() => []) : Promise.resolve([]),
    ]);
    // Tier computed in code from which address matched; dedupe by URL (subject wins).
    const seenUrls = new Set<string>();
    const asOfDate = new Date();
    const monthsOld = (d: string) => {
      const t = new Date(d).getTime();
      return Number.isFinite(t) ? Math.floor((asOfDate.getTime() - t) / (30.44 * 24 * 3600 * 1000)) : null;
    };
    const toInput = (a: any, tier: 'parcel' | 'adjacent', matched: string, idx: number) => ({
      id: `a${idx}`,
      tier,
      matched_address: matched.split(',')[0],
      title: String(a.title || '').slice(0, 300),
      snippet: a.summary ? String(a.summary).slice(0, 1200) : null,
      source: String(a.source || ''),
      date: a.published ? String(a.published).slice(0, 10) : '',
      url: String(a.url || ''),
    });
    const merged: any[] = [];
    for (const a of subjectArticles) {
      if (!a.url || seenUrls.has(a.url)) continue;
      seenUrls.add(a.url);
      merged.push({ raw: a, tier: 'parcel' as const, matched: run.address });
    }
    for (const a of coArticles) {
      if (!a.url || seenUrls.has(a.url)) continue;
      seenUrls.add(a.url);
      merged.push({ raw: a, tier: 'adjacent' as const, matched: coParcelAddress! });
    }
    // parcel tier first, then adjacent; date desc within each; cap the model input
    merged.sort((x, y) => (x.tier === y.tier)
      ? new Date(y.raw.published || 0).getTime() - new Date(x.raw.published || 0).getTime()
      : (x.tier === 'parcel' ? -1 : 1));
    const inputArticles = merged.slice(0, 12).map((m, i) => toInput(m.raw, m.tier, m.matched, i + 1));
    if (inputArticles.length === 0) {
      // Fail-closed: zero matched coverage → the section renders nothing.
      return res.json({ section: null, articles: [], meta: [], generatedAt: new Date().toISOString() });
    }
    const enrichedMeta = await enrichNewsMetaWithCachedArticleLocation(
      inputArticles.map((article, index) => ({
        ...article,
        raw: merged[index]?.raw,
        matched: merged[index]?.matched,
        articleTitle: merged[index]?.raw?.title,
        articleSummary: merged[index]?.raw?.summary,
      })),
      run.address,
    );
    const meta = enrichedMeta.map(article => {
      const { snippet: _snippet, ...safeArticle } = article;
      const mo = article.date ? monthsOld(article.date) : null;
      return {
        ...safeArticle,
        snippet: undefined,
        age_flag: mo != null && mo > 12 ? (mo >= 24 ? `~${Math.round(mo / 12)} yr old` : `~${mo} mo old`) : null,
      };
    });
    // report_facts — bound in code from the report's OWN sections (report-data-first).
    // Priority source 1: business licenses at the address (effective status derived
    // from term dates, mirroring the Business License History section's own logic).
    const { getBusinessLicenseHistory } = await import('./businessLicenses.js');
    const licHistory = await getBusinessLicenseHistory(run.address).catch(() => ({ records: [] as any[] }));
    const todayIso = new Date().toISOString().slice(0, 10);
    const byBusiness = new Map<string, { type: string; latestKey: string; status: string; expiry: string }>();
    for (const rec of (licHistory.records || [])) {
      const key = (rec.businessName || '').trim().toUpperCase();
      const recKey = rec.expirationDate || rec.issuedDate || '';
      const g = byBusiness.get(key);
      if (!g || recKey > g.latestKey) {
        byBusiness.set(key, { type: rec.licenseType || rec.businessName || 'License', latestKey: recKey, status: rec.status || '', expiry: rec.expirationDate || '' });
      }
    }
    const activeLicenses = Array.from(byBusiness.values())
      .filter(g => !['AAC', 'REV', 'INV'].includes(g.status) && (!g.expiry || g.expiry >= todayIso))
      .map(g => ({ type: g.type, status: 'active' }));
    // Priority source 2: the report's own listing snapshot (never a fresh lookup).
    const snap: any = (run as any).listingSnapshot;
    let listingStatus: 'none_active' | 'for_lease' | 'for_sale' | 'unknown' = 'unknown';
    if (snap?.status === 'active') {
      const label = String(snap.statusLabel || '').toLowerCase();
      listingStatus = label.includes('lease') || label.includes('rent') ? 'for_lease' : 'for_sale';
    } else if (snap?.status === 'not_found' || snap?.status === 'off_market') {
      listingStatus = 'none_active';
    }
    const reportFacts = {
      active_licenses_at_address: activeLicenses,
      listing_status: listingStatus,
      permits_since: [], // permits cross-check not wired yet — the prompt's default (no_update) covers silence
      licenses_section_anchor: '#subsection-biz-license-history',
      listing_section_anchor: '#print-section-listing-snapshot',
    };
    const asOf = todayIso;
    const { createHash } = await import('crypto');
    const dataHash = createHash('sha256').update(JSON.stringify({
      pv: 1, // prompt version
      arts: inputArticles.map(a => [a.url, a.date, a.tier]),
      lic: activeLicenses,
      ls: listingStatus,
    })).digest('hex').slice(0, 24);
    const cached = (run as any).newsTakeaway;
    if (cached && cached.dataHash === dataHash && cached.section) return res.json({ ...cached, meta });
    if (cached?.generatedAt && Date.now() - new Date(cached.generatedAt).getTime() < 10 * 60 * 1000) {
      return res.json({ ...cached, meta });
    }
    if (newsTakeawayInFlight.has(run.id)) {
      return res.status(409).json({ message: 'Takeaway generation already running for this report.' });
    }
    newsTakeawayInFlight.add(run.id);
    try {
      const { generateNewsTakeaway } = await import('./takeaway');
      const result = await generateNewsTakeaway({
        subject_address: run.address.split(',')[0],
        cross_reference_allowed: true,
        articles: inputArticles,
        report_facts: reportFacts,
        as_of: asOf,
      });
      const takeaway = result ? {
        section: result.section,
        articles: result.articles,
        meta,
        subjectAddress: run.address.split(',')[0],
        coParcelAddress: coParcelAddress ? coParcelAddress.split(',')[0] : null,
        sources_line: "Block Club Chicago, Crain's Chicago Business, The Real Deal, Chicago YIMBY, Chicago Tribune, Chicago Sun-Times",
        dataHash,
        generatedAt: new Date().toISOString(),
      } : {
        // Fail closed: persist the null result (with hash) so we don't re-bill on
        // every page view; the client renders the plain article list instead.
        section: null,
        articles: [],
        meta,
        dataHash,
        generatedAt: new Date().toISOString(),
      };
      await storage.saveNewsTakeaway(run.id, takeaway);
      return res.json(takeaway);
    } catch (err) {
      console.error('[NEWS TAKEAWAY] Generation failed:', err);
      return res.status(502).json({ message: 'Takeaway generation failed' });
    } finally {
      newsTakeawayInFlight.delete(run.id);
    }
  });

  // === NEIGHBORHOOD NEWS TAKEAWAY (two-stage extract→dedup→phrase pipeline) ===
  const nnTakeawayInFlight = new Set<number>();

  app.get('/api/runs/:id/neighborhood-news-takeaway', async (req, res) => {
    const run = await loadOwnedRun(req, res);
    if (!run) return;
    const cached = (run as any).neighborhoodNewsTakeaway;
    return res.json(hasCurrentNeighborhoodWindow(cached) ? cached : null);
  });

  app.post('/api/runs/:id/neighborhood-news-takeaway', async (req, res) => {
    if (rejectCrossOrigin(req, res)) return;
    const run = await loadOwnedRun(req, res);
    if (!run) return;
    // Everything is derived server-side from the run's own address: the
    // neighborhood + coordinates come from the geocode record, the articles
    // from the same feeds the section already uses, and the permit records
    // from the report's own nearby-construction source (report-data-first).
    let lat: number | null = null, lng: number | null = null, neighborhood: string | null = null;
    const cachedGeo = await storage.getGeocode(run.address).catch(() => undefined);
    if (cachedGeo?.lat && cachedGeo?.lon) {
      lat = Number(cachedGeo.lat); lng = Number(cachedGeo.lon);
      neighborhood = (cachedGeo as any).neighborhood || cachedGeo.communityArea || null;
    } else {
      const geo = await lookupLocation(run.address).catch(() => null);
      if (geo?.lat && geo?.lon) { lat = geo.lat; lng = geo.lon; neighborhood = (geo as any).neighborhood || geo.communityArea || null; }
    }
    if (!neighborhood) return res.status(400).json({ message: 'No neighborhood found for this address' });
    const { findRelevantArticles, calculateMomentumScore } = await import('./newsMonitor');
    const rawArticles = await findRelevantArticles(neighborhood, NEIGHBORHOOD_NEWS_DAYS).catch(() => []);
    if (rawArticles.length === 0) {
      return res.json({ takeaway: null, culture: [], dev: [], meta: [], generatedAt: new Date().toISOString() });
    }
    const articles = rawArticles.slice(0, 20).map((a: any, i: number) => ({
      id: `n${i + 1}`,
      title: String(a.title || '').slice(0, 300),
      summary: a.summary ? String(a.summary).slice(0, 1000) : null,
      source: String(a.source || '').split(' - ')[0].replace(' Archives', ''),
      date: a.published ? new Date(a.published).toISOString().slice(0, 10) : '',
      url: String(a.url || ''),
    }));
    const momentumScore = calculateMomentumScore(rawArticles);
    const momentumLabel = momentumScore >= 75 ? 'High' : momentumScore >= 50 ? 'Moderate' : 'Low';
    // Report's own permit records (the join target for the dedup)
    let permitRecords: Array<{ address: string; date: string | null }> = [];
    if (lat != null && lng != null) {
      const nearby = await getNearbyNewConstruction(lat, lng, undefined, 1.0).catch(() => null);
      permitRecords = (nearby?.permits || []).map(p => ({ address: p.address, date: p.issueDate || null }));
    }
    const { createHash } = await import('crypto');
    const dataHash = createHash('sha256').update(JSON.stringify({
      pv: 2,
      arts: articles.map(a => [a.url, a.date]),
      perms: permitRecords.map(p => p.address),
      ms: momentumScore,
    })).digest('hex').slice(0, 24);
    const cached = (run as any).neighborhoodNewsTakeaway;
    if (hasCurrentNeighborhoodWindow(cached) && cached.dataHash === dataHash && cached.takeaway) return res.json(cached);
    if (hasCurrentNeighborhoodWindow(cached) && cached?.generatedAt && Date.now() - new Date(cached.generatedAt).getTime() < 10 * 60 * 1000) {
      return res.json(cached);
    }
    if (nnTakeawayInFlight.has(run.id)) {
      return res.status(409).json({ message: 'Takeaway generation already running for this report.' });
    }
    nnTakeawayInFlight.add(run.id);
    try {
      const { extractDevFacts, dedupDevProjects, generateNnTakeaway } = await import('./takeaway');
      // Stage 1 — grounded per-article extraction (batched, one call)
      const extractions = await extractDevFacts(articles).catch((err: any) => {
        console.warn('[NN TAKEAWAY] extraction failed:', err.message);
        return [];
      });
      const exById = new Map(extractions.map(e => [e.id, e]));
      // Stage 1.5 — code-side dedup vs permit records and vs other articles
      const projects = dedupDevProjects(extractions, articles, permitRecords);
      const devArticleIds = new Set(extractions.filter(e => e.is_development).map(e => e.id));
      const culture = articles.filter(a => !devArticleIds.has(a.id)).map(({ summary, ...rest }) => rest);
      // dev cards: one per deduped project entity, rendered once
      const artById = new Map(articles.map(a => [a.id, a]));
      const stageLabel: Record<string, string> = { proposed: 'Proposed', approved: 'Approved', permitted: 'Permitted', under_construction: 'Under construction', complete: 'Complete' };
      const dev = projects.map(p => {
        const lead = artById.get(p.articleIds[0])!;
        return {
          title: lead.title, source: lead.source, date: lead.date, url: lead.url,
          articleCount: p.articleIds.length,
          stage: p.stage, stageLabel: stageLabel[p.stage] || p.stage,
          address: p.address, unitCount: p.unitCount, oneLine: p.oneLine,
          inPermitData: p.inPermitData, matchable: p.matchable,
        };
      }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      // Stage 2 — takeaway phrased from code-computed facts only
      const matchedProjects = projects.filter(p => p.matchable);
      const facts = {
        neighborhood,
        window_days: NEIGHBORHOOD_NEWS_DAYS,
        article_count: rawArticles.length,
        culture_count: culture.length,
        dev_article_count: devArticleIds.size,
        momentum_score: momentumScore,
        momentum_level: momentumLabel,
        devProjects: matchedProjects.map(p => ({
          address: p.address, unitCount: p.unitCount, buildingCount: p.buildingCount,
          use: p.use, stage: p.stage, inPermitData: p.inPermitData,
        })),
        unmatched_dev_count: projects.length - matchedProjects.length,
        culture_examples: culture.slice(0, 6).map(c => c.title),
      };
      const takeaway = projects.length + culture.length > 0 ? await generateNnTakeaway(facts) : null;
      const record = {
        takeaway, // null = fail closed; client falls back to the plain layout
        kpis: { momentumScore, articleCount: rawArticles.length, momentumLabel },
        culture,
        dev,
        neighborhood,
        window_days: NEIGHBORHOOD_NEWS_DAYS,
        sources_line: "Block Club Chicago, Eater Chicago, The Infatuation, WhatNow Chicago, Timeout Chicago, Chicago Reader, Chicago YIMBY, Crain's Chicago Business, The Real Deal, Dwell, Dezeen",
        dataHash,
        generatedAt: new Date().toISOString(),
      };
      await storage.saveNeighborhoodNewsTakeaway(run.id, record);
      return res.json(record);
    } catch (err) {
      console.error('[NN TAKEAWAY] Generation failed:', err);
      return res.status(502).json({ message: 'Takeaway generation failed' });
    } finally {
      nnTakeawayInFlight.delete(run.id);
    }
  });

  // === NEIGHBORHOOD PEOPLE PROFILE TAKEAWAY (fair-housing hardened) ===
  const peopleTakeawayInFlight = new Set<number>();

  app.get('/api/runs/:id/people-takeaway', async (req, res) => {
    const run = await loadOwnedRun(req, res);
    if (!run) return;
    return res.json((run as any).peopleTakeaway ?? null);
  });

  app.post('/api/runs/:id/people-takeaway', async (req, res) => {
    if (rejectCrossOrigin(req, res)) return;
    const run = await loadOwnedRun(req, res);
    if (!run) return;
    // Everything is derived server-side from the run's own address (report-data-
    // first): geography from the geocode record, ACS/HMDA/LODES/language/election
    // figures from the exact same sources the section itself renders. HMDA
    // race/ethnicity/sex splits are NEVER included in the model input.
    const geo = (await storage.getGeocodeAnyAge(run.address).catch(() => undefined))
      || (await storage.getGeocodeAnyAge(run.address.toLowerCase()).catch(() => undefined));
    const tractGeoid = geo?.tractGeoid || undefined;
    const communityArea = geo?.communityArea || undefined;
    const zipCode = (run.address.match(/\b(60\d{3})\b/) || [])[1];
    if (!tractGeoid && !zipCode && !communityArea) {
      return res.status(400).json({ message: 'No geography found for this address' });
    }

    // --- ACS (same fetch + cache as /api/census-acs) ---
    let acsResult: { tract: any; zip: any } | null = null;
    const acsCacheKey = `${tractGeoid || ''}_${zipCode || ''}`;
    const acsCached = censusAcsCache.get(acsCacheKey);
    if (acsCached && Date.now() - acsCached.ts < CENSUS_ACS_TTL) {
      acsResult = acsCached.data;
    } else if (tractGeoid || zipCode) {
      const keyParam = process.env.CENSUS_API_KEY ? `&key=${process.env.CENSUS_API_KEY}` : '';
      const varStr = ACS_VARS.join(',');
      const fetchAcs = async (url: string): Promise<string[][] | null> => {
        try {
          const resp = await fetch(url + keyParam, { signal: AbortSignal.timeout(10000) });
          if (!resp.ok) return null;
          const text = await resp.text();
          return text.trim().startsWith('[') ? JSON.parse(text) : null;
        } catch { return null; }
      };
      const result: { tract: any; zip: any } = { tract: null, zip: null };
      if (zipCode) {
        const [cur, pri] = await Promise.all([
          fetchAcs(`https://api.census.gov/data/2023/acs/acs5?get=${varStr}&for=zip%20code%20tabulation%20area:${zipCode}`),
          fetchAcs(`https://api.census.gov/data/2018/acs/acs5?get=${varStr}&for=zip%20code%20tabulation%20area:${zipCode}&in=state:17`),
        ]);
        if (cur && cur.length >= 2) {
          result.zip = {
            geoid: zipCode,
            metrics: buildAcsMetrics(parseAcsRow(cur[0], cur[1])),
            priorMetrics: pri && pri.length >= 2 ? buildAcsMetrics(parseAcsRow(pri[0], pri[1])) : null,
            dataYear: 2023,
          };
        }
      }
      if (!result.zip && tractGeoid && tractGeoid.length === 11) {
        const st = tractGeoid.substring(0, 2), co = tractGeoid.substring(2, 5), tr = tractGeoid.substring(5);
        const [cur, pri] = await Promise.all([
          fetchAcs(`https://api.census.gov/data/2023/acs/acs5?get=${varStr}&for=tract:${tr}&in=state:${st}%20county:${co}`),
          fetchAcs(`https://api.census.gov/data/2018/acs/acs5?get=${varStr}&for=tract:${tr}&in=state:${st}%20county:${co}`),
        ]);
        if (cur && cur.length >= 2) {
          result.tract = {
            geoid: tractGeoid,
            metrics: buildAcsMetrics(parseAcsRow(cur[0], cur[1])),
            priorMetrics: pri && pri.length >= 2 ? buildAcsMetrics(parseAcsRow(pri[0], pri[1])) : null,
            dataYear: 2023,
          };
        }
      }
      acsResult = result;
    }
    const acsGeo = acsResult?.zip || acsResult?.tract || null;
    const r1 = (x: number) => Math.round(x * 10) / 10;
    const mv = (arr: any[] | null | undefined, label: string): number | null => {
      const m = (arr || []).find((x: any) => x.label === label);
      return m && typeof m.rawValue === 'number' ? m.rawValue : null;
    };
    const cm = acsGeo?.metrics, pm = acsGeo?.priorMetrics;
    const pair = (label: string, pct = false) => {
      const cur = mv(cm, label), pri = mv(pm, label);
      const o: any = {};
      if (cur != null) o.current_2023 = r1(cur);
      if (pri != null) o.prior_2018 = r1(pri);
      if (cur != null && pri != null) {
        o.change = pct ? `${r1(cur - pri)} pts` : undefined;
        if (!pct && pri !== 0) o.change_pct = r1(((cur - pri) / pri) * 100);
        if (pct) o.change_pts = r1(cur - pri);
      }
      return (o.current_2023 != null || o.prior_2018 != null) ? o : null;
    };
    const acs = cm ? {
      geography: acsResult?.zip ? `ZIP ${acsGeo.geoid}` : `census tract`,
      source: 'ACS 5-yr estimates, 2023 vs 2018',
      population: pair('Population'),
      median_age: pair('Median Age'),
      median_household_income: pair('Median Household Income'),
      per_capita_income: pair('Per Capita Income'),
      below_poverty_pct: pair('% Below Poverty', true),
      owner_occupied_pct: pair('% Owner-Occupied', true),
      renter_occupied_pct: pair('% Renter-Occupied', true),
      housing_vacancy_pct: pair('% Housing Vacancy', true),
      median_home_value: pair('Median Home Value'),
      median_gross_rent: pair('Median Gross Rent'),
      transit_commute_pct: pair('% Commute via Transit', true),
    } : null;

    // --- HMDA (volume/outcome/age-band/DTI only — never race/ethnicity/sex) ---
    let hmda: any = null;
    for (const year of [2025, 2024]) {
      const h = getHmdaForLocation(year, tractGeoid, communityArea);
      const c: any = h.community || h.tract;
      if (!c?.total) continue;
      const act = (key: string) => (c.byAction || []).find((a: any) => a.key === key)?.pct ?? null;
      const topBand = (arr: any[]) => {
        const t = (arr || []).filter((b: any) => !/not available|n\/a|8888|9999/i.test(String(b.key)))[0];
        return t ? { band: t.label, pct: t.pct } : null;
      };
      hmda = {
        year,
        source: `HMDA ${year}`,
        applications_total: c.total,
        originated_pct: act('1'),
        denied_pct: act('3'),
        top_buyer_age_band: topBand(c.byAge),
        top_dti_band: topBand(c.byDti),
        median_borrower_income_thousands: typeof c.medianIncome === 'number' ? c.medianIncome : null,
      };
      break;
    }

    // --- LODES daytime economy ---
    let daytime: any = null;
    if (tractGeoid) {
      const t = loadLodesData()?.[tractGeoid];
      if (t) {
        daytime = {
          source: 'LEHD LODES (tract)',
          jobs_in_tract: t.workersInTract,
          employed_residents: t.residentsWhoWork,
          net_daytime_pull: t.workersInTract - t.residentsWhoWork,
          retail_jobs: t.retailJobs,
          food_service_jobs: t.foodServiceJobs,
          healthcare_jobs: t.healthcareJobs,
        };
      }
    }

    // --- Language mix (Tier B — business-operations framing only) ---
    let language: any = null;
    if (communityArea) {
      const l = (loadLanguageData() || []).find((x: any) => String(x.communityArea || '').toUpperCase() === communityArea.toUpperCase());
      if (l) {
        language = {
          source: 'ACS 5-yr (community area)',
          non_english_pct: l.nonEnglishPct,
          top_non_english: (l.topLanguages || []).filter((t: any) => t.language !== 'English only').slice(0, 3).map((t: any) => ({ language: t.language, pct: t.pct })),
          limited_english_proficiency_pct: l.limitedEnglishProficiency?.pct ?? null,
        };
      }
    }

    // --- Ballot measures (Tier B — cost/policy signal only) + Tier C context ---
    let ballot_measures: any[] = [];
    let context_only: any = {};
    if (communityArea) {
      const e = loadElectionData()?.community_areas?.[communityArea.toUpperCase()];
      if (e) {
        ballot_measures = (e.referendums || [])
          .filter((q: any) => /home|tax|wage|property|rent|zoning/i.test(String(q.question)))
          .slice(0, 3)
          .map((q: any) => ({ question: q.question, year: q.year, local_yes_pct: q.yes_pct, local_no_pct: q.no_pct, passed_citywide: q.passed }));
        const years = Object.keys(e.presidential || {}).sort();
        const latest = years.length ? e.presidential[years[years.length - 1]] : null;
        if (latest) {
          context_only.partisan_lean = { election_year: Number(years[years.length - 1]), margin: latest.margin, democratic_pct: latest.democratic_pct, republican_pct: latest.republican_pct };
        }
      }
    }
    const bipocPair = pair('% BIPOC', true);
    if (bipocPair) context_only.bipoc_share_pct = bipocPair;
    if (Object.keys(context_only).length === 0) context_only = null;

    if (!acs && !hmda) {
      return res.status(400).json({ message: 'Insufficient demographic data for this address' });
    }

    const facts = {
      geo: [communityArea, zipCode ? `ZIP ${zipCode}` : null].filter(Boolean).join(' · '),
      acs, hmda, daytime, language, ballot_measures, context_only,
    };
    const { createHash } = await import('crypto');
    const dataHash = createHash('sha256').update(JSON.stringify({ pv: 1, facts })).digest('hex').slice(0, 24);
    const cached = (run as any).peopleTakeaway;
    if (cached && cached.dataHash === dataHash && cached.takeaway) return res.json(cached);
    if (cached?.generatedAt && Date.now() - new Date(cached.generatedAt).getTime() < 10 * 60 * 1000) {
      return res.json(cached);
    }
    if (peopleTakeawayInFlight.has(run.id)) {
      return res.status(409).json({ message: 'Takeaway generation already running for this report.' });
    }
    peopleTakeawayInFlight.add(run.id);
    try {
      const { generatePeopleTakeaway } = await import('./takeaway');
      const takeaway = await generatePeopleTakeaway(facts); // null = fail closed
      const record = { takeaway, dataHash, generatedAt: new Date().toISOString() };
      await storage.savePeopleTakeaway(run.id, record);
      return res.json(record);
    } catch (err) {
      console.error('[PEOPLE TAKEAWAY] Generation failed:', err);
      // Persist the failed attempt so the 10-min cooldown holds — otherwise
      // repeated requests keep triggering paid model calls.
      await storage.savePeopleTakeaway(run.id, { takeaway: null, dataHash, generatedAt: new Date().toISOString() }).catch(() => {});
      return res.status(502).json({ message: 'Takeaway generation failed' });
    } finally {
      peopleTakeawayInFlight.delete(run.id);
    }
  });

  // === HMDA TAKEAWAY (same hardened pattern as the crime takeaway) ===
  const hmdaTakeawayInFlight = new Set<number>();

  app.get('/api/runs/:id/hmda-takeaway', async (req, res) => {
    const run = await loadOwnedRun(req, res);
    if (!run) return;
    return res.json((run as any).hmdaTakeaway ?? null);
  });

  app.post('/api/runs/:id/hmda-takeaway', async (req, res) => {
    if (rejectCrossOrigin(req, res)) return;
    const run = await loadOwnedRun(req, res);
    if (!run) return;
    // Trigger-only: every figure is derived server-side from the run's address
    // and the same HMDA index files the section itself uses.
    let tract: string | null = null, communityArea: string | null = null, zoningCode: string | null = null;
    // Any-age cache is fine here (zoning/tract don't go stale); rows are stored
    // with a lowercased address, so try both forms.
    const cachedGeo = (await storage.getGeocodeAnyAge(run.address.toLowerCase()).catch(() => undefined))
      ?? (await storage.getGeocodeAnyAge(run.address).catch(() => undefined));
    if (cachedGeo) {
      tract = cachedGeo.tractGeoid ?? null;
      communityArea = cachedGeo.communityArea ?? null;
      zoningCode = cachedGeo.zoning ?? null;
    }
    if (!tract && !communityArea) {
      const geo: any = await lookupLocation(run.address).catch(() => null);
      tract = geo?.tractGeoid ?? null;
      communityArea = geo?.communityArea ?? null;
      zoningCode = geo?.zoning ?? null;
    }
    if (!tract && !communityArea) {
      return res.status(400).json({ message: 'No census tract or community area found for this address' });
    }

    // Prefer the tract scope (matches the section); fall back to community, then 2024.
    let year = 2025;
    let d = getHmdaForLocation(2025, tract ?? undefined, communityArea ?? undefined);
    let stats: any = d.tract || d.community;
    let scopeIsTract = !!d.tract;
    if (!stats) {
      year = 2024;
      d = getHmdaForLocation(2024, tract ?? undefined, communityArea ?? undefined);
      stats = d.tract || d.community;
      scopeIsTract = !!d.tract;
    }
    if (!stats) return res.status(404).json({ message: 'No HMDA data available for this location' });
    const scope = scopeIsTract && tract ? `Census Tract ${tract.slice(-6)}` : (communityArea || 'this area');

    const act = (k: string) => (stats.byAction || []).find((a: any) => a.key === k);
    const originatedAct = act('1'), deniedAct = act('3');

    // Closed first-lien avg rate — mirror the section's year-specific → combined fallback.
    loadHmdaRates();
    const tractRates = scopeIsTract && tract ? (hmdaRatesByTract?.[tract] || null) : null;
    const commRates = communityArea ? (hmdaRatesByCommunity?.[communityArea.toUpperCase()] || null) : null;
    const rateSource = tractRates || commRates;
    const yearKey = `y${year}`;
    const rYear = tractRates?.[yearKey] || commRates?.[yearKey] || null;
    const r = (rYear?.avgFirstLienRate ? rYear : rateSource) as { avgFirstLienRate?: number; firstLienRateCount?: number } | null;
    const areaAvgRate = r?.avgFirstLienRate != null ? Math.round(r.avgFirstLienRate * 100) / 100 : null;

    // Broader-scope cross-check when the tract sample is thin.
    const commStats = scopeIsTract ? (d.community || null) : null;
    const commOrigRate = commStats ? ((commStats.byAction || []).find((a: any) => a.key === '1')?.pct ?? null) : null;

    const topDenial = (stats.byDenialReason || [])
      .filter((i: any) => i.key !== '1111')
      .sort((a: any, b: any) => b.count - a.count)[0] || null;

    const pctOf = (list: any[], key: string) => (list || []).find((i: any) => i.key === key)?.pct ?? null;
    const singleFamilyPct = (stats.byDwellingCategory || [])
      .filter((i: any) => String(i.label).startsWith('Single Family'))
      .reduce((s: number, i: any) => s + (i.pct ?? 0), 0) || null;
    const topValueBand = [...(stats.byPropertyValueBin || [])].sort((a: any, b: any) => b.pct - a.pct)[0] || null;

    const lenderList = (stats.byLender || []).filter((l: any) => l.name);
    const lenderRates = lenderList.map((l: any) => l.avgFirstLienRate).filter((x: any) => typeof x === 'number' && isFinite(x));
    const lenderRateRange = lenderRates.length >= 2
      ? `${(Math.round(Math.min(...lenderRates) * 10) / 10).toFixed(1)}–${(Math.round(Math.max(...lenderRates) * 10) / 10).toFixed(1)}%`
      : null;

    // Today's benchmark — same cached Freddie Mac PMMS source as /api/mortgage-rate.
    // Fail closed: fetch failure or a >14-day-old print → no today's-rate clause at all.
    // Direction/gap phrases are PRE-COMPUTED here; the model only inserts them (Hard Rule 2).
    let rateToday: any = null;
    if (areaAvgRate != null) {
      try {
        const mr = await getMortgageRateCached();
        const asOf = new Date(mr.date + 'T00:00:00');
        if (!isNaN(asOf.getTime()) && Date.now() - asOf.getTime() <= 14 * 24 * 60 * 60 * 1000) {
          const diff = mr.rate - areaAvgRate;
          const inLine = Math.abs(diff) < 0.05;
          rateToday = {
            market_rate_today: mr.rate,
            market_rate_asof: asOf.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
            market_rate_source: 'Freddie Mac PMMS 30-yr',
            rate_direction: inLine ? 'roughly in line with' : diff > 0 ? 'a touch below' : 'a touch above',
            rate_more_or_less: inLine ? 'about the same' : diff > 0 ? 'a bit more' : 'a bit less',
            rate_gap_material: diff >= 1.00,
            favor: 'neutral',
          };
        }
      } catch { /* no benchmark → clause dropped */ }
    }

    // Residential-vs-commercial caveat — only when we positively know the parcel
    // is non-residentially zoned (fail closed: unknown zoning → no caution bullet).
    const zi = zoningCode ? getZoningInfo(zoningCode) : null;
    const caveat = zi && zi.category !== 'residential'
      ? { subject_zoning_category: zi.category, note: 'HMDA covers 1-4 unit / multifamily home loans; subject parcel is not residentially zoned', favor: 'bad' }
      : null; // fail closed: unknown zoning → no caution bullet

    // NOTE (fair-lending firewall): protected-class breakdowns in the HMDA index
    // (byRace/byEthnicity/bySex/byAge) are deliberately NEVER placed in this object.
    const takeawayData: any = {
      scope,
      year,
      approvals: {
        apps: stats.total ?? null,
        originated: originatedAct?.count ?? null,
        orig_rate: originatedAct?.pct ?? null,
        denied: deniedAct?.count ?? null,
        denial_rate: deniedAct?.pct ?? null,
        area_avg_rate: areaAvgRate,
        closed_loan_n: r?.firstLienRateCount ?? null,
        top_denial_reason: topDenial ? String(topDenial.label).toLowerCase() : null,
        ...(commOrigRate != null && communityArea ? { community_name: communityArea, community_orig_rate: commOrigRate } : {}),
        favor: 'neutral',
      },
      profile: {
        pct_conventional: pctOf(stats.byLoanType, '1'),
        pct_principal_residence: pctOf(stats.byOccupancy, '1'),
        pct_investment: pctOf(stats.byOccupancy, '3'),
        pct_single_family: singleFamilyPct,
        value_band_top: topValueBand ? { band: topValueBand.label, pct: topValueBand.pct } : null,
        favor: 'neutral',
      },
      lenders: {
        lender_leaders: lenderList.slice(0, 2).map((l: any) => l.name),
        top_lender_share_pct: lenderList[0]?.pct ?? null,
        ...(lenderRateRange ? { lender_rate_range: lenderRateRange } : {}),
        favor: 'neutral',
      },
      ...(rateToday ? { rate_today: rateToday } : {}),
      ...(caveat ? { caveat } : {}),
    };

    const { createHash } = await import('crypto');
    const dataHash = createHash('sha256').update(JSON.stringify(takeawayData)).digest('hex').slice(0, 24);
    const cached = (run as any).hmdaTakeaway;
    if (cached && cached.dataHash === dataHash && cached.headline) return res.json(cached);
    if (cached?.generatedAt && Date.now() - new Date(cached.generatedAt).getTime() < 10 * 60 * 1000) {
      return res.json(cached);
    }
    if (hmdaTakeawayInFlight.has(run.id)) {
      return res.status(409).json({ message: 'Takeaway generation already running for this report.' });
    }
    hmdaTakeawayInFlight.add(run.id);
    try {
      const { generateTakeaway } = await import('./takeaway');
      const metricFavors: Record<string, string> = {
        'approvals': 'neutral',
        'profile': 'neutral',
        'lenders': 'neutral',
        ...(rateToday ? { 'rate_today': 'neutral' } : {}),
        ...(caveat ? { 'caveat': 'bad' } : {}),
      };
      const result = await generateTakeaway('hmda', takeawayData, metricFavors);
      // The residential-vs-commercial caveat is REQUIRED when the parcel is
      // non-residentially zoned; the model sometimes drops optional bullets, so
      // enforce it deterministically with code-written text (no numbers).
      if (result && caveat && !result.bullets.some(b => b.metric === 'caveat')) {
        result.bullets = result.bullets.slice(0, 3);
        result.bullets.push({
          text: `HMDA covers **home loans** (1–4 unit and multifamily); this parcel is not residentially zoned (${caveat.subject_zoning_category}). Read the rates and approval odds above as neighborhood context — not the terms you would get financing this property commercially.`,
          favor: 'bad',
          metric: 'caveat',
        });
      }
      const takeaway = result ? {
        headline: result.headline,
        bullets: result.bullets.map(b => ({ tone: b.favor === 'neutral' ? 'neu' : b.favor, text: b.text, metric: b.metric })),
        dataHash,
        generatedAt: new Date().toISOString(),
      } : { headline: null, bullets: [], dataHash, generatedAt: new Date().toISOString() };
      await storage.saveHmdaTakeaway(run.id, takeaway);
      return res.json(takeaway);
    } catch (err) {
      console.error('[HMDA TAKEAWAY] Generation failed:', err);
      return res.status(502).json({ message: 'Takeaway generation failed' });
    } finally {
      hmdaTakeawayInFlight.delete(run.id);
    }
  });

  // GET /api/runs/:id/chat — Load saved chat history for a run
  app.get('/api/runs/:id/chat', async (req, res) => {
    try {
      let authUser = req.user || null;
      if (!authUser) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
          authUser = await resolveUserFromToken(authHeader.slice(7).trim());
        }
      }
      if (!authUser) return res.status(401).json({ message: 'You must be signed in.' });
      if (authUser.plan !== 'subscriber') return res.status(403).json({ message: 'Subscribers only.' });

      const runId = parseInt(req.params.id);
      if (isNaN(runId)) return res.status(400).json({ message: 'Invalid run id' });

      const msgs = await storage.getChatMessages(runId, String(authUser.id));
      res.json({ messages: msgs.map(m => ({ role: m.role, content: m.content })) });
    } catch (err: any) {
      console.error('[chat-load] Error:', err.message);
      res.status(500).json({ message: 'Failed to load chat history.' });
    }
  });

  // POST /api/report-chat — Subscriber-only Claude chat scoped to property report data
  app.post('/api/report-chat', async (req, res) => {
    try {
      // Support both session auth (cookies) and Bearer token auth (localStorage, for iframe contexts)
      let authUser = req.user || null;
      if (!authUser) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
          const token = authHeader.slice(7).trim();
          authUser = await resolveUserFromToken(token);
        }
      }
      if (!authUser) {
        return res.status(401).json({ message: 'You must be signed in.' });
      }
      if (authUser.plan !== 'subscriber') {
        return res.status(403).json({ message: 'This feature is available to subscribers only.' });
      }

      const { runIds, messages, reportSnapshot } = req.body as {
        runIds: number[];
        messages: Array<{ role: 'user' | 'assistant'; content: string }>;
        reportSnapshot?: string;
      };
      if (!Array.isArray(runIds) || runIds.length === 0) {
        return res.status(400).json({ message: 'runIds array required' });
      }
      if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ message: 'messages array required' });
      }

      // Save the user's latest message (last in the array) to DB
      const primaryRunId = typeof runIds[0] === 'number' ? runIds[0] : parseInt(String(runIds[0]));
      const chatUserId = String(authUser.id);
      const lastMsg = messages[messages.length - 1];
      if (!isNaN(primaryRunId) && lastMsg?.role === 'user') {
        await storage.saveChatMessage(primaryRunId, chatUserId, 'user', lastMsg.content)
          .catch(e => console.error('[chat-save] user msg error:', e.message));
      }

      // If the frontend sent a pre-built snapshot, use it directly — no API re-fetches needed.
      // This is the preferred path: the frontend already has all computed report data loaded.
      let contextBlocks: string[];
      if (reportSnapshot && typeof reportSnapshot === 'string' && reportSnapshot.length > 50) {
        contextBlocks = [reportSnapshot];
      } else {
        // Fallback: build context from DB + APIs (used when snapshot is unavailable)
        contextBlocks = [];
        for (const runId of runIds.slice(0, 3)) {
          const id = typeof runId === 'number' ? runId : parseInt(String(runId));
          if (isNaN(id)) continue;
          const run = await storage.getRun(id);
          if (!run) continue;
          const geo = await storage.getGeocodeAnyAge(run.address.trim().toLowerCase());
          const block = await buildPropertyChatContext(run, geo);
          contextBlocks.push(block);
        }
      }

      if (contextBlocks.length === 0) {
        return res.status(404).json({ message: 'No report data found.' });
      }

      const isCompare = contextBlocks.length > 1;
      const systemPrompt = `You are a property analysis assistant for the Know Your Property platform, a Chicago property eligibility screener.

Your job is to help users understand their property and evaluate project feasibility.

MANDATORY RULE — REPORT DATA COMES FIRST, ALWAYS:
Every single response you give must begin by scanning the PROPERTY REPORT DATA section at the bottom of this prompt. This is not optional. Before you write a single word of your answer, locate every field in the report that touches on the user's question. Your answer must draw from those fields first.

- If the report has the number, use it exactly. Never substitute a generic example ("e.g. a 5,000 sf lot") when the real lot size is right there in the report.
- If the user asks a concept question ("what is FAR?"), define it briefly, then immediately apply it to THIS property's actual numbers from the report.
- If the report has partial data, use what's there and note what's missing — do not fill gaps with invented examples.
- Only reach for general Chicago knowledge when the report genuinely has no data on the topic.

MANDATORY OUTPUT FORMAT — PROVENANCE BLOCKS:
Structure EVERY response as one or more blocks. Each block starts with a marker line, followed by that block's text:

:::report cite="<the exact report field/section the facts came from>"
<text grounded ONLY in this property's report data>

:::outside source="<source name>" url="<real, working URL>"
<text from general knowledge or an external source>

Rules for blocks:
1. Statements grounded in the report data below → a :::report block. The cite MUST name a field/section that actually exists in the report data (e.g. "TIF field", "FAR analysis", "Zoning details"). NEVER invent a report citation — if the report doesn't contain it, it does not belong in a report block.
2. Statements from general knowledge or external sources → an :::outside block. Never present outside content as report data.
3. If an answer mixes both (e.g. a property-specific fact plus an explanation of what a concept means), split it: report block first, then the outside block.
4. Outside citations must be REAL. Only include url="..." when you are confident it is a genuine, working official URL (e.g. https://www.chicago.gov/city/en/depts/dcd/provdrs/tif.html). If you cannot cite a real source, omit the url attribute and use source="General knowledge" — never fabricate a plausible-sounding link.
5. If the report fully answers the question, respond with report block(s) only — no outside block.
6. If the report lacks the answer entirely, say so plainly in an :::outside block (or state the report doesn't cover it) rather than guessing.
7. Do not write any text before the first marker line. Do not use markdown headings or code fences around the markers.

The report contains data on:
- Address, zoning code, TIF district, community area, opportunity zone
- Physical property: lot size, building sf, year built, stories (Cook County Assessor)
- FAR analysis: current FAR, max FAR, max buildable sf, remaining capacity
- Zoning details: FAR limit, height limit, parking requirements, permitted and special-use project uses
- Transit: nearest CTA rail/bus and Metra stations with exact distances, TOD eligibility
- Demographics: population, income, poverty rate, age breakdown (2010 vs 2023)
- Childcare access (only included for childcare/school projects; a single amenity line for residential projects; absent otherwise): children under 5, licensed slots, desert status by ZIP and community area

Be concise, specific, and actionable. Keep responses under 300 words unless the question requires more detail.${isCompare ? ' The user is comparing multiple properties — reference each by its address when comparing.' : ''}

=== PROPERTY REPORT DATA ===
${contextBlocks.map((b, i) => isCompare ? `--- Property ${i + 1} ---\n${b}` : b).join('\n\n')}
=== END REPORT DATA ===`;

      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

      const response = await client.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 1024,
        system: systemPrompt,
        messages: messages.slice(-20).map(m => ({ role: m.role, content: m.content })),
      });

      const textBlock = response.content.find(b => b.type === 'text');
      const text = textBlock && textBlock.type === 'text' ? textBlock.text : 'I was unable to generate a response. Please try again.';

      // Save assistant reply to DB
      if (!isNaN(primaryRunId)) {
        await storage.saveChatMessage(primaryRunId, chatUserId, 'assistant', text)
          .catch(e => console.error('[chat-save] assistant msg error:', e.message));
      }

      res.json({ reply: text });
    } catch (err: any) {
      console.error('[report-chat] Error:', err.message);
      res.status(500).json({ message: 'Chat failed. Please try again.' });
    }
  });

  // Validate which run IDs still exist
  app.post('/api/runs/validate', async (req, res) => {
    try {
      const { runIds } = req.body;
      if (!Array.isArray(runIds)) {
        return res.status(400).json({ message: "runIds must be an array" });
      }
      const existingRuns = await storage.getRunsByIds(runIds);
      const existingIds = existingRuns.map(r => r.id);
      res.json({ existingIds });
    } catch (err) {
      console.error('Validate runs error:', err);
      res.status(500).json({ message: "Failed to validate runs" });
    }
  });

  // === COMPARE HISTORY ===
  
  // Get compare history
  app.get('/api/compare-history', async (req, res) => {
    try {
      const userId = req.user?.email;
      if (!userId) return res.json([]);
      const history = await storage.getCompareHistory(userId);
      res.json(history);
    } catch (err) {
      console.error('Get compare history error:', err);
      res.status(500).json({ message: "Failed to get compare history" });
    }
  });

  // Save compare history
  app.post('/api/compare-history', async (req, res) => {
    try {
      const { runIds, addresses, projectTypes } = req.body;
      if (!Array.isArray(runIds) || !Array.isArray(addresses)) {
        return res.status(400).json({ message: "runIds and addresses must be arrays" });
      }
      if (runIds.length < 2) {
        return res.status(400).json({ message: "At least 2 runs required for comparison" });
      }
      const userId = req.user?.email ?? undefined;
      const entry = await storage.saveCompareHistory(runIds, addresses, projectTypes, userId);
      res.status(201).json(entry);
    } catch (err) {
      console.error('Save compare history error:', err);
      res.status(500).json({ message: "Failed to save compare history" });
    }
  });

  // Update compare history project uses
  app.patch('/api/compare-history/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(404).json({ message: "Invalid ID" });
      const { projectTypes } = req.body;
      if (!Array.isArray(projectTypes)) {
        return res.status(400).json({ message: "projectTypes must be an array" });
      }
      const updated = await storage.updateCompareHistoryProjectTypes(id, projectTypes);
      if (!updated) {
        return res.status(404).json({ message: "History entry not found" });
      }
      res.json(updated);
    } catch (err) {
      console.error('Update compare history error:', err);
      res.status(500).json({ message: "Failed to update compare history" });
    }
  });

  // Delete compare history entry
  app.delete('/api/compare-history/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(404).json({ message: "Invalid ID" });
      await storage.deleteCompareHistory(id);
      res.status(204).send();
    } catch (err) {
      console.error('Delete compare history error:', err);
      res.status(500).json({ message: "Failed to delete compare history entry" });
    }
  });

  // Clear all compare history
  app.delete('/api/compare-history', async (req, res) => {
    try {
      const userId = req.user?.email;
      if (!userId) return res.status(401).json({ message: 'Not authenticated' });
      await storage.clearCompareHistory(userId);
      res.status(204).send();
    } catch (err) {
      console.error('Clear compare history error:', err);
      res.status(500).json({ message: "Failed to clear compare history" });
    }
  });

  // === URL ADDRESS EXTRACTION ===
  
  // Helper function to extract address from URL path (works even when page fetch fails)
  function extractAddressFromUrl(parsedUrl: URL): string | null {
    const urlPath = parsedUrl.pathname;
    const hostname = parsedUrl.hostname.toLowerCase();
    
    // LoopNet pattern: /Listing/1140-W-Washington-Blvd-Chicago-IL/33458855/
    if (hostname.includes('loopnet.com')) {
      const loopnetMatch = urlPath.match(/\/Listing\/([^\/]+)/i);
      if (loopnetMatch) {
        const slug = loopnetMatch[1];
        // Convert slug: "1140-W-Washington-Blvd-Chicago-IL" to "1140 W Washington Blvd Chicago IL"
        const address = slug
          .replace(/-/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        // Verify it looks like an address (starts with a number)
        if (/^\d+\s+/.test(address)) {
          return address;
        }
      }
    }
    
    // Redfin pattern: /IL/Chicago/3212-W-Armitage-Ave-60647/home/147294862
    // With unit: /IL/Chicago/520-N-Oakley-Blvd-60612/unit-3N/home/171316392
    if (hostname.includes('redfin.com')) {
      // Extract city, address, and optional unit from path
      const redfinMatch = urlPath.match(/\/([A-Z]{2})\/([^\/]+)\/([^\/]+?)(?:\/(unit-[^\/]+))?\/home/i);
      if (redfinMatch) {
        const state = redfinMatch[1].toUpperCase();
        const city = redfinMatch[2].replace(/-/g, ' ');
        const addressSlug = redfinMatch[3];
        const unitSlug = redfinMatch[4]; // e.g., "unit-3N"
        // Remove zip code from end (5 digits)
        const addressWithoutZip = addressSlug.replace(/-\d{5}$/, '');
        const address = addressWithoutZip
          .replace(/-/g, ' ')
          .replace(/\s+/g, ' ')
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(' ')
          .trim();
        if (/^\d+\s+/.test(address)) {
          // Append unit number if present (e.g., "unit-3N" -> "Unit 3N")
          const unitSuffix = unitSlug 
            ? ` Unit ${unitSlug.replace(/^unit-/i, '').toUpperCase()}`
            : '';
          return `${address}${unitSuffix}, ${city}, ${state}`;
        }
      }
    }
    
    // Crexi patterns:
    // Pattern 1: /properties/{id}/{state}-{address}
    // Example: /properties/2080151/illinois-2252-n-milwaukee-avenue
    // Pattern 2: /property-records/{ADDRESS-CITY-STATE-ZIP}/{hash}
    // Example: /property-records/2252-MILWAUKEE-CHICAGO-IL-60647/27e6ccc...
    if (hostname.includes('crexi.com')) {
      // Pattern 2: property-records format (newer format)
      // /property-records/2252-MILWAUKEE-CHICAGO-IL-60647/...
      const propertyRecordsMatch = urlPath.match(/\/property-records\/([^\/]+)/i);
      if (propertyRecordsMatch) {
        const slug = propertyRecordsMatch[1];
        // Convert "2252-MILWAUKEE-CHICAGO-IL-60647" to "2252 Milwaukee Chicago IL 60647"
        const address = slug
          .replace(/-/g, ' ')
          .replace(/\s+/g, ' ')
          .split(' ')
          .map(word => {
            // Keep state abbreviations and zip codes uppercase/as-is
            if (/^[A-Z]{2}$/.test(word) || /^\d{5}$/.test(word)) {
              return word.toUpperCase();
            }
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
          })
          .join(' ')
          .trim();
        if (/^\d+\s+/.test(address)) {
          return address;
        }
      }
      
      // Pattern 1: /properties/{id}/{state}-{address}
      const crexiMatch = urlPath.match(/\/properties\/\d+\/[a-z]+-(\d+[-a-z0-9]+)/i);
      if (crexiMatch) {
        const addressSlug = crexiMatch[1];
        const address = addressSlug
          .replace(/-/g, ' ')
          .replace(/\s+/g, ' ')
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(' ')
          .trim();
        if (/^\d+\s+/.test(address)) {
          return address;
        }
      }
      // Fallback: try to get the full second segment
      const fallbackMatch = urlPath.match(/\/properties\/\d+\/([^\/]+)/i);
      if (fallbackMatch) {
        const slug = fallbackMatch[1];
        // Remove state prefix (e.g., "illinois-")
        const withoutState = slug.replace(/^[a-z]+-/i, '');
        const address = withoutState
          .replace(/-/g, ' ')
          .replace(/\s+/g, ' ')
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(' ')
          .trim();
        if (/^\d+\s+/.test(address)) {
          return address;
        }
      }
    }
    
    // Generic pattern for URLs with address-like slugs
    // Match patterns like: 123-main-st-chicago-il or 123-w-main-street-chicago-il
    const genericMatch = urlPath.match(/(\d+[-_](?:[news][-_])?[a-z0-9-]+[-_](?:st|street|ave|avenue|blvd|boulevard|dr|drive|rd|road|ln|lane|way|ct|court|pl|place|cir|circle)[-_][a-z0-9-]+)/i);
    if (genericMatch) {
      const slug = genericMatch[1];
      const address = slug
        .replace(/[-_]/g, ' ')
        .replace(/\s+/g, ' ')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
      return address;
    }
    
    return null;
  }
  
  // Extract address from property listing URLs (LoopNet, Redfin, Zillow, Crexi, MLS)
  app.post('/api/extract-address', async (req, res) => {
    try {
      const { url } = req.body;
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ message: "URL is required" });
      }

      // Validate URL format
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch {
        return res.status(400).json({ message: "Invalid URL format" });
      }

      // Check protocol (only allow http/https)
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return res.status(400).json({ message: "Only HTTP and HTTPS URLs are supported" });
      }

      // Check if it's a supported real estate site (strict domain matching to prevent SSRF)
      const supportedDomains = [
        'loopnet.com',
        'redfin.com',
        'zillow.com',
        'crexi.com',
        'realtor.com',
        'coldwellbanker.com',
        'century21.com',
        'kw.com',
        'compass.com',
        'trulia.com'
      ];
      
      const hostname = parsedUrl.hostname.toLowerCase();
      // Strict match: hostname must exactly equal domain OR end with .domain (subdomain)
      const isSupported = supportedDomains.some(domain => 
        hostname === domain || 
        hostname === `www.${domain}` || 
        hostname.endsWith(`.${domain}`)
      );
      
      if (!isSupported) {
        return res.status(400).json({ 
          message: "Unsupported website. Supported sites: LoopNet, Redfin, Zillow, Crexi, Realtor.com, and major MLS platforms." 
        });
      }

      // Fetch the page content with browser-like headers
      let fetchResponse: globalThis.Response;
      try {
        fetchResponse = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1',
          },
          signal: AbortSignal.timeout(15000), // 15 second timeout
          redirect: 'follow',
        });
      } catch (fetchError: any) {
        console.error('Fetch error:', fetchError.message);
        return res.status(400).json({ 
          message: "Could not connect to the listing site. The site may be blocking automated requests. Try copying the address manually." 
        });
      }

      if (!fetchResponse.ok) {
        console.error(`Fetch failed with status ${fetchResponse.status}`);
        // Try to extract address from URL before giving up
        let urlAddress = extractAddressFromUrl(parsedUrl);
        if (urlAddress) {
          // Ensure Chicago, IL is included for geocoding
          const hasChicagoInUrl = /chicago/i.test(urlAddress);
          const hasILInUrl = /\bIL\b|\bIllinois\b/i.test(urlAddress);
          if (!hasChicagoInUrl || !hasILInUrl) {
            urlAddress = urlAddress
              .replace(/,\s*[A-Za-z\s]+,\s*[A-Z]{2}\s*\d*$/i, '')
              .trim();
            urlAddress = `${urlAddress}, Chicago, IL`;
          }
          return res.json({ 
            address: urlAddress,
            source: hostname,
            extractedFromUrl: true
          });
        }
        return res.status(400).json({ 
          message: "The listing site returned an error. Try copying the address directly from the page." 
        });
      }

      const html = await fetchResponse.text();
      let extractedAddress: string | null = null;
      
      // Property details to extract from listings
      let propertyDetails: {
        buildingSqFt?: number;
        landSqFt?: number;
        stories?: number;
        yearBuilt?: number;
        propertyType?: string;
      } = {};

      // Try multiple extraction methods

      // Method 1: Look for JSON-LD structured data (most reliable)
      const jsonLdMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
      if (jsonLdMatch) {
        for (const match of jsonLdMatch) {
          try {
            const jsonContent = match.replace(/<script[^>]*>|<\/script>/gi, '');
            const data = JSON.parse(jsonContent);
            
            // Handle array of JSON-LD objects
            const items = Array.isArray(data) ? data : [data];
            for (const item of items) {
              if (item.address) {
                const addr = item.address;
                if (typeof addr === 'string') {
                  extractedAddress = addr;
                  break;
                } else if (addr.streetAddress) {
                  const parts = [addr.streetAddress];
                  if (addr.addressLocality) parts.push(addr.addressLocality);
                  if (addr.addressRegion) parts.push(addr.addressRegion);
                  if (addr.postalCode) parts.push(addr.postalCode);
                  extractedAddress = parts.join(', ');
                  break;
                }
              }
              // Also check for RealEstateListing or Product types
              if (item['@type'] === 'RealEstateListing' || item['@type'] === 'Product') {
                if (item.name && item.name.match(/\d+\s+\w+/)) {
                  extractedAddress = item.name;
                  break;
                }
              }
              // Extract property details from JSON-LD
              if (item.floorSize) {
                const sqftMatch = String(item.floorSize).match(/[\d,]+/);
                if (sqftMatch) propertyDetails.buildingSqFt = parseInt(sqftMatch[0].replace(/,/g, ''));
              }
              if (item.lotSize) {
                const lotMatch = String(item.lotSize).match(/[\d,]+/);
                if (lotMatch) propertyDetails.landSqFt = parseInt(lotMatch[0].replace(/,/g, ''));
              }
              if (item.numberOfFloors) propertyDetails.stories = parseInt(item.numberOfFloors);
              if (item.yearBuilt) propertyDetails.yearBuilt = parseInt(item.yearBuilt);
            }
            if (extractedAddress) break;
          } catch {
            // JSON parse failed, continue to next match
          }
        }
      }
      
      // Extract property details from common HTML patterns
      // Building/Floor Area patterns
      if (!propertyDetails.buildingSqFt) {
        const sqftPatterns = [
          /(?:building|floor|interior|rentable|usable|gross|net)\s*(?:area|size|sf|sq\.?\s*ft\.?|square\s*feet?)[\s:]*[\s]*([\d,]+)/i,
          /([\d,]+)\s*(?:sf|sq\.?\s*ft\.?|square\s*feet?)\s*(?:building|floor|interior|rentable|usable)/i,
          /(?:size|area)[\s:]*[\s]*([\d,]+)\s*(?:sf|sq\.?\s*ft\.?|square\s*feet?)/i,
          /"(?:building_?size|floor_?area|square_?feet|sqft)"[\s:]*[\s]*"?([\d,]+)/i,
        ];
        for (const pattern of sqftPatterns) {
          const match = html.match(pattern);
          if (match) {
            const val = parseInt(match[1].replace(/,/g, ''));
            if (val > 100 && val < 10000000) { // Reasonable building size
              propertyDetails.buildingSqFt = val;
              break;
            }
          }
        }
      }
      
      // Land/Lot Size patterns
      if (!propertyDetails.landSqFt) {
        const lotPatterns = [
          /(?:lot|land|site|parcel)\s*(?:area|size|sf|sq\.?\s*ft\.?|square\s*feet?)[\s:]*[\s]*([\d,]+)/i,
          /([\d,]+)\s*(?:sf|sq\.?\s*ft\.?|square\s*feet?)\s*(?:lot|land|site)/i,
          /"(?:lot_?size|land_?area|site_?size)"[\s:]*[\s]*"?([\d,]+)/i,
          /(?:lot|land)[\s:]+approximately\s*([\d,]+)/i,
        ];
        for (const pattern of lotPatterns) {
          const match = html.match(pattern);
          if (match) {
            const val = parseInt(match[1].replace(/,/g, ''));
            if (val > 100 && val < 100000000) { // Reasonable lot size
              propertyDetails.landSqFt = val;
              break;
            }
          }
        }
        // Check for acres and convert
        const acresMatch = html.match(/(?:lot|land|site)\s*(?:area|size)?[\s:]*[\s]*([\d.]+)\s*acres?/i);
        if (acresMatch && !propertyDetails.landSqFt) {
          const acres = parseFloat(acresMatch[1]);
          if (acres > 0 && acres < 1000) {
            propertyDetails.landSqFt = Math.round(acres * 43560);
          }
        }
      }
      
      // Stories patterns
      if (!propertyDetails.stories) {
        const storiesPatterns = [
          /(\d+)\s*(?:stor(?:y|ies)|floor(?:s)?|level(?:s)?)/i,
          /(?:stor(?:y|ies)|floor(?:s)?|level(?:s)?)[\s:]*[\s]*(\d+)/i,
          /"(?:stories|floors|levels|num_?stories)"[\s:]*[\s]*"?(\d+)/i,
        ];
        for (const pattern of storiesPatterns) {
          const match = html.match(pattern);
          if (match) {
            const val = parseInt(match[1]);
            if (val > 0 && val < 200) { // Reasonable story count
              propertyDetails.stories = val;
              break;
            }
          }
        }
      }
      
      // Year Built patterns
      if (!propertyDetails.yearBuilt) {
        const yearPatterns = [
          /(?:year\s*built|built\s*in|constructed)[\s:]*[\s]*(19\d{2}|20\d{2})/i,
          /"(?:year_?built|built_?year|construction_?year)"[\s:]*[\s]*"?(19\d{2}|20\d{2})/i,
        ];
        for (const pattern of yearPatterns) {
          const match = html.match(pattern);
          if (match) {
            propertyDetails.yearBuilt = parseInt(match[1]);
            break;
          }
        }
      }
      
      console.log('Extracted property details:', propertyDetails);

      // Method 2: Look for Open Graph meta tags
      if (!extractedAddress) {
        const ogStreetMatch = html.match(/<meta[^>]*property=["']og:street-address["'][^>]*content=["']([^"']+)["']/i);
        if (ogStreetMatch) {
          extractedAddress = ogStreetMatch[1];
        }
      }

      // Method 3: Look for common address patterns in title or h1
      if (!extractedAddress) {
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleMatch) {
          // Look for address patterns like "123 Main St" in title
          const addressPattern = /(\d+\s+[A-Za-z0-9\s]+(?:St|Street|Ave|Avenue|Blvd|Boulevard|Dr|Drive|Rd|Road|Ln|Lane|Way|Ct|Court|Pl|Place|Cir|Circle)[^,|]*)/i;
          const addrMatch = titleMatch[1].match(addressPattern);
          if (addrMatch) {
            extractedAddress = addrMatch[1].trim();
          }
        }
      }

      // Method 4: Look for specific site selectors (data attributes, specific classes)
      if (!extractedAddress) {
        // Zillow specific
        const zillowMatch = html.match(/data-test=["']homedetails-chip-container["'][^>]*>([^<]+)/i) ||
                           html.match(/"streetAddress"\s*:\s*"([^"]+)"/);
        if (zillowMatch) {
          extractedAddress = zillowMatch[1];
        }
      }

      // Method 5: Look for address in URL slug (many sites encode address in URL)
      if (!extractedAddress) {
        // LoopNet, Crexi often have address in URL like /listing/123-main-st-chicago-il
        const urlPath = parsedUrl.pathname;
        const slugMatch = urlPath.match(/(\d+[-\s]?[a-z0-9-]+(?:st|street|ave|avenue|blvd|dr|rd|ln|way|ct|pl|cir)[-\s][a-z0-9-]+)/i);
        if (slugMatch) {
          // Convert slug to address
          extractedAddress = slugMatch[1]
            .replace(/-/g, ' ')
            .replace(/\s+/g, ' ')
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
        }
      }

      if (!extractedAddress) {
        return res.status(404).json({ 
          message: "Could not find address on the listing page. Please enter the address manually." 
        });
      }

      // Clean up the address
      extractedAddress = extractedAddress
        .replace(/\s+/g, ' ')
        .replace(/[|–—]/g, ',')
        .trim();

      // Make sure it looks like a Chicago address (or at least has an address pattern)
      const hasAddressPattern = /\d+\s+[A-Za-z]/.test(extractedAddress);
      if (!hasAddressPattern) {
        return res.status(404).json({ 
          message: "Could not identify a valid address. Please enter the address manually." 
        });
      }

      // Ensure Chicago, IL is included for geocoding to work
      const hasChicago = /chicago/i.test(extractedAddress);
      const hasIL = /\bIL\b|\bIllinois\b/i.test(extractedAddress);
      if (!hasChicago || !hasIL) {
        // Remove any trailing city/state that's not Chicago
        extractedAddress = extractedAddress
          .replace(/,\s*[A-Za-z\s]+,\s*[A-Z]{2}\s*\d*$/i, '')
          .trim();
        // Append Chicago, IL
        extractedAddress = `${extractedAddress}, Chicago, IL`;
      }

      // Return address and any extracted property details
      const response: any = { 
        address: extractedAddress,
        source: hostname
      };
      
      // Include property details if any were extracted
      if (Object.keys(propertyDetails).length > 0) {
        response.propertyDetails = propertyDetails;
        console.log(`Extracted property details from ${hostname}:`, propertyDetails);
      }
      
      res.json(response);

    } catch (err) {
      console.error('Extract address error:', err);
      if (err instanceof Error && err.name === 'AbortError') {
        return res.status(408).json({ message: "Request timed out. The listing site took too long to respond." });
      }
      res.status(500).json({ message: "Failed to extract address from listing" });
    }
  });

  // === SCENARIOS ===

  app.post(api.scenarios.create.path, async (req, res) => {
    try {
      const input = api.scenarios.create.input.parse(req.body);
      const scenario = await storage.createScenario(input);
      res.status(201).json(scenario);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.delete(api.scenarios.delete.path, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(404).json({ message: "Invalid ID" });
    await storage.deleteScenario(id);
    res.status(204).send();
  });

  // === GEOCODING ===

  app.get(api.geocoding.autocomplete.path, async (req, res) => {
    try {
      const q = req.query.q as string;
      if (!q || q.length < 3) {
        return res.json([]);
      }

      // Detect Philadelphia address early to bypass Chicago-specific lookups
      const isPhillyQuery = /philadelphia|phila(,| |$)|philly|\b191\d{2}\b|\b190\d{2}\b/i.test(q);

      if (isPhillyQuery) {
        // For Philadelphia, use Census geocoder with full address as-is (no city append)
        const encodedQ = encodeURIComponent(q);
        const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodedQ}&benchmark=Public_AR_Current&format=json`;
        const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!response.ok) return res.json([]);
        const data = await response.json() as any;
        const matches = data.result?.addressMatches || [];
        const suggestions = matches.slice(0, 5).map((m: any) => ({ address: m.matchedAddress as string }));
        return res.json(suggestions);
      }

      const unitPattern = /\s+(Unit|Apt|Ste|Suite|#|FL|Floor)\s*([A-Za-z0-9-]+)/i;
      const unitMatch = q.match(unitPattern);
      const typedUnit = unitMatch ? unitMatch[2].toUpperCase() : '';
      const queryForGeocoder = unitMatch ? q.slice(0, unitMatch.index) + q.slice(unitMatch.index! + unitMatch[0].length) : q;

      const encodedQ = encodeURIComponent(`${queryForGeocoder}, Chicago, IL`);
      const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodedQ}&benchmark=Public_AR_Current&format=json`;

      const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) {
        console.error("Autocomplete fetch failed:", response.statusText);
        return res.json([]);
      }

      const data = await response.json() as any;
      const matches = data.result?.addressMatches || [];
      
      if (matches.length === 0) {
        return res.json([]);
      }

      const allSuggestions: { address: string }[] = [];
      
      for (const m of matches) {
        const baseAddress = stripCensusUnitArtifact(m.matchedAddress as string);
        const commaIdx = baseAddress.indexOf(',');
        const streetPart = commaIdx !== -1 ? baseAddress.slice(0, commaIdx).trimEnd() : baseAddress;
        const cityPart = commaIdx !== -1 ? baseAddress.slice(commaIdx) : '';

        try {
          const streetMatch = streetPart.match(/^(\d+\s+(?:[NSEW]\.?\s+)?[A-Z]+)/i);
          const searchPrefix = streetMatch ? streetMatch[1].replace(/'/g, "''") : streetPart.replace(/'/g, "''");
          const whereClause = `property_address like '${searchPrefix}%'`;
          const assessorUrl = `https://datacatalog.cookcountyil.gov/resource/c49d-89sn.json?$limit=200&$select=property_apt_no&$where=${encodeURIComponent(whereClause)}`;
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 4000);
          const assessorRes = await fetch(assessorUrl, { signal: controller.signal });
          clearTimeout(timeout);
          
          if (assessorRes.ok) {
            const units: any[] = await assessorRes.json();
            const unitNumbers = Array.from(new Set(
              units
                .map((u: any) => (u.property_apt_no || '').trim().toUpperCase())
                .filter((u: string) => u.length > 0)
            )).sort((a: string, b: string) => {
              const aNum = parseInt(a), bNum = parseInt(b);
              if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
              return a.localeCompare(b, undefined, { numeric: true });
            });
            
            if (unitNumbers.length > 1) {
              if (typedUnit) {
                const filtered = unitNumbers.filter(u => u.startsWith(typedUnit) || u === typedUnit);
                const unitsToShow = filtered.length > 0 ? filtered : unitNumbers.filter(u => u.includes(typedUnit));
                for (const unit of unitsToShow.slice(0, 15)) {
                  allSuggestions.push({ address: `${streetPart} Unit ${unit}${cityPart}` });
                }
                if (unitsToShow.length === 0) {
                  allSuggestions.push({ address: `${streetPart} Unit ${typedUnit}${cityPart}` });
                }
              } else {
                allSuggestions.push({ address: baseAddress });
                for (const unit of unitNumbers.slice(0, 10)) {
                  allSuggestions.push({ address: `${streetPart} Unit ${unit}${cityPart}` });
                }
              }
            } else {
              if (typedUnit) {
                allSuggestions.push({ address: `${streetPart} Unit ${typedUnit}${cityPart}` });
              } else {
                allSuggestions.push({ address: baseAddress });
              }
            }
          } else {
            if (typedUnit) {
              allSuggestions.push({ address: `${streetPart} Unit ${typedUnit}${cityPart}` });
            } else {
              allSuggestions.push({ address: baseAddress });
            }
          }
        } catch (assessorErr) {
          if (typedUnit) {
            allSuggestions.push({ address: `${streetPart} Unit ${typedUnit}${cityPart}` });
          } else {
            allSuggestions.push({ address: baseAddress });
          }
        }
      }

      console.log(`Found ${allSuggestions.length} suggestions for "${q}"`);
      res.json(allSuggestions.slice(0, 15));
    } catch (err) {
      console.error("Autocomplete error:", err);
      res.json([]);
    }
  });

  // Area autocomplete (ZIP codes and community areas)
  app.get('/api/area-autocomplete', async (req, res) => {
    try {
      const q = (req.query.q as string || '').trim().toLowerCase();
      if (!q) {
        return res.json([]);
      }

      const suggestions: Array<{ type: 'zip' | 'community'; value: string; label: string }> = [];

      // Load area index for ZIP codes
      const areaIndexPath = path.join(__dirname, 'data', 'area_index.json');
      if (fs.existsSync(areaIndexPath)) {
        const areaIndex = JSON.parse(fs.readFileSync(areaIndexPath, 'utf-8'));
        const zips = Object.keys(areaIndex.byZip || {});
        
        // Filter ZIPs that match the query
        for (const zip of zips) {
          if (zip.startsWith(q)) {
            suggestions.push({
              type: 'zip',
              value: zip,
              label: `${zip} (ZIP Code)`
            });
          }
        }
      }

      // Load community area names
      const caPath = path.join(__dirname, 'data', 'chicago_community_areas.geojson');
      if (fs.existsSync(caPath)) {
        const caData = JSON.parse(fs.readFileSync(caPath, 'utf-8'));
        for (const feature of caData.features || []) {
          const name = feature.properties?.community;
          if (name && name.toLowerCase().includes(q)) {
            // Avoid duplicates
            if (!suggestions.some(s => s.type === 'community' && s.value === name)) {
              suggestions.push({
                type: 'community',
                value: name,
                label: `${name.charAt(0) + name.slice(1).toLowerCase()} (Neighborhood)`
              });
            }
          }
        }
      }

      // Sort: ZIPs first (if query is numeric), then alphabetically
      suggestions.sort((a, b) => {
        if (/^\d/.test(q)) {
          if (a.type === 'zip' && b.type !== 'zip') return -1;
          if (a.type !== 'zip' && b.type === 'zip') return 1;
        }
        return a.label.localeCompare(b.label);
      });

      res.json(suggestions.slice(0, 10));
    } catch (err) {
      console.error("Area autocomplete error:", err);
      res.json([]);
    }
  });

  app.post(api.geocoding.lookup.path, async (req, res) => {
    try {
      const { address } = api.geocoding.lookup.input.parse(req.body);

      // Strip unit/apt/suite numbers for consistent caching and lookups
      const stripUnit = (addr: string) => addr.replace(/\s+(APT|UNIT|STE|SUITE|#|FL|FLOOR)\s*\S+/gi, '').replace(/\s+/g, ' ').trim();

      // Normalize long-form addresses (Apple Maps autofill, Google Maps copy-paste, etc.)
      const normalizeAddressInput = (addr: string) => addr
        .replace(/,?\s*United States$/i, '')
        .replace(/,?\s*US$/i, '')
        .replace(/,?\s*USA$/i, '')
        .replace(/,\s*Illinois\b/gi, ', IL')
        .replace(/,\s*Pennsylvania\b/gi, ', PA')
        .replace(/,\s*Indiana\b/gi, ', IN')
        .replace(/,\s*Wisconsin\b/gi, ', WI')
        .replace(/,\s*Michigan\b/gi, ', MI')
        .replace(/,\s*Ohio\b/gi, ', OH')
        .replace(/\s+/g, ' ')
        .trim();

      const cleanedAddress = normalizeAddressInput(address);

      // Check cache - try both raw and unit-stripped versions
      const normalizedAddress = cleanedAddress.trim().toLowerCase();
      const strippedAddress = stripUnit(normalizedAddress);
      let cached = await storage.getGeocode(strippedAddress);
      if (!cached) {
        cached = await storage.getGeocode(normalizedAddress);
      }
      
      if (cached) {
        console.log(`Cache hit for ${address}`);
        // Extract ZIP from address if not in cache (backwards compatibility for old entries)
        let zipCode = cached.zipCode;
        if (!zipCode) {
          const zipMatch = cached.address.match(/\b(\d{5})(?:-\d{4})?\b/);
          zipCode = zipMatch ? zipMatch[1] : null;
        }
        // Perform ward lookup for cached entries (ward data may not be in old cache)
        const lat = parseFloat(cached.lat);
        const lon = parseFloat(cached.lon);
        const wardInfo = lookupWardByCoordinates(lat, lon);
        
        // Perform neighborhood lookup
        const neighborhood = lookupNeighborhoodByCoordinates(lat, lon);
        
        // If zoning is missing or shows API failure, try to re-fetch it
        let zoning = cached.zoning;
        if (!zoning || zoning.toLowerCase().includes('unavailable')) {
          console.log(`[ZONING] Cached zoning is missing/invalid, attempting live lookup...`);
          const freshResult = await lookupLocation(address);
          if (freshResult.zoning && !freshResult.zoning.toLowerCase().includes('unavailable')) {
            zoning = freshResult.zoning;
            // Update cache with good zoning value
            await storage.cacheGeocode({
              address: normalizedAddress,
              lat: cached.lat,
              lon: cached.lon,
              tractGeoid: cached.tractGeoid,
              zipCode: cached.zipCode,
              tifName: cached.tifName,
              zoning: zoning,
              communityArea: cached.communityArea,
              opportunityZone: cached.opportunityZone
            });
            console.log(`[ZONING] Updated cache with fresh zoning: ${zoning}`);
          }
        }
        
        // Detect city from cached address
        const { detectCityFromAddress } = await import('./philly/cityDetect.js');
        const cachedCity = detectCityFromAddress(cached.address);

        // ADU zone lookup — after zoning is resolved (live Chicago ArcGIS service for RS zones)
        const aduResult = await lookupAduZoneByCoordinates(lat, lon, zoning);

        return res.json({
          lat,
          lon,
          tractGeoid: cached.tractGeoid,
          zipCode: zipCode,
          tifName: cachedCity === 'philadelphia' ? null : cached.tifName,
          zoning: cachedCity === 'philadelphia' ? null : zoning,
          communityArea: cachedCity === 'philadelphia' ? null : cached.communityArea,
          ward: cachedCity === 'philadelphia' ? null : wardInfo.ward,
          alderman: cachedCity === 'philadelphia' ? null : wardInfo.alderman,
          aldermanUrl: cachedCity === 'philadelphia' ? null : wardInfo.aldermanUrl,
          aldermanPhone: cachedCity === 'philadelphia' ? null : wardInfo.aldermanPhone,
          aldermanEmail: cachedCity === 'philadelphia' ? null : wardInfo.aldermanEmail,
          aldermanWardOffice: cachedCity === 'philadelphia' ? null : wardInfo.aldermanWardOffice,
          aldermanYearsInOffice: cachedCity === 'philadelphia' ? null : wardInfo.aldermanYearsInOffice,
          aldermanAttendance: cachedCity === 'philadelphia' ? null : wardInfo.aldermanAttendance,
          aldermanCouncilmaticUrl: cachedCity === 'philadelphia' ? null : wardInfo.aldermanCouncilmaticUrl,
          opportunityZone: cached.opportunityZone,
          aduZone: cachedCity === 'philadelphia' ? null : (aduResult?.zone || null),
          aduZoneDisplay: cachedCity === 'philadelphia' ? null : (aduResult?.display || null),
          aduZoneLimitations: cachedCity === 'philadelphia' ? null : (aduResult?.limitations || null),
          neighborhood: cachedCity === 'philadelphia' ? null : neighborhood,
          formattedAddress: (() => {
            const userSpecifiedUnit = /\b(unit|apt\.?|#|ste\.?|suite)\s*[a-z0-9\-]+/i.test(address);
            const raw = cached.address.toUpperCase().replace(/,\s*(\d{5})/, ', $1');
            return userSpecifiedUnit ? raw : raw.replace(/,?\s+UNIT\s+[A-Z0-9\-]+/i, '');
          })(),
          city: cachedCity,
        });
      }

      // Live lookup
      try {
        const result = await lookupLocation(address);

        // Chicago-only gate: reject addresses outside Chicago
        if (!result.communityArea && !/chicago/i.test(result.formattedAddress || '')) {
          return res.status(422).json({ message: "OUTSIDE_CHICAGO" });
        }
        
        // Cache using Census formatted address (clean, no unit numbers)
        const cacheAddress = result.formattedAddress ? result.formattedAddress.toLowerCase().trim() : strippedAddress;
        const zoningValid = result.zoning && !result.zoning.toLowerCase().includes('unavailable');
        await storage.cacheGeocode({
          address: cacheAddress,
          lat: result.lat.toString(),
          lon: result.lon.toString(),
          tractGeoid: result.tractGeoid,
          zipCode: result.zipCode,
          tifName: result.tifName,
          zoning: zoningValid ? result.zoning : null,
          communityArea: result.communityArea,
          opportunityZone: result.opportunityZone
        });

        const liveNeighborhood = lookupNeighborhoodByCoordinates(result.lat, result.lon);
        res.json({ ...result, neighborhood: liveNeighborhood });
      } catch (err: any) {
        console.error("Geocoding error:", err.message);
        res.status(400).json({ message: err.message || "Failed to geocode address" });
      }

    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // === ZONING INFO ===

  app.get('/api/zoning/:code', async (req, res) => {
    const code = req.params.code;
    if (!code) {
      return res.status(400).json({ message: "Zoning code required" });
    }
    
    const info = getZoningInfo(code);
    if (!info) {
      return res.status(404).json({ message: "Zoning code not found in database" });
    }
    
    res.json(info);
  });

  // === BUSINESS USES ===

  app.get('/api/business-uses', async (req, res) => {
    res.json({
      uses: BUSINESS_USES.map(u => ({ name: u.name, category: u.category, zoningCategory: u.zoningCategory })),
      categories: getBusinessUseCategories(),
    });
  });

  app.post('/api/zoning/check-compatibility', async (req, res) => {
    const { businessUse, zoningCode } = req.body;
    
    if (!businessUse || !zoningCode) {
      return res.status(400).json({ message: "businessUse and zoningCode are required" });
    }

    const result = checkZoningCompatibility(businessUse, zoningCode);
    res.json(result);
  });

  // === CHILDCARE ACCESS ===

  app.get('/api/childcare/:zipCode', async (req, res) => {
    const zipCode = req.params.zipCode;
    if (!zipCode || !/^\d{5}$/.test(zipCode)) {
      return res.status(400).json({ message: "Valid 5-digit ZIP code required" });
    }
    
    const data = await getChildcareAccess(zipCode);
    if (!data) {
      return res.status(404).json({ message: "No childcare data available for this ZIP code" });
    }
    
    res.json(data);
  });

  app.get('/api/childcare/community/:communityArea', async (req, res) => {
    const communityArea = decodeURIComponent(req.params.communityArea);
    if (!communityArea) {
      return res.status(400).json({ message: "Community area name required" });
    }
    
    const data = await getCommunityAreaChildcareAccess(communityArea);
    if (!data) {
      return res.status(404).json({ message: "No childcare data available for this community area" });
    }
    
    res.json(data);
  });

  // === DEMOGRAPHICS ===
  
  app.get('/api/demographics/:communityArea', async (req, res) => {
    const communityArea = decodeURIComponent(req.params.communityArea);
    if (!communityArea) {
      return res.status(400).json({ message: "Community area name required" });
    }
    
    const projectType = req.query.projectType as string | undefined;
    const data = await getDemographicTrends(communityArea, projectType);
    
    if (!data) {
      return res.status(404).json({ message: "No demographic data available for this community area" });
    }
    
    res.json(data);
  });

  // === CENSUS ACS (Tract + ZIP three-tier demographics) ===
  const censusAcsCache = new Map<string, { data: any; ts: number }>();
  const CENSUS_ACS_TTL = 1000 * 60 * 60 * 24;

  const ACS_VARS = [
    'NAME',
    'B01003_001E', 'B01002_001E',
    'B19013_001E', 'B19301_001E',
    'B17001_002E', 'B17001_001E',
    'B23025_005E', 'B23025_003E',
    'B15003_001E',
    'B15003_017E', 'B15003_018E', 'B15003_019E', 'B15003_020E', 'B15003_021E',
    'B15003_022E', 'B15003_023E', 'B15003_024E', 'B15003_025E',
    'B02001_001E', 'B02001_002E', 'B02001_003E', 'B02001_005E',
    'B03003_003E',
    'B25003_001E', 'B25003_002E', 'B25003_003E',
    'B25002_001E', 'B25002_003E',
    'B25077_001E', 'B25064_001E',
    'B08301_001E', 'B08301_010E',
  ];

  function parseAcsRow(headers: string[], row: string[]): Record<string, any> {
    const obj: Record<string, any> = {};
    headers.forEach((h, i) => {
      const n = parseFloat(row[i]);
      obj[h] = (!isNaN(n) && n !== -666666666 && n !== -999999999) ? n : (row[i] === '-' ? null : row[i]);
    });
    return obj;
  }

  function buildAcsMetrics(raw: Record<string, any>): { label: string; value: string; rawValue: number | null }[] {
    const metrics: { label: string; value: string; rawValue: number | null }[] = [];
    const pn = (v: any): number | null => {
      const n = Number(v);
      return v != null && v !== '' && !isNaN(n) && n !== -666666666 && n !== -999999999 ? n : null;
    };
    const fmt$ = (v: number | null) => v != null ? '$' + Math.round(v).toLocaleString('en-US') : null;
    const fmtPct = (v: number | null) => v != null ? v.toFixed(1) + '%' : null;
    const fmtNum = (v: number | null) => v != null ? Math.round(v).toLocaleString('en-US') : null;

    const pop = pn(raw['B01003_001E']);
    const age = pn(raw['B01002_001E']);
    const medIncome = pn(raw['B19013_001E']);
    const pcIncome = pn(raw['B19301_001E']);
    const povertyN = pn(raw['B17001_002E']);
    const povertyD = pn(raw['B17001_001E']);
    const unemployed = pn(raw['B23025_005E']);
    const laborForce = pn(raw['B23025_003E']);
    const edu25 = pn(raw['B15003_001E']);
    const hsAbove = ['B15003_017E','B15003_018E','B15003_019E','B15003_020E','B15003_021E','B15003_022E','B15003_023E','B15003_024E','B15003_025E']
      .reduce((s, k) => s + (pn(raw[k]) ?? 0), 0);
    const totalRace = pn(raw['B02001_001E']) ?? pop;
    const white = pn(raw['B02001_002E']);
    const black = pn(raw['B02001_003E']);
    const asian = pn(raw['B02001_005E']);
    const hispanic = pn(raw['B03003_003E']);
    const totalHousing = pn(raw['B25003_001E']);
    const ownerOcc = pn(raw['B25003_002E']);
    const renterOcc = pn(raw['B25003_003E']);
    const totalUnits = pn(raw['B25002_001E']);
    const vacantUnits = pn(raw['B25002_003E']);
    const homeValue = pn(raw['B25077_001E']);
    const medRent = pn(raw['B25064_001E']);
    const workers = pn(raw['B08301_001E']);
    const transitW = pn(raw['B08301_010E']);

    const povertyRate = povertyN != null && povertyD && povertyD > 0 ? (povertyN / povertyD) * 100 : null;
    const unempRate = unemployed != null && laborForce && laborForce > 0 ? (unemployed / laborForce) * 100 : null;
    const noHSRate = edu25 && edu25 > 0 ? ((edu25 - hsAbove) / edu25) * 100 : null;
    const whitePct = white != null && pop && pop > 0 ? (white / pop) * 100 : null;
    const blackPct = black != null && pop && pop > 0 ? (black / pop) * 100 : null;
    const asianPct = asian != null && pop && pop > 0 ? (asian / pop) * 100 : null;
    const hispanicPct = hispanic != null && pop && pop > 0 ? (hispanic / pop) * 100 : null;
    const bipocPct = white != null && pop && pop > 0 ? ((pop - white) / pop) * 100 : null;
    const ownerPct = ownerOcc != null && totalHousing && totalHousing > 0 ? (ownerOcc / totalHousing) * 100 : null;
    const renterPct = renterOcc != null && totalHousing && totalHousing > 0 ? (renterOcc / totalHousing) * 100 : null;
    const vacancyRate = vacantUnits != null && totalUnits && totalUnits > 0 ? (vacantUnits / totalUnits) * 100 : null;
    const transitPct = transitW != null && workers && workers > 0 ? (transitW / workers) * 100 : null;

    const push = (label: string, value: string | null, rawValue: number | null = null) => {
      if (value) metrics.push({ label, value, rawValue });
    };
    push('Population', fmtNum(pop), pop);
    push('Median Age', age != null ? String(age) : null, age);
    push('Median Household Income', fmt$(medIncome), medIncome);
    push('Per Capita Income', fmt$(pcIncome), pcIncome);
    push('% Below Poverty', fmtPct(povertyRate), povertyRate);
    push('% Unemployed (16+)', fmtPct(unempRate), unempRate);
    push('% Without HS Diploma (25+)', fmtPct(noHSRate), noHSRate);
    push('% White', fmtPct(whitePct), whitePct);
    push('% Black/African American', fmtPct(blackPct), blackPct);
    push('% Hispanic/Latino', fmtPct(hispanicPct), hispanicPct);
    push('% Asian', fmtPct(asianPct), asianPct);
    push('% BIPOC', fmtPct(bipocPct), bipocPct);
    push('% Owner-Occupied', fmtPct(ownerPct), ownerPct);
    push('% Renter-Occupied', fmtPct(renterPct), renterPct);
    push('% Housing Vacancy', fmtPct(vacancyRate), vacancyRate);
    push('Median Home Value', fmt$(homeValue), homeValue);
    push('Median Gross Rent', fmt$(medRent), medRent);
    push('% Commute via Transit', fmtPct(transitPct), transitPct);
    return metrics;
  }

  app.get('/api/census-acs', async (req, res) => {
    const { tractGeoid, zipCode } = req.query as { tractGeoid?: string; zipCode?: string };
    if (!tractGeoid && !zipCode) return res.status(400).json({ message: 'tractGeoid or zipCode required' });

    const cacheKey = `${tractGeoid || ''}_${zipCode || ''}`;
    const cached = censusAcsCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CENSUS_ACS_TTL) return res.json(cached.data);

    const censusApiKey = process.env.CENSUS_API_KEY;
    const keyParam = censusApiKey ? `&key=${censusApiKey}` : '';
    const varStr = ACS_VARS.join(',');
    const result: { tract: any; zip: any } = { tract: null, zip: null };

    const fetchAcs = async (url: string): Promise<string[][] | null> => {
      try {
        const resp = await fetch(url + keyParam, { signal: AbortSignal.timeout(10000) });
        if (!resp.ok) return null;
        const contentType = resp.headers.get('content-type') || '';
        if (!contentType.includes('application/json') && !contentType.includes('text/json')) {
          const text = await resp.text();
          if (text.trim().startsWith('[')) {
            return JSON.parse(text);
          }
          console.warn('Census ACS non-JSON response (API key may be required):', text.substring(0, 100));
          return null;
        }
        return await resp.json();
      } catch {
        return null;
      }
    };

    try {
      if (tractGeoid && tractGeoid.length === 11) {
        const state = tractGeoid.substring(0, 2);
        const county = tractGeoid.substring(2, 5);
        const tract = tractGeoid.substring(5);
        const [jsonCurrent, jsonPrior] = await Promise.all([
          fetchAcs(`https://api.census.gov/data/2023/acs/acs5?get=${varStr}&for=tract:${tract}&in=state:${state}%20county:${county}`),
          fetchAcs(`https://api.census.gov/data/2018/acs/acs5?get=${varStr}&for=tract:${tract}&in=state:${state}%20county:${county}`),
        ]);
        if (jsonCurrent && jsonCurrent.length >= 2) {
          const raw = parseAcsRow(jsonCurrent[0], jsonCurrent[1]);
          const priorMetrics = jsonPrior && jsonPrior.length >= 2
            ? buildAcsMetrics(parseAcsRow(jsonPrior[0], jsonPrior[1]))
            : null;
          result.tract = {
            geoid: tractGeoid,
            name: typeof raw['NAME'] === 'string' ? raw['NAME'] : `Tract ${tract}`,
            metrics: buildAcsMetrics(raw),
            priorMetrics,
            dataYear: 2023,
            source: 'U.S. Census Bureau, ACS 5-Year Estimates',
          };
        }
      }

      if (zipCode) {
        const zcta = zipCode.substring(0, 5);
        const [jsonCurrent, jsonPrior] = await Promise.all([
          fetchAcs(`https://api.census.gov/data/2023/acs/acs5?get=${varStr}&for=zip%20code%20tabulation%20area:${zcta}`),
          // 2018 ACS requires state qualification for ZCTAs ("ambiguous geography" without it).
          // All Chicago ZIPs are in Illinois (state FIPS = 17).
          fetchAcs(`https://api.census.gov/data/2018/acs/acs5?get=${varStr}&for=zip%20code%20tabulation%20area:${zcta}&in=state:17`),
        ]);
        if (jsonCurrent && jsonCurrent.length >= 2) {
          const raw = parseAcsRow(jsonCurrent[0], jsonCurrent[1]);
          const priorMetrics = jsonPrior && jsonPrior.length >= 2
            ? buildAcsMetrics(parseAcsRow(jsonPrior[0], jsonPrior[1]))
            : null;
          result.zip = {
            geoid: zcta,
            name: typeof raw['NAME'] === 'string' ? raw['NAME'] : `ZIP ${zcta}`,
            metrics: buildAcsMetrics(raw),
            priorMetrics,
            dataYear: 2023,
            source: 'U.S. Census Bureau, ACS 5-Year Estimates',
          };
        }
      }

      censusAcsCache.set(cacheKey, { data: result, ts: Date.now() });
      res.json(result);
    } catch (err) {
      console.error('Census ACS fetch error:', err);
      res.json({ tract: null, zip: null });
    }
  });

  // === LODES (LEHD Origin-Destination Employment Statistics) ===

  let lodesData: Record<string, {
    workersInTract: number;
    residentsWhoWork: number;
    highEarners: number;
    retailJobs: number;
    healthcareJobs: number;
    artsEntertainmentJobs: number;
    foodServiceJobs: number;
  }> | null = null;

  function loadLodesData() {
    if (lodesData) return lodesData;
    try {
      const p = path.join(__dirname, 'data', 'lodes_tract.json');
      if (fs.existsSync(p)) {
        lodesData = JSON.parse(fs.readFileSync(p, 'utf-8'));
        console.log(`Loaded LODES data for ${Object.keys(lodesData!).length} Cook County tracts`);
      }
    } catch (e) {
      console.error('Failed to load LODES data:', e);
    }
    return lodesData;
  }
  loadLodesData();

  app.get('/api/lodes', (req, res) => {
    const tractGeoid = (req.query.tractGeoid as string || '').trim();
    if (!tractGeoid) return res.status(400).json({ error: 'tractGeoid required' });
    const data = loadLodesData();
    if (!data) return res.status(503).json({ error: 'LODES data not loaded' });
    const tract = data[tractGeoid];
    if (!tract) return res.json(null);
    res.json({ tractGeoid, ...tract });
  });

  // === VEHICLE OWNERSHIP ===
  
  let vehicleOwnershipData: any[] | null = null;
  
  function loadVehicleOwnershipData(): any[] {
    if (vehicleOwnershipData) return vehicleOwnershipData;
    try {
      const vehiclePath = path.join(__dirname, 'data', 'demographics', 'vehicle_ownership.json');
      if (fs.existsSync(vehiclePath)) {
        vehicleOwnershipData = JSON.parse(fs.readFileSync(vehiclePath, 'utf-8'));
        console.log(`Loaded vehicle ownership data for ${vehicleOwnershipData?.length || 0} community areas`);
      }
    } catch (err) {
      console.error('Error loading vehicle ownership data:', err);
    }
    return vehicleOwnershipData || [];
  }
  
  app.get('/api/vehicle-ownership/:communityArea', async (req, res) => {
    const communityArea = decodeURIComponent(req.params.communityArea);
    if (!communityArea) {
      return res.status(400).json({ message: "Community area name required" });
    }
    
    const data = loadVehicleOwnershipData();
    const areaData = data.find((d: any) => 
      d.communityArea.toLowerCase() === communityArea.toLowerCase() ||
      d.communityArea.toUpperCase() === communityArea.toUpperCase()
    );
    
    if (!areaData) {
      return res.status(404).json({ message: "No vehicle ownership data available for this community area" });
    }
    
    res.json(areaData);
  });

  // === SENIORS LIVING ALONE DATA ===
  
  let seniorsData: any[] | null = null;
  
  function loadSeniorsData(): any[] {
    if (seniorsData) return seniorsData;
    try {
      const seniorsPath = path.join(__dirname, 'data', 'demographics', 'seniors_living_alone.json');
      if (fs.existsSync(seniorsPath)) {
        seniorsData = JSON.parse(fs.readFileSync(seniorsPath, 'utf-8'));
        console.log(`Loaded seniors data for ${seniorsData?.length || 0} community areas`);
      }
    } catch (err) {
      console.error('Error loading seniors data:', err);
    }
    return seniorsData || [];
  }
  
  app.get('/api/seniors/:communityArea', async (req, res) => {
    const communityArea = decodeURIComponent(req.params.communityArea);
    if (!communityArea) {
      return res.status(400).json({ message: "Community area name required" });
    }
    
    const data = loadSeniorsData();
    const areaData = data.find((d: any) => 
      d.communityArea.toLowerCase() === communityArea.toLowerCase() ||
      d.communityArea.toUpperCase() === communityArea.toUpperCase()
    );
    
    if (!areaData) {
      return res.status(404).json({ message: "No seniors data available for this community area" });
    }
    
    res.json(areaData);
  });

  // === SENIORS ZIP DATA ===
  
  let seniorsZipData: any[] | null = null;
  
  function loadSeniorsZipData(): any[] {
    if (seniorsZipData) return seniorsZipData;
    try {
      const seniorsZipPath = path.join(__dirname, 'data', 'demographics', 'seniors_zip.json');
      if (fs.existsSync(seniorsZipPath)) {
        seniorsZipData = JSON.parse(fs.readFileSync(seniorsZipPath, 'utf-8'));
        console.log(`Loaded seniors ZIP data for ${seniorsZipData?.length || 0} ZIP codes`);
      }
    } catch (err) {
      console.error('Error loading seniors ZIP data:', err);
    }
    return seniorsZipData || [];
  }
  
  app.get('/api/seniors-zip/:zipCode', async (req, res) => {
    const zipCode = req.params.zipCode;
    if (!zipCode || !/^\d{5}$/.test(zipCode)) {
      return res.status(400).json({ message: "Valid 5-digit ZIP code required" });
    }
    
    const data = loadSeniorsZipData();
    const zipData = data.find((d: any) => d.zipCode === zipCode);
    
    if (!zipData) {
      return res.status(404).json({ message: "No seniors data available for this ZIP code" });
    }
    
    res.json(zipData);
  });

  // === CHILDCARE CAPACITY DATA ===
  
  let capacityCcaData: any[] | null = null;
  let capacityZipData: any[] | null = null;
  
  function loadCapacityCcaData(): any[] {
    if (capacityCcaData) return capacityCcaData;
    try {
      const dataPath = path.join(__dirname, 'data', 'chicago_capacity_by_cca.json');
      if (fs.existsSync(dataPath)) {
        capacityCcaData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
        console.log(`Loaded childcare capacity data for ${capacityCcaData?.length || 0} community areas`);
      }
    } catch (err) {
      console.error('Error loading childcare capacity CCA data:', err);
    }
    return capacityCcaData || [];
  }
  
  function loadCapacityZipData(): any[] {
    if (capacityZipData) return capacityZipData;
    try {
      const dataPath = path.join(__dirname, 'data', 'chicago_capacity_by_zip.json');
      if (fs.existsSync(dataPath)) {
        capacityZipData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
        console.log(`Loaded childcare capacity data for ${capacityZipData?.length || 0} ZIP codes`);
      }
    } catch (err) {
      console.error('Error loading childcare capacity ZIP data:', err);
    }
    return capacityZipData || [];
  }
  
  // Calculate citywide CCAP stats from CCA data
  function getCitywideCcapStats() {
    return childcareCitywideCcapStats(loadCapacityCcaData());
  }

  app.get('/api/childcare-capacity/:communityArea', async (req, res) => {
    const communityArea = decodeURIComponent(req.params.communityArea);
    if (!communityArea) {
      return res.status(400).json({ message: "Community area name required" });
    }
    
    const data = loadCapacityCcaData();
    const areaData = data.find((d: any) => 
      d.community_area.toLowerCase() === communityArea.toLowerCase() ||
      d.community_area.toUpperCase() === communityArea.toUpperCase()
    );
    
    if (!areaData) {
      return res.status(404).json({ message: "No childcare capacity data available for this community area" });
    }
    
    // Add citywide comparison
    const citywide = getCitywideCcapStats();
    res.json({ ...areaData, ...citywide });
  });
  
  app.get('/api/childcare-capacity-zip/:zipCode', async (req, res) => {
    const zipCode = req.params.zipCode;
    if (!zipCode || !/^\d{5}$/.test(zipCode)) {
      return res.status(400).json({ message: "Valid 5-digit ZIP code required" });
    }
    
    const data = loadCapacityZipData();
    const zipData = data.find((d: any) => d.zip_code === zipCode);
    
    if (!zipData) {
      return res.status(404).json({ message: "No childcare capacity data available for this ZIP code" });
    }
    
    // Add citywide comparison
    const citywide = getCitywideCcapStats();
    res.json({ ...zipData, ...citywide });
  });

  // === LANGUAGE DATA ===
  
  let languageData: any[] | null = null;
  
  function loadLanguageData(): any[] {
    if (languageData) return languageData;
    try {
      const languagePath = path.join(__dirname, 'data', 'demographics', 'languages.json');
      if (fs.existsSync(languagePath)) {
        languageData = JSON.parse(fs.readFileSync(languagePath, 'utf-8'));
        console.log(`Loaded language data for ${languageData?.length || 0} community areas`);
      }
    } catch (err) {
      console.error('Error loading language data:', err);
    }
    return languageData || [];
  }
  
  app.get('/api/languages/:communityArea', async (req, res) => {
    const communityArea = decodeURIComponent(req.params.communityArea);
    if (!communityArea) {
      return res.status(400).json({ message: "Community area name required" });
    }
    
    const data = loadLanguageData();
    const areaData = data.find((d: any) => 
      d.communityArea.toLowerCase() === communityArea.toLowerCase() ||
      d.communityArea.toUpperCase() === communityArea.toUpperCase()
    );
    
    if (!areaData) {
      return res.status(404).json({ message: "No language data available for this community area" });
    }
    
    res.json(areaData);
  });

  // === LANGUAGE DATA BY ZIP CODE ===
  
  let languageZipData: any[] | null = null;
  
  function loadLanguageZipData(): any[] {
    if (languageZipData) return languageZipData;
    try {
      const dataPath = path.join(__dirname, 'data', 'demographics', 'languages_zip.json');
      if (fs.existsSync(dataPath)) {
        languageZipData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
        console.log(`Loaded language ZIP data for ${languageZipData!.length} ZIP codes`);
      }
    } catch (err) {
      console.error('Error loading language ZIP data:', err);
    }
    return languageZipData || [];
  }
  
  app.get('/api/languages-zip/:zipCode', async (req, res) => {
    const zipCode = req.params.zipCode;
    if (!zipCode || !/^\d{5}$/.test(zipCode)) {
      return res.status(400).json({ message: "Valid 5-digit ZIP code required" });
    }
    
    const data = loadLanguageZipData();
    const zipData = data.find((d: any) => d.zipCode === zipCode);
    
    if (!zipData) {
      return res.status(404).json({ message: "No language data available for this ZIP code" });
    }
    
    res.json(zipData);
  });

  // === ENHANCED CHILDCARE DATA ===
  
  let childcareEnhancedData: any[] | null = null;
  
  function loadChildcareEnhancedData(): any[] {
    if (childcareEnhancedData) return childcareEnhancedData;
    try {
      const dataPath = path.join(__dirname, 'data', 'demographics', 'childcare_enhanced.json');
      if (fs.existsSync(dataPath)) {
        childcareEnhancedData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
        console.log(`Loaded enhanced childcare data for ${childcareEnhancedData?.length || 0} community areas`);
      }
    } catch (err) {
      console.error('Error loading enhanced childcare data:', err);
    }
    return childcareEnhancedData || [];
  }
  
  app.get('/api/childcare-enhanced/:communityArea', async (req, res) => {
    const communityArea = decodeURIComponent(req.params.communityArea);
    if (!communityArea) {
      return res.status(400).json({ message: "Community area name required" });
    }
    
    const data = loadChildcareEnhancedData();
    const areaData = data.find((d: any) => 
      d.communityArea.toLowerCase() === communityArea.toLowerCase() ||
      d.communityArea.toUpperCase() === communityArea.toUpperCase()
    );
    
    if (!areaData) {
      return res.status(404).json({ message: "No enhanced childcare data available for this community area" });
    }
    
    const accessRecords = await Promise.all(data.map(async (record: any) => {
      const access = await getCommunityAreaChildcareAccess(record.communityArea);
      return { communityArea: record.communityArea, childrenUnder5: access?.childrenUnder5 ?? null };
    }));
    const rankingData = alignChildcareChildrenUnder5(data, accessRecords, "communityArea");
    const comparison = getChildcareEnhancedRanks(rankingData, areaData, "communityArea");
    res.json({ ...areaData, ...comparison });
  });

  // ZIP-level enhanced childcare data
  let childcareEnhancedZipData: any[] | null = null;
  
  function loadChildcareEnhancedZipData(): any[] {
    if (childcareEnhancedZipData) return childcareEnhancedZipData;
    try {
      const dataPath = path.join(__dirname, 'data', 'demographics', 'childcare_enhanced_zip.json');
      if (fs.existsSync(dataPath)) {
        childcareEnhancedZipData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
        console.log(`Loaded enhanced childcare data for ${childcareEnhancedZipData?.length || 0} ZIP codes`);
      }
    } catch (err) {
      console.error('Error loading ZIP enhanced childcare data:', err);
    }
    return childcareEnhancedZipData || [];
  }
  
  app.get('/api/childcare-enhanced-zip/:zipCode', async (req, res) => {
    const zipCode = req.params.zipCode?.padStart(5, '0');
    if (!zipCode) {
      return res.status(400).json({ message: "ZIP code required" });
    }
    
    const data = loadChildcareEnhancedZipData();
    const zipData = data.find((d: any) => d.zipCode === zipCode);
    
    if (!zipData) {
      return res.status(404).json({ message: "No enhanced childcare data available for this ZIP code" });
    }
    
    const comparison = getChildcareEnhancedRanks(data, zipData, "zipCode");
    res.json({ ...zipData, ...comparison });
  });

  // === ELECTION DATA ===
  
  let electionData: any = null;
  
  function loadElectionData() {
    if (electionData) return electionData;
    try {
      const electionPath = path.join(__dirname, 'data', 'elections', 'community_area_elections.json');
      if (fs.existsSync(electionPath)) {
        electionData = JSON.parse(fs.readFileSync(electionPath, 'utf-8'));
        console.log(`Loaded election data for ${Object.keys(electionData.community_areas || {}).length} community areas`);
      }
    } catch (err) {
      console.error('Error loading election data:', err);
    }
    return electionData;
  }
  
  app.get('/api/elections/:communityArea', async (req, res) => {
    const communityArea = decodeURIComponent(req.params.communityArea).toUpperCase();
    if (!communityArea) {
      return res.status(400).json({ message: "Community area name required" });
    }
    
    const data = loadElectionData();
    if (!data || !data.community_areas) {
      return res.status(500).json({ message: "Election data not available" });
    }
    
    const areaData = data.community_areas[communityArea];
    if (!areaData) {
      return res.status(404).json({ message: "No election data available for this community area" });
    }
    
    res.json({
      ...areaData,
      data_sources: data.data_sources,
      notes: data.notes,
      last_updated: data.last_updated
    });
  });

  // === HMDA MORTGAGE DATA ===

  const hmdaCache: Record<string, { byTract: Record<string, any> | null; byCommunity: Record<string, any> | null }> = {};

  function loadHmdaYear(year: number) {
    const key = String(year);
    if (hmdaCache[key]) return;
    hmdaCache[key] = { byTract: null, byCommunity: null };
    const suffix = year === 2024 ? '' : `_${year}`;
    const tractPath = path.join(__dirname, 'data', `hmda_by_tract${suffix}.json`);
    if (fs.existsSync(tractPath)) {
      hmdaCache[key].byTract = JSON.parse(fs.readFileSync(tractPath, 'utf-8'));
      console.log(`Loaded ${year} HMDA tract data for ${Object.keys(hmdaCache[key].byTract!).length} tracts`);
    }
    const caPath = path.join(__dirname, 'data', `hmda_by_community${suffix}.json`);
    if (fs.existsSync(caPath)) {
      hmdaCache[key].byCommunity = JSON.parse(fs.readFileSync(caPath, 'utf-8'));
      console.log(`Loaded ${year} HMDA community data for ${Object.keys(hmdaCache[key].byCommunity!).length} community areas`);
    }
  }

  function getHmdaForLocation(year: number, tract?: string, communityArea?: string) {
    loadHmdaYear(year);
    const d = hmdaCache[String(year)];
    if (!d) return { tract: null, community: null };
    const tractStats = tract ? (d.byTract?.[tract] || null) : null;
    const communityStats = communityArea ? (d.byCommunity?.[communityArea.toUpperCase()] || null) : null;
    return { tract: tractStats, community: communityStats };
  }

  let hmdaRatesByTract: Record<string, any> | null = null;
  let hmdaRatesByCommunity: Record<string, any> | null = null;

  function loadHmdaRates() {
    if (hmdaRatesByTract) return;
    try {
      const tractPath = path.join(__dirname, 'data', 'hmda_rates_by_tract.json');
      if (fs.existsSync(tractPath)) {
        hmdaRatesByTract = JSON.parse(fs.readFileSync(tractPath, 'utf-8'));
        console.log(`Loaded HMDA rates for ${Object.keys(hmdaRatesByTract!).length} tracts`);
      }
      const caPath = path.join(__dirname, 'data', 'hmda_rates_by_community.json');
      if (fs.existsSync(caPath)) {
        hmdaRatesByCommunity = JSON.parse(fs.readFileSync(caPath, 'utf-8'));
        console.log(`Loaded HMDA rates for ${Object.keys(hmdaRatesByCommunity!).length} community areas`);
      }
    } catch (err) {
      console.error('Failed to load HMDA rate files:', err);
    }
  }

  function getCommunityRankings(year: number, communityArea: string) {
    loadHmdaYear(year);
    const d = hmdaCache[String(year)];
    if (!d?.byCommunity) return null;
    const caKey = communityArea.toUpperCase();
    return getHmdaRankings(d.byCommunity, caKey, 'Chicago community areas');
  }

  let hmdaTractCommunityMap: Record<string, string> | null | undefined;

  function getTractRankings(year: number, tract: string) {
    loadHmdaYear(year);
    const d = hmdaCache[String(year)];
    if (!d?.byTract) return null;

    if (hmdaTractCommunityMap === undefined) {
      const mapPath = path.join(__dirname, 'data', 'hmda_tract_community_map.json');
      hmdaTractCommunityMap = fs.existsSync(mapPath)
        ? JSON.parse(fs.readFileSync(mapPath, 'utf-8'))
        : null;
    }
    if (!hmdaTractCommunityMap) return null;

    return getHmdaRankings(
      d.byTract,
      tract,
      'HMDA tracts mapped to Chicago community areas',
      new Set(Object.keys(hmdaTractCommunityMap)),
    );
  }

  app.get('/api/hmda-stats', async (req, res) => {
    const tract = req.query.tract as string | undefined;
    const communityArea = req.query.communityArea as string | undefined;

    if (!tract && !communityArea) {
      return res.status(400).json({ message: "tract or communityArea query param required" });
    }

    const data2025 = getHmdaForLocation(2025, tract, communityArea);
    const data2024 = getHmdaForLocation(2024, tract, communityArea);
    const data2023 = getHmdaForLocation(2023, tract, communityArea);

    if (!data2025.tract && !data2025.community && !data2024.tract && !data2024.community && !data2023.tract && !data2023.community) {
      return res.status(404).json({ message: "No HMDA data available for this location" });
    }

    const rank2025 = communityArea ? getCommunityRankings(2025, communityArea) : null;
    const rank2024 = communityArea ? getCommunityRankings(2024, communityArea) : null;
    const rank2023 = communityArea ? getCommunityRankings(2023, communityArea) : null;
    const tractRank2025 = tract ? getTractRankings(2025, tract) : null;
    const tractRank2024 = tract ? getTractRankings(2024, tract) : null;
    const tractRank2023 = tract ? getTractRankings(2023, tract) : null;

    loadHmdaRates();
    const tractRates = tract ? (hmdaRatesByTract?.[tract] || null) : null;
    const communityRates = communityArea ? (hmdaRatesByCommunity?.[communityArea.toUpperCase()] || null) : null;

    res.json({
      2025: { ...data2025, communityRank: rank2025, tractRank: tractRank2025 },
      2024: { ...data2024, communityRank: rank2024, tractRank: tractRank2024 },
      2023: { ...data2023, communityRank: rank2023, tractRank: tractRank2023 },
      rates: { tract: tractRates, community: communityRates },
    });
  });

  // === SBA COMMERCIAL LOANS ===

  app.get('/api/sba-loans', async (req, res) => {
    const zip = (req.query.zip as string || '').trim();
    if (!zip || !/^\d{5}$/.test(zip)) {
      return res.status(400).json({ message: "Valid 5-digit ZIP code required" });
    }
    try {
      const data = await getSBALoans(zip);
      if (!data) return res.status(404).json({ message: "No SBA data available" });
      res.json(data);
    } catch (err) {
      console.error('[SBA] Error:', err);
      res.status(500).json({ message: "Error fetching SBA loan data" });
    }
  });

  app.get('/api/discovery/commercial-lender-rankings', async (req, res) => {
    try {
      const data = await getCookCountyCommercialLenders();
      res.json(data);
    } catch (err) {
      console.error('[SBA City] Error:', err);
      res.status(500).json({ message: "Error fetching commercial lender data" });
    }
  });

  // === ETHNIC MORTGAGE TRENDS ===

  app.get('/api/ethnic-mortgage-trends', (req, res) => {
    loadHmdaYear(2025);
    loadHmdaYear(2024);
    const d2025 = hmdaCache['2025'];
    const d2024 = hmdaCache['2024'];
    if (!d2025?.byCommunity && !d2024?.byCommunity) {
      return res.status(503).json({ message: 'HMDA data not loaded' });
    }

    const toTitle = (s: string) =>
      s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

    const RACE_GROUPS = [
      'Asian',
      'Black or African American',
      'White',
      'Hispanic or Latino',
      'American Indian or Alaska Native',
      'Native Hawaiian or Other Pacific Islander',
      '2 or more minority races',
    ];

    function getCount(
      communityData: Record<string, any>,
      area: string,
      group: string,
      field: 'byRace' | 'byEthnicity',
      subStats?: 'originated' | null,
    ): number {
      const ca = communityData[area];
      if (!ca) return 0;
      const source = subStats ? ca[subStats] : ca;
      const arr: { key: string; count: number }[] = source?.[field] || [];
      return arr.find(r => r.key === group)?.count ?? 0;
    }

    const allAreas = new Set([
      ...Object.keys(d2025?.byCommunity ?? {}),
      ...Object.keys(d2024?.byCommunity ?? {}),
    ]);

    const groups = RACE_GROUPS.map(groupLabel => {
      const isEthnicity = groupLabel === 'Hispanic or Latino';
      const field = isEthnicity ? 'byEthnicity' : 'byRace';
      const com25 = d2025?.byCommunity ?? {};
      const com24 = d2024?.byCommunity ?? {};

      const areaStats = [...allAreas].map(area => {
        const apps2025 = getCount(com25, area, groupLabel, field);
        const apps2024 = getCount(com24, area, groupLabel, field);
        const closed2025 = getCount(com25, area, groupLabel, field, 'originated');
        const closed2024 = getCount(com24, area, groupLabel, field, 'originated');
        return {
          area: toTitle(area),
          apps2025,
          apps2024,
          appsCombined: apps2025 + apps2024,
          closed2025,
          closed2024,
          closedCombined: closed2025 + closed2024,
        };
      });

      const byApplications = [...areaStats]
        .sort((a, b) => b.appsCombined - a.appsCombined)
        .filter(a => a.appsCombined > 0)
        .slice(0, 15)
        .map((a, i) => ({ rank: i + 1, ...a }));

      const byOriginated = [...areaStats]
        .sort((a, b) => b.closedCombined - a.closedCombined)
        .filter(a => a.closedCombined > 0)
        .slice(0, 15)
        .map((a, i) => ({ rank: i + 1, ...a }));

      return { key: groupLabel, label: groupLabel, byApplications, byOriginated };
    });

    res.json({ groups });
  });

  // === FAIR MARKET RENT (HUD FY2026) ===
  
  let fmrData: Record<string, { efficiency: number; oneBed: number; twoBed: number; threeBed: number; fourBed: number }> | null = null;
  let fmrRankings: Record<string, { rank: number; total: number; percentile: number }> | null = null;
  
  function loadFmrData() {
    if (fmrData) return fmrData;
    try {
      const dataPath = path.join(__dirname, 'data', 'chicago_fmr.json');
      if (fs.existsSync(dataPath)) {
        fmrData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
        
        const entries = Object.entries(fmrData!).map(([zip, d]) => ({
          zip,
          twoBed: d.twoBed
        }));
        entries.sort((a, b) => b.twoBed - a.twoBed);
        
        fmrRankings = {};
        const total = entries.length;
        entries.forEach((entry, index) => {
          fmrRankings![entry.zip] = {
            rank: index + 1,
            total,
            percentile: Math.round(((total - index) / total) * 100)
          };
        });
        
        console.log(`Loaded FMR data for ${Object.keys(fmrData!).length} Chicago ZIP codes`);
      }
    } catch (err) {
      console.error('Error loading FMR data:', err);
    }
    return fmrData;
  }
  
  app.get('/api/fmr/:zipCode', async (req, res) => {
    const zipCode = req.params.zipCode;
    if (!zipCode || !/^\d{5}$/.test(zipCode)) {
      return res.status(400).json({ message: "Valid 5-digit ZIP code required" });
    }
    
    const data = loadFmrData();
    if (!data || !data[zipCode]) {
      return res.status(404).json({ message: "No FMR data available for this ZIP code" });
    }
    
    const zipData = data[zipCode];
    const ranking = fmrRankings?.[zipCode] || null;
    
    const allTwoBed = Object.values(data).map(d => d.twoBed);
    const median = allTwoBed.sort((a, b) => a - b)[Math.floor(allTwoBed.length / 2)];
    const min = Math.min(...allTwoBed);
    const max = Math.max(...allTwoBed);
    
    res.json({
      zipCode,
      fiscalYear: 2026,
      rents: zipData,
      ranking,
      cityStats: { median, min, max, totalZips: Object.keys(data).length }
    });
  });

  // === CTA L RIDERSHIP DATA ===

  // Clear in-memory caches when ridership files are refreshed on disk
  const { onRidershipRefresh } = await import('./ridershipRefresh.js');
  onRidershipRefresh(() => {
    ctaRidershipData = null;
    ctaBusRidershipData = null;
    console.log('[ridership] In-memory cache cleared — will reload from updated files');
  });

  // Register data-refresh callbacks for other in-memory caches
  const { onRefresh } = await import('./dataRefresh.js');
  onRefresh('grocery', () => {
    resetGroceryCache();
  });
  onRefresh('capacity', () => {
    capacityCcaData = null;
    capacityZipData = null;
    console.log('[data-refresh] Childcare capacity cache cleared — will reload from updated files');
  });
  const { clearSBACache } = await import('./sbaLoans.js');
  onRefresh('sba', () => {
    clearSBACache();
  });
  onRefresh('zba', async () => {
    const { clearCache: clearZbaCache } = await import('./zba/index');
    clearZbaCache();
    console.log('[data-refresh] ZBA summary cache cleared — rankings will reload from rebuilt index');
  });

  let ctaRidershipData: Record<string, { name: string; stationId: string; months: Record<string, { weekday: number; saturday: number; sunday: number; total: number }> }> | null = null;
  
  function loadCtaRidership() {
    if (ctaRidershipData) return ctaRidershipData;
    try {
      const dataPath = path.join(__dirname, 'data', 'cta_ridership.json');
      if (fs.existsSync(dataPath)) {
        ctaRidershipData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
        console.log(`Loaded CTA ridership data for ${Object.keys(ctaRidershipData!).length} stations`);
      }
    } catch (err) {
      console.error('Error loading CTA ridership data:', err);
    }
    return ctaRidershipData;
  }
  
  const LINE_TO_BRANCHES: Record<string, string[]> = {
    'Blue Line': ["O'Hare", "Forest Park"],
    'Brown Line': ['Brown'],
    'Green Line': ['Lake', 'South Elevated'],
    'Orange Line': ['Orange'],
    'Pink Line': ['Cermak'],
    'Red Line': ['Dan Ryan', 'North Main'],
    'Purple Line': ['North Main', 'Evanston'],
    'Yellow Line': ['Skokie'],
  };
  
  const BRANCH_SUFFIXES = ['Brown', 'Lake', 'Forest Park', "O'Hare", 'Dan Ryan', 'South Elevated', 'Cermak', 'Orange', 'North Main', 'Evanston', 'Skokie', 'Midway', 'Milwaukee'];
  
  function matchStationToRidership(stationName: string, routes: string[], gtfsStationId?: string): { stationId: string; name: string; months: Record<string, any> }[] {
    const data = loadCtaRidership();
    if (!data) return [];
    
    if (gtfsStationId && data[gtfsStationId]) {
      return [data[gtfsStationId]];
    }
    
    const allStations = Object.values(data);
    
    const exactMatch = allStations.filter(s => s.name.toLowerCase() === stationName.toLowerCase());
    if (exactMatch.length > 0) return exactMatch;
    
    const branchHints: string[] = [];
    for (const route of routes) {
      const branches = LINE_TO_BRANCHES[route];
      if (branches) branchHints.push(...branches);
    }
    
    let baseName = stationName;
    for (const suffix of BRANCH_SUFFIXES) {
      const pattern = new RegExp('-' + suffix.replace(/'/g, "'") + '$', 'i');
      if (pattern.test(stationName)) {
        baseName = stationName.replace(pattern, '').trim();
        break;
      }
    }
    
    const candidates = allStations.filter(s => {
      let sBase = s.name;
      for (const suffix of BRANCH_SUFFIXES) {
        const pattern = new RegExp('-' + suffix.replace(/'/g, "'") + '$', 'i');
        if (pattern.test(s.name)) {
          sBase = s.name.replace(pattern, '').trim();
          break;
        }
      }
      return sBase.toLowerCase() === baseName.toLowerCase();
    });
    
    if (candidates.length === 0) {
      const fuzzy = allStations.filter(s => 
        s.name.toLowerCase().includes(baseName.toLowerCase()) || 
        baseName.toLowerCase().includes(s.name.toLowerCase())
      );
      return fuzzy.slice(0, 1);
    }
    
    if (candidates.length === 1 || branchHints.length === 0) return candidates;
    
    const branchMatched = candidates.filter(s => 
      branchHints.some(hint => s.name.toLowerCase().includes(hint.toLowerCase()))
    );
    return branchMatched.length > 0 ? branchMatched : candidates;
  }
  
  app.post('/api/cta-ridership', async (req, res) => {
    try {
      const { stationName, routes, stationId: gtfsStationId, stations: stationsArray } = req.body;
      
      const data = loadCtaRidership();
      if (!data) {
        return res.status(500).json({ message: "CTA ridership data not available" });
      }
      
      let matches: any[] = [];
      const routesByStationId: Record<string, string[]> = {};
      if (stationsArray && Array.isArray(stationsArray)) {
        const seenIds = new Set<string>();
        for (const s of stationsArray) {
          const stationMatches = matchStationToRidership(s.stopName, s.routes || [], s.stationId);
          for (const m of stationMatches) {
            if (!seenIds.has(m.stationId)) {
              seenIds.add(m.stationId);
              matches.push(m);
              if (Array.isArray(s.routes) && s.routes.length) routesByStationId[m.stationId] = s.routes;
            }
          }
        }
      } else if (stationName) {
        matches = matchStationToRidership(stationName, routes || [], gtfsStationId);
        if (Array.isArray(routes) && routes.length) {
          for (const m of matches) routesByStationId[m.stationId] = routes;
        }
      } else {
        return res.status(400).json({ message: "stationName or stations array is required" });
      }
      if (matches.length === 0) {
        return res.status(404).json({ message: "No ridership data found for this station" });
      }
      
      const allStations = Object.values(data);
      const allMonths = Array.from(new Set(allStations.flatMap(s => Object.keys(s.months)))).sort();
      const latestMonth = allMonths[allMonths.length - 1];
      const monthsAvailable = allMonths.slice(-36);
      
      const stationResults = matches.map(station => {
        const latestData = station.months[latestMonth];
        
        let weekdayRank = 0;
        let totalStationsRanked = 0;
        if (latestData) {
          const allLatest = allStations
            .map(s => ({ name: s.name, weekday: s.months[latestMonth]?.weekday || 0 }))
            .filter(s => s.weekday > 0)
            .sort((a, b) => b.weekday - a.weekday);
          totalStationsRanked = allLatest.length;
          weekdayRank = allLatest.findIndex(s => s.name === station.name) + 1;
        }
        
        const recentMonths = monthsAvailable.filter(m => station.months[m]);
        const first12 = recentMonths.slice(0, 12);
        const last12 = recentMonths.slice(-12);
        
        let trendPct: number | null = null;
        if (first12.length >= 3 && last12.length >= 3) {
          const earlyAvg = first12.reduce((sum, m) => sum + (station.months[m]?.weekday || 0), 0) / first12.length;
          const lateAvg = last12.reduce((sum, m) => sum + (station.months[m]?.weekday || 0), 0) / last12.length;
          if (earlyAvg > 0) {
            trendPct = Math.round(((lateAvg - earlyAvg) / earlyAvg) * 1000) / 10;
          }
        }
        
        const monthlyData = monthsAvailable.map(m => ({
          month: m,
          weekday: station.months[m]?.weekday || 0,
          saturday: station.months[m]?.saturday || 0,
          sunday: station.months[m]?.sunday || 0,
          total: station.months[m]?.total || 0,
        })).filter(m => m.weekday > 0 || m.total > 0);

        const latestMonthNum = parseInt(latestMonth.slice(5, 7));
        const samePeriodTotals: Record<string, number> = {};
        const yearlyTotals: Record<string, number> = {};
        for (const [mk, md] of Object.entries(station.months as Record<string, any>)) {
          const yr = mk.slice(0, 4);
          const mo = parseInt(mk.slice(5, 7));
          yearlyTotals[yr] = (yearlyTotals[yr] || 0) + ((md as any).total || 0);
          if (mo <= latestMonthNum) {
            samePeriodTotals[yr] = (samePeriodTotals[yr] || 0) + ((md as any).total || 0);
          }
        }

        return {
          stationName: station.name,
          stationId: station.stationId,
          routes: routesByStationId[station.stationId] || [],
          latestMonth,
          latest: latestData || null,
          weekdayRank,
          totalStationsRanked,
          trendPct,
          monthlyData,
          yearlyTotals,
          samePeriodTotals,
        };
      });
      
      const allLatestWeekday = allStations
        .map(s => s.months[latestMonth]?.weekday || 0)
        .filter(v => v > 0)
        .sort((a, b) => a - b);
      const systemMedian = allLatestWeekday[Math.floor(allLatestWeekday.length / 2)] || 0;
      const systemAvg = Math.round(allLatestWeekday.reduce((a, b) => a + b, 0) / allLatestWeekday.length);
      
      res.json({
        stations: stationResults,
        systemStats: {
          median: systemMedian,
          average: systemAvg,
          totalStations: allLatestWeekday.length,
          latestMonth,
        }
      });
    } catch (err) {
      console.error('CTA ridership lookup error:', err);
      res.status(500).json({ message: "Error looking up CTA ridership data" });
    }
  });

  // === CTA CITY-WIDE RIDERSHIP RANKINGS ===

  function countDayTypes(yearMonth: string): { weekdays: number; saturdays: number; sundays: number } {
    const [y, m] = yearMonth.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    let weekdays = 0, saturdays = 0, sundays = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const dow = new Date(y, m - 1, d).getDay();
      if (dow === 0) sundays++;
      else if (dow === 6) saturdays++;
      else weekdays++;
    }
    return { weekdays, saturdays, sundays };
  }

  app.get('/api/cta-ridership/city-rankings', async (_req, res) => {
    try {
      const data = loadCtaRidership();
      if (!data) return res.status(500).json({ message: 'CTA ridership data not available' });

      const years = ['2022', '2023', '2024', '2025', '2026'];

      // Compute annual totals per station per year
      const stationYearTotals: { stationId: string; name: string; totals: Record<string, number>; weekdayTotals: Record<string, number>; weekendTotals: Record<string, number>; monthCounts: Record<string, number> }[] = [];

      for (const [stationId, station] of Object.entries(data)) {
        const totals: Record<string, number> = {};
        const weekdayTotals: Record<string, number> = {};
        const weekendTotals: Record<string, number> = {};
        const monthCounts: Record<string, number> = {};
        for (const year of years) {
          const monthEntries = Object.entries(station.months).filter(([k]) => k.startsWith(year));
          totals[year] = monthEntries.reduce((sum, [, v]) => sum + v.total, 0);
          monthCounts[year] = monthEntries.length;
          let wdTotal = 0, weTotal = 0;
          for (const [ym, v] of monthEntries) {
            const { weekdays, saturdays, sundays } = countDayTypes(ym);
            wdTotal += v.weekday * weekdays;
            weTotal += v.saturday * saturdays + v.sunday * sundays;
          }
          weekdayTotals[year] = Math.round(wdTotal);
          weekendTotals[year] = Math.round(weTotal);
        }
        stationYearTotals.push({ stationId, name: station.name, totals, weekdayTotals, weekendTotals, monthCounts });
      }

      type StationRow = { rank: number; stationId: string; name: string; total: number; weekdayTotal: number; weekendTotal: number; months: number };
      type YearBucket = { total: StationRow[]; weekday: StationRow[]; weekend: StationRow[] };

      function makeRows(pool: typeof stationYearTotals, year: string, sortKey: 'totals' | 'weekdayTotals' | 'weekendTotals', minMonths: number): StationRow[] {
        return pool
          .filter(s => s.monthCounts[year] >= minMonths)
          .sort((a, b) => b[sortKey][year] - a[sortKey][year])
          .map((s, i) => ({ rank: i + 1, stationId: s.stationId, name: s.name, total: s.totals[year], weekdayTotal: s.weekdayTotals[year], weekendTotal: s.weekendTotals[year], months: s.monthCounts[year] }));
      }

      // Entries tab — only show full years and current YTD years
      const entryYears = ['2023', '2024', '2025', '2026'];
      const byYear: Record<string, YearBucket> = {};
      for (const year of entryYears) {
        const minMonths = (year === '2025' || year === '2026') ? 1 : 10;
        byYear[year] = {
          total:   makeRows(stationYearTotals, year, 'totals', minMonths),
          weekday: makeRows(stationYearTotals, year, 'weekdayTotals', minMonths),
          weekend: makeRows(stationYearTotals, year, 'weekendTotals', minMonths),
        };
      }

      // Growth — selectable year pairs (all adjacent full-year combos)
      type GrowthRow = { stationId: string; name: string; totalFrom: number; totalTo: number; pctChange: number };
      type GrowthSlices = { gains: GrowthRow[]; declines: GrowthRow[] };
      type GrowthPairResult = { total: GrowthSlices; weekday: GrowthSlices; weekend: GrowthSlices; yearFrom: string; yearTo: string };

      const growthPairs: Array<[string, string]> = [['2022', '2023'], ['2023', '2024'], ['2024', '2025']];

      function makeGrowthForPair(yearFrom: string, yearTo: string, key: 'totals' | 'weekdayTotals' | 'weekendTotals'): GrowthSlices {
        const base = stationYearTotals.filter(s => s.monthCounts[yearFrom] >= 10 && s.monthCounts[yearTo] >= 10);
        const rows: GrowthRow[] = base
          .filter(s => s[key][yearFrom] > 0)
          .map(s => ({
            stationId: s.stationId,
            name: s.name,
            totalFrom: s[key][yearFrom],
            totalTo: s[key][yearTo],
            pctChange: ((s[key][yearTo] - s[key][yearFrom]) / s[key][yearFrom]) * 100,
          }))
          .sort((a, b) => b.pctChange - a.pctChange);
        return { gains: rows.filter(r => r.pctChange > 0), declines: [...rows].reverse().filter(r => r.pctChange < 0) };
      }

      const byGrowthPairs: Record<string, GrowthPairResult> = {};
      for (const [yearFrom, yearTo] of growthPairs) {
        const key = `${yearFrom}-${yearTo}`;
        byGrowthPairs[key] = {
          total:   makeGrowthForPair(yearFrom, yearTo, 'totals'),
          weekday: makeGrowthForPair(yearFrom, yearTo, 'weekdayTotals'),
          weekend: makeGrowthForPair(yearFrom, yearTo, 'weekendTotals'),
          yearFrom,
          yearTo,
        };
      }

      res.json({
        byYear,
        byGrowthPairs,
        years: entryYears,
        growthPairKeys: growthPairs.map(([f, t]) => `${f}-${t}`),
      });
    } catch (err) {
      console.error('CTA city rankings error:', err);
      res.status(500).json({ message: 'Error computing CTA rankings' });
    }
  });

  // === CTA BUS RIDERSHIP DATA ===
  
  let ctaBusRidershipData: Record<string, { route: string; routeName: string; months: Record<string, { weekday: number; saturday: number; sunday: number; total: number }> }> | null = null;
  
  function loadCtaBusRidership() {
    if (ctaBusRidershipData) return ctaBusRidershipData;
    try {
      const dataPath = path.join(__dirname, 'data', 'cta_bus_ridership.json');
      if (fs.existsSync(dataPath)) {
        ctaBusRidershipData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
        console.log(`Loaded CTA bus ridership data for ${Object.keys(ctaBusRidershipData!).length} routes`);
      }
    } catch (err) {
      console.error('Error loading CTA bus ridership data:', err);
    }
    return ctaBusRidershipData;
  }
  
  app.post('/api/cta-bus-ridership', async (req, res) => {
    try {
      const { routes } = req.body;
      if (!routes || !Array.isArray(routes) || routes.length === 0) {
        return res.status(400).json({ message: "routes array is required" });
      }
      
      const data = loadCtaBusRidership();
      if (!data) {
        return res.status(500).json({ message: "CTA bus ridership data not available" });
      }
      
      const allRoutes = Object.values(data);
      const allMonths = Array.from(new Set(allRoutes.flatMap(r => Object.keys(r.months)))).sort();
      const latestMonth = allMonths[allMonths.length - 1];
      const monthsAvailable = allMonths.slice(-36);
      
      const matchedRoutes: any[] = [];
      for (const routeInput of routes) {
        const match = routeInput.match(/^(X?\d+[A-Z]?)/i);
        const routeNum = match ? match[1].toUpperCase() : routeInput;
        
        const routeData = data[routeNum];
        if (!routeData) continue;
        
        const latestData = routeData.months[latestMonth];
        
        let weekdayRank = 0;
        let totalRoutesRanked = 0;
        if (latestData) {
          const allLatest = allRoutes
            .map(r => ({ route: r.route, routeName: r.routeName, weekday: r.months[latestMonth]?.weekday || 0 }))
            .filter(r => r.weekday > 0)
            .sort((a, b) => b.weekday - a.weekday);
          totalRoutesRanked = allLatest.length;
          weekdayRank = allLatest.findIndex(r => r.route === routeData.route) + 1;
        }
        
        const recentMonths = monthsAvailable.filter(m => routeData.months[m]);
        const first12 = recentMonths.slice(0, 12);
        const last12 = recentMonths.slice(-12);
        
        let trendPct: number | null = null;
        if (first12.length >= 3 && last12.length >= 3) {
          const earlyAvg = first12.reduce((sum, m) => sum + (routeData.months[m]?.weekday || 0), 0) / first12.length;
          const lateAvg = last12.reduce((sum, m) => sum + (routeData.months[m]?.weekday || 0), 0) / last12.length;
          if (earlyAvg > 0) {
            trendPct = Math.round(((lateAvg - earlyAvg) / earlyAvg) * 1000) / 10;
          }
        }
        
        const monthlyData = monthsAvailable.map(m => ({
          month: m,
          weekday: routeData.months[m]?.weekday || 0,
          saturday: routeData.months[m]?.saturday || 0,
          sunday: routeData.months[m]?.sunday || 0,
          total: routeData.months[m]?.total || 0,
        })).filter(m => m.weekday > 0 || m.total > 0);
        
        matchedRoutes.push({
          route: routeData.route,
          routeName: routeData.routeName,
          latestMonth,
          latest: latestData || null,
          weekdayRank,
          totalRoutesRanked,
          trendPct,
          monthlyData,
        });
      }
      
      if (matchedRoutes.length === 0) {
        return res.status(404).json({ message: "No ridership data found for these routes" });
      }
      
      const allLatestWeekday = allRoutes
        .map(r => r.months[latestMonth]?.weekday || 0)
        .filter(v => v > 0)
        .sort((a, b) => a - b);
      const systemMedian = allLatestWeekday[Math.floor(allLatestWeekday.length / 2)] || 0;
      const systemAvg = Math.round(allLatestWeekday.reduce((a, b) => a + b, 0) / allLatestWeekday.length);
      
      res.json({
        routes: matchedRoutes,
        systemStats: {
          median: Math.round(systemMedian * 10) / 10,
          average: Math.round(systemAvg * 10) / 10,
          totalRoutes: allLatestWeekday.length,
          latestMonth,
        }
      });
    } catch (err) {
      console.error('CTA bus ridership lookup error:', err);
      res.status(500).json({ message: "Error looking up CTA bus ridership data" });
    }
  });

  // === METRA RIDERSHIP ===

  let metraRidershipData: { meta: any; stations: any[]; byName: Record<string, any> } | null = null;

  function loadMetraRidership() {
    if (metraRidershipData) return metraRidershipData;
    try {
      const dataPath = path.join(__dirname, 'data', 'metra_ridership.json');
      if (fs.existsSync(dataPath)) {
        metraRidershipData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
        console.log(`Loaded Metra ridership data for ${metraRidershipData!.stations.length} stations`);
      }
    } catch (err) {
      console.error('Error loading Metra ridership data:', err);
    }
    return metraRidershipData;
  }

  // GTFS stopName -> RTAMS survey station name, for stops that normalization alone
  // cannot resolve (ambiguous base names disambiguated by the line each GTFS stop serves,
  // plus renamed/compound labels). Built from server/data/gtfs/metra_stops_processed.json.
  const METRA_GTFS_ALIASES: Record<string, string> = {
    'Western Ave': 'Western Avenue (Grand)',            // MD-N/MD-W/NCS
    'Western Avenue': 'Western Avenue (18th)',          // BNSF
    'Main St.': 'Main Street (Evanston)',               // UP-N
    'Downers Grove': 'Main Street (Downers Grove)',     // BNSF
    'Orland Park 179th': '179th Street (Orland Park)',
    'Orland Park 153rd': '153rd Street (Orland Park)',
    'Orland Park 143rd': '143rd Street (Orland Park)',
    'Oak Lawn Patriot': 'Oak Lawn',
    'Evanston (Davis St.)': 'Davis Street (Evanston)',
    'Lake-Cook': 'Lake Cook Road',
    'Glen/N. Glenview': 'North Glenview',
    'Big Timber': 'Big Timber Road',
    'Tinley-80th': '80th Avenue (Tinley Park)',
    '51st/53rd St. (Hyde Park)': '53rd Street (Hyde Park)',
    '91st St.': '91st Street (Chesterfield)',           // Metra Electric
    '95th St.': '95th Street (Chicago State University)', // Metra Electric
    '111th St. (Pullman)': '111th Street',              // Metra Electric
    'South Chicago (93rd)': '93rd Street (South Chicago)',
    'Blue Island-Vermont': 'Blue Island (Vermont Street)',
    '95th St.-Longwood': 'Longwood (95th Street)',
    '103rd St.-Washington Hts.': 'Washington Heights',
    '91st St. - Beverly Hills': '91st Street (Beverly Hills)',
    '95th St. - Beverly Hills': '95th Street (Beverly Hills)',
    '99th St. - Beverly Hills': '99th Street (Beverly Hills)',
    '103rd St. - Beverly Hills': '103rd Street (Beverly Hills)',
    '107th St. - Beverly Hills': '107th Street (Beverly Hills)',
    '111th St. - Morgan Park': '111th Street (Morgan Park)',
    '115th St. - Morgan Park': '115th Street (Morgan Park)',
    'Ashland': 'Ashland Avenue',                        // Metra Electric
    'Racine': 'Racine Avenue',                          // Metra Electric
    'Chicago Union Station': 'Union Station',
    'Chicago OTC': 'Ogilvie Transportation Center',
    'Franklin Pk': 'Franklin Park',
    // 'Ravinia Park' (seasonal) and 'Peterson/Ridge' (opened 2024) have no 2018 survey entry.
  };

  app.get('/api/metra-ridership', async (req, res) => {
    const stationName = req.query.station as string;
    if (!stationName) return res.status(400).json({ message: 'station query param required' });
    try {
      const data = loadMetraRidership();
      if (!data) return res.status(503).json({ message: 'Metra ridership data not available' });
      const key = stationName.trim();
      let entry = data.byName[key] || data.byName[key.toLowerCase()];
      let matchedName = entry ? key : null;
      // Explicit alias for GTFS names that normalization cannot resolve
      if (!entry && METRA_GTFS_ALIASES[key]) {
        const aliasName = METRA_GTFS_ALIASES[key];
        entry = data.byName[aliasName];
        if (entry) matchedName = aliasName;
      }
      // Fuzzy: normalize GTFS vs survey naming ("Western Ave" vs "Western Avenue (Grand)")
      if (!entry) {
        const normalize = (n: string) => n
          .toLowerCase()
          .replace(/\s+station$/, '')
          .replace(/\bave\.?(?=\s|$)/g, 'avenue')
          .replace(/\bst\.?(?=\s|$)/g, 'street')
          .replace(/\brd\.?(?=\s|$)/g, 'road')
          .replace(/\bhts\.?(?=\s|$)/g, 'heights')
          .replace(/\bmt\.?(?=\s|$)/g, 'mount')
          .replace(/[^a-z0-9()]+/g, ' ')
          .trim();
        const parenOf = (n: string) => { const m = n.match(/\(([^)]*)\)/); return m ? m[1].trim() : null; };
        const stripParen = (n: string) => n.replace(/\s*\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
        const qNorm = normalize(key);
        const qBase = stripParen(qNorm);
        const qHint = parenOf(qNorm);
        // 1) exact normalized match (including parenthetical)
        let candidates = data.stations.filter(s => normalize(s.name) === qNorm);
        // 2) match on base name ignoring parentheticals
        if (candidates.length === 0) {
          candidates = data.stations.filter(s => stripParen(normalize(s.name)) === qBase);
        }
        // 3) disambiguate multiple candidates by parenthetical hint only; if still
        // ambiguous, fall through to 404 rather than guess the wrong physical station
        if (candidates.length > 1) {
          const hinted = qHint ? candidates.filter(s => (parenOf(normalize(s.name)) || '').includes(qHint)) : [];
          candidates = hinted.length === 1 ? hinted : [];
        }
        if (candidates.length === 1) {
          entry = data.byName[candidates[0].name];
          matchedName = candidates[0].name;
        }
      }
      if (!entry) return res.status(404).json({ message: 'Station not found', stationName: key });
      res.json({ stationName: matchedName || key, ...entry });
    } catch (err) {
      console.error('Metra ridership lookup error:', err);
      res.status(500).json({ message: 'Error looking up Metra ridership data' });
    }
  });

  // === METRA LINE-LEVEL MONTHLY RIDERSHIP (RTAMS, refreshed monthly) ===

  let metraLineRidershipData: {
    meta: any;
    lines: Record<string, { year: number; month: number; rides: number }[]>;
    zonePairsMonthly: Record<string, Record<string, number>>;
    stationZones: Record<string, number>;
    stationZonesById: Record<string, number>;
  } | null = null;

  function loadMetraLineRidership() {
    if (metraLineRidershipData) return metraLineRidershipData;
    try {
      const dataPath = path.join(__dirname, 'data', 'metra_line_ridership.json');
      if (fs.existsSync(dataPath)) {
        metraLineRidershipData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
        console.log(`Loaded Metra line ridership data for ${Object.keys(metraLineRidershipData!.lines).length} lines through ${metraLineRidershipData!.meta.updatedThrough}`);
      }
    } catch (err) {
      console.error('Error loading Metra line ridership data:', err);
    }
    return metraLineRidershipData;
  }

  app.get('/api/metra-line-ridership', async (_req, res) => {
    try {
      const data = loadMetraLineRidership();
      if (!data) return res.status(503).json({ message: 'Metra line ridership data not available' });

      const MONTHS_BACK = 25; // 24-month trend + current
      const lines = Object.entries(data.lines).map(([name, series]) => {
        const sorted = series; // already sorted ascending at generation time
        const latest = sorted[sorted.length - 1];
        const prevYearSame = sorted.find(r => r.year === latest.year - 1 && r.month === latest.month);
        const yoyPct = prevYearSame && prevYearSame.rides > 0
          ? Math.round(((latest.rides - prevYearSame.rides) / prevYearSame.rides) * 1000) / 10
          : null;
        return {
          name,
          latest,
          yoyPct,
          monthly: sorted.slice(-MONTHS_BACK).map(r => ({ month: `${r.year}-${String(r.month).padStart(2, '0')}`, rides: r.rides })),
        };
      });

      // Latest month's systemwide zone-pair flows (unordered pairs, e.g. "1 to 2")
      const zoneMonths = Object.keys(data.zonePairsMonthly).sort();
      const latestZoneMonth = zoneMonths[zoneMonths.length - 1];

      res.json({
        meta: data.meta,
        lines,
        stationZones: data.stationZones,
        stationZonesById: data.stationZonesById || {},
        zoneFlows: latestZoneMonth ? { month: latestZoneMonth, pairs: data.zonePairsMonthly[latestZoneMonth] } : null,
      });
    } catch (err) {
      console.error('Metra line ridership error:', err);
      res.status(500).json({ message: 'Error loading Metra line ridership data' });
    }
  });

  // === STREET TRAFFIC COUNT ===

  // In-memory cache for city-wide segment rankings (refreshed every 6 hours)
  let trafficRankCache: { rankedSegments: { segmentId: string; avgCount: number }[]; cachedAt: number } | null = null;

  async function getTrafficCityRankings(): Promise<{ segmentId: string; avgCount: number }[]> {
    const SIX_HOURS = 6 * 60 * 60 * 1000;
    if (trafficRankCache && Date.now() - trafficRankCache.cachedAt < SIX_HOURS) {
      return trafficRankCache.rankedSegments;
    }
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const url = `https://data.cityofchicago.org/resource/gc7y-n4xa.json?$select=segmentid,avg(vehiclecount)%20as%20avg_count&$group=segmentid&$where=timestamp>='${thirtyDaysAgo}T00:00:00.000'&$limit=5000&$order=avg_count%20DESC`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!resp.ok) throw new Error('Traffic ranking fetch failed');
    const rows: any[] = await resp.json();
    const ranked = rows.map(r => ({ segmentId: r.segmentid, avgCount: parseFloat(r.avg_count) || 0 }));
    trafficRankCache = { rankedSegments: ranked, cachedAt: Date.now() };
    return ranked;
  }

  function haversineFt(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 20902231; // Earth radius in feet
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  app.get('/api/traffic-count', async (req, res) => {
    const lat = parseFloat(req.query.lat as string);
    const lon = parseFloat(req.query.lon as string);
    if (isNaN(lat) || isNaN(lon)) return res.status(400).json({ error: 'lat and lon required' });

    try {
      const delta = 0.012; // ~0.75 mile bounding box
      // Look back up to 30 days so we always have data (dataset updates nightly, not real-time)
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      const cutoffStr = cutoff.toISOString().split('T')[0];
      const nearbyUrl = `https://data.cityofchicago.org/resource/gc7y-n4xa.json?$where=timestamp>='${cutoffStr}T00:00:00.000'%20AND%20midpointlat%20between%20${lat - delta}%20and%20${lat + delta}%20AND%20midpointlon%20between%20${lon - delta}%20and%20${lon + delta}&$order=timestamp%20DESC&$limit=200`;
      const nearbyResp = await fetch(nearbyUrl, { signal: AbortSignal.timeout(10000) });
      if (!nearbyResp.ok) throw new Error('Traffic nearby fetch failed');
      const nearby: any[] = await nearbyResp.json();

      if (!nearby.length) return res.json(null);

      // Deduplicate by segmentid — keep only most recent reading per segment
      const latestBySegment = new Map<string, any>();
      for (const seg of nearby) {
        const existing = latestBySegment.get(seg.segmentid);
        if (!existing || seg.timestamp > existing.timestamp) latestBySegment.set(seg.segmentid, seg);
      }
      const deduped = Array.from(latestBySegment.values());

      // Pick nearest segment by haversine distance
      let nearest: any = null;
      let nearestDist = Infinity;
      for (const seg of deduped) {
        const d = haversineFt(lat, lon, parseFloat(seg.midpointlat), parseFloat(seg.midpointlon));
        if (d < nearestDist) { nearestDist = d; nearest = seg; }
      }

      // Yearly averages for this segment
      const yearlyUrl = `https://data.cityofchicago.org/resource/gc7y-n4xa.json?$select=date_extract_y(timestamp)%20as%20year,avg(vehiclecount)%20as%20avg_count&$where=segmentid='${nearest.segmentid}'&$group=year&$order=year%20ASC`;
      const yearlyResp = await fetch(yearlyUrl, { signal: AbortSignal.timeout(10000) });
      const yearlyRaw: any[] = yearlyResp.ok ? await yearlyResp.json() : [];
      const yearlyAverages = yearlyRaw
        .map(r => ({ year: parseInt(r.year), avgCount: Math.round(parseFloat(r.avg_count)) }))
        .filter(r => !isNaN(r.year) && r.avgCount > 0);

      // City-wide ranking
      let cityRank = 0;
      let cityTotal = 0;
      let percentile = 0;
      try {
        const rankings = await getTrafficCityRankings();
        cityTotal = rankings.length;
        const idx = rankings.findIndex(r => r.segmentId === nearest.segmentid);
        if (idx >= 0) {
          cityRank = idx + 1; // 1 = highest traffic
          percentile = Math.round(((cityTotal - idx) / cityTotal) * 100);
        }
      } catch (_) {}

      // Trend from first to last full year
      let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
      if (yearlyAverages.length >= 2) {
        const first = yearlyAverages[0].avgCount;
        const last = yearlyAverages[yearlyAverages.length - 1].avgCount;
        const changePct = ((last - first) / first) * 100;
        if (changePct >= 5) trend = 'increasing';
        else if (changePct <= -5) trend = 'decreasing';
      }

      res.json({
        segmentId: nearest.segmentid,
        roadName: nearest.roadname,
        direction: nearest.direction,
        fromSegment: nearest.fromsegment,
        toSegment: nearest.tosegment,
        distanceFt: Math.round(nearestDist),
        latestCount: parseInt(nearest.vehiclecount) || 0,
        latestDate: nearest.timestamp?.split('T')[0] ?? null,
        cityRank,
        cityTotal,
        percentile,
        trend,
        yearlyAverages,
      });
    } catch (err: any) {
      console.error('[traffic-count]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // === BUILDING PERMITS & VIOLATIONS ===

  app.get('/api/permits', async (req, res) => {
    const address = req.query.address as string;
    if (!address) {
      return res.status(400).json({ message: "Address required" });
    }
    
    try {
      const data = await fetchPermitHistory(address);
      res.json(data);
    } catch (error) {
      console.error('Error fetching permits:', error);
      res.status(500).json({ message: "Failed to fetch permit history" });
    }
  });

  app.get('/api/business-license-history', async (req, res) => {
    const address = req.query.address as string;
    if (!address) return res.status(400).json({ message: 'Address required' });
    try {
      const { getBusinessLicenseHistory } = await import('./businessLicenses.js');
      const result = await getBusinessLicenseHistory(address);
      res.json(result);
    } catch (err: any) {
      console.error('[business-license-history]', err.message);
      res.json({ records: [], totalCount: 0, found: false });
    }
  });

  app.get('/api/sidewalk-cafe', async (req, res) => {
    const address = req.query.address as string;
    if (!address) return res.status(400).json({ message: "Address required" });
    try {
      // Strip city/state/zip and normalize
      const firstLine = address.split(',')[0].toUpperCase().replace(/\./g, '').trim();
      // Parse: "1638 W CHICAGO AVE" → num=1638, dir=W, street=CHICAGO
      const m = firstLine.match(/^(\d+)\s+([NSEW]{1,2})?\s*(.+?)(?:\s+(?:AVE|AVENUE|BLVD|BOULEVARD|CT|COURT|DR|DRIVE|LN|LANE|PKWY|PARKWAY|PL|PLACE|RD|ROAD|ST|STREET|TER|TERRACE|WAY|EXPY|HWY|LOOP))?$/);
      if (!m) return res.json({ permits: [], found: false });
      const num = m[1];
      const dir = m[2] || null;
      const street = m[3].replace(/\s+(AVE|AVENUE|BLVD|BOULEVARD|CT|COURT|DR|DRIVE|LN|LANE|PKWY|PARKWAY|PL|PLACE|RD|ROAD|ST|STREET|TER|TERRACE|WAY|EXPY|HWY|LOOP)$/, '').trim();
      const where = [`address_number='${num}'`, `upper(street)='${street}'`];
      if (dir) where.push(`upper(street_direction)='${dir}'`);
      const params = new URLSearchParams({ '$where': where.join(' AND '), '$limit': '10', '$order': 'issued_date DESC' });
      const url = `https://data.cityofchicago.org/resource/qnjv-hj2q.json?${params}`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const data = await resp.json() as any[];
      const today = new Date();
      const permits = data.map((p: any) => ({
        permitNumber: p.permit_number,
        legalName: p.legal_name,
        doingBusinessAs: p.doing_business_as_name,
        issuedDate: p.issued_date,
        expirationDate: p.expiration_date,
        address: p.address,
        isActive: p.expiration_date ? new Date(p.expiration_date) >= today : false,
      }));
      res.json({ permits, found: permits.length > 0 });
    } catch (err: any) {
      console.error('[sidewalk-cafe]', err.message);
      res.json({ permits: [], found: false });
    }
  });

  app.get('/api/violations', async (req, res) => {
    const address = req.query.address as string;
    if (!address) {
      return res.status(400).json({ message: "Address required" });
    }
    
    try {
      const data = await fetchViolationHistory(address);
      res.json(data);
    } catch (error) {
      console.error('Error fetching violations:', error);
      res.status(500).json({ message: "Failed to fetch violation history" });
    }
  });

  // Fetch permits/violations for all associated addresses (when property has multiple PINs)
  app.post('/api/permits-violations-combined', async (req, res) => {
    const { primaryAddress, associatedPins, city } = req.body;
    
    if (!primaryAddress) {
      return res.status(400).json({ message: "Primary address required" });
    }
    
    try {
      // Philadelphia: use L&I via CARTO instead of Chicago building APIs
      const { detectCityFromAddress } = await import('./philly/cityDetect.js');
      const resolvedCity = city || detectCityFromAddress(primaryAddress);

      if (resolvedCity === 'philadelphia') {
        const { fetchPhillyPermitsAndViolations } = await import('./philly/phillyPermits.js');
        const { permitsData, violationsData } = await fetchPhillyPermitsAndViolations(primaryAddress);
        return res.json({ permitsData, violationsData });
      }

      // Get all unique addresses for the property
      let addresses = [primaryAddress];
      
      if (associatedPins && Array.isArray(associatedPins) && associatedPins.length > 0) {
        console.log(`[COMBINED LOOKUP] Looking up addresses for ${associatedPins.length} associated PINs`);
        addresses = await getAssociatedAddresses(primaryAddress, associatedPins);
        console.log(`[COMBINED LOOKUP] Found ${addresses.length} unique addresses:`, addresses);
      }
      
      // Fetch permits and violations for all addresses in parallel
      const permitPromises = addresses.map(addr => fetchPermitHistory(addr));
      const violationPromises = addresses.map(addr => fetchViolationHistory(addr));
      
      const [permitResults, violationResults] = await Promise.all([
        Promise.all(permitPromises),
        Promise.all(violationPromises),
      ]);
      
      // Combine results with deduplication by ID
      const seenPermitIds = new Set<string>();
      const seenOlderPermitIds = new Set<string>();
      const seenViolationIds = new Set<string>();
      const seenOlderViolationIds = new Set<string>();

      const combinedPermits = {
        totalPermits: 0,
        mostRecent: null as any,
        byType: { newConstruction: 0, renovation: 0, repair: 0, demolition: 0, other: 0 },
        totalEstimatedCost: 0,
        expiredOrIncomplete: 0,
        permits: [] as any[],
        addressBreakdown: {} as Record<string, { count: number; totalCost: number }>,
        olderPermitsSummary: null as { count: number; earliestYear: number; latestYear: number; totalEstimatedCost: number } | null,
        olderPermits: [] as any[],
      };
      
      const combinedViolations = {
        openViolations: 0,
        totalViolationsLast5Years: 0,
        violationsByType: {} as Record<string, number>,
        statusBreakdown: { open: 0, complied: 0, other: 0 },
        violations: [] as any[],
        addressBreakdown: {} as Record<string, { open: number; total: number }>,
        olderViolationsSummary: null as { count: number; earliestYear: number; latestYear: number; hasRepeatPattern: boolean; message: string } | null,
        olderViolations: [] as any[],
      };
      
      // Merge permit results with deduplication
      for (let i = 0; i < addresses.length; i++) {
        const addr = addresses[i];
        const permits = permitResults[i];
        
        if (permits && !permits.parseError && !permits.apiError) {
          let newRecentCount = 0;
          let newRecentCost = 0;
          let newExpired = 0;
          const newByType = { newConstruction: 0, renovation: 0, repair: 0, demolition: 0, other: 0 };

          for (const permit of permits.permits) {
            const permitKey = permit.id || permit.permitNumber || `${permit.issueDate}-${permit.permitType}-${permit.streetNumber}`;
            if (seenPermitIds.has(permitKey)) continue;
            seenPermitIds.add(permitKey);
            combinedPermits.permits.push({ ...permit, sourceAddress: addr });
            newRecentCount++;
            if (permit.estimatedCost) newRecentCost += permit.estimatedCost;
            const status = (permit.status || '').toLowerCase();
            if (status.includes('expired') || status.includes('revoked') || status.includes('void')) {
              newExpired++;
            }
            const category = categorizePermitType(permit.permitType, permit.workDescription);
            newByType[category]++;
          }

          combinedPermits.totalPermits += newRecentCount;
          combinedPermits.totalEstimatedCost += newRecentCost;
          combinedPermits.expiredOrIncomplete += newExpired;
          combinedPermits.byType.newConstruction += newByType.newConstruction;
          combinedPermits.byType.renovation += newByType.renovation;
          combinedPermits.byType.repair += newByType.repair;
          combinedPermits.byType.demolition += newByType.demolition;
          combinedPermits.byType.other += newByType.other;
          
          combinedPermits.addressBreakdown[addr] = {
            count: newRecentCount,
            totalCost: newRecentCost,
          };
          
          if (permits.mostRecent) {
            if (!combinedPermits.mostRecent || 
                new Date(permits.mostRecent.date) > new Date(combinedPermits.mostRecent.date)) {
              combinedPermits.mostRecent = permits.mostRecent;
            }
          }
          
          let newOlderCount = 0;
          let newOlderCost = 0;
          if (permits.olderPermits && permits.olderPermits.length > 0) {
            for (const permit of permits.olderPermits) {
              const permitKey = permit.id || permit.permitNumber || `${permit.issueDate}-${permit.permitType}-${permit.streetNumber}`;
              if (seenOlderPermitIds.has(permitKey)) continue;
              seenOlderPermitIds.add(permitKey);
              combinedPermits.olderPermits.push({ ...permit, sourceAddress: addr });
              newOlderCount++;
              if (permit.estimatedCost) newOlderCost += permit.estimatedCost;
            }
          }

          if (newOlderCount > 0) {
            const years = combinedPermits.olderPermits.map((p: any) => new Date(p.issueDate).getFullYear()).filter((y: number) => !isNaN(y));
            combinedPermits.olderPermitsSummary = {
              count: combinedPermits.olderPermits.length,
              earliestYear: Math.min(...years),
              latestYear: Math.max(...years),
              totalEstimatedCost: combinedPermits.olderPermits.reduce((sum: number, p: any) => sum + (p.estimatedCost || 0), 0),
            };
          }
        }
      }
      
      // Merge violation results with deduplication
      for (let i = 0; i < addresses.length; i++) {
        const addr = addresses[i];
        const violations = violationResults[i];
        
        if (violations && !violations.parseError && !violations.apiError) {
          let newRecentCount = 0;
          let newOpen = 0;
          let newComplied = 0;
          let newOther = 0;
          const newByType: Record<string, number> = {};

          for (const violation of violations.violations) {
            const violKey = violation.id || `${violation.violationDate}-${violation.violationCode}-${violation.streetNumber}`;
            if (seenViolationIds.has(violKey)) continue;
            seenViolationIds.add(violKey);
            combinedViolations.violations.push({ ...violation, sourceAddress: addr });
            newRecentCount++;
            const status = (violation.violationStatus || '').toLowerCase();
            if (status.includes('open')) newOpen++;
            else if (status.includes('compl')) newComplied++;
            else newOther++;
            const desc = violation.violationDescription || 'Other';
            newByType[desc] = (newByType[desc] || 0) + 1;
          }

          combinedViolations.totalViolationsLast5Years += newRecentCount;
          combinedViolations.openViolations += newOpen;
          combinedViolations.statusBreakdown.open += newOpen;
          combinedViolations.statusBreakdown.complied += newComplied;
          combinedViolations.statusBreakdown.other += newOther;
          
          for (const [type, count] of Object.entries(newByType)) {
            combinedViolations.violationsByType[type] = 
              (combinedViolations.violationsByType[type] || 0) + count;
          }
          
          combinedViolations.addressBreakdown[addr] = {
            open: newOpen,
            total: newRecentCount,
          };
          
          if (violations.olderViolations && violations.olderViolations.length > 0) {
            for (const violation of violations.olderViolations) {
              const violKey = violation.id || `${violation.violationDate}-${violation.violationCode}-${violation.streetNumber}`;
              if (seenOlderViolationIds.has(violKey)) continue;
              seenOlderViolationIds.add(violKey);
              combinedViolations.olderViolations.push({ ...violation, sourceAddress: addr });
            }
          }

          if (combinedViolations.olderViolations.length > 0) {
            const years = combinedViolations.olderViolations.map((v: any) => new Date(v.violationDate).getFullYear()).filter((y: number) => !isNaN(y));
            const hasRepeat = combinedViolations.olderViolations.length >= 5;
            const summary = {
              count: combinedViolations.olderViolations.length,
              earliestYear: Math.min(...years),
              latestYear: Math.max(...years),
              hasRepeatPattern: hasRepeat,
              message: '',
            };
            summary.message = hasRepeat
              ? `${summary.count} records found across ${summary.earliestYear}–${summary.latestYear}, indicating repeated enforcement activity under prior ownership.`
              : `${summary.count} records found. These are commonly marked open in public datasets despite being resolved by DOB. No repeat patterns detected.`;
            combinedViolations.olderViolationsSummary = summary;
          }
        }
      }
      
      // If every per-address lookup failed, flag the result as an error so
      // consumers don't present zeros as a successful "no permits" lookup.
      if (addresses.length && permitResults.every((p: any) => !p || p.parseError || p.apiError)) {
        (combinedPermits as any).apiError = true;
      }
      if (addresses.length && violationResults.every((v: any) => !v || v.parseError || v.apiError)) {
        (combinedViolations as any).apiError = true;
      }

      // Sort permits and violations by date
      combinedPermits.permits.sort((a, b) => 
        new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime()
      );
      combinedViolations.violations.sort((a, b) => 
        new Date(b.violationDate).getTime() - new Date(a.violationDate).getTime()
      );
      combinedViolations.olderViolations.sort((a, b) => 
        new Date(b.violationDate).getTime() - new Date(a.violationDate).getTime()
      );
      combinedPermits.olderPermits.sort((a, b) => 
        new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime()
      );
      
      res.json({
        addresses,
        permits: combinedPermits,
        violations: combinedViolations,
      });
      
    } catch (error) {
      console.error('Error fetching combined permits/violations:', error);
      res.status(500).json({ message: "Failed to fetch combined permit/violation history" });
    }
  });

  // === CRIME STATISTICS ===
  
  app.get('/api/crime-stats', async (req, res) => {
    const lat = parseFloat(req.query.lat as string);
    const lng = parseFloat(req.query.lng as string);
    
    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ message: "Valid lat and lng required" });
    }
    
    try {
      // Fetch both 250 feet (~0.0473 miles) and 0.25 mile radius data
      const [nearbyData, quarterMileData] = await Promise.all([
        fetchCrimeStats(lat, lng, 0.0473),  // 250 feet in miles
        fetchCrimeStats(lat, lng, 0.25)      // 0.25 miles
      ]);
      
      res.json({
        nearby: {
          ...nearbyData,
          radius: '250 feet'
        },
        quarterMile: {
          ...quarterMileData,
          radius: '0.25 miles'
        }
      });
    } catch (error) {
      console.error('Error fetching crime stats:', error);
      res.status(500).json({ message: "Failed to fetch crime statistics" });
    }
  });

  // === CRIME TRACT RANKING ===

  app.get('/api/crime-tract-ranking', async (req, res) => {
    const communityArea = (req.query.communityArea || req.query.tract) as string;
    if (!communityArea || communityArea.length < 3) return res.status(400).json({ error: 'communityArea required' });
    try {
      const result = await fetchCrimeTractRanking(communityArea);
      if (!result) return res.status(503).json({ error: 'Could not fetch community area ranking' });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch crime ranking' });
    }
  });

  // === GROCERY STORE ACCESS ===

  app.get('/api/grocery/:zipCode', async (req, res) => {
    const zipCode = req.params.zipCode;
    if (!zipCode || !/^\d{5}$/.test(zipCode)) {
      return res.status(400).json({ message: "Valid 5-digit ZIP code required" });
    }
    
    // Optional lat/lon for distance calculation
    const lat = req.query.lat ? parseFloat(req.query.lat as string) : undefined;
    const lon = req.query.lon ? parseFloat(req.query.lon as string) : undefined;
    
    const data = getGroceryAccessByZip(zipCode, lat, lon);
    if (!data) {
      return res.status(404).json({ message: "No grocery data available for this ZIP code" });
    }
    
    res.json(data);
  });

  app.get('/api/grocery/community/:communityArea', async (req, res) => {
    const communityArea = decodeURIComponent(req.params.communityArea);
    if (!communityArea) {
      return res.status(400).json({ message: "Community area name required" });
    }
    
    // Optional lat/lon for distance calculation
    const lat = req.query.lat ? parseFloat(req.query.lat as string) : undefined;
    const lon = req.query.lon ? parseFloat(req.query.lon as string) : undefined;
    
    const data = getGroceryAccessByCommunityArea(communityArea, lat, lon);
    if (!data) {
      return res.status(404).json({ message: "No grocery data available for this community area" });
    }
    
    res.json(data);
  });

  // === SBIF ELIGIBILITY ===

  app.post('/api/sbif/check', async (req, res) => {
    try {
      const { tifName } = req.body;
      const result = await evaluateSbifEligibility(tifName);
      res.json(result);
    } catch (err) {
      console.error('SBIF check error:', err);
      res.status(500).json({ 
        message: "Failed to check SBIF eligibility",
        tif: { inTif: false, districtName: null },
        sbif: {
          authorized: false,
          status: 'unknown',
          statusLabel: 'Error checking eligibility',
          verificationUrl: 'https://somercor.com/sbif/',
          notes: 'An error occurred. Please verify manually on SomerCor website.',
        },
        lastUpdated: null,
      });
    }
  });

  // === NMTC ELIGIBILITY ===

  app.post('/api/nmtc/check', async (req, res) => {
    try {
      const { lat, lon } = req.body;
      
      if (typeof lat !== 'number' || typeof lon !== 'number') {
        return res.status(400).json({ message: "lat and lon are required as numbers" });
      }

      const result = await checkNmtcEligibility(lat, lon);
      res.json(result);
    } catch (err) {
      console.error('NMTC check error:', err);
      res.status(500).json({ 
        eligible: false,
        status: 'unknown',
        statusLabel: 'Error checking NMTC eligibility',
        source: 'CDFI Fund CIMS – 2016–2020 NMTC Qualified Census Tracts',
        verificationUrl: 'https://www.cdfifund.gov/programs-training/certification/nmtc/pages/mapping-system.aspx',
        lastChecked: new Date().toISOString()
      });
    }
  });

  // === SBA HUBZONE ===
  app.post('/api/hubzone/check', async (req, res) => {
    try {
      const { lat, lon } = req.body;
      if (typeof lat !== 'number' || typeof lon !== 'number') return res.status(400).json({ message: "lat and lon required" });
      const result = await checkHubZoneEligibility(lat, lon);
      res.json(result);
    } catch (err) {
      console.error('[HUBZone] route error:', err);
      res.status(500).json({ eligible: false, zoneName: null, source: "SBA HUBZone Certification Map", lastChecked: new Date().toISOString() });
    }
  });

  // === HUD QUALIFIED CENSUS TRACT (QCT) ===
  app.post('/api/qct/check', async (req, res) => {
    try {
      const { lat, lon } = req.body;
      if (typeof lat !== 'number' || typeof lon !== 'number') return res.status(400).json({ message: "lat and lon required" });
      const result = await checkQctEligibility(lat, lon);
      res.json(result);
    } catch (err) {
      console.error('[QCT] route error:', err);
      res.status(500).json({ eligible: false, tractFips: null, source: "HUD Qualified Census Tracts", lastChecked: new Date().toISOString() });
    }
  });

  // === CHA OPPORTUNITY AREA ===
  app.post('/api/cha-opportunity/check', async (req, res) => {
    try {
      const { tractFips } = req.body;
      if (!tractFips || typeof tractFips !== 'string') return res.status(400).json({ message: "tractFips required" });
      const result = await checkChaOpportunityArea(tractFips);
      res.json(result);
    } catch (err) {
      console.error('[CHA Opportunity] route error:', err);
      res.status(500).json({ isOpportunityArea: false, povertyRate: null, tractFips: null, source: "ACS 5-Year Estimates", lastChecked: new Date().toISOString() });
    }
  });

  // === LOCATION INCENTIVES (Industrial Corridors, Enterprise Zones, etc.) ===
  app.post('/api/location-incentives/check', async (req, res) => {
    try {
      const { lat, lon } = req.body;
      if (typeof lat !== 'number' || typeof lon !== 'number') {
        return res.status(400).json({ message: "lat and lon are required as numbers" });
      }
      const result = await checkLocationIncentives(lat, lon);
      res.json(result);
    } catch (err) {
      console.error('Location incentives check error:', err);
      res.status(500).json({ message: 'Error checking location incentives' });
    }
  });

  // === MICRO-MARKET RECOVERY PROGRAM (MMRP) ELIGIBILITY ===
  
  // Cache for MMRP zone data
  let mmrpZonesCache: { data: any; timestamp: number } | null = null;
  const MMRP_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

  async function getMmrpZones() {
    const now = Date.now();
    if (mmrpZonesCache && (now - mmrpZonesCache.timestamp) < MMRP_CACHE_TTL) {
      return mmrpZonesCache.data;
    }

    try {
      const response = await fetch('https://data.cityofchicago.org/resource/d3i8-zirn.json');
      if (!response.ok) {
        throw new Error(`MMRP API returned ${response.status}`);
      }
      const data = await response.json();
      mmrpZonesCache = { data, timestamp: now };
      return data;
    } catch (err) {
      console.error('Error fetching MMRP zones:', err);
      // Return cached data if available, even if stale
      if (mmrpZonesCache) {
        return mmrpZonesCache.data;
      }
      throw err;
    }
  }

  app.post('/api/mmrp/check', async (req, res) => {
    try {
      const { lat, lon } = req.body;
      
      if (typeof lat !== 'number' || typeof lon !== 'number') {
        return res.status(400).json({ message: "lat and lon are required as numbers" });
      }

      const zones = await getMmrpZones();
      const point = turf.point([lon, lat]);
      
      // Check if point is within any MMRP zone
      for (const zone of zones) {
        if (zone.the_geom && zone.the_geom.coordinates) {
          try {
            // Create a GeoJSON feature from the zone geometry
            const zoneFeature = turf.multiPolygon(zone.the_geom.coordinates);
            if (turf.booleanPointInPolygon(point, zoneFeature)) {
              return res.json({
                inMmrpZone: true,
                zoneName: zone.name || 'Unknown',
                zoneType: zone.type || 'Unknown',
                source: 'Chicago Data Portal - Micro-Market Recovery Program',
                description: 'The City of Chicago launched the Micro-Market Recovery Program (MMRP), a coordinated effort among the City, not-for-profit intermediaries, and non-profit and for-profit capital sources to improve conditions, strengthen property values, and create environments supportive of private investment in targeted markets throughout the city.',
                benefits: [
                  'Strategic deployment of public and private capital',
                  'Access to specialized tools and resources',
                  'Support for property value improvement',
                  'Coordinated assistance from non-profit intermediaries',
                  'Targeted investment in well-defined micro-markets'
                ],
                learnMoreUrl: 'https://www.chicago.gov/city/en/depts/doh/provdrs/lenders/svcs/micro-market-recovery-program.html'
              });
            }
          } catch (geoErr) {
            // Skip zones with invalid geometry
            console.warn(`Invalid geometry for MMRP zone ${zone.name}:`, geoErr);
          }
        }
      }

      // Not in any MMRP zone
      res.json({
        inMmrpZone: false,
        zoneName: null,
        zoneType: null,
        source: 'Chicago Data Portal - Micro-Market Recovery Program',
        description: null,
        benefits: null,
        learnMoreUrl: 'https://www.chicago.gov/city/en/depts/doh/provdrs/lenders/svcs/micro-market-recovery-program.html'
      });
    } catch (err) {
      console.error('MMRP check error:', err);
      res.status(500).json({ 
        inMmrpZone: false,
        zoneName: null,
        zoneType: null,
        source: 'Chicago Data Portal - Micro-Market Recovery Program',
        error: 'Unable to check MMRP eligibility',
        learnMoreUrl: 'https://www.chicago.gov/city/en/depts/doh/provdrs/lenders/svcs/micro-market-recovery-program.html'
      });
    }
  });

  // === LANDMARK STATUS ===

  app.post('/api/landmark-status', async (req, res) => {
    try {
      const { lat, lon, address, additionalAddresses } = req.body;
      
      if (typeof lat !== 'number' || typeof lon !== 'number') {
        return res.status(400).json({ message: "lat and lon are required as numbers" });
      }

      // Check primary parcel first
      const primaryResult = await checkLandmarkStatus(lat, lon, address);
      if (primaryResult.isLandmark) {
        return res.json(primaryResult);
      }

      // If primary is not a landmark, check co-parcel addresses
      if (Array.isArray(additionalAddresses) && additionalAddresses.length > 0) {
        for (const coAddr of additionalAddresses) {
          if (!coAddr || typeof coAddr !== 'string') continue;
          // 1. Try geocode cache for full local-GeoJSON check
          const cached = await storage.getGeocode(coAddr.toLowerCase().trim());
          if (cached) {
            const coLat = parseFloat(cached.lat);
            const coLon = parseFloat(cached.lon);
            if (!isNaN(coLat) && !isNaN(coLon)) {
              const coResult = await checkLandmarkStatus(coLat, coLon, coAddr);
              if (coResult.isLandmark) {
                console.log(`[LANDMARK] Co-parcel landmark found via geocode cache: ${coAddr}`);
                return res.json({ ...coResult, foundOnCoParcel: coAddr });
              }
            }
          }
          // 2. Fallback: city address-based API (no lat/lon needed)
          const apiResult = await queryLandmarkAPI(coAddr);
          if (apiResult?.isLandmark) {
            console.log(`[LANDMARK] Co-parcel landmark found via city API: ${coAddr}`);
            return res.json({ ...apiResult, foundOnCoParcel: coAddr });
          }
        }
      }

      res.json(primaryResult);
    } catch (err) {
      console.error('Landmark status check error:', err);
      res.status(500).json({ 
        isLandmark: false,
        landmarkName: null,
        landmarkId: null,
        address: null,
        decade: null,
        designationDate: null,
        classId: null,
        className: null,
        error: 'Unable to check landmark status'
      });
    }
  });

  // === PROPERTY TAX ===

  app.post('/api/property-tax', async (req, res) => {
    try {
      const { pin, refresh, city, address } = req.body;
      
      if (!pin || typeof pin !== 'string') {
        return res.status(400).json({ message: "pin is required as a string" });
      }

      // Philadelphia: use OPA-based tax estimate instead of Cook County Treasurer
      const { detectCityFromAddress } = await import('./philly/cityDetect.js');
      const resolvedCity = city || (address ? detectCityFromAddress(address) : 'chicago');

      if (resolvedCity === 'philadelphia') {
        const { lookupOpaByParcelNumber } = await import('./philly/opaLookup.js');
        const { getPhillyPropertyTax } = await import('./philly/phillyTax.js');
        const opaData = await lookupOpaByParcelNumber(pin);
        const result = await getPhillyPropertyTax(pin, opaData?.market_value ? Number(opaData.market_value) : null, opaData);
        return res.json(result);
      }

      const normalizedPin = pin.replace(/[^0-9]/g, '');
      if (normalizedPin.length !== 14) {
        return res.status(400).json({ message: "PIN must be 14 digits" });
      }

      const timeoutMs = 25000;
      const result = await Promise.race([
        getPropertyTax(pin, { forceRefresh: refresh === true, address: address || undefined }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Property tax lookup timed out after ${timeoutMs}ms`)), timeoutMs)
        ),
      ]);
      res.json(result);
    } catch (err) {
      console.error('Property tax lookup error:', err);
      const normalizedPin = (req.body.pin || '').replace(/[^0-9]/g, '');
      res.status(500).json({ 
        pin: normalizedPin,
        taxYearMostRecent: null,
        totalAnnualTaxAmount: null,
        paymentStatus: null,
        taxYears: [],
        treasurerScrapedAt: null,
        treasurerBillUrl: `https://www.cookcountytreasurer.com/setsearchparameters.aspx?mode=PIN&searchpin=${normalizedPin}&isBusiness=false`,
        fetchedAt: new Date().toISOString(),
        isStale: true,
        source: 'cook_county_assessor',
        landSquareFeet: null,
        buildingSquareFeet: null,
        buildingType: null,
        buildingUse: null,
        apartments: null,
        basement: null,
        attic: null,
        yearBuilt: null,
        stories: null,
        propertyClass: null,
      });
    }
  });

  app.delete('/api/property-tax/cache', async (req, res) => {
    try {
      const count = await storage.clearTaxCache();
      res.json({ cleared: count });
    } catch (err) {
      console.error('Failed to clear tax cache:', err);
      res.status(500).json({ message: 'Failed to clear tax cache' });
    }
  });

  // === LIEN / RECORDER OF DEEDS ===

  app.post('/api/lien-search', async (req, res) => {
    try {
      const { pin, refresh, ownerName, city, address } = req.body;
      if (!pin || typeof pin !== 'string') {
        return res.status(400).json({ message: 'pin is required as a string' });
      }

      // Philadelphia: use OPA/RTT instead of Cook County Recorder
      const { detectCityFromAddress } = await import('./philly/cityDetect.js');
      const resolvedCity = city || (address ? detectCityFromAddress(address) : 'chicago');

      if (resolvedCity === 'philadelphia') {
        const { getPhillyLienData } = await import('./philly/phillyLiens.js');
        const result = await getPhillyLienData(pin, ownerName || null);
        return res.json(result);
      }

      const normalizedPin = pin.replace(/[^0-9]/g, '');
      if (normalizedPin.length !== 14) {
        return res.status(400).json({ message: 'PIN must be 14 digits' });
      }
      const cleanOwnerName = typeof ownerName === 'string' && ownerName.trim().length > 1
        ? ownerName.trim().toUpperCase()
        : null;
      const result = await getLienData(pin, { forceRefresh: refresh === true, ownerName: cleanOwnerName });
      res.json(result);
    } catch (err) {
      console.error('Lien search error:', err);
      const normalizedPin = (req.body.pin || '').replace(/[^0-9]/g, '');
      res.status(500).json({
        pin: normalizedPin,
        isStale: true,
        scrapedAt: null,
        fetchedAt: new Date().toISOString(),
        recorderUrl: `https://crs.cookcountyclerkil.gov/Search/ResultByPin?id1=${normalizedPin}`,
        documents: [],
        mortgages: [],
        liens: [],
        releases: [],
        deeds: [],
        foreclosures: [],
        other: [],
        activeLienCount: 0,
        activeMortgageCount: 0,
        activeListPendensCount: 0,
        waterDeptLienCount: 0,
        hasForeclosure: false,
        overallStatus: 'unknown',
        searchFailed: true,
        ownerName: null,
        ownerLiens: [],
        ownerLienScrapedAt: null,
        ownerLienIsStale: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // === DEBT SNAPSHOT (Stage 3) — resolved lien stack + AI takeaway from the SAME snap ===
  const debtSnapshotInFlight = new Set<string>();

  app.get('/api/debt-snapshot/:pin', async (req, res) => {
    try {
      const normalizedPin = String(req.params.pin || '').replace(/\D/g, '');
      if (normalizedPin.length !== 14) return res.status(400).json({ message: 'PIN must be 14 digits' });
      const { getCachedDebtSnapshot, assertCollateralEvidence } = await import('./debtSnapshot');
      const rec = await getCachedDebtSnapshot(normalizedPin);
      // Never serve pre-evidence parcel-scope claims from an older snapshot.
      // The report will rebuild it from the Recorder cache when authenticated.
      if (rec?.snap?.schema_version !== 4) return res.json(null);
      assertCollateralEvidence(rec.snap, normalizedPin);
      return res.json(rec);
    } catch (err) {
      console.error('[debtSnapshot] GET failed:', err);
      return res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/debt-snapshot', async (req, res) => {
    if (rejectCrossOrigin(req, res)) return;
    // Paid pipeline (recorder ingest + OCR + LLM) — signed-in users only,
    // cookie OR bearer (same pattern as loadOwnedRun), plus a global
    // concurrency cap so varied PINs can't amplify cost.
    let authUser = ((req as any).isAuthenticated?.() && (req as any).user) ? (req as any).user : null;
    if (!authUser) {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        const { resolveUserFromToken } = await import('./auth.js');
        authUser = await resolveUserFromToken(authHeader.slice(7).trim());
      }
    }
    if (!authUser) return res.status(401).json({ message: 'You must be signed in.' });
    const normalizedPin = String(req.body?.pin || '').replace(/\D/g, '');
    if (normalizedPin.length !== 14) return res.status(400).json({ message: 'PIN must be 14 digits' });
    if (debtSnapshotInFlight.size >= 2 && !debtSnapshotInFlight.has(normalizedPin)) {
      return res.status(429).json({ message: 'Debt snapshot builders are busy — try again shortly.' });
    }
    // Whitelisted report cross-references only (never debt facts): the report's
    // own estimated value + commercial flag, sanity-bounded. Everything else is
    // derived server-side from the recorder record.
    const rawVal = Number(req.body?.estimatedValue);
    const estimatedValue = Number.isFinite(rawVal) && rawVal >= 10_000 && rawVal <= 1_000_000_000 ? Math.round(rawVal) : null;
    const isCommercial = typeof req.body?.isCommercial === 'boolean' ? req.body.isCommercial : null;
    // Co-parcels for blanket detection: pins + values only (index-only server-side;
    // sibling docs are never scraped or OCR'd for this). Bounded to 20.
    const coParcels = Array.isArray(req.body?.coParcels)
      ? req.body.coParcels.slice(0, 20).map((c: any) => {
          const p = String(c?.pin || '').replace(/\D/g, '');
          const v = Number(c?.estimatedValue);
          return p.length === 14
            ? { pin: p, estimatedValue: Number.isFinite(v) && v >= 10_000 && v <= 1_000_000_000 ? Math.round(v) : null }
            : null;
        }).filter(Boolean) as Array<{ pin: string; estimatedValue: number | null }>
      : null;
    if (debtSnapshotInFlight.has(normalizedPin)) {
      return res.status(409).json({ message: 'Debt snapshot already building for this PIN.' });
    }
    debtSnapshotInFlight.add(normalizedPin);
    try {
      const { refreshDebtSnapshot } = await import('./debtSnapshot');
      const rec = await refreshDebtSnapshot(normalizedPin, { estimatedValue, isCommercial, coParcels });
      return res.json(rec);
    } catch (err) {
      console.error('[debtSnapshot] build failed:', err);
      return res.status(502).json({ message: err instanceof Error ? err.message : 'Debt snapshot build failed' });
    } finally {
      debtSnapshotInFlight.delete(normalizedPin);
    }
  });

  // Owner-name-only lien search — re-searches by a user-specified name without re-scraping property docs
  app.post('/api/lien-search/owner', async (req, res) => {
    try {
      const { pin, ownerName } = req.body;
      if (!pin || typeof pin !== 'string') return res.status(400).json({ message: 'pin is required' });
      if (!ownerName || typeof ownerName !== 'string' || ownerName.trim().length < 2) {
        return res.status(400).json({ message: 'ownerName is required (min 2 chars)' });
      }
      const normalizedPin = pin.replace(/[^0-9]/g, '');
      if (normalizedPin.length !== 14) return res.status(400).json({ message: 'PIN must be 14 digits' });
      const result = await searchOwnerLiensOnly(normalizedPin, ownerName);
      if (!result) return res.status(404).json({ message: 'No cached property data for this PIN — run a full lien search first' });
      res.json(result);
    } catch (err) {
      console.error('Owner lien search error:', err);
      res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  app.delete('/api/lien-search/cache', async (req, res) => {
    try {
      const count = await storage.clearLienCache();
      res.json({ cleared: count });
    } catch (err) {
      console.error('Failed to clear lien cache:', err);
      res.status(500).json({ message: 'Failed to clear lien cache' });
    }
  });

  // === PIN RESOLUTION ===

  app.post('/api/pins/resolve', async (req, res) => {
    try {
      const { address, lat, lon, city } = req.body;
      
      if (!address || typeof address !== 'string') {
        return res.status(400).json({ 
          pin: null,
          source: 'none',
          confidence: 'none',
          error: 'Address is required'
        });
      }

      const { detectCityFromAddress } = await import('./philly/cityDetect.js');
      const resolvedCity = city || detectCityFromAddress(address);

      if (resolvedCity === 'philadelphia') {
        const { lookupOpaProperty } = await import('./philly/opaLookup.js');
        const result = await lookupOpaProperty(address);
        if (!result) {
          return res.json({ pin: null, source: 'opa_philadelphia', confidence: 'none', error: 'Property not found in OPA' });
        }
        return res.json(result);
      }

      const result = await resolvePinFromAddress(
        address,
        typeof lat === 'number' ? lat : undefined,
        typeof lon === 'number' ? lon : undefined
      );
      
      res.json(result);
    } catch (err) {
      console.error('PIN resolution error:', err);
      res.status(500).json({ 
        pin: null,
        source: 'none',
        confidence: 'none',
        error: 'Failed to resolve PIN'
      });
    }
  });

  // === RELATED PARCELS (MULTI-PARCEL DETECTION) ===

  const relatedParcelsCache = new Map<string, { data: any[]; expires: number }>();

  app.post('/api/related-parcels', async (req, res) => {
    try {
      const { address, primaryPin, ownerName, primaryDocNos, legalDescriptionPins } = req.body;

      const hasLegalPins = Array.isArray(legalDescriptionPins) && legalDescriptionPins.length > 0;
      if (!address || !primaryPin || (!ownerName && !hasLegalPins)) {
        return res.json({ relatedParcels: [] });
      }

      const cleanPrimaryPin = primaryPin.replace(/[^0-9]/g, '');

      // Cache key includes whether legal pins are present so a later background scrape
      // (which adds legal pins) doesn't get served stale address-only cached results.
      const cacheKey = hasLegalPins
        ? `related_v2_legal_${cleanPrimaryPin}`
        : `related_v2_${cleanPrimaryPin}`;
      const cached = relatedParcelsCache.get(cacheKey);
      if (cached && cached.expires > Date.now()) {
        return res.json({ relatedParcels: cached.data, fromCache: true });
      }

      const ASSESSOR_API = 'https://datacatalog.cookcountyil.gov/resource/c49d-89sn.json';
      const SALE_HISTORY_API = 'https://datacatalog.cookcountyil.gov/resource/wvhk-k5uv.json';
      const SALE_HISTORY_ARCHIVED_API = 'https://datacatalog.cookcountyil.gov/resource/93st-4bxh.json';

      const fetchSaleHistoryForPin = async (cleanPin: string) => {
        try {
          const resp = await fetch(
            `${SALE_HISTORY_API}?pin=${cleanPin}&$order=sale_date DESC&$limit=5`,
            { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(5000) }
          );
          if (resp.ok) {
            const data = await resp.json();
            if (Array.isArray(data) && data.length > 0) return data;
          }
        } catch (_) {}
        try {
          const resp = await fetch(
            `${SALE_HISTORY_ARCHIVED_API}?pin=${cleanPin}&$order=sale_date DESC&$limit=5`,
            { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(5000) }
          );
          if (resp.ok) {
            const data = await resp.json();
            if (Array.isArray(data)) return data;
          }
        } catch (_) {}
        return [];
      };

      const _nowYear = new Date().getFullYear();
      const toSaleHistory = (rawSales: any[]) => rawSales.map((r: any) => ({
        saleDate: r.sale_date || '',
        salePrice: r.sale_price ? parseFloat(r.sale_price) : 0,
        sellerName: r.seller_name || '',
        buyerName: r.buyer_name || '',
        deedType: r.mydec_deed_type || r.deed_type || '',
        docNo: r.doc_no || '',
        year: r.year || '',
      })).filter((s: any) => {
        if (!s.saleDate) return true;
        return new Date(s.saleDate).getFullYear() <= _nowYear;
      });

      // Deduplicated result map keyed by PIN (legal description takes priority over address scan)
      const resultMap = new Map<string, any>();

      // === PATH 1: LEGAL DESCRIPTION PINs (recorder deed's co-parcel list) ===
      // Runs whenever the recorder scraper has extracted co-parcel PINs from the deed.
      // A legal description mention alone is NOT enough — the PIN must also share a doc_no
      // with the primary property in the Cook County sale history. Without this check,
      // boundary references in the deed text (e.g. "bounded on the north by Lot 11...")
      // produce false positives for entirely unrelated parcels.
      if (hasLegalPins) {
        const primaryDocSet = new Set<string>(
          Array.isArray(primaryDocNos) ? primaryDocNos.filter(Boolean) : []
        );
        const legalCoParcels = (legalDescriptionPins as any[]).filter(
          (p: any) => (p.pin || '').replace(/[^0-9]/g, '') !== cleanPrimaryPin
        );
        await Promise.all(
          legalCoParcels.map(async ({ pin, address: pinAddress }: any) => {
            const cleanPin = (pin || '').replace(/[^0-9]/g, '');
            if (!cleanPin) return;
            const rawSales = await fetchSaleHistoryForPin(cleanPin);
            // Only accept as a co-parcel if the candidate PIN's sale history
            // shares at least one doc_no with the primary property. A legal description
            // mention without a matching instrument number is just a boundary reference.
            const candidateDocNos = new Set(rawSales.map((s: any) => s.doc_no).filter(Boolean));
            const hasSharedInstrument = primaryDocSet.size > 0 && [...candidateDocNos].some(d => primaryDocSet.has(d));
            if (!hasSharedInstrument) {
              console.log(`[RELATED PARCELS] Skipping legal-desc PIN ${cleanPin} — no shared doc_no with primary (boundary reference only)`);
              return;
            }
            const adjacentOwner = rawSales[0]?.buyer_name || '';
            resultMap.set(cleanPin, {
              formattedAddress: pinAddress || '',
              pin: cleanPin.padEnd(14, '0'),
              ownerName: adjacentOwner,
              saleHistory: toSaleHistory(rawSales),
              matchReason: 'Same deed (Legal Description)',
            });
          })
        );
        console.log(`[RELATED PARCELS] Legal description path: found ${resultMap.size} co-parcels for ${cleanPrimaryPin}`);
      }

      // === PATH 2: ADDRESS PROXIMITY SCAN + OWNER NAME MATCHING ===
      // Always runs when ownerName is available (even alongside legal description results).
      // Catches same-owner adjacent parcels on separate deeds (e.g. 2525 + 2527 N Milwaukee).
      // First pass: ±4 from primary. If any owner match fires, second pass: ±4 outward
      // from the outermost match in each direction (one expansion only, not iterative).
      if (ownerName) {
        const primaryDocSet = new Set<string>(
          Array.isArray(primaryDocNos) ? primaryDocNos.filter(Boolean) : []
        );

        const upper = address.toUpperCase().trim();
        const addrMatch = upper.match(/^(\d+)\s+(?:(N|S|E|W|NORTH|SOUTH|EAST|WEST)\.?\s+)?(.+?)(?:\s+(ST|STREET|AVE|AVENUE|BLVD|BOULEVARD|DR|DRIVE|RD|ROAD|CT|COURT|PL|PLACE|WAY|LN|LANE|TER|TERRACE|PKWY|PARKWAY|CIR|CIRCLE))?(?:,|\s|$)/i);

        if (addrMatch) {
          const houseNum = parseInt(addrMatch[1], 10);
          const rawDir = (addrMatch[2] || '').replace(/\./g, '').trim().toUpperCase();
          const DMAP: Record<string, string> = { 'NORTH': 'N', 'SOUTH': 'S', 'EAST': 'E', 'WEST': 'W', 'N': 'N', 'S': 'S', 'E': 'E', 'W': 'W' };
          const dir = DMAP[rawDir] || '';
          const streetName = (addrMatch[3] || '').trim()
            .replace(/\s+(ST|STREET|AVE|AVENUE|BLVD|BOULEVARD|DR|DRIVE|RD|ROAD|CT|COURT|PL|PLACE|WAY|LN|LANE|TER|TERRACE|PKWY|PARKWAY|CIR|CIRCLE)$/i, '')
            .trim();

          const normalizeOwner = (name: string) =>
            name.toUpperCase()
              .replace(/\b(LLC|INC|CORP|LTD|LP|CO|TRUST|THE|AND|OF|AN?|AVE|AVENUE|ST|BLVD|BOULEVARD|DR|RD|CT|PL|WAY|LN|TER|PKWY|CIR|CHICAGO|ILLINOIS|BLOCK|NORTH|SOUTH|EAST|WEST)\b/g, ' ')
              .replace(/\d+/g, ' ')
              .replace(/[^A-Z\s]/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();

          const primaryNormalized = normalizeOwner(ownerName);
          const primaryNumbers = new Set((ownerName.match(/\d{3,}/g) || []).map(String));
          const primaryWords = new Set(primaryNormalized.split(' ').filter(w => w.length > 3));

          const isOwnerMatch = (name: string): boolean => {
            if (!name || primaryWords.size === 0) return false;
            const candidateNumbers = (name.match(/\d{3,}/g) || []).map(String);
            if (candidateNumbers.some(n => !primaryNumbers.has(n))) return false;
            const candidateWords = new Set(normalizeOwner(name).split(' ').filter(w => w.length > 3));
            if (candidateWords.size === 0) return false;
            for (const w of primaryWords) if (!candidateWords.has(w)) return false;
            for (const w of candidateWords) if (!primaryWords.has(w)) return false;
            return true;
          };

          const lookupPin = async (num: number): Promise<{ num: number; pin: string; formattedAddress: string } | null> => {
            const streetQuery = dir ? `${num} ${dir} ${streetName}%` : `${num} %${streetName}%`;
            const params = new URLSearchParams({
              '$where': `property_address like '${streetQuery.replace(/'/g, "''")}' AND property_city = 'CHICAGO'`,
              '$limit': '3',
            });
            try {
              const resp = await fetch(`${ASSESSOR_API}?${params}`, {
                headers: { 'Accept': 'application/json' },
                signal: AbortSignal.timeout(5000),
              });
              if (!resp.ok) return null;
              const data = await resp.json();
              if (!Array.isArray(data) || data.length === 0) return null;
              const record = data[0];
              const pin = ((record.pin || record.pin14 || '') as string).replace(/[^0-9]/g, '');
              return { num, pin, formattedAddress: (record.property_address || `${num} ${dir} ${streetName}`).trim() };
            } catch { return null; }
          };

          // Returns true if the address produced an owner/doc match and was added to resultMap
          const checkAndAdd = async (lookup: { num: number; pin: string; formattedAddress: string } | null): Promise<boolean> => {
            if (!lookup) return false;
            const { pin, formattedAddress } = lookup;
            if (!pin || pin === cleanPrimaryPin || resultMap.has(pin)) return false;

            const rawSales = await fetchSaleHistoryForPin(pin);
            const adjacentOwner = rawSales[0]?.buyer_name || '';

            const sharedDocNo = rawSales.find((r: any) => r.doc_no && primaryDocSet.has(r.doc_no));
            const isDocNoMatch = !!sharedDocNo;
            const sharedOwnerSale = rawSales.find((r: any) =>
              isOwnerMatch(r.buyer_name || '') || isOwnerMatch(r.seller_name || '')
            );
            const isSharedOwnershipMatch = !!sharedOwnerSale;

            if (!isDocNoMatch && !isSharedOwnershipMatch) {
              console.log(`[RELATED PARCELS] No match for ${formattedAddress}: recentOwner="${adjacentOwner}", docNoMatch=${isDocNoMatch}, sharedOwner=${isSharedOwnershipMatch}`);
              return false;
            }

            let matchReason: string;
            if (isDocNoMatch) {
              matchReason = `Same deed (Doc #${sharedDocNo.doc_no})`;
            } else {
              const matchedField = isOwnerMatch(sharedOwnerSale.buyer_name || '') ? 'buyer' : 'seller';
              const matchedName = matchedField === 'buyer' ? sharedOwnerSale.buyer_name : sharedOwnerSale.seller_name;
              const saleYear = sharedOwnerSale.sale_date ? new Date(sharedOwnerSale.sale_date).getFullYear() : '';
              matchReason = `Shared ownership — ${matchedName} (${matchedField}, ${saleYear})`;
            }

            resultMap.set(pin, {
              formattedAddress,
              pin: pin.padEnd(14, '0'),
              ownerName: adjacentOwner,
              saleHistory: toSaleHistory(rawSales),
              matchReason,
            });
            return true;
          };

          const parity = houseNum % 2;

          // First pass: ±2 and ±4 from the primary address (all in parallel)
          const firstPassNums = [houseNum - 4, houseNum - 2, houseNum + 2, houseNum + 4]
            .filter(n => n > 0 && n % 2 === parity);
          const firstLookups = await Promise.allSettled(firstPassNums.map(lookupPin));

          const matchedNums: number[] = [];
          for (const result of firstLookups) {
            if (result.status === 'fulfilled' && result.value) {
              const matched = await checkAndAdd(result.value);
              if (matched) matchedNums.push(result.value.num);
            }
          }

          // Second pass: if any owner match fired, expand ±2 and ±4 outward from the
          // outermost matched address in each direction (one pass only, not iterative).
          if (matchedNums.length > 0) {
            const lowestMatch = Math.min(...matchedNums);
            const highestMatch = Math.max(...matchedNums);
            const expansionNums = new Set<number>();

            if (lowestMatch < houseNum) {
              [lowestMatch - 2, lowestMatch - 4].filter(n => n > 0 && n % 2 === parity).forEach(n => expansionNums.add(n));
            }
            if (highestMatch > houseNum) {
              [highestMatch + 2, highestMatch + 4].filter(n => n > 0 && n % 2 === parity).forEach(n => expansionNums.add(n));
            }

            if (expansionNums.size > 0) {
              console.log(`[RELATED PARCELS] Expanding scan from outermost matches (low=${lowestMatch}, high=${highestMatch}) → checking ${[...expansionNums].join(', ')}`);
              const secondLookups = await Promise.allSettled([...expansionNums].map(lookupPin));
              for (const result of secondLookups) {
                if (result.status === 'fulfilled' && result.value) {
                  await checkAndAdd(result.value);
                }
              }
            }
          }
        }
      }

      const relatedParcels = Array.from(resultMap.values());
      console.log(`[RELATED PARCELS] Total: ${relatedParcels.length} co-parcels for ${cleanPrimaryPin}`);
      relatedParcelsCache.set(cacheKey, { data: relatedParcels, expires: Date.now() + 24 * 60 * 60 * 1000 });
      return res.json({ relatedParcels });
    } catch (err) {
      console.error('[RELATED PARCELS] Error:', err);
      res.json({ relatedParcels: [] });
    }
  });

  // === PROXIMITY DATA ===

  app.post('/api/proximity', async (req, res) => {
    try {
      const { pin } = req.body;
      
      if (!pin || typeof pin !== 'string') {
        return res.status(400).json({ 
          error: 'PIN is required'
        });
      }

      const proximityData = await fetchProximityData(pin);
      
      if (!proximityData) {
        return res.json({ 
          found: false,
          message: 'No proximity data available for this PIN'
        });
      }
      
      res.json({ found: true, data: proximityData });
    } catch (err) {
      console.error('Proximity data error:', err);
      res.status(500).json({ 
        error: 'Failed to fetch proximity data'
      });
    }
  });

  // === CITY-OWNED LOTS ===

  function haversineFt(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 3958.8 * 5280;
    const toRad = (d: number) => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  app.post('/api/city-owned-lots/nearby', async (req, res) => {
    try {
      const { lat, lon, radiusMiles = 0.5 } = req.body;
      if (typeof lat !== 'number' || typeof lon !== 'number') {
        return res.status(400).json({ error: 'lat and lon are required as numbers' });
      }
      const radiusMeters = Math.round(radiusMiles * 1609.34);
      const url = `https://data.cityofchicago.org/resource/aksk-kvfp.json?$where=within_circle(location,${lat},${lon},${radiusMeters})&$limit=50&$order=:id`;
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) {
        throw new Error(`City-owned lots API returned ${response.status}`);
      }
      const raw: any[] = await response.json();
      const lots = raw
        .filter(r => r.latitude && r.longitude)
        .map(r => ({
          pin: r.pin || null,
          address: r.address || null,
          salesStatus: r.sales_status || 'Unknown',
          saleOfferingStatus: r.sale_offering_status || null,
          sqFt: r.square_footage_city_estimate ? parseInt(r.square_footage_city_estimate) : null,
          landValue: r.land_value ? parseInt(r.land_value) : null,
          zoning: r.zoning_classification || null,
          ward: r.ward || null,
          communityArea: r.community_area_name || null,
          applicationUrl: r.application_url?.url || null,
          distanceFt: haversineFt(lat, lon, parseFloat(r.latitude), parseFloat(r.longitude)),
        }))
        .sort((a, b) => a.distanceFt - b.distanceFt);
      res.json({ count: lots.length, lots });
    } catch (err) {
      console.error('City-owned lots error:', err);
      res.status(500).json({ error: 'Failed to fetch city-owned lots' });
    }
  });

  // === MICHELIN RESTAURANTS ===

  const michelinRestaurants = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'data', 'chicago_michelin_restaurants.json'), 'utf-8')
  );

  app.post('/api/michelin/nearby', async (req, res) => {
    try {
      const { lat, lon, radiusMiles = 1 } = req.body;

      if (typeof lat !== 'number' || typeof lon !== 'number') {
        return res.status(400).json({ error: 'lat and lon are required as numbers' });
      }

      const propertyPoint = turf.point([lon, lat]);
      const nearby = michelinRestaurants
        .map((r: any) => {
          const restaurantPoint = turf.point([r.lon, r.lat]);
          const distance = turf.distance(propertyPoint, restaurantPoint, { units: 'miles' });
          return { ...r, distanceMiles: Math.round(distance * 100) / 100 };
        })
        .filter((r: any) => r.distanceMiles <= radiusMiles)
        .sort((a: any, b: any) => {
          const ratingOrder: Record<string, number> = { '3 Stars': 0, '2 Stars': 1, '1 Star': 2, 'Bib Gourmand': 3, 'Selected': 4 };
          const aOrder = ratingOrder[a.rating] ?? 5;
          const bOrder = ratingOrder[b.rating] ?? 5;
          if (aOrder !== bOrder) return aOrder - bOrder;
          return a.distanceMiles - b.distanceMiles;
        });

      res.json({
        total: nearby.length,
        citywideTotal: michelinRestaurants.length,
        radiusMiles,
        restaurants: nearby
      });
    } catch (err) {
      console.error('Michelin restaurants error:', err);
      res.status(500).json({ error: 'Failed to fetch Michelin restaurant data' });
    }
  });

  // === JAMES BEARD AWARD RESTAURANTS ===

  const jbaRestaurants = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'data', 'chicago_jba_restaurants.json'), 'utf-8')
  );

  app.post('/api/jba/nearby', async (req, res) => {
    try {
      const { lat, lon, radiusMiles = 1 } = req.body;
      if (typeof lat !== 'number' || typeof lon !== 'number') {
        return res.status(400).json({ error: 'lat and lon are required as numbers' });
      }
      const propertyPoint = turf.point([lon, lat]);
      const nearby = jbaRestaurants
        .map((r: any) => {
          const pt = turf.point([r.lon, r.lat]);
          const distance = turf.distance(propertyPoint, pt, { units: 'miles' });
          return { ...r, distanceMiles: Math.round(distance * 100) / 100 };
        })
        .filter((r: any) => r.distanceMiles <= radiusMiles)
        .sort((a: any, b: any) => a.distanceMiles - b.distanceMiles);
      res.json({ total: nearby.length, citywideTotal: jbaRestaurants.length, radiusMiles, restaurants: nearby });
    } catch (err) {
      console.error('JBA restaurants error:', err);
      res.status(500).json({ error: 'Failed to fetch JBA restaurant data' });
    }
  });

  // === MURALS REGISTRY ===

  let cachedMurals: any[] | null = null;
  let muralsLastFetched = 0;
  const MURALS_CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours

  async function fetchMurals(): Promise<any[]> {
    const now = Date.now();
    if (cachedMurals && (now - muralsLastFetched) < MURALS_CACHE_TTL) {
      return cachedMurals;
    }
    try {
      const resp = await fetch('https://data.cityofchicago.org/resource/we8h-apcf.json?$limit=2000');
      if (!resp.ok) throw new Error(`Murals API error: ${resp.status}`);
      const data = await resp.json();
      cachedMurals = data;
      muralsLastFetched = now;
      console.log(`Fetched ${data.length} murals from Chicago Data Portal`);
      return data;
    } catch (err) {
      console.error('Failed to fetch murals:', err);
      if (cachedMurals) return cachedMurals;
      return [];
    }
  }

  app.post('/api/murals/nearby', async (req, res) => {
    try {
      const { lat, lon, radiusMiles = 0.5 } = req.body;

      if (typeof lat !== 'number' || typeof lon !== 'number') {
        return res.status(400).json({ error: 'lat and lon are required as numbers' });
      }

      const murals = await fetchMurals();
      const propertyPoint = turf.point([lon, lat]);

      const nearby = murals
        .map((m: any) => {
          const mLat = parseFloat(m.latitude);
          const mLng = parseFloat(m.longitude);
          if (isNaN(mLat) || isNaN(mLng)) return null;
          const muralPoint = turf.point([mLng, mLat]);
          const distance = turf.distance(propertyPoint, muralPoint, { units: 'miles' });
          if (distance > radiusMiles) return null;
          return {
            title: m.artwork_title || 'Untitled',
            artist: m.artist_credit || 'Unknown',
            address: m.street_address || 'Address unavailable',
            yearInstalled: m.year_installed || null,
            media: m.media || null,
            description: m.description_of_artwork || null,
            latitude: mLat,
            longitude: mLng,
            distanceMiles: Math.round(distance * 100) / 100,
          };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => a.distanceMiles - b.distanceMiles);

      res.json({
        total: nearby.length,
        radiusMiles,
        murals: nearby,
      });
    } catch (err) {
      console.error('Murals nearby error:', err);
      res.status(500).json({ error: 'Failed to fetch mural data' });
    }
  });

  // === DESIGNATED LANDMARKS ===

  let cachedLandmarksGeo: any = null;
  let landmarksGeoLastFetched = 0;
  const LANDMARKS_GEO_CACHE_TTL = 1000 * 60 * 60 * 24;

  async function fetchLandmarksGeo(): Promise<any[]> {
    const now = Date.now();
    if (cachedLandmarksGeo && (now - landmarksGeoLastFetched) < LANDMARKS_GEO_CACHE_TTL) {
      return cachedLandmarksGeo;
    }
    try {
      const resp = await fetch('https://data.cityofchicago.org/resource/uct4-hrvh.geojson?$limit=2000');
      if (!resp.ok) throw new Error(`Landmarks GeoJSON API error: ${resp.status}`);
      const data = await resp.json();
      const features = data.features || [];
      cachedLandmarksGeo = features;
      landmarksGeoLastFetched = now;
      console.log(`Fetched ${features.length} designated landmarks from Chicago Data Portal`);
      return features;
    } catch (err) {
      console.error('Failed to fetch landmarks GeoJSON:', err);
      if (cachedLandmarksGeo) return cachedLandmarksGeo;
      return [];
    }
  }

  app.post('/api/landmarks-designated/nearby', async (req, res) => {
    try {
      const { lat, lon, radiusMiles = 1 } = req.body;

      if (typeof lat !== 'number' || typeof lon !== 'number') {
        return res.status(400).json({ error: 'lat and lon are required as numbers' });
      }

      const features = await fetchLandmarksGeo();
      const propertyPoint = turf.point([lon, lat]);

      const nearby = features
        .map((f: any) => {
          try {
            if (!f.geometry) return null;
            const centroid = turf.centroid(f.geometry);
            const distance = turf.distance(propertyPoint, centroid, { units: 'miles' });
            if (distance > radiusMiles) return null;
            const props = f.properties || {};
            const [cLng, cLat] = centroid.geometry.coordinates;
            return {
              name: props.name || 'Unknown',
              address: props.address || 'Address unavailable',
              architect: props.architect || null,
              dateBuilt: props.date_built || null,
              landmarkDate: props.landmark ? props.landmark.substring(0, 10) : null,
              latitude: cLat,
              longitude: cLng,
              distanceMiles: Math.round(distance * 100) / 100,
            };
          } catch {
            return null;
          }
        })
        .filter(Boolean)
        .sort((a: any, b: any) => a.distanceMiles - b.distanceMiles);

      res.json({
        total: nearby.length,
        radiusMiles,
        landmarks: nearby,
      });
    } catch (err) {
      console.error('Designated landmarks nearby error:', err);
      res.status(500).json({ error: 'Failed to fetch designated landmark data' });
    }
  });

  // === TRANSIT PROXIMITY ===

  app.post('/api/transit/nearby', async (req, res) => {
    try {
      const { lat, lon } = req.body;
      
      if (typeof lat !== 'number' || typeof lon !== 'number') {
        return res.status(400).json({ message: "lat and lon are required as numbers" });
      }

      if (!isTransitInitialized()) {
        initTransit().catch(err => console.error('Transit re-init error:', err));
        return res.status(503).json({ 
          message: "Transit data is still loading. Please try again in a moment.",
          ctaRail: [],
          ctaBus: [],
          metra: []
        });
      }

      const result = findNearestTransit(lat, lon, 5);
      res.json(result);
    } catch (err) {
      console.error('Transit lookup error:', err);
      res.status(500).json({ 
        message: "Error looking up transit data",
        ctaRail: [],
        ctaBus: [],
        metra: []
      });
    }
  });

  // === TOD (Transit-Oriented Development) STATUS ===
  
  app.post('/api/tod/status', async (req, res) => {
    try {
      const { lat, lon } = req.body;
      
      if (typeof lat !== 'number' || typeof lon !== 'number') {
        return res.status(400).json({ message: "lat and lon are required as numbers" });
      }

      if (!isTransitInitialized()) {
        initTransit().catch(err => console.error('Transit re-init error:', err));
        return res.status(503).json({ 
          message: "Transit data is still loading. Please try again in a moment.",
          inTOD: false,
          todType: null
        });
      }

      const transitData = findNearestTransit(lat, lon, 10);
      const todStatus = checkTODStatus(transitData);
      res.json(todStatus);
    } catch (err) {
      console.error('TOD status lookup error:', err);
      res.status(500).json({ 
        message: "Error looking up TOD status",
        inTOD: false,
        todType: null
      });
    }
  });

  // === EV CHARGING STATIONS (uses locally stored data) ===
  
  app.post('/api/ev-stations/nearby', async (req, res) => {
    try {
      const { lat, lon, radiusMiles = 5 } = req.body;
      
      if (typeof lat !== 'number' || typeof lon !== 'number') {
        return res.status(400).json({ message: "lat and lon are required as numbers" });
      }
      
      // Query locally stored EV station data
      const result = findNearbyEvStations(lat, lon, radiusMiles, 20);
      
      if (!result) {
        return res.json({ 
          stations: [], 
          totalFound: 0,
          message: "EV station data not available. Run: npx tsx scripts/build_ev_index.ts"
        });
      }
      
      res.json(result);
    } catch (err) {
      console.error('EV stations lookup error:', err);
      res.status(500).json({ 
        message: "Error looking up EV stations",
        stations: [],
        totalFound: 0
      });
    }
  });

  // Gas stations count by ZIP code
  app.get('/api/gas-stations/by-zip/:zipCode', async (req, res) => {
    try {
      const { zipCode } = req.params;
      const gasPath = path.join(__dirname, 'data', 'gas_stations.json');
      
      if (!fs.existsSync(gasPath)) {
        return res.json({ zipCode, count: 0, stations: [], message: "Gas station data not available" });
      }
      
      const gasData = JSON.parse(fs.readFileSync(gasPath, 'utf-8'));
      const allStations = gasData.stations || [];
      const stationsInZip = allStations.filter((s: any) => s.zip === zipCode);
      
      res.json({
        zipCode,
        count: stationsInZip.length,
        stations: stationsInZip.slice(0, 10).map((s: any) => ({
          name: s.name,
          address: s.address
        }))
      });
    } catch (err) {
      console.error('Gas stations by ZIP error:', err);
      res.status(500).json({ zipCode: req.params.zipCode, count: 0, stations: [], message: "Error" });
    }
  });

  // EV charging stations count by ZIP code
  app.get('/api/ev-stations/by-zip/:zipCode', async (req, res) => {
    try {
      const { zipCode } = req.params;
      const evPath = path.join(__dirname, 'data', 'ev_stations.json');
      
      if (!fs.existsSync(evPath)) {
        return res.json({ zipCode, count: 0, stations: [], message: "EV station data not available" });
      }
      
      const evData = JSON.parse(fs.readFileSync(evPath, 'utf-8'));
      const allStations = evData.stations || [];
      const stationsInZip = allStations.filter((s: any) => s.zip === zipCode);
      
      res.json({
        zipCode,
        count: stationsInZip.length,
        stations: stationsInZip.slice(0, 10).map((s: any) => ({
          name: s.name || s.stationName,
          address: s.address
        }))
      });
    } catch (err) {
      console.error('EV stations by ZIP error:', err);
      res.status(500).json({ zipCode: req.params.zipCode, count: 0, stations: [], message: "Error" });
    }
  });

  // Coffee shops by ZIP code
  app.get('/api/coffee-shops/by-zip/:zipCode', async (req, res) => {
    try {
      const { zipCode } = req.params;
      const coffeePath = path.join(__dirname, 'data', 'coffee_shops.json');
      
      if (!fs.existsSync(coffeePath)) {
        return res.json({ zipCode, count: 0, locations: [], message: "Coffee shop data not available" });
      }
      
      const coffeeData = JSON.parse(fs.readFileSync(coffeePath, 'utf-8'));
      const allLocations = coffeeData.locations || [];
      const locationsInZip = allLocations.filter((s: any) => s.zip === zipCode);
      
      res.json({
        zipCode,
        count: locationsInZip.length,
        locations: locationsInZip.slice(0, 10).map((s: any) => ({
          name: s.name,
          address: s.address
        }))
      });
    } catch (err) {
      console.error('Coffee shops by ZIP error:', err);
      res.status(500).json({ zipCode: req.params.zipCode, count: 0, locations: [], message: "Error" });
    }
  });

  // Hotels by ZIP code
  app.get('/api/hotels/by-zip/:zipCode', async (req, res) => {
    try {
      const { zipCode } = req.params;
      const hotelPath = path.join(__dirname, 'data', 'hotels.json');
      
      if (!fs.existsSync(hotelPath)) {
        return res.json({ zipCode, count: 0, locations: [], message: "Hotel data not available" });
      }
      
      const hotelData = JSON.parse(fs.readFileSync(hotelPath, 'utf-8'));
      const allLocations = hotelData.locations || [];
      const locationsInZip = allLocations.filter((s: any) => s.zip === zipCode);
      
      res.json({
        zipCode,
        count: locationsInZip.length,
        locations: locationsInZip.slice(0, 10).map((s: any) => ({
          name: s.name,
          address: s.address
        }))
      });
    } catch (err) {
      console.error('Hotels by ZIP error:', err);
      res.status(500).json({ zipCode: req.params.zipCode, count: 0, locations: [], message: "Error" });
    }
  });

  // Restaurants by ZIP code
  app.get('/api/restaurants/by-zip/:zipCode', async (req, res) => {
    try {
      const { zipCode } = req.params;
      const restaurantPath = path.join(__dirname, 'data', 'restaurants.json');
      
      if (!fs.existsSync(restaurantPath)) {
        return res.json({ zipCode, count: 0, locations: [], message: "Restaurant data not available" });
      }
      
      const restaurantData = JSON.parse(fs.readFileSync(restaurantPath, 'utf-8'));
      const allLocations = restaurantData.locations || [];
      const locationsInZip = allLocations.filter((s: any) => s.zip === zipCode);
      
      res.json({
        zipCode,
        count: locationsInZip.length,
        locations: locationsInZip.slice(0, 10).map((s: any) => ({
          name: s.name,
          address: s.address
        }))
      });
    } catch (err) {
      console.error('Restaurants by ZIP error:', err);
      res.status(500).json({ zipCode: req.params.zipCode, count: 0, locations: [], message: "Error" });
    }
  });

  // Bars by ZIP code
  app.get('/api/bars/by-zip/:zipCode', async (req, res) => {
    try {
      const { zipCode } = req.params;
      const barPath = path.join(__dirname, 'data', 'bars.json');
      
      if (!fs.existsSync(barPath)) {
        return res.json({ zipCode, count: 0, locations: [], message: "Bar data not available" });
      }
      
      const barData = JSON.parse(fs.readFileSync(barPath, 'utf-8'));
      const allLocations = barData.locations || [];
      const locationsInZip = allLocations.filter((s: any) => s.zip === zipCode);
      
      res.json({
        zipCode,
        count: locationsInZip.length,
        locations: locationsInZip.slice(0, 10).map((s: any) => ({
          name: s.name,
          address: s.address
        }))
      });
    } catch (err) {
      console.error('Bars by ZIP error:', err);
      res.status(500).json({ zipCode: req.params.zipCode, count: 0, locations: [], message: "Error" });
    }
  });

  // Liquor stores by ZIP code
  app.get('/api/liquor-stores/by-zip/:zipCode', async (req, res) => {
    try {
      const { zipCode } = req.params;
      const liquorPath = path.join(__dirname, 'data', 'liquor_stores.json');
      
      if (!fs.existsSync(liquorPath)) {
        return res.json({ zipCode, count: 0, locations: [], message: "Liquor store data not available" });
      }
      
      const liquorData = JSON.parse(fs.readFileSync(liquorPath, 'utf-8'));
      const allLocations = liquorData.locations || [];
      const locationsInZip = allLocations.filter((s: any) => s.zip === zipCode);
      
      res.json({
        zipCode,
        count: locationsInZip.length,
        locations: locationsInZip.slice(0, 10).map((s: any) => ({
          name: s.name,
          address: s.address
        }))
      });
    } catch (err) {
      console.error('Liquor stores by ZIP error:', err);
      res.status(500).json({ zipCode: req.params.zipCode, count: 0, locations: [], message: "Error" });
    }
  });

  // Day care centers by ZIP code
  app.get('/api/day-care/by-zip/:zipCode', async (req, res) => {
    try {
      const { zipCode } = req.params;
      const dataPath = path.join(__dirname, 'data', 'day_care_centers.json');
      
      if (!fs.existsSync(dataPath)) {
        return res.json({ zipCode, count: 0, locations: [], message: "Day care data not available" });
      }
      
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
      const allLocations = data.locations || [];
      const locationsInZip = allLocations.filter((s: any) => s.zip === zipCode);
      
      res.json({
        zipCode,
        count: locationsInZip.length,
        locations: locationsInZip.slice(0, 10).map((s: any) => ({
          name: s.name,
          address: s.address
        }))
      });
    } catch (err) {
      console.error('Day care by ZIP error:', err);
      res.status(500).json({ zipCode: req.params.zipCode, count: 0, locations: [], message: "Error" });
    }
  });

  // Massage/Spa by ZIP code
  app.get('/api/massage-spa/by-zip/:zipCode', async (req, res) => {
    try {
      const { zipCode } = req.params;
      const dataPath = path.join(__dirname, 'data', 'massage_spas.json');
      
      if (!fs.existsSync(dataPath)) {
        return res.json({ zipCode, count: 0, locations: [], message: "Massage/spa data not available" });
      }
      
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
      const allLocations = data.locations || [];
      const locationsInZip = allLocations.filter((s: any) => s.zip === zipCode);
      
      res.json({
        zipCode,
        count: locationsInZip.length,
        locations: locationsInZip.slice(0, 10).map((s: any) => ({
          name: s.name,
          address: s.address
        }))
      });
    } catch (err) {
      console.error('Massage/spa by ZIP error:', err);
      res.status(500).json({ zipCode: req.params.zipCode, count: 0, locations: [], message: "Error" });
    }
  });

  // Auto repair shops by ZIP code
  app.get('/api/auto-repair/by-zip/:zipCode', async (req, res) => {
    try {
      const { zipCode } = req.params;
      const dataPath = path.join(__dirname, 'data', 'auto_repair_shops.json');
      
      if (!fs.existsSync(dataPath)) {
        return res.json({ zipCode, count: 0, locations: [], message: "Auto repair data not available" });
      }
      
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
      const allLocations = data.locations || [];
      const locationsInZip = allLocations.filter((s: any) => s.zip === zipCode);
      
      res.json({
        zipCode,
        count: locationsInZip.length,
        locations: locationsInZip.slice(0, 10).map((s: any) => ({
          name: s.name,
          address: s.address
        }))
      });
    } catch (err) {
      console.error('Auto repair by ZIP error:', err);
      res.status(500).json({ zipCode: req.params.zipCode, count: 0, locations: [], message: "Error" });
    }
  });

  // Pet stores by ZIP code
  app.get('/api/pet-stores/by-zip/:zipCode', async (req, res) => {
    try {
      const { zipCode } = req.params;
      const dataPath = path.join(__dirname, 'data', 'pet_stores.json');
      
      if (!fs.existsSync(dataPath)) {
        return res.json({ zipCode, count: 0, locations: [], message: "Pet store data not available" });
      }
      
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
      const allLocations = data.locations || [];
      const locationsInZip = allLocations.filter((s: any) => s.zip === zipCode);
      
      res.json({
        zipCode,
        count: locationsInZip.length,
        locations: locationsInZip.slice(0, 10).map((s: any) => ({
          name: s.name,
          address: s.address
        }))
      });
    } catch (err) {
      console.error('Pet stores by ZIP error:', err);
      res.status(500).json({ zipCode: req.params.zipCode, count: 0, locations: [], message: "Error" });
    }
  });

  // Veterinary clinics by ZIP code
  app.get('/api/vet-clinics/by-zip/:zipCode', async (req, res) => {
    try {
      const { zipCode } = req.params;
      const dataPath = path.join(__dirname, 'data', 'vet_clinics.json');
      
      if (!fs.existsSync(dataPath)) {
        return res.json({ zipCode, count: 0, locations: [], message: "Veterinary clinic data not available" });
      }
      
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
      const allLocations = data.locations || [];
      const locationsInZip = allLocations.filter((s: any) => s.zip === zipCode);
      
      res.json({
        zipCode,
        count: locationsInZip.length,
        locations: locationsInZip.slice(0, 10).map((s: any) => ({
          name: s.name,
          address: s.address
        }))
      });
    } catch (err) {
      console.error('Vet clinics by ZIP error:', err);
      res.status(500).json({ zipCode: req.params.zipCode, count: 0, locations: [], message: "Error" });
    }
  });

  // Nightclubs by ZIP code
  app.get('/api/nightclubs/by-zip/:zipCode', async (req, res) => {
    try {
      const { zipCode } = req.params;
      const dataPath = path.join(__dirname, 'data', 'nightclubs.json');
      
      if (!fs.existsSync(dataPath)) {
        return res.json({ zipCode, count: 0, locations: [], message: "Nightclub data not available" });
      }
      
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
      const allLocations = data.locations || [];
      const locationsInZip = allLocations.filter((s: any) => s.zip === zipCode);
      
      res.json({
        zipCode,
        count: locationsInZip.length,
        locations: locationsInZip.slice(0, 10).map((s: any) => ({
          name: s.name,
          address: s.address
        }))
      });
    } catch (err) {
      console.error('Nightclubs by ZIP error:', err);
      res.status(500).json({ zipCode: req.params.zipCode, count: 0, locations: [], message: "Error" });
    }
  });

  // Event venues by ZIP code
  app.get('/api/event-venues/by-zip/:zipCode', async (req, res) => {
    try {
      const { zipCode } = req.params;
      const dataPath = path.join(__dirname, 'data', 'event_venues.json');
      
      if (!fs.existsSync(dataPath)) {
        return res.json({ zipCode, count: 0, locations: [], message: "Event venue data not available" });
      }
      
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
      const allLocations = data.locations || [];
      const locationsInZip = allLocations.filter((s: any) => s.zip === zipCode);
      
      res.json({
        zipCode,
        count: locationsInZip.length,
        locations: locationsInZip.slice(0, 10).map((s: any) => ({
          name: s.name,
          address: s.address
        }))
      });
    } catch (err) {
      console.error('Event venues by ZIP error:', err);
      res.status(500).json({ zipCode: req.params.zipCode, count: 0, locations: [], message: "Error" });
    }
  });

  // Breweries/Distilleries by ZIP code
  app.get('/api/breweries/by-zip/:zipCode', async (req, res) => {
    try {
      const { zipCode } = req.params;
      const dataPath = path.join(__dirname, 'data', 'breweries.json');
      
      if (!fs.existsSync(dataPath)) {
        return res.json({ zipCode, count: 0, locations: [], message: "Brewery data not available" });
      }
      
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
      const allLocations = data.locations || [];
      const locationsInZip = allLocations.filter((s: any) => s.zip === zipCode);
      
      res.json({
        zipCode,
        count: locationsInZip.length,
        locations: locationsInZip.slice(0, 10).map((s: any) => ({
          name: s.name,
          address: s.address
        }))
      });
    } catch (err) {
      console.error('Breweries by ZIP error:', err);
      res.status(500).json({ zipCode: req.params.zipCode, count: 0, locations: [], message: "Error" });
    }
  });

  // Cannabis dispensaries by ZIP code (Illinois IDFPR data)
  app.get('/api/cannabis-dispensaries/by-zip/:zipCode', async (req, res) => {
    try {
      const { zipCode } = req.params;
      const dataPath = path.join(__dirname, 'data', 'cannabis_dispensaries.json');
      
      if (!fs.existsSync(dataPath)) {
        return res.json({ zipCode, count: 0, locations: [], message: "Cannabis dispensary data not available" });
      }
      
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
      const zipData = data.byZip?.[zipCode];
      
      if (!zipData) {
        return res.json({ zipCode, count: 0, locations: [] });
      }
      
      res.json({
        zipCode,
        count: zipData.count,
        locations: zipData.locations.slice(0, 10)
      });
    } catch (err) {
      console.error('Cannabis dispensaries by ZIP error:', err);
      res.status(500).json({ zipCode: req.params.zipCode, count: 0, locations: [], message: "Error" });
    }
  });

  // Gas stations (Filling Stations) - uses locally stored data
  app.post('/api/gas-stations/nearby', async (req, res) => {
    try {
      const { lat, lon, radiusMiles = 5 } = req.body;
      
      if (typeof lat !== 'number' || typeof lon !== 'number') {
        return res.status(400).json({ message: "lat and lon are required as numbers" });
      }
      
      const result = findNearbyGasStations(lat, lon, radiusMiles, 20);
      
      if (!result) {
        return res.json({ 
          stations: [], 
          totalFound: 0,
          message: "Gas station data not available. Run: npx tsx scripts/build_ev_index.ts"
        });
      }
      
      res.json(result);
    } catch (err) {
      console.error('Gas stations lookup error:', err);
      res.status(500).json({ 
        message: "Error looking up gas stations",
        stations: [],
        totalFound: 0
      });
    }
  });

  // Hotels - uses locally stored data
  app.post('/api/hotels/nearby', async (req, res) => {
    try {
      const { lat, lon, radiusMiles = 5 } = req.body;
      
      if (typeof lat !== 'number' || typeof lon !== 'number') {
        return res.status(400).json({ message: "lat and lon are required as numbers" });
      }
      
      const result = findNearbyHotels(lat, lon, radiusMiles, 20);
      
      if (!result) {
        return res.json({ 
          locations: [], 
          totalFound: 0,
          message: "Hotel data not available. Run: npx tsx scripts/build_ev_index.ts"
        });
      }
      
      res.json(result);
    } catch (err) {
      console.error('Hotels lookup error:', err);
      res.status(500).json({ 
        message: "Error looking up hotels",
        locations: [],
        totalFound: 0
      });
    }
  });

  // Restaurants - uses locally stored data
  app.post('/api/restaurants/nearby', async (req, res) => {
    try {
      const { lat, lon, radiusMiles = 5 } = req.body;
      
      if (typeof lat !== 'number' || typeof lon !== 'number') {
        return res.status(400).json({ message: "lat and lon are required as numbers" });
      }
      
      const result = findNearbyRestaurants(lat, lon, radiusMiles, 20);
      
      if (!result) {
        return res.json({ 
          locations: [], 
          totalFound: 0,
          message: "Restaurant data not available. Run: npx tsx scripts/build_ev_index.ts"
        });
      }
      
      res.json(result);
    } catch (err) {
      console.error('Restaurants lookup error:', err);
      res.status(500).json({ 
        message: "Error looking up restaurants",
        locations: [],
        totalFound: 0
      });
    }
  });

  // Coffee Shops - uses locally stored data
  app.post('/api/coffee-shops/nearby', async (req, res) => {
    try {
      const { lat, lon, radiusMiles = 5 } = req.body;
      
      if (typeof lat !== 'number' || typeof lon !== 'number') {
        return res.status(400).json({ message: "lat and lon are required as numbers" });
      }
      
      const result = findNearbyCoffeeShops(lat, lon, radiusMiles, 20);
      
      if (!result) {
        return res.json({ 
          locations: [], 
          totalFound: 0,
          message: "Coffee shop data not available. Run: npx tsx scripts/build_ev_index.ts"
        });
      }
      
      res.json(result);
    } catch (err) {
      console.error('Coffee shops lookup error:', err);
      res.status(500).json({ 
        message: "Error looking up coffee shops",
        locations: [],
        totalFound: 0
      });
    }
  });

  // Bars/Taverns - uses locally stored data
  app.post('/api/bars/nearby', async (req, res) => {
    try {
      const { lat, lon, radiusMiles = 5 } = req.body;
      
      if (typeof lat !== 'number' || typeof lon !== 'number') {
        return res.status(400).json({ message: "lat and lon are required as numbers" });
      }
      
      const result = findNearbyBars(lat, lon, radiusMiles, 20);
      
      if (!result) {
        return res.json({ 
          locations: [], 
          totalFound: 0,
          message: "Bar data not available. Run: npx tsx scripts/build_ev_index.ts"
        });
      }
      
      res.json(result);
    } catch (err) {
      console.error('Bars lookup error:', err);
      res.status(500).json({ 
        message: "Error looking up bars",
        locations: [],
        totalFound: 0
      });
    }
  });

  // Day Care Centers - nearby licensed day care facilities
  app.post('/api/day-care/nearby', async (req, res) => {
    try {
      const { lat, lon, radiusMiles = 3 } = req.body;
      
      if (typeof lat !== 'number' || typeof lon !== 'number') {
        return res.status(400).json({ message: "lat and lon are required as numbers" });
      }
      
      const result = findNearbyDayCares(lat, lon, radiusMiles, 20);
      
      if (!result) {
        return res.json({ 
          locations: [], 
          totalFound: 0,
          message: "Day care data not available"
        });
      }
      
      res.json(result);
    } catch (err) {
      console.error('Day care lookup error:', err);
      res.status(500).json({ 
        message: "Error looking up day care centers",
        locations: [],
        totalFound: 0
      });
    }
  });

  // Vacant and Abandoned Buildings - Violations from Chicago Data Portal
  app.post('/api/vacant-buildings/nearby', async (req, res) => {
    try {
      const { lat, lon } = req.body;

      if (typeof lat !== 'number' || typeof lon !== 'number') {
        return res.status(400).json({ message: "lat and lon are required as numbers" });
      }

      const quarterMileMeters = 402.336;
      const halfMileMeters = 804.672;

      const fetchVacant = async (radiusMeters: number) => {
        const url = `https://data.cityofchicago.org/resource/kc9i-wq85.json?$where=within_circle(location,${lat},${lon},${radiusMeters})&$limit=500&$order=issued_date DESC`;
        const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!resp.ok) throw new Error(`Socrata API error: ${resp.status}`);
        return resp.json();
      };

      const [quarterMileResults, halfMileResults] = await Promise.all([
        fetchVacant(quarterMileMeters),
        fetchVacant(halfMileMeters),
      ]);

      const formatViolation = (v: any) => ({
        address: (v.property_address || '').trim(),
        issuedDate: v.issued_date || null,
        lastHearingDate: v.last_hearing_date || null,
        violationType: v.violation_type || '',
        disposition: v.disposition_description || '',
        entity: (v.entity_or_person_s_ || '').trim().replace(/,\s*$/, ''),
        totalFines: parseFloat(v.total_fines || '0'),
        currentAmountDue: parseFloat(v.current_amount_due || '0'),
        docketNumber: v.docket_number || '',
        latitude: parseFloat(v.latitude || '0'),
        longitude: parseFloat(v.longitude || '0'),
      });

      const quarterMile = (quarterMileResults as any[]).map(formatViolation);
      const halfMileOnly = (halfMileResults as any[])
        .filter((v: any) => !quarterMileResults.some((q: any) => q.docket_number === v.docket_number))
        .map(formatViolation);

      const uniqueAddressesQuarter = new Set(quarterMile.map((v: any) => v.address)).size;
      const uniqueAddressesHalf = new Set([...quarterMile, ...halfMileOnly].map((v: any) => v.address)).size;

      res.json({
        quarterMile: {
          violations: quarterMile,
          totalViolations: quarterMile.length,
          uniqueAddresses: uniqueAddressesQuarter,
        },
        halfMile: {
          violations: halfMileOnly,
          totalViolations: halfMileOnly.length,
          uniqueAddresses: uniqueAddressesHalf - uniqueAddressesQuarter,
        },
        totalViolations: quarterMile.length + halfMileOnly.length,
        totalUniqueAddresses: uniqueAddressesHalf,
      });
    } catch (err) {
      console.error('Vacant buildings lookup error:', err);
      res.status(500).json({
        message: "Error looking up vacant buildings",
        quarterMile: { violations: [], totalViolations: 0, uniqueAddresses: 0 },
        halfMile: { violations: [], totalViolations: 0, uniqueAddresses: 0 },
        totalViolations: 0,
        totalUniqueAddresses: 0,
      });
    }
  });

  // EV Registrations - Cook County trends for gas station project use
  app.get('/api/ev-registrations/:zipCode', async (req, res) => {
    try {
      const zipCode = req.params.zipCode;
      const dataPath = path.join(process.cwd(), 'server', 'data', 'ev_registrations.json');
      
      if (!fs.existsSync(dataPath)) {
        return res.json({
          zipCode,
          zipCodeData: null,
          cookCountyData: null,
          message: "EV registration data not available. Run: npx tsx scripts/build_ev_registrations.ts"
        });
      }
      
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
      
      const zipCodeData = data.byZipCode[zipCode] || null;
      const cookCountyData = data.cookCountyMonthly || null;
      
      res.json({
        zipCode,
        zipCodeData,
        cookCountyData,
        lastUpdated: data.lastUpdated,
        latestReportDate: Object.values(data.reports || {}).map((report: any) => report.reportDate).sort().at(-1) || null,
        refreshStatus: data.refresh || null,
        sourceUrl: data.sourceUrl || 'https://www.ilsos.gov/departments/vehicles/statistics/electric.html'
      });
    } catch (err) {
      console.error('EV registrations lookup error:', err);
      res.status(500).json({ 
        message: "Error looking up EV registrations",
        zipCode: req.params.zipCode,
        zipCodeData: null,
        cookCountyData: null
      });
    }
  });
  
  // Helper function to calculate distance in miles using Haversine formula
  function calculateDistanceMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 3958.8; // Earth's radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // === MAP POLYGON DATA ===

  app.get('/api/polygons/zip/:zipCode', async (req, res) => {
    const zipCode = req.params.zipCode;
    if (!zipCode || !zctaData) {
      return res.status(404).json({ message: "ZIP polygon not found" });
    }

    const feature = zctaData.features.find((f: any) => f.properties.ZCTA5CE10 === zipCode);
    if (!feature) {
      return res.status(404).json({ message: "ZIP polygon not found" });
    }

    res.json(feature);
  });

  app.get('/api/polygons/community/:communityArea', async (req, res) => {
    const communityArea = decodeURIComponent(req.params.communityArea);
    if (!communityArea || !communityAreasData) {
      return res.status(404).json({ message: "Community area polygon not found" });
    }

    // Normalize name for comparison
    const normalizedName = communityArea.toUpperCase().trim().replace(/\s+/g, ' ');
    const feature = communityAreasData.features.find((f: any) => {
      const featureName = (f.properties.community || '').toUpperCase().trim().replace(/\s+/g, ' ');
      return featureName === normalizedName;
    });

    if (!feature) {
      return res.status(404).json({ message: "Community area polygon not found" });
    }

    res.json(feature);
  });

  app.get('/api/polygons/neighborhood/:neighborhoodName', async (req, res) => {
    const neighborhoodName = decodeURIComponent(req.params.neighborhoodName);
    if (!neighborhoodName || !neighborhoodsData) {
      return res.status(404).json({ message: "Neighborhood polygon not found" });
    }

    const normalizedName = neighborhoodName.toLowerCase().trim();
    const feature = neighborhoodsData.features.find((f: any) => {
      const name = (f.properties.pri_neigh || '').toLowerCase().trim();
      return name === normalizedName;
    });

    if (!feature) {
      return res.status(404).json({ message: "Neighborhood polygon not found" });
    }

    res.json(feature);
  });

  app.get('/api/polygons/ward/:wardNumber', async (req, res) => {
    const wardNumber = req.params.wardNumber;
    if (!wardNumber || !wardsData) {
      return res.status(404).json({ message: "Ward polygon not found" });
    }

    const feature = wardsData.features.find((f: any) => f.properties.ward_id === wardNumber);
    if (!feature) {
      return res.status(404).json({ message: "Ward polygon not found" });
    }

    res.json(feature);
  });

  app.get('/api/polygons/tract/:geoid', async (req, res) => {
    const geoid = req.params.geoid;
    if (!geoid || !/^\d{11}$/.test(geoid)) {
      return res.status(400).json({ message: "Invalid tract GEOID" });
    }
    try {
      const url = `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Census2020/MapServer/6/query?f=geojson&where=GEOID%3D%27${geoid}%27&outFields=GEOID&returnGeometry=true`;
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) return res.status(502).json({ message: "TIGER API error" });
      const data: any = await response.json();
      if (!data.features?.length) return res.status(404).json({ message: "Tract polygon not found" });
      res.json(data.features[0]);
    } catch (err) {
      console.error('Tract polygon fetch error:', err);
      res.status(502).json({ message: "Failed to fetch tract polygon" });
    }
  });

  // === HMDA LENDER RANKINGS ===

  let hmdaLenderData: any = null;

  function loadHmdaLenderData() {
    if (hmdaLenderData) return hmdaLenderData;
    try {
      const dataPath = path.join(__dirname, 'data', 'hmda_lender_rankings.json');
      if (fs.existsSync(dataPath)) {
        hmdaLenderData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
        console.log(`Loaded HMDA lender rankings (${hmdaLenderData.builtAt})`);
      }
    } catch (err) {
      console.error('Failed to load hmda_lender_rankings.json:', err);
    }
    return hmdaLenderData;
  }

  app.get('/api/discovery/lender-rankings', (req, res) => {
    const data = loadHmdaLenderData();
    if (!data) {
      return res.status(503).json({ message: 'Lender ranking data not yet available' });
    }
    res.json(data);
  });

  // === TAX APPEAL ATTORNEY RANKINGS ===

  const APPEAL_API = 'https://datacatalog.cookcountyil.gov/resource/7pny-nedm.json';
  let taxAppealData: any = null;

  function loadTaxAppealData() {
    if (taxAppealData) return taxAppealData;
    try {
      const dataPath = path.join(__dirname, 'data', 'tax_appeal_attorneys.json');
      if (fs.existsSync(dataPath)) {
        taxAppealData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
        console.log(`Loaded tax appeal attorney rankings (${taxAppealData.builtAt})`);
      }
    } catch (err) {
      console.error('Failed to load tax_appeal_attorneys.json:', err);
    }
    return taxAppealData;
  }

  app.get('/api/discovery/tax-appeal-attorneys', (req, res) => {
    const data = loadTaxAppealData();
    if (!data) {
      return res.status(503).json({ message: 'Tax appeal data not yet available' });
    }
    res.json(data);
  });

  // === ZBA (Zoning Board of Appeals) API ===
  const { getWardSummary, getCitySummary, setRepVerification, isIndexBuilt, getIndexRuns, clearCache, verifyRepresentativeArdc } = await import('./zba/index');
  const { REP_VERIFICATION_STATUSES } = await import('@shared/schema');

  app.get('/api/zba/ward-summary', async (req, res) => {
    try {
      const ward = parseInt(req.query.ward as string, 10);
      const years = req.query.years ? parseInt(req.query.years as string, 10) : 5;
      
      if (isNaN(ward) || ward < 1 || ward > 50) {
        return res.status(400).json({ message: "Valid ward number (1-50) required" });
      }
      
      const indexReady = await isIndexBuilt();
      if (!indexReady) {
        return res.status(503).json({ 
          message: "ZBA history index not built yet—run Refresh ZBA index.",
          indexBuilt: false 
        });
      }
      
      const summary = await getWardSummary(ward, years);
      res.json({ ...summary, indexBuilt: true });
    } catch (err) {
      console.error('ZBA ward summary error:', err);
      res.status(500).json({ message: err instanceof Error ? err.message : 'Failed to fetch ward summary' });
    }
  });

  app.get('/api/zba/city-summary', async (req, res) => {
    try {
      const years = req.query.years ? parseInt(req.query.years as string, 10) : 5;
      
      const indexReady = await isIndexBuilt();
      if (!indexReady) {
        return res.status(503).json({ 
          message: "ZBA history index not built yet—run Refresh ZBA index.",
          indexBuilt: false 
        });
      }
      
      const summary = await getCitySummary(years);
      res.json({ ...summary, indexBuilt: true });
    } catch (err) {
      console.error('ZBA city summary error:', err);
      res.status(500).json({ message: err instanceof Error ? err.message : 'Failed to fetch city summary' });
    }
  });

  app.post('/api/zba/rep-verification', async (req, res) => {
    try {
      const { representativeNorm, status } = req.body;
      
      if (!representativeNorm || typeof representativeNorm !== 'string') {
        return res.status(400).json({ message: "representativeNorm is required" });
      }
      
      if (!REP_VERIFICATION_STATUSES.includes(status)) {
        return res.status(400).json({ 
          message: `status must be one of: ${REP_VERIFICATION_STATUSES.join(', ')}` 
        });
      }
      
      await setRepVerification(representativeNorm, status);
      res.json({ success: true });
    } catch (err) {
      console.error('ZBA rep verification error:', err);
      res.status(500).json({ message: err instanceof Error ? err.message : 'Failed to set verification' });
    }
  });

  app.get('/api/zba/index-status', async (req, res) => {
    try {
      const indexReady = await isIndexBuilt();
      const runs = await getIndexRuns();
      res.json({ indexBuilt: indexReady, recentRuns: runs });
    } catch (err) {
      console.error('ZBA index status error:', err);
      res.status(500).json({ message: err instanceof Error ? err.message : 'Failed to fetch index status' });
    }
  });

  app.post('/api/zba/clear-cache', async (req, res) => {
    try {
      clearCache();
      res.json({ success: true, message: "Cache cleared" });
    } catch (err) {
      console.error('ZBA clear cache error:', err);
      res.status(500).json({ message: err instanceof Error ? err.message : 'Failed to clear cache' });
    }
  });

  // Trigger ARDC verification for a representative
  app.post('/api/zba/verify-ardc', async (req, res) => {
    try {
      const { representativeNorm, displayName } = req.body;
      
      if (!representativeNorm || !displayName) {
        return res.status(400).json({ message: "representativeNorm and displayName are required" });
      }
      
      const isAttorney = await verifyRepresentativeArdc(representativeNorm, displayName);
      
      // Clear cache so next request gets updated status
      clearCache();
      
      res.json({ success: true, isAttorney });
    } catch (err) {
      console.error('ARDC verification error:', err);
      res.status(500).json({ message: err instanceof Error ? err.message : 'Failed to verify with ARDC' });
    }
  });

  // Attorney discovery endpoint - top attorneys by ward and citywide
  app.get('/api/discovery/attorneys', async (req, res) => {
    try {
      const attorneySearch = typeof req.query.search === 'string'
        ? req.query.search.trim().slice(0, 200)
        : '';
      const normalizedAttorneySearch = attorneySearch.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
      const attorneyMatches = (name: string) => {
        if (!normalizedAttorneySearch) return true;
        const normalizedName = name.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
        return normalizedName.includes(normalizedAttorneySearch) || normalizedAttorneySearch.includes(normalizedName);
      };
      const indexReady = await isIndexBuilt();
      if (!indexReady) {
        return res.json({ 
          indexBuilt: false,
          byWard: [],
          citywide: []
        });
      }

      // Get citywide summary
      const citySummary = await getCitySummary(5);
      
      // Get summaries for all 50 wards
      const wardSummaries: Array<{
        ward: number;
        topAttorneys: Array<{
          name: string;
          totalCases: number;
          approvedCount: number;
          deniedCount: number;
          approvalRate: number | null;
          isVerifiedAttorney: boolean | null;
        }>;
        totalCases: number;
      }> = [];

      for (let ward = 1; ward <= 50; ward++) {
        try {
          const summary = await getWardSummary(ward, 5);
          // Filter to likely attorneys (not self-rep) and take top 3
          const eligibleAttorneys = summary.representatives
            .filter(r => !r.isSelfRep && r.totalCases >= 2)
            .filter(r => attorneyMatches(r.representativeDisplay));
          const topAttorneys = (attorneySearch ? eligibleAttorneys : eligibleAttorneys.slice(0, 3))
            .map(r => ({
              name: r.representativeDisplay,
              totalCases: r.totalCases,
              approvedCount: r.approvedCount,
              deniedCount: r.deniedCount,
              approvalRate: r.approvalRate,
              isVerifiedAttorney: r.isVerifiedAttorney,
            }));
          
          if (topAttorneys.length > 0) {
            wardSummaries.push({
              ward,
              topAttorneys,
              totalCases: summary.totalCases,
            });
          }
        } catch (err) {
          // Skip wards with no data
        }
      }

      // Sort wards by total cases
      wardSummaries.sort((a, b) => b.totalCases - a.totalCases);

      // Get citywide top attorneys (not self-rep, minimum 2 cases) - top 10
      const eligibleCitywideAttorneys = citySummary.representatives
        .filter(r => !r.isSelfRep && r.totalCases >= 2)
        .filter(r => attorneyMatches(r.representativeDisplay));
      const citywideAttorneys = (attorneySearch ? eligibleCitywideAttorneys : eligibleCitywideAttorneys.slice(0, 10))
        .map(r => ({
          name: r.representativeDisplay,
          totalCases: r.totalCases,
          approvedCount: r.approvedCount,
          deniedCount: r.deniedCount,
          approvalRate: r.approvalRate,
          isVerifiedAttorney: r.isVerifiedAttorney,
          mostRecentCaseDate: r.mostRecentCaseDate,
        }));

      res.json({
        indexBuilt: true,
        byWard: wardSummaries.slice(0, 20), // Top 20 wards by activity
        citywide: citywideAttorneys,
        totalCityCases: citySummary.totalCases,
      });
    } catch (err) {
      console.error('Attorney discovery error:', err);
      res.status(500).json({ message: err instanceof Error ? err.message : 'Failed to fetch attorney data' });
    }
  });

  // === AREA DISCOVERY ENDPOINTS ===
  
  // Load area index data
  let areaIndexData: any = null;
  function loadAreaIndex() {
    try {
      const indexPath = path.join(__dirname, 'data', 'area_index.json');
      if (fs.existsSync(indexPath)) {
        areaIndexData = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
        console.log(`Loaded area index: ${Object.keys(areaIndexData.byZip || {}).length} ZIPs, ${Object.keys(areaIndexData.byCommunityArea || {}).length} community areas`);
      }
    } catch (err) {
      console.error('Error loading area index:', err);
    }
  }
  loadAreaIndex();
  
  // Load community area childcare data for ranking
  let communityChildcareData: Record<string, any> = {};
  try {
    const childcarePath = path.join(__dirname, 'data', 'community_area_childcare.json');
    if (fs.existsSync(childcarePath)) {
      communityChildcareData = JSON.parse(fs.readFileSync(childcarePath, 'utf-8'));
    }
  } catch (err) {
    console.error('Error loading community childcare data:', err);
  }
  
  // Get top 20 community areas by childcare need (highest children-per-slot ratio)
  app.get('/api/discovery/top-communities', async (req, res) => {
    try {
      const ranked = Object.entries(communityChildcareData)
        .map(([name, data]: [string, any]) => ({
          name,
          id: name,
          childrenUnder5: data.childrenUnder5 || 0,
          licensedSlots: data.licensedSlots || 0,
          childrenPerSlot: data.childrenPerSlot || null,
          status: getChildcareStatus(data.childrenPerSlot)
        }))
        .filter(item => item.childrenUnder5 > 0 && item.childrenPerSlot !== null && item.childrenPerSlot > 1)
        .sort((a, b) => (b.childrenPerSlot || 0) - (a.childrenPerSlot || 0));
      
      res.json(ranked);
    } catch (err) {
      console.error('Discovery top communities error:', err);
      res.status(500).json({ message: 'Failed to fetch top communities' });
    }
  });
  
  // Get top 10 ZIPs by childcare need
  app.get('/api/discovery/top-zips', async (req, res) => {
    try {
      const zipChildcareList: Array<{ zipCode: string; childrenUnder5: number; licensedSlots: number; childrenPerSlot: number | null; status: string }> = [];
      
      // Use existing childcare data for ZIP codes
      for (const zipCode of Object.keys(areaIndexData?.byZip || {})) {
        const childcareData = await getChildcareAccess(zipCode);
        if (childcareData && childcareData.childrenUnder5 > 0) {
          zipChildcareList.push({
            zipCode,
            childrenUnder5: childcareData.childrenUnder5,
            licensedSlots: childcareData.licensedSlots,
            childrenPerSlot: childcareData.childrenPerSlot,
            status: childcareData.statusLabel
          });
        }
      }
      
      const ranked = zipChildcareList
        .filter(item => item.childrenPerSlot !== null && item.childrenPerSlot > 1)
        .sort((a, b) => (b.childrenPerSlot || 0) - (a.childrenPerSlot || 0));
      
      res.json(ranked);
    } catch (err) {
      console.error('Discovery top ZIPs error:', err);
      res.status(500).json({ message: 'Failed to fetch top ZIPs' });
    }
  });
  
  function getChildcareStatus(ratio: number | null): string {
    if (ratio === null || ratio === undefined) return 'Unknown';
    if (ratio > 3.0) return 'Childcare Desert';
    if (ratio >= 1.5) return 'Underserved';
    return 'Adequate';
  }
  
  // Get area detail by ZIP code
  app.get('/api/area/zip/:zipCode', async (req, res) => {
    try {
      const { zipCode } = req.params;
      
      if (!zipCode || !/^\d{5}$/.test(zipCode)) {
        return res.status(400).json({ message: 'Invalid ZIP code format' });
      }
      
      const areaData = areaIndexData?.byZip?.[zipCode];
      const childcareData = await getChildcareAccess(zipCode);
      
      res.json({
        type: 'zip',
        id: zipCode,
        name: `ZIP Code ${zipCode}`,
        childcare: childcareData ? {
          childrenUnder5: childcareData.childrenUnder5,
          licensedSlots: childcareData.licensedSlots,
          centerSlots: childcareData.centerSlots,
          familyHomeSlots: childcareData.familyHomeSlots,
          childrenPerSlot: childcareData.childrenPerSlot,
          status: childcareData.status,
          statusLabel: childcareData.statusLabel,
          sources: childcareData.sources
        } : null,
        sbifZones: areaData?.sbifZones || [],
        nmtc: areaData ? {
          totalTracts: areaData.nmtcTotalTracts,
          eligibleTracts: areaData.nmtcEligibleTracts,
          coveragePct: areaData.nmtcCoveragePct
        } : null
      });
    } catch (err) {
      console.error('Area ZIP detail error:', err);
      res.status(500).json({ message: 'Failed to fetch ZIP area data' });
    }
  });
  
  // Get TIF polygons by names (for map display)
  app.get('/api/tif-polygons', async (req, res) => {
    try {
      const names = req.query.names as string;
      if (!names) {
        return res.status(400).json({ message: 'names parameter required' });
      }
      
      const tifNames = names.split(',').map(n => n.trim().toLowerCase());
      const features: any[] = [];
      
      if (tifData?.features) {
        for (const feature of tifData.features) {
          const tifName = (feature.properties?.name || feature.properties?.NAME || '').toLowerCase();
          if (tifNames.includes(tifName)) {
            features.push(feature);
          }
        }
      }
      
      res.json({
        type: 'FeatureCollection',
        features
      });
    } catch (err) {
      console.error('TIF polygons error:', err);
      res.status(500).json({ message: 'Failed to fetch TIF polygons' });
    }
  });
  
  // Get area detail by community area
  app.get('/api/area/community/:communityId', async (req, res) => {
    try {
      const { communityId } = req.params;
      
      // communityId could be a number or name
      let communityName = communityId.toUpperCase().trim();
      let areaData = areaIndexData?.byCommunityArea?.[communityId];
      
      // If not found by ID, try by name
      if (!areaData) {
        for (const [key, data] of Object.entries(areaIndexData?.byCommunityArea || {})) {
          if (key.toUpperCase() === communityName) {
            areaData = data;
            break;
          }
        }
      }
      
      // Get childcare data
      const childcareData = await getCommunityAreaChildcareAccess(communityName);
      
      // Get display name from childcare data or use the provided ID
      const displayName = childcareData?.communityArea || communityName;
      
      res.json({
        type: 'community',
        id: communityId,
        name: displayName,
        childcare: childcareData ? {
          childrenUnder5: childcareData.childrenUnder5,
          licensedSlots: childcareData.licensedSlots,
          centerSlots: childcareData.centerSlots,
          familyHomeSlots: childcareData.familyHomeSlots,
          childrenPerSlot: childcareData.childrenPerSlot,
          status: childcareData.status,
          statusLabel: childcareData.statusLabel,
          sources: childcareData.sources
        } : null,
        sbifZones: (areaData as any)?.sbifZones || [],
        nmtc: areaData ? {
          totalTracts: (areaData as any).nmtcTotalTracts,
          eligibleTracts: (areaData as any).nmtcEligibleTracts,
          coveragePct: (areaData as any).nmtcCoveragePct
        } : null
      });
    } catch (err) {
      console.error('Area community detail error:', err);
      res.status(500).json({ message: 'Failed to fetch community area data' });
    }
  });

  // West Town tax-delinquency pilot. These endpoints require an active
  // subscriber even though the Discovery page itself is subscriber-gated,
  // preventing direct API access from bypassing that product boundary.
  function requireDiscoverySubscriber(req: Request, res: Response): boolean {
    if (!req.isAuthenticated?.() || !req.user || (req.user as any).plan !== 'subscriber') {
      res.status(403).json({ error: 'A subscriber account is required for Market Discovery.' });
      return false;
    }
    return true;
  }

  app.get('/api/discovery/west-town-tax-pilot', async (req, res) => {
    if (!requireDiscoverySubscriber(req, res)) return;
    try {
      scheduleWestTownTaxPilot();
      res.json(await getWestTownTaxPilotSummary());
    } catch (error: any) {
      console.error('[WEST-TOWN TAX] Summary endpoint failed:', error?.message || error);
      res.status(500).json({ error: 'Unable to load the West Town tax pilot.' });
    }
  });

  app.get('/api/discovery/west-town-tax-pilot/properties', async (req, res) => {
    if (!requireDiscoverySubscriber(req, res)) return;
    scheduleWestTownTaxPilot();
    const requestedStatus = typeof req.query.status === 'string' ? req.query.status : 'all';
    const validStatuses = ['all', 'current', 'delinquent', 'sold', 'unknown'];
    if (!validStatuses.includes(requestedStatus)) {
      return res.status(400).json({ error: 'Invalid tax-status filter.' });
    }
    const page = typeof req.query.page === 'string' ? Number.parseInt(req.query.page, 10) : 1;
    const pageSize = typeof req.query.pageSize === 'string' ? Number.parseInt(req.query.pageSize, 10) : 25;
    if (!Number.isFinite(page) || !Number.isFinite(pageSize)) {
      return res.status(400).json({ error: 'Pagination values must be numbers.' });
    }
    try {
      res.json(await listWestTownTaxPilotProperties(
        requestedStatus as 'all' | 'current' | 'delinquent' | 'sold' | 'unknown',
        page,
        pageSize,
      ));
    } catch (error: any) {
      console.error('[WEST-TOWN TAX] Properties endpoint failed:', error?.message || error);
      res.status(500).json({ error: 'Unable to load West Town tax records.' });
    }
  });

  // Discovery rankings endpoint
  app.get('/api/discovery/rankings/:type', async (req, res) => {
    try {
      const { type } = req.params;
      
      if (type === 'evs') {
        // Compare ZIPs at the latest official county report month, never mixed vintages.
        const evRegPath = path.join(process.cwd(), 'server', 'data', 'ev_registrations.json');
        if (!fs.existsSync(evRegPath)) {
          return res.json({ error: 'EV registration data not available', byZip: [], byCommunityArea: [] });
        }
        
        const evData = JSON.parse(fs.readFileSync(evRegPath, 'utf-8'));
        const byZipCode = evData.byZipCode || {};
        
        const latestMonth = [...(evData.cookCountyMonthly || [])].sort((a, b) => a.year - b.year || a.month - b.month).at(-1);
        const period = latestMonth ? new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
          .format(new Date(Date.UTC(latestMonth.year, latestMonth.month - 1, 15))) : 'date unavailable';
        const zipRankings: { zip: string; count: number }[] = [];
        for (const [zip, monthlyData] of Object.entries(byZipCode)) {
          const data = monthlyData as Array<{year: number; month: number; count: number}>;
          const observation = latestMonth && data.find(d => d.year === latestMonth.year && d.month === latestMonth.month);
          if (observation) {
            zipRankings.push({ zip, count: observation.count });
          }
        }
        
        zipRankings.sort((a, b) => b.count - a.count);
        
        res.json({
          type: 'evs',
          label: `EV Registrations (${period})`,
          byZip: zipRankings.slice(0, 10),
          byCommunityArea: [] // No community area data for EV registrations
        });
        
      } else if (type === 'ev-stations') {
        // Get EV charging stations by ZIP and community area
        const evStationsPath = path.join(__dirname, 'data', 'ev_stations.json');
        if (!fs.existsSync(evStationsPath)) {
          return res.json({ error: 'EV station data not available', byZip: [], byCommunityArea: [] });
        }
        
        const stationData = JSON.parse(fs.readFileSync(evStationsPath, 'utf-8'));
        const stations = stationData.stations || [];
        
        // Count by ZIP
        const byZipMap: Record<string, number> = {};
        for (const station of stations) {
          const zip = station.zip;
          if (zip) {
            byZipMap[zip] = (byZipMap[zip] || 0) + 1;
          }
        }
        
        const zipRankings = Object.entries(byZipMap)
          .map(([zip, count]) => ({ zip, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);
        
        // No community area in EV station data
        res.json({
          type: 'ev-stations',
          label: 'EV Charging Stations',
          byZip: zipRankings,
          byCommunityArea: []
        });
        
      } else if (type === 'hotels') {
        // Get hotels by ZIP and community area
        const hotelsPath = path.join(__dirname, 'data', 'hotels.json');
        if (!fs.existsSync(hotelsPath)) {
          return res.json({ error: 'Hotel data not available', byZip: [], byCommunityArea: [] });
        }
        
        const hotelData = JSON.parse(fs.readFileSync(hotelsPath, 'utf-8'));
        const hotels = hotelData.locations || [];
        
        // Count by ZIP
        const byZipMap: Record<string, number> = {};
        for (const hotel of hotels) {
          const zip = hotel.zip;
          if (zip) {
            byZipMap[zip] = (byZipMap[zip] || 0) + 1;
          }
        }
        
        const zipRankings = Object.entries(byZipMap)
          .map(([zip, count]) => ({ zip, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);
        
        // Count by community area
        const byCaMap: Record<string, number> = {};
        for (const hotel of hotels) {
          const ca = hotel.communityArea;
          if (ca) {
            byCaMap[ca] = (byCaMap[ca] || 0) + 1;
          }
        }
        
        const caRankings = Object.entries(byCaMap)
          .map(([communityArea, count]) => ({ communityArea, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);
        
        res.json({
          type: 'hotels',
          label: 'Hotels',
          byZip: zipRankings,
          byCommunityArea: caRankings
        });
        
      } else if (type === 'grocery') {
        // Get grocery stores by ZIP and community area
        const byZipPath = path.join(__dirname, 'data', 'grocery_by_zip.json');
        const byCaPath = path.join(__dirname, 'data', 'grocery_by_community_area.json');
        
        let zipRankings: { zip: string; count: number }[] = [];
        let caRankings: { communityArea: string; count: number }[] = [];
        
        if (fs.existsSync(byZipPath)) {
          const zipData = JSON.parse(fs.readFileSync(byZipPath, 'utf-8'));
          zipRankings = Object.entries(zipData.data || {})
            .map(([zip, data]: [string, any]) => ({ zip, count: data.storeCount || 0 }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);
        }
        
        if (fs.existsSync(byCaPath)) {
          const caData = JSON.parse(fs.readFileSync(byCaPath, 'utf-8'));
          caRankings = Object.entries(caData.data || {})
            .map(([communityArea, data]: [string, any]) => ({ communityArea, count: data.storeCount || 0 }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);
        }
        
        res.json({
          type: 'grocery',
          label: 'Grocery Stores',
          byZip: zipRankings,
          byCommunityArea: caRankings
        });
        
      } else if (type === 'coffee') {
        // Get coffee shops by ZIP and community area
        const coffeePath = path.join(__dirname, 'data', 'coffee_shops.json');
        if (!fs.existsSync(coffeePath)) {
          return res.json({ error: 'Coffee shop data not available', byZip: [], byCommunityArea: [] });
        }
        
        const coffeeData = JSON.parse(fs.readFileSync(coffeePath, 'utf-8'));
        const shops = coffeeData.locations || [];
        
        // Count by ZIP
        const byZipMap: Record<string, number> = {};
        for (const shop of shops) {
          const zip = shop.zip;
          if (zip) {
            byZipMap[zip] = (byZipMap[zip] || 0) + 1;
          }
        }
        
        const zipRankings = Object.entries(byZipMap)
          .map(([zip, count]) => ({ zip, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);
        
        // Count by community area
        const byCaMap: Record<string, number> = {};
        for (const shop of shops) {
          const ca = shop.communityArea;
          if (ca) {
            byCaMap[ca] = (byCaMap[ca] || 0) + 1;
          }
        }
        
        const caRankings = Object.entries(byCaMap)
          .map(([communityArea, count]) => ({ communityArea, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);
        
        res.json({
          type: 'coffee',
          label: 'Coffee Shops & Cafes',
          byZip: zipRankings,
          byCommunityArea: caRankings
        });
        
      } else if (type === 'gas-stations') {
        // Get gas stations by ZIP and community area
        const gasPath = path.join(__dirname, 'data', 'gas_stations.json');
        if (!fs.existsSync(gasPath)) {
          return res.json({ error: 'Gas station data not available', byZip: [], byCommunityArea: [] });
        }
        
        const gasData = JSON.parse(fs.readFileSync(gasPath, 'utf-8'));
        const stations = gasData.stations || [];
        
        // Count by ZIP
        const byZipMap: Record<string, number> = {};
        for (const station of stations) {
          const zip = station.zip;
          if (zip) {
            byZipMap[zip] = (byZipMap[zip] || 0) + 1;
          }
        }
        
        const zipRankings = Object.entries(byZipMap)
          .map(([zip, count]) => ({ zip, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);
        
        // Count by community area
        const byCaMap: Record<string, number> = {};
        for (const station of stations) {
          const ca = station.communityArea;
          if (ca) {
            byCaMap[ca] = (byCaMap[ca] || 0) + 1;
          }
        }
        
        const caRankings = Object.entries(byCaMap)
          .map(([communityArea, count]) => ({ communityArea, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);
        
        res.json({
          type: 'gas-stations',
          label: 'Gas Stations',
          byZip: zipRankings,
          byCommunityArea: caRankings
        });
        
      } else if (type === 'sbif' || type === 'tif') {
        // Get SBIF/TIF zones by ZIP and community area (ranked by number of zones)
        const areaIndexPath = path.join(__dirname, 'data', 'area_index.json');
        if (!fs.existsSync(areaIndexPath)) {
          return res.json({ error: 'Area index data not available', byZip: [], byCommunityArea: [] });
        }
        
        const areaIndex = JSON.parse(fs.readFileSync(areaIndexPath, 'utf-8'));
        
        // Rank ZIPs by number of SBIF zones
        const zipRankings = Object.entries(areaIndex.byZip || {})
          .map(([zip, data]: [string, any]) => ({
            zip,
            count: (data.sbifZones || []).length,
            zones: (data.sbifZones || []).map((z: any) => z.name)
          }))
          .filter(item => item.count > 0)
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);
        
        // Load community area names for display
        const caGeoPath = path.join(__dirname, 'data', 'chicago_community_areas.geojson');
        let caNameMap: Record<string, string> = {};
        if (fs.existsSync(caGeoPath)) {
          const caGeo = JSON.parse(fs.readFileSync(caGeoPath, 'utf-8'));
          for (const feature of caGeo.features || []) {
            const id = feature.properties?.area_numbe || feature.properties?.area_num_1;
            const name = feature.properties?.community;
            if (id && name) {
              caNameMap[String(id)] = name;
            }
          }
        }
        
        // Rank community areas by number of SBIF zones
        const caRankings = Object.entries(areaIndex.byCommunityArea || {})
          .map(([caId, data]: [string, any]) => ({
            communityArea: caNameMap[caId] || `Community Area ${caId}`,
            count: (data.sbifZones || []).length,
            zones: (data.sbifZones || []).map((z: any) => z.name)
          }))
          .filter(item => item.count > 0)
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);
        
        res.json({
          type: 'sbif',
          label: 'SBIF/TIF Districts',
          byZip: zipRankings,
          byCommunityArea: caRankings
        });
        
      } else if (type === 'nmtc') {
        // Get NMTC coverage by ZIP and community area (ranked by coverage percentage)
        const areaIndexPath = path.join(__dirname, 'data', 'area_index.json');
        if (!fs.existsSync(areaIndexPath)) {
          return res.json({ error: 'Area index data not available', byZip: [], byCommunityArea: [] });
        }
        
        const areaIndex = JSON.parse(fs.readFileSync(areaIndexPath, 'utf-8'));
        
        // Rank ZIPs by NMTC coverage percentage
        const zipRankings = Object.entries(areaIndex.byZip || {})
          .map(([zip, data]: [string, any]) => ({
            zip,
            count: data.nmtcCoveragePct || 0,
            eligibleTracts: data.nmtcEligibleTracts || 0,
            totalTracts: data.nmtcTotalTracts || 0
          }))
          .filter(item => item.count > 0)
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);
        
        // Load community area names for display
        const caGeoPath2 = path.join(__dirname, 'data', 'chicago_community_areas.geojson');
        let caNameMap2: Record<string, string> = {};
        if (fs.existsSync(caGeoPath2)) {
          const caGeo = JSON.parse(fs.readFileSync(caGeoPath2, 'utf-8'));
          for (const feature of caGeo.features || []) {
            const id = feature.properties?.area_numbe || feature.properties?.area_num_1;
            const name = feature.properties?.community;
            if (id && name) {
              caNameMap2[String(id)] = name;
            }
          }
        }
        
        // Rank community areas by NMTC coverage percentage
        const caRankings = Object.entries(areaIndex.byCommunityArea || {})
          .map(([caId, data]: [string, any]) => ({
            communityArea: caNameMap2[caId] || `Community Area ${caId}`,
            count: data.nmtcCoveragePct || 0,
            eligibleTracts: data.nmtcEligibleTracts || 0,
            totalTracts: data.nmtcTotalTracts || 0
          }))
          .filter(item => item.count > 0)
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);
        
        res.json({
          type: 'nmtc',
          label: 'NMTC Eligible Areas',
          byZip: zipRankings,
          byCommunityArea: caRankings
        });
        
      } else {
        res.status(400).json({ error: 'Invalid ranking type' });
      }
    } catch (err) {
      console.error('Discovery rankings error:', err);
      res.status(500).json({ message: 'Failed to fetch discovery rankings' });
    }
  });

  // Retired feature: stale clients must not launch checks or receive cached verdicts.
  app.post('/api/pre-title-check', (_req, res) => {
    res.status(410).json({ success: false, error: 'Pre-Title Check has been retired' });
  });

  // Contractor Discovery API
  const contractorQuerySchema = z.object({
    specialty: z.string().optional(),
    projectScope: z.enum(['ground-up', 'gut-rehab', 'bathroom', 'bathroom-strict', 'kitchen', 'kitchen-strict', 'kitchen-bath', 'addition', 'basement-excavation', 'simple-residential', 'commercial-industrial', 'other']).optional(),
    contractorRole: z.string().max(50).optional(),
    propertyContext: z.enum(['single-family', 'condo', 'multi-family', 'residential-unspecified', 'commercial-industrial', 'unknown', 'one-unit-residential', 'residential-1-4']).optional(),
    neighborhood: z.string().optional(),
    search: z.string().max(100).optional(),
    activeOnly: z.enum(['true', 'false']).optional(),
    sortBy: z.enum(['totalPermits', 'recentActivity', 'avgProjectValue', 'yearsActive', 'searchMatch']).optional(),
    limit: z.string().regex(/^\d+$/).optional().default('50'),
    offset: z.string().regex(/^\d+$/).optional().default('0')
  });
  
  app.get('/api/contractors', async (req, res) => {
    try {
      const parsed = contractorQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid query parameters', details: parsed.error.errors });
      }
      
      const { specialty, projectScope, contractorRole, propertyContext, neighborhood, search, activeOnly, sortBy, limit, offset } = parsed.data;
      
      const rankingsPath = path.join(__dirname, 'data/contractors/rankings.json');
      
      if (!fs.existsSync(rankingsPath)) {
        return res.json({
          contractors: [],
          total: 0,
          specialtyCounts: {},
          neighborhoods: [],
          lastUpdated: null,
          message: 'Contractor data not yet generated. Run build script to populate.'
        });
      }
      
      const data = JSON.parse(fs.readFileSync(rankingsPath, 'utf-8'));
      let contractors = [...data.contractors];
      
      // Filter by specialty — require meaningful work in the trade (primary
      // specialty, or at least 3 permits of that trade in the last 5 years),
      // and attach the trade-specific permit count for display/sorting.
      const bySpecialty = specialty && specialty !== 'all';
      if (bySpecialty) {
        const directWorkKey = specialty === 'hvac' ? 'hvac' :
          specialty === 'deck-porch' ? 'deck' :
          specialty === 'windows-doors' ? 'windows' :
          specialty as string;
        contractors = contractors
          .filter(c =>
            (c.directWorkTypeCounts?.[directWorkKey] || 0) >= 3 ||
            (!c.directWorkTypeCounts && (
              c.primarySpecialty === specialty ||
              (c.specialtyBreakdown && c.specialtyBreakdown[specialty as string] >= 3)
            ))
          )
          .map(c => ({
            ...c,
            specialtyPermits: c.directWorkTypeCounts?.[directWorkKey] || c.specialtyBreakdown?.[specialty as string] || 0
          }));
      }

      if (projectScope || contractorRole || propertyContext) {
        const strictScope = projectScope?.endsWith('-strict') || false;
        const scopeKey = projectScope?.replace('-strict', '');
        const roleKey = contractorRole || '*';
        const matchingEvidenceKeys = (c: any) => Object.keys(c.evidenceCounts || {}).filter(key => {
          const [role, scope, context, unitRange, strictness] = key.split('|');
          return role === roleKey &&
            (!scopeKey || scope === scopeKey) &&
            (!propertyContext ||
              (propertyContext === 'one-unit-residential'
                ? unitRange === 'one-unit'
                : propertyContext === 'residential-1-4'
                  ? unitRange === 'one-unit' || unitRange === 'two-four-units'
                  : context === propertyContext)) &&
            strictness === (strictScope ? 'strict' : 'all');
        });
        contractors = contractors
          .map(c => {
            const keys = matchingEvidenceKeys(c);
            const evidencePermits = keys.reduce((sum, key) => sum + (c.evidenceCounts?.[key] || 0), 0);
            const values = keys.flatMap(key => c.reportedValuesByEvidence?.[key] || []).sort((a, b) => a - b);
            const middle = Math.floor(values.length / 2);
            const median = values.length % 2
              ? values[middle]
              : values.length ? (values[middle - 1] + values[middle]) / 2 : 0;
            return {
              ...c,
              evidencePermits,
              scopePermits: projectScope ? evidencePermits : undefined,
              rolePermits: contractorRole ? evidencePermits : undefined,
              scopeValueStats: values.length ? {
                count: values.length,
                total: Math.round(values.reduce((sum, value) => sum + value, 0)),
                median: Math.round(median),
              } : null,
            };
          })
          .filter(c => c.evidencePermits > 0);
      }
      
      // Filter by neighborhood
      if (neighborhood && neighborhood !== 'all') {
        contractors = contractors.filter(c =>
          c.topNeighborhoods?.some((n: any) => n.name === neighborhood)
        );
      }
      
      // Filter active only — computed live from last permit date (within 90
      // days, matching the card badge) rather than the build-time isActive flag.
      if (activeOnly === 'true') {
        const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
        contractors = contractors.filter(c =>
          c.lastPermitDate && new Date(c.lastPermitDate).getTime() >= cutoff
        );
      }

      const searchText = search?.trim() || '';
      if (searchText) {
        contractors = contractors
          .map(c => {
            const match = getContractorSearchMatch(c, searchText);
            return {
              ...c,
              searchMatchCount: match.count,
              searchMatches: match.labels,
            };
          })
          .filter(c => c.searchMatchCount > 0);
      }
      
      // Sort — when a trade is selected, the default "totalPermits" sort ranks
      // by permits in that trade so the list actually reflects the selection.
      const sortField = sortBy as string || 'totalPermits';
      if (sortField === 'searchMatch') {
        contractors.sort((a, b) =>
          ((b.searchMatchCount || 0) - (a.searchMatchCount || 0)) ||
          ((b.specialtyPermits || 0) - (a.specialtyPermits || 0)) ||
          (b.totalPermits - a.totalPermits)
        );
      } else if (sortField === 'totalPermits') {
        if (projectScope || contractorRole || propertyContext) {
          contractors.sort((a, b) =>
            ((b.evidencePermits || 0) - (a.evidencePermits || 0)) || (b.totalPermits - a.totalPermits)
          );
        } else if (bySpecialty) {
          contractors.sort((a, b) =>
            (b.specialtyPermits - a.specialtyPermits) || (b.totalPermits - a.totalPermits)
          );
        } else {
          contractors.sort((a, b) => b.totalPermits - a.totalPermits);
        }
      } else if (sortField === 'recentActivity') {
        contractors.sort((a, b) => b.recentActivity - a.recentActivity);
      } else if (sortField === 'avgProjectValue') {
        contractors.sort((a, b) => b.avgProjectValue - a.avgProjectValue);
      } else if (sortField === 'yearsActive') {
        contractors.sort((a, b) => b.yearsActive - a.yearsActive);
      }
      
      const total = contractors.length;
      const limitNum = parseInt(limit as string, 10) || 50;
      const offsetNum = parseInt(offset as string, 10) || 0;
      contractors = contractors.slice(offsetNum, offsetNum + limitNum).map((contractor: any) => {
        const listedCityTypes = Object.entries(contractor.rawContactTypeCounts || {})
          .sort((a: any, b: any) => b[1] - a[1])
          .slice(0, 5)
          .map(([type, count]) => ({ type, count }));
        const {
          evidenceCounts: _evidenceCounts,
          reportedValuesByEvidence: _reportedValuesByEvidence,
          rawContactTypeCounts: _rawContactTypeCounts,
          ...publicContractor
        } = contractor;
        return { ...publicContractor, listedCityTypes };
      });
      
      // Get unique neighborhoods from all contractors
      const allNeighborhoods = new Set<string>();
      data.contractors.forEach((c: any) => {
        c.topNeighborhoods?.forEach((n: any) => allNeighborhoods.add(n.name));
      });
      
      res.json({
        contractors,
        total,
        specialtyCounts: data.specialtyCounts || {},
        availableRoles: Array.from(new Set(data.contractors.flatMap((c: any) => Object.keys(c.roleCounts || {})))).sort(),
        neighborhoods: Array.from(allNeighborhoods).sort(),
        lastUpdated: data.lastUpdated
      });
    } catch (err) {
      console.error('Contractor API error:', err);
      res.status(500).json({ error: 'Unable to load contractor data' });
    }
  });
  
  // Get single contractor details
  app.get('/api/contractors/:id', async (req, res) => {
    try {
      const { id } = req.params;
      
      const rankingsPath = path.join(__dirname, 'data/contractors/rankings.json');
      
      if (!fs.existsSync(rankingsPath)) {
        return res.status(404).json({ error: 'Contractor data not available' });
      }
      
      const data = JSON.parse(fs.readFileSync(rankingsPath, 'utf-8'));
      const contractor = data.contractors.find((c: any) => c.id === id);
      
      if (!contractor) {
        return res.status(404).json({ error: 'Contractor not found' });
      }
      
      res.json(contractor);
    } catch (err) {
      console.error('Contractor detail error:', err);
      res.status(500).json({ error: 'Unable to load contractor details' });
    }
  });

  // === NEW CONSTRUCTION PERMITS ===
  app.post('/api/new-construction', async (req, res) => {
    try {
      const { communityArea, lat, lng } = req.body;
      if (lat == null || lng == null) {
        return res.status(400).json({ message: "Latitude and longitude required" });
      }
      const stats = await getNewConstructionStats(communityArea || '', '', parseFloat(lat), parseFloat(lng));
      res.json(stats);
    } catch (err) {
      console.error('New construction lookup error:', err);
      res.status(500).json({ message: "Error looking up new construction data" });
    }
  });

  app.post('/api/nearby-business-licenses', async (req, res) => {
    try {
      const { lat, lng } = req.body;
      if (!lat || !lng) {
        return res.status(400).json({ message: "Latitude and longitude required" });
      }
      const { getNearbyBusinessLicenses } = await import('./businessLicenses');
      const result = await getNearbyBusinessLicenses(parseFloat(lat), parseFloat(lng), 1.0);
      const { getDevelopmentCorridor } = await import('./developmentPipeline');
      res.json({
        ...result,
        licenses: result.licenses.map(license => ({
          ...license,
          corridor: getDevelopmentCorridor(license.address, license.latitude, license.longitude),
        })),
      });
    } catch (err) {
      console.error('Nearby business licenses error:', err);
      res.status(500).json({ message: "Error looking up nearby business licenses" });
    }
  });

  app.post('/api/nearby-art-galleries', async (req, res) => {
    try {
      const { lat, lng } = req.body;
      if (!lat || !lng) {
        return res.status(400).json({ message: "Latitude and longitude required" });
      }
      const { getNearbyArtGalleries } = await import('./businessLicenses');
      const result = await getNearbyArtGalleries(parseFloat(lat), parseFloat(lng), 1.0);
      res.json(result);
    } catch (err) {
      console.error('Nearby art galleries error:', err);
      res.status(500).json({ message: "Error looking up nearby art galleries" });
    }
  });

  app.post('/api/places-of-worship', async (req, res) => {
    try {
      const { lat, lng } = req.body;
      if (!lat || !lng) return res.status(400).json({ message: 'lat and lng required' });
      const pLat = parseFloat(lat);
      const pLng = parseFloat(lng);
      const apiKey = process.env.GOOGLE_PLACES_API_KEY;
      if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY not configured');
      // Google Places API (New) searchNearby — one query per worship type (max 20 each),
      // run in parallel so churches don't crowd out mosques/synagogues/temples.
      const typeReligionMap: Record<string, string> = {
        church: 'christian', mosque: 'muslim', synagogue: 'jewish', hindu_temple: 'hindu',
      };
      const worshipTypes = Object.keys(typeReligionMap);
      const searchOne = async (includedType: string) => {
        const r = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': 'places.id,places.displayName,places.shortFormattedAddress,places.location,places.types,places.businessStatus',
          },
          body: JSON.stringify({
            includedTypes: [includedType],
            maxResultCount: 20,
            locationRestriction: { circle: { center: { latitude: pLat, longitude: pLng }, radius: 1609 } },
          }),
        });
        const j = await r.json() as { places?: any[]; error?: { message?: string; status?: string } };
        if (!r.ok || j.error) throw new Error(`Google Places (${includedType}): ${j.error?.status || r.status} ${j.error?.message || ''}`);
        return (j.places || []).map((p: any) => ({ ...p, _requestedType: includedType }));
      };
      const allResults = (await Promise.all(worshipTypes.map(searchOne))).flat();
      // Words that indicate a non-religious business even if a religious word appears in the name
      const foodBevEntertainmentBlocklist = /\b(beer|brew|brewing|brewery|bar |bars|pub |pubs|tavern|winery|wine |spirits|liquor|cocktail|restaurant|cafe|coffee|diner|grill|kitchen|bistro|eatery|food|bbq|pizza|burger|sushi|ramen|taco|bakery|nightclub|club |clubs|lounge|theater|theatre|cinema|arcade|bowling|gym|fitness|spa |salon|tattoo|vape|smoke|chicken|wings|ribs|steak|seafood|sandwich|hot dog|donut|doughnut|bagel|waffle|pancake|burrito|noodle|juice bar|smoothie|ice cream|steakhouse|chophouse|buffet|catering|takeout|drive.thru)\b/i;
      const educationBlocklist = /\b(school|college|university|academy|preparatory|montessori|preschool|kindergarten|day care|daycare|nursery school|high school|middle school|elementary|k-12|law school|language school)\b/i;
      const seen = new Set<string>();
      const places = allResults.reduce((acc: any[], el: any) => {
        const name = el.displayName?.text || null;
        if (!name) return acc;
        if (el.businessStatus === 'CLOSED_PERMANENTLY') return acc;
        const nameLower = name.toLowerCase();
        // Exclude non-religious businesses and schools that slip in
        if (foodBevEntertainmentBlocklist.test(nameLower)) return acc;
        if (educationBlocklist.test(nameLower)) return acc;
        // Exclude yoga unless it also mentions meditation or is a specifically spiritual yoga tradition
        if (/yoga/.test(nameLower) && !/meditation|kriya|kundalini|vedanta|ashram|tantra/.test(nameLower)) return acc;
        const address = (el.shortFormattedAddress || '').replace(/, Chicago$/i, '') || null;
        const dedupeKey = `${name}|${address}`;
        if (seen.has(dedupeKey)) return acc;
        seen.add(dedupeKey);
        const inferFromName = () => {
          if (/gurdwara|gurudwara|sikh/.test(nameLower)) return 'sikh';
          if (/masjid|mosque|islamic center|islamic centre|muslim|sufi|sufism/.test(nameLower)) return 'muslim';
          if (/mandir|hindu|vedic/.test(nameLower)) return 'hindu';
          if (/synagogue|jewish|beth |b'nai|temple israel/.test(nameLower)) return 'jewish';
          if (/buddhist|pagoda|zen |buddha|dhamma|dharma/.test(nameLower)) return 'buddhist';
          if (/bahai|baha'i/.test(nameLower)) return 'bahai';
          if (/jain|jainism/.test(nameLower)) return 'jain';
          if (/meditation/.test(nameLower)) return 'buddhist';
          if (/church|cathedral|chapel|christian|st\.|saint |holy |sacred/.test(nameLower)) return 'christian';
          return null;
        };
        const typeReligion = (el.types || []).map((t: string) => typeReligionMap[t]).find(Boolean) || null;
        const religion = typeReligion || inferFromName() || typeReligionMap[el._requestedType] || null;
        acc.push({
          id: el.id || `${name}-${address}`,
          name,
          religion,
          denomination: null,
          address,
          lat: el.location?.latitude ?? null,
          lng: el.location?.longitude ?? null,
        });
        return acc;
      }, []);
      places.sort((a: any, b: any) => {
        const ra = a.religion || 'zzz';
        const rb = b.religion || 'zzz';
        if (ra !== rb) return ra.localeCompare(rb);
        return (a.name || 'Unnamed').localeCompare(b.name || 'Unnamed');
      });
      res.json({ places, totalCount: places.length, radiusMiles: 1 });
    } catch (err) {
      console.error('Places of worship error:', err);
      res.status(500).json({ message: 'Error fetching places of worship' });
    }
  });

  // Address-specific article search — finds news articles that explicitly mention this property address
  app.get('/api/address-news', async (req, res) => {
    try {
      const address = (req.query.address as string || '').trim();
      if (!address) return res.status(400).json({ error: 'address param required' });
      const { findAddressArticles } = await import('./newsMonitor');
      const articles = await findAddressArticles(address, 1095); // 3 years
      res.json({ address, article_count: articles.length, articles });
    } catch (err) {
      console.error('Address news error:', err);
      res.status(500).json({ error: 'Error fetching address news' });
    }
  });

  app.get('/api/neighborhood-news', async (req, res) => {
    try {
      const neighborhood = (req.query.neighborhood as string || '').trim();
      if (!neighborhood) {
        return res.status(400).json({ error: 'neighborhood param required' });
      }
      const { calculateMomentumScore, findRelevantPodcasts } = await import('./newsMonitor');
      const { getNeighborhoodNewsArchive } = await import('./neighborhoodNewsArchive');
      const [archive, podcasts] = await Promise.all([
        getNeighborhoodNewsArchive(neighborhood),
        findRelevantPodcasts(neighborhood, NEIGHBORHOOD_NEWS_DAYS),
      ]);
      const score = calculateMomentumScore(archive);
      const label = score >= 75 ? 'High Activity' : score >= 50 ? 'Moderate Activity' : 'Low Activity';
      res.json({
        neighborhood,
        article_count: archive.length,
        momentum_score: score,
        momentum_label: label,
        momentum_signals: `${archive.length} articles in the past year`,
        articles: archive.slice(0, 12),
        archive,
        podcasts,
      });
    } catch (err) {
      console.error('Neighborhood news error:', err);
      res.status(500).json({ error: 'Error fetching neighborhood news' });
    }
  });

  const handleCorridorNewsRequest = async (req: Request, res: Response) => {
    try {
      const raw = req.method === 'POST' ? req.body : req.query;
      const { validateCorridorNewsInput, getCorridorNews } = await import('./corridorIntelligence');
      const input = validateCorridorNewsInput(raw);
      if (!input) {
        return res.status(400).json({
          error: 'lat and lng must be valid coordinates; address, neighborhood, communityArea, and exclusions must be bounded valid values',
        });
      }
      return res.json(await getCorridorNews(input));
    } catch (err) {
      console.error('Corridor news error:', err);
      return res.status(500).json({ error: 'Error fetching corridor news' });
    }
  };
  app.get('/api/corridor-news', handleCorridorNewsRequest);
  app.post('/api/corridor-news', handleCorridorNewsRequest);

  app.get('/api/zba-approvals', async (req, res) => {
    try {
      const ward = parseInt(req.query.ward as string);
      if (isNaN(ward) || ward < 1 || ward > 50) {
        return res.status(400).json({ error: 'Valid ward (1-50) required' });
      }
      const { getZbaApprovals, getZbaUpcoming } = await import('./zbaApprovals');
      const [approvals, upcoming] = await Promise.all([getZbaApprovals(ward), getZbaUpcoming(ward)]);
      res.json({ approvals, upcoming });
    } catch (err) {
      console.error('[ZBA-APPROVALS] Error:', err);
      res.status(500).json({ error: 'Failed to fetch ZBA approvals' });
    }
  });

  app.get('/api/transaction-trends', async (req, res) => {
    try {
      const zip = (req.query.zip as string || '').trim();
      if (!/^\d{5}$/.test(zip)) return res.status(400).json({ error: 'Valid 5-digit ZIP required' });
      const { getTransactionTrends } = await import('./transactionTrends');
      const { persistentTransactionTrendsCache } = await import('./transactionTrendsCache');
      const result = await getTransactionTrends(zip, persistentTransactionTrendsCache);
      if (!result) return res.status(503).json({ error: 'Transaction data not yet available' });
      res.json(result);
    } catch (err) {
      console.error('[TransactionTrends] Error:', err);
      res.status(503).json({
        error: 'Transaction data not yet available',
        ...(process.env.NODE_ENV === 'development'
          ? { detail: err instanceof Error ? err.message : String(err) }
          : {}),
      });
    }
  });

  app.post('/api/zba-approvals/refresh', async (req, res) => {
    try {
      const { forceRefreshZbaCache } = await import('./zbaApprovals');
      console.log('[ZBA-APPROVALS] Manual refresh triggered');
      await forceRefreshZbaCache();
      res.json({ ok: true, message: 'ZBA cache refreshed' });
    } catch (err) {
      console.error('[ZBA-APPROVALS] Refresh error:', err);
      res.status(500).json({ error: 'Failed to refresh ZBA cache' });
    }
  });

  app.get('/api/comparable-sales', async (req, res) => {
    try {
      const lat = parseFloat(req.query.lat as string);
      const lng = parseFloat(req.query.lng as string);
      const propertyClass = (req.query.propertyClass as string || '').trim();
      const sqft = req.query.sqft ? parseInt(req.query.sqft as string) : null;
      const beds = req.query.beds ? parseInt(req.query.beds as string) : null;
      const baths = req.query.baths ? parseInt(req.query.baths as string) : null;
      const radiusMiles = parseFloat(req.query.radius as string || '0.75');
      const monthsBack = parseInt(req.query.months as string || '18');

      if (isNaN(lat) || isNaN(lng) || !propertyClass) {
        return res.status(400).json({ error: 'lat, lng, and propertyClass are required' });
      }

      const { getComparableSales } = await import('./comparableSales');
      const result = await getComparableSales(lat, lng, propertyClass, sqft, beds, baths, radiusMiles, monthsBack);
      res.json(result);
    } catch (err) {
      console.error('[COMPS ROUTE] Error:', err);
      res.status(500).json({ error: 'Failed to fetch comparable sales' });
    }
  });

  // Nearby CPS Schools
  app.get('/api/schools-nearby', async (req, res) => {
    try {
      const lat = parseFloat(req.query.lat as string);
      const lon = parseFloat(req.query.lon as string);
      const radius = parseFloat((req.query.radius as string) || '1.5');
      if (isNaN(lat) || isNaN(lon)) return res.status(400).json({ error: 'lat and lon required' });
      const { getNearbySchools } = await import('./schoolsNearby');
      const result = await getNearbySchools(lat, lon, Math.min(radius, 3));
      res.json(result);
    } catch (err) {
      console.error('[SCHOOLS] Route error:', err);
      res.status(500).json({ error: 'Error fetching school data' });
    }
  });

  // Crexi commercial lease market (expanding radius search, corridor-first)
  app.get('/api/loopnet', async (req, res) => {
    try {
      const lat = parseFloat(req.query.lat as string);
      const lon = parseFloat(req.query.lon as string);
      const zipCode = (req.query.zipCode as string || '').trim();
      const street = (req.query.street as string || '').trim();
      const address = (req.query.address as string || street).trim();
      if (isNaN(lat) || isNaN(lon)) {
        return res.status(400).json({ error: 'Valid lat and lon required' });
      }
      if (!zipCode) {
        return res.status(400).json({ error: 'zipCode is required' });
      }
      const { fetchCrexiData } = await import('./crexi');
      const result = await fetchCrexiData(lat, lon, zipCode, address || zipCode);
      if (!result) return res.status(404).json({ error: 'No Crexi data available' });
      res.json(result);
    } catch (err) {
      console.error('[CREXI] Route error:', err);
      res.status(500).json({ error: 'Error fetching Crexi data' });
    }
  });

  app.get('/api/google-places', async (req, res) => {
    try {
      const lat = parseFloat(req.query.lat as string);
      const lon = parseFloat(req.query.lon as string);
      const searchTerm = (req.query.searchTerm as string || '').trim();
      if (isNaN(lat) || isNaN(lon)) {
        return res.status(400).json({ error: 'Valid lat and lon required' });
      }
      if (!searchTerm) {
        return res.status(400).json({ error: 'searchTerm is required' });
      }
      const { fetchGooglePlacesData } = await import('./google-places');
      const terms = searchTerm.split(',').map((t: string) => t.trim()).filter(Boolean);
      if (terms.length <= 1) {
        const result = await fetchGooglePlacesData(lat, lon, searchTerm);
        return res.json(result);
      }
      // Multiple terms — parallel searches, merge + deduplicate
      const results = await Promise.all(terms.map((t: string) => fetchGooglePlacesData(lat, lon, t)));
      const seen = new Set<string>();
      const merged: any[] = [];
      for (const r of results) {
        for (const p of (r.places || [])) {
          const key = `${(p.name || '').toUpperCase()}|${(p.address || '').toUpperCase()}`;
          if (!seen.has(key)) { seen.add(key); merged.push(p); }
        }
      }
      merged.sort((a: any, b: any) => (a.distanceMiles ?? 99) - (b.distanceMiles ?? 99));
      const ratings = merged.map((p: any) => p.rating).filter((r: any) => r !== null);
      const avgRating = ratings.length
        ? parseFloat((ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length).toFixed(1))
        : null;
      res.json({
        places: merged,
        count: merged.length,
        searchTerm: terms.join(', '),
        avgRating,
        fetchedAt: new Date().toISOString(),
        status: 'complete',
      });
    } catch (err) {
      console.error('[GPLACES] Route error:', err);
      res.status(500).json({ error: 'Error fetching Google Places data' });
    }
  });

  app.get('/api/peerspace', async (req, res) => {
    try {
      const lat = parseFloat(req.query.lat as string);
      const lon = parseFloat(req.query.lon as string);
      const zipCode = (req.query.zipCode as string || '').trim();
      if (isNaN(lat) || isNaN(lon)) {
        return res.status(400).json({ error: 'Valid lat and lon required' });
      }
      if (!zipCode) {
        return res.status(400).json({ error: 'zipCode is required' });
      }
      const { fetchPeerspaceData } = await import('./peerspace');
      const result = await fetchPeerspaceData(lat, lon, zipCode);
      res.json(result);
    } catch (err) {
      console.error('[PEERSPACE] Route error:', err);
      res.status(500).json({ error: 'Error fetching Peerspace data' });
    }
  });

  app.get('/api/airbnb-stats', async (req, res) => {
    try {
      const communityArea = (req.query.communityArea as string || '').trim();
      if (!communityArea) return res.status(400).json({ error: 'communityArea required' });
      const { getAirbnbStats } = await import('./airbnbStats');
      const result = await getAirbnbStats(communityArea);
      if (!result) return res.status(404).json({ error: 'No Airbnb data for this neighborhood' });
      res.json(result);
    } catch (err) {
      console.error('[AIRBNB] Route error:', err);
      res.status(500).json({ error: 'Error fetching Airbnb data' });
    }
  });

  // RentCast real-time rental market data (ZIP-level)
  app.get('/api/rentcast', async (req, res) => {
    try {
      const zipCode = (req.query.zipCode as string || '').trim();
      if (!zipCode || !/^\d{5}$/.test(zipCode)) {
        return res.status(400).json({ error: 'Valid 5-digit zipCode required' });
      }
      const { getRentcastMarket } = await import('./rentcast');
      const result = await getRentcastMarket(zipCode);
      if (!result) return res.status(404).json({ error: 'No RentCast data for this ZIP' });
      res.json(result);
    } catch (err) {
      console.error('[RENTCAST] Route error:', err);
      res.status(500).json({ error: 'Error fetching RentCast data' });
    }
  });

  // RentCast radius-based rental listings (within 0.75 miles)
  app.get('/api/rentcast/radius', async (req, res) => {
    try {
      const lat = parseFloat(req.query.lat as string);
      const lng = parseFloat(req.query.lng as string);
      const zipCode = (req.query.zipCode as string || '').trim();
      if (isNaN(lat) || isNaN(lng)) {
        return res.status(400).json({ error: 'Valid lat and lng required' });
      }
      const { getRentcastRadius } = await import('./rentcast');
      const result = await getRentcastRadius(lat, lng, zipCode || undefined);
      if (!result) return res.status(404).json({ error: 'No listings found within radius' });
      res.json(result);
    } catch (err) {
      console.error('[RENTCAST RADIUS] Route error:', err);
      res.status(500).json({ error: 'Error fetching radius rental data' });
    }
  });

  // Upcoming Developments - news and permits, supplemented by bounded DPD Plan Commission applications.
  function haversineDistanceMi(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 3958.8;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  app.get('/api/upcoming-developments', async (req, res) => {
    try {
      const neighborhood = (req.query.neighborhood as string) || '';
      const communityArea = (req.query.communityArea as string) || '';
      const subjectLat = req.query.lat ? parseFloat(req.query.lat as string) : null;
      const subjectLon = req.query.lon ? parseFloat(req.query.lon as string) : null;
      const requestedRadius = Number(req.query.radiusMi);
      const radiusMi = requestedRadius === 1 ? 1 : 0.5;

      const { getUpcomingDevelopments, filterDevelopmentsByNeighborhood, isDevelopmentArticle, parseUnits, parseStories, extractStatus, parseUseType, parseDeveloper, detectNeighborhoods, parseAddress } = await import('./upcomingDevelopments');
      const { summarizeDevelopmentUnits } = await import('@shared/developmentUnitCoverage');
      const { getBorderingAreas, findRelevantArticles } = await import('./newsMonitor');
      const { buildDevelopmentPipeline, normalizeAddrForMatch, addressesMatchForPipeline } = await import('./developmentPipeline');
      const hasSubjectPoint = Number.isFinite(subjectLat) && Number.isFinite(subjectLon);
      const subjectWard = hasSubjectPoint ? lookupWardByCoordinates(subjectLat!, subjectLon!).ward : null;
      const wardNumber = subjectWard && /^\d+$/.test(subjectWard) ? Number(subjectWard) : null;

      const constructionPromise = hasSubjectPoint
        ? import('./newConstruction').then(({ getNearbyNewConstruction }) =>
            getNearbyNewConstruction(subjectLat!, subjectLon!, communityArea, 1))
        : Promise.resolve(null);
      const zbaPromise = hasSubjectPoint
        ? import('./zbaApprovals').then(({ getAllZbaActivitySnapshot }) => getAllZbaActivitySnapshot())
        : Promise.resolve(null);
      const [allSettled, dpdSettled, constructionSettled, zbaSettled] = await Promise.allSettled([
        getUpcomingDevelopments(),
        import('./dpdApplications').then(({ getDpdApplications }) => getDpdApplications()),
        constructionPromise,
        zbaPromise,
      ]);
      const all = allSettled.status === 'fulfilled' ? allSettled.value : [];
      const dpdResult = dpdSettled.status === 'fulfilled' ? dpdSettled.value : null;
      const constructionResult = constructionSettled.status === 'fulfilled' ? constructionSettled.value : null;
      const zbaResult = zbaSettled.status === 'fulfilled' ? zbaSettled.value : null;

      // Augment with multi-source neighborhood articles (Crain's, YIMBY, Real Deal, Block Club neighborhood feeds)
      // These are already neighborhood-scoped by findRelevantArticles — just filter to dev keywords
      const augmented = [...all];
      const neighborhoodQuery = neighborhood || communityArea;
      if (neighborhoodQuery) {
        try {
          const newsArticles = await findRelevantArticles(neighborhoodQuery, 120);
          const existingUrls = new Set(all.map((d: any) => d.url).filter(Boolean));
          for (const article of newsArticles) {
            if (!article.url || existingUrls.has(article.url)) continue;
            if (!isDevelopmentArticle(article.title, article.summary || '')) continue;
            existingUrls.add(article.url);
            const combined = `${article.title} ${article.summary || ''}`;
            const unitCount = parseUnits(combined);
            augmented.push({
              id: `news-${article.url}`,
              source: 'blockclub',
              publisher: article.source,
              stage: 2,
              title: article.title,
              url: article.url,
              publishDate: article.published || new Date().toISOString(),
              address: parseAddress(article.title) || parseAddress((article.summary || '').substring(0, 600)),
              units: unitCount.units,
              unitsAmbiguous: unitCount.ambiguous,
              stories: parseStories(combined),
              developer: parseDeveloper(combined),
              status: extractStatus(article.title),
              description: (article.summary || '').substring(0, 280).trim(),
              neighborhoods: detectNeighborhoods(combined, article.url),
              useType: parseUseType(combined),
            });
          }
        } catch (err) {
          console.error('[UPCOMING DEV] Multi-source news fetch error:', err);
        }
      }

      const allowedAreas = new Set<string>();
      if (neighborhood) allowedAreas.add(neighborhood.toLowerCase());
      if (communityArea) allowedAreas.add(communityArea.toLowerCase());
      getBorderingAreas(neighborhood, communityArea).forEach(a => allowedAreas.add(a));

      let filtered = filterDevelopmentsByNeighborhood(augmented, allowedAreas);

      // Fallback: if neighborhood filter yields nothing, return top Chicago-wide
      // development articles so the section is never empty
      const citywideFallback = filtered.length === 0;
      if (citywideFallback) {
        // Fallback to citywide permits only — never show Block Club articles from other neighborhoods
        filtered = all.filter((d: any) => d.stage === 1).slice(0, 15);
      }

      // Annotate each development with distance from subject property
      const filteredWithDistance = filtered.map(d => {
        if (hasSubjectPoint && d.lat != null && d.lon != null) {
          const distanceMi = haversineDistanceMi(subjectLat!, subjectLon!, d.lat, d.lon);
          return { ...d, distanceMi: Math.round(distanceMi * 100) / 100 };
        }
        return d;
      });

      const stage2 = filteredWithDistance.filter(d => Number(d.stage) === 2);
      const stage1 = filteredWithDistance.filter(d => Number(d.stage) === 1);
      const dpdApplications = hasSubjectPoint && dpdResult
        ? dpdResult.applications
          .filter(application => application.latitude != null && application.longitude != null)
          .map(application => ({
            ...application,
            distanceMi: Math.round(haversineDistanceMi(subjectLat!, subjectLon!, application.latitude!, application.longitude!) * 100) / 100,
          }))
          .filter(application => application.distanceMi <= radiusMi)
        : [];
      const dpdGeocodedCount = dpdResult?.coverage.geocodedCount ?? 0;
      const dpdUngeocodedCount = dpdResult
        ? Math.max(0, dpdResult.applications.length - dpdGeocodedCount)
        : null;
      const dpdCoverageStatus = !dpdResult || !hasSubjectPoint || dpdResult.coverage.successfulPageCount === 0
        ? 'unavailable'
        : Boolean(dpdResult.coverage.complete) &&
            dpdResult.coverage.successfulPageCount === dpdResult.coverage.pageCount &&
            dpdUngeocodedCount === 0
          ? 'available'
          : 'partial';
      const pipelineDpdAvailable = dpdCoverageStatus === 'available';

      // Cross-reference Block Club article addresses with permit addresses
      // to detect articles that are likely reporting on a project that already has a permit
      const stage1Addrs = new Set(
        [
          ...stage1.filter(d => d.address).map(d => normalizeAddrForMatch(d.address!)),
          ...(constructionResult?.permits || []).filter(permit => permit.address).map(permit => normalizeAddrForMatch(permit.address)),
        ]
      );
      let articlePermitOverlapCount = 0;
      for (const article of stage2) {
        if (!article.address) continue;
        const overlaps = Array.from(stage1Addrs).some(pAddr => addressesMatchForPipeline(article.address, pAddr));
        if (overlaps) articlePermitOverlapCount++;
      }

      // Official proposal totals come only from nearby Plan Commission applications.
      // Article counts remain a separate leading indicator; permits carry no unit total.
      const dpdUnitsNearby = pipelineDpdAvailable
        ? summarizeDevelopmentUnits(dpdApplications)
        : null;
      const nearbyPermitCount = constructionResult?.permits.length ?? null;
      const hasZbaCoordinates = (item: { lat?: number; lon?: number }): item is { lat: number; lon: number } =>
        Number.isFinite(item.lat) && Number.isFinite(item.lon);

      const wardRecentApprovals = zbaResult && wardNumber != null
        ? zbaResult.recentApprovals.filter(approval => approval.ward === wardNumber).map(approval => {
            const distanceMi = hasZbaCoordinates(approval)
              ? haversineDistanceMi(subjectLat!, subjectLon!, approval.lat, approval.lon)
              : null;
            return { ...approval, distanceMi: distanceMi == null ? null : Math.round(distanceMi * 100) / 100 };
          })
        : [];
      const wardUpcomingCases = zbaResult && wardNumber != null
        ? zbaResult.upcomingCases.filter(caseItem => caseItem.ward === wardNumber).map(caseItem => {
            const distanceMi = hasZbaCoordinates(caseItem)
              ? haversineDistanceMi(subjectLat!, subjectLon!, caseItem.lat, caseItem.lon)
              : null;
            return { ...caseItem, distanceMi: distanceMi == null ? null : Math.round(distanceMi * 100) / 100 };
          })
        : [];
      const recentApprovals = wardRecentApprovals.filter(approval =>
        hasZbaCoordinates(approval) &&
        haversineDistanceMi(subjectLat!, subjectLon!, approval.lat, approval.lon) <= 1);
      const upcomingCases = wardUpcomingCases.filter(caseItem =>
        hasZbaCoordinates(caseItem) &&
        haversineDistanceMi(subjectLat!, subjectLon!, caseItem.lat, caseItem.lon) <= 1);
      const zbaWardMissingCoordinateCount = [...wardRecentApprovals, ...wardUpcomingCases]
        .filter(item => !hasZbaCoordinates(item)).length;
      const zbaFetchCoverageKnown = !!zbaResult &&
        !zbaResult.coverage.note.startsWith('Loaded the last-good database snapshot') &&
        !zbaResult.coverage.note.startsWith('Refreshing a stale snapshot') &&
        !zbaResult.coverage.note.startsWith('Refresh failed;');
      const zbaFetchComplete = !!zbaResult && zbaFetchCoverageKnown &&
        zbaResult.coverage.agenda.successfulMonths === zbaResult.coverage.agenda.expectedMonths &&
        zbaResult.coverage.decisions.successfulMonths === zbaResult.coverage.decisions.expectedMonths;
      const zbaCoverageStatus = !zbaResult || !hasSubjectPoint || wardNumber == null ||
        zbaResult.coverage.status === 'unavailable'
        ? 'unavailable'
        : !zbaFetchComplete || zbaWardMissingCoordinateCount > 0
          ? 'partial'
          : 'available';
      const pipelineResult = buildDevelopmentPipeline({
        permits: constructionResult?.permits || [],
        dpdApplications,
        recentApprovals,
        upcomingCases,
        zbaEvidenceRecentApprovals: wardRecentApprovals,
        zbaEvidenceUpcomingCases: wardUpcomingCases,
        developments: filteredWithDistance,
        additionalPermitRecords: stage1,
      });
      const pipelinePermits = constructionResult ? pipelineResult.permits : null;
      const annotatedDevelopments = pipelineResult.developments;
      const pipelinePermitAvailable = !!constructionResult && hasSubjectPoint;
      const pipelineZbaAvailable = zbaCoverageStatus === 'available';
      const observedPipelineAvailable = pipelinePermitAvailable &&
        (dpdCoverageStatus !== 'unavailable' || zbaCoverageStatus !== 'unavailable');
      const pipeline = {
        ...pipelineResult.metrics,
        unitsUnderConstruction: pipelinePermitAvailable ? pipelineResult.metrics.unitsUnderConstruction : null,
        activePermitCount: pipelinePermitAvailable ? pipelineResult.metrics.activePermitCount : null,
        observedPotentialUnits: observedPipelineAvailable ? pipelineResult.metrics.potentialUnits : null,
        observedCommercialProposals: observedPipelineAvailable ? pipelineResult.metrics.commercialProposals : null,
        potentialUnits: pipelinePermitAvailable && pipelineDpdAvailable && pipelineZbaAvailable
          ? pipelineResult.metrics.potentialUnits
          : null,
        commercialProposals: pipelinePermitAvailable && pipelineDpdAvailable && pipelineZbaAvailable
          ? pipelineResult.metrics.commercialProposals
          : null,
        sourceCoverage: {
          permits: {
            status: pipelinePermitAvailable ? 'available' : 'unavailable',
            recordCount: constructionResult?.permits.length ?? null,
            ...(constructionSettled.status === 'rejected' ? { error: (constructionSettled.reason as Error)?.message || 'Permit source failed' } : {}),
            ...(!hasSubjectPoint ? { note: 'Subject coordinates are required to select the one-mile permit scope.' } : {}),
            unitsSource: 'description',
          },
          dpdApplications: {
            status: dpdCoverageStatus,
            recordCount: dpdCoverageStatus === 'unavailable' ? null : dpdApplications.length,
            ...(dpdResult ? { coverage: dpdResult.coverage } : {}),
            missingCoordinateCount: dpdUngeocodedCount,
            ...(dpdSettled.status === 'rejected' ? { error: (dpdSettled.reason as Error)?.message || 'DPD source failed' } : {}),
            ...(!hasSubjectPoint ? { note: 'Subject coordinates are required to apply the DPD radius.' } : {}),
          },
          zbaActivity: {
            status: zbaCoverageStatus,
            refreshing: zbaResult?.coverage.refreshing ?? false,
            recordCount: zbaResult && wardNumber != null ? wardRecentApprovals.length + wardUpcomingCases.length : null,
            missingCoordinateCount: zbaResult && wardNumber != null ? zbaWardMissingCoordinateCount : null,
            ward: wardNumber,
            radiusMiles: 1,
            geographicallyEligibleCount: recentApprovals.length + upcomingCases.length,
            beyondRadiusCount: wardRecentApprovals.filter(item =>
              hasZbaCoordinates(item) &&
              haversineDistanceMi(subjectLat!, subjectLon!, item.lat, item.lon) > 1).length +
              wardUpcomingCases.filter(item =>
                hasZbaCoordinates(item) &&
                haversineDistanceMi(subjectLat!, subjectLon!, item.lat, item.lon) > 1).length,
            ...(zbaResult ? { coverage: zbaResult.coverage } : {}),
            ...(zbaSettled.status === 'rejected' ? { error: (zbaSettled.reason as Error)?.message || 'ZBA source failed' } : {}),
            ...(!hasSubjectPoint ? { note: 'Subject coordinates are required to identify the report ward and one-mile pipeline scope.' } : {}),
            ...(wardNumber == null && hasSubjectPoint ? { note: 'A report ward could not be resolved from the subject coordinates.' } : {}),
            ...(zbaResult ? { note: zbaResult.coverage.note } : {}),
          },
          developmentNews: {
            status: allSettled.status === 'fulfilled' ? 'partial' : 'unavailable',
            recordCount: allSettled.status === 'fulfilled' ? all.length : null,
            ...(allSettled.status === 'rejected' ? { error: (allSettled.reason as Error)?.message || 'Development news source failed' } : {}),
            note: 'The existing RSS loader can suppress per-feed failures; news is annotated for context only and excluded from pipeline arithmetic.',
          },
        },
      };
      const annotatedNearestPermit = constructionResult?.nearestActivePermit
        ? pipelineResult.permits.find(permit => permit.permitNumber === constructionResult.nearestActivePermit!.permitNumber) || {
            ...constructionResult.nearestActivePermit,
            corridor: null,
            pipelineStage: 'permitted' as const,
          }
        : null;
      const newConstruction = constructionResult
        ? { ...constructionResult, permits: pipelineResult.permits, nearestActivePermit: annotatedNearestPermit }
        : null;

      res.json({
        total: filtered.length,
        stage2Count: stage2.length,
        stage1Count: stage1.length,
        developments: annotatedDevelopments,
        dpdApplications: pipelineResult.dpdApplications,
        dpdCoverage: dpdResult?.coverage ?? null,
        citywideFallback,
        dpdUnitsNearby,
        nearbyPermitCount,
        articlePermitOverlapCount,
        pipeline,
        sourceCoverage: pipeline.sourceCoverage,
        pipelinePermits,
        newConstruction,
        zbaActivity: {
          recentApprovals: pipelineResult.recentApprovals,
          upcomingCases: pipelineResult.upcomingCases,
        },
      });
    } catch (err) {
      console.error('[UPCOMING DEV] Route error:', err);
      res.status(500).json({ error: 'Error fetching upcoming developments' });
    }
  });

  app.get('/api/discovery/architects', async (req, res) => {
    try {
      const { getArchitectRankings } = await import('./architectRankings');
      const { normalizeFirmName } = await import('./dobEnrichment');
      const all = await getArchitectRankings();
      const sortBy = (req.query.sortBy as string) || 'total_projects';
      const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 200) : '';
      const limit = Math.min(parseInt(req.query.limit as string || '100'), 200);
      const offset = parseInt(req.query.offset as string || '0');

      const sorted = [...all].sort((a, b) => {
        switch (sortBy) {
          case 'total_value': return b.totalValue - a.totalValue;
          case 'new_construction': return b.newConstructionCount - a.newConstructionCount;
          case 'renovation': return b.renovationCount - a.renovationCount;
          case 'self_cert': return b.selfCertCount - a.selfCertCount;
          case 'single_family': return b.singleFamilyCount - a.singleFamilyCount;
          case 'multi_family': return b.multiFamilyCount - a.multiFamilyCount;
          case 'mixed_use': return b.mixedUseCommercialCount - a.mixedUseCommercialCount;
          case 'industrial': return b.industrialCount - a.industrialCount;
          default: return b.totalProjects - a.totalProjects;
        }
      });

      const ranked = sorted.map((entry, index) => ({ ...entry, citywideRank: index + 1 }));
      const searchKey = normalizeFirmName(search);
      const matching = searchKey
        ? ranked.filter(entry => {
            const entryKey = normalizeFirmName(entry.name);
            return entryKey === searchKey || entryKey.includes(searchKey) || searchKey.includes(entryKey);
          })
        : ranked;

      res.json({
        total: matching.length,
        architects: matching.slice(offset, offset + limit),
        sortBy,
        search: search || null,
        dataWindow: 'Last 5 Years (2020–present)',
        source: 'Chicago Data Portal – Building Permits (ydr8-5enu)',
      });
    } catch (err) {
      console.error('[ARCHITECT RANKINGS] Error:', err);
      res.status(500).json({ error: 'Failed to fetch architect rankings' });
    }
  });

  app.get('/api/discovery/general-contractors', async (req, res) => {
    try {
      const { getGeneralContractorRankings } = await import('./architectRankings');
      const sortBy = (req.query.sortBy as string) || 'total_projects';
      const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
      const limit = Math.min(parseInt(req.query.limit as string || '100'), 200);
      const offset = parseInt(req.query.offset as string || '0');
      const rankingsPath = path.join(__dirname, 'data/contractors/rankings.json');
      let usingSearchFallback = false;
      let all: any[];

      try {
        all = await getGeneralContractorRankings();
      } catch (error) {
        if (!search || !fs.existsSync(rankingsPath)) throw error;
        const contractorIndex = JSON.parse(fs.readFileSync(rankingsPath, 'utf-8'));
        all = (contractorIndex.contractors || [])
          .filter((contractor: any) => contractor.totalPermits >= 3)
          .map((contractor: any) => ({
            name: contractor.name,
            isOwnerGC: false,
            totalProjects: contractor.totalPermits,
            totalValue: contractor.totalReportedValue || 0,
            newConstructionCount: contractor.specialtyBreakdown?.['new-construction'] || 0,
            renovationCount: contractor.specialtyBreakdown?.general || 0,
            singleFamilyCount: 0,
            multiFamilyCount: 0,
            mixedUseCommercialCount: 0,
            industrialCount: 0,
            lastPermitDate: contractor.lastPermitDate || null,
          }));
        usingSearchFallback = true;
        console.warn('[GC RANKINGS] Live source timed out; serving project-work search from the local permit index');
      }

      if (search) {
        const indexByName = new Map<string, any>();
        if (fs.existsSync(rankingsPath)) {
          const contractorIndex = JSON.parse(fs.readFileSync(rankingsPath, 'utf-8'));
          for (const contractor of contractorIndex.contractors || []) {
            const key = String(contractor.name || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
            if (key) indexByName.set(key, contractor);
          }
        }

        all = all
          .map(contractor => {
            const key = contractor.name.toUpperCase().replace(/[^A-Z0-9]/g, '');
            const indexedContractor = indexByName.get(key);
            const match = getContractorSearchMatch(
              indexedContractor || { name: contractor.name },
              search,
            );
            return {
              ...contractor,
              searchMatchCount: match.count,
              searchMatches: match.labels,
            };
          })
          .filter(contractor => contractor.searchMatchCount > 0);
      }

      const sorted = [...all].sort((a, b) => {
        switch (sortBy) {
          case 'search_match':
            return (b.searchMatchCount || 0) - (a.searchMatchCount || 0) ||
              b.totalProjects - a.totalProjects;
          case 'total_value': return b.totalValue - a.totalValue;
          case 'new_construction': return b.newConstructionCount - a.newConstructionCount;
          case 'renovation': return b.renovationCount - a.renovationCount;
          case 'single_family': return b.singleFamilyCount - a.singleFamilyCount;
          case 'multi_family': return b.multiFamilyCount - a.multiFamilyCount;
          case 'mixed_use': return b.mixedUseCommercialCount - a.mixedUseCommercialCount;
          case 'industrial': return b.industrialCount - a.industrialCount;
          default: return b.totalProjects - a.totalProjects;
        }
      });

      res.json({
        total: sorted.length,
        contractors: sorted.slice(offset, offset + limit),
        sortBy,
        search: search || null,
        dataWindow: 'Last 5 Years (2020–present)',
        source: usingSearchFallback
          ? 'Chicago Building Permits local search index (ydr8-5enu)'
          : 'Chicago Data Portal – Building Permits (ydr8-5enu)',
      });
    } catch (err) {
      console.error('[GC RANKINGS] Error:', err);
      res.status(500).json({ error: 'Failed to fetch general contractor rankings' });
    }
  });

  app.get('/api/discovery/expeditors', async (req, res) => {
    try {
      const { getExpeditorRankings } = await import('./architectRankings');
      const { normalizeFirmName } = await import('./dobEnrichment');
      const all = await getExpeditorRankings();
      const sortBy = (req.query.sortBy as string) || 'total_projects';
      const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 200) : '';
      const limit = Math.min(parseInt(req.query.limit as string || '100'), 200);
      const offset = parseInt(req.query.offset as string || '0');

      const sorted = [...all].sort((a, b) => {
        switch (sortBy) {
          case 'total_value': return b.totalValue - a.totalValue;
          case 'new_construction': return b.newConstructionCount - a.newConstructionCount;
          case 'renovation': return b.renovationCount - a.renovationCount;
          case 'single_family': return b.singleFamilyCount - a.singleFamilyCount;
          case 'multi_family': return b.multiFamilyCount - a.multiFamilyCount;
          case 'mixed_use': return b.mixedUseCommercialCount - a.mixedUseCommercialCount;
          case 'industrial': return b.industrialCount - a.industrialCount;
          default: return b.totalProjects - a.totalProjects;
        }
      });

      const ranked = sorted.map((entry, index) => ({ ...entry, citywideRank: index + 1 }));
      const searchKey = normalizeFirmName(search);
      const matching = searchKey
        ? ranked.filter(entry => {
            const entryKey = normalizeFirmName(entry.name);
            return entryKey === searchKey || entryKey.includes(searchKey) || searchKey.includes(entryKey);
          })
        : ranked;

      res.json({
        total: matching.length,
        expeditors: matching.slice(offset, offset + limit),
        sortBy,
        search: search || null,
        dataWindow: 'Last 5 Years (2020–present)',
        source: 'Chicago Data Portal – Building Permits (ydr8-5enu)',
      });
    } catch (err) {
      console.error('[EXPEDITOR RANKINGS] Error:', err);
      res.status(500).json({ error: 'Failed to fetch expeditor rankings' });
    }
  });

  app.post('/api/dob/professional-enrichment', async (req, res) => {
    try {
      // Auth: session cookie OR bearer token (same pattern as loadOwnedRun) —
      // this route fans out to ranking/directory loaders, so it must not be public.
      let authUser = (req.isAuthenticated?.() && req.user) ? req.user : null;
      if (!authUser) {
        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith('Bearer ')) {
          const { resolveUserFromToken } = await import('./auth.js');
          authUser = await resolveUserFromToken(authHeader.slice(7).trim());
        }
      }
      if (!authUser) return res.status(401).json({ message: 'You must be signed in.' });
      const firms = req.body?.firms;
      if (!Array.isArray(firms) || firms.length === 0 || firms.length > 40) {
        return res.status(400).json({ error: 'firms must be a non-empty array (max 40)' });
      }
      const cleaned = firms
        .map((f: any) => ({ name: String(f?.name || '').slice(0, 200), role: String(f?.role || '').slice(0, 80) }))
        .filter((f: any) => f.name.trim().length > 0);
      const { enrichFirms } = await import('./dobEnrichment');
      const results = await enrichFirms(cleaned);
      res.json({ results, asOf: new Date().toISOString().substring(0, 10) });
    } catch (err) {
      console.error('[DOB ENRICHMENT] Error:', err);
      res.status(500).json({ error: 'Failed to enrich professionals' });
    }
  });

  app.get('/api/discovery/minority-contractors', async (req, res) => {
    try {
      const { getMinorityContractorRankings } = await import('./minorityContractors');
      const all = await getMinorityContractorRankings();
      const sortBy = (req.query.sortBy as string) || 'permit_count';
      const certFilter = (req.query.certType as string) || '';
      const ethnicityFilter = (req.query.ethnicity as string) || '';
      const search = (req.query.search as string || '').toLowerCase().trim();
      const limit = Math.min(parseInt(req.query.limit as string || '100'), 500);
      const offset = parseInt(req.query.offset as string || '0');

      let filtered = all;
      if (certFilter) filtered = filtered.filter(e => e.certTypes.includes(certFilter));
      if (ethnicityFilter) filtered = filtered.filter(e => e.ethnicity === ethnicityFilter);
      if (search) filtered = filtered.filter(e =>
        e.name.toLowerCase().includes(search) ||
        e.capability.toLowerCase().includes(search) ||
        e.communityArea.toLowerCase().includes(search)
      );

      const sorted = [...filtered].sort((a, b) => {
        switch (sortBy) {
          case 'permit_value': return b.permitValue - a.permitValue;
          case 'new_construction': return b.newConstructionCount - a.newConstructionCount;
          case 'renovation': return b.renovationCount - a.renovationCount;
          case 'name': return a.name.localeCompare(b.name);
          default: return b.permitCount - a.permitCount;
        }
      });

      const ethnicities = [...new Set(all.map(e => e.ethnicity).filter(Boolean))].sort();

      res.json({
        total: sorted.length,
        contractors: sorted.slice(offset, offset + limit),
        sortBy,
        ethnicities,
        dataWindow: 'Last 5 Years (2020–present)',
        source: 'City of Chicago MBE/WBE/VBE/BEPD Certified Directory (March 2026)',
      });
    } catch (err) {
      console.error('[MINORITY CONTRACTORS] Error:', err);
      res.status(500).json({ error: 'Failed to fetch minority contractor directory' });
    }
  });

  // Freddie Mac PMMS 30-Year Mortgage Rate (cached weekly)
  let cachedMortgageRate: { rate: number; date: string; fetchedAt: number } | null = null;
  const MORTGAGE_RATE_CACHE_MS = 24 * 60 * 60 * 1000; // 24 hours

  // Shared fetcher — used by the /api/mortgage-rate route and the HMDA takeaway.
  async function getMortgageRateCached(): Promise<{ rate: number; date: string; fetchedAt: number }> {
      if (cachedMortgageRate && (Date.now() - cachedMortgageRate.fetchedAt) < MORTGAGE_RATE_CACHE_MS) {
        return cachedMortgageRate;
      }

      const csvUrl = 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=MORTGAGE30US';
      const response = await fetch(csvUrl, {
        headers: { 'User-Agent': 'ChicagoEligibilityScreener/1.0' },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(`FRED CSV fetch failed: ${response.status}`);
      }

      const csvText = await response.text();
      const lines = csvText.trim().split('\n');

      let latestRate: number | null = null;
      let latestDate = '';

      for (let i = lines.length - 1; i >= 1; i--) {
        const parts = lines[i].split(',');
        if (parts.length >= 2) {
          const dateStr = parts[0].trim();
          const rateStr = parts[1].trim();
          if (rateStr !== '.' && rateStr !== '') {
            const rate = parseFloat(rateStr);
            if (!isNaN(rate) && rate > 0) {
              latestRate = rate;
              latestDate = dateStr;
              break;
            }
          }
        }
      }

      if (latestRate === null) {
        throw new Error('Could not parse mortgage rate from FRED data');
      }

      cachedMortgageRate = {
        rate: Math.round(latestRate * 100) / 100,
        date: latestDate,
        fetchedAt: Date.now(),
      };

      console.log(`[MORTGAGE RATE] Freddie Mac 30-year rate: ${cachedMortgageRate.rate}% as of ${latestDate}`);
      return cachedMortgageRate;
  }

  app.get('/api/mortgage-rate', async (_req, res) => {
    try {
      res.json(await getMortgageRateCached());
    } catch (err) {
      console.error('Mortgage rate fetch error:', err);
      if (cachedMortgageRate) {
        return res.json({ ...cachedMortgageRate, stale: true });
      }
      res.status(500).json({ error: 'Unable to fetch mortgage rate', fallbackRate: 6.5 });
    }
  });

  // SBA loan rates derived from live FRED benchmarks (cached 24h):
  //   7(a): WSJ Prime (DPRIME) + 2.75% — standard variable-rate max spread for larger loans
  //   504:  10-Year Treasury (DGS10) + spread — calibrated to published 25-yr debenture effective rates (~6.2% when 10Y ≈ 4.7%)
  const SBA_504_SPREAD = 1.50; // over 10-Yr Treasury — recheck against published CDC effective rates periodically
  let cachedSbaRates: { sevenARate: number; fiveOhFourRate: number; fiveOhFourSpread: number; primeRate: number; treasury10: number; asOf: string; fetchedAt: number } | null = null;
  const SBA_RATES_CACHE_MS = 24 * 60 * 60 * 1000;

  const fetchFredLatest = async (seriesId: string): Promise<{ value: number; date: string }> => {
    const resp = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${seriesId}`, {
      headers: { 'User-Agent': 'ChicagoEligibilityScreener/1.0' },
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) throw new Error(`FRED ${seriesId} fetch failed: ${resp.status}`);
    const lines = (await resp.text()).trim().split('\n');
    for (let i = lines.length - 1; i >= 1; i--) {
      const [dateStr, valStr] = lines[i].split(',').map(s => s?.trim());
      const v = parseFloat(valStr);
      if (valStr && valStr !== '.' && !isNaN(v) && v > 0) return { value: v, date: dateStr };
    }
    throw new Error(`Could not parse latest value for FRED ${seriesId}`);
  };

  app.get('/api/sba-rates', async (_req, res) => {
    try {
      if (cachedSbaRates && (Date.now() - cachedSbaRates.fetchedAt) < SBA_RATES_CACHE_MS) {
        return res.json(cachedSbaRates);
      }
      const [prime, dgs10] = await Promise.all([fetchFredLatest('DPRIME'), fetchFredLatest('DGS10')]);
      const round2 = (n: number) => Math.round(n * 100) / 100;
      cachedSbaRates = {
        sevenARate: round2(prime.value + 2.75),
        fiveOhFourRate: round2(dgs10.value + SBA_504_SPREAD),
        fiveOhFourSpread: SBA_504_SPREAD,
        primeRate: round2(prime.value),
        treasury10: round2(dgs10.value),
        asOf: prime.date > dgs10.date ? prime.date : dgs10.date,
        fetchedAt: Date.now(),
      };
      console.log(`[SBA RATES] 7(a) ${cachedSbaRates.sevenARate}% (Prime ${cachedSbaRates.primeRate} + 2.75) · 504 ~${cachedSbaRates.fiveOhFourRate}% (10Y ${cachedSbaRates.treasury10} + ${SBA_504_SPREAD}) as of ${cachedSbaRates.asOf}`);
      res.json(cachedSbaRates);
    } catch (err) {
      console.error('[SBA RATES] fetch error:', err);
      if (cachedSbaRates) return res.json({ ...cachedSbaRates, stale: true });
      res.status(500).json({ error: 'Unable to fetch SBA benchmark rates' });
    }
  });

  app.post('/api/new-construction-nearby', async (req, res) => {
    try {
      const { lat, lng, communityArea } = req.body;
      if (!lat || !lng) {
        return res.status(400).json({ message: "Latitude and longitude required" });
      }
      const result = await getNearbyNewConstruction(parseFloat(lat), parseFloat(lng), communityArea, 1.0);
      res.json(result);
    } catch (err) {
      console.error('Nearby new construction lookup error:', err);
      res.status(500).json({ message: "Error looking up nearby new construction data" });
    }
  });

  app.get('/api/config/mapbox-token', (_req, res) => {
    const token = process.env.MAPBOX_PUBLIC_KEY;
    if (!token) return res.status(404).json({ error: 'Token not configured' });
    res.json({ token });
  });

  // === STRIPE PAYMENT ROUTES ===

  app.get('/api/stripe/publishable-key', async (_req, res) => {
    try {
      const { getStripePublishableKey } = await import('./stripeClient');
      const key = await getStripePublishableKey();
      res.json({ publishableKey: key });
    } catch (err: any) {
      console.error('Error fetching publishable key:', err);
      res.status(500).json({ error: 'Unable to fetch Stripe key' });
    }
  });

  // Create a one-time checkout session ($29 single report)
  app.post('/api/stripe/checkout/report', async (req, res) => {
    try {
      const { getUncachableStripeClient } = await import('./stripeClient');
      const stripe = await getUncachableStripeClient();
      const { address, runId, successUrl, cancelUrl } = req.body;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'PARCEL SCREENER — Single Report',
              description: address ? `Property analysis for: ${address}` : 'One-time property analysis report',
            },
            unit_amount: 2900,
          },
          quantity: 1,
        }],
        mode: 'payment',
        success_url: successUrl || `${req.protocol}://${req.get('host')}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancelUrl || `${req.protocol}://${req.get('host')}/`,
        metadata: { address: address || '', type: 'single_report', runId: runId ? String(runId) : '' },
      });

      res.json({ url: session.url, sessionId: session.id });
    } catch (err: any) {
      console.error('Checkout error:', err);
      res.status(500).json({ error: err.message || 'Checkout failed' });
    }
  });

  // Create a subscription checkout session ($99/month)
  app.post('/api/stripe/checkout/subscription', async (req, res) => {
    try {
      const { getUncachableStripeClient } = await import('./stripeClient');
      const stripe = await getUncachableStripeClient();
      const { email, successUrl, cancelUrl } = req.body;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        customer_email: email || undefined,
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'PARCEL SCREENER — Monthly Subscription',
              description: 'Unlimited reports, saved history, 3-property comparison',
            },
            unit_amount: 9900,
            recurring: { interval: 'month' },
          },
          quantity: 1,
        }],
        mode: 'subscription',
        success_url: successUrl || `${req.protocol}://${req.get('host')}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancelUrl || `${req.protocol}://${req.get('host')}/`,
        metadata: { type: 'subscription' },
      });

      res.json({ url: session.url, sessionId: session.id });
    } catch (err: any) {
      console.error('Subscription checkout error:', err);
      res.status(500).json({ error: err.message || 'Checkout failed' });
    }
  });

  // Return Stripe publishable key (safe to expose — it's a public key)
  app.get('/api/stripe/config', async (req, res) => {
    try {
      const { getStripePublishableKey } = await import('./stripeClient');
      const publishableKey = await getStripePublishableKey();
      res.json({ publishableKey });
    } catch (err: any) {
      console.error('Error fetching Stripe publishable key:', err);
      res.status(500).json({ publishableKey: '' });
    }
  });

  // Embedded report checkout — returns clientSecret for EmbeddedCheckoutProvider
  app.post('/api/stripe/checkout/report/embedded', async (req, res) => {
    try {
      const { getUncachableStripeClient } = await import('./stripeClient');
      const stripe = await getUncachableStripeClient();
      const { address, runId, email } = req.body;
      const returnUrl = `${req.protocol}://${req.get('host')}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        customer_email: email || undefined,
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'PARCEL SCREENER — Single Report',
              description: address ? `Property analysis for: ${address}` : 'One-time property analysis report',
            },
            unit_amount: 2900,
          },
          quantity: 1,
        }],
        mode: 'payment',
        ui_mode: 'embedded',
        return_url: returnUrl,
        metadata: { address: address || '', type: 'single_report', runId: runId ? String(runId) : '' },
      });

      res.json({ clientSecret: session.client_secret });
    } catch (err: any) {
      console.error('Embedded checkout error:', err);
      res.status(500).json({ error: err.message || 'Checkout failed' });
    }
  });

  // Embedded subscription checkout — returns clientSecret for EmbeddedCheckoutProvider
  app.post('/api/stripe/checkout/subscription/embedded', async (req, res) => {
    try {
      const { getUncachableStripeClient } = await import('./stripeClient');
      const stripe = await getUncachableStripeClient();
      const { email } = req.body;
      const returnUrl = `${req.protocol}://${req.get('host')}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        customer_email: email || undefined,
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'PARCEL SCREENER — Monthly Subscription',
              description: 'Unlimited reports, saved history, 3-property comparison',
            },
            unit_amount: 9900,
            recurring: { interval: 'month' },
          },
          quantity: 1,
        }],
        mode: 'subscription',
        ui_mode: 'embedded',
        return_url: returnUrl,
        metadata: { type: 'subscription' },
      });

      res.json({ clientSecret: session.client_secret });
    } catch (err: any) {
      console.error('Embedded subscription checkout error:', err);
      res.status(500).json({ error: err.message || 'Checkout failed' });
    }
  });

  // Verify a completed checkout session
  app.get('/api/stripe/session/:sessionId', async (req, res) => {
    try {
      const { getUncachableStripeClient } = await import('./stripeClient');
      const stripe = await getUncachableStripeClient();
      const session = await stripe.checkout.sessions.retrieve(req.params.sessionId);

      // If this was a single-report purchase that succeeded, mark the run as purchased and email the link
      if (
        session.payment_status === 'paid' &&
        session.metadata?.type === 'single_report' &&
        session.metadata?.runId
      ) {
        const runId = Number(session.metadata.runId);
        if (runId) {
          const existingRun = await storage.getRun(runId);
          const isFirstPurchase = !existingRun?.purchasedAt;
          const updatedRun = await storage.markRunAsPurchased(runId);
          // Only send email once (first time the run is marked as purchased)
          const buyerEmail = session.customer_details?.email;
          const reportAddress = session.metadata?.address || updatedRun?.address || '';
          const resendApiKey = process.env.RESEND_API_KEY;
          const host = `${req.protocol}://${req.get('host')}`;
          const reportUrl = `${host}/report/${runId}`;
          if (isFirstPurchase && resendApiKey && buyerEmail) {
            try {
              await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${resendApiKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  from: 'PARCEL SCREENER <reports@parcelscreener.com>',
                  to: [buyerEmail],
                  subject: `Your PARCEL SCREENER Report — ${reportAddress}`,
                  html: `<div style="font-family:monospace;max-width:600px;margin:0 auto;padding:40px 20px;background:#fff;color:#000">
  <h1 style="font-size:18px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px">PARCEL SCREENER</h1>
  <p style="font-size:12px;color:#666;margin-bottom:32px;text-transform:uppercase;letter-spacing:0.1em">Property Analysis Report</p>
  <p style="font-size:14px;margin-bottom:8px">Your report is ready:</p>
  <p style="font-size:16px;font-weight:700;margin-bottom:32px">${reportAddress}</p>
  <a href="${reportUrl}" style="display:inline-block;background:#000;color:#fff;font-family:monospace;font-size:13px;text-transform:uppercase;letter-spacing:0.15em;padding:14px 32px;text-decoration:none">Open Report →</a>
  <p style="font-size:11px;color:#999;margin-top:40px">Bookmark this link — it's yours to keep. No account required.</p>
</div>`,
                }),
              });
            } catch (emailErr) {
              console.error('Failed to send report email:', emailErr);
            }
          } else {
            console.log(`[report] Link for run ${runId}: ${reportUrl}`);
          }
        }
      }

      res.json({
        status: session.payment_status,
        mode: session.mode,
        customerEmail: session.customer_details?.email,
        stripeCustomerId: typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null,
        stripeSubscriptionId: typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null,
        metadata: session.metadata,
        runId: session.metadata?.runId ? Number(session.metadata.runId) : null,
        address: session.metadata?.address || null,
      });
    } catch (err: any) {
      console.error('Session retrieve error:', err);
      res.status(500).json({ error: err.message || 'Session lookup failed' });
    }
  });

  app.get('/api/zoning-history', async (req, res) => {
    try {
      const address = (req.query.address as string) || '';
      const ward = req.query.ward ? parseInt(req.query.ward as string, 10) : null;
      if (!address) return res.status(400).json({ error: 'address required' });
      // Optional co-parcel addresses (repeated ?alt= params from verified assemblage)
      const altRaw = req.query.alt;
      const altAddresses = (Array.isArray(altRaw) ? altRaw : altRaw ? [altRaw] : [])
        .map((a) => String(a)).filter(Boolean).slice(0, 3);
      const [{ getZoningHistory }, { getDpdApplications, matchesDpdAddress }] = await Promise.all([
        import('./zoningHistory'),
        import('./dpdApplications'),
      ]);
      const [result, dpdResult] = await Promise.all([
        getZoningHistory({ address, ward, altAddresses }),
        getDpdApplications(),
      ]);
      const targets = [address, ...altAddresses];
      const pendingDpd = dpdResult.applications.filter(application =>
        targets.some(target => matchesDpdAddress(application.address, target)),
      );
      res.json({ ...result, pendingDpd, dpdCoverage: dpdResult.coverage });
    } catch (err: any) {
      console.error('[zoning-history]', err);
      res.status(500).json({ error: err.message || 'Failed to fetch zoning history' });
    }
  });

  // === INSIGHT REPORT ===

  // In-memory generation progress per run — driven by REAL events (context
  // extraction done, each finding streamed), never a timer. total = 1 evidence
  // step + 8 findings (validator ceiling). Entries are transient: a restart
  // loses only the progress display, not the generation result.
  const insightProgress = new Map<number, {
    status: 'running' | 'ready' | 'error';
    done: number; total: number;
    mode: 'tailored' | 'as_is';
    use: string | null;
    startedAt: string;
    error?: string;
  }>();

  // GET — return cached insight report if present
  app.get('/api/runs/:id/insight-report', async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid run ID' });

    const run = await storage.getRun(id);
    if (!run) return res.status(404).json({ error: 'Run not found' });

    const isSubscriber = !!(req.user as any)?.plan && (req.user as any).plan === 'subscriber';
    const hasPurchased = !!run.purchasedAt;
    if (!isSubscriber && !hasPurchased) {
      return res.status(403).json({ error: 'Access requires a purchase or subscription' });
    }

    const report = await storage.getInsightReport(id);
    if (!report) return res.status(404).json({ error: 'No insight report generated yet' });
    res.json(report);
  });

  // POST — generate (or regenerate) the insight report
  // Dev-only: inspect the exact evidence package (fullContext) the report
  // generator would send, without calling the model. Never mounted in prod.
  if (process.env.NODE_ENV === 'development') {
    app.get('/api/runs/:id/insight-report/evidence', async (req, res) => {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid run ID' });
      try {
        const { fullContext, coverage } = await buildInsightReportEvidence(id);
        res.setHeader('X-Evidence-Coverage-Missing', coverage.missing.join(',') || 'none');
        res.type('text/plain').send(fullContext);
      } catch (err: any) {
        res.status(err.message === 'Run not found' ? 404 : 500).json({ error: err.message });
      }
    });
  }

  app.post('/api/runs/:id/insight-report/generate', async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid run ID' });

    const run = await storage.getRun(id);
    if (!run) return res.status(404).json({ error: 'Run not found' });

    const isSubscriber = !!(req.user as any)?.plan && (req.user as any).plan === 'subscriber';
    const hasPurchased = !!run.purchasedAt;
    if (!isSubscriber && !hasPurchased) {
      return res.status(403).json({ error: 'Access requires a purchase or subscription' });
    }

    // Populate the property memory context from already-cached sources before
    // generating. Strictly additive: any failure here is logged and swallowed —
    // it must NEVER block report generation (a paid user action). On failure
    // the report generates exactly as before, with whatever the context holds.
    try {
      const existing = await getPropertyContext(id);
      if (!existing) {
        const resolved = await resolvePropertyIdForAddress(run.address);
        await createPropertyContext(id, resolved.propertyId);
      }
      const extraction = await extractPropertyContext(id);
      console.log(
        `[insight-report] Context extraction for run ${id}: ${extraction.status} — ` +
        `${extraction.factCount} facts, ${extraction.derivedCount} derived, ${extraction.sourceCount} sources` +
        (extraction.failures.length ? ` (failures: ${extraction.failures.join("; ")})` : "")
      );
    } catch (err: any) {
      console.error(`[insight-report] Context extraction failed for run ${id} (non-blocking):`, err?.message || err);
    }

    // mode: "as_is" = public-record read (no user deal inputs); default tailored
    const mode: 'tailored' | 'as_is' = req.body?.mode === 'as_is' ? 'as_is' : 'tailored';

    // Reject overlapping generations for the same run — a second concurrent
    // attempt would race the first on both the progress map and the saved
    // report. Entries older than 10 min are treated as stale (crashed attempt).
    const existing = insightProgress.get(id);
    if (existing?.status === 'running' && Date.now() - Date.parse(existing.startedAt) < 10 * 60 * 1000) {
      return res.status(409).json({ error: 'A report is already generating for this run' });
    }

    const progress = {
      status: 'running' as const,
      done: 1, // evidence/context step complete by this point
      total: 9,
      mode,
      use: mode === 'as_is' ? null : (run.lastProjectType ?? null),
      startedAt: new Date().toISOString(),
    };
    insightProgress.set(id, progress);
    // Only the attempt that owns the current map entry may mutate it — an
    // abandoned attempt (superseded after going stale) must not clobber it.
    const owns = () => insightProgress.get(id) === progress;

    try {
      console.log(`[insight-report] Generating for run ${id} (mode=${mode})…`);
      const content = await generateInsightReportContent(id, {
        mode,
        onFinding: (n) => { if (owns()) progress.done = Math.min(1 + n, progress.total - 1); },
      }) as { html: string; generatedForProjectType?: string | null; mode?: string };
      // Stamp the project use the report was generated for, so the client can
      // flag the report as stale if the run's project use changes later.
      // As-is reports are public-record: no project use, mode stamped instead.
      content.generatedForProjectType = mode === 'as_is' ? null : (run.lastProjectType ?? null);
      content.mode = mode;
      await storage.saveInsightReport(id, content);
      if (owns()) insightProgress.set(id, { ...progress, status: 'ready', done: progress.total });
      console.log(`[insight-report] Saved for run ${id}`);
      res.json({ html: content.html, generatedAt: new Date().toISOString(), generatedForProjectType: content.generatedForProjectType, mode });
    } catch (err: any) {
      if (owns()) insightProgress.set(id, { ...progress, status: 'error', error: err.message || 'Generation failed' });
      console.error('[insight-report] Error:', err.message);
      res.status(500).json({ error: err.message || 'Failed to generate insight report' });
    }
  });

  // GET — live generation progress (real section-completion events, not a timer)
  app.get('/api/runs/:id/insight-report/progress', async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid run ID' });
    const run = await storage.getRun(id);
    if (!run) return res.status(404).json({ error: 'Run not found' });
    const isSubscriber = !!(req.user as any)?.plan && (req.user as any).plan === 'subscriber';
    if (!isSubscriber && !run.purchasedAt) {
      return res.status(403).json({ error: 'Access requires a purchase or subscription' });
    }
    res.json(insightProgress.get(id) ?? { status: 'idle' });
  });

  // GET — serve raw HTML for clean printing
  app.get('/api/runs/:id/insight-report/view', async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).send('Invalid run ID');

    const run = await storage.getRun(id);
    if (!run) return res.status(404).send('Run not found');

    const isSubscriber = !!(req.user as any)?.plan && (req.user as any).plan === 'subscriber';
    const hasPurchased = !!run.purchasedAt;
    if (!isSubscriber && !hasPurchased) {
      return res.status(403).send('Access requires a purchase or subscription');
    }

    const report = await storage.getInsightReport(id);
    if (!report) return res.status(404).send('No insight report generated yet');

    const html = (report.content as any)?.html;
    if (!html) return res.status(404).send('Report content not found');

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  });

  // POST /api/incentives — config-driven eligibility checker
  app.post('/api/incentives', async (req: Request, res: Response) => {
    try {
      const { lat, lon, projectCategory, projectType, isLandmark, tractGeoid, zipCode, zoningCode, unitCount } = req.body;
      if (!lat || !lon || isNaN(Number(lat)) || isNaN(Number(lon))) {
        return res.status(400).json({ error: 'lat and lon are required numeric values' });
      }

      // Check official Chicago Landmark designation via uct4-hrvh (412 officially designated landmarks)
      // Shared helper — same logic used by the insight-report evidence builder
      const official = await checkOfficialLandmarkFlag(Number(lat), Number(lon));
      const isOfficialLandmark = official.isOfficial;
      if (official.name) {
        console.log(`[/api/incentives] Official landmark match: ${official.name}`);
      }

      const results = await checkIncentives({
        lat: Number(lat),
        lon: Number(lon),
        projectCategory: projectCategory ?? null,
        projectType: projectType ?? null,
        isLandmark: isLandmark ?? null,
        isOfficialLandmark,
        tractGeoid: tractGeoid ?? null,
        zipCode: zipCode ?? null,
        zoningCode: zoningCode ?? null,
        unitCount: unitCount != null ? Number(unitCount) : null,
      });
      res.json({ results });
    } catch (err: any) {
      console.error('[/api/incentives] error:', err);
      res.status(500).json({ error: err.message || 'Incentives check failed' });
    }
  });

  // POST /api/admin/refresh-landmark-districts — re-download Landmark Districts KMZ and regenerate GeoJSON
  app.post('/api/admin/refresh-landmark-districts', async (req: Request, res: Response) => {
    try {
      console.log('[/api/admin/refresh-landmark-districts] Starting refresh...');
      const result = await refreshLandmarkDistrictsData();
      if (result.success) {
        res.json({ success: true, features: result.features, message: `Landmark Districts refreshed: ${result.features} districts saved` });
      } else {
        res.status(500).json({ success: false, error: result.error });
      }
    } catch (err: any) {
      console.error('[/api/admin/refresh-landmark-districts] error:', err);
      res.status(500).json({ error: err.message || 'Landmark Districts refresh failed' });
    }
  });

  // POST /api/admin/refresh-chrs — re-download CHRS KMZ and regenerate chicago_chrs.geojson
  app.post('/api/admin/refresh-chrs', async (req: Request, res: Response) => {
    try {
      console.log('[/api/admin/refresh-chrs] Starting CHRS data refresh...');
      const result = await refreshChrsData();
      if (result.success) {
        res.json({ success: true, features: result.features, message: `CHRS data refreshed: ${result.features} features saved` });
      } else {
        res.status(500).json({ success: false, error: result.error });
      }
    } catch (err: any) {
      console.error('[/api/admin/refresh-chrs] error:', err);
      res.status(500).json({ error: err.message || 'CHRS refresh failed' });
    }
  });

  return httpServer;
}
