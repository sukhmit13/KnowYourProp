# KYP redesign — Step 3: wire REAL per-property data into the scan

Replace the placeholder takeaway/verdict/hero in the scan with the values the app already
computes, and fix the section anchors. Static metadata (title, summary, info) stays; the
dynamic fields now come from real vars. Everything is **null-safe**: any section whose real
data isn't wired or is still null **falls back to its muted `summary`** (from Step 2), so
partial wiring is fine and nothing breaks.

## Prerequisite
Steps 1 and 2 are in (`kyp-base.css`, `CollapsibleSection.tsx`, `SectionScan.tsx`,
`sectionRegistry.tsx`, mounted behind `?scan=1`).

## 🔒 Guardrails
- Still behind the `?scan=1` flag. Don't change any section's own rendering.
- **Null-safe only.** Read every real value with optional chaining; never assume a
  takeaway/query has resolved (many are cached AI calls that are `null` until generated or
  until the section is opened). If unsure a value is in scope at the mount point, leave that
  section unwired — it falls back to `summary`. Do **not** move/lift existing state to force it.
- Reuse the app's existing label→anchor map at `RunDetail.tsx:3202–3242` (`jumpSections`) as
  the source of truth for anchors; the ids below were read from the code but confirm against it.

---

## File 1 — replace `client/src/components/report/sectionRegistry.tsx`

Now it holds only the **static** per-section metadata (with corrected `anchorId`s) plus the
order. Dynamic fields are added by the builder in File 2.

```tsx
import { type ScanSection } from "./CollapsibleSection";

// Static metadata only. anchorId values read from RunDetail (confirm vs the jumpSections map).
type SectionMeta = Pick<ScanSection, "id" | "anchorId" | "title" | "summary" | "info">;

export const SECTION_ORDER = [
  "overview", "zoning", "valuation", "ownership", "debt", "market", "transit",
  "crime", "proximity", "corridor", "development", "people", "incentives", "news",
] as const;

export const SECTION_META: Record<string, SectionMeta> = {
  overview: { id: "overview", anchorId: "print-section-property-info", title: "Property Overview",
    summary: "Address, PIN, zoning, building profile and lot — the basic facts.",
    info: ["Location map", "Facts: PIN, zoning, Opportunity-Zone flag", "Building profile: units, sqft, beds/baths, year", "Parcel / assessor record", "Historic landmark status"] },
  zoning: { id: "zoning", anchorId: "print-section-zoning-details", title: "Zoning & What You Can Build",
    summary: "What the zoning lets you build, by-right or with approvals.",
    info: ["Zoning district & meaning", "Allowed uses — as-of-right", "Your project-type verdict", "Development potential: FAR, height, parking", "Zoning & ZBA history"] },
  valuation: { id: "valuation", anchorId: "valuation-calculator-section", title: "Valuation & Cashflow",
    summary: "Cap rate, cash flow and debt coverage at your inputs.",
    info: ["Deal inputs — price & financing", "Income → NOI statement", "Cap rate & cash flow", "DSCR coverage", "Market rents (RentCast)", "Short-term rental (Airbnb)"] },
  ownership: { id: "ownership", anchorId: "section-sale-history", title: "Ownership & Sales History",
    summary: "Sale history, entity, and any companion-parcel assemblage.",
    info: ["Recorded sales timeline", "Double lot / companion parcel", "Current owner & entity"] },
  debt: { id: "debt", anchorId: "section-liens", title: "Debt, Liens & Title",
    summary: "Mortgages, liens, property tax and clear-to-finance status.",
    info: ["Debt snapshot — mortgages & positions", "Liens & encumbrances", "Property tax, exemptions & appeals", "Financing readiness (pre-title)"] },
  market: { id: "market", anchorId: "print-section-comparable-sales", title: "The Local Market",
    summary: "Comps, price trends and mortgage-lending activity nearby.",
    info: ["Recently sold comps", "Area transaction trends", "HMDA — who’s borrowing", "HMDA — what’s getting funded", "Commercial lending (SBA)"] },
  transit: { id: "transit", anchorId: "print-section-transit", title: "Transit Access",
    summary: "Rail, Metra, bus and street traffic near the property.",
    info: ["CTA rail — nearest stations & ridership", "Metra — stations & ridership", "CTA bus — routes & ridership", "Street traffic volume (ADT)"] },
  crime: { id: "crime", anchorId: "section-crime", title: "Safety & Crime",
    summary: "Area crime levels, percentile vs the city, and trend.",
    info: ["Area crime statistics", "Tract percentile vs city", "Trend over time"] },
  proximity: { id: "proximity", anchorId: "print-section-proximity-details", title: "Proximity & Amenities",
    summary: "Parks, schools, hospitals, dining and other amenities.",
    info: ["Proximity grid: parks, hospital, stadium, lake", "Rated schools", "Grocery access", "Dining (Michelin + notable)", "Landmarks & culture", "Vacant / city-owned nearby"] },
  corridor: { id: "corridor", anchorId: "print-section-corridor-news", title: "Corridor Intelligence",
    summary: "New businesses and news on the nearby commercial corridors.",
    info: ["New business licenses on the corridor", "Corridor news coverage", "Neighborhood news"] },
  development: { id: "development", anchorId: "print-section-upcoming-developments", title: "Nearby Development & Construction",
    summary: "New-construction permits and proposed projects nearby.",
    info: ["New-construction permits (radius-wide)", "Upcoming / proposed developments"] },
  people: { id: "people", anchorId: "print-section-demographics", title: "Neighborhood & People",
    summary: "Demographics, income, tenure and workforce (context only).",
    info: ["Demographic trends", "Languages spoken", "Vehicle ownership", "Senior population", "Jobs & workforce", "Voting & civic lean (context only)"] },
  incentives: { id: "incentives", anchorId: "print-section-location-incentives", title: "Incentives",
    summary: "Which incentive programs the parcel is eligible for.",
    info: ["Eligible / not-eligible program cards", "TIF, OZ, TOD, SBIF, NMTC", "Class 6b / 7, HUBZone, QCT", "Neighborhood Opportunity Fund, ADU…"] },
  news: { id: "news", anchorId: "print-section-address-news", title: "News on This Property",
    summary: "Any news coverage that names this specific property.",
    info: ["Articles naming the subject parcel", "Current-status check vs the record"] },
};
```

