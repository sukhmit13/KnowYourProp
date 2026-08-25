import React, { useMemo } from "react";

// ---- Sale History derivation (spec: every flag computed in code, not an LLM) ----
// Pure, exported helper carrying forward the proven saleVM/decoratedVM logic from the
// retired legacy Sale History block. Typed inputs so callers pass explicit data:
//   - pinLookupData.saleHistory  (Cook County Assessor / CCAO declared transfers)
//   - lienData.deeds             (Cook County Recorder instruments)
//   - relatedParcels             (co-parcels, for shared-deed detection)
export type SaleHistoryDerivationInputs = {
  pinLookupData?: {
    pin?: string | null;
    saleHistory?: Array<{
      salePrice?: number;
      saleDate?: string | null;
      year?: string | number | null;
      sellerName?: string | null;
      buyerName?: string | null;
      deedType?: string | null;
      docNo?: string | null;
    }> | null;
  } | null;
  lienData?: {
    deeds?: Array<{
      amount: number;
      recordedDate: string;
      grantor?: string | null;
      grantee?: string | null;
      documentType?: string | null;
      documentNumber?: string | number | null;
      viewLink?: string | null;
    }> | null;
    deedGrantor?: string | null;
    deedGrantee?: string | null;
  } | null;
  relatedParcels?: Array<{
    matchReason?: string | null;
    saleHistory?: Array<{ docNo?: string | null }> | null;
  }> | null;
};

export type DerivedSale = {
  price: number;
  ms: number;
  year: number;
  dateLabel: string;
  monthYear: string;
  approx: boolean;
  grantor: string | null;
  grantee: string | null;
  deedType: string;
  docNo: string | null;
  docUrl: string | null;
  isRecorder: boolean;
  sharedDeed: boolean;
  priceNote: string | null;
  trust: boolean;
  naflag: string | null;
};

export type SaleHistoryDerivation = {
  decoratedVM: DerivedSale[];
  recentSale: DerivedSale | null;
  earlierSales: DerivedSale[];
  journey: DerivedSale[];
  anyApprox: boolean;
  anyNaflag: boolean;
  anyTrusty: boolean;
  firstYear: number;
  lastYear: number;
  recorderDeed: SaleHistoryDerivationInputs["lienData"] extends { deeds?: Array<infer D> | null } ? D | null : any;
  showRecorderSale: boolean;
  isPriceSuspect: boolean;
  correctedSale: any | null;
};

