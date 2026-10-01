import React, { useContext, useMemo } from "react";
import { KypSubhead, SectionNumberContext } from "@/components/report/AccordionSection";
import { NewConstructionSection } from "@/components/report/NewConstructionSection";

type Props = {
  pipelineData?: any;
  pipelineLoading?: boolean;
  pipelineError?: boolean;
  permitData?: any;
  permitLoading: boolean;
  permitError: boolean;
  dpdData?: any;
  dpdLoading?: boolean;
  dpdError?: boolean;
  zbaData?: any;
  zbaLoading: boolean;
  zbaError?: boolean;
  radiusMi: 0.5 | 1;
  onRadiusChange: (radius: 0.5 | 1) => void;
  renderLogo: (item: any) => React.ReactNode;
  ward?: number | null;
  lat?: number | null;
  lon?: number | null;
  subjectUnits?: number | null;
};

const dateLabel = (date?: string) => {
  if (!date) return "";
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};
const fmtCount = (n: unknown) => typeof n === "number" && Number.isFinite(n) ? n.toLocaleString() : "—";
const gmaps = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${address}, Chicago, IL`)}`;
const statusFor = (item: any) => item.status || item.pipelineStage || "Coverage";
const titleCase = (value: string) => value.replace(/_/g, " ").replace(/\b\w/g, (s) => s.toUpperCase());
const safeExternalUrl = (value?: string) => {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? value : undefined;
  } catch {
    return undefined;
  }
};

function PermitPipeline({ data, loading, error }: { data?: any; loading?: boolean; error?: boolean }) {
  const pipeline = data?.pipeline;
  const permitsCoverage = pipeline?.sourceCoverage?.permits || data?.sourceCoverage?.permits;
  const applicationCoverage = pipeline?.sourceCoverage?.dpdApplications || data?.sourceCoverage?.dpdApplications;
  const zoningCoverage = pipeline?.sourceCoverage?.zbaActivity || data?.sourceCoverage?.zbaActivity;
  const permitsUnknown = !pipeline || permitsCoverage?.status === "unavailable"
    || (permitsCoverage?.status !== "available" && permitsCoverage?.status !== "partial"
      && typeof pipeline.unitsUnderConstruction !== "number");
  const observedApplications = typeof pipeline?.potentialUnits !== "number" && typeof pipeline?.observedPotentialUnits === "number";
  const observedCommercial = typeof pipeline?.commercialProposals !== "number" && typeof pipeline?.observedCommercialProposals === "number";
  const potential = observedApplications ? pipeline.observedPotentialUnits : pipeline?.potentialUnits;
  const commercial = observedCommercial ? pipeline.observedCommercialProposals : pipeline?.commercialProposals;
  const applicationSourcesIncomplete = [permitsCoverage, applicationCoverage, zoningCoverage].some((coverage) => coverage?.status === "unavailable" || coverage?.status === "partial");
  const applicationsUnknown = !pipeline || permitsUnknown || typeof potential !== "number"
    || (!observedApplications && applicationSourcesIncomplete);
  const units = typeof pipeline?.unitsUnderConstruction === "number" ? pipeline.unitsUnderConstruction
    : pipeline?.observedUnitsUnderConstruction > 0 ? pipeline.observedUnitsUnderConstruction : null;
  const unknownPermitUnits = pipeline?.permitUnitsUnknownAddressCount || 0;
  const estimated = pipeline?.permitUnitsSource === "description";
  return <section id="development-pipeline">
    <div className="kyp-blocks pipeline" data-testid="development-pipeline" aria-live="polite">
      <div className="kyp-block ind"><div className="bv">{loading ? "…" : !permitsUnknown && typeof units === "number" ? `${estimated ? "~" : ""}${fmtCount(units)}` : "—"}</div><div className="bl">Units under construction</div><div className="bd">{loading ? "Loading nearby permit evidence" : !permitsUnknown && typeof pipeline.activePermitCount === "number" ? `across ${fmtCount(pipeline.activePermitCount)} permits issued within 18 months · from the permit record${estimated ? " · unit count estimated from permit descriptions" : ""}${unknownPermitUnits ? ` · units unknown at ${unknownPermitUnits} permitted address${unknownPermitUnits === 1 ? "" : "es"}; only readable counts shown` : ""}` : error || permitsUnknown ? "Permit source coverage is unknown; no count reported" : "18-month issued-permit proxy; construction activity is not verified"}</div></div>
      <div className="kyp-block slate"><div className="bv">{loading ? "…" : !applicationsUnknown && (!observedApplications || potential > 0) ? `~${fmtCount(potential)}` : "—"}</div><div className="bl">Potential future units</div><div className="bd">{applicationsUnknown ? "Application-source coverage is unknown; no count reported" : observedApplications ? `${potential === 0 ? "No readable units identified" : "Observed application estimates only"} · source coverage is incomplete; projects may be missing or at an earlier stage` : "proposed or seeking zoning relief at addresses with no permit yet · as stated in application text"}</div></div>
      <div className="kyp-block slate"><div className="bv">{loading ? "…" : !permitsUnknown && typeof commercial === "number" && (observedCommercial || !applicationSourcesIncomplete) && (!observedCommercial || commercial > 0) ? fmtCount(commercial) : "—"}</div><div className="bl">Commercial proposals</div><div className="bd">{typeof commercial !== "number" || permitsUnknown ? "Proposal-source coverage is unknown; no count reported" : observedCommercial ? `${commercial === 0 ? "No business-use cases identified in available records" : "Observed business-use cases only"} · source coverage is incomplete` : "special-use and map-amendment cases for business uses"}</div></div>
    </div>
    <p className="kyp-src pipefoot">Each address is counted once, at its furthest stage: an issued permit outranks a Plan Commission application, which outranks a zoning appeal. News coverage is never counted. <b>The two figures are not added together</b> — {estimated ? "the first is estimated from permit descriptions" : "the first comes from permit records"}, the second is read from application text and can be wrong where a headline figure covers more than one phase. An issued permit within 18 months is a proxy, not confirmation that construction is underway.{pipeline?.potentialAmbiguous ? " At least one application reports multiple possible unit counts; the potential figure is an estimate." : ""}</p>
  </section>;
}

