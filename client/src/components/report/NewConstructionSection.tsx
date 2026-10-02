import React, { useEffect, useMemo, useState } from "react";
import { KypSubhead } from "@/components/report/AccordionSection";

interface Props {
  data?: any;
  isLoading: boolean;
  isError: boolean;
  subjectUnits?: number | null;
}

const label: Record<string, string> = { singleFamily: "Single family", multifamily: "Multifamily", commercial: "Commercial" };
const money = (value: number | null | undefined) => value == null ? "—" : `$${Math.round(value).toLocaleString()}`;
const sourceNote = "Source: Chicago Building Permits — “Permit - New Construction” records only; garages, temporary and accessory structures are excluded. Unit counts are estimated from permit descriptions.";

export function NewConstructionSection({ data, isLoading, isError, subjectUnits: subjectUnitsInput }: Props) {
  const [filter, setFilter] = useState<string | null>(null);
  const [showAllPermits, setShowAllPermits] = useState(false);
  const permits = useMemo(
    () => (data?.permits || []).filter((permit: any) => !filter || permit.category === filter),
    [data?.permits, filter],
  );
  useEffect(() => {
    setShowAllPermits(false);
  }, [data?.permits]);

  if (isLoading || isError || !data) return <div id="print-section-new-construction" className="kyp-biz" data-testid="card-new-construction">
    {isLoading ? <div className="kyp-biz-loading" aria-live="polite"><span /><span /><span /></div> : <div className="kyp-status-empty unknown">{isError ? "Construction permit records could not be loaded. The nearby construction result is unknown rather than zero." : "Construction data is not available for this address."}</div>}
    <div className="kyp-src kyp-construction-notes" data-testid="new-construction-notes">
      <p>Describes permits within 1 mile, not this address.</p><p>{sourceNote}</p>
    </div>
  </div>;

  const stats = data.subject;
  const categories = Object.entries(stats.byCategory || {}) as Array<[string, number]>;
  const maxCategory = Math.max(1, ...categories.map(([, count]) => Number(count)));
  const years = Object.entries(stats.annual || {}).filter(([year]) => /^\d{4}$/.test(year)).sort(([a], [b]) => b.localeCompare(a)) as Array<[string, any]>;
  const maxYear = Math.max(1, ...years.map(([, row]) => row.total));
  const subjectUnits = Number(subjectUnitsInput ?? 0) || null;
  const permittedUnits = Number(stats.permittedUnits || 0);
  const supplyRatio = subjectUnits && permittedUnits ? permittedUnits / subjectUnits : null;
  const supplyGate = !!subjectUnits && permittedUnits >= 12 && !!supplyRatio && supplyRatio >= 2;
  const trend = data.trend;
  const benchmark = data.communityBenchmark;
  const heroes = [
    { cls: "ind", bv: String(stats.totalPermits), bl: "Nearby permits", bd: "issued in the past 3 years" },
    { cls: "slate", bv: money(stats.medianReportedCost), bl: "Median reported cost", bd: "declared permit value" },
  ];
  if (trend) heroes.push(trend.suppressed || trend.changePct == null
    ? { cls: "slate", bv: "—", bl: "12-month change", bd: "too few permits to compare" }
    : { cls: "slate", bv: `${trend.changePct > 0 ? "+" : ""}${trend.changePct}%`, bl: "12-month change",
        bd: `${trend.current12Months} permits vs ${trend.prior12Months} the year before` });
  if (benchmark) heroes.push({ cls: "slate", bv: String(benchmark.totalPermits),
    bl: `${benchmark.name} community area`, bd: "same 3-year window" });
  const heroCols = heroes.length === 4 ? " four" : heroes.length === 2 ? " two" : "";

  return (
    <div id="print-section-new-construction" className="kyp-biz" data-testid="card-new-construction">
      <div className={`kyp-blocks${heroCols} kyp-biz-heroes`}>
        {heroes.map((h) => <div className={`kyp-block ${h.cls}`} key={h.bl}>
          <div className="bv">{h.bv}</div>
          <div><div className="bl">{h.bl}</div><div className="bd">{h.bd}</div></div>
        </div>)}
      </div>

      <KypSubhead className="fam-green"><span className="lbl">Permit mix</span><span className="ct">select a type to filter records</span><span className="rule" /></KypSubhead>
      <div className="kyp-biz-mix">
        {categories.map(([category, count]) => <button key={category} type="button" className={`kyp-hbar${filter === category ? " active" : ""}`} onClick={() => { setFilter(filter === category ? null : category); setShowAllPermits(false); }}>
          <span className="hl">{label[category] || category}</span><span className="htrack"><i className="ind" style={{ width: `${Number(count) / maxCategory * 100}%` }}><b className="hbar-count">{count}</b></i></span>
        </button>)}
      </div>

      {years.length > 0 && <><KypSubhead className="fam-green"><span className="lbl">Annual permit volume</span><span className="ct">three-year source period</span><span className="rule" /></KypSubhead>
        <div className="kyp-biz-mix">{years.map(([year, row]) => <div className="kyp-hbar yr" key={year}><span className="hl">{year}</span><span className="htrack"><i className="ind" style={{ width: `${row.total / maxYear * 100}%` }}><b className="hbar-count">{row.total}</b></i></span></div>)}</div>
      </>}
      <KypSubhead className="fam-green"><span className="lbl">{permits.length} nearby permit{permits.length === 1 ? "" : "s"}</span><span className="ct">nearest first</span><span className="rule" /></KypSubhead>
      <div className="kyp-biz-list">{(showAllPermits ? permits : permits.slice(0, 12)).map((permit: any, index: number) => <article key={permit.permitNumber} className="kyp-biz-card" data-testid={`row-new-construction-${index}`}>
        <div><b>{permit.address}</b><span>{label[permit.category]} · issued {permit.issueDate || "date unavailable"}</span></div>
        <span className="kyp-biz-distance">{permit.distanceMiles.toFixed(2)} mi</span>
        <div className="kyp-biz-cardmeta">{permit.corridor?.name && <span className="kyp-corridor">{permit.corridor.name}</span>}{permit.units ? <span>{permit.units} units</span> : null}{permit.stories ? <span>{permit.stories} stories</span> : null}{permit.reportedCost > 0 ? <span>{money(permit.reportedCost)}</span> : null}</div>
        {(permit.contractorName || permit.architectName) && <div className="kyp-biz-cardmeta">{permit.contractorName && <span className="kyp-pro"><i>GC</i><a href={`/discovery?view=gc-rankings&search=${encodeURIComponent(permit.contractorName)}`}>{permit.contractorName}</a></span>}{permit.architectName && <span className="kyp-pro"><i>Architect</i><a href={`/discovery?view=architect-rankings&search=${encodeURIComponent(permit.architectName)}`}>{permit.architectName}</a></span>}</div>}
      </article>)}</div>
      {permits.length > 12 && (
        <button type="button" className="kyp-morelink" data-testid="button-new-construction-show-more" aria-expanded={showAllPermits} onClick={() => setShowAllPermits((current) => !current)}>
          {showAllPermits ? "Show fewer ↑" : `Show all ${permits.length} nearby permits →`}
        </button>
      )}
      <div className="kyp-src kyp-construction-notes" data-testid="new-construction-notes">
        <p>Describes permits within 1 mile, not this address.{supplyGate ? ` They identify ${permittedUnits.toLocaleString()} units, ${supplyRatio!.toFixed(1)}× the subject’s ${subjectUnits} — competing supply, not confirmed construction.` : ""}</p>
        <p>{sourceNote}</p>
      </div>
    </div>
  );
}