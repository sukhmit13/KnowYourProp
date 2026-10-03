import React from "react";
import {
  ProjectUseBusinessList,
  ProjectUseCountBlocks,
  type ProjectUseBusinessListRow,
} from "@/components/report/ProjectUseAnalysisSpine";
import { KypSubhead } from "@/components/report/AccordionSection";
import { compactAccessHours } from "./compactAccessHours";
import type {
  EVDataPoint,
  EVRegistrationsData,
  SeniorsData,
  SeniorsZipData,
  VehicleOwnershipData,
} from "@/hooks/use-runs";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type GroceryRecord = {
  name: string;
  address: string;
  squareFeet: number | null;
  distance: number;
};
type GrocerySource = {
  storeCount: number;
  stores: GroceryRecord[];
  sources?: { dataSource?: string; dataYear?: string };
};

function LoadingRows({ label }: { label: string }) {
  return <div className="space-y-3" role="status" aria-label={`Loading ${label}`}>
    <div aria-hidden="true" className="h-8 w-2/3 animate-pulse rounded-md bg-muted" />
    <div aria-hidden="true" className="h-4 w-full animate-pulse rounded-md bg-muted" />
    <div aria-hidden="true" className="h-4 w-3/4 animate-pulse rounded-md bg-muted" />
  </div>;
}
function ErrorStatus({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="kyp-status-empty" role="alert">{message}
    {onRetry && <div className="kyp-btnrow"><button type="button" className="kyp-btn ghost" onClick={onRetry}>Retry</button></div>}
  </div>;
}

function PanelState({ label, scope, source, loading, error, onRetry, message }: {
  label: string; scope: string; source: React.ReactNode; loading?: boolean; error?: boolean;
  onRetry?: () => void; message?: string;
}) {
  return <>
    {loading ? <LoadingRows label={label} /> : error
      ? <ErrorStatus message={message ?? `${label} data could not be loaded.`} onRetry={onRetry} />
      : <div className="kyp-status-empty" role="status">{message ?? `${label} data is not available.`}</div>}
    <div className="kyp-src">Scope: {scope}. Source: {source}.</div>
  </>;
}

function BandScale({ active, labels, ranges }: { active: string | null | undefined; labels: [string, string, string]; ranges?: [string, string, string] }) {
  const keys = ["low", "moderate", "high"];
  return <div className="kyp-bands b3 slate" aria-label={`Slate source classification: ${active ?? "unavailable"}`}>
    {labels.map((label, index) => (
      <div className={`kyp-band slate${active?.toLowerCase() === keys[index] ? " on" : ""}`} key={keys[index]} aria-current={active?.toLowerCase() === keys[index] ? "true" : undefined}>
        <div className="bar" style={active?.toLowerCase() === keys[index] ? { backgroundColor: "var(--kyp-slate)" } : undefined} />
        <div className="bl" style={active?.toLowerCase() === keys[index] ? { color: "var(--kyp-slate)" } : undefined}>{label}</div>
        {ranges && <div className="br">{ranges[index]}</div>}
      </div>
    ))}
  </div>;
}

export function FoodAccessPanel({
  data, loading, error, onRetry, scope, areaLabel,
}: {
  data?: GrocerySource | null;
  loading: boolean;
  error?: boolean;
  onRetry?: () => void;
  scope: "zip" | "community";
  areaLabel: string;
}) {
  if (loading) return <PanelState loading label="food access" scope={`${scope === "zip" ? "ZIP" : "Community area"} ${areaLabel}; area aggregate, not a radius search`} source={data?.sources?.dataSource ?? "Chicago grocery-store snapshot; source details pending"} />;
  const stores = data?.stores ?? [];
  const floor = stores.reduce((sum, store) => sum + (Number.isFinite(store.squareFeet) ? store.squareFeet ?? 0 : 0), 0);
  const floorRecords = stores.filter(store => store.squareFeet != null && Number.isFinite(store.squareFeet)).length;
  const count = data ? data.storeCount : null;
  const band = count === 0 ? "none" : count != null && count <= 2 ? "limited" : count != null ? "several" : null;
  const bandTone = band === "none" ? "red" : band === "limited" ? "orange" : band === "several" ? "grn" : "slate";
  return <>
    {!data ? error ? <ErrorStatus message="Grocery store data could not be loaded." onRetry={onRetry} /> : <div className="kyp-status-empty" role="status">Grocery store data not available for this area.</div> : <>
      <div className="kyp-blocks two">
        <div className={`kyp-block count ${bandTone}`}><div><div className="bv">{count ?? "—"}</div><div className="bl">Licensed stores · {areaLabel}</div></div></div>
        <div className="kyp-block count slate"><div><div className="bv">{floorRecords ? floor.toLocaleString() : "—"}</div><div className="bl">Combined reported store area</div>{floorRecords > 0 && <div className="bd">sq ft · {floorRecords} of {stores.length} rows with area values</div>}</div></div>
      </div>
      <div className="kyp-bands b3" aria-label="Product planning bands">
        {[
          ["Food desert", "0 stores", "none", "no"],
          ["Limited access", "1–2 stores", "limited", "watch"],
          ["Good access", "3+ stores", "several", "ok"],
        ].map(([label, range, key, tone]) => <div className={`kyp-band ${tone}${band === key ? " on" : ""}`} key={key}>
          <div className="bar" /><div className="bl">{label}</div><div className="br">{range}</div>
        </div>)}
      </div>
    </>}
    <div className="kyp-src">Scope: {scope === "zip" ? "ZIP" : "Community area"} {areaLabel}; area aggregate, not a radius search. Source: {data?.sources?.dataSource ?? "source detail unavailable"}{data?.sources?.dataYear ? ` (${data.sources.dataYear})` : ""}. The square-foot field is summed only for non-null rows; reported store area is not necessarily selling floor. The 0 / 1–2 / 3+ bands are this product's planning convention, not USDA or City of Chicago food-access designations. The source's aggregate store count may differ from the returned detail rows.</div>
  </>;
}

export function GroceryLicenseList({
  data, loading, error, onRetry, scope, areaLabel, coordinatesAvailable = true,
}: {
  data?: GrocerySource | null;
  loading: boolean;
  error?: boolean;
  onRetry?: () => void;
  scope: "zip" | "community";
  areaLabel: string;
  coordinatesAvailable?: boolean;
}) {
  if (loading) return <PanelState loading label="licensed grocery stores" scope={`${scope === "zip" ? "ZIP" : "Community area"} ${areaLabel}; area-bounded inventory`} source={data?.sources?.dataSource ?? "Chicago grocery-store snapshot; source details pending"} />;
  const stores = data?.stores ?? [];
  const rows: ProjectUseBusinessListRow[] = stores.map(store => ({
    name: store.name,
    address: store.address,
    distance: coordinatesAvailable && Number.isFinite(store.distance) && store.distance >= 0 ? store.distance : null,
    meta: store.squareFeet == null ? [] : [`${store.squareFeet.toLocaleString()} sq ft · source area`],
  }));
  return <>
    {error ? <ErrorStatus message="Grocery license rows could not be loaded." onRetry={onRetry} />
      : !data ? <div className="kyp-status-empty" role="status">Grocery license rows are not available for this area.</div>
        : rows.length ? <>
          <ProjectUseCountBlocks counts={[
            { value: coordinatesAvailable ? stores.filter(store => Number.isFinite(store.distance) && store.distance >= 0 && store.distance <= 1).length : null, label: "Returned rows within 1 mile" },
            { value: coordinatesAvailable ? stores.filter(store => Number.isFinite(store.distance) && store.distance >= 0 && store.distance <= 2).length : null, label: "Returned rows within 2 miles" },
            { value: coordinatesAvailable ? stores.filter(store => Number.isFinite(store.distance) && store.distance >= 0 && store.distance <= 3).length : null, label: "Returned rows within 3 miles" },
          ]} />
          <ProjectUseBusinessList listKey={`food-licenses-${scope}-${areaLabel}`} rows={rows} />
        </>
          : <div className="kyp-status-empty" role="status">No licensed grocery-store rows were returned for this area.</div>}
    <div className="kyp-src">Scope: {scope === "zip" ? "ZIP" : "Community area"} {areaLabel}; the listing is area-bounded, not a complete radius inventory. Source: {data?.sources?.dataSource ?? "source detail unavailable"}{data?.sources?.dataYear ? ` (${data.sources.dataYear})` : ""}. Radius blocks count valid distances among returned rows only. The aggregate store count is kept separately from this detail list, so their totals can differ. The snapshot does not confirm a current license or an open business. Names link to Google Maps search results.</div>
  </>;
}

type SeniorsRecord = SeniorsData | SeniorsZipData;
function ordinal(rank: number): string {
  const mod100 = rank % 100;
  const suffix = mod100 >= 11 && mod100 <= 13 ? "th" : rank % 10 === 1 ? "st" : rank % 10 === 2 ? "nd" : rank % 10 === 3 ? "rd" : "th";
  return `${rank}${suffix}`;
}
function verifiedSeniorRank(data: SeniorsRecord): string | null {
  const match = data.rankDescription?.match(/\(#\s*(\d+)\s+of\s+(\d+)(?:\s+([^)]*))?\)/i);
  const rank = Number(match?.[1]);
  const denominator = Number(match?.[2]);
  if (!match || !Number.isInteger(data.citywideRank) || data.citywideRank < 1 || rank !== data.citywideRank || !Number.isInteger(denominator) || denominator < rank) return null;
  const denominatorType = /zip/i.test(match[3] ?? "") ? "ZIP codes" : /community area/i.test(match[3] ?? "") ? "community areas" : "records";
  return `${ordinal(rank)}-highest living-alone share · ${denominator} ${denominatorType}`;
}
export function SeniorPopulationPanel({
  data, loading, error, onRetry, scope, areaLabel,
}: {
  data?: SeniorsRecord | null;
  loading: boolean;
  error?: boolean;
  onRetry?: () => void;
  scope: "zip" | "community";
  areaLabel: string;
}) {
  if (loading) return <PanelState loading label="senior population" scope={`${scope === "zip" ? "ZIP" : "Community area"} ${areaLabel}`} source="Stored ACS-based planning estimates; counts are derived from percentage inputs" />;
  if (!data) return <>
    {error ? <ErrorStatus message="Senior population data could not be loaded." onRetry={onRetry} /> : <div className="kyp-status-empty" role="status">Senior population data is not available for this area.</div>}
    <div className="kyp-src">Scope: {scope === "zip" ? "ZIP" : "Community area"} {areaLabel}. Source: stored ACS-based planning estimates; no usable source record was returned.</div>
  </>;
  const ages = [
    ["65–74", data.age65to74],
    ["75–84", data.age75to84],
    ["85+", data.age85Plus],
  ] as const;
  const maxAge = Math.max(1, ...ages.map(([, value]) => value));
  const rank = verifiedSeniorRank(data);
  return <>
    <div className="kyp-blocks four">
      <div className="kyp-block slate count"><div><div className="bv">{data.population65Plus.toLocaleString()}</div><div className="bl">Population 65+</div><div className="bd">{data.pct65Plus}% of area population</div></div></div>
      <div className="kyp-block slate count"><div><div className="bv">{data.seniorsLivingAlone.toLocaleString()}</div><div className="bl">Seniors living alone</div><div className="bd">{data.pctSeniorsLivingAlone}% of seniors</div>{rank && <div className="chip rank">{rank}</div>}</div></div>
      <div className="kyp-block slate count"><div><div className="bv">{data.age85Plus.toLocaleString()}</div><div className="bl">Age 85+</div></div></div>
      <div className="kyp-block slate count"><div><div className="bv">{data.totalPopulation.toLocaleString()}</div><div className="bl">Total population</div></div></div>
    </div>
    <BandScale active={data.seniorDemandLevel} labels={["Low share", "Moderate share", "High share"]} ranges={["<28%", "28–<38%", "≥38%"]} />
    <div className="kyp-charttitle">Age breakdown, 65 and over</div>
    <div>
      {ages.map(([label, value]) => <div className="kyp-hbar" key={label}>
        <div className="hl"><i className="tick ind" />{label}</div>
        <div className="htrack"><i className="ind" style={{ width: `${Math.max(0, Math.min(100, value / maxAge * 100))}%` }}><b className="hbar-count">{value.toLocaleString()}</b></i></div>
        <div className="hv">{value.toLocaleString()}</div>
      </div>)}
    </div>
    <div className="kyp-src">Scope: {scope === "zip" ? "ZIP" : "Community area"} {areaLabel}. Source: stored ACS-based planning estimates. Age-cohort and living-alone counts are derived by applying stored percentages to population, not independently observed ACS counts. The rank compares the percentage of seniors living alone, highest first, and is shown only when its rank and comparison-set size agree with the source description. Age 85+ is included within population 65+; living-alone counts overlap age cohorts and must not be added to them. The bands measure living-alone share among seniors: low &lt;28%, moderate 28–&lt;38%, high ≥38%. These cut points are a product planning convention, not a published standard. Slate indicates context, not a verdict: these figures do not measure care-provider supply.</div>
  </>;
}

export function VehicleOwnershipPanel({
  data, loading, error, onRetry, areaLabel,
}: {
  data?: VehicleOwnershipData | null;
  loading: boolean;
  error?: boolean;
  onRetry?: () => void;
  areaLabel: string;
}) {
  if (loading) return <PanelState loading label="vehicle ownership" scope={`Community area ${areaLabel}`} source="Stored ACS-based planning estimates; household categories are derived from percentage inputs" />;
  if (!data) return <>
    {error ? <ErrorStatus message="Vehicle ownership data could not be loaded." onRetry={onRetry} /> : <div className="kyp-status-empty" role="status">Vehicle ownership data is not available for this community area.</div>}
    <div className="kyp-src">Scope: Community area {areaLabel}. Source: stored ACS-based planning estimates; no usable record was returned.</div>
  </>;
  const twoPlusCount = data.twoVehicles + data.threePlusVehicles;
  const twoPlusPct = data.totalHouseholds > 0 ? twoPlusCount / data.totalHouseholds * 100 : null;
  const oneVehiclePct = twoPlusPct == null ? null : 100 - data.pctNoVehicle - twoPlusPct;
  return <>
    <div className="kyp-blocks">
      <div className="kyp-block slate count"><div><div className="bv">{data.avgVehiclesPerHousehold.toFixed(2)}</div><div className="bl">Vehicles per household</div><div className="bd">Across {data.totalHouseholds.toLocaleString()} households</div></div></div>
      <div className="kyp-block slate count"><div><div className="bv">{data.pctNoVehicle}%</div><div className="bl">Households with no vehicle</div><div className="bd">{data.noVehicle.toLocaleString()} estimated households</div></div></div>
      <div className="kyp-block slate count"><div><div className="bv">{twoPlusPct == null ? "—" : `${twoPlusPct.toFixed(1)}%`}</div><div className="bl">Households with 2+ vehicles</div><div className="bd">{twoPlusCount.toLocaleString()} estimated households</div><div className="bd">2: {data.twoVehicles.toLocaleString()} · 3+: {data.threePlusVehicles.toLocaleString()}</div></div></div>
    </div>
    <BandScale active={data.autoDependencyLevel} labels={["Low", "Moderate", "High"]} ranges={["<1.0 vehicles/household", "1.0–<1.5", "≥1.5"]} />
    <div className="kyp-src">Scope: Community area {areaLabel}. Source: stored ACS-based planning estimates. Low &lt;1.0, moderate 1.0–&lt;1.5, high ≥1.5 average vehicles per household are product planning cut points, not a published standard. Household category counts are derived from stored percentages and household totals, not independently observed ACS counts; the average weights the 3+ category at 3.2 vehicles. One-vehicle count estimate: {data.oneVehicle.toLocaleString()} households. One-vehicle share: 100% − {data.pctNoVehicle}% with no vehicle − {twoPlusPct == null ? "unavailable" : `${twoPlusPct.toFixed(1)}%`} with 2+ vehicles = {oneVehiclePct == null ? "unavailable" : `${oneVehiclePct.toFixed(1)}%`}; the 2+ share is ({data.twoVehicles.toLocaleString()} + {data.threePlusVehicles.toLocaleString()}) ÷ {data.totalHouseholds.toLocaleString()} × 100. Approximate vehicle total: {Math.round(data.avgVehiclesPerHousehold * data.totalHouseholds).toLocaleString()} ({data.avgVehiclesPerHousehold.toFixed(2)} × {data.totalHouseholds.toLocaleString()} households). Slate shows position only; whether a higher vehicle share is favorable depends on the proposed use.</div>
  </>;
}

function pointTime(point: EVDataPoint): number {
  return point.year * 12 + point.month;
}
function sortedPoints(points: EVDataPoint[] | null | undefined): EVDataPoint[] {
  return [...(points ?? [])].sort((a, b) => pointTime(a) - pointTime(b));
}
function monthLabel(point: EVDataPoint): string {
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][point.month - 1] ?? point.month}/${point.year}`;
}
function displayWindow(points: EVDataPoint[] | null | undefined): string {
  const sorted = sortedPoints(points);
  if (!sorted.length) return "date range unavailable";
  return `${monthLabel(sorted[0])}–${monthLabel(sorted[sorted.length - 1])}`;
}
function TrendChart({ points, dataKey, title, color }: { points: EVDataPoint[]; dataKey: string; title: string; color: string }) {
  const sorted = sortedPoints(points);
  const byMonth = new Map(sorted.map(point => [pointTime(point), point.count]));
  const chartRows: Array<{ date: string; year: number; month: number; count: number | null }> = [];
  if (sorted.length) {
    let cursor = pointTime(sorted[0]);
    const final = pointTime(sorted[sorted.length - 1]);
    while (cursor <= final) {
      const year = Math.floor((cursor - 1) / 12);
      const month = cursor - year * 12;
      chartRows.push({ date: monthLabel({ year, month, count: 0 }), year, month, count: byMonth.get(cursor) ?? null });
      cursor += 1;
    }
  }
  const data = chartRows.map(point => ({ date: point.date, [dataKey]: point.count }));
  return <div>
    <div className="kyp-charttitle">{title}</div>
    <div style={{ height: 240 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 5 }}>
          <CartesianGrid stroke="var(--kyp-line)" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--kyp-muted)" }} tickLine={false} axisLine={{ stroke: "var(--kyp-line)" }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10, fill: "var(--kyp-muted)" }} tickLine={false} axisLine={false} tickFormatter={(value: string | number) => Number(value) >= 1000 ? `${(Number(value) / 1000).toFixed(0)}k` : String(value)} />
          <Tooltip formatter={(value: number) => [Number(value).toLocaleString(), "Registrations"]} />
          <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={sorted.length === 1 || chartRows.some(row => row.count == null) ? { r: 3, strokeWidth: 0, fill: color } : false} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  </div>;
}

export function EVRegistrationTrends({ data, loading, error, onRetry, zipCode }: {
  data?: EVRegistrationsData | null;
  loading: boolean;
  error?: boolean;
  onRetry?: () => void;
  zipCode: string;
}) {
  if (loading) return <PanelState loading label="EV registration trends" scope={`Cook County and ZIP ${zipCode}`} source="Illinois Secretary of State, Electric Vehicle Statistics" />;
  if (!data || (!data.cookCountyData?.length && !data.zipCodeData?.length)) return <>
    {error ? <ErrorStatus message="EV registration data could not be loaded." onRetry={onRetry} /> : <div className="kyp-status-empty" role="status">{data?.message || "EV registration data is not available."}</div>}
    <div className="kyp-src">Scope: Cook County and ZIP {zipCode}. Source: Illinois Secretary of State, Electric Vehicle Statistics{data?.sourceUrl ? <> · <a href={data.sourceUrl} target="_blank" rel="noopener noreferrer">Source record</a></> : ""}.</div>
  </>;
  const countySeries = sortedPoints(data.cookCountyData);
  const countyLatest = countySeries[countySeries.length - 1];
  const zipSeries = sortedPoints(data.zipCodeData);
  const zipLatest = zipSeries[zipSeries.length - 1];
  return <>
    <ProjectUseCountBlocks className="two" counts={[
      { value: countyLatest?.count.toLocaleString() ?? null, label: `Cook County series · ${countyLatest ? monthLabel(countyLatest) : "latest month unavailable"}` },
      { value: zipLatest?.count.toLocaleString() ?? null, label: `ZIP ${zipCode} · ${zipLatest ? monthLabel(zipLatest) : "latest month unavailable"}` },
    ]} />
    <div className="kyp-twochart">
      {countySeries.length ? <TrendChart points={countySeries} dataKey="cookCounty" title="Cook County" color="var(--kyp-indigoL)" /> : <div className="kyp-status-empty">Cook County registration rows are not available.</div>}
      {zipSeries.length ? <TrendChart points={zipSeries} dataKey="zipCode" title={`ZIP ${zipCode}`} color="var(--kyp-orange)" /> : <div className="kyp-status-empty">ZIP registration rows are not available.</div>}
    </div>
    <div className="kyp-src">Scope: Cook County and ZIP {data.zipCode || zipCode}; each chart has an independent count axis. Counts are registered electric vehicles, not households that own EVs. Source windows from returned monthly rows: Cook County {displayWindow(countySeries)}; ZIP {displayWindow(zipSeries)}. Source: Illinois Secretary of State monthly EV registration reports{data.sourceUrl ? <> · <a href={data.sourceUrl} target="_blank" rel="noopener noreferrer">Source record</a></> : ""}. Missing months remain null gaps and are not interpolated. Data last updated {data.lastUpdated || "date unavailable"}.</div>
  </>;
}

export function LicensedBusinessPanel({
  data, loading, error, onRetry, category, source, radius = 1, listKey,
}: {
  data?: {
    locations: Array<{ name: string; address: string; neighborhood?: string | null; distanceMiles: number | null }>;
    within1Mile?: number | null;
    within3Miles?: number | null;
  } | null;
  loading: boolean;
  error?: boolean;
  onRetry?: () => void;
  category: string;
  source: string;
  radius?: 1 | 3;
  listKey: string;
}) {
  if (loading) return <PanelState loading label={category.toLowerCase()} scope={`Returned license rows within ${radius} mile${radius > 1 ? "s" : ""}`} source={source} />;
  const locations = data?.locations ?? [];
  const validDistance = (distance: number | null) => distance != null && Number.isFinite(distance) && distance >= 0;
  const within = locations.filter(item => !validDistance(item.distanceMiles) || item.distanceMiles! <= radius);
  const knownCount = locations.filter(item => validDistance(item.distanceMiles) && item.distanceMiles! <= radius).length;
  const aggregateCount = radius === 1 ? data?.within1Mile : data?.within3Miles;
  const count = aggregateCount != null && Number.isFinite(aggregateCount) && aggregateCount >= 0 ? aggregateCount : knownCount;
  const rows: ProjectUseBusinessListRow[] = within.map(loc => ({
    name: loc.name,
    address: `${loc.address}${loc.neighborhood ? `, ${loc.neighborhood}` : ""}`,
    distance: validDistance(loc.distanceMiles) ? loc.distanceMiles : null,
  }));
  return <>
    {error ? <ErrorStatus message={`${category} records could not be loaded.`} onRetry={onRetry} /> : data ? <>
      <ProjectUseCountBlocks counts={[{ value: count, label: `Within ${radius} mile${radius > 1 ? "s" : ""}` }]} />
      {rows.length ? <ProjectUseBusinessList listKey={listKey} rows={rows} /> : <div className="kyp-status-empty" role="status">No {category.toLowerCase()} license rows were returned within {radius} mile{radius > 1 ? "s" : ""}.</div>}
    </> : <div className="kyp-status-empty" role="status">{category} license data is not available.</div>}
    <div className="kyp-src">Scope: {category.toLowerCase()} license matches within {radius} mile{radius > 1 ? "s" : ""}; source radius totals are retained when available, while the returned detail list may be capped. Unknown distances may be listed but are excluded from returned-row radius counts. Source: {source}. License records do not confirm current operation. Names link to Google Maps search results.</div>
  </>;
}

type ChargingStation = {
  id?: string; name: string; address: string; distanceMiles?: number | null; evNetwork?: string | null;
  evLevel2Count?: number | null; dcFastCount?: number | null; accessDays?: string | null;
  dateLastConfirmed?: string | null;
};
function validChargingDistance(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
function deduplicateChargingStations(stations: readonly ChargingStation[]): ChargingStation[] {
  const byAddress = new Map<string, ChargingStation>();
  const seenIds = new Set<string>();
  const sumKnownPorts = (a: number | null | undefined, b: number | null | undefined): number | null =>
    a == null && b == null ? null : (a ?? 0) + (b ?? 0);
  const mergeDistinct = (a: string | null | undefined, b: string | null | undefined) => {
    const values = [a, b].flatMap(value => value?.split(" · ").map(part => part.trim()).filter(Boolean) ?? []);
    const uniqueValues = new Map(values.map(value => [value.toLocaleLowerCase(), value]));
    return Array.from(uniqueValues.values()).join(" · ") || null;
  };
  const mergeMetadata = (target: ChargingStation, incoming: ChargingStation) => {
    target.name = mergeDistinct(target.name, incoming.name) ?? target.name;
    target.evNetwork = mergeDistinct(target.evNetwork, incoming.evNetwork);
    target.accessDays = mergeDistinct(target.accessDays, incoming.accessDays);
    target.dateLastConfirmed = mergeDistinct(target.dateLastConfirmed, incoming.dateLastConfirmed);
    if (validChargingDistance(incoming.distanceMiles) && (!validChargingDistance(target.distanceMiles) || incoming.distanceMiles < target.distanceMiles)) target.distanceMiles = incoming.distanceMiles;
  };
  stations.forEach(station => {
    const repeatedId = !!station.id && seenIds.has(station.id);
    if (station.id) seenIds.add(station.id);
    if (repeatedId) {
      const repeated = byAddress.get(station.address.trim().toLocaleLowerCase());
      if (repeated) mergeMetadata(repeated, station);
      return;
    }
    const key = station.address.trim().toLocaleLowerCase();
    const prior = byAddress.get(key);
    if (!prior) byAddress.set(key, { ...station });
    else {
      mergeMetadata(prior, station);
      prior.evLevel2Count = sumKnownPorts(prior.evLevel2Count, station.evLevel2Count);
      prior.dcFastCount = sumKnownPorts(prior.dcFastCount, station.dcFastCount);
    }
  });
  return Array.from(byAddress.values());
}
export function getEVChargingSiteCount(stations: readonly ChargingStation[], radius = 3): number {
  return deduplicateChargingStations(stations).filter(station => validChargingDistance(station.distanceMiles) && station.distanceMiles <= radius).length;
}
export function EVChargingTable({ stations, loading, error, onRetry }: {
  stations?: ChargingStation[] | null; loading: boolean; error?: boolean; onRetry?: () => void;
}) {
  if (loading || error || !stations?.length) return <PanelState loading={loading} error={error} onRetry={onRetry} label="EV charging stations" scope="Public charging-station records within 3 miles; unknown distances are not radius-counted" source="U.S. Department of Energy via Chicago Data Portal" message={error ? "EV charging station data could not be loaded." : "No EV charging station rows were returned."} />;
  const unique = deduplicateChargingStations(stations);
  const rows = unique.filter(station => !validChargingDistance(station.distanceMiles) || station.distanceMiles <= 3);
  const radiusCount = (radius: number) => unique.filter(station => validChargingDistance(station.distanceMiles) && station.distanceMiles <= radius).length;
  const confirmedDate = (value: string | null | undefined) => value
    ? value.split(" · ").map(date => Number.isFinite(new Date(date).getTime())
      ? new Date(date).toLocaleDateString("en-US", /^\d{4}-\d{2}-\d{2}$/.test(date) ? { timeZone: "UTC" } : undefined)
      : date).join(" · ")
    : "Unknown";
  const rowsData: ProjectUseBusinessListRow[] = rows.map(station => ({
    name: station.name,
    address: station.address,
    distance: validChargingDistance(station.distanceMiles) ? station.distanceMiles : null,
    meta: [
      `Network: ${station.evNetwork || "Unknown"}`,
      `Level 2 ports: ${station.evLevel2Count ?? "Unknown"}`,
      `DC fast ports: ${station.dcFastCount ?? "Unknown"}`,
      `Access: ${compactAccessHours(station.accessDays)}`,
      `Confirmed: ${confirmedDate(station.dateLastConfirmed)}`,
    ],
  }));
  return <>
    <ProjectUseCountBlocks counts={[
      { value: radiusCount(1), label: "Within 1 mile" },
      { value: radiusCount(2), label: "Within 2 miles" },
      { value: radiusCount(3), label: "Within 3 miles" },
    ]} />
    <ProjectUseBusinessList rows={rowsData} initialLimit={rowsData.length} listKey="ev-charging-stations" />
    <div className="kyp-src">Scope: deduplicated returned public charging station addresses within 3 miles; unknown, invalid, nonfinite, and negative distances are listed as unknown but excluded from radius counts. Source: U.S. Department of Energy via Chicago Data Portal. Port figures sum available source counts across distinct records; repeated station IDs are not added again. Missing counts are not confirmed zeros, and two missing values remain unknown. Distinct network, access, and confirmation values are retained as labeled row metadata. Station names link to Google Maps search results.</div>
  </>;
}

export function HotelShortTermRentalGroup({ counts }: { counts: { totalFound: number; within1Mile: number; within2Miles: number; within3Miles: number } }) {
  return <div className="subwrap">
    <KypSubhead><span className="lbl">Short-term rentals</span><span className="ct">{counts.totalFound.toLocaleString()} returned records</span></KypSubhead>
    <ProjectUseCountBlocks counts={[
      { value: counts.within1Mile, label: "Within 1 mile" },
      { value: counts.within2Miles, label: "Within 2 miles" },
      { value: counts.within3Miles, label: "Within 3 miles" },
    ]} />
  </div>;
}