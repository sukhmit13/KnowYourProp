import { type ReactNode } from "react";
import { type ScanSection, type VerdictTone } from "./CollapsibleSection";
import { SECTION_META, SECTION_ORDER } from "./sectionRegistry";

/** Convert the AI takeaways' own **bold** markers into our serif-italic emphasis. */
function mdEmph(s?: string | null): ReactNode {
  if (!s) return undefined;
  // Header takeaways stay short: strip any leading dash (the row adds its own em-dash)
  // and trim to ~110 chars at a word boundary; keep **bold** pairs balanced.
  let t = s.replace(/^[\u2014\u2013-]\s*/, "").trim();
  // Hard one-line budget (~70 chars): the takeaway shares the row with the
  // title, badge and icons. Prefer cutting at a clause boundary (em-dash,
  // semicolon, comma or sentence end) between 30–70 chars; else word-trim.
  if (t.length > 70) {
    const head = t.slice(0, 71);
    let cut = -1;
    for (const re of [/[.!?](?=\s)/g, /\s\u2014\s/g, /;\s/g, /,\s/g]) {
      let m: RegExpExecArray | null; let last = -1;
      while ((m = re.exec(head)) !== null) if (m.index >= 30) last = m.index;
      if (last >= 0) { cut = last; break; }
    }
    if (cut >= 0) {
      t = t.slice(0, cut) + (/[.!?]/.test(t[cut]) ? t[cut] : ".");
    } else {
      t = t.slice(0, 70).replace(/\s+\S*$/, "") + "\u2026";
    }
    if ((t.match(/\*\*/g)?.length ?? 0) % 2 === 1) t = t.replace(/\*\*(?!.*\*\*)/, "");
  }
  const parts = t.split(/\*\*(.+?)\*\*/g);
  return <>{parts.map((p, i) => (i % 2 ? <em key={i}>{p}</em> : p))}</>;
}
const num = (n: unknown): number | undefined => (typeof n === "number" && isFinite(n) ? n : undefined);

/** All fields optional — pass whatever RunDetail has in scope; the rest falls back to summary.
 *  Field names/shapes verified against the live code. */
export interface ScanCtx {
  transitTakeaway?: { headline?: string | null } | null;
  transitData?: { ctaRail?: { distance?: number | string }[]; metra?: { distance?: number | string }[]; ctaBus?: { distance?: number | string }[] } | null;
  crimeTakeaway?: { headline?: string | null } | null;
  crimeTractData?: { violent?: { saferThanPercent?: number }; trend?: { yoyPercent?: number }; saferThanPercent?: number } | null;
  hmdaTakeaway?: { headline?: string | null } | null;
  compsData?: { comparables?: unknown[] } | null;
  effectiveCompatibility?: { permission?: "permitted" | "special_use" | string } | null;
  assemblage?: { common_control?: "exact" | "likely" | "unclear" } | null;
  incMeta?: { counts?: { likely?: number; confirm?: number; na?: number } } | null;
  debtSnap?: { takeaway?: { title?: string } } | null;
  newsTakeaway?: { section?: { title?: string; rows?: { tone?: string }[] } } | null;
  /** true when any site-specific (parcel/adjacent) coverage exists — gates the neighborhood fallback */
  hasSiteNews?: boolean;
  nnTakeaway?: { takeaway?: { title?: string }; kpis?: { momentumLabel?: string; momentumScore?: number } } | null;
  /** Permits & Violations — computed in RunDetail from dobDerived + violationsData */
  dobScan?: { headline?: string | null; openViolations?: number | null; notClosedCount?: number | null } | null;
  /** Ownership & Title — shared distress resolution and recorder-search state. */
  lienDistress?: {
    hasForeclosureActive?: boolean;
    lis?: { activeCount?: number };
  } | null;
  lienData?: {
    activeLienCount?: number;
    searchFailed?: boolean;
  } | null;
  isLoadingLiens?: boolean;
  businessLicenses?: { totalCount: number; priorPeriodCount: number; changePct: number | null } | null;
  newConstruction?: { subject?: { totalPermits?: number }; activePermitCount?: number; trend?: { changePct?: number | null; suppressed?: boolean } } | null;
}

type Dyn = Partial<Pick<ScanSection, "takeaway" | "verdict" | "hero">>;

