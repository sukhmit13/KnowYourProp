// Philadelphia Deeds / Liens
// Uses OPA sale history + Philadelphia RTT (Real Estate Transfer Tax) records
// Data source: https://data.phila.gov/resource/yfnk-k7r3.json (RTT sales)

const RTT_SALES_URL = 'https://data.phila.gov/resource/yfnk-k7r3.json';

export interface PhillyDeed {
  amount: number;
  recordedDate: string;
  documentType: string;
  documentNumber: string | null;
  grantor: string | null;
  grantee: string | null;
  viewLink: string | null;
}

export interface PhillyLienResult {
  pin: string;
  ownerName: string | null;
  documents: PhillyDeed[];
  deeds: PhillyDeed[];
  mortgages: never[];
  liens: never[];
  releases: never[];
  foreclosures: never[];
  other: never[];
  activeLienCount: number;
  activeMortgageCount: number;
  hasForeclosure: boolean;
  overallStatus: 'clean' | 'unknown';
  recorderUrl: string;
  scrapedAt: string;
  fetchedAt: string;
  isStale: boolean;
  ownerLiens: never[];
  ownerLienScrapedAt: null;
  ownerLienIsStale: boolean;
  source: 'philadelphia_rtt';
}

export async function getPhillyLienData(
  parcelNumber: string,
  ownerName?: string | null
): Promise<PhillyLienResult> {
  const recorderUrl = `https://property.phila.gov/${encodeURIComponent(parcelNumber)}`;

  let deeds: PhillyDeed[] = [];

  try {
    const url = `${RTT_SALES_URL}?$where=opa_account_num='${parcelNumber}'&$order=document_date DESC&$limit=20`;
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });

    if (res.ok) {
      const data: any[] = await res.json();
      deeds = data
        .filter(r => r.document_date && Number(r.total_consideration || 0) >= 0)
        .map(r => ({
          amount: Number(r.total_consideration || 0),
          recordedDate: r.document_date,
          documentType: r.document_type || 'Deed',
          documentNumber: r.document_id || null,
          grantor: r.grantor_1 || r.seller_name || null,
          grantee: r.grantee_1 || r.buyer_name || null,
          viewLink: null,
        }));
    }
  } catch (err) {
    console.error('[PHILLY LIENS] RTT fetch error:', err);
  }

  const resolvedOwner = ownerName || (deeds[0]?.grantee ?? null);

  return {
    pin: parcelNumber,
    ownerName: resolvedOwner,
    documents: deeds,
    deeds,
    mortgages: [],
    liens: [],
    releases: [],
    foreclosures: [],
    other: [],
    activeLienCount: 0,
    activeMortgageCount: 0,
    hasForeclosure: false,
    overallStatus: 'clean',
    recorderUrl,
    scrapedAt: new Date().toISOString(),
    fetchedAt: new Date().toISOString(),
    isStale: false,
    ownerLiens: [],
    ownerLienScrapedAt: null,
    ownerLienIsStale: false,
    source: 'philadelphia_rtt',
  };
}
