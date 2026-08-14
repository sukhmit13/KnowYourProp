// Philadelphia OPA (Office of Property Assessment) Property Lookup
// Replaces Cook County PIN resolution for Philadelphia addresses
// Data source: https://data.phila.gov/resource/tti4-y3gg.json (Socrata)

const OPA_PROPERTIES_URL = 'https://data.phila.gov/resource/tti4-y3gg.json';
const OPA_SALES_URL = 'https://data.phila.gov/resource/yfnk-k7r3.json';

export interface OpaProperty {
  parcel_number: string;
  location: string;
  owner_1: string;
  owner_2?: string;
  zoning?: string;
  year_built?: number;
  total_area?: number;
  total_livable_area?: number;
  number_of_rooms?: number;
  number_stories?: number;
  category_code?: string;
  category_code_description?: string;
  sale_date?: string;
  sale_price?: number;
  market_value?: number;
  taxable_land?: number;
  taxable_building?: number;
  zip_code?: string;
  unit?: string;
  building_code?: string;
  building_code_description?: string;
  number_of_units?: number;
  quality_grade?: string;
}

export interface OpaLookupResult {
  pin: string;
  source: string;
  confidence: string;
  propertyType: string | null;
  ownerName: string | null;
  zoning: string | null;
  commercialData: {
    bldgSf: number | null;
    landSf: number | null;
    yearBuilt: number | null;
    totalUnits: number | null;
    marketValue: number | null;
    propertyTypeUse: string | null;
    address: string | null;
  } | null;
  saleHistory: Array<{
    saleDate: string;
    salePrice: number;
    sellerName: string | null;
    buyerName: string | null;
    deedType: string | null;
    docNo: string | null;
    year: string;
  }>;
  assessedValues: Array<{
    year: string;
    mailedTotal: number;
    certifiedTotal: number;
  }>;
}

function normalizePhillyAddress(address: string): string {
  return address
    .toUpperCase()
    .replace(/,\s*(PHILADELPHIA|PHILA|PA|PHILLY)[^,]*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractStreetPart(address: string): string {
  const normalized = normalizePhillyAddress(address);
  const parts = normalized.split(',');
  return parts[0].trim();
}

export async function lookupOpaProperty(address: string): Promise<OpaLookupResult | null> {
  try {
    const streetPart = extractStreetPart(address);
    console.log(`[OPA] Looking up Philadelphia property: ${streetPart}`);

    const query = encodeURIComponent(streetPart);
    const url = `${OPA_PROPERTIES_URL}?$where=upper(location) LIKE '%25${query}%25'&$limit=5&$order=parcel_number ASC`;

    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' }
    });

    if (!res.ok) {
      console.error(`[OPA] API error: ${res.status} ${res.statusText}`);
      return null;
    }

    const data: OpaProperty[] = await res.json();

    if (!data || data.length === 0) {
      console.log(`[OPA] No results for: ${streetPart}`);
      return null;
    }

    // Pick the best match — exact house number match preferred
    const houseNumMatch = streetPart.match(/^(\d+)/);
    const houseNum = houseNumMatch ? houseNumMatch[1] : null;

    let best = data[0];
    if (houseNum) {
      const exact = data.find(p => p.location?.startsWith(houseNum + ' '));
      if (exact) best = exact;
    }

    console.log(`[OPA] Found: ${best.parcel_number} — ${best.location} — Owner: ${best.owner_1}`);

    // Fetch recent sale history from RTT dataset
    const saleHistory = await fetchOpaSaleHistory(best.parcel_number);

    // If OPA has a sale_date and it's not in RTT history, add it
    if (best.sale_date && best.sale_price) {
      const saleYear = new Date(best.sale_date).getFullYear().toString();
      const alreadyIn = saleHistory.some(s => s.year === saleYear && s.salePrice === best.sale_price);
      if (!alreadyIn) {
        saleHistory.unshift({
          saleDate: best.sale_date,
          salePrice: Number(best.sale_price),
          sellerName: null,
          buyerName: best.owner_1 || null,
          deedType: null,
          docNo: null,
          year: saleYear,
        });
      }
    }

    const categoryDesc = best.category_code_description || best.building_code_description || null;

    return {
      pin: best.parcel_number,
      source: 'opa_philadelphia',
      confidence: 'high',
      propertyType: categoryDesc,
      ownerName: [best.owner_1, best.owner_2].filter(Boolean).join(' / ') || null,
      zoning: best.zoning || null,
      commercialData: {
        bldgSf: best.total_livable_area ? Number(best.total_livable_area) : null,
        landSf: best.total_area ? Number(best.total_area) : null,
        yearBuilt: best.year_built ? Number(best.year_built) : null,
        totalUnits: best.number_of_units ? Number(best.number_of_units) : null,
        marketValue: best.market_value ? Number(best.market_value) : null,
        propertyTypeUse: categoryDesc,
        address: best.location || null,
      },
      saleHistory,
      assessedValues: best.market_value ? [{
        year: new Date().getFullYear().toString(),
        mailedTotal: Number(best.market_value),
        certifiedTotal: Number(best.market_value),
      }] : [],
    };
  } catch (err) {
    console.error('[OPA] Lookup error:', err);
    return null;
  }
}

async function fetchOpaSaleHistory(parcelNumber: string): Promise<OpaLookupResult['saleHistory']> {
  try {
    const url = `${OPA_SALES_URL}?$where=opa_account_num='${parcelNumber}'&$order=sale_date DESC&$limit=10`;
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) return [];

    const data: any[] = await res.json();
    return data
      .filter(r => r.sale_date && Number(r.sale_price) > 0)
      .map(r => ({
        saleDate: r.sale_date,
        salePrice: Number(r.sale_price),
        sellerName: r.seller_name || null,
        buyerName: r.buyer_name || null,
        deedType: null,
        docNo: r.document_id || null,
        year: new Date(r.sale_date).getFullYear().toString(),
      }));
  } catch {
    return [];
  }
}

export async function lookupOpaByParcelNumber(parcelNumber: string): Promise<OpaProperty | null> {
  try {
    const url = `${OPA_PROPERTIES_URL}?parcel_number=${encodeURIComponent(parcelNumber)}&$limit=1`;
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) return null;
    const data: OpaProperty[] = await res.json();
    return data[0] || null;
  } catch {
    return null;
  }
}
