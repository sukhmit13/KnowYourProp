import { Fragment, type ReactNode, type MouseEvent } from "react";
import { KypSubhead } from "@/components/report/AccordionSection";
import type { CorridorLicenseComparison } from "@shared/corridorLicenseComparison";

export interface CorrLicense {
  name: string;
  address: string;
  date: string | null;
  tags: string[];
}

export interface CorrConstruction {
  address: string;
  date: string | null;
  use: string | null;
  stories: number | null;
  units: number | null;
  parking: number | null;
  cost: number | null;
  distanceMi: number | null;
  architect: string | null;
  gc: string | null;
  cityClass: string | null;
}

export interface CorrCoverage {
  title: string;
  url: string;
  source: string;
  date: string | null;
  summary: string;
}

export interface CorrZoning {
  address: string;
  kind: string;
  zone: string | null;
  caseNo: string | null;
  date: string | null;
  status: string;
  distanceMi: number | null;
  use: string;
}

export interface CorrDpdApplication {
  address: string;
  applicationType: string;
  applicant: string | null;
  status: string;
  hearingDate: string | null;
  proposal: string;
  applicationUrl: string | null;
  hearingUrl: string;
  distanceMi: number | null;
}

export interface CorridorCounts {
  licenses: number | null;
  permits: number | null;
  zoningAppeals: number | null;
  dpdApplications: number | null;
  articles: number | null;
}

export interface CorridorCardData {
  key: string;
  name: string;
  tier: number;
  tierLabel: string;
  distanceMi: number;
  onCorridor: boolean;
  blurb: string;
  licenses: CorrLicense[];
  construction: CorrConstruction[];
  coverage: CorrCoverage[];
  zoning: CorrZoning[];
  dpdApplications: CorrDpdApplication[];
  counts?: CorridorCounts;
  licenseComparison?: CorridorLicenseComparison | null;
}

export interface CorridorKpis {
  permits: number | null;
  permitUnits: string | null;
  licenses: number | null;
  articles: number | null;
  zoningAppeals: number | null;
  dpdApplications: number | null;
}

export type CorridorSourceStatus = "loading" | "unavailable" | "partial";
export type CorridorSourceKey = keyof CorridorCounts;

interface CorridorIntelligenceViewProps {
  kpis: CorridorKpis;
  corridors: CorridorCardData[];
  licensesLoading?: boolean;
  sourceCoverage?: Partial<Record<CorridorSourceKey, CorridorSourceStatus>>;
  renderNewsArticle?: (article: CorrCoverage, testid: string) => ReactNode;
}

const countLabel = (value: number | null) => value == null ? "—" : String(value);
const fmtCost = (amount: number) =>
  amount >= 1_000_000
    ? `$${(amount / 1_000_000).toFixed(1)}M`
    : amount >= 1_000
      ? `$${Math.round(amount / 1_000)}K`
      : `$${amount.toLocaleString()}`;
const monthLabel = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", year: "numeric" });

function revealAnchor(event: MouseEvent<HTMLAnchorElement>, id: string) {
  event.preventDefault();
  window.dispatchEvent(new CustomEvent("kyp-reveal-anchor", { detail: id }));
}

function ReportAnchor({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} onClick={(event) => revealAnchor(event, href.slice(1))}>
      {children}
    </a>
  );
}

function discoveryHref(role: "architect" | "gc", name: string) {
  const query = new URLSearchParams({
    view: role === "architect" ? "architect-rankings" : "gc-rankings",
    search: name,
  });
  return `/discovery?${query.toString()}`;
}

function CompactCountBlock({
  value,
  label,
  detail,
  tone = "slate",
}: {
  value: number | null;
  label: string;
  detail: string;
  tone?: "ind" | "slate";
}) {
  return (
    <div className={`kyp-block ${tone}`}>
      <div className="bv">{countLabel(value)}</div>
      <div className="bl">{label}</div>
      <div className="bd">{detail}</div>
    </div>
  );
}

function getCount(corridor: CorridorCardData, key: CorridorSourceKey): number | null {
  if (corridor.counts !== undefined) return corridor.counts[key];
  const legacyArrays: Record<CorridorSourceKey, number> = {
    licenses: corridor.licenses.length,
    permits: corridor.construction.length,
    zoningAppeals: corridor.zoning.length,
    dpdApplications: corridor.dpdApplications.length,
    articles: corridor.coverage.length,
  };
  return legacyArrays[key];
}

