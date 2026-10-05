import React, { useEffect, useMemo, useRef, useState } from "react";
import { computeDaycareScenarios, formatNumberInput } from "@/lib/valuation";
import { KypSubhead, buildSubsectionNumbers } from "./AccordionSection";
import { validateSiteDetails } from "./siteDetailsValidation";
import { ChildcareDemandMeter } from "@/components/ChildcareDemandMeter";
import {
  ProjectUseAreaControl,
  ProjectUseBusinessList,
  ProjectUseCountBlocks,
  ProjectUseGoogleMaps,
  type ProjectUseGoogleMapsData,
} from "./ProjectUseAnalysisSpine";

type Scope = "zip" | "community";

export function buildDaycareTargets(children: number, slots: number) {
  return [1, 1.5, 1.75].map((ratio) => {
    const targetSlots = Math.ceil(children / ratio);
    const slotGap = Math.max(0, targetSlots - slots);
    return { ratio, targetSlots, slotGap, hasGap: slotGap > 0, centers: slotGap > 0 ? Math.ceil(slotGap / 78) : 0 };
  });
}

export function daycareSupplyRankMatches(
  rank: { rank?: number | null; sourceValue?: number | null } | null | undefined,
  enhancedValue: number | null | undefined,
  supplyValue: number | null | undefined,
): boolean {
  if (!rank || rank.rank == null || supplyValue == null) return false;
  return (rank.sourceValue ?? enhancedValue) === supplyValue;
}

function ordinal(value: number): string {
  const mod100 = value % 100;
  const suffix = mod100 >= 11 && mod100 <= 13 ? "th" : value % 10 === 1 ? "st" : value % 10 === 2 ? "nd" : value % 10 === 3 ? "rd" : "th";
  return `${value}${suffix}`;
}

function rankLabel(
  value?: { rank?: number | null; total?: number | null; sourceValue?: number | null } | null,
  metricValue?: number,
  qualifier = "most",
) {
  if (value?.rank == null) return undefined;
  if (value.sourceValue != null && value.sourceValue !== metricValue) return undefined;
  return <>{ordinal(value.rank)}-{qualifier}{value.total != null ? ` of ${value.total}` : ""}</>;
}

function rankText(value?: { rank?: number | null; total?: number | null } | null, qualifier = "most"): string | undefined {
  if (value?.rank == null) return undefined;
  return `${ordinal(value.rank)}-${qualifier}${value.total != null ? ` of ${value.total}` : ""}`;
}

function number(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : "—";
}

function inputValue(value: number | null | undefined): string {
  return value != null && Number.isFinite(value) ? String(value) : "";
}

function pctText(value: unknown): string | null {
  return typeof value === "number" && Number.isFinite(value) ? `${value}%` : null;
}

function HorizontalBar({ label, value }: { label: string; value: unknown }) {
  const pct = typeof value === "number" && Number.isFinite(value) ? value : null;
  const width = pct == null ? 0 : Math.min(100, Math.max(0, pct));
  return (
    <div className="kyp-hbar">
      <span className="hl">{label}</span>
      <span className="htrack" aria-label={pct == null ? `${label}: unavailable` : `${label}: ${pct}%`}>
        <i className="ind" style={{ width: `${width}%` }}>
          {pct != null && <b className="hbar-count">{pct}%</b>}
        </i>
      </span>
    </div>
  );
}

function Evidence({ children }: { children: React.ReactNode }) {
  return <div className="kyp-src">{children}</div>;
}

function RetryButton({ onRetry }: { onRetry?: () => void }) {
  return <button type="button" className="kyp-btn ghost" disabled={!onRetry} onClick={onRetry}>Retry</button>;
}