export function deriveSaleHistory({ pinLookupData, lienData, relatedParcels = [] }: SaleHistoryDerivationInputs): SaleHistoryDerivation {
  const recorderDeed = lienData?.deeds
    ?.filter(d => d.amount > 0)
    .sort((a, b) => new Date(b.recordedDate).getTime() - new Date(a.recordedDate).getTime())[0] || null;
  const mostRecentCcaoMs = (pinLookupData?.saleHistory?.length ?? 0) > 0
    ? new Date(pinLookupData!.saleHistory![0].saleDate as string).getTime()
    : 0;
  const recorderDeedMs = recorderDeed ? new Date(recorderDeed.recordedDate).getTime() : 0;
  const isRecorderDuplicateCcao = (() => {
    if (!recorderDeed || !pinLookupData?.saleHistory || pinLookupData.saleHistory.length === 0) return false;
    const ccaoSale = pinLookupData.saleHistory[0];
    if (recorderDeed.amount <= 0 || (ccaoSale.salePrice ?? 0) <= 0) return false;
    const amountMatch = recorderDeed.amount === ccaoSale.salePrice;
    const daysDiff = Math.abs(recorderDeedMs - mostRecentCcaoMs) / (1000 * 60 * 60 * 24);
    return amountMatch && daysDiff <= 45;
  })();
  const showRecorderSale = !!recorderDeed && recorderDeedMs > mostRecentCcaoMs && !isRecorderDuplicateCcao;
  // Sanity-check for truncated/typo prices from public data (e.g. $1,185 when true price is $1,185,000)
  const isPriceSuspect = (() => {
    if (!recorderDeed || recorderDeed.amount <= 0) return false;
    // Absolute floor: no Chicago real estate transaction is under $10k
    if (recorderDeed.amount < 10000) return true;
    // "Value in thousands" typo: amount × 1000 is within 2% of a known CCAO sale price
    if (pinLookupData?.saleHistory?.some(s => (s.salePrice ?? 0) > 0 && Math.abs((recorderDeed.amount * 1000) - (s.salePrice as number)) / (s.salePrice as number) < 0.02)) return true;
    return false;
  })();
  // When price is suspect, find the best CCAO match: same seller (name-token fuzzy match),
  // same year (±1), and a larger price — always prefer the higher amount.
  const correctedSale = (() => {
    if (!isPriceSuspect || !recorderDeed || !pinLookupData?.saleHistory?.length) return null;
    const nameTokens = (n: string) => n.toUpperCase().replace(/[^A-Z\s]/g, '').split(/\s+/).filter(t => t.length > 1);
    const namesMatch = (a: string, b: string) => {
      const ta = new Set(nameTokens(a));
      const tb = new Set(nameTokens(b));
      const shorter = ta.size <= tb.size ? ta : tb;
      const longer = ta.size <= tb.size ? tb : ta;
      const overlap = Array.from(shorter).filter(t => longer.has(t)).length;
      return overlap >= shorter.size; // all tokens of shorter name appear in longer
    };
    const recYear = new Date(recorderDeed.recordedDate).getFullYear();
    const grantor = recorderDeed.grantor || lienData?.deedGrantor || '';
    return pinLookupData.saleHistory.find(s => {
      if ((s.salePrice ?? 0) <= recorderDeed.amount) return false;
      const sYear = s.saleDate ? new Date(s.saleDate).getFullYear() : 0;
      if (Math.abs(sYear - recYear) > 1) return false;
      if (grantor && s.sellerName) return namesMatch(grantor, s.sellerName);
      return Math.abs(sYear - recYear) === 0; // same year fallback
    }) || null;
  })();
  const coParcelDocNos = new Set((relatedParcels ?? []).flatMap(rp => (rp.saleHistory ?? []).map(s => s.docNo).filter((d): d is string => !!d)));

  const fmtFull$ = (v: number) => `$${v.toLocaleString('en-US')}`;
  const isTrustName = (n?: string | null) => !!n && /(\bTRUST\b|AS TRUSTEE|LAND TRUST|BANK\s*(&|AND)\s*TRUST)/i.test(n);
  const relatedEntities = (a?: string | null, b?: string | null) => {
    if (!a || !b) return false;
    const toks = (s: string) => (s.toUpperCase().match(/\d{3,}/g) || []);
    const tb = new Set(toks(b));
    return toks(a).some(t => tb.has(t));
  };
  const pinSearchUrl = pinLookupData?.pin ? `https://crs.cookcountyclerkil.gov/Search/ResultByPin?id1=${pinLookupData.pin.replace(/\D/g, '')}` : null;
  const saleVM: DerivedSale[] = (pinLookupData?.saleHistory || [])
    .filter((s: any) => s.salePrice > 0)
    .map((s: any) => {
      // Normalize YYYY / YYYY-MM / YYYY-MM-DD (noon local, so timezone can't shift the day).
      const raw = String(s.saleDate || '').substring(0, 10);
      const m = raw.match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/);
      const dt = m ? new Date(parseInt(m[1], 10), m[2] ? parseInt(m[2], 10) - 1 : 0, m[3] ? parseInt(m[3], 10) : 1, 12) : null;
      const validDt = dt && !isNaN(dt.getTime()) ? dt : null;
      // Approx = day missing entirely, or defaulted to the 1st (month/year precision only)
      const approx = !!validDt && (!m![3] || m![3] === '01');
      return {
        price: s.salePrice,
        ms: validDt ? validDt.getTime() : 0,
        year: validDt ? validDt.getFullYear() : (parseInt(s.year, 10) || 0),
        dateLabel: validDt ? (approx ? `${validDt.getFullYear()} · month approx.` : validDt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })) : 'Date unknown',
        monthYear: validDt ? validDt.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : String(s.year || ''),
        approx,
        grantor: s.sellerName || null,
        grantee: s.buyerName || null,
        deedType: s.deedType || 'Deed',
        docNo: s.docNo || null,
        docUrl: pinSearchUrl,
        isRecorder: false,
        sharedDeed: !!(s.docNo && coParcelDocNos.has(s.docNo)),
        priceNote: null as string | null,
        trust: false,
        naflag: null as string | null,
      };
    })
    .sort((a: any, b: any) => b.ms - a.ms);
  const recorderIsDupOfAny = !!recorderDeed && (pinLookupData?.saleHistory || []).some((s: any) => {
    if (recorderDeed.amount <= 0 || s.salePrice <= 0) return false;
    if (recorderDeed.documentNumber && s.docNo && String(recorderDeed.documentNumber).replace(/^0+/, '') === String(s.docNo).replace(/^0+/, '')) return true;
    const days = Math.abs(new Date(recorderDeed.recordedDate).getTime() - new Date(s.saleDate).getTime()) / 86400000;
    return recorderDeed.amount === s.salePrice && days <= 45;
  });
  const recorderIsNewest = !!recorderDeed && new Date(recorderDeed.recordedDate).getTime() > (saleVM[0]?.ms || 0);
  if (recorderDeed && recorderDeed.amount > 0 && recorderIsNewest && !recorderIsDupOfAny) {
    const rdt = new Date(recorderDeed.recordedDate);
    saleVM.unshift({
      price: correctedSale ? (correctedSale.salePrice as number) : recorderDeed.amount,
      ms: rdt.getTime(), year: rdt.getFullYear(),
      dateLabel: rdt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      monthYear: rdt.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      approx: false,
      grantor: recorderDeed.grantor || lienData?.deedGrantor || null,
      grantee: recorderDeed.grantee || lienData?.deedGrantee || null,
      deedType: recorderDeed.documentType || 'Deed',
      docNo: recorderDeed.documentNumber != null ? String(recorderDeed.documentNumber) : null,
      docUrl: recorderDeed.viewLink || pinSearchUrl,
      isRecorder: true,
      sharedDeed: (relatedParcels ?? []).some(rp => rp.matchReason?.startsWith('Same deed')),
      priceNote: correctedSale ? `corrected — public record shows ${fmtFull$(recorderDeed.amount)}` : (isPriceSuspect ? 'amount likely incomplete — verify with the Recorder of Deeds' : null),
      trust: false,
      naflag: null,
    });
  }
  // Non-arm's-length flags, first matching reason only (LOGIC 4). Amber, never red.
  const decoratedVM: DerivedSale[] = saleVM.map((s: DerivedSale, i: number) => {
    const trust = /TRUSTEE/i.test(s.deedType);
    let naflag: string | null = null;
    if (trust) naflag = "Trust conveyance — may not be an open-market sale";
    else if (isTrustName(s.grantee) || isTrustName(s.grantor)) naflag = 'Into a land trust — likely a title transfer, not a sale';
    else if (i > 0 && saleVM[i - 1].price > 0 && s.price > saleVM[i - 1].price) naflag = `Higher than the ${saleVM[i - 1].year} price — possible non-market transfer`;
    else if (relatedEntities(s.grantor, s.grantee)) naflag = 'Transfer between related entities';
    return { ...s, trust, naflag };
  });
  const recentSale = decoratedVM[0] || null;
  const earlierSales = decoratedVM.slice(1);
  const journey = [...decoratedVM].sort((a, b) => a.ms - b.ms);
  const anyApprox = decoratedVM.some(s => s.approx);
  const anyNaflag = decoratedVM.some(s => !!s.naflag);
  const anyTrusty = decoratedVM.some(s => s.trust || isTrustName(s.grantee) || isTrustName(s.grantor));
  const firstYear = journey[0]?.year || 0;
  const lastYear = journey[journey.length - 1]?.year || 0;

  return {
    decoratedVM, recentSale, earlierSales, journey,
    anyApprox, anyNaflag, anyTrusty, firstYear, lastYear,
    recorderDeed: recorderDeed as any, showRecorderSale, isPriceSuspect, correctedSale,
  };
}

