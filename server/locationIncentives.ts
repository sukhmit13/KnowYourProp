const CHICAGO_ARCGIS = "https://gisapps.chicago.gov/arcgis/rest/services/ExternalApps/operational/MapServer";
const LAYER_INDUSTRIAL_CORRIDORS = 70;
const LAYER_ENTERPRISE_COMMUNITY = 71;
const LAYER_EMPOWERMENT_ZONE = 72;
const LAYER_ENTERPRISE_ZONES = 73;
const LAYER_INVEST_SW = 143;
const LAYER_NOF_ELIGIBLE = 144;

interface ArcGISQueryResult {
  features?: Array<{ attributes: Record<string, any> }>;
  error?: { message: string };
}

const incentivesCache = new Map<string, { result: LocationIncentivesResult; cachedAt: number }>();
const CACHE_MS = 24 * 60 * 60 * 1000;

export interface LocationIncentivesResult {
  industrialCorridor: { inCorridor: boolean; name: string | null; region: string | null };
  enterpriseZone: { inZone: boolean; zoneName: string | null };
  empowermentZone: { inZone: boolean; zoneName: string | null };
  enterpriseCommunity: { inCommunity: boolean; name: string | null; type: string | null };
  investSouthWest: { inArea: boolean; communityArea: string | null; areaNumber: string | null };
  nofEligibleArea: { inEligibleArea: boolean; ward: string | null; zip: string | null; censusTract: string | null };
  checkedAt: string;
}

async function queryLayer(layerId: number, lat: number, lon: number): Promise<ArcGISQueryResult> {
  const geometry = JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } });
  const params = new URLSearchParams({
    geometry,
    geometryType: "esriGeometryPoint",
    spatialRel: "esriSpatialRelIntersects",
    inSR: "4326",
    outFields: "*",
    returnGeometry: "false",
    f: "json",
  });
  const url = `${CHICAGO_ARCGIS}/${layerId}/query?${params.toString()}`;
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`ArcGIS layer ${layerId} HTTP ${res.status}`);
  return res.json();
}

export async function checkLocationIncentives(lat: number, lon: number): Promise<LocationIncentivesResult> {
  const key = `${lat.toFixed(5)},${lon.toFixed(5)}`;
  const cached = incentivesCache.get(key);
  if (cached && Date.now() - cached.cachedAt < CACHE_MS) return cached.result;

  const [icRes, ecRes, ezRes, entRes, iswRes, nofRes] = await Promise.allSettled([
    queryLayer(LAYER_INDUSTRIAL_CORRIDORS, lat, lon),
    queryLayer(LAYER_ENTERPRISE_COMMUNITY, lat, lon),
    queryLayer(LAYER_EMPOWERMENT_ZONE, lat, lon),
    queryLayer(LAYER_ENTERPRISE_ZONES, lat, lon),
    queryLayer(LAYER_INVEST_SW, lat, lon),
    queryLayer(LAYER_NOF_ELIGIBLE, lat, lon),
  ]);

  const icData = icRes.status === "fulfilled" ? icRes.value : null;
  const ecData = ecRes.status === "fulfilled" ? ecRes.value : null;
  const ezData = ezRes.status === "fulfilled" ? ezRes.value : null;
  const entData = entRes.status === "fulfilled" ? entRes.value : null;
  const iswData = iswRes.status === "fulfilled" ? iswRes.value : null;
  const nofData = nofRes.status === "fulfilled" ? nofRes.value : null;

  const icFeature = icData?.features?.[0]?.attributes;
  const ecFeature = ecData?.features?.[0]?.attributes;
  const ezFeature = ezData?.features?.[0]?.attributes;
  const entFeature = entData?.features?.[0]?.attributes;
  const iswFeature = iswData?.features?.[0]?.attributes;
  const nofFeature = nofData?.features?.[0]?.attributes;

  const result: LocationIncentivesResult = {
    industrialCorridor: {
      inCorridor: !!icFeature,
      name: icFeature?.NAME ?? null,
      region: icFeature?.REGION ?? null,
    },
    enterpriseZone: {
      inZone: !!entFeature,
      zoneName: entFeature?.NAME ? `Enterprise Zone ${entFeature.NAME}` : entFeature ? "Enterprise Zone" : null,
    },
    empowermentZone: {
      inZone: !!ezFeature,
      zoneName: ezFeature?.NAME ?? (ezFeature ? "Chicago Empowerment Zone" : null),
    },
    enterpriseCommunity: {
      inCommunity: !!ecFeature,
      name: ecFeature?.NAME ?? (ecFeature ? "Enterprise Community" : null),
      type: ecFeature?.TYPE ?? null,
    },
    investSouthWest: {
      inArea: !!iswFeature,
      communityArea: iswFeature?.COMMUNITY ?? null,
      areaNumber: iswFeature?.AREA_NUMBE ?? null,
    },
    nofEligibleArea: {
      inEligibleArea: !!nofFeature,
      ward: nofFeature?.BLOCK_WARD ? String(nofFeature.BLOCK_WARD) : null,
      zip: nofFeature?.BLOCK_ZIP ?? null,
      censusTract: nofFeature?.CENSUS_TRA ?? null,
    },
    checkedAt: new Date().toISOString(),
  };

  incentivesCache.set(key, { result, cachedAt: Date.now() });
  return result;
}