interface DaycareAnalysisProps {
  scope: Scope;
  onScopeChange: (scope: Scope) => void;
  areaData: any;
  enhancedData: any;
  capacityData: any;
  communityArea?: string | null;
  zipCode?: string | null;
  ward?: string | number | null;
  isAccessLoading?: boolean;
  isAccessError?: boolean;
  onAccessRetry?: () => void;
  isEnhancedLoading?: boolean;
  isEnhancedError?: boolean;
  onEnhancedRetry?: () => void;
  isCapacityLoading?: boolean;
  isCapacityError?: boolean;
  onCapacityRetry?: () => void;
  nearbyData?: any;
  isNearbyLoading?: boolean;
  isNearbyError?: boolean;
  onNearbyRetry?: () => void;
  googleData?: ProjectUseGoogleMapsData;
  isGoogleLoading?: boolean;
  isGoogleError?: boolean;
  onGoogleRetry?: () => void;
  googleConfirmed?: boolean;
  googleSearchTerm?: string;
  buildingSqFt?: number | null;
  buildingType?: string | null;
  landSqFt?: number | null;
  stories?: number | null;
  buildingSource?: string;
  landSource?: string;
  storiesSource?: string;
  updateProperty?: (data: { id: number; data: Record<string, number | null> }) => Promise<unknown>;
  updatePending?: boolean;
  runId?: number;
  daycareScenarioKey?: string;
  onDaycareScenarioKeyChange?: (key: string) => void;
  daycareRevenueRate?: string;
  onDaycareRevenueRateChange?: (rate: string) => void;
}

