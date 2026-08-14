const SBA_HUBZONE_URL = "https://maps.certify.sba.gov/arcgis/rest/services/HUBZone/HUBZone/MapServer/3/query";

export interface HubZoneResult {
  eligible: boolean;
  zoneName: string | null;
  source: string;
  lastChecked: string;
}

const hubzoneCache = new Map<string, { result: HubZoneResult; cachedAt: number }>();
const CACHE_MS = 24 * 60 * 60 * 1000;

export async function checkHubZoneEligibility(lat: number, lon: number): Promise<HubZoneResult> {
  const key = `${lat.toFixed(5)},${lon.toFixed(5)}`;
  const cached = hubzoneCache.get(key);
  if (cached && Date.now() - cached.cachedAt < CACHE_MS) return cached.result;

  try {
    const geometry = JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } });
    const params = new URLSearchParams({
      geometry,
      geometryType: "esriGeometryPoint",
      spatialRel: "esriSpatialRelIntersects",
      inSR: "4326",
      outFields: "NAME,HUBZONE_ID,HUB_ZONE_ID,OBJECTID",
      returnGeometry: "false",
      f: "json",
    });

    const res = await fetch(`${SBA_HUBZONE_URL}?${params}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; KnowYourProp/1.0)" },
    });
    const data = await res.json();
    const features = data.features || [];
    const eligible = features.length > 0;
    const attrs = eligible ? (features[0].attributes || {}) : {};
    const zoneName = attrs.NAME || attrs.HUBZONE_ID || attrs.HUB_ZONE_ID || null;

    const result: HubZoneResult = {
      eligible,
      zoneName,
      source: "SBA HUBZone Certification Map",
      lastChecked: new Date().toISOString(),
    };
    hubzoneCache.set(key, { result, cachedAt: Date.now() });
    return result;
  } catch (err) {
    console.error("[HUBZone] Error:", err);
    return { eligible: false, zoneName: null, source: "SBA HUBZone Certification Map", lastChecked: new Date().toISOString() };
  }
}