type DocRefProps = {
  documentNumber?: string | number | null;
  viewLink?: string | null;
  recorderUrl?: string | null;
  recordedDate?: string | null;
  dateIsApprox?: boolean;
  releasedBy?: { documentNumber?: string | number; url?: string } | null;
};

const isStableRecorderSearchUrl = (url?: string | null): boolean => {
  try {
    const parsed = new URL(url || "");
    return parsed.hostname === "crs.cookcountyclerkil.gov"
      && parsed.pathname === "/Search/ResultByPin"
      && parsed.searchParams.has("id1");
  } catch {
    return false;
  }
};

const recorderDocumentUrl = (
  _documentNumber?: string | number | null,
  explicitUrl?: string | null,
  recorderUrl?: string | null,
): string | null => {
  // Recorder Document/Detail URLs include a short-lived session token and fail
  // when opened later in a report. The PIN-result page is the stable public
  // route and lets the user locate the cited document number in the results.
  if (isStableRecorderSearchUrl(explicitUrl)) return explicitUrl!;
  return isStableRecorderSearchUrl(recorderUrl) ? recorderUrl! : null;
};

const formatRecordedDate = (value?: string | null): string => {
  if (!value) return "Date not recorded";
  // Keep date-only recorder values out of UTC so the visible day cannot shift.
  const iso = value.match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/);
  if (iso) {
    if (!iso[2]) return iso[1];
    const parsed = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3] || 1), 12);
    return iso[3]
      ? parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : parsed.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  }
  return value;
};