## File 2 — new `client/src/components/report/scanBuilder.tsx`

Maps real vars → `ScanSection[]`. Every field is optional; missing data → summary fallback.

```tsx
import { type ReactNode } from "react";
import { type ScanSection, type VerdictTone } from "./CollapsibleSection";
import { SECTION_META, SECTION_ORDER } from "./sectionRegistry";

/** Convert the AI takeaways' own **bold** markers into our serif-italic emphasis. */
function mdEmph(s?: string | null): ReactNode {
  if (!s) return undefined;
  const parts = s.split(/\*\*(.+?)\*\*/g);
  return <>{parts.map((p, i) => (i % 2 ? <em key={i}>{p}</em> : p))}</>;
}
const num = (n: unknown): number | undefined => (typeof n === "number" && isFinite(n) ? n : undefined);

/** All fields optional — pass whatever RunDetail has in scope; the rest falls back to summary.
 *  Field names/shapes verified against the code (see comments); adjust if yours differ. */
export interface ScanCtx {
  transitTakeaway?: { headline?: string | null; accessTier?: "Strong" | "Moderate" | "Limited" } | null;
  transitData?: { ctaRail?: unknown[]; metra?: unknown[]; ctaBus?: unknown[] } | null;
  crimeTakeaway?: { headline?: string | null } | null;
  crimeTractData?: { violent?: { saferThanPercent?: number }; trend?: { yoyPercent?: number }; saferThanPercent?: number } | null;
  hmdaTakeaway?: { headline?: string | null } | null;
  compsData?: { comparables?: unknown[] } | null;
  effectiveCompatibility?: { permission?: "permitted" | "special_use" | string } | null;
  valuation?: { verdictText?: string; dscrState?: "good" | "amber" | "bad"; capRate?: number; dscr?: number } | null;
  assemblage?: { common_control?: "exact" | "likely" | "unclear" } | null;
  incMeta?: { counts?: { likely?: number; confirm?: number; na?: number } } | null;
  debtSnap?: { takeaway?: { title?: string }; headerBadge?: { tone?: string; text?: string } } | null;
  newsTakeaway?: { section?: { title?: string; rows?: { tone?: string }[] } } | null;
  nnTakeaway?: { takeaway?: { title?: string }; kpis?: { momentumLabel?: string; momentumScore?: number } } | null;
  peopleTakeaway?: { takeaway?: { title?: string } } | null;
}

type Dyn = Partial<Pick<ScanSection, "takeaway" | "verdict" | "hero">>;

export function buildScanSections(ctx: ScanCtx): ScanSection[] {
  const dyn: Record<string, Dyn> = {};

  // 2 · Zoning — deterministic permission (RD:4079)
  const perm = ctx.effectiveCompatibility?.permission;
  if (perm) dyn.zoning = perm === "permitted"
    ? { takeaway: <>Your project is <em>allowed by right</em> — no variance needed.</>, verdict: { tone: "good", label: "By-right" } }
    : perm === "special_use"
      ? { takeaway: <>Your project needs <em>Special Use approval</em>.</>, verdict: { tone: "attention", label: "Special use" } }
      : { takeaway: <>Your project likely needs a <em>rezoning</em>.</>, verdict: { tone: "attention", label: "Rezone" } };

  // 3 · Valuation — verdictText + dscrState + capRate (RD:22120-22154).
  //    NOTE: these may live inside the calculator subcomponent. If not in scope, omit ctx.valuation -> summary fallback.
  const v = ctx.valuation;
  if (v?.verdictText || v?.capRate != null) {
    const tone: VerdictTone = v?.dscrState === "good" ? "good" : v?.dscrState === "bad" ? "attention" : "context";
    dyn.valuation = {
      takeaway: mdEmph(v?.verdictText),
      verdict: v?.dscrState ? { tone, label: tone === "good" ? "Pencils" : tone === "attention" ? "Thin" : "Coverage" } : undefined,
      hero: num(v?.capRate) != null ? { value: `${v!.capRate!.toFixed(1)}%`, label: "cap" }
          : num(v?.dscr) != null ? { value: v!.dscr!.toFixed(2), label: "DSCR" } : undefined,
    };
  }

  // 4 · Ownership — assemblage common_control (RD:11001). "Confirm identity" when not exact.
  const cc = ctx.assemblage?.common_control;
  if (cc) dyn.ownership = cc === "exact"
    ? { verdict: { tone: "good", label: "Same owner" } }
    : { takeaway: <>Companion-parcel assemblage — <em>confirm common control</em>.</>, verdict: { tone: "attention", label: "Confirm identity" } };

  // 5 · Debt — debtSnap.takeaway.title + headerBadge.tone (RD:11510/11540)
  const badgeTone = ctx.debtSnap?.headerBadge?.tone;
  if (ctx.debtSnap?.takeaway?.title || badgeTone) {
    const watch = badgeTone === "bad" || badgeTone === "caution";
    dyn.debt = {
      takeaway: mdEmph(ctx.debtSnap?.takeaway?.title),
      verdict: { tone: watch ? "attention" : "good", label: watch ? (ctx.debtSnap?.headerBadge?.text || "Watch") : "Clear" },
    };
  }

  // 6 · Local Market — hmdaTakeaway.headline (RD:18483) + comps count hero (RD:20798)
  const comps = ctx.compsData?.comparables?.length;
  if (ctx.hmdaTakeaway?.headline || comps) dyn.market = {
    takeaway: mdEmph(ctx.hmdaTakeaway?.headline),
    hero: comps ? { value: String(comps), label: "comps" } : undefined,
  };

  // 7 · Transit — headline + access tier (RD:17242-17270)
  const tier = ctx.transitTakeaway?.accessTier;
  const rail = ctx.transitData?.ctaRail?.length;
  if (ctx.transitTakeaway?.headline || tier) dyn.transit = {
    takeaway: mdEmph(ctx.transitTakeaway?.headline),
    verdict: tier ? { tone: tier === "Strong" ? "good" : tier === "Limited" ? "attention" : "context", label: `${tier} access` } : undefined,
    hero: rail ? { value: String(rail), label: "rail stops" } : undefined,
  };

  // 8 · Crime — headline + saferThanPercent + trend (RD:15776/15843)
  const safer = num(ctx.crimeTractData?.violent?.saferThanPercent) ?? num(ctx.crimeTractData?.saferThanPercent);
  if (ctx.crimeTakeaway?.headline || safer != null) dyn.crime = {
    takeaway: mdEmph(ctx.crimeTakeaway?.headline),
    verdict: safer != null ? { tone: safer >= 50 ? "good" : "attention", label: safer >= 50 ? "Lower crime" : "Elevated crime" } : undefined,
    hero: safer != null ? { value: `${Math.round(safer)}th`, label: "pctile" } : undefined,
  };

  // 10 · Corridor — nn takeaway title + momentum (RD:19280 / kpis.momentumLabel)
  if (ctx.nnTakeaway?.takeaway?.title || ctx.nnTakeaway?.kpis?.momentumLabel) dyn.corridor = {
    takeaway: mdEmph(ctx.nnTakeaway?.takeaway?.title),
    verdict: ctx.nnTakeaway?.kpis?.momentumLabel ? { tone: "good", label: ctx.nnTakeaway.kpis.momentumLabel } : undefined,
  };

  // 12 · People — context only; use title if generated, no verdict (RD:20120)
  if (ctx.peopleTakeaway?.takeaway?.title) dyn.people = { takeaway: mdEmph(ctx.peopleTakeaway.takeaway.title) };

  // 13 · Incentives — counts.likely (RD:7333)
  const likely = num(ctx.incMeta?.counts?.likely);
  if (likely != null) dyn.incentives = {
    takeaway: <><em>{likely}</em> of 12 programs likely relevant.</>,
    verdict: likely > 0 ? { tone: "good", label: `${likely} Eligible` } : { tone: "context", label: "None in area" },
    hero: likely > 0 ? { value: String(likely), label: "eligible" } : undefined,
  };

  // 14 · News — section.title + row tones (RD:18580)
  const flagged = ctx.newsTakeaway?.section?.rows?.some((r) => r?.tone === "caution");
  if (ctx.newsTakeaway?.section?.title) dyn.news = {
    takeaway: mdEmph(ctx.newsTakeaway.section.title),
    verdict: flagged ? { tone: "attention", label: "Flagged" } : { tone: "good", label: "Clean" },
  };

  // (overview, proximity, development intentionally unwired — they have no concise generated
  //  one-liner, so they show their muted summary until you write one.)

  return SECTION_ORDER.map((id) => ({ ...SECTION_META[id], ...(dyn[id] || {}) }));
}
```

