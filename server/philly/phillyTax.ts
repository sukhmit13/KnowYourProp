// Philadelphia Real Estate Tax
// - Annual tax estimated from OPA market value × effective tax rate
// - Payment status from Philadelphia tax delinquency dataset
// Data source: https://data.phila.gov/resource/fijh-hugr.json (delinquencies)

const PHILLY_TAX_RATE = 0.013998; // 1.3998% effective rate (City + School District, 2024)
const TAX_DELINQUENCY_URL = 'https://data.phila.gov/resource/fijh-hugr.json';

export interface PhillyTaxResult {
  pin: string;
  taxYearMostRecent: number | null;
  totalAnnualTaxAmount: number | null;
  paymentStatus: 'current' | 'delinquent' | 'unknown';
  taxYears: Array<{
    year: number;
    installment1: number;
    installment2: number;
    status: 'paid' | 'partial' | 'unpaid';
    totalBilled: number;
    totalPaid: number;
  }>;
  marketValue: number | null;
  assessedValue: number | null;
  treasurerBillUrl: string;
  source: 'philadelphia_opa';
  fetchedAt: string;
  isStale: boolean;
  landSquareFeet: number | null;
  buildingSquareFeet: number | null;
  yearBuilt: number | null;
  propertyClass: string | null;
  buildingType: string | null;
  buildingUse: string | null;
  apartments: number | null;
  stories: number | null;
  basement: null;
  attic: null;
}

export async function getPhillyPropertyTax(
  parcelNumber: string,
  marketValue?: number | null,
  opaData?: any
): Promise<PhillyTaxResult> {
  const billUrl = `https://property.phila.gov/${encodeURIComponent(parcelNumber)}`;

  const estimatedAnnual = marketValue
    ? Math.round(marketValue * PHILLY_TAX_RATE)
    : null;

  let paymentStatus: PhillyTaxResult['paymentStatus'] = 'unknown';

  try {
    const url = `${TAX_DELINQUENCY_URL}?parcel_number=${encodeURIComponent(parcelNumber)}&$limit=1`;
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (res.ok) {
      const data: any[] = await res.json();
      if (data && data.length > 0) {
        paymentStatus = 'delinquent';
      } else {
        paymentStatus = 'current';
      }
    }
  } catch (err) {
    console.error('[PHILLY TAX] Delinquency check error:', err);
  }

  const currentYear = new Date().getFullYear();
  const taxYears = estimatedAnnual
    ? [
        {
          year: currentYear - 1,
          installment1: Math.round(estimatedAnnual / 2),
          installment2: Math.round(estimatedAnnual / 2),
          status: paymentStatus === 'delinquent' ? ('unpaid' as const) : ('paid' as const),
          totalBilled: estimatedAnnual,
          totalPaid: paymentStatus === 'delinquent' ? 0 : estimatedAnnual,
        },
      ]
    : [];

  return {
    pin: parcelNumber,
    taxYearMostRecent: estimatedAnnual ? currentYear - 1 : null,
    totalAnnualTaxAmount: estimatedAnnual,
    paymentStatus,
    taxYears,
    marketValue: marketValue || null,
    assessedValue: marketValue || null,
    treasurerBillUrl: billUrl,
    source: 'philadelphia_opa',
    fetchedAt: new Date().toISOString(),
    isStale: false,
    landSquareFeet: opaData?.total_area ? Number(opaData.total_area) : null,
    buildingSquareFeet: opaData?.total_livable_area ? Number(opaData.total_livable_area) : null,
    yearBuilt: opaData?.year_built ? Number(opaData.year_built) : null,
    propertyClass: opaData?.category_code || null,
    buildingType: opaData?.building_code_description || null,
    buildingUse: opaData?.category_code_description || null,
    apartments: opaData?.number_of_units ? Number(opaData.number_of_units) : null,
    stories: opaData?.number_stories ? Number(opaData.number_stories) : null,
    basement: null,
    attic: null,
  };
}
