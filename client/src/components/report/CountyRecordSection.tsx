import React, { useState } from "react";
import { ExternalLink, Info, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KypSubhead } from "@/components/report/AccordionSection";
import { CountyLookupStatus } from "./CountyLookupStatus";
import type { CountyLookupState } from "@/lib/countyLookupState";

type TaxRecord = any;
type LookupRecord = any;

interface CountyRecordSectionProps {
  propertyTaxData: TaxRecord | null | undefined;
  pinLookupData: LookupRecord | null | undefined;
  isLoadingPropertyTax: boolean;
  isLoadingPinLookup: boolean;
  refreshPropertyTax: { mutate: (pin: string) => void; isPending: boolean };
  submittedPin: string | null;
  propertyPin: string;
  setPropertyPin: (value: string) => void;
  setSubmittedPin: (value: string | null) => void;
  lookupState?: CountyLookupState;
  onRetryLookup?: () => void;
  run: any;
  showManualEntryForm: boolean;
  setShowManualEntryForm: (value: boolean) => void;
  manualBuildingSqFt: string;
  setManualBuildingSqFt: (value: string) => void;
  manualLandSqFt: string;
  setManualLandSqFt: (value: string) => void;
  manualStories: string;
  setManualStories: (value: string) => void;
  handleSaveManualProperty: () => void;
  updateManualProperty: { isPending: boolean };
  coParcelPin?: string | null;
  coParcelAddress?: string | null;
}

const CLASS_DESCRIPTIONS: Record<string, string> = {
  "211": "Two- to six-flat",
  "212": "Three- to six-flat",
  "213": "Seven- to nine-unit building",
  "214": "Ten- to twenty-unit building",
  "205": "Apartment building",
  "206": "Apartment building",
  "207": "Apartment building",
  "5": "Commercial",
};

function numberValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseUnits(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const words: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
    seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  };
  const raw = String(value).toLowerCase().trim();
  const leadingWord = raw.match(/^[a-z]+/)?.[0];
  return words[raw] ?? (leadingWord ? words[leadingWord] : undefined) ?? (Number.isInteger(Number.parseInt(raw, 10)) ? Number.parseInt(raw, 10) : null);
}

function fmtNumber(value: unknown): string {
  const n = numberValue(value);
  return n === null ? "Not recorded" : n.toLocaleString("en-US");
}

function fmtMoney(value: unknown): string {
  const n = numberValue(value);
  return n === null ? "Not recorded" : `$${n.toLocaleString("en-US")}`;
}

function fmtPercent(value: unknown, digits = 1): string {
  const n = numberValue(value);
  return n === null ? "Not recorded" : `${(n * 100).toFixed(digits)}%`;
}

function cleanYear(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return String(value).replace(/\.0$/, "");
}

function pinLabel(pin: unknown): string {
  const digits = String(pin ?? "").replace(/\D/g, "");
  return digits.length === 14
    ? digits.replace(/(\d{2})(\d{2})(\d{3})(\d{3})(\d{4})/, "$1-$2-$3-$4-$5")
    : String(pin ?? "Not recorded");
}

function sourceLabel(source: string | undefined): string {
  if (source === "exempt_api") return "Exempt-property assessment record";
  if (source === "geo_fallback") return "Nearest-parcel match";
  if (source === "commercial_api" || source === "assessor_api+commercial") return "Cook County Assessor commercial record";
  if (source === "cache") return "Cook County record";
  return "Cook County Assessor record";
}

function RecordField({
  label,
  value,
  reason = "this field is not carried for this parcel",
  className = "",
  sub,
}: {
  label: string;
  value: React.ReactNode;
  reason?: string;
  className?: string;
  sub?: React.ReactNode;
}) {
  const missing = value === null || value === undefined || value === "";
  return (
    <div className={`kyp-rec${missing ? " none" : ""}${className ? ` ${className}` : ""}`}>
      <div className="l">{label}</div>
      <div className="v">{missing ? "Not recorded" : value}</div>
      {missing ? <div className="s">{reason}</div> : sub ? <div className="s">{sub}</div> : null}
    </div>
  );
}

