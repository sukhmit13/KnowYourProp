import { useMemo, useState } from "react";
import { BriefcaseBusiness, TrendingDown, TrendingUp } from "lucide-react";
import {
  groupLicenseEstablishments,
  titleCaseBusiness,
  type NearbyLicensesResponse,
} from "@shared/businessLicenses";
import { KypSubhead } from "@/components/report/AccordionSection";

interface Props {
  data?: NearbyLicensesResponse;
  isLoading: boolean;
  isError: boolean;
}

const monthYear = (date: string) => date
  ? new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "short", year: "numeric" })
  : "";

export function NewBusinessLicensesSection({ data, isLoading, isError }: Props) {
  const [filter, setFilter] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const establishments = useMemo(() => groupLicenseEstablishments(data?.licenses || []), [data?.licenses]);
  const rankedMix = useMemo(() => {
    const counts = new Map<string, number>();
    establishments.forEach((business) => counts.set(business.comboLabel, (counts.get(business.comboLabel) || 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [establishments]);

  if (isLoading) {
    return <div className="kyp-biz-loading" aria-live="polite"><span /><span /><span /></div>;
  }
  if (isError) {
    return <div className="kyp-status-empty unknown">New business issuance records could not be loaded. The result is unknown rather than zero.</div>;
  }
  if (!data || establishments.length === 0) {
    return <div className="kyp-status-empty">No qualifying new business issuances were found within 1 mile in the past 12 months.</div>;
  }

  const filtered = filter ? establishments.filter((business) => business.comboLabel === filter) : establishments;
  const visible = showAll ? filtered : filtered.slice(0, 6);
  const maxMix = rankedMix[0]?.[1] || 1;
  const priorKnown = data.priorPeriodCount > 0;
  const trendUp = (data.changePct || 0) >= 0;
  const topMix = rankedMix[0]?.[0]?.replace(/ only$/, "") || "mixed openings";

  return (
    <div id="print-section-new-business-licenses" className="kyp-biz" data-testid="card-business-licenses">
      <div className="kyp-biz-topline">
        <BriefcaseBusiness aria-hidden="true" />
        <span>New business licenses</span>
        <span className="kyp-biz-radius">1 mile · new issuances only</span>
      </div>

      <div className="kyp-blocks kyp-biz-heroes">
        <div className="kyp-block grn">
          <div className="bv">{data.totalCount}</div>
          <div><div className="bl">New businesses</div><div className="bd">distinct openings · past 12 months</div></div>
        </div>
        <div className="kyp-block ind">
          <div className="bv">{priorKnown ? `${data.changePct! > 0 ? "+" : ""}${data.changePct}%` : "—"}</div>
          <div>
            <div className="bl">Formation change</div>
            <div className="bd">{priorKnown ? `${data.priorPeriodCount} businesses in the prior year` : "no prior-year baseline"}</div>
          </div>
        </div>
        <div className="kyp-block slate">
          <div className="bv">{data.licenseCount}</div>
          <div><div className="bl">License issuances</div><div className="bd">grouped into {data.totalCount} businesses</div></div>
        </div>
      </div>

      <div className="kyp-biz-takeaway">
        <div className="kyp-biz-takeaway-title">
          {priorKnown && (trendUp ? <TrendingUp aria-hidden="true" /> : <TrendingDown aria-hidden="true" />)}
          Local formation
        </div>
        <p>
          <b>{data.totalCount} new business{data.totalCount === 1 ? "" : "es"}</b> opened within a mile in the past year,
          led by <b>{topMix.toLowerCase()}</b>.
          {priorKnown ? ` That is ${Math.abs(data.changePct || 0)}% ${trendUp ? "above" : "below"} the prior 12-month period.` : " There is no prior-period baseline for a percentage comparison."}
        </p>
      </div>

      <KypSubhead className="fam-green" subsection={1}>
        <span className="lbl">License mix</span>
        <span className="ct">distinct businesses · select to filter openings</span>
        <span className="rule" />
      </KypSubhead>
      <div className="kyp-biz-mix">
        {rankedMix.slice(0, 8).map(([label, count]) => {
          const active = filter === label;
          return (
            <button key={label} type="button" className={`kyp-hbar${active ? " active" : ""}`} onClick={() => { setFilter(active ? null : label); setShowAll(false); }}>
              <span className="hl"><span className="kyp-liccat">{label.replace(/ only$/, "")}</span></span>
              <span className="htrack"><i className="ind" style={{ width: `${(count / maxMix) * 100}%` }}><b className="hbar-count">{count}</b></i></span>
            </button>
          );
        })}
        {rankedMix.length > 8 && <div className="kyp-biz-overflow">+ {rankedMix.length - 8} smaller license mix{rankedMix.length - 8 === 1 ? "" : "es"} not shown</div>}
      </div>

      <KypSubhead className="fam-green" subsection={2}>
        <span className="lbl">{filter ? `${filtered.length} matching opening${filtered.length === 1 ? "" : "s"}` : `${establishments.length} openings`}</span>
        <span className="ct">nearest first · each business counted once</span>
        <span className="rule" />
      </KypSubhead>
      <div className="kyp-biz-list">
        {visible.map((business, index) => {
          const earliest = business.licenses.reduce((oldest, license) => !oldest || license.startDate < oldest ? license.startDate : oldest, "");
          return (
            <article key={`${business.name}|${business.address}`} className="kyp-biz-card" data-testid={`row-license-${index}`}>
              <div>
                <b>{titleCaseBusiness(business.name)}</b>
                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${business.name}, ${business.address}, Chicago, IL`)}`} target="_blank" rel="noreferrer">{titleCaseBusiness(business.address)}</a>
              </div>
              <span className="kyp-biz-distance">{business.distanceMiles.toFixed(2)} mi</span>
              <div className="kyp-biz-cardmeta">
                {business.licenses.map((license) => <span className="kyp-liccat" key={`${license.licenseType}-${license.startDate}`}>{license.licenseType}</span>)}
                {earliest && <span>Issued {monthYear(earliest)}</span>}
              </div>
            </article>
          );
        })}
      </div>
      {filtered.length > 6 && (
        <button type="button" className="kyp-morelink no-print" onClick={() => setShowAll((current) => !current)}>
          {showAll ? "Show fewer openings ↑" : `Show all ${filtered.length} openings →`}
        </button>
      )}
      <div className="kyp-src">
        Source: Chicago Business Licenses. New issuances only, 1-mile radius, past 12 months. Businesses are grouped by business name and normalized street address, so multiple licenses at one establishment count once.
      </div>
    </div>
  );
}