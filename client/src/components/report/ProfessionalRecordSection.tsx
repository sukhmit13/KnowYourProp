import React from "react";
import type { ProfessionalEntry, ProfessionalRecord, ProfessionKey } from "@shared/professionalRecord";
import { KypSubhead } from "./AccordionSection";

interface ProfessionalRecordSectionProps {
  data?: ProfessionalRecord;
  loading?: boolean;
  error?: boolean;
}

const GROUPS: Array<{ key: ProfessionKey; label: string; note?: string }> = [
  { key: "contractors", label: "Contractors" },
  { key: "design", label: "Architects & Engineers" },
  { key: "expediters", label: "Permit Expediters" },
  { key: "zoningAttorneys", label: "Zoning Attorneys", note: "outcome as the Zoning Board of Appeals recorded it" },
  { key: "taxAttorneys", label: "Tax Appeal Attorneys", note: "outcome as the Board of Review recorded it" },
  { key: "lenders", label: "Lenders", note: "parties with a claim, not hired work" },
];

function formatLastSeen(entry: ProfessionalEntry): string {
  const value = entry.lastSeen?.trim();
  if (!value) return "—";
  const year = value.match(/^(\d{4})/)?.[1];
  if (!year) return "—";
  if (entry.lastSeenPrecision === "year") return year;
  const month = value.match(/^\d{4}-(\d{2})/)?.[1];
  if (!month || Number(month) < 1 || Number(month) > 12) return "—";
  if (entry.lastSeenPrecision === "month") {
    return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" })
      .format(new Date(Date.UTC(Number(year), Number(month) - 1, 1)));
  }
  const day = value.match(/^\d{4}-\d{2}-(\d{2})/)?.[1];
  if (!day || Number(day) < 1 || Number(day) > 31) return "—";
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (parsed.getUTCDate() !== Number(day)) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  }).format(parsed);
}

function yearSpan(data: ProfessionalRecord): string {
  if (data.firstYear == null || data.lastYear == null) return "—";
  return data.firstYear === data.lastYear
    ? String(data.firstYear)
    : `${data.firstYear}–${data.lastYear}`;
}

function hasPartialCoverage(data: ProfessionalRecord): boolean {
  return Object.values(data.sourceCoverage ?? {}).some(({ status }) => status !== "available");
}

export function ProfessionalRecordSection({
  data,
  loading = false,
  error = false,
}: ProfessionalRecordSectionProps) {
  const groups = data
    ? GROUPS.map((group) => ({
      ...group,
      entries: (data.groups.find(({ key }) => key === group.key)?.entries ?? [])
        .slice()
        .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen)),
    })).filter(({ entries }) => entries.length > 0)
    : [];
  const status = loading && !data
    ? "Professional records are loading."
    : error && !data
      ? "Professional records could not be loaded."
      : error && data
        ? "Refresh failed; showing the available record data."
      : data && hasPartialCoverage(data)
        ? "Coverage is partial; some source records may be unavailable."
        : data && groups.length === 0
          ? "No professional entries are available in this record."
          : null;
  const partialCoverage = data ? hasPartialCoverage(data) : false;

  if (!data) {
    return (
      <div id="print-section-professional-record" className="kyp-professional-record" aria-live="polite">
        {loading && !error ? (
          <div className="kyp-body" role="status">
            <div className="kyp-biz-loading" aria-hidden="true"><span /></div>
            {status}
          </div>
        ) : (
          <div className="kyp-body" role={error ? "alert" : "status"}>
            {status ?? "Professional records are not available."}
          </div>
        )}
      </div>
    );
  }

  const span = yearSpan(data);
  return (
    <div id="print-section-professional-record" className="kyp-professional-record">
      {status && <div className="kyp-body" role="status">{status}</div>}
      <div className="kyp-blocks">
        <div className="kyp-block ind">
          <div className="bv">{partialCoverage && data.totalNames === 0 ? "—" : data.totalNames}</div>
          <div className="bl">Name{data.totalNames === 1 ? "" : "s"} on record</div>
          <div className="bd">permits, zoning, liens and tax appeals</div>
        </div>
        <div className="kyp-block slate">
          <div className="bv">{partialCoverage && data.groupCount === 0 ? "—" : data.groupCount}</div>
          <div className="bl">Profession{data.groupCount === 1 ? "" : "s"} represented</div>
          <div className="bd">a profession with no record is not shown</div>
        </div>
        <div className="kyp-block slate">
          <div className="bv txt">{span}</div>
          <div className="bl">Years covered</div>
          <div className="bd">
            {data.firstYear == null || data.lastYear == null
              ? "filing years not fully available"
              : data.firstYear === data.lastYear
                ? "one filing year on record"
                : "earliest and latest filing"}
          </div>
        </div>
      </div>
      {groups.map((group, index) => (
        <section key={group.key} aria-label={group.label}>
          <KypSubhead subsection={index + 1}>
            <span className="lbl">{group.label}</span>
            <span className="ct">
              {group.entries.length} name{group.entries.length === 1 ? "" : "s"} · {group.note ?? "most recent first"}
            </span>
          </KypSubhead>
          <div className="kyp-biz-list pro">
            {group.entries.map((entry) => (
              <div className="kyp-biz-card pro" key={entry.key}>
                <div className="kyp-professional-identity">
                  {entry.discoveryUrl
                    ? <a className="nm" href={entry.discoveryUrl}><b>{entry.name}</b><span className="ext">↗</span></a>
                    : <b>{entry.name}</b>}
                  <span className="addr">{entry.firm ? `${entry.role} · ${entry.firm}` : entry.role}</span>
                </div>
                <span className="kyp-biz-distance">{formatLastSeen(entry)}</span>
                <div className="kyp-biz-cardmeta">
                  {entry.position && <span className="kyp-pill ind">{entry.position}</span>}
                  {entry.outcome && <span className="kyp-pill ind">{entry.outcome}</span>}
                  {entry.tag && <span className="kyp-tag rec">{entry.tag}</span>}
                  {entry.facts.slice(0, 2).map((fact, factIndex) => (
                    <span className="f" key={`${fact}-${factIndex}`}>{fact}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
      <div className="kyp-src">
        <p>Sources: Chicago Building Permits (contact fields), Chicago DPD zoning applications, Zoning Board of Appeals, Cook County Recorder, Cook County Board of Review tax appeal records. Names are normalized before grouping, so one firm filed under several spellings appears once.</p>
      </div>
    </div>
  );
}