## File 3 — update the mount in `RunDetail.tsx`

Swap the static `DEFAULT_SECTIONS` for the builder, assembling `ctx` from vars already in
scope. Pass only the ones you can confirm are in scope at this point; omit the rest (they
fall back). Wrap values defensively.

```tsx
import SectionScan from "@/components/report/SectionScan";
import { buildScanSections } from "@/components/report/scanBuilder";

// near the top of the report render, replacing the Step-2 mount:
{new URLSearchParams(window.location.search).has("scan") && (
  <div style={{ maxWidth: 920, margin: "0 auto 32px" }}>
    <SectionScan
      storageKey={`kyp-scan-${runId}`}
      sections={buildScanSections({
        transitTakeaway,            // RD:2423
        transitData,                // RD (useTransitProximity)
        crimeTakeaway,              // RD:2411
        crimeTractData,             // RD (useCrimeTract…)
        hmdaTakeaway,               // RD:2435
        compsData,                  // RD:2584
        effectiveCompatibility,     // RD:4079
        assemblage,                 // RD:2041
        incMeta,                    // RD:1903
        debtSnap: debtSnapRec,      // RD:1820 (has .takeaway; add .headerBadge if your model exposes it)
        newsTakeaway,               // RD:2448
        nnTakeaway,                 // RD:2464
        peopleTakeaway: peopleTakeawayRec, // RD:2480
        // valuation: {...}         // OPTIONAL — capRate/dscr/verdictText live in the calculator
                                    //   subcomponent; wire later by lifting or via a small context. Omit for now.
      })}
    />
  </div>
)}
```