export function DaycareAnalysis({
  scope, onScopeChange, areaData, enhancedData, capacityData, communityArea, zipCode, ward,
  isAccessLoading, isAccessError, onAccessRetry, isEnhancedLoading, isEnhancedError, onEnhancedRetry,
  isCapacityLoading, isCapacityError, onCapacityRetry, nearbyData, isNearbyLoading, isNearbyError,
  onNearbyRetry, googleData, isGoogleLoading, isGoogleError, onGoogleRetry, googleConfirmed,
  googleSearchTerm, buildingSqFt, buildingType, landSqFt,
  stories, buildingSource, landSource, storiesSource, updateProperty, updatePending, runId,
  daycareScenarioKey = "100_efficient", onDaycareScenarioKeyChange,
  daycareRevenueRate = "2,275", onDaycareRevenueRateChange,
}: DaycareAnalysisProps) {
  const subsections = useMemo(() => buildSubsectionNumbers([
    ["supply", true], ["demographics", true], ["estimator", true], ["ccap", true],
    ["capacity", true], ["licensed", true], ["maps", true],
  ]), []);
  const [buildingInput, setBuildingInput] = useState(() => inputValue(buildingSqFt));
  const [landInput, setLandInput] = useState(() => inputValue(landSqFt));
  const [storiesInput, setStoriesInput] = useState(() => inputValue(stories));
  const [formError, setFormError] = useState("");
  const [savedSite, setSavedSite] = useState(() => ({
    building: inputValue(buildingSqFt), land: inputValue(landSqFt), stories: inputValue(stories),
  }));
  const dirtySiteRef = useRef(false);
  const activeRunIdRef = useRef(runId);
  useEffect(() => {
    if (activeRunIdRef.current !== runId) {
      activeRunIdRef.current = runId;
      dirtySiteRef.current = false;
    }
    if (dirtySiteRef.current) return;
    const next = { building: inputValue(buildingSqFt), land: inputValue(landSqFt), stories: inputValue(stories) };
    setBuildingInput(next.building);
    setLandInput(next.land);
    setStoriesInput(next.stories);
    setSavedSite(next);
  }, [runId, buildingSqFt, landSqFt, stories]);
  const currentArea = scope === "zip" ? `ZIP ${zipCode || "unavailable"}` : communityArea || "Community area unavailable";
  const capacityValues = capacityData || {};
  const targets = areaData ? buildDaycareTargets(areaData.childrenUnder5, areaData.licensedSlots) : [];
  const hasBuildingArea = typeof buildingSqFt === "number" && Number.isFinite(buildingSqFt) && buildingSqFt > 0;
  const hasLandArea = typeof landSqFt === "number" && Number.isFinite(landSqFt) && landSqFt >= 0;
  const hasStories = typeof stories === "number" && Number.isFinite(stories) && stories > 0;
  const footprintSqFt = hasBuildingArea && hasStories ? (buildingSqFt as number) / (stories as number) : null;
  const outdoorSqFt = hasLandArea && footprintSqFt != null
    ? Math.max(0, (landSqFt as number) - footprintSqFt)
    : null;
  const licensedRows = (nearbyData?.locations || []).map((location: any, index: number) => ({
    name: location.name || "Name unavailable",
    address: location.address || "Address unavailable",
    distance: typeof location.distanceMiles === "number" ? location.distanceMiles : null,
    testId: `licensed-daycare-${index}`,
  }));
  const underFiveRank = enhancedData?.ranks?.childrenUnder5 as
    | { rank?: number | null; total?: number | null; sourceValue?: number | null }
    | null
    | undefined;
  const supplyRank = areaData && daycareSupplyRankMatches(underFiveRank, enhancedData?.childrenUnder5, areaData.childrenUnder5)
    ? rankText(underFiveRank, "most")
    : undefined;
  const demographicSupplyCountDiffers = !!areaData && enhancedData?.childrenUnder5 !== areaData.childrenUnder5;
  const revenueScenarios = computeDaycareScenarios({
    buildingSqFt: hasBuildingArea ? buildingSqFt as number : 0,
    revenuePerChildMonthly: Number(daycareRevenueRate.replace(/,/g, "")) || 0,
  });
  const scenarioOrder = ["100_efficient", "75_efficient", "100_comfortable", "75_comfortable"];
  const orderedRevenueScenarios = scenarioOrder.map((key) => revenueScenarios.find((scenario) => scenario.key === key)).filter(Boolean);
  const activeRevenueScenario = revenueScenarios.find((scenario) => scenario.key === daycareScenarioKey) ?? revenueScenarios[0];
  const revenueRateKnown = daycareRevenueRate.trim() !== "" && Number.isFinite(Number(daycareRevenueRate.replace(/,/g, "")));
  const selectedSiteRevenueKnown = hasBuildingArea && revenueRateKnown;

  async function saveSiteDetails(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    if (!runId || !updateProperty) {
      setFormError("Site details cannot be updated for this record.");
      return;
    }
    const validation = validateSiteDetails({ building: buildingInput, land: landInput, stories: storiesInput });
    if (!validation.value) {
      setFormError(validation.error ?? "Check the site details and try again.");
      return;
    }
    try {
      await updateProperty?.({
        id: runId,
        data: {
          manualBuildingSqFt: validation.value.manualBuildingSqFt,
          manualLandSqFt: validation.value.manualLandSqFt,
          manualStories: validation.value.manualStories,
        },
      });
      const next = {
        building: String(validation.value.manualBuildingSqFt),
        land: validation.value.manualLandSqFt == null ? "" : String(validation.value.manualLandSqFt),
        stories: validation.value.manualStories == null ? "" : String(validation.value.manualStories),
      };
      dirtySiteRef.current = false;
      setSavedSite(next);
      setBuildingInput(next.building);
      setLandInput(next.land);
      setStoriesInput(next.stories);
    } catch {
      setFormError("Property details could not be saved. Try again.");
    }
  }

  function cancelSiteEdit() {
    dirtySiteRef.current = false;
    setBuildingInput(savedSite.building);
    setLandInput(savedSite.land);
    setStoriesInput(savedSite.stories);
    setFormError("");
  }

  return (
    <div data-testid="daycare-analysis">
      <ProjectUseAreaControl
        value={scope}
        onChange={onScopeChange}
        zipCode={zipCode}
        communityArea={communityArea}
        ward={ward}
      />
      <section id="print-section-childcare">
        <KypSubhead subsection={subsections.supply}><span className="lbl">Childcare Supply</span><span className="ct">licensed slots · children under 5</span></KypSubhead>
        <div>
        {isAccessLoading ? <div className="space-y-3" aria-label="Loading childcare supply"><div className="h-8 w-2/3 animate-pulse rounded-md bg-muted" /><div className="h-16 w-full animate-pulse rounded-md bg-muted" /></div>
          : isAccessError ? <div className="kyp-status-empty" role="alert">Childcare supply records could not be loaded.<div className="kyp-btnrow"><RetryButton onRetry={onAccessRetry} /></div></div>
          : areaData ? <ChildcareDemandMeter data={areaData} locationLabel={currentArea} supplyRank={supplyRank} />
              : <div className="kyp-status-empty" role="status">Childcare supply records are not available for {currentArea}.</div>}
        </div>
      </section>

      <section id="print-section-childcare-demographics">
        <KypSubhead subsection={subsections.demographics}><span className="lbl">Demographics &amp; Labor Force</span><span className="ct">American Community Survey</span></KypSubhead>
        <div>
        {isEnhancedLoading ? <div className="space-y-3" aria-label="Loading demographic records"><div className="h-8 w-full animate-pulse rounded-md bg-muted" /><div className="h-8 w-4/5 animate-pulse rounded-md bg-muted" /></div>
          : isEnhancedError && !enhancedData ? <div className="kyp-status-empty" role="alert">ACS demographic records could not be loaded.<div className="kyp-btnrow"><RetryButton onRetry={onEnhancedRetry} /></div></div>
          : enhancedData ? (
            <>
              <div className="kyp-blocks two">
                <div className="kyp-block slate">
                  <div className="bv">{number(enhancedData.children0to2)}</div>
                  <div className="bl">Ages 0–2 · infants and toddlers</div>
                  <div className="bd">{pctText(enhancedData.pct0to2) ?? "—"} of under-5</div>
                  {rankLabel(enhancedData.ranks?.pct0to2, enhancedData.pct0to2, "highest share") &&
                    <div className="chip rank">{rankLabel(enhancedData.ranks?.pct0to2, enhancedData.pct0to2, "highest share")}</div>}
                </div>
                <div className="kyp-block slate">
                  <div className="bv">{number(enhancedData.children3to4)}</div>
                  <div className="bl">Ages 3–4 · preschool</div>
                  <div className="bd">{pctText(enhancedData.pct3to4) ?? "—"} of under-5</div>
                </div>
              </div>
              <div id="print-section-parents-labor">
                <div className="kyp-charttitle">Both parents or single parent working</div>
                <HorizontalBar label="Children 0–5" value={enhancedData.parentsInLaborForcePct0to5} />
                <HorizontalBar label="Children 6–17" value={enhancedData.parentsInLaborForcePct6to17} />
                {(() => {
                  const delta = typeof enhancedData.laborForceDelta === "number" && Number.isFinite(enhancedData.laborForceDelta)
                    ? enhancedData.laborForceDelta
                    : null;
                  const band = delta == null
                    ? null
                    : delta <= 5
                      ? { tone: "grn", band: "ok", label: "Minimal gap", range: "≤5 pts" }
                      : delta <= 12
                        ? { tone: "orange", band: "watch", label: "Moderate gap", range: "6–12 pts" }
                        : { tone: "red", band: "no", label: "Large gap", range: ">12 pts" };
                  return (
                    <>
                      <div className="kyp-blocks two">
                        <div className={`kyp-block ${band?.tone ?? "ind"}`}>
                          <div className="bv">{delta == null ? "—" : `${delta} pts`}</div>
                          <div className="bl">Labor-force delta</div>
                          <div className="bd">0–5 vs 6–17</div>
                        </div>
                        <div className="kyp-block slate">
                          <div className="bv">{pctText(enhancedData.parentsInLaborForcePct0to5) ?? "—"}</div>
                          <div className="bl">Children 0–5 with a working parent</div>
                          <div className="bd">Source-derived count proxy: {number(enhancedData.parentsInLaborForce0to5)}</div>
                          {rankLabel(enhancedData.ranks?.parentsInLaborForcePct0to5, enhancedData.parentsInLaborForcePct0to5, "highest rate") &&
                            <div className="chip rank">{rankLabel(enhancedData.ranks?.parentsInLaborForcePct0to5, enhancedData.parentsInLaborForcePct0to5, "highest rate")}</div>}
                        </div>
                      </div>
                      {rankLabel(enhancedData.ranks?.laborForceDelta, enhancedData.laborForceDelta, "widest") && (
                        <div className="kyp-blocks one">
                          <div className="kyp-block slate">
                            <div className="bl">Labor-force delta · context rank</div>
                            <div className="chip rank">{rankLabel(enhancedData.ranks?.laborForceDelta, enhancedData.laborForceDelta, "widest")}</div>
                          </div>
                        </div>
                      )}
                      <div className="kyp-bands b3">
                        {[
                          { band: "ok", label: "Minimal gap", range: "≤5 pts" },
                          { band: "watch", label: "Moderate gap", range: "6–12 pts" },
                          { band: "no", label: "Large gap", range: ">12 pts" },
                        ].map((item) => (
                          <div key={item.band} className={`kyp-band ${item.band}${band?.band === item.band ? " on" : ""}`}>
                            <div className="bar" />
                            <div className="bl">{item.label}</div>
                            <div className="br">{item.range}</div>
                          </div>
                        ))}
                      </div>
                    </>
                  );
                })()}
              </div>
              <Evidence>
                Source: American Community Survey 5-Year Estimates, tables B09001 and B23008. Area: {currentArea}.
                {enhancedData.comparisonTotal != null && <> Rank comparison includes {number(enhancedData.comparisonTotal)} areas.</>}
                {demographicSupplyCountDiffers && <> The enhanced ACS demographic extract reports {number(enhancedData.childrenUnder5)} children under 5; the childcare supply snapshot reports {number(areaData.childrenUnder5)} for this area. Age and parent measures use the enhanced ACS extract.</>}
                {" "}The count proxy is calculated in the source extract as children under 5 × the working-parent rate for ages 0–5 (under 6), rounded. These age cohorts differ; it is not an observed ACS count of children 0–5 with a working parent, and an exact matching cohort total is not supplied.
                {" "}The labor-force delta is the difference between the reported 0–5 and 6–17 percentages. Its 5-point and 12-point bands are this product’s planning convention, not a published standard.
              </Evidence>
            </>
          ) : <div className="kyp-status-empty" role="status">Demographic records are not available for {currentArea}.</div>}
        </div>
      </section>

      <section id="print-section-daycare-estimator">
        <KypSubhead subsection={subsections.estimator}><span className="lbl">Slot Gap Estimator</span><span className="ct">target scenarios</span></KypSubhead>
        <div>
        {areaData ? (
          <>
            <ProjectUseCountBlocks counts={[
              { value: areaData.childrenUnder5, label: "Children under 5" },
              { value: areaData.licensedSlots, label: "Total licensed slots" },
              { value: areaData.childrenPerSlot == null ? null : Number(areaData.childrenPerSlot).toFixed(1), label: "Children per licensed slot", text: true },
            ]} />
            <div className="kyp-blocks">
              {targets.map(({ ratio, targetSlots, slotGap, hasGap, centers }) => (
                <div className={`kyp-block ${hasGap ? "ind" : "grn"}`} key={ratio}>
                  <div className="bv">{hasGap ? `~${centers}` : "Met"}</div>
                  <div className="bl">{hasGap ? `Centers needed at ${ratio}:1` : `Target met at ${ratio}:1`}</div>
                  {hasGap
                    ? <div className="bd">{slotGap.toLocaleString()}-slot gap · target {targetSlots.toLocaleString()} slots</div>
                    : <div className="bd">{areaData.licensedSlots.toLocaleString()} current slots · target {targetSlots.toLocaleString()} slots</div>}
                </div>
              ))}
            </div>
            <Evidence>Area: {currentArea}. Target slots are the ceiling of children under 5 divided by the selected children-per-slot ratio. Slot gap = target slots − current licensed slots; center estimate = ceiling of positive slot gap ÷ 78, using the existing 78-slot planning assumption. The ratios are planning scenarios, not DCFS standards. Counts use the same childcare supply record as 17.1.</Evidence>
          </>
        ) : <div className="kyp-status-empty" role="status">Slot gap estimates are unavailable without childcare supply records.</div>}
        </div>
      </section>

      <section id="print-section-childcare-capacity">
        <KypSubhead subsection={subsections.ccap}><span className="lbl">CCAP Participation</span><span className="ct">FY 2024</span></KypSubhead>
        <div>
        {isCapacityLoading ? <div className="space-y-3" aria-label="Loading CCAP records"><div className="h-8 w-full animate-pulse rounded-md bg-muted" /><div className="h-8 w-3/5 animate-pulse rounded-md bg-muted" /></div>
          : isCapacityError && !capacityData ? <div className="kyp-status-empty" role="alert">CCAP participation records could not be loaded.<div className="kyp-btnrow"><RetryButton onRetry={onCapacityRetry} /></div></div>
          : capacityData ? (
            <>
              {(() => {
                const localPct = typeof capacityValues.pct_slots_ccap === "number" && Number.isFinite(capacityValues.pct_slots_ccap)
                  ? capacityValues.pct_slots_ccap
                  : null;
                const cityPct = typeof capacityValues.citywide_pct_ccap === "number" && Number.isFinite(capacityValues.citywide_pct_ccap)
                  ? capacityValues.citywide_pct_ccap
                  : null;
                const diff = localPct == null || cityPct == null ? null : localPct - cityPct;
                const comparison = diff == null
                  ? null
                  : diff === 0
                    ? "At the city average"
                    : `${Math.abs(diff)} percentage points ${diff > 0 ? "above" : "below"}`;
                return (
                  <div className={cityPct == null ? "kyp-blocks hero one" : "kyp-blocks two"}>
                    <div className="kyp-block ind">
                      <div className="bv">{pctText(localPct) ?? "—"}</div>
                      <div className="bl">Slots serving CCAP children</div>
                      <div className="bd">{currentArea}</div>
                    </div>
                    {cityPct != null && (
                      <div className="kyp-block slate">
                        <div className="bv">{pctText(cityPct)}</div>
                        <div className="bl">Chicago average</div>
                        {comparison && <div className="bd">{comparison}</div>}
                      </div>
                    )}
                  </div>
                );
              })()}
              <Evidence>CCAP = Child Care Assistance Program. Source: Illinois DCFS ECE Service Data FY2024. Area: {currentArea}.</Evidence>
            </>
          ) : <div className="kyp-status-empty" role="status">CCAP participation records are not available for {currentArea}.</div>}
        </div>
      </section>

      <section id="print-section-site-daycare-details">
        <KypSubhead subsection={subsections.capacity}><span className="lbl">Site Capacity &amp; Revenue</span><span className="ct">this building · planning scenarios</span></KypSubhead>
        <div>
        <div className="kyp-calcgrid two">
          <label className="kyp-field"><span>Monthly revenue per child · editable assumption · $2,275 default</span>
            <input className="kyp-input num" inputMode="decimal" value={daycareRevenueRate}
              onChange={(event) => onDaycareRevenueRateChange?.(formatNumberInput(event.currentTarget.value))} />
          </label>
          <label className="kyp-field"><span>Capacity &amp; enrollment scenario</span>
            <select className="kyp-input kyp-select" aria-label="Daycare capacity and enrollment scenario"
              value={activeRevenueScenario?.key ?? daycareScenarioKey}
              onChange={(event) => onDaycareScenarioKeyChange?.(event.currentTarget.value)}>
              {orderedRevenueScenarios.map((scenario) => scenario && <option key={scenario.key} value={scenario.key}>
                {scenario.key.includes("efficient") ? "Efficient" : "Comfortable"} at {scenario.key.startsWith("75") ? "75%" : "100%"} · {scenario.children} children · {selectedSiteRevenueKnown ? `$${scenario.annualRevenue.toLocaleString()}/yr` : "revenue unavailable"}
              </option>)}
            </select>
          </label>
        </div>
        <div className="kyp-blocks three">
          <div className="kyp-block ind"><div className="bv">{selectedSiteRevenueKnown && activeRevenueScenario ? `$${activeRevenueScenario.annualRevenue.toLocaleString()}` : "—"}</div><div className="bl">Annual revenue</div><div className="bd">{activeRevenueScenario?.label}</div></div>
          <div className="kyp-block slate"><div className="bv">{hasBuildingArea ? activeRevenueScenario?.children.toLocaleString() ?? "—" : "—"}</div><div className="bl">Children in scenario</div><div className="bd">Planning estimate, not licensed capacity</div></div>
          <div className="kyp-block slate"><div className="bv">{selectedSiteRevenueKnown && activeRevenueScenario ? `$${activeRevenueScenario.monthlyRevenue.toLocaleString()}` : "—"}</div><div className="bl">Monthly revenue</div><div className="bd">At entered monthly rate</div></div>
        </div>
        <p className="kyp-calchelp">The rate and scenario flow into <a href="#valuation-calculator-section">§ Valuation &amp; Cashflow</a>; a manual revenue entry there does not replace this planning estimate.</p>
        <div className="kyp-blocks hero two">
          <div className="kyp-block ind">
          <div className="bv">{hasBuildingArea ? Math.floor((buildingSqFt as number) / 75).toLocaleString() : "—"}</div>
            <div className="bl">Children at 75 sq ft each</div>
            <div className="bd">Efficient-capacity scenario</div>
          </div>
          <div className="kyp-block slate">
            <div className="bv">{hasBuildingArea ? Math.floor((buildingSqFt as number) / 90).toLocaleString() : "—"}</div>
            <div className="bl">Children at 90 sq ft each</div>
            <div className="bd">Comfortable-capacity scenario</div>
          </div>
        </div>
        {!hasBuildingArea &&
          <div className="kyp-status-empty" role="status">Building-area record unavailable. Capacity scenarios cannot be calculated until a positive building area is recorded.</div>}
        <table className="kyp-dtab">
          <tbody>
            <tr><td>Building size</td><td>{hasBuildingArea ? `${number(buildingSqFt)} sq ft` : "Not recorded"}{buildingSource && <span className="sm">{buildingSource}</span>}</td></tr>
            <tr><td>Building type</td><td>{buildingType || "Not recorded"}</td></tr>
            <tr><td>Land size</td><td>{hasLandArea ? `${number(landSqFt)} sq ft` : "Not recorded"}{landSource && <span className="sm">{landSource}</span>}</td></tr>
            <tr><td>Stories</td><td>{hasStories ? number(stories) : "Not recorded"}{storiesSource && <span className="sm">{storiesSource}</span>}</td></tr>
            <tr><td>Building footprint</td><td>
              {footprintSqFt != null
                ? <>{number(Math.round(footprintSqFt))} sq ft<span className="sm">{number(buildingSqFt)} ÷ {number(stories)} stories</span></>
                : "Not available without building area and stories"}
            </td></tr>
            {outdoorSqFt != null && (
                <tr><td>Estimated outdoor space</td><td>{number(outdoorSqFt)} sq ft</td></tr>
              )}
          </tbody>
        </table>
        <form className="kyp-form" onSubmit={saveSiteDetails}>
          <div className="fh">Correct the building record
            {(Number(buildingInput.replace(/,/g, "")) !== Number(buildingSqFt || 0) || Number(landInput.replace(/,/g, "")) !== Number(landSqFt || 0) || Number(storiesInput.replace(/,/g, "")) !== Number(stories || 0)) &&
              <span className="kyp-dirty">Unsaved · §17.5 shows {number(buildingSqFt)} sq ft</span>}
          </div>
          <div className="kyp-fields">
            <label className="kyp-field">Building sq ft *
              <input className="kyp-input num" inputMode="decimal" value={buildingInput} onChange={(event) => { dirtySiteRef.current = true; setBuildingInput(formatNumberInput(event.target.value)); }} />
            </label>
            <label className="kyp-field">Land sq ft
              <input className="kyp-input num" inputMode="decimal" value={landInput} onChange={(event) => { dirtySiteRef.current = true; setLandInput(formatNumberInput(event.target.value)); }} />
            </label>
            <label className="kyp-field">Stories
              <input className="kyp-input num" inputMode="decimal" value={storiesInput} onChange={(event) => { dirtySiteRef.current = true; setStoriesInput(formatNumberInput(event.target.value)); }} />
            </label>
          </div>
          {formError && <div className="kyp-status-empty" role="alert">{formError}</div>}
          <div className="kyp-btnrow">
            <button className="kyp-btn" type="submit" disabled={updatePending || !updateProperty || !runId}>{updatePending ? "Saving…" : "Update capacity"}</button>
            <button className="kyp-btn ghost" type="button" onClick={cancelSiteEdit}>Cancel</button>
          </div>
        </form>
        <Evidence>Revenue is a planning scenario only: selected whole-child capacity and enrollment multiplied by the editable monthly rate. It is not a published average or an expense verdict.
          {" "}Area is from the displayed source record or a saved manual override. Capacity uses floor area ÷ 75 or 90 sq ft/child, above the DCFS 35 sq ft indoor minimum, not licensed capacity. Estimated outdoor area is land minus footprint (building area ÷ stories); DCFS requires 75 sq ft outdoors per child.</Evidence>
        </div>
      </section>

      <section id="print-section-nearby-business-daycare-centers">
        <KypSubhead subsection={subsections.licensed}><span className="lbl">Licensed Competitors</span><span className="ct">City business-license records</span></KypSubhead>
        <div>
        {isNearbyLoading ? <div className="space-y-3" aria-label="Loading licensed daycare records"><div className="h-8 w-full animate-pulse rounded-md bg-muted" /><div className="h-8 w-4/5 animate-pulse rounded-md bg-muted" /></div>
          : isNearbyError ? <div className="kyp-status-empty" role="alert">City business-license daycare records could not be loaded.<div className="kyp-btnrow"><RetryButton onRetry={onNearbyRetry} /></div></div>
            : nearbyData ? (
              <>
                <ProjectUseCountBlocks counts={[
                  { value: nearbyData.within1Mile ?? null, label: "Within 1 mile" },
                  { value: nearbyData.within2Miles ?? null, label: "Within 2 miles" },
                  { value: nearbyData.within3Miles ?? nearbyData.totalFound ?? null, label: "Within 3 miles" },
                ]} />
                {licensedRows.length ? <ProjectUseBusinessList listKey="licensed-daycare" rows={licensedRows} initialLimit={10} />
                  : <div className="kyp-status-empty" role="status">No matching day-care business-license records were returned.</div>}
                <Evidence>Cached records from the City of Chicago Business Licenses dataset r5kz-chrr, matched by location; snapshot generated 2026-06-05. These records do not establish current operation, current licensure, or expiration. The endpoint returns up to 20 records within the requested radius. Business names link to a Google Maps search for the name and address because the city-license records do not provide Maps listing URLs.</Evidence>
              </>
            ) : <div className="kyp-status-empty" role="status">City business-license daycare records are not available.</div>}
        </div>
      </section>

      <section id="section-google-places-daycare">
        <KypSubhead subsection={subsections.maps}><span className="lbl">Google Maps Competitors</span><span className="ct">Google Places</span></KypSubhead>
        <ProjectUseGoogleMaps
          data={googleData}
          isLoading={isGoogleLoading}
          isError={isGoogleError}
          onRetry={onGoogleRetry}
          confirmed={googleConfirmed}
          searchTerm={googleSearchTerm}
          footer={<>Source: Google Maps Places. Results use the existing confirmed project-use search term; they do not identify licensed providers or this address. Ratings are Google user ratings, not a quality measure.</>}
        />
      </section>
    </div>
  );
}