function Tile({ label, value, sub, tone = "dark" }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "ind" | "dark" }) {
  return (
    <div className={`kyp-tile ${tone}`}>
      <div className="l">{label}</div>
      <span className="n">{value ?? "—"}</span>
      {sub ? <div className="s">{sub}</div> : null}
    </div>
  );
}

function UnitTile({ index, bedrooms, baths, empty = false, note }: { index: number; bedrooms?: number; baths?: number; empty?: boolean; note?: string }) {
  return (
    <div className={`u${empty ? " empty" : ""}`}>
      <div className="n">Unit {index}</div>
      <div className="c">{empty ? "—" : <>{bedrooms}<span className="x">bed</span> / {baths ?? "—"}<span className="x">bath</span></>}</div>
      <div className="s">{note || (empty ? "no bedroom recorded" : "consistent with totals")}</div>
    </div>
  );
}

function ResidentialUnits({ units, beds, fullBaths, halfBaths }: { units: number | null; beds: number | null; fullBaths: number | null; halfBaths: number | null }) {
  if (units === null) return null;
  const totals = (
    <span className="tot">
      county totals · <b>{beds ?? "—"} beds</b> · <b>{fullBaths ?? "—"} full{halfBaths ? ` + ${halfBaths} half` : ""} baths</b> · <b>{units} units</b>
    </span>
  );
  if (beds === null || fullBaths === null) {
    return (
      <div className="kyp-unitwrap" data-testid="county-unit-configuration">
        <div className="kyp-unithd"><span className="l">Unit configuration</span>{totals}<span className="tag uneven">Totals only</span></div>
        <div className="kyp-unitnote">The county records building totals, but there are not enough bedroom and full-bath totals to draw a unit split.</div>
      </div>
    );
  }
  if (beds < units) {
    return (
      <div className="kyp-unitwrap" data-testid="county-unit-configuration">
        <div className="kyp-unithd"><span className="l">Unit configuration</span>{totals}<span className="tag uneven">Studios likely</span></div>
        <div className="kyp-units maybe">
          {Array.from({ length: units }, (_, i) => <UnitTile key={i} index={i + 1} bedrooms={i < beds ? 1 : undefined} baths={i < beds ? Math.max(1, Math.floor(fullBaths / Math.max(1, beds))) : undefined} empty={i >= beds} />)}
        </div>
        <div className="kyp-unitnote"><b>{units - beds} unit{units - beds === 1 ? "" : "s"} have no bedroom recorded.</b> This is a likely studio signal, not a unit-by-unit county record.</div>
      </div>
    );
  }
  if (units === beds && beds === fullBaths) {
    return (
      <div className="kyp-unitwrap" data-testid="county-unit-configuration">
        <div className="kyp-unithd"><span className="l">Unit configuration</span>{totals}<span className="tag known">Determined</span></div>
        <div className="kyp-units known">
          {Array.from({ length: units }, (_, i) => <UnitTile key={i} index={i + 1} bedrooms={1} baths={1} note="recorded totals leave no other split" />)}
        </div>
      </div>
    );
  }
  if (beds % units === 0) {
    const evenBeds = beds / units;
    const alternative = evenBeds >= 1 ? [evenBeds + 1, Math.max(0, evenBeds - 1)] : [1, 0];
    return (
      <div className="kyp-unitwrap" data-testid="county-unit-configuration">
        <div className="kyp-unithd"><span className="l">Unit configuration</span>{totals}<span className="tag split">Split not recorded</span></div>
        <div className="kyp-units maybe">
          {Array.from({ length: units }, (_, i) => <UnitTile key={i} index={i + 1} bedrooms={evenBeds} baths={Math.max(1, Math.floor(fullBaths / units))} note="if divided evenly" />)}
        </div>
        <div className="kyp-unitalt">Alternative distribution · same county totals</div>
        <div className="kyp-units alt">
          {Array.from({ length: units }, (_, i) => <UnitTile key={i} index={i + 1} bedrooms={alternative[i % 2]} baths={Math.max(1, Math.floor(fullBaths / units))} note="also consistent" />)}
        </div>
        <div className="kyp-unitnote">The assessor records building totals, not the bedroom split. The dashed layouts are consistent with those totals and are not recorded unit plans.</div>
      </div>
    );
  }
  const larger = Math.ceil(beds / units);
  const smaller = Math.floor(beds / units);
  return (
    <div className="kyp-unitwrap" data-testid="county-unit-configuration">
      <div className="kyp-unithd"><span className="l">Unit configuration</span>{totals}<span className="tag uneven">Units differ</span></div>
      <div className="kyp-units maybe">
        {Array.from({ length: units }, (_, i) => <UnitTile key={i} index={i + 1} bedrooms={i < beds % units ? larger : smaller} baths={Math.max(1, Math.floor(fullBaths / units))} note={i < beds % units ? "larger unit · likely split" : "smaller unit · likely split"} />)}
      </div>
      <div className="kyp-unitnote"><b>The totals prove the units are not uniform.</b> The exact distribution is not recorded; this is the most likely whole-bedroom split.</div>
    </div>
  );
}