function DpdPanel({ dpdData: data, dpdLoading: loading, dpdError: error, radiusMi, onRadiusChange }: Pick<Props, "dpdData" | "dpdLoading" | "dpdError" | "radiusMi" | "onRadiusChange">) {
  const applications = data?.dpdApplications || [];
  const coverage = data?.sourceCoverage?.dpdApplications || data?.pipeline?.sourceCoverage?.dpdApplications;
  const unknown = coverage?.status === "unavailable" || (!Array.isArray(data?.dpdApplications) && !loading);
  return <section id="development-proposed" aria-label="Proposed projects">
    <KypSubhead subsection={2}><span className="lbl">Proposed Projects</span><span className="ct">Plan Commission · {radiusMi === 1 ? "1 mile" : "½ mile"}</span></KypSubhead>
    <div className="kyp-segrow"><div className="kyp-seg" role="group" aria-label="DPD search radius">
      <button type="button" className={radiusMi === 0.5 ? "on" : ""} aria-pressed={radiusMi === 0.5} onClick={() => onRadiusChange(0.5)}>½ mile</button>
      <button type="button" className={radiusMi === 1 ? "on" : ""} aria-pressed={radiusMi === 1} onClick={() => onRadiusChange(1)}>1 mile</button>
    </div></div>
    {loading ? <div className="kyp-biz-loading" aria-live="polite"><span/><span/><span/></div> : error || unknown ? <p className="kyp-status-empty unknown" role="alert">Plan Commission applications could not be loaded. Nearby proposals are unknown rather than zero.</p> : applications.length === 0 ? <p className="kyp-emptypanel">No nearby Plan Commission applications were found in this search radius.</p> : applications.map((app: any) => <article className="kyp-biz-card" key={app.id || `${app.address}-${app.applicationType}`}>
      <div><b>{app.address || "Address unavailable"}</b><span>{app.applicationType || "Plan Commission application"}</span></div>
      {typeof app.distanceMi === "number" && <span className="kyp-biz-distance">{app.distanceMi.toFixed(2)} mi</span>}
      <div className="kyp-biz-cardmeta">{app.corridor?.name && <span className="kyp-corridor">{app.corridor.name}</span>}<span className="kyp-pill ind">{app.status || "Filed"}</span>{app.applicant && <span>{app.applicant}</span>}</div>
      {app.proposal && <div className="kyp-biz-cardmeta"><span>{app.proposal}</span></div>}
      <div className="kyp-biz-cardmeta">{app.hearingDate && <span>Hearing {dateLabel(app.hearingDate)}</span>}{(app.hearingUrl || app.applicationUrl) && <a className="kyp-morelink" style={{ margin: 0 }} href={app.hearingUrl || app.applicationUrl} target="_blank" rel="noopener noreferrer">Official hearing page →</a>}</div>
    </article>)}
    {coverage?.status === "partial" && <p className="kyp-status-empty unknown">Application coverage is incomplete. The records shown may omit pages or addresses that could not be located.</p>}
    <p className="kyp-src">Describes applications within {radiusMi === 1 ? "1 mile" : "½ mile"}, not this address. Source: Chicago Department of Planning and Development, Plan Commission hearing-page records. <b>Applications are not approvals, permits, or proof of construction.</b> Unit counts are as stated in the application text.</p>
  </section>;
}

