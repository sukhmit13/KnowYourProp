// HUD Qualified Census Tracts (QCT) — provides 30% basis boost for LIHTC projects
// QCTs are census tracts where ≥50% of households have incomes below 60% of AMI,
// or the poverty rate is ≥25%. Designated annually by HUD.

const HUD_QCT_URL = "https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services/Qualified_Census_Tracts_2024/FeatureServer/0/query";

export interface QctResult {
  eligible: boolean;
  tractFips: string | null;
  source: string;
  lastChecked: string;
}

const qctCache = new Map<string, { result: QctResult; cachedAt: number }>();
const CACHE_MS = 24 * 60 * 60 * 1000;

export async function checkQctEligibility(lat: number, lon: number): Promise<QctResult> {
  const key = `${lat.toFixed(5)},${lon.toFixed(5)}`;
  const cached = qctCache.get(key);
  if (cached && Date.now() - cached.cachedAt < CACHE_MS) return cached.result;

  try {
    const geometry = JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } });
    const params = new URLSearchParams({
      geometry,
      geometryType: "esriGeometryPoint",
      spatialRel: "esriSpatialRelIntersects",
      inSR: "4326",
      outFields: "GEOID,GEOID10,TRACT,FIPS,TRACTFIPS,GEO_ID",
      returnGeometry: "false",
      f: "json",
    });

    const res = await fetch(`${HUD_QCT_URL}?${params}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; KnowYourProp/1.0)" },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const features = data.features || [];
    const eligible = features.length > 0;
    const attrs = eligible ? (features[0].attributes || {}) : {};
    const tractFips = attrs.GEOID || attrs.GEOID10 || attrs.TRACTFIPS || attrs.FIPS || attrs.GEO_ID || null;

    const result: QctResult = {
      eligible,
      tractFips,
      source: "HUD Qualified Census Tracts (2024)",
      lastChecked: new Date().toISOString(),
    };
    qctCache.set(key, { result, cachedAt: Date.now() });
    return result;
  } catch (err) {
    console.error("[QCT] Error:", err);
    return { eligible: false, tractFips: null, source: "HUD Qualified Census Tracts (2024)", lastChecked: new Date().toISOString() };
  }
}