function CommercialUnitMix({ data, totalUnits }: { data: LookupRecord; totalUnits: number | null }) {
  const mix = [
    ["Studio", numberValue(data.studioUnits)],
    ["1 bed", numberValue(data.oneBrUnits)],
    ["2 bed", numberValue(data.twoBrUnits)],
    ["3 bed", numberValue(data.threeBrUnits)],
    ["4 bed", numberValue(data.fourBrUnits)],
  ].filter((entry): entry is [string, number] => typeof entry[1] === "number" && entry[1] > 0);
  if (mix.length === 0) return null;
  const total = totalUnits || mix.reduce((sum, [, count]) => sum + count, 0);
  return (
    <div className="kyp-unitwrap" data-testid="county-unit-configuration">
      <div className="kyp-unithd"><span className="l">Unit mix</span><span className="tot">county totals · <b>{total} units</b></span><span className="tag known">Recorded</span></div>
      <div className="kyp-units known">
        {mix.map(([label, count], i) => <div className="u" key={label}><div className="n">{label}</div><div className="c">{count}</div><div className="s">{total ? `${((count / total) * 100).toFixed(0)}% of units` : "recorded"}</div></div>)}
      </div>
    </div>
  );
}

export function CountyRecordSection({
  propertyTaxData,
  pinLookupData,
  isLoadingPropertyTax,
  isLoadingPinLookup,
  refreshPropertyTax,
  submittedPin,
  propertyPin,
  setPropertyPin,
  setSubmittedPin,
  lookupState,
  onRetryLookup,
  run,
  showManualEntryForm,
  setShowManualEntryForm,
  manualBuildingSqFt,
  setManualBuildingSqFt,
  manualLandSqFt,
  setManualLandSqFt,
  manualStories,
  setManualStories,
  handleSaveManualProperty,
  updateManualProperty,
  coParcelPin,
  coParcelAddress,
}: CountyRecordSectionProps) {
  const [forcePinEntry, setForcePinEntry] = useState(false);
  const cd = pinLookupData?.characteristicsData || {};
  const commercial = pinLookupData?.commercialData && Object.keys(pinLookupData.commercialData).length > 0 ? pinLookupData.commercialData : null;
  const taxError = propertyTaxData?.error;
  const hasResidential = !!propertyTaxData && !taxError && [propertyTaxData.landSquareFeet, propertyTaxData.buildingSquareFeet, propertyTaxData.buildingType, propertyTaxData.buildingUse, propertyTaxData.yearBuilt].some((value: unknown) => value !== null && value !== undefined);
  const isCommercial = !hasResidential && !!commercial;
  const record = hasResidential ? propertyTaxData : commercial;
  const buildingSf = numberValue(cd.buildingSf) ?? numberValue(hasResidential ? propertyTaxData?.buildingSquareFeet : commercial?.bldgSf);
  const landSf = numberValue(cd.landSf) ?? numberValue(hasResidential ? propertyTaxData?.landSquareFeet : commercial?.landSf);
  const yearBuilt = numberValue(cd.yearBuilt) ?? numberValue(hasResidential ? propertyTaxData?.yearBuilt : commercial?.yearBuilt);
  const taxYear = cleanYear(propertyTaxData?.taxYearMostRecent ?? cd.assessmentYear ?? commercial?.assessmentYear);
  const age = yearBuilt !== null ? Math.max(0, new Date().getFullYear() - yearBuilt) : null;
  const units = parseUnits(hasResidential ? propertyTaxData?.apartments : commercial?.totalUnits);
  const beds = numberValue(cd.bedrooms);
  const fullBaths = numberValue(cd.fullBaths);
  const halfBaths = numberValue(cd.halfBaths);
  const coverage = buildingSf !== null && landSf ? `${((buildingSf / landSf) * 100).toFixed(0)}% lot coverage · derived` : null;
  const perUnit = buildingSf !== null && units ? `${Math.round(buildingSf / units).toLocaleString("en-US")} sf per unit · derived` : null;
  const classCode = String(propertyTaxData?.propertyClass ?? commercial?.classEstimate ?? "");
  const classDescription = CLASS_DESCRIPTIONS[classCode] || (classCode ? `Class ${classCode}` : null);
  const condo = cd.isCondo === true;
  const hasCommercialMix = isCommercial && !!commercial && [commercial.studioUnits, commercial.oneBrUnits, commercial.twoBrUnits, commercial.threeBrUnits, commercial.fourBrUnits].some((value: unknown) => numberValue(value) !== null && numberValue(value)! > 0);
  const hasBuildingRecord = buildingSf !== null;
  const missingManualFields = [
    buildingSf === null ? "building square footage" : null,
    landSf === null ? "land square footage" : null,
  ].filter(Boolean) as string[];
  const assessorUrl = propertyTaxData?.assessorUrl || pinLookupData?.assessorUrl;
  const treasurerUrl = propertyTaxData?.treasurerBillUrl || pinLookupData?.treasurerBillUrl;
  const lookupSource = pinLookupData?.source as string | undefined;
  const hasPin = !!(pinLookupData?.pin || submittedPin || propertyTaxData?.pin);
  const noPin = forcePinEntry || (!isLoadingPinLookup && !pinLookupData?.pin && !propertyTaxData?.pin && !submittedPin);

  const provenance = hasPin ? (
    <div className="kyp-src" data-testid="county-record-source">
      <span>Source: Cook County Open Data Portal. Values may differ from the official Assessor website.</span>
      <span className={pinLookupData?.confidence === "medium" ? "kyp-yn-note" : "kyp-src-ok"}>{pinLookupData?.confidence === "medium" ? "⚠ PIN matched — verify" : "✓ PIN resolved"}</span>
      <span>PIN <b>{pinLabel(pinLookupData?.pin || propertyTaxData?.pin || submittedPin)}</b></span>
      {lookupSource && <span>{sourceLabel(lookupSource)}</span>}
      {taxYear && <span>tax year <b>{taxYear}</b></span>}
      {submittedPin && <button type="button" className="kyp-morelink no-print" onClick={() => { setPropertyPin(""); setSubmittedPin(null); setForcePinEntry(true); }}>Wrong parcel? Enter a PIN →</button>}
      {assessorUrl && <a href={assessorUrl} target="_blank" rel="noopener noreferrer" data-testid="link-assessor-detail"><ExternalLink className="w-3 h-3" />Verify on Assessor site</a>}
      {treasurerUrl && <a href={treasurerUrl} target="_blank" rel="noopener noreferrer" data-testid="link-treasurer-bill"><ExternalLink className="w-3 h-3" />Tax bill (Treasurer)</a>}
    </div>
  ) : null;

  if (isLoadingPinLookup && !hasPin) {
    return <div className="kyp-empty" data-testid="county-record-loading"><RefreshCw className="inline mr-2 animate-spin" />Looking up Cook County record…</div>;
  }

  if (noPin) {
    return (
      <div id="print-section-county-record">
        {lookupState && onRetryLookup && !forcePinEntry
          ? <CountyLookupStatus state={lookupState} onRetry={onRetryLookup} />
          : <div className="kyp-caveat" data-testid="county-record-no-pin"><b>PIN needed.</b> {forcePinEntry ? "Enter the correct 14-digit PIN to read that parcel's county record." : "We could not resolve a Cook County Property Index Number for this address. Enter the 14-digit PIN to read the county record."}</div>}
        <div className="flex gap-2 no-print mt-3">
          <Input type="text" placeholder="Enter 14-digit PIN (e.g., 17-16-123-456-0000)" value={propertyPin} onChange={(event) => setPropertyPin(event.target.value)} data-testid="input-property-pin" className="flex-1" />
          <Button onClick={() => { const normalized = propertyPin.replace(/\D/g, ""); if (normalized.length === 14) { setSubmittedPin(normalized); setForcePinEntry(false); } }} disabled={propertyPin.replace(/\D/g, "").length !== 14} className="btn-indigo" data-testid="button-lookup-tax">Look Up</Button>
        </div>
      </div>
    );
  }

  const caveats = (
    <>
      {!propertyTaxData && lookupState?.retry === "tax" && onRetryLookup && (
        <CountyLookupStatus state={lookupState} onRetry={onRetryLookup} />
      )}
      {lookupSource === "geo_fallback" && (
        <div className="kyp-caveat" data-testid="county-record-geo-fallback"><b>Nearest-parcel match.</b> The figures below describe {pinLookupData?.nearestAddress || "the nearest parcel we could match"} — not this address.</div>
      )}
      {coParcelPin && (
        <div className="kyp-caveat" data-testid="county-record-co-parcel"><b>Co-parcel record.</b> Building data is filed under {coParcelAddress || pinLabel(coParcelPin)}. This site spans multiple lots; confirm which PIN carries each building fact.</div>
      )}
      {pinLookupData?.confidence === "medium" && lookupSource !== "geo_fallback" && (
        <div className="kyp-caveat" data-testid="county-record-medium-match"><b>Confirm the parcel match.</b> Confirm it is your parcel before relying on the figures.</div>
      )}
      {lookupSource === "exempt_api" && (
        <div className="kyp-caveat" data-testid="county-record-exempt"><b>Tax-exempt record.</b> Assessment and tax figures will be absent or nominal — that is the record, not a gap in ours.</div>
      )}
      {taxError && (
        <div className="kyp-caveat" data-testid="county-record-error"><b>County record unread.</b> Nothing below is missing — it is unread. <button type="button" className="kyp-morelink no-print" onClick={() => submittedPin && refreshPropertyTax.mutate(submittedPin)}>Retry</button></div>
      )}
    </>
  );

  if (taxError) {
    return <div id="print-section-county-record">{caveats}{provenance}</div>;
  }

  const recordGrid = (
    <div className="kyp-recgrid" data-testid="county-record-fields">
      <RecordField label="Land" value={landSf !== null ? `${fmtNumber(landSf)} sq ft` : null} reason="land size is not recorded" sub={run?.manualLandSqFt && numberValue(run.manualLandSqFt) === landSf ? "manual value" : undefined} />
      <RecordField label="Building" value={buildingSf !== null ? `${fmtNumber(buildingSf)} sq ft` : null} reason="building size is not recorded" sub={[
        run?.manualBuildingSqFt && numberValue(run.manualBuildingSqFt) === buildingSf ? "manual value" : null,
        coverage,
        perUnit,
      ].filter(Boolean).join(" · ") || undefined} />
      <RecordField label="Use" value={hasResidential ? propertyTaxData?.buildingUse || cd.use : commercial?.propertyTypeUse || pinLookupData?.propertyType} reason="use is not recorded" sub={cd.isMixedUse !== undefined ? <>{cd.isMixedUse ? "Mixed use" : "Residential-only"}{cd.nonResidentialUnits ? ` · ${cd.nonResidentialUnits} non-residential units` : ""}</> : undefined} />
      <RecordField label="Rooms" value={cd.rooms != null ? cd.rooms : null} reason="room count is not carried" sub={cd.fireplaces ? `${cd.fireplaces} fireplace${cd.fireplaces === 1 ? "" : "s"}` : undefined} />
      <RecordField label="Basement" value={hasResidential ? propertyTaxData?.basement || cd.basement : cd.basement} reason="basement type is not recorded" sub={cd.basementFinish ? `Finish / ${cd.basementFinish}` : undefined} />
      <RecordField label="Attic" value={hasResidential ? propertyTaxData?.attic || cd.atticType : cd.atticType} reason="attic type is not recorded" sub={cd.atticFinish ? `Finish / ${cd.atticFinish}` : undefined} />
      <RecordField label="Exterior" value={cd.exteriorWall || null} reason="exterior material is not carried" sub={cd.roofConstruction ? `Roof / ${cd.roofConstruction}` : undefined} />
      <RecordField label="Porch" value={cd.porch || null} reason="porch type is not recorded" sub={cd.constructionQuality ? `Construction / ${cd.constructionQuality}` : undefined} />
      <RecordField label="Garage" value={cd.garageSize || null} reason="garage is not recorded" sub={cd.garageAttached !== undefined ? (cd.garageAttached ? "Attached" : "Detached") : undefined} />
      <RecordField label="Heating" value={cd.heating || null} reason="heating type is not carried" sub={cd.airConditioning ? `A/C / ${cd.airConditioning}` : undefined} />
      <RecordField label="Stories" value={propertyTaxData?.stories ?? (run?.manualStories ? `${run.manualStories} (manual)` : null)} reason="stories are not recorded" />
      <RecordField label="Property class" value={classCode || null} reason="property class is not recorded" sub={classDescription} />
      {(cd.repairCondition || propertyTaxData?.repairCondition) && <RecordField label="Condition" value={cd.repairCondition || propertyTaxData?.repairCondition} />}
      {isCommercial ? <RecordField label="Township" value={commercial?.township || null} reason="township is not carried" sub={commercial?.classEstimate ? `Class estimate / ${commercial.classEstimate}` : undefined} /> : null}
      {isCommercial ? <RecordField label="Associated PINs" value={commercial?.pins || null} reason="associated PINs are not recorded" className="w2" sub={commercial?.pins ? "assessment covers both listed PINs" : undefined} /> : null}
      {condo ? <RecordField label="Condominium record" value={cd.isCondo ? "Yes" : null} reason="condominium status is not recorded" sub={cd.prorationRate != null ? `Proration / ${(cd.prorationRate * 100).toFixed(2)}%` : undefined} /> : null}
      {condo && numberValue(cd.unitSf) !== null && <RecordField label="Condo unit size" value={`${fmtNumber(cd.unitSf)} sq ft`} />}
      {condo && numberValue(cd.buildingUnits) !== null && <RecordField label="Units in building" value={fmtNumber(cd.buildingUnits)} sub={cd.nonResidentialUnits ? `${cd.nonResidentialUnits} non-residential` : undefined} />}
      {condo && (cd.isParkingSpace || cd.isCommonArea) && <RecordField label="Condo unit type" value={cd.isParkingSpace ? "Parking space" : "Common area"} />}
    </div>
  );

  const recordedBooleans = (cd.isMixedUse !== undefined || condo || hasBuildingRecord) ? (
    <div className="kyp-yn" data-testid="county-record-booleans">
      {cd.isMixedUse !== undefined && <div className={`r ${cd.isMixedUse ? "y" : "n"}`}><span className="m">{cd.isMixedUse ? "✓" : "✗"}</span><span><b>Mixed use</b> <span className="q">{cd.isMixedUse ? "recorded" : "not recorded as mixed use"}</span></span></div>}
      {condo && <div className="r y"><span className="m">✓</span><span><b>Condominium</b> <span className="q">recorded</span></span></div>}
      <div className={`r ${hasBuildingRecord ? "y" : "n"}`}><span className="m">{hasBuildingRecord ? "✓" : "✗"}</span><span><b>Building record</b> <span className="q">{hasBuildingRecord ? "present" : "not recorded"}</span></span></div>
    </div>
  ) : null;

  const modelled = isCommercial && commercial ? (
    <div data-testid="county-record-modelled">
      <KypSubhead subsection={2}><span className="lbl">How the assessor valued it</span><span className="ct">{taxYear ? `assessment year ${taxYear}` : "commercial assessment"}</span></KypSubhead>
      <div>
      <div className="kyp-modhd"><span className="t">Modelled valuation inputs</span><span className="w">These are <b>inputs to the assessor’s valuation model</b>, not operating results. Do not underwrite from them.</span></div>
      <div className="kyp-facts modelled">
        <div className="kyp-fact"><div className="kyp-fl">Market value</div><div className="kyp-fv dnum">{fmtMoney(commercial.marketValue)}</div><div className="kyp-fs">{commercial.marketValuePerSf != null ? `Value/SF · $${commercial.marketValuePerSf}` : "Value/SF · Not recorded"}{commercial.marketValuePerUnit != null ? ` · Value/Unit · ${fmtMoney(commercial.marketValuePerUnit)}` : ""}</div></div>
        <div className="kyp-fact"><div className="kyp-fl">Assumed NOI</div><div className="kyp-fv dnum">{fmtMoney(commercial.noi)}</div><div className="kyp-fs">EGI · {fmtMoney(commercial.egi)} · PGI · {fmtMoney(commercial.pgi)}</div></div>
        <div className="kyp-fact"><div className="kyp-fl">Applied cap rate</div><div className="kyp-fv dnum">{fmtPercent(commercial.capRate, 2)}</div><div className="kyp-fs">rate applied by the assessor</div></div>
        <div className="kyp-fact"><div className="kyp-fl">Assumed vacancy</div><div className="kyp-fv dnum">{fmtPercent(commercial.vacancyRate)}</div><div className="kyp-fs">Expense ratio · {fmtPercent(commercial.expenseRatio)} · Rent/SF · {commercial.adjustedRentPerSf != null ? `$${commercial.adjustedRentPerSf}` : "Not recorded"}</div></div>
      </div>
      <div className="kyp-footnote"><b>Investment Rating is omitted.</b> It is a letter grade derived directly from the model inputs above, not an independent property-quality measure.</div>
      </div>
    </div>
  ) : null;

  const manualEntry = missingManualFields.length > 0 ? (
    <div className="kyp-caveat no-print" data-testid="county-record-manual-entry">
      <div className="flex items-start gap-2 mb-3"><Info className="w-4 h-4 mt-0.5 flex-shrink-0" /><div><b>Missing from the county record: {missingManualFields.join(" and ")}.</b><div className="mt-1">{run?.sourceListingUrl ? <>Check your <a href={run.sourceListingUrl} target="_blank" rel="noopener noreferrer" className="underline">original listing</a>, or enter the missing value manually.</> : "Enter a value from the original listing or another source if you have it."}</div></div></div>
      {(run?.manualBuildingSqFt || run?.manualLandSqFt || run?.manualStories) && !showManualEntryForm ? (
        <div className="space-y-3">
          <div className="kyp-recgrid">
            {run.manualBuildingSqFt && <RecordField label="Building sf (manual)" value={`${fmtNumber(run.manualBuildingSqFt)} sq ft`} />}
            {run.manualLandSqFt && <RecordField label="Land sf (manual)" value={`${fmtNumber(run.manualLandSqFt)} sq ft`} />}
            {run.manualStories && <RecordField label="Stories (manual)" value={run.manualStories} />}
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowManualEntryForm(true)} data-testid="button-edit-manual-property">Edit Manual Data</Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div><label className="parcel-flabel block mb-1.5">Building Sq Ft</label><Input type="number" placeholder="e.g. 5000" value={manualBuildingSqFt} onChange={(event) => setManualBuildingSqFt(event.target.value)} data-testid="input-manual-building-sqft" /></div>
            <div><label className="parcel-flabel block mb-1.5">Land Sq Ft</label><Input type="number" placeholder="e.g. 8000" value={manualLandSqFt} onChange={(event) => setManualLandSqFt(event.target.value)} data-testid="input-manual-land-sqft" /></div>
            <div><label className="parcel-flabel block mb-1.5">Stories</label><Input type="number" step="0.5" placeholder="e.g. 2" value={manualStories} onChange={(event) => setManualStories(event.target.value)} data-testid="input-manual-stories" /></div>
          </div>
          <div className="flex gap-2"><Button size="sm" className="btn-indigo" onClick={handleSaveManualProperty} disabled={updateManualProperty.isPending || (!manualBuildingSqFt && !manualLandSqFt)} data-testid="button-save-manual-property">{updateManualProperty.isPending ? "Saving…" : "Save Property Data"}</Button>{(run?.manualBuildingSqFt || run?.manualLandSqFt) && <Button variant="ghost" size="sm" onClick={() => setShowManualEntryForm(false)} data-testid="button-cancel-manual-property">Cancel</Button>}</div>
        </div>
      )}
    </div>
  ) : null;

  return (
    <div id="print-section-county-record" data-testid="county-record-section">
      {caveats}
      <KypSubhead className="kyp-parcel-heading" subsection={isCommercial ? 1 : undefined}>
        <span className="lbl">What the county records</span>
        {taxYear && <span className="ct">assessment year {taxYear}</span>}
        {submittedPin && <button type="button" className="kyp-morelink no-print kyp-parcel-refresh" data-testid="button-refresh-parcel-record" onClick={() => refreshPropertyTax.mutate(submittedPin)} disabled={refreshPropertyTax.isPending}><RefreshCw className={refreshPropertyTax.isPending ? "animate-spin" : ""} /> Refresh</button>}
      </KypSubhead>
      <div>
      <div className="kyp-tiles">
        <Tile label="Land" value={landSf !== null ? fmtNumber(landSf) : "—"} sub={landSf !== null ? "sq ft" : "not recorded"} tone="ind" />
        <Tile label="Building" value={buildingSf !== null ? fmtNumber(buildingSf) : "—"} sub={buildingSf !== null ? "sq ft" : "not recorded"} />
        <Tile label={isCommercial ? "Units" : "Apartments"} value={units ?? "—"} sub={units !== null ? "recorded" : "not recorded"} />
        <Tile label="Year built" value={yearBuilt ?? "—"} sub={yearBuilt !== null ? `${age} years old` : "not recorded"} />
      </div>
      {hasCommercialMix ? <CommercialUnitMix data={commercial} totalUnits={units} /> : hasResidential ? <ResidentialUnits units={units} beds={beds} fullBaths={fullBaths} halfBaths={halfBaths} /> : null}
      {recordGrid}
      {recordedBooleans}
      {manualEntry}
      </div>
      {modelled}
      {provenance}
    </div>
  );
}
