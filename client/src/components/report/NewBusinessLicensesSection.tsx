import { useMemo, useState } from "react";
import {
  groupLicenseEstablishments,
  titleCaseBusiness,
  type NearbyLicensesResponse,
} from "@shared/businessLicenses";
import { licenseComparisonKey } from "@shared/corridorLicenseComparison";
import { KypSubhead } from "@/components/report/AccordionSection";
import { REPORT_SECTION_TITLES } from "@/components/report/sectionRegistry";

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
  const [historyFilter, setHistoryFilter] = useState<"all" | "unseen" | "different-names" | "recurring" | "unclassified">("all");
  const establishments = useMemo(() => groupLicenseEstablishments(data?.licenses || []), [data?.licenses]);
  const rankedMix = useMemo(() => {
    const counts = new Map<string, number>();
    establishments.forEach((business) => counts.set(business.comboLabel, (counts.get(business.comboLabel) || 0) + 1));
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [establishments]);
  const comparison = data?.issuanceComparison;

  if (isLoading) {
    return <div className="kyp-biz-loading" aria-live="polite" aria-label={REPORT_SECTION_TITLES.newBusinessLicenses}><span /><span /><span /></div>;
  }
  if (isError) {
    return <div className="kyp-status-empty unknown">New license issuance records could not be loaded. The result is unknown rather than zero.</div>;
  }
  if (!data) {
    return <div className="kyp-status-empty unknown">New license issuance records are unavailable. The result is unknown rather than zero.</div>;
  }

  const maxMix = rankedMix[0]?.[1] || 1;
  const currentObservations = new Map((comparison?.currentObservations || []).map((observation) => [observation.key, observation]));
  const classificationFor = (business: (typeof establishments)[number]) => {
    if (!comparison) return { kind: "unclassified" as const, label: "History unavailable", previousNames: [] as string[] };
    const observation = currentObservations.get(licenseComparisonKey({
      businessName: business.name,
      address: business.address,
    }));
    if (!observation) return { kind: "unclassified" as const, label: "History unclassified", previousNames: [] as string[] };
    switch (observation.kind) {
      case "recurring":
        return { kind: "recurring" as const, label: "Additional license for previously observed business", previousNames: observation.previousNames };
      case "possible-turnover":
        return { kind: "different-names" as const, label: "Different name at known address", previousNames: observation.previousNames };
      case "previously-unseen-address":
        return { kind: "unseen" as const, label: "Previously unseen licensed address", previousNames: observation.previousNames };
      case "new-name-at-shared-address":
        return { kind: "different-names" as const, label: "Different name at known address", previousNames: observation.previousNames };
    }
  };
  const hasUnclassified = establishments.some((business) => classificationFor(business).kind === "unclassified");
  const historyOptions = [
    { value: "all" as const, label: "All businesses" },
    ...(comparison ? [
      { value: "unseen" as const, label: "Previously unseen addresses" },
      { value: "different-names" as const, label: "Different names at known addresses" },
      { value: "recurring" as const, label: "Recurring businesses" },
    ] : []),
    ...(hasUnclassified ? [{ value: "unclassified" as const, label: "History unclassified" }] : []),
  ];
  const matchingHistoryCount = (kind: typeof historyFilter) =>
    kind === "all" ? establishments.length : establishments.filter((business) => classificationFor(business).kind === kind).length;
  const filtered = establishments.filter((business) =>
    (!filter || business.comboLabel === filter)
    && (historyFilter === "all" || classificationFor(business).kind === historyFilter),
  );
  const visible = showAll ? filtered : filtered.slice(0, 6);
  const hasActiveFilters = Boolean(filter) || historyFilter !== "all";
  const currentPeriodLabel = comparison
    ? `${monthYear(comparison.current.start)}–${monthYear(comparison.current.end)}`
    : "past 12 months";
  const priorPeriodLabel = comparison
    ? `${monthYear(comparison.prior.start)}–${monthYear(comparison.prior.end)}`
    : "prior 12 months";

  return (
    <div id="print-section-new-business-licenses" className="kyp-biz" data-testid="card-business-licenses">
      <div className="kyp-biz-topline">
        <span className="kyp-biz-radius">1 mile · past 12 months · new issuances only</span>
      </div>

      <div className="kyp-blocks kyp-biz-heroes">
        {comparison ? (
          <>
            <div className="kyp-block grn">
              <div className="bv">{comparison.current.previouslyUnseenAddresses}</div>
              <div><div className="bl">Previously unseen licensed addresses</div><div className="bd">distinct addresses absent from prior 12-month ISSUE records</div></div>
            </div>
            <div className="kyp-block ind">
              <div className="bv">{comparison.current.recurringBusinesses}</div>
              <div>
                <div className="bl">Recurring businesses</div>
                <div className="bd">same name and address observed in prior-year ISSUE records</div>
              </div>
            </div>
            <div className="kyp-block slate">
              <div className="bv">{comparison.current.differentNamesAtKnownAddresses}</div>
              <div><div className="bl">Different names at known addresses</div><div className="bd">history signal; not confirmed replacements</div></div>
            </div>
          </>
        ) : (
          <>
            <div className="kyp-block grn">
              <div className="bv">{data.totalCount}</div>
              <div><div className="bl">Businesses with new licenses</div><div className="bd">distinct businesses · {currentPeriodLabel}</div></div>
            </div>
            <div className="kyp-block ind">
              <div className="bv">{data.licenseCount}</div>
              <div><div className="bl">License issuances</div><div className="bd">individual records · {currentPeriodLabel}</div></div>
            </div>
            <div className="kyp-block slate">
              <div className="bv">—</div>
              <div><div className="bl">Address history</div><div className="bd">History unavailable · no growth comparison</div></div>
            </div>
          </>
        )}
      </div>

      {comparison && (
        <div className="kyp-biz-annual" aria-label="Annual issuance comparison">
          <div className="kyp-biz-annual-label">
            Annual issuance comparison · Latest 12mo: {currentPeriodLabel} · Prior 12mo: {priorPeriodLabel}
          </div>
          <table>
            <thead>
              <tr>
                <th scope="col">Measure</th>
                <th scope="col">Latest 12mo</th>
                <th scope="col">Prior 12mo</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Businesses with new licenses</th>
                <td>{comparison.current.businessesWithNewLicenses}</td>
                <td>{comparison.prior.businessesWithNewLicenses}</td>
              </tr>
              <tr>
                <th scope="row">License issuances</th>
                <td>{comparison.current.licenseIssuances}</td>
                <td>{comparison.prior.licenseIssuances}</td>
              </tr>
              <tr>
                <th scope="row">Licensed addresses</th>
                <td>{comparison.current.licensedAddresses}</td>
                <td>{comparison.prior.licensedAddresses}</td>
              </tr>
              <tr>
                <th scope="row">Previously unseen licensed addresses</th>
                <td>{comparison.current.previouslyUnseenAddresses}</td>
                <td>{comparison.prior.previouslyUnseenAddresses}</td>
              </tr>
              <tr>
                <th scope="row">Recurring businesses</th>
                <td>{comparison.current.recurringBusinesses}</td>
                <td>{comparison.prior.recurringBusinesses}</td>
              </tr>
              <tr>
                <th scope="row">Different names at known addresses</th>
                <td>{comparison.current.differentNamesAtKnownAddresses}</td>
                <td>{comparison.prior.differentNamesAtKnownAddresses}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {establishments.length > 0 && (
        <>
          <KypSubhead className="fam-green" subsection={1}>
            <span className="lbl">History distinction</span>
            <span className="ct">names grouped by address · counts are businesses</span>
            <span className="rule" />
          </KypSubhead>
          <div className="kyp-biz-history">
            <div className="kyp-biz-filter-row" role="group" aria-label="Filter businesses by history distinction">
              {historyOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`kyp-biz-filter${historyFilter === option.value ? " active" : ""}`}
                  aria-pressed={historyFilter === option.value}
                  onClick={() => { setHistoryFilter(option.value); setShowAll(false); }}
                >
                  <span>{option.label}</span>
                  <b>{matchingHistoryCount(option.value)}</b>
                </button>
              ))}
            </div>
            <p className="kyp-biz-history-note">Counts are names grouped by address; absence from prior-year ISSUE records does not prove a business opened.</p>
            {hasActiveFilters && (
              <button type="button" className="kyp-biz-clear no-print" onClick={() => { setFilter(null); setHistoryFilter("all"); setShowAll(false); }}>
                Clear filters
              </button>
            )}
          </div>

          <KypSubhead className="fam-green" subsection={2}>
            <span className="lbl">License mix</span>
            <span className="ct">distinct businesses · select to filter</span>
            <span className="rule" />
          </KypSubhead>
          <div>
            <div className="kyp-biz-mix">
              {rankedMix.slice(0, 8).map(([label, count]) => {
                const active = filter === label;
                return (
                  <button key={label} type="button" className={`kyp-hbar${active ? " active" : ""}`} aria-pressed={active} onClick={() => { setFilter(active ? null : label); setShowAll(false); }}>
                    <span className="hl"><span className="kyp-liccat">{label.replace(/ only$/, "")}</span></span>
                    <span className="htrack"><i className="ind" style={{ width: `${(count / maxMix) * 100}%` }}><b className="hbar-count">{count}</b></i></span>
                  </button>
                );
              })}
              {rankedMix.length > 8 && <div className="kyp-biz-overflow">+ {rankedMix.length - 8} smaller license mix{rankedMix.length === 1 ? "" : "es"} not shown</div>}
            </div>
          </div>
        </>
      )}

      <KypSubhead className="fam-green" subsection={establishments.length > 0 ? 3 : 1}>
        <span className="lbl">{hasActiveFilters ? `${filtered.length} matching business${filtered.length === 1 ? "" : "es"}` : `${establishments.length} business${establishments.length === 1 ? "" : "es"} with new licenses`}</span>
        <span className="ct">nearest first · each business counted once</span>
        <span className="rule" />
      </KypSubhead>
      <div>
        {establishments.length === 0 ? (
          <div className="kyp-status-empty">No qualifying new license issuances were found within 1 mile in the current 12-month period. {comparison ? "Prior-period history is shown above; current observations: 0." : "Historical comparison is unavailable."} This does not establish whether new businesses opened.</div>
        ) : filtered.length === 0 ? (
          <div className="kyp-status-empty">No current businesses match these history and license mix filters. Use Clear filters to show all businesses.</div>
        ) : (
          <div className="kyp-biz-list">
            {visible.map((business, index) => {
              const earliest = business.licenses.reduce((oldest, license) => !oldest || license.startDate < oldest ? license.startDate : oldest, "");
              const classification = classificationFor(business);
              return (
                <article key={`${business.name}|${business.address}`} className="kyp-biz-card" data-testid={`row-license-${index}`}>
                  <div>
                    <b>{titleCaseBusiness(business.name)}</b>
                    <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${business.name}, ${business.address}, Chicago, IL`)}`} target="_blank" rel="noreferrer">{titleCaseBusiness(business.address)}</a>
                  </div>
                  <span className="kyp-biz-distance">{business.distanceMiles.toFixed(2)} mi</span>
                  <div className="kyp-biz-cardmeta">
                    <span>{classification.label}</span>
                    {classification.previousNames.length > 0 && <span>Previously recorded: {classification.previousNames.map(titleCaseBusiness).join(", ")}</span>}
                    {business.corridor && <span className="kyp-corridor">{business.corridor.name}</span>}
                    {business.licenses.map((license) => <span className="kyp-liccat" key={`${license.licenseType}-${license.startDate}`}>{license.licenseType}</span>)}
                    {earliest && <span>License start {monthYear(earliest)}</span>}
                  </div>
                </article>
              );
            })}
          </div>
        )}
        {filtered.length > 6 && (
          <button type="button" className="kyp-morelink no-print" onClick={() => setShowAll((current) => !current)}>
            {showAll ? "Show fewer businesses ↑" : `Show all ${filtered.length} businesses →`}
          </button>
        )}
        <div className="kyp-src">
          Source: Chicago Business Licenses, AAI issued records; ISSUE initial license applications only, renewals excluded. Selected food, liquor, entertainment, manufacturing, hotel, and art license types within 1 mile. Same corridor logic uses equal annual 12-month windows and a preceding 12-month lookback; records are fetched across three years. Businesses are grouped by name and normalized street address, so multiple licenses at one establishment count once. Same-address name changes may reflect a replacement, rename, or co-tenancy; they do not confirm any of those or establish net growth. Unseen in prior-year issuances does not prove a new opening; there is no closure census. Dates shown are license term start dates.
        </div>
      </div>
    </div>
  );
}