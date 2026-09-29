import { useMemo, useState } from "react";
import { HardHat } from "lucide-react";
import { KypSubhead } from "@/components/report/AccordionSection";

interface Props {
  data?: any;
  isLoading: boolean;
  isError: boolean;
  subjectUnits?: number | null;
}

const label: Record<string, string> = { singleFamily: "Single family", multifamily: "Multifamily", commercial: "Commercial" };
const money = (value: number | null | undefined) => value == null ? "—" : `$${Math.round(value).toLocaleString()}`;

export function NewConstructionSection({ data, isLoading, isError, subjectUnits }: Props) {
  const [filter, setFilter] = useState<string | null>(null);
  const permits = useMemo(
    () => (data?.permits || []).filter((permit: any) => !filter || permit.category === filter),
    [data?.permits, filter],
  );

  if (isLoading) return <div className="kyp-biz-loading" aria-live="polite"><span /><span /><span /></div>;
  if (isError) return <div className="kyp-status-empty unknown">Construction permit records could not be loaded. The nearby construction result is unknown rather than zero.</div>;
  if (!data) return <div className="kyp-status-empty unknown">Construction data is not available for this address.</div>;

  const stats = data.subject;
  const categories = Object.entries(stats.byCategory || {}) as Array<[string, number]>;
  const maxCategory = Math.max(1, ...categories.map(([, count]) => Number(count)));
  const years = Object.entries(stats.annual || {}).filter(([year]) => /^\d{4}$/.test(year)).sort(([a], [b]) => b.localeCompare(a)) as Array<[string, any]>;
  const maxYear = Math.max(1, ...years.map(([, row]) => row.total));
  const supplyRatio = subjectUnits && stats.permittedUnits ? stats.permittedUnits / subjectUnits : null;
  const supplyGate = subjectUnits != null && subjectUnits > 0 && stats.permittedUnits >= 12 && supplyRatio != null && supplyRatio >= 2;
  const trend = data.trend;

  return (
    <div id="print-section-new-construction" className="kyp-biz" data-testid="card-new-construction">
      <div className="kyp-biz-topline"><HardHat aria-hidden="true" /><span>New construction</span><span className="kyp-biz-radius">1 mile · issued permits</span></div>
      <div className="kyp-blocks kyp-biz-heroes">
        <div className="kyp-block ind"><div className="bv">{stats.totalPermits}</div><div><div className="bl">Nearby permits</div><div className="bd">issued in the past 3 years</div></div></div>
        <div className="kyp-block slate"><div className="bv">{data.activePermitCount}</div><div><div className="bl">Likely still building</div><div className="bd">issued within 18 months</div></div></div>
        <div className="kyp-block slate"><div className="bv">{money(stats.medianReportedCost)}</div><div><div className="bl">Median reported cost</div><div className="bd">declared permit value</div></div></div>
      </div>

      {(data.communityBenchmark || supplyGate) && (
        <div className={`kyp-biz-takeaway${supplyGate ? " attention" : ""}`}>
          <div className="kyp-biz-takeaway-title">{supplyGate && <HardHat aria-hidden="true" />} Nearby construction</div>
          <p>
            {data.communityBenchmark ? `The ${data.communityBenchmark.name} community area recorded ${data.communityBenchmark.totalPermits} qualifying permits over the same three-year source period.` : ""}
            {supplyGate ? ` Nearby permits identify ${stats.permittedUnits.toLocaleString()} units, or ${supplyRatio!.toFixed(1)}× the subject’s ${subjectUnits} units; this is a competing-supply and construction-disruption flag, not a statement that projects are currently active.` : ""}
          </p>
        </div>
      )}

      <KypSubhead className="fam-green" subsection={1}><span className="lbl">Permit mix</span><span className="ct">select a type to filter records</span><span className="rule" /></KypSubhead>
      <div className="kyp-biz-mix">
        {categories.map(([category, count]) => <button key={category} type="button" className={`kyp-hbar${filter === category ? " active" : ""}`} onClick={() => setFilter(filter === category ? null : category)}>
          <span className="hl">{label[category] || category}</span><span className="htrack"><i className="ind" style={{ width: `${Number(count) / maxCategory * 100}%` }}><b className="hbar-count">{count}</b></i></span>
        </button>)}
      </div>

      {years.length > 0 && <><KypSubhead className="fam-green" subsection={2}><span className="lbl">Annual permit volume</span><span className="ct">three-year source period</span><span className="rule" /></KypSubhead>
        <div className="kyp-biz-mix">{years.map(([year, row]) => <div className="kyp-hbar yr" key={year}><span className="hl">{year}</span><span className="htrack"><i className="ind" style={{ width: `${row.total / maxYear * 100}%` }}><b className="hbar-count">{row.total}</b></i></span></div>)}</div>
      </>}
      <div className="kyp-biz-takeaway">
        <div className="kyp-biz-takeaway-title">12-month trend</div>
        <p>{trend.suppressed ? `Trend is not shown because only ${trend.current12Months + trend.prior12Months} permits fall in the two comparison years; at least four combined permits are needed.` : `${trend.current12Months} permits in the trailing 12 months versus ${trend.prior12Months} in the prior 12 months (${trend.changePct! > 0 ? "+" : ""}${trend.changePct}%).`}</p>
      </div>

      <KypSubhead className="fam-green" subsection={years.length > 0 ? 3 : 2}><span className="lbl">{permits.length} nearby permit{permits.length === 1 ? "" : "s"}</span><span className="ct">nearest first</span><span className="rule" /></KypSubhead>
      <div className="kyp-biz-list">{permits.slice(0, 12).map((permit: any, index: number) => <article key={permit.permitNumber} className="kyp-biz-card" data-testid={`row-new-construction-${index}`}>
        <div><b>{permit.address}</b><span>{label[permit.category]} · issued {permit.issueDate || "date unavailable"}{permit.likelyStillBuilding ? " · likely still building" : ""}</span></div>
        <span className="kyp-biz-distance">{permit.distanceMiles.toFixed(2)} mi</span>
        <div className="kyp-biz-cardmeta">{permit.units ? <span>{permit.units} units</span> : null}{permit.stories ? <span>{permit.stories} stories</span> : null}{permit.reportedCost > 0 ? <span>{money(permit.reportedCost)}</span> : null}{permit.contractorName ? <span>Contractor: {permit.contractorName}</span> : null}</div>
      </article>)}</div>
      <div className="kyp-src">Source: Chicago Building Permits. Only “Permit - New Construction” records within one mile are counted. Garages, temporary structures, and other accessory structures are excluded. “Likely still building” is an 18-month issued-permit proxy, not a construction-status verification.</div>
    </div>
  );
}