function sourceNote(status: CorridorSourceStatus | undefined) {
  if (status === "loading") return "Loading";
  if (status === "unavailable") return "Source unavailable";
  if (status === "partial") return "Partial source coverage";
  return null;
}

export default function CorridorIntelligenceView({
  kpis,
  corridors,
  licensesLoading = false,
  sourceCoverage,
  renderNewsArticle,
}: CorridorIntelligenceViewProps) {
  const sorted = corridors.slice().sort((a, b) => {
    const distanceA = a.onCorridor ? 0 : a.distanceMi;
    const distanceB = b.onCorridor ? 0 : b.distanceMi;
    return distanceA - distanceB || a.name.localeCompare(b.name);
  });

  const licenseIsLoading = licensesLoading || sourceCoverage?.licenses === "loading";
  const licenseStatus = licenseIsLoading ? "loading" : sourceCoverage?.licenses;
  const licenseTotal = licenseIsLoading ? null : kpis.licenses;

  return (
    <div data-testid="corridor-intelligence">
      <div className="kyp-blocks five" data-testid="corridor-kpis">
        <CompactCountBlock
          value={kpis.permits}
          label="New construction permits"
          detail={sourceNote(sourceCoverage?.permits) ?? `${kpis.permitUnits ? `${kpis.permitUnits} · ` : ""}via City Building Permits`}
          tone="ind"
        />
        <CompactCountBlock
          value={licenseTotal}
          label="Businesses with new licenses"
          detail={sourceNote(licenseStatus) ?? "last 12 mo"}
        />
        <CompactCountBlock
          value={kpis.articles}
          label="News articles"
          detail={`${sourceNote(sourceCoverage?.articles) ?? "Retrieved coverage"} · past 12 months`}
        />
        <CompactCountBlock
          value={kpis.zoningAppeals}
          label="Zoning appeals"
          detail={sourceNote(sourceCoverage?.zoningAppeals) ?? "decisions & hearings"}
        />
        <CompactCountBlock
          value={kpis.dpdApplications}
          label="DPD applications"
          detail={sourceNote(sourceCoverage?.dpdApplications) ?? "Plan Commission"}
        />
      </div>

      {sorted.map((corridor, index) => {
        const licensesCount = licenseIsLoading ? null : getCount(corridor, "licenses");
        const permitsCount = getCount(corridor, "permits");
        const zoningCount = getCount(corridor, "zoningAppeals");
        const dpdCount = getCount(corridor, "dpdApplications");
        const rowClass = "kyp-corrrow";
        const itemId = (type: string, itemIndex: number) => `corridor-${type}-${corridor.key}-${itemIndex}`;
        const statusFor = (key: CorridorSourceKey) =>
          key === "licenses" && licenseIsLoading ? "loading" : sourceCoverage?.[key];

        return (
          <div className="subwrap" key={corridor.key} data-testid={`corridor-card-${corridor.key}`}>
            <KypSubhead className={index === 0 ? "first" : undefined}>
              <span className="lbl">{corridor.name}</span>
              <span className="ct">
                Tier {corridor.tier} · {corridor.tierLabel} · {corridor.onCorridor ? "on corridor" : `${corridor.distanceMi} mi`}
              </span>
            </KypSubhead>
            {corridor.blurb && <div className="kyp-corrblurb">{corridor.blurb}</div>}

            <div className="kyp-twocol">
              <div>
                <div className="kyp-corrcolh">
                  Businesses with new licenses
                  <ReportAnchor href="#section-new-business-licenses">all {countLabel(licensesCount)} →</ReportAnchor>
                </div>
                {corridor.licenses.length > 0 ? corridor.licenses.map((license, itemIndex) => (
                  <div className={rowClass} key={itemId("license", itemIndex)} data-testid={itemId("license", itemIndex)}>
                    <span className="m"><ReportAnchor href="#section-new-business-licenses">{license.name}</ReportAnchor></span>
                    <span className="r">{license.date ?? ""}</span>
                    <span className="x">{license.address}</span>
                    {license.tags.length > 0 && (
                      <span className="x">
                        {license.tags.map((tag, tagIndex) => <span className="kyp-liccat" key={`${tag}-${tagIndex}`}>{tag}</span>)}
                      </span>
                    )}
                  </div>
                )) : (
                  <div className="kyp-corrrow"><span className="x">{sourceNote(statusFor("licenses")) ?? "No corridor-matched records returned."}</span></div>
                )}
              </div>

              <div>
                <div className="kyp-corrcolh">
                  New construction
                  <ReportAnchor href="#development-permits">all {countLabel(permitsCount)} →</ReportAnchor>
                </div>
                {corridor.construction.length > 0 ? corridor.construction.map((permit, itemIndex) => {
                  const permitFacts = [
                    permit.use,
                    permit.units != null ? `${permit.units} units` : null,
                    permit.stories != null ? `${permit.stories}-story` : null,
                    permit.parking != null ? `${permit.parking} parking` : null,
                    permit.cost != null ? fmtCost(permit.cost) : null,
                    permit.distanceMi != null ? `${permit.distanceMi} mi` : null,
                  ].filter(Boolean);
                  return (
                    <div className={rowClass} key={itemId("permit", itemIndex)} data-testid={itemId("permit", itemIndex)}>
                      <span className="m"><ReportAnchor href="#development-permits">{permit.address}</ReportAnchor></span>
                      <span className="r">{permit.date ?? ""}</span>
                      {permitFacts.length > 0 && <span className="x">{permitFacts.join(" · ")}</span>}
                      {(permit.architect || permit.gc) && (
                        <span className="x">
                          {permit.architect && (
                            <span className="kyp-pro"><i>Arch.</i><a href={discoveryHref("architect", permit.architect)}>{permit.architect}</a></span>
                          )}
                          {permit.gc && (
                            <span className="kyp-pro"><i>GC</i><a href={discoveryHref("gc", permit.gc)}>{permit.gc}</a></span>
                          )}
                        </span>
                      )}
                    </div>
                  );
                }) : (
                  <div className="kyp-corrrow"><span className="x">{sourceNote(statusFor("permits")) ?? "No corridor-matched records returned."}</span></div>
                )}
              </div>
            </div>

            {corridor.licenseComparison ? (
              <div className="kyp-corrsec" data-testid={`corridor-license-comparison-${corridor.key}`}>
                <div className="kyp-charttitle">
                  License issuance comparison{" "}
                  <i>
                    Latest 12mo: {monthLabel(corridor.licenseComparison.current.start)}–{monthLabel(corridor.licenseComparison.current.end)}
                    {" · "}Prior 12mo: {monthLabel(corridor.licenseComparison.prior.start)}–{monthLabel(corridor.licenseComparison.prior.end)}
                  </i>
                </div>
                <div
                  className="kyp-ledger cmp"
                  role="table"
                  aria-label={`License issuance counts for ${corridor.name}: latest 12 months compared with prior 12 months`}
                >
                  <div className="kyp-lrow lhead" role="row">
                    <div className="l" role="columnheader">Measure</div>
                    <div className="v" role="columnheader">Latest 12mo</div>
                    <div className="v" role="columnheader">Prior 12mo</div>
                  </div>
                  {([
                    ["Businesses with new licenses", "businessesWithNewLicenses"],
                    ["License issuances", "licenseIssuances"],
                    ["Licensed addresses", "licensedAddresses"],
                    ["Previously unseen addresses", "previouslyUnseenAddresses"],
                    ["Recurring businesses", "recurringBusinesses"],
                    ["Different names at known addresses", "differentNamesAtKnownAddresses"],
                  ] as const).map(([label, key]) => (
                    <div className="kyp-lrow" role="row" key={key}>
                      <div className="l" role="rowheader">{label}</div>
                      <div className="v" role="cell">{corridor.licenseComparison!.current[key].toLocaleString()}</div>
                      <div className="v" role="cell">{corridor.licenseComparison!.prior[key].toLocaleString()}</div>
                    </div>
                  ))}
                </div>
                {corridor.licenseComparison.possibleTurnover.length > 0 && (
                  <div className="x" style={{ marginTop: 8 }} data-testid={`corridor-license-name-changes-${corridor.key}`}>
                    <b>Possible name changes at known addresses</b>
                    {corridor.licenseComparison.possibleTurnover.map((entry, entryIndex) => (
                      <div key={`${entry.address}-${entry.name}-${entryIndex}`}>
                        {entry.name} · {entry.address} <span aria-label="previously listed as">(previously: {entry.previousNames.join(", ")})</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="kyp-src">
                  <p>Describes license issuances on this corridor within 1 mile, not this address. End dates are exclusive.</p>
                  <p>Gross issuances, not net growth. <b>Previously unseen</b> means no matching address in the preceding 12 months of issue history, not a confirmed opening; <b>different names at a known address</b> may be turnover or a renaming, and closures are not verified.</p>
                </div>
              </div>
            ) : (
              <div className="kyp-corrrow" data-testid={`corridor-license-comparison-unavailable-${corridor.key}`}>
                <span className="x">{licenseIsLoading ? "Loading historical license comparison…" : "Historical license comparison unavailable."}</span>
              </div>
            )}

            {corridor.zoning.length > 0 && (
              <div className="kyp-corrsec">
                <div className="kyp-corrcolh">
                  Zoning activity
                  <ReportAnchor href="#development-zba">all {countLabel(zoningCount)} →</ReportAnchor>
                </div>
                {corridor.zoning.map((zoning, itemIndex) => (
                  <div className={rowClass} key={itemId("zoning", itemIndex)} data-testid={itemId("zoning", itemIndex)}>
                    <span className="m"><ReportAnchor href="#development-zba">{zoning.address}</ReportAnchor></span>
                    <span className="r">{zoning.date ?? ""}</span>
                    <span className="x">{[zoning.kind, zoning.zone, zoning.status].filter(Boolean).join(" · ")}</span>
                  </div>
                ))}
              </div>
            )}

            {corridor.dpdApplications.length > 0 && (
              <div className="kyp-corrsec">
                <div className="kyp-corrcolh">
                  DPD applications
                  <ReportAnchor href="#development-proposed">all {countLabel(dpdCount)} →</ReportAnchor>
                </div>
                {corridor.dpdApplications.map((application, itemIndex) => (
                  <div className={rowClass} key={itemId("dpd", itemIndex)} data-testid={itemId("dpd", itemIndex)}>
                    <span className="m"><ReportAnchor href="#development-proposed">{application.address}</ReportAnchor></span>
                    <span className="r">{application.hearingDate ?? ""}</span>
                    <span className="x">{[application.applicationType, application.status].filter(Boolean).join(" · ")}</span>
                  </div>
                ))}
              </div>
            )}

            {corridor.coverage.length > 0 && (
              <div className="kyp-corrsec">
                <div className="kyp-corrcolh">Corridor coverage</div>
                {corridor.coverage.map((article, itemIndex) => {
                  const testid = itemId("coverage", itemIndex);
                  return renderNewsArticle ? (
                    <Fragment key={testid}>{renderNewsArticle(article, testid)}</Fragment>
                  ) : (
                    <div className="kyp-corrrow" key={testid} data-testid={testid}>
                      <span className="m"><a href={article.url} target="_blank" rel="noopener noreferrer">{article.title}</a></span>
                      <span className="r">{article.date ?? ""}</span>
                      <span className="x">{[article.source, article.summary].filter(Boolean).join(" · ")}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <div className="kyp-src" data-testid="corridor-footer">
        Describes commercial corridors within ~0.5 mi of this address, measured to each corridor’s nearest point, not parcel-specific conditions. <b>Tier 1</b> = primary commercial corridor · <b>Tier 2</b> = secondary or emerging. Every matched record is listed once; each business, permit, zoning, and DPD name/address links to its full record in the owning section. Permits, licenses and zoning activity are searched within 1 mile of the property; DPD applications within 0.5 mile. Permit records begin January 1, {new Date().getFullYear() - 3}; the unit estimate uses only permits issued within 18 months, deduplicated by address, and is estimated from descriptions—not proof of active construction. Permit-row distances are measured from the property. Licenses cover the past 12 months; dates shown are license term starts. Businesses are grouped by name and address; established businesses may receive additional licenses, so a new license does not confirm a new opening. Historical comparisons count ISSUE-only records for selected food, liquor, entertainment, manufacturing, hotel, and art license types; term-start dates define the windows and businesses are grouped by name and address. Coverage and operating status may be partial. These issuance counts do not measure net operating-business growth: closures and renewals are not measured. Names changing at an address are possible turnover, not verified closures or replacements; previously unseen addresses were not seen in the preceding 12 months of issue history, not confirmed new locations. News covers the past 12 months; retrieved feeds and search results do not establish complete archives or a news-volume trend. Zoning includes recent decisions and upcoming hearings; DPD records are applications, not approvals. Partial feeds show observed records only; missing counts remain unknown. Unlocated corridor news is associated by reporting text, not a verified parcel location. Permit costs are reported estimates, not completed construction costs. Sources: City Building Permits · Chicago Business Licenses · Zoning Board of Appeals · Chicago DPD Plan Commission · Block Club · Curbed · local news.
      </div>
    </div>
  );
}