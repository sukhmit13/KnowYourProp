import type { NmtcEligibilityResult, NmtcDistressLevel, NmtcDistressDetails } from "@shared/schema";

const CIMS_SERVICE_URL = "https://cimsprodprep.cdfifund.gov/arcgis/rest/services/PN/CIMS3_PN_View/MapServer/94/query";
const NMTC_VIEWER_URL = "https://www.cdfifund.gov/programs-training/certification/nmtc/pages/mapping-system.aspx";

interface NmtcCache {
  result: NmtcEligibilityResult;
  cachedAt: number;
}

const nmtcCache = new Map<string, NmtcCache>();
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

function getCacheKey(lat: number, lon: number): string {
  return `${lat.toFixed(6)},${lon.toFixed(6)}`;
}

function determineDistressLevel(attrs: any): { level: NmtcDistressLevel; label: string } {
  const povertyRate = attrs.PovertyRate ?? 0;
  const pctMedianIncome = attrs.PctMedianFamilyIncome ?? 100;
  const highMigration = attrs.HighMigration === "Yes";
  const metroDesignation = attrs.MetroDesignation ?? "";
  const isNonMetro = metroDesignation.toLowerCase().includes("non-metro") || metroDesignation.toLowerCase().includes("rural");

  if (povertyRate >= 40 || pctMedianIncome <= 45) {
    return { level: "deep_distress", label: "Deep Distress" };
  }

  if (povertyRate >= 30 || pctMedianIncome <= 60) {
    return { level: "severe_distress", label: "Severe Distress" };
  }

  if (highMigration && isNonMetro) {
    return { level: "high_migration", label: "High Migration Rural County" };
  }

  return { level: "eligible", label: "Eligible" };
}

function extractDistressDetails(attrs: any): NmtcDistressDetails {
  return {
    povertyRate: attrs.PovertyRate ?? null,
    pctMedianFamilyIncome: attrs.PctMedianFamilyIncome ?? null,
    unemploymentRate: attrs.UnemploymentRate ?? null,
    unemploymentRateRatio: attrs.UnemploymentRateRatio ?? null,
    povertyPopulation: attrs.PovertyPopulation ?? null,
    metroDesignation: attrs.MetroDesignation ?? null,
    highMigration: attrs.HighMigration === "Yes",
    censusTractFips: attrs.CensusTractFIPS ?? null,
    povertyRateQualified: attrs.PovertyRateQualified === "Yes",
    medianIncomeQualified: attrs.MedianIncomeQualified === "Yes",
    ratioQualified: attrs.RatioQualified === "Yes",
  };
}

export async function checkNmtcEligibility(lat: number, lon: number): Promise<NmtcEligibilityResult> {
  const cacheKey = getCacheKey(lat, lon);
  
  const cached = nmtcCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < CACHE_DURATION_MS) {
    console.log(`NMTC cache hit for ${cacheKey}`);
    return cached.result;
  }

  try {
    const geometry = JSON.stringify({
      x: lon,
      y: lat,
      spatialReference: { wkid: 4326 }
    });

    const params = new URLSearchParams({
      geometry: geometry,
      geometryType: "esriGeometryPoint",
      spatialRel: "esriSpatialRelIntersects",
      inSR: "4326",
      outFields: "*",
      returnGeometry: "false",
      f: "json"
    });

    const url = `${CIMS_SERVICE_URL}?${params.toString()}`;
    console.log(`Querying NMTC CIMS layer for point: ${lat}, ${lon}`);

    const response = await fetch(url, {
      headers: {
        "Accept": "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`CIMS API error: ${response.statusText}`);
    }

    const data = await response.json();
    
    const isEligible = data.features && data.features.length > 0;
    
    let distressLevel: NmtcDistressLevel = "not_qualified";
    let distressLabel = "Not in Qualified Census Tract";
    let distressDetails: NmtcDistressDetails | null = null;

    if (isEligible) {
      const attrs = data.features[0].attributes;
      const distress = determineDistressLevel(attrs);
      distressLevel = distress.level;
      distressLabel = distress.label;
      distressDetails = extractDistressDetails(attrs);
    }
    
    const result: NmtcEligibilityResult = {
      eligible: isEligible,
      status: isEligible ? "qualified" : "not_qualified",
      statusLabel: isEligible 
        ? "Located in NMTC Qualified Census Tract" 
        : "Not in NMTC Qualified Census Tract",
      distressLevel,
      distressLabel,
      distressDetails,
      source: "CDFI Fund CIMS – 2016–2020 NMTC Qualified Census Tracts",
      verificationUrl: NMTC_VIEWER_URL,
      lastChecked: new Date().toISOString()
    };

    nmtcCache.set(cacheKey, {
      result,
      cachedAt: Date.now()
    });

    console.log(`NMTC eligibility for ${cacheKey}: ${isEligible ? `Eligible (${distressLabel})` : "Not Eligible"}`);
    return result;

  } catch (error) {
    console.error("NMTC eligibility check error:", error);
    
    return {
      eligible: false,
      status: "unknown",
      statusLabel: "Unable to verify NMTC eligibility",
      distressLevel: "unknown",
      distressLabel: "Unknown",
      distressDetails: null,
      source: "CDFI Fund CIMS – 2016–2020 NMTC Qualified Census Tracts",
      verificationUrl: NMTC_VIEWER_URL,
      lastChecked: new Date().toISOString()
    };
  }
}
