// Corridor Intelligence — spec redesign (build-to-spec).
// Self-contained (cross_reference_allowed: false): the takeaway is deterministic
// and uses ONLY this section's own corridor data — no AI, no cross-section waits.
// Styles live in index.css scoped under .corrwrap.
import { Navigation, Briefcase, HardHat, Newspaper, Scale, Lightbulb, FileText } from "lucide-react";

export interface CorrLicense {
  name: string;
  address: string;
  date: string | null; // e.g. "Jun 2026"
  tags: string[];
}

export interface CorrConstruction {
  address: string;
  date: string | null;
  use: string | null;       // clean use (building use), leads the row
  stories: number | null;
  units: number | null;
  parking: number | null;
  cost: number | null;      // dollars
  distanceMi: number | null;
  architect: string | null;
  gc: string | null;
  cityClass: string | null; // raw Building-Permit classification → muted tag only
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
  kind: string;            // Special Use / Variation / …
  zone: string | null;
  caseNo: string | null;
  date: string | null;
  status: string;          // Approved / Denied / Upcoming — neutral tag
  distanceMi: number | null;
  use: string;             // plain-language description
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

export interface CorridorCardData {
  key: string;
  name: string;
  tier: number;
  tierLabel: string;       // Primary / Emerging
  distanceMi: number;
  onCorridor: boolean;
  blurb: string;
  licenses: CorrLicense[];
  construction: CorrConstruction[];
  coverage: CorrCoverage[];
  zoning: CorrZoning[];
  dpdApplications: CorrDpdApplication[];
}

export interface CorridorKpis {
  permits: number;
  permitUnits: string | null; // e.g. "43 units · 6 residential / 4 mixed-use / 33 commercial"
  licenses: number;
  articles: number;
  zoningAppeals: number;
  dpdApplications: number;
}

const fmtCost = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `$${Math.round(n / 1_000)}K` : `$${n.toLocaleString()}`;

const NUM_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const numWord = (n: number) => (n >= 0 && n <= 10 ? NUM_WORDS[n] : String(n));

export default function CorridorIntelligenceView({ kpis, corridors, licensesLoading = false }: { kpis: CorridorKpis; corridors: CorridorCardData[]; licensesLoading?: boolean }) {
  // Sort closest-first: on_corridor → 0; tier is a label, not a sort key. Tie-break by name.
  const sorted = corridors.slice().sort((a, b) => {
    const da = a.onCorridor ? 0 : a.distanceMi;
    const db = b.onCorridor ? 0 : b.distanceMi;
    return da - db || a.name.localeCompare(b.name);
  });

  const onCorr = sorted.find(c => c.onCorridor) || null;
  const others = sorted.filter(c => c !== onCorr);
  const closest = sorted[0];
  const primaryCount = sorted.filter(c => c.tier === 1).length;

  // Dominant license categories (from tags across all corridors)
  const catCounts = new Map<string, number>();
  for (const c of sorted) for (const l of c.licenses) for (const t of l.tags) {
    if (!t) continue;
    catCounts.set(t, (catCounts.get(t) || 0) + 1);
  }
  const topCats = Array.from(catCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t.toLowerCase());

  const covHeadline = sorted.flatMap(c => c.coverage)[0] || null;
  const approvedZoning = sorted.flatMap(c => c.zoning).filter(z => /approved/i.test(z.status)).length;

  const headline = onCorr
    ? `The property sits on a ${onCorr.tierLabel.toLowerCase() === "primary" ? "primary retail" : "commercial"} corridor — one of ${numWord(sorted.length)} active commercial street${sorted.length !== 1 ? "s" : ""} within a half-mile.`
    : closest
      ? `The property sits within a half-mile of ${numWord(sorted.length)} active commercial corridor${sorted.length !== 1 ? "s" : ""} — ${closest.name} is closest at ${closest.distanceMi} mi.`
      : `No active commercial corridors detected within a half-mile.`;

  return (
    <div className="corrwrap" data-testid="corridor-intelligence">
      {/* ── Standard Takeaway ── */}
      <div className="take" data-testid="corridor-takeaway">
        <div className="take-head">
          <div className="take-label"><Lightbulb /> Takeaway</div>
        </div>
        <div className="take-title">{headline}</div>
        <div className="take-row good">
          <span className="dot" />
          <div className="body">
            {onCorr ? (
              <><b>On a {onCorr.tier === 1 ? "primary" : "commercial"} corridor{others.length > 0 ? `, with ${numWord(others.length)} more a half-mile out` : ""}.</b> The site fronts <b>{onCorr.name}</b> (a Tier-{onCorr.tier} {onCorr.tier === 1 ? "artery" : "emerging corridor"}){others.length > 0 ? <>, with {others.map((c, i) => <span key={c.key}>{i > 0 ? (i === others.length - 1 ? " and " : ", ") : ""}{c.name} ({c.distanceMi} mi)</span>)} close behind</> : null} — {primaryCount > 1 ? `${numWord(primaryCount)} primary commercial corridors, ` : ""}a strongly connected retail location.</>
            ) : closest ? (
              <><b>Close to commercial activity.</b> The nearest corridor, <b>{closest.name}</b> (Tier {closest.tier} · {closest.tierLabel}), sits {closest.distanceMi} mi away{others.length > 1 ? <>, with {others.filter(c => c !== closest).map((c, i, arr) => <span key={c.key}>{i > 0 ? (i === arr.length - 1 ? " and " : ", ") : ""}{c.name} ({c.distanceMi} mi)</span>)} within a half-mile</> : null}.</>
            ) : (
              <>No corridor within the search radius.</>
            )}
          </div>
        </div>
        <div className="take-row insight">
          <span className="dot" />
          <div className="body">
            {licensesLoading ? (
              <>Business-license issuance records are still loading, so issuance activity is not yet available.</>
            ) : kpis.licenses > 0 ? (
              <><b>Recent license activity.</b> <b>{kpis.licenses} business{kpis.licenses !== 1 ? "es" : ""}</b> received {kpis.licenses === 1 ? "a new license" : "new licenses"} along these corridors in the last 12 months{topCats.length > 0 ? <> — most commonly {topCats.join(", ")}</> : null}
              {covHeadline ? <> — and recent press ties {covHeadline.source ? `${covHeadline.source} coverage` : "local coverage"} to corridor momentum{covHeadline.title ? <> (&ldquo;{covHeadline.title}&rdquo;)</> : null}.</> : <>.</>}</>
            ) : (
              <><b>No recent business-license records.</b> No businesses with new licenses appeared along these corridors in the last 12 months.</>
            )}
          </div>
        </div>
        <div className="take-row insight">
          <span className="dot" />
          <div className="body">
            {(kpis.permits > 0 || kpis.zoningAppeals > 0) ? (
              <><b>Construction is adding housing and storefronts.</b> {kpis.permits > 0 ? <><b>{kpis.permits} new-construction permit{kpis.permits !== 1 ? "s" : ""}</b>{kpis.permitUnits ? <> · {kpis.permitUnits}</> : null} nearby</> : null}
              {kpis.permits > 0 && kpis.zoningAppeals > 0 ? " plus " : null}
              {kpis.zoningAppeals > 0 ? <>{approvedZoning > 0 ? `${numWord(kpis.zoningAppeals)} zoning appeal${kpis.zoningAppeals !== 1 ? "s" : ""} (${approvedZoning} approved)` : `${numWord(kpis.zoningAppeals)} zoning appeal${kpis.zoningAppeals !== 1 ? "s" : ""}`}</> : null}.</>
            ) : (
              <><b>No new construction or zoning activity recorded.</b> No new-construction permits or zoning appeals appear at corridor addresses in the current city records.</>
            )}
          </div>
        </div>
        <div className="take-row caution">
          <span className="dot" />
          <div className="body">
            <b>Read as corridor momentum, not parcel specifics.</b> Distances are to each corridor's nearest point; individual activity can sit farther along a street, and permit use-labels are raw city classifications. This is neighborhood demand context — <b>site-specific coverage lives in the News section.</b>
          </div>
        </div>
      </div>

      {/* ── KPI tiles ── */}
      <div className="kpis" data-testid="corridor-kpis">
        <div className="kpi"><div className="n">{kpis.permits}</div><div className="l">New construction permits</div><div className="s">{kpis.permitUnits ? `${kpis.permitUnits} · ` : ""}via City Building Permits</div></div>
        <div className="kpi"><div className="n">{kpis.licenses}</div><div className="l">Businesses with new licenses</div><div className="s">Last 12 mo · via Chicago Business Licenses</div></div>
        <div className="kpi"><div className="n">{kpis.articles}</div><div className="l">News article{kpis.articles !== 1 ? "s" : ""}</div><div className="s">Last 90 days · Block Club / Curbed / local news</div></div>
        <div className="kpi"><div className="n">{kpis.zoningAppeals}</div><div className="l">Zoning appeal{kpis.zoningAppeals !== 1 ? "s" : ""}</div><div className="s">Recent decisions &amp; hearings · via Zoning Board of Appeals</div></div>
        <div className="kpi"><div className="n">{kpis.dpdApplications}</div><div className="l">DPD application{kpis.dpdApplications !== 1 ? "s" : ""}</div><div className="s">Plan Commission pages · application signals</div></div>
      </div>

      {/* ── Corridor cards, closest-first ── */}
      {sorted.map((c, ci) => {
        const hasData = c.licenses.length > 0 || c.construction.length > 0 || c.coverage.length > 0 || c.zoning.length > 0 || c.dpdApplications.length > 0;
        const chips = (
          <div className="corrchips">
            {c.licenses.length > 0 && <span className="cchip">{c.licenses.length} business{c.licenses.length !== 1 ? "es" : ""} with new license{c.licenses.length !== 1 ? "s" : ""}</span>}
            {c.construction.length > 0 && <span className="cchip">{c.construction.length} permit{c.construction.length !== 1 ? "s" : ""}</span>}
            {c.coverage.length > 0 && <span className="cchip">{c.coverage.length} article{c.coverage.length !== 1 ? "s" : ""}</span>}
            {c.zoning.length > 0 && <span className="cchip">{c.zoning.length} zoning appeal{c.zoning.length !== 1 ? "s" : ""}</span>}
            {c.dpdApplications.length > 0 && <span className="cchip">{c.dpdApplications.length} DPD application{c.dpdApplications.length !== 1 ? "s" : ""}</span>}
          </div>
        );
        const dist = c.onCorridor
          ? "On corridor"
          : `${c.distanceMi} mi${ci === 0 || (ci === 1 && sorted[0].onCorridor) ? " — closest corridor" : ""}`;

        if (!hasData) {
          return (
            <div key={c.key} className="corr collapsed" data-testid={`corridor-card-${c.key}`}>
              <Navigation className="nav" />
              <span className="nm">{c.name}</span>
              <span className="tierchip">Tier {c.tier} · {c.tierLabel}</span>
              <span className="corrdist">{dist}</span>
              {chips}
              <div className="corrsub">{c.blurb}</div>
            </div>
          );
        }

        return (
          <div key={c.key} className="corr" data-testid={`corridor-card-${c.key}`}>
            <div className="corrhead">
              <Navigation className="nav" />
              <span className="nm">{c.name}</span>
              <span className="tierchip">Tier {c.tier} · {c.tierLabel}</span>
              <span className="corrdist">{dist}</span>
              {chips}
            </div>
            <div className="corrsub">{c.blurb}</div>

            {(c.licenses.length > 0 || c.construction.length > 0) && (
              <div className="corrgrid">
                {c.licenses.length > 0 && (
                  <div>
                    <div className="colh"><Briefcase /> Businesses with new licenses</div>
                    {c.licenses.map((l, i) => (
                      <div className="item" key={i} data-testid={`corridor-license-${c.key}-${i}`}>
                        <div className="r1"><span className="nm2">{l.name}</span>{l.date && <span className="dt">{l.date}</span>}</div>
                        <div className="addr">{l.address}</div>
                        {l.tags.length > 0 && <div className="tags">{l.tags.map((t, ti) => <span className="tag" key={ti}>{t}</span>)}</div>}
                      </div>
                    ))}
                  </div>
                )}
                {c.construction.length > 0 && (
                  <div>
                    <div className="colh"><HardHat /> New construction</div>
                    {c.construction.map((p, i) => (
                      <div className="item" key={i} data-testid={`corridor-permit-${c.key}-${i}`}>
                        <div className="r1"><span className="nm2">{p.address}</span>{p.date && <span className="dt">{p.date}</span>}</div>
                        <div className="meta2">
                          {[
                            p.use || null,
                            p.stories ? `${p.stories}-story` : null,
                            p.units ? `${p.units} units${p.parking ? `, ${p.parking} parking` : ""}` : (p.parking ? `${p.parking} parking` : null),
                          ].filter(Boolean).join(" · ")}
                          {p.cost ? <>{(p.use || p.stories || p.units || p.parking) ? " · " : ""}<b>{fmtCost(p.cost)}</b></> : null}
                          {p.distanceMi != null ? <> · {p.distanceMi} mi</> : null}
                        </div>
                        {(p.architect || p.gc) && (
                          <div className="addr">{[p.architect ? `Arch. ${p.architect}` : null, p.gc ? `GC ${p.gc}` : null].filter(Boolean).join(" · ")}</div>
                        )}
                        {p.cityClass && <div className="tags"><span className="tag rawtag">City class: {p.cityClass}</span></div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {c.coverage.length > 0 && (
              <div className="corrextra">
                <div className="cexlabel"><Newspaper /> Recent corridor coverage</div>
                {c.coverage.map((a, i) => (
                  <div key={i} data-testid={`corridor-coverage-${c.key}-${i}`} style={i > 0 ? { marginTop: 12 } : undefined}>
                    <div className="covtitle"><a href={a.url} target="_blank" rel="noopener noreferrer">{a.title}</a></div>
                    <div className="covmeta">{[a.source, a.date].filter(Boolean).join(" · ")}</div>
                    {a.summary && <div className="covsum">{a.summary} <span style={{ color: "var(--muted)" }}>— corridor-level, not the subject parcel.</span></div>}
                  </div>
                ))}
              </div>
            )}

            {c.zoning.length > 0 && (
              <div className="corrextra">
                <div className="cexlabel"><Scale /> Zoning activity</div>
                {c.zoning.map((z, i) => (
                  <div key={i} data-testid={`corridor-zoning-${c.key}-${i}`} style={i > 0 ? { marginTop: 10 } : undefined}>
                    <div className="zrow">
                      <span className="zaddr">{z.address}</span>
                      <span className="zmeta">{[z.kind, z.zone, z.caseNo, z.date].filter(Boolean).join(" · ")}</span>
                      <span className="zstatus">{z.status}</span>
                      {z.distanceMi != null && <span className="zmeta">{z.distanceMi.toFixed(2)} mi</span>}
                    </div>
                    {z.use && <div className="zuse">{z.use} — a nearby application; not the subject parcel.</div>}
                  </div>
                ))}
              </div>
            )}
            {c.dpdApplications.length > 0 && (
              <div className="corrextra">
                <div className="cexlabel"><FileText /> DPD application signals</div>
                {c.dpdApplications.map((application, i) => (
                  <div key={i} data-testid={`corridor-dpd-${c.key}-${i}`} style={i > 0 ? { marginTop: 10 } : undefined}>
                    <div className="zrow">
                      <span className="zaddr">{application.address}</span>
                      <span className="zmeta">{[application.applicationType, application.hearingDate].filter(Boolean).join(" · ")}</span>
                      <span className="zstatus">{application.status}</span>
                      {application.distanceMi != null && <span className="zmeta">{application.distanceMi.toFixed(2)} mi</span>}
                    </div>
                    {application.applicant && <div className="zuse">Applicant: {application.applicant}</div>}
                    {application.proposal && <div className="zuse">{application.proposal} — a corridor-matched application, not the subject parcel.</div>}
                    <div className="zuse">{application.applicationUrl ? <a className="text-primary hover:underline" href={application.applicationUrl} target="_blank" rel="noopener noreferrer">Filed application</a> : <a className="text-primary hover:underline" href={application.hearingUrl} target="_blank" rel="noopener noreferrer">Hearing page</a>}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* ── Footer: single line ── */}
      <div className="foot" data-testid="corridor-footer">
        Showing primary commercial corridors within ~0.5 mi of the property (nearest point). <b>Tier 1</b> = primary commercial corridor · <b>Tier 2</b> = secondary / emerging. Businesses with new licenses are grouped by business name and address; established businesses may receive additional licenses, so new licenses do not confirm new business openings. Individual licenses, permits, appeals, and DPD applications can sit farther along a corridor (distance shown per item). DPD rows are published application signals, not approvals or construction proof. Sources: City Building Permits · Chicago Business Licenses · Zoning Board of Appeals · Chicago DPD Plan Commission · Block Club / Curbed / local news.
      </div>
    </div>
  );
}