function ZbaPanel({ zbaData: data, zbaLoading: loading, zbaError: error, ward, lat, lon }: Pick<Props, "zbaData" | "zbaLoading" | "zbaError" | "ward" | "lat" | "lon">) {
  const coverage = data?.sourceCoverage?.zbaActivity || data?.pipeline?.sourceCoverage?.zbaActivity;
  const unavailable = coverage?.status === "unavailable"
    || (!Array.isArray(data?.zbaActivity?.recentApprovals) && !Array.isArray(data?.approvals) && !loading);
  const approvals = data?.zbaActivity?.recentApprovals || data?.approvals || [];
  const allUpcoming = data?.zbaActivity?.upcomingCases || data?.upcoming || [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const upcoming = allUpcoming.filter((item: any) => !item.hearingDate || new Date(`${item.hearingDate}T12:00:00`) >= today);
  const parseSubject = (subject = "") => {
    const appType = /special use/i.test(subject) ? "Special Use" : /variation/i.test(subject) ? "Variation" : /appeal/i.test(subject) ? "Appeal" : /amendment/i.test(subject) ? "Amendment" : "";
    const unit = subject.match(/(\d[\d,]*)\s*(?:-|–)?\s*(?:dwelling\s+)?unit/i);
    const story = subject.match(/(\d[\d,]*(?:\s*-\s*story|\s+stor(?:y|ies)))/i);
    const proposedMatch = subject.match(/to\s+(?:establish|reduce|increase|allow|permit|change|modify|convert|expand|demolish)\s+([\s\S]+?)(?:\.|$)/i);
    return { appType, building: [unit && `${unit[1]} units`, story?.[1]].filter(Boolean).join(" · "), proposed: proposedMatch?.[1]?.slice(0, 200).trim() };
  };
  const caseColumn = (items: any[], decision: boolean) => items.length ? items.map((item, index) => {
    const parsed = parseSubject(item.subject || "");
    return <article className="zrow" key={item.caseNumber || `${item.address}-${index}`}>
      <div className="zhead"><a href={gmaps(item.address || "")} target="_blank" rel="noopener noreferrer"><b>{item.address}</b></a>{typeof item._distance === "number" && <span className="kyp-biz-distance">{item._distance.toFixed(2)} mi</span>}</div>
      <div className="kyp-biz-cardmeta">{parsed.appType && <span>{parsed.appType}</span>}{item.zoningDistrict && <span>{item.zoningDistrict}</span>}{item.caseNumber && <span>#{item.caseNumber}</span>}{item.applicant && <span>{item.applicant}</span>}<span>{decision ? item.meetingMonth || dateLabel(item.meetingDate) : item.hearingMonth || dateLabel(item.hearingDate)}</span><span className="kyp-pill ind">{decision ? item.decision : "Upcoming"}</span>{item.corridor?.name && <span className="kyp-corridor">{item.corridor.name}</span>}</div>
      {parsed.proposed && <p className="zsub">{parsed.proposed}</p>}{parsed.building && <p className="zsub">{parsed.building}</p>}
      {item.subject && <details><summary>Full application text</summary><p>{item.subject}</p></details>}
    </article>;
  }) : <p className="kyp-emptypanel">{decision ? "None found in the last four months." : "No upcoming hearings for this ward."}</p>;
  const items = useMemo(() => {
    const dist = (item: any) => {
      if (typeof lat !== "number" || typeof lon !== "number" || typeof item.lat !== "number" || typeof item.lon !== "number") return undefined;
      const rad = Math.PI / 180, dLat = (item.lat - lat) * rad, dLon = (item.lon - lon) * rad;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat * rad) * Math.cos(item.lat * rad) * Math.sin(dLon / 2) ** 2;
      return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };
    return [...approvals.map((item: any) => ({ ...item, _decision: true })), ...upcoming.map((item: any) => ({ ...item, _decision: false }))]
      .map((item: any) => ({ ...item, _distance: dist(item) })).sort((a: any, b: any) => (a._distance ?? 99) - (b._distance ?? 99));
  }, [data, approvals, upcoming, lat, lon]);
  return <section id="development-zba" aria-label="Zoning Board activity">
    <KypSubhead subsection={3}><span className="lbl">Zoning Board Activity</span><span className="ct">Ward {ward ?? "unavailable"}</span></KypSubhead>
    {loading ? <div className="kyp-biz-loading" aria-live="polite"><span/><span/><span/></div> : error || unavailable ? <p className="kyp-status-empty unknown" role="alert">Zoning Board records could not be loaded. Ward activity is unknown rather than empty.</p> : <div className="kyp-twocol">
      <div><div className="kyp-charttitle">Recent Decisions</div>{caseColumn(items.filter((item: any) => item._decision), true)}</div>
      <div><div className="kyp-charttitle">Upcoming Appearances</div>{caseColumn(items.filter((item: any) => !item._decision), false)}</div>
    </div>}
    {coverage?.status === "partial" && <p className="kyp-status-empty unknown">Zoning Board coverage is incomplete; an empty list does not confirm no ward activity.</p>}
    <p className="kyp-src">Describes Ward {ward ?? "activity"}, not this address. Source: Chicago Zoning Board of Appeals. Decisions cover the last four months. Unit and floor-area figures shown here are read from the application subject text and are not independently verified.</p>
  </section>;
}

export function DevelopmentSection(props: Props) {
  const sectionNumber = useContext(SectionNumberContext);
  const allArticles = props.dpdData?.developments || [];
  const news = allArticles.filter((item: any) => item.stage === 2 || item.source === "blockclub" || item.source === "yimby");
  const newsCoverage = props.dpdData?.sourceCoverage?.developmentNews || props.dpdData?.sourceCoverage?.news
    || props.dpdData?.pipeline?.sourceCoverage?.developmentNews || props.dpdData?.pipeline?.sourceCoverage?.news;
  const newsUnavailable = newsCoverage?.status === "unavailable"
    || (!Array.isArray(props.dpdData?.developments) && !props.dpdLoading);
   const sectionPrefix = sectionNumber == null ? "—" : String(sectionNumber).padStart(2, "0");
  const sourceNames = Array.from(new Set(news.map((item: any) => item.publisher || item.sourceName || item.source).filter(Boolean))).join(", ");
  return <div id="print-section-upcoming-developments">
    <PermitPipeline data={props.pipelineData} loading={props.pipelineLoading} error={props.pipelineError} />
    <section id="development-permits">
      <KypSubhead subsection={1}><span className="lbl">Permits</span><span className="ct">1 mile · issued records</span></KypSubhead>
      <NewConstructionSection data={props.permitData} isLoading={props.permitLoading} isError={props.permitError} subjectUnits={props.subjectUnits} />
    </section>
    <DpdPanel dpdData={props.dpdData} dpdLoading={props.dpdLoading} dpdError={props.dpdError} radiusMi={props.radiusMi} onRadiusChange={props.onRadiusChange} />
    <ZbaPanel zbaData={props.zbaData} zbaLoading={props.zbaLoading} zbaError={props.zbaError} ward={props.ward} lat={props.lat} lon={props.lon} />
    <section id="development-news" aria-label="Development news">
      <KypSubhead subsection={4}><span className="lbl">Development News</span><span className="ct">coverage, not records</span></KypSubhead>
      {props.dpdLoading ? <div className="kyp-biz-loading" aria-live="polite"><span/><span/><span/></div> : props.dpdError || newsUnavailable ? <p className="kyp-status-empty unknown" role="alert">Development news could not be loaded.</p> : news.length === 0 ? <p className="kyp-emptypanel">No nearby development coverage found.</p> : news.map((item: any) => <article className="kyp-archrow" key={item.id || item.url || item.title}>
        {props.renderLogo(item)}
        <div className="kyp-archbody">
          <div className="kyp-archkick">{item.corridor?.name && <span className="kyp-corridor">{item.corridor.name}</span>}<span className="kyp-pill ind">{titleCase(statusFor(item))}</span>{(item.pipelineStage === "permitted" || item.matchedSource === "permit") ? <span className="kyp-alsoin">• also a permit in {sectionPrefix}.1</span> : item.pipelineStage === "proposed" ? <span className="kyp-alsoin">• also an application in {sectionPrefix}.2</span> : item.pipelineStage === "zoning" ? <span className="kyp-alsoin">• also a zoning case in {sectionPrefix}.3</span> : null}</div>
          {safeExternalUrl(item.url) ? <a className="kyp-archtitle" href={safeExternalUrl(item.url)} target="_blank" rel="noopener noreferrer">{item.title}</a> : <span className="kyp-archtitle">{item.title}</span>}
          <div className="kyp-biz-cardmeta">{item.address && <span>{item.address}</span>}{item.units && <span>{item.units} units</span>}{item.stories && <span>{item.stories} stories</span>}{item.developer && <span>{item.developer}</span>}{item.publishDate && <span>{dateLabel(item.publishDate)}</span>}</div>
        </div>
      </article>)}
      {newsCoverage?.status === "partial" && <p className="kyp-status-empty unknown">News-feed coverage may be incomplete; an empty list does not confirm no development coverage.</p>}
      <p className="kyp-src">Describes news coverage of nearby projects, not this address, and not city records. Sources: {sourceNames || "development news publishers"}. Units, storeys and developer are read from the article text, not from a permit or application, and are not comparable with the counts in .1–.3. Rows marked <i>also a permit</i> share an address with a record above and are likely the same project.</p>
    </section>
  </div>;
}