export function buildScanSections(ctx: ScanCtx): ScanSection[] {
  const dyn: Record<string, Dyn> = {};

  // 2 · Zoning — deterministic permission verdict
  const perm = ctx.effectiveCompatibility?.permission;
  if (perm) dyn.zoning = perm === "permitted"
    ? { takeaway: <>Your project is <em>allowed by right</em> — no variance needed.</>, verdict: { tone: "good", label: "By-right" } }
    : perm === "special_use"
      ? { takeaway: <>Your project needs <em>Special Use approval</em>.</>, verdict: { tone: "attention", label: "Special use" } }
      : { takeaway: <>Your project likely needs a <em>rezoning</em>.</>, verdict: { tone: "attention", label: "Rezone" } };

  // 4 · Ownership & Title — the same priority used inside the section.
  // Never let co-parcel ownership or a failed recorder search imply clean title.
  const activeLisPendens = ctx.lienDistress?.lis?.activeCount ?? 0;
  const activeLiens = ctx.lienData?.activeLienCount ?? 0;
  const titleUnavailable = !!ctx.isLoadingLiens || !!ctx.lienData?.searchFailed || !ctx.lienData;
  if (ctx.lienDistress?.hasForeclosureActive) {
    dyn.ownership = {
      takeaway: <>An active foreclosure filing needs <em>title review before closing</em>.</>,
      verdict: { tone: "attention", label: "Foreclosure" },
    };
  } else if (activeLisPendens > 0) {
    dyn.ownership = {
      takeaway: <><em>Lis pendens is active</em> — confirm the case and release status.</>,
      verdict: { tone: "attention", label: "Lis pendens" },
    };
  } else if (activeLiens > 0) {
    dyn.ownership = {
      takeaway: <><em>{activeLiens} active lien{activeLiens === 1 ? "" : "s"}</em> need payoff or release review.</>,
      verdict: { tone: "attention", label: `${activeLiens} active lien${activeLiens === 1 ? "" : "s"}` },
    };
  } else if (titleUnavailable) {
    dyn.ownership = {
      takeaway: <>Recorder results are <em>not available yet</em> — title status is unknown.</>,
      verdict: { tone: "attention", label: "Status unknown" },
    };
  } else {
    const cc = ctx.assemblage?.common_control;
    dyn.ownership = {
      takeaway: cc && cc !== "exact"
        ? <>No active title claim was found; <em>confirm companion-parcel control</em>.</>
        : <>No active foreclosure, lis pendens, or property lien was found.</>,
      verdict: { tone: "good", label: "Clear title" },
    };
  }

  // 5 · Debt — cached debt-snapshot takeaway title (no verdict: badge tone isn't exposed at mount)
  if (ctx.debtSnap?.takeaway?.title) dyn.debt = { takeaway: mdEmph(ctx.debtSnap.takeaway.title) };

  // 6 · Local Market — HMDA takeaway headline + comps count hero
  const comps = ctx.compsData?.comparables?.length;
  if (ctx.hmdaTakeaway?.headline || comps) dyn.market = {
    takeaway: mdEmph(ctx.hmdaTakeaway?.headline),
    hero: comps ? { value: String(comps), label: "comps" } : undefined,
  };

  // 7 · Transit — headline + access tier (mirrors the section's own rule exactly:
  //    Strong = rapid transit ≤ 0.5 mi AND 2+ bus routes ≤ 0.25 mi)
  const rail = ctx.transitData?.ctaRail;
  const metra = ctx.transitData?.metra;
  const bus = ctx.transitData?.ctaBus || [];
  let tier: "Strong" | "Moderate" | "Limited" | undefined;
  if (ctx.transitData) {
    const rapidWithin10 = [rail?.[0], metra?.[0]].some((s) => s && Number(s.distance) <= 0.5);
    const closeBusRoutes = bus.filter((s) => Number(s.distance) <= 0.25).length;
    tier = rapidWithin10 && closeBusRoutes >= 2 ? "Strong" : rapidWithin10 || closeBusRoutes >= 2 ? "Moderate" : "Limited";
  }
  if (ctx.transitTakeaway?.headline || tier) dyn.transit = {
    takeaway: mdEmph(ctx.transitTakeaway?.headline),
    verdict: tier ? { tone: tier === "Strong" ? "good" : tier === "Limited" ? "attention" : "context", label: `${tier} access` } : undefined,
    hero: rail?.length ? { value: String(rail.length), label: "rail stops" } : undefined,
  };

  // 8 · Crime — headline + safer-than percentile
  const safer = num(ctx.crimeTractData?.violent?.saferThanPercent) ?? num(ctx.crimeTractData?.saferThanPercent);
  if (ctx.crimeTakeaway?.headline || safer != null) dyn.crime = {
    takeaway: ctx.crimeTakeaway?.headline ? <span data-testid="crime-takeaway">{mdEmph(ctx.crimeTakeaway.headline)}</span> : undefined,
    verdict: safer != null ? { tone: safer >= 50 ? "good" : "attention", label: safer >= 50 ? "Lower crime" : "Elevated crime" } : undefined,
    hero: safer != null ? { value: `${Math.round(safer)}th`, label: "pctile" } : undefined,
  };

  // 3 · Permits & Violations — computed headline + clean/open/not-closed badge
  if (ctx.dobScan?.headline != null) {
    // open === null means violations are unknown (loading/error) — never show "Clean record" then
    const open = num(ctx.dobScan.openViolations);
    const notClosed = num(ctx.dobScan.notClosedCount) ?? 0;
    dyn.permits = {
      takeaway: <span data-testid="dob-takeaway">{mdEmph(ctx.dobScan.headline)}</span>,
      verdict: open != null && open > 0
        ? { tone: "attention", label: `${open} open` }
        : notClosed > 0
          ? { tone: "attention", label: `${notClosed} not closed` }
          : open === 0
            ? { tone: "good", label: "Clean record" }
            : undefined,
    };
  }

  const licenseCount = ctx.businessLicenses?.totalCount;
  if (licenseCount != null) {
    const change = ctx.businessLicenses?.changePct;
    dyn.newBusinessLicenses = {
      takeaway: <><em>{licenseCount} new business{licenseCount === 1 ? "" : "es"}</em> opened within a mile in the past year.</>,
      verdict: change == null
        ? { tone: "context", label: "No prior baseline" }
        : { tone: change >= 0 ? "good" : "attention", label: `${change > 0 ? "+" : ""}${change}% formation` },
      hero: { value: String(licenseCount), label: "openings" },
    };
  }

  const constructionCount = ctx.newConstruction?.subject?.totalPermits;
  if (constructionCount != null) {
    const trend = ctx.newConstruction?.trend;
    dyn.newConstruction = {
      takeaway: <><em>{constructionCount} new-construction permit{constructionCount === 1 ? "" : "s"}</em> within one mile over the source period.</>,
      verdict: trend?.suppressed || trend?.changePct == null ? { tone: "context", label: "Trend limited" } : { tone: "context", label: `${trend.changePct > 0 ? "+" : ""}${trend.changePct}% activity` },
      hero: { value: String(constructionCount), label: "permits" },
    };
  }

  // 10 · Corridor — neighborhood-news takeaway title + momentum label.
  //     Tone follows the label: only high momentum reads green; low/moderate stay neutral.
  const momentum = ctx.nnTakeaway?.kpis?.momentumLabel;
  if (ctx.nnTakeaway?.takeaway?.title || momentum) {
    const momTone: VerdictTone = /high/i.test(momentum || "") ? "good" : "context";
    dyn.corridor = {
      takeaway: mdEmph(ctx.nnTakeaway?.takeaway?.title),
      verdict: momentum ? { tone: momTone, label: momentum } : undefined,
    };
  }

  // 13 · Incentives — eligible counts
  const likely = num(ctx.incMeta?.counts?.likely);
  const incTotal = likely != null ? likely + (num(ctx.incMeta?.counts?.confirm) ?? 0) + (num(ctx.incMeta?.counts?.na) ?? 0) : 0;
  if (likely != null && incTotal > 0) {
    dyn.incentives = {
      takeaway: <><em>{likely}</em> of {incTotal} programs likely relevant.</>,
      verdict: likely > 0 ? { tone: "good", label: `${likely} Eligible` } : { tone: "context", label: "None in area" },
      hero: likely > 0 ? { value: String(likely), label: "eligible" } : undefined,
    };
  }

  // 14 · News — cached news takeaway title; flagged when any row carries a caution tone
  const flagged = ctx.newsTakeaway?.section?.rows?.some((r) => r?.tone === "caution" || r?.tone === "bad");
  if (ctx.newsTakeaway?.section?.title) dyn.news = {
    takeaway: mdEmph(ctx.newsTakeaway.section.title),
    verdict: flagged ? { tone: "attention", label: "Flagged" } : { tone: "good", label: "Clean" },
  };
  // no site-specific coverage at all → fall through to the neighborhood-news takeaway.
  // While site articles exist but their AI takeaway is pending/failed, keep the static summary —
  // a neighborhood-scoped headline would misstate the row's finding.
  else if (!ctx.hasSiteNews && ctx.nnTakeaway?.takeaway?.title) dyn.news = {
    takeaway: mdEmph(ctx.nnTakeaway.takeaway.title),
    verdict: /high/i.test(ctx.nnTakeaway?.kpis?.momentumLabel || "") ? { tone: "good", label: "High momentum" } : undefined,
  };

  // (overview, valuation, proximity, development intentionally unwired — no concise
  //  generated one-liner in scope at the mount point, so they show their muted summary.)

  return SECTION_ORDER.map((id) => ({ ...SECTION_META[id], ...(dyn[id] || {}) }));
}