## ✅ Done-when checklist
- [ ] `sectionRegistry.tsx` now exports `SECTION_META` + `SECTION_ORDER` (static only); the old
      `DEFAULT_SECTIONS` object is gone and nothing imports it.
- [ ] `scanBuilder.tsx` added; `RunDetail` builds sections via `buildScanSections(ctx)`.
- [ ] With `?scan=1`, wired sections show REAL takeaways (transit, crime, market/HMDA, news,
      corridor, debt, ownership, zoning, incentives, people-if-generated); unwired ones
      (overview, proximity, development, valuation) show their muted summary — no blanks, no
      crashes if a query is still null.
- [ ] Every `anchorId` resolves (click "Open full section →" on each; fix any miss against the
      `jumpSections` map at RD:3202–3242).
- [ ] Verdict colors read right: transit tier, crime percentile, ownership "Confirm identity"
      (orange), incentives eligible-count, etc.
- [ ] `git diff` touches only `sectionRegistry.tsx`, the new `scanBuilder.tsx`, and the small
      guarded mount block in `RunDetail.tsx`.

## Notes / next
- **Valuation** is the one left unwired because its metrics live inside the calculator
  subcomponent. When you want it, the clean fix is a tiny React context (or lifting `capRate`/
  `dscr`/`verdictText`) so the scan can read them — small, isolated task.
- Once the wired sections look right behind the flag, the last step is making the scan the
  **default** report view (drop the `?scan=1` gate) and, optionally, expanding sections
  **inline** instead of scroll-to-anchor.