export function DocRef({ documentNumber, viewLink, recorderUrl, recordedDate, dateIsApprox, releasedBy }: DocRefProps) {
  if (!documentNumber && !recordedDate && !releasedBy?.documentNumber) return null;
  const documentUrl = recorderDocumentUrl(documentNumber, viewLink, recorderUrl);
  const releaseUrl = recorderDocumentUrl(releasedBy?.documentNumber, releasedBy?.url, recorderUrl);
  return (
    <div className="kyp-docref">
      {documentNumber && (
        <>
          <span className="k">Document</span>
          {documentUrl ? (
            <a
              href={documentUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={`Open Cook County Recorder results and locate document #${documentNumber}`}
            >
              #{documentNumber} ↗
            </a>
          ) : (
            <span className="v">#{documentNumber}</span>
          )}
        </>
      )}
      {recordedDate && (
        <>
          {documentNumber && <span className="sep">·</span>}
          <span className="k">Recorded</span>
          <span className="v">{formatRecordedDate(recordedDate)}</span>
        </>
      )}
      {dateIsApprox && <span className="approx">· day not recorded</span>}
      {releasedBy?.documentNumber && (
        <>
          <span className="sep">·</span>
          <span className="k">Released by</span>
           {releaseUrl ? (
             <a
               href={releaseUrl}
               target="_blank"
               rel="noopener noreferrer"
               title={`Open Cook County Recorder results and locate release document #${releasedBy.documentNumber}`}
             >
               #{releasedBy.documentNumber} ↗
             </a>
          ) : (
            <span className="v">#{releasedBy.documentNumber}</span>
          )}
        </>
      )}
    </div>
  );
}

const formatMoney = (value: number): string => `$${Math.round(value).toLocaleString("en-US")}`;
const normalizedDocNumber = (doc: any): string =>
  String(doc?.doc_number ?? doc?.documentNumber ?? doc?.docNo ?? "");
const mortgageAmount = (mortgage: any): number | null => {
  const value = mortgage?.effective_amount ?? mortgage?.amount;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};
const mortgageDate = (mortgage: any): string | null =>
  mortgage?.recording_date ?? mortgage?.recordingDate ?? mortgage?.recordedDate ?? null;
const mortgageLink = (mortgage: any): string | null =>
  mortgage?.viewLink ?? mortgage?.docUrl ?? null;
const additionalPins = (mortgage: any): string[] =>
  Array.from(new Set((mortgage?.blanket_pins ?? []).map((pin: unknown) => String(pin)).filter(Boolean)));
const targetToken = (value: unknown): string =>
  String(value || "record").replace(/[^A-Za-z0-9_-]/g, "-");
const formatPin = (pin: string): string => {
  const digits = pin.replace(/\D/g, "");
  if (digits.length !== 14) return pin;
  const base = `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4, 7)}-${digits.slice(7, 10)}`;
  return digits.slice(10) === "0000" ? base : `${base}-${digits.slice(10)}`;
};
const mortgageRate = (mortgage: any): string => {
  if (/low/i.test(String(mortgage?.extraction_confidence || ""))) return "Not shown";
  const rate = mortgage?.effective_interest_rate ?? mortgage?.interest_rate;
  if (rate == null || rate === "") return "Not extracted";
  return typeof rate === "number" ? `${rate}%` : String(rate).includes("%") ? String(rate) : `${rate}%`;
};
const mortgageMaturity = (mortgage: any): { value: string; note: string | null } => {
  const revolving = mortgage?.revolving === true || mortgage?.is_credit_line === true;
  if (revolving) return { value: "Revolving", note: mortgage?.maturity_note ?? "No fixed maturity shown" };

  const estimated = mortgage?.maturity_source === "estimated";
  const lowExtractionConfidence = /low/i.test(String(mortgage?.extraction_confidence || ""));
  if (lowExtractionConfidence) {
    return { value: "Not shown", note: "Maturity suppressed — low-confidence extraction" };
  }
  const legacyCreditLineUnknown = mortgage?.is_credit_line == null && estimated;
  const lowConfidenceEstimate = estimated && (mortgage?.maturity_estimate_confidence === "low" || lowExtractionConfidence);
  if (legacyCreditLineUnknown || lowConfidenceEstimate) {
    return { value: "Not shown", note: "Estimated date suppressed — loan type or extraction confidence is unresolved" };
  }

  const maturity = mortgage?.effective_maturity_date ?? mortgage?.maturityDate;
  if (!maturity) return { value: "Not recorded", note: null };
  return {
    value: `${estimated ? "Est. " : ""}${formatRecordedDate(maturity)}`,
    note: estimated ? "Estimated from recorded loan terms — verify" : null,
  };
};

const maturityRunway = (mortgage: any, isCleared: boolean): { progress: number; start: string; end: string; status: string } | null => {
  if (isCleared || mortgage?.revolving === true || mortgage?.is_credit_line === true) return null;
  if (mortgage?.maturity_source === "estimated" || /low/i.test(String(mortgage?.extraction_confidence || ""))) return null;
  const startRaw = mortgageDate(mortgage);
  const endRaw = mortgage?.effective_maturity_date ?? mortgage?.maturityDate ?? null;
  if (!startRaw || !endRaw) return null;
  const startMs = Date.parse(startRaw);
  const endMs = Date.parse(endRaw);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
  const nowMs = Date.now();
  const progress = Math.max(0, Math.min(100, ((nowMs - startMs) / (endMs - startMs)) * 100));
  const daysRemaining = Math.ceil((endMs - nowMs) / 86_400_000);
  return {
    progress,
    start: formatRecordedDate(startRaw),
    end: formatRecordedDate(endRaw),
    status: daysRemaining < 0
      ? "Recorded maturity has passed — confirm payoff or extension"
      : daysRemaining <= 90
        ? "Recorded maturity is within 90 days"
        : `${Math.ceil(daysRemaining / 365.25)} years to recorded maturity`,
  };
};

export function OwnershipTitleSection({ pinLookupData, lienData, debtSnapRec, isDebtSnapshotFetched, lienDistress, isLoadingLiens, relatedParcels = [], address, saleDerivation }: {
  pinLookupData?: any;
  lienData?: any;
  debtSnapRec?: any;
  isDebtSnapshotFetched?: boolean;
  lienDistress?: any;
  isLoadingLiens?: boolean;
  relatedParcels?: any[];
  address?: string;
  saleDerivation?: SaleHistoryDerivation;
}) {
  // Proven sale derivation (recorder+CCAO dedupe, truncated-price correction, timezone-safe
  // date parsing, approx flags, provenance, shared-deed, non-arm's-length flags, sorted journey).
  // Prefer the derivation computed by the caller; fall back to computing it here.
  const derived = useMemo(
    () => saleDerivation ?? deriveSaleHistory({ pinLookupData, lienData, relatedParcels }),
    [saleDerivation, pinLookupData, lienData, relatedParcels],
  );
  const sales = derived.decoratedVM;
  const latest = derived.recentSale || undefined;
  const snap = debtSnapRec?.snap;
  const debtSnapshotReady = !!snap;
  // Debt facts are snapshot-only. Raw recorder mortgages are intentionally not
  // used here because they have not gone through release/sale reconciliation.
  const active = debtSnapshotReady ? (snap?.active || []) : [];
  const released = debtSnapshotReady ? [...(snap?.satisfied || []), ...(snap?.cleared_by_sale || [])].filter((mortgage: any, index: number, list: any[]) => {
    const doc = normalizedDocNumber(mortgage);
    return list.findIndex((candidate) => normalizedDocNumber(candidate) === doc) === index;
  }) : [];
  const allPropertyLiens = lienData?.liens || [];
  const liens = allPropertyLiens.filter((l: any) => !l.isReleased && !l.isProbablyCleared);
  const historicalLiens = allPropertyLiens.filter((l: any) => l.isReleased || l.isProbablyCleared);
  const releaseDocuments = (lienData?.documents || []).filter((doc: any) =>
    doc.category === "release" || /release|satisfaction/i.test(doc.documentType || "")
  );
  const releaseFor = (documentNumber: string): any | null =>
    releaseDocuments.find((release: any) =>
      (release.releasesDocNumbers || []).some((releasedDoc: string) =>
        targetToken(releasedDoc).replace(/^0+/, "") === targetToken(documentNumber).replace(/^0+/, "")
      )
    ) || null;
  const owner = lienData?.ownerName || latest?.grantee || "Owner not resolved";
  const entity = /LLC|L\.L\.C|TRUST|INC|LP\b/i.test(owner);
  const titleKnown = !!lienData && !isLoadingLiens && !lienData.searchFailed;
  const activeLienCount = titleKnown
    ? Math.max(Number(lienData?.activeLienCount ?? 0), liens.length)
    : null;
  const hasForeclosure = !!lienDistress?.hasForeclosureActive || !!snap?.foreclosure_active;
  const activeLisPendensCount = Number(lienDistress?.lis?.activeCount ?? 0);
  const titleBadge: [string, string] = hasForeclosure
    ? ["bad", "Foreclosure"]
    : activeLisPendensCount > 0
      ? ["bad", "Lis pendens"]
      : (activeLienCount ?? 0) > 0
        ? ["att", `${activeLienCount} active lien${activeLienCount === 1 ? "" : "s"}`]
        : titleKnown
          ? ["good", "Clear title"]
          : ["ctx", "Status unknown"];

  const since = latest?.monthYear || "unknown";
  const recordedPrincipal = debtSnapshotReady && typeof snap?.combined_recorded_debt === "number"
    ? snap.combined_recorded_debt
    : null;
  const beforeCloseLoans = active.filter((mortgage: any) =>
    mortgage?.lien_kind === "junior" ||
    mortgage?.revolving === true ||
    mortgage?.is_credit_line === true
  );
  const scopeChanges = snap?.scopeChanges ?? [];
  const cashOutAnnotations = [...active, ...released].filter((mortgage: any) =>
    mortgage?.cashOutSuspect && typeof mortgage?.recordedDelta === "number"
  );
  const subjectPin = String(pinLookupData?.pin || lienData?.pin || "").replace(/\D/g, "");
  const recorderSearchUrl = lienData?.recorderUrl
    || (subjectPin ? `https://crs.cookcountyclerkil.gov/Search/ResultByPin?id1=${subjectPin}` : null);

  const timelineEvents = [
    ...sales.map((sale: DerivedSale) => ({
      key: `sale-${sale.docNo || sale.ms}`,
      ms: sale.ms,
      date: sale.dateLabel,
      type: "Paid",
      detail: `${formatMoney(sale.price)} sale`,
      documentNumber: sale.docNo,
      url: recorderDocumentUrl(sale.docNo, sale.docUrl, recorderSearchUrl),
      targetId: `ownership-sale-${targetToken(sale.docNo || sale.ms)}`,
      fullRecord: `${sale.deedType || "Deed"} · ${sale.grantor || "grantor not recorded"} to ${sale.grantee || "grantee not recorded"} · ${formatMoney(sale.price)}`,
    })),
    ...[...active, ...released].map((mortgage: any) => {
      const rawDate = mortgageDate(mortgage);
      return {
        key: `loan-${normalizedDocNumber(mortgage)}`,
        ms: rawDate ? new Date(rawDate).getTime() : 0,
        date: formatRecordedDate(rawDate),
        type: mortgage.resolved_by_sale || released.includes(mortgage) ? "Prior debt" : "Borrowed",
        detail: mortgageAmount(mortgage) != null ? `${formatMoney(mortgageAmount(mortgage)!)} recorded` : "Amount not extracted",
        documentNumber: normalizedDocNumber(mortgage) || null,
        url: recorderDocumentUrl(normalizedDocNumber(mortgage), mortgageLink(mortgage), recorderSearchUrl),
        targetId: `ownership-debt-${targetToken(normalizedDocNumber(mortgage) || rawDate)}`,
        fullRecord: `${mortgage.display_lender || mortgage.lender || "Mortgage"} · ${mortgageAmount(mortgage) != null ? formatMoney(mortgageAmount(mortgage)!) : "amount not extracted"} · document ${normalizedDocNumber(mortgage) || "not recorded"}`,
      };
    }),
    ...allPropertyLiens.map((lien: any) => {
      const rawDate = lien.recordingDate ?? lien.recordedDate ?? null;
      const historical = lien.isReleased || lien.isProbablyCleared;
      return {
        key: `claim-${normalizedDocNumber(lien)}`,
        ms: rawDate ? new Date(rawDate).getTime() : 0,
        date: formatRecordedDate(rawDate),
        type: historical ? "Prior claim" : "Claimed",
        detail: lien.documentType || "Title claim",
        documentNumber: normalizedDocNumber(lien) || null,
        url: recorderDocumentUrl(normalizedDocNumber(lien), lien.viewLink, recorderSearchUrl),
        targetId: `ownership-claim-${targetToken(normalizedDocNumber(lien) || rawDate)}`,
        fullRecord: `${lien.documentType || "Title claim"} · ${lien.grantor || lien.claimant || "claimant not recorded"} · document ${normalizedDocNumber(lien) || "not recorded"}`,
      };
    }),
  ].sort((a, b) => a.ms - b.ms);
  const hasRefinanceRelationship = [...active, ...released].some((mortgage: any) => mortgage?.refi_suspect);
  const coverageLoans = [...active, ...released]
    .map((mortgage: any) => ({ mortgage, pins: additionalPins(mortgage) }))
    .filter(({ pins }) => pins.length > 0);
  const coverageByPin = new Map<string, string[]>();
  coverageLoans.forEach(({ mortgage, pins }: any) => {
    const documentNumber = normalizedDocNumber(mortgage);
    const namedPins = Array.from(new Set([subjectPin, ...pins.map((pin: string) => pin.replace(/\D/g, ""))].filter(Boolean)));
    namedPins.forEach((pin) => {
      coverageByPin.set(pin, [...(coverageByPin.get(pin) || []), documentNumber]);
    });
  });
  const coverageRows = Array.from(coverageByPin.entries());
  const showTimeline = sales.length >= 2
    || active.length + released.length >= 2
    || hasRefinanceRelationship
    || scopeChanges.length > 0
    || coverageLoans.length > 0;

  return (
    <div id="section-ownership" data-testid="section-ownership" className="kyp-ownership">
      {relatedParcels.length > 0 && (
        <div className="kyp-owner-banner" id="asmb-double-lot">
          <b>Co-parcel title context.</b> This view covers {address || "the subject parcel"} and {relatedParcels.length} matched companion parcel{relatedParcels.length === 1 ? "" : "s"}
          {relatedParcels[0]?.formattedAddress ? `, including ${relatedParcels[0].formattedAddress}` : ""}. Debt stays tied to the document and PINs that name it.
        </div>
      )}

      <div className="kyp-owner">
        <span className="olab">Owner</span>
        <span className="onm">{owner}</span>
        {entity && <span className="oent">Entity</span>}
        <span className="osince">Held since <b>{since}</b></span>
      </div>

      <div className="kyp-blocks">
        <div className="kyp-block ind">
          <span className="kyp-mt paid">Paid</span>
          <span className="bv">{latest ? formatMoney(latest.price) : "—"}</span>
          <span className="bl">Most recent declared sale</span>
          <span className="bd">{latest ? latest.dateLabel : "No qualifying recorded sale"}</span>
        </div>
        <div className="kyp-block debt">
          <span className="kyp-mt borrowed">Borrowed</span>
          <span className="bv">{recordedPrincipal != null ? formatMoney(recordedPrincipal) : "—"}</span>
          <span className="bl">Original recorded principal</span>
          <span className="bd">
            {!debtSnapshotReady
              ? (isDebtSnapshotFetched ? "Resolved debt snapshot unavailable" : "Resolving recorder debt")
              : active.length
                ? `${active.length} unreleased instrument${active.length === 1 ? "" : "s"} · not a balance`
                : "No unreleased mortgage in resolved snapshot"}
          </span>
        </div>
        <div className={`kyp-block ${(activeLienCount ?? 0) > 0 ? "bad" : titleKnown ? "grn" : "slate"}`}>
          <span className="kyp-mt claimed">Claimed</span>
          <span className="bv">{activeLienCount ?? "—"}</span>
          <span className="bl">Active property liens</span>
          <span className="bd">{!titleKnown ? "Recorder status unavailable" : activeLienCount ? "Review payoff or release" : "No active property lien found"}</span>
        </div>
      </div>

      {beforeCloseLoans.length > 0 && (
        <div className="kyp-loc" data-testid="ownership-before-close">
          <span className="ic">Before close</span>
          <span className="tx">
            <b>Confirm payoff and release for {beforeCloseLoans.length} junior or revolving instrument{beforeCloseLoans.length === 1 ? "" : "s"}.</b>{" "}
            An unreleased subordinate mortgage or credit line can remain available after paydown and must be cleared expressly.
          </span>
        </div>
      )}

      {showTimeline && (
        <div className="kyp-otl" data-testid="ownership-timeline">
          <div className="kyp-subhead"><span className="lbl">Ownership &amp; debt timeline</span><span className="rule" /></div>
          <div className="kyp-otlplot">
            <div className="kyp-timeline-line" />
            <div className="kyp-timeline-events">
              {timelineEvents.slice(0, 12).map((event) => {
                const content = (
                  <>
                  <b>{event.date}</b>
                  <small><strong>{event.type}</strong> · {event.detail}</small>
                  </>
                );
                return (
                  <button
                    type="button"
                    key={event.key}
                    className={`kyp-timeline-event ${event.type.toLowerCase().replace(/\s/g, "-")}`}
                    onClick={() => {
                      const target = document.getElementById(event.targetId);
                      if (!target) return;
                      target.scrollIntoView({ behavior: "smooth", block: "center" });
                      target.classList.add("kyp-target-flash");
                      window.setTimeout(() => target.classList.remove("kyp-target-flash"), 1400);
                    }}
                    title={`${event.fullRecord}. Jump to the full record below.`}
                    aria-label={`${event.fullRecord}. Jump to the full record below.`}
                  >
                    {content}
                  </button>
                );
              })}
            </div>
          </div>
          {coverageLoans.length > 0 && (
            <div className="kyp-timeline-coverage" data-testid="ownership-parcel-coverage">
              <span className="coverage-label">Parcel coverage</span>
              <div>
                {coverageRows.map(([pin, documentNumbers]) => (
                  <p className="coverage-row" key={`coverage-${pin}`}>
                    <b>PIN {formatPin(pin)}</b>
                    <span>{documentNumbers.length === 1 ? "Loan" : "Loans"} {documentNumbers.map(doc => `#${doc}`).join(", ")}</span>
                  </p>
                ))}
              </div>
            </div>
          )}
          {scopeChanges.map((change: any, index: number) => (
            <div className="kyp-scope-change" key={`${change.atDocNumber}-${index}`}>
              <b>Parcel scope changed at document #{change.atDocNumber}.</b>{" "}
              {change.addedPins?.length ? `Added ${change.addedPins.map(formatPin).join(", ")}. ` : ""}
              {change.droppedPins?.length ? `Dropped ${change.droppedPins.map(formatPin).join(", ")}.` : ""}
            </div>
          ))}
        </div>
      )}

      {cashOutAnnotations.map((mortgage: any) => (
        <div className="kyp-loc kyp-cashout" key={`cash-${normalizedDocNumber(mortgage)}`} data-testid="ownership-recorded-delta">
          <span className="ic">Recorded gap</span>
          <span className="tx">
            <b>The newer recorded principal is {formatMoney(mortgage.recordedDelta)} higher than the loan it appears to replace.</b>{" "}
            This is the change between original recorded loan amounts, not cash taken out. Public records do not publish payoff balances or proceeds.
          </span>
        </div>
      ))}

      <div className="kyp-subhead">
        <span className="lbl">Chain of title</span>
        <span className="ct">{sales.length} qualifying transfer{sales.length === 1 ? "" : "s"}</span>
        <span className="rule" />
      </div>
      {sales.length === 0 && <div className="kyp-status-empty">No qualifying sale with a declared price was found in the available transfer record.</div>}
      {sales.map((sale: DerivedSale, index: number) => (
        <div id={`ownership-sale-${targetToken(sale.docNo || sale.ms)}`} className="kyp-xact" key={`${sale.docNo || sale.ms}-${index}`} data-testid={index === 0 ? "sale-recent" : `sale-item-${index}`}>
          <div className="xtop">
            <span className="xttl">{sale.grantee ? `Transferred to ${sale.grantee}` : "Recorded transfer"}</span>
            <span className="xamt">{formatMoney(sale.price)}</span>
          </div>
          <div className="xtags">
            <span className="xtag">{sale.deedType || "Deed"}</span>
            <span className="xtag">{sale.isRecorder ? "Recorder" : "Assessor"}</span>
            {index === 0 && <span className="xtag ok">Most recent</span>}
            {sale.sharedDeed && <span className="xtag">Shared deed</span>}
            {sale.naflag && <span className="xtag att">{sale.naflag}</span>}
          </div>
          <div className="xgrid">
            <div className="xf"><span className="k">From</span><span className="v">{sale.grantor || "Not recorded"}</span></div>
            <div className="xf"><span className="k">To</span><span className="v">{sale.grantee || "Not recorded"}</span></div>
          </div>
          {sale.priceNote && <div className="kyp-otlnote">{sale.priceNote}</div>}
          <DocRef documentNumber={sale.docNo} viewLink={sale.docUrl} recorderUrl={recorderSearchUrl} recordedDate={sale.dateLabel} dateIsApprox={sale.approx} />
        </div>
      ))}

      <div className="kyp-subhead">
        <span className="lbl">Debt on title</span>
        <span className="ct">{debtSnapshotReady ? `current owner · ${active.length} unreleased · ${released.length} historical/cleared` : "resolved snapshot required"}</span>
        <span className="rule" />
      </div>
      {!debtSnapshotReady ? (
        <div className="kyp-status-empty unknown">
          <b>Debt status is not resolved yet.</b>{" "}
          {isDebtSnapshotFetched ? "The reconciled debt snapshot is unavailable; raw mortgage records are not shown as active debt." : "Recorder mortgages are still being reconciled against releases and sales."}
        </div>
      ) : active.length === 0 && released.length === 0 && (
        <div className="kyp-status-empty">No mortgage instrument was available in the recorder result.</div>
      )}
      {[...active, ...released].map((mortgage: any, index: number) => {
        const isCleared = released.includes(mortgage);
        const amount = mortgageAmount(mortgage);
        const maturity = mortgageMaturity(mortgage);
        const revolving = mortgage.revolving === true || mortgage.is_credit_line === true;
        const runway = maturityRunway(mortgage, isCleared);
        const releaseNumber = mortgage.releasedBy?.documentNumber
          ?? mortgage.releaseDocumentNumber
          ?? mortgage.releasesDocNumbers?.[0]
          ?? mortgage.satisfied_by
          ?? null;
        return (
          <div id={`ownership-debt-${targetToken(normalizedDocNumber(mortgage) || mortgageDate(mortgage))}`} className={`kyp-xact loan ${isCleared ? "cleared" : ""}`} key={normalizedDocNumber(mortgage) || index}>
            <div className="xtop">
              <span className="xttl">{mortgage.display_lender || mortgage.lender || mortgage.grantee || "Recorded mortgage"}</span>
              <span className="xamount">
                <span className="xamt">{amount != null ? formatMoney(amount) : "—"}</span>
                <small>{revolving ? "Maximum indebtedness" : "Original recorded principal"}</small>
              </span>
            </div>
            <div className="xtags">
              <span className={`kyp-mt ${isCleared ? "cleared" : "borrowed"}`}>{isCleared ? (mortgage.resolved_by_sale ? "Cleared by sale" : "Released") : revolving ? "Credit line" : "Borrowed"}</span>
              <span className="xtag">{mortgage.lien_kind === "junior" ? "Junior lien" : "Mortgage"}</span>
              {mortgage.refi_suspect && <span className="xtag att">Possible refinance</span>}
               {revolving && <span className="xtag att">Revolving</span>}
            </div>
            <div className="kyp-terms">
              <div><span className="tk">Rate</span><span className="tv sm">{mortgageRate(mortgage)}</span>{/low/i.test(String(mortgage?.extraction_confidence || "")) && <span className="tn">Suppressed — low-confidence extraction</span>}</div>
              <div><span className="tk">Maturity</span><span className="tv sm">{maturity.value}</span>{maturity.note && <span className="tn">{maturity.note}</span>}</div>
              <div><span className="tk">Position</span><span className="tv sm">{mortgage.position ? `${mortgage.position}` : isCleared ? "Historical" : "Not resolved"}</span></div>
            </div>
            {runway && (
              <div className="kyp-runway" data-testid="ownership-maturity-runway">
                <div className="runway-head"><span>Recorded maturity runway</span><b>{runway.status}</b></div>
                <div className="runway-track"><span style={{ width: `${runway.progress}%` }} /></div>
                <div className="runway-dates"><span>{runway.start}</span><span>{runway.end}</span></div>
              </div>
            )}
            {(mortgage.note || mortgage.status) && (
              <div className="kyp-loan-note">{mortgage.note || mortgage.status}</div>
            )}
            <DocRef
              documentNumber={normalizedDocNumber(mortgage) || null}
              viewLink={mortgageLink(mortgage)}
              recorderUrl={recorderSearchUrl}
              recordedDate={mortgageDate(mortgage)}
              releasedBy={releaseNumber ? { documentNumber: releaseNumber, url: mortgage.releasedBy?.url } : null}
            />
          </div>
        );
      })}

      <div className="kyp-subhead">
        <span className="lbl">Title status</span>
        <span className={`kyp-pill ${titleBadge[0]}`}>{titleBadge[1]}</span>
        <span className="rule" />
      </div>
      {!titleKnown ? (
        <div className="kyp-status-empty unknown" data-testid="ownership-title-unknown">
          <b>Title status is unavailable.</b>{" "}
          {isLoadingLiens ? "Recorder records are still loading." : "The recorder search failed; no clean-title conclusion is shown."}
        </div>
      ) : (
        <>
          {hasForeclosure && <div className="kyp-title-alert bad"><b>Active foreclosure filing.</b> Confirm the case status and disposition before relying on title.</div>}
          {activeLisPendensCount > 0 && <div className="kyp-title-alert bad"><b>{activeLisPendensCount} active lis pendens filing{activeLisPendensCount === 1 ? "" : "s"}.</b> Litigation may cloud title until dismissed or released.</div>}
          {liens.map((lien: any, index: number) => (
            <div id={`ownership-claim-${targetToken(normalizedDocNumber(lien) || lien.recordingDate || lien.recordedDate)}`} className="kyp-xact claim" key={normalizedDocNumber(lien) || index}>
              <div className="xtop"><span className="xttl">{lien.documentType || "Lien or filing"}</span></div>
              <div className="xgrid">
                <div className="xf"><span className="k">Claimant</span><span className="v">{lien.grantor || lien.claimant || "Not recorded"}</span></div>
                <div className="xf"><span className="k">Status</span><span className="v">No release matched</span></div>
              </div>
              <DocRef
                documentNumber={normalizedDocNumber(lien) || null}
                viewLink={lien.viewLink}
                recorderUrl={recorderSearchUrl}
                recordedDate={lien.recordingDate || lien.recordedDate}
              />
            </div>
          ))}
          {historicalLiens.length > 0 && (
            <>
              <div className="kyp-subhead kyp-subhead-minor">
                <span className="lbl">Historical filings</span>
                <span className="ct">{historicalLiens.length} released or probably cleared</span>
                <span className="rule" />
              </div>
              {historicalLiens.map((lien: any, index: number) => {
                const documentNumber = normalizedDocNumber(lien);
                const release = releaseFor(documentNumber);
                return (
                  <div id={`ownership-claim-${targetToken(documentNumber || lien.recordingDate || lien.recordedDate)}`} className="kyp-xact claim cleared" key={`historical-${documentNumber || index}`}>
                    <div className="xtop"><span className="xttl">{lien.documentType || "Historical lien or filing"}</span></div>
                    <div className="xtags">
                      <span className="kyp-mt cleared">{lien.isReleased ? "Released" : "Probably cleared"}</span>
                      {lien.isProbablyCleared && !lien.isReleased && <span className="xtag att">No matching release — verify</span>}
                    </div>
                    <div className="xgrid">
                      <div className="xf"><span className="k">Claimant</span><span className="v">{lien.grantor || lien.claimant || "Not recorded"}</span></div>
                      <div className="xf">
                        <span className="k">Resolution evidence</span>
                        <span className="v">
                          {release
                            ? `Release document #${release.documentNumber}`
                            : lien.isReleased
                              ? "Recorder result marks this filing released"
                              : "Age-based probable-clearance flag only"}
                        </span>
                      </div>
                    </div>
                    <DocRef
                      documentNumber={documentNumber || null}
                      viewLink={lien.viewLink}
                      recorderUrl={recorderSearchUrl}
                      recordedDate={lien.recordingDate || lien.recordedDate}
                      releasedBy={release?.documentNumber ? { documentNumber: release.documentNumber, url: release.viewLink } : null}
                    />
                  </div>
                );
              })}
            </>
          )}
          {!hasForeclosure && activeLisPendensCount === 0 && activeLienCount === 0 && (
            <div className="kyp-status-empty clear">
              <b>No active foreclosure, lis pendens, or property lien was found.</b> A title company must still run the closing-date search and confirm releases.
            </div>
          )}
        </>
      )}

      <div className="kyp-src">
        Sources: Cook County Assessor transfer records and Cook County Recorder instruments. Sale prices are declared transfer amounts. Loan amounts are original recorded principal, not balances; positions and refinance relationships are inferred from recording evidence and must be confirmed at title.
      </div>
    </div>
  );
}