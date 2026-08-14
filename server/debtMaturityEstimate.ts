// Debt Snapshot — Stage 3 maturity estimation (`termFor`). Pure deterministic
// code, no LLM. Runs AFTER resolveState so positions/lien_kind reflect the
// current-owner stack.
//
// GOVERNING RULE — the recorded document wins, always. A stated maturity
// (or a modification's new maturity) IS the maturity; everything here is a
// fallback used ONLY when the paper is silent (maturity_source === "unknown").
// An estimate never overrides, contradicts, or sits next to a recorded date.
//
// Discipline:
// - Lines of credit are revolving — they never get a term or a balloon date.
// - An estimate never asserts a hard "past maturity"; at most a soft
//   "estimated balloon may have passed — verify".
// - maturity_date null + low/medium extraction confidence is an EXTRACTION
//   GAP, not a silent document — label "maturity not captured — verify" and
//   mark the estimate low-confidence.
// - Residential vs commercial keys off the report's zoning class; when zoning
//   is unknown we do NOT guess a term (credit-line flagging still applies —
//   that is document-based).

import type { ReconciledMortgage } from "./debtReconcile";

// ── Tunable constants ────────────────────────────────────────────────────────
export interface MaturityTermConstants {
  RESIDENTIAL_TERM_YRS: number;        // residential 1st mortgage, self-amortizing
  JUNIOR_RESIDENTIAL_TERM_YRS: number; // residential 2nd/junior (home-equity / 2nd mortgage)
  COMMERCIAL_BALLOON_YRS: number;      // commercial TERM mortgage — balloon at term (5 = conservative floor)
  SBA_RE_TERM_YRS: number;             // SBA real-estate schedule: 7(a) ≤25yr RE; 504 = 10/20/25 → 25 central
}
export const DEFAULT_TERMS: MaturityTermConstants = {
  RESIDENTIAL_TERM_YRS: 30,
  JUNIOR_RESIDENTIAL_TERM_YRS: 10,
  COMMERCIAL_BALLOON_YRS: 7,
  SBA_RE_TERM_YRS: 25,
};

export interface ParcelZoning {
  /** true = residential zoning class from the report; false = commercial;
   *  null = zoning unknown → no term estimate (never guess). */
  residentialZoning: boolean | null;
}

export const isCreditLine = (m: Pick<ReconciledMortgage, "is_credit_line">): boolean =>
  m.is_credit_line === true;

export const isSBALender = (lender: string | null | undefined): boolean =>
  !!lender && /small\s+business\s+administration|\bS\.?B\.?A\.?\b|certified\s+development\s+co/i.test(lender);

export interface TermEstimate {
  term: number | null;       // years; null = no fixed payoff (revolving) or cannot estimate
  basis: string | null;      // human label for the tile
  revolving: boolean;
  note: string | null;
}

/** The estimate branch — called ONLY when the document states no maturity. */
export function termFor(
  m: Pick<ReconciledMortgage, "is_credit_line" | "lender" | "position"> & { lien_kind?: string },
  parcel: ParcelZoning,
  T: MaturityTermConstants = DEFAULT_TERMS,
): TermEstimate {
  // A) LINES OF CREDIT have no fixed amortizing payoff — never assign a term.
  if (isCreditLine(m)) {
    return {
      term: null, basis: null, revolving: true,
      note: parcel.residentialZoning === true
        ? "home-equity line — draw/repay term, verify"
        : parcel.residentialZoning === false
          ? "business/commercial line of credit — revolving, renews; no fixed maturity, verify"
          : "line of credit — revolving, renews; no fixed maturity, verify",
    };
  }
  // B) SBA schedule wins among term estimates (recorded mortgage → real-estate secured)
  if (isSBALender(m.lender)) {
    return { term: T.SBA_RE_TERM_YRS, basis: "SBA schedule (real estate)", revolving: false, note: null };
  }
  // Zoning unknown → estimating would be a guess; the rules key off the report's zoning class.
  if (parcel.residentialZoning === null) return { term: null, basis: null, revolving: false, note: null };

  const junior = (m.position ?? 1) >= 2 || m.lien_kind === "junior";

  // C) residential
  if (parcel.residentialZoning && junior)
    return { term: T.JUNIOR_RESIDENTIAL_TERM_YRS, basis: `2nd-lien ${T.JUNIOR_RESIDENTIAL_TERM_YRS}-yr (residential)`, revolving: false, note: null };
  if (parcel.residentialZoning)
    return { term: T.RESIDENTIAL_TERM_YRS, basis: `${T.RESIDENTIAL_TERM_YRS}-yr (residential)`, revolving: false, note: null };

  // D) commercial TERM mortgage → balloon at term (amortized ~20–25yr)
  return { term: T.COMMERCIAL_BALLOON_YRS, basis: `${T.COMMERCIAL_BALLOON_YRS}-yr balloon (commercial term)`, revolving: false, note: null };
}

const addYears = (isoDate: string, years: number): string | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const y = Number(isoDate.slice(0, 4)) + years;
  return `${y}${isoDate.slice(4)}`;
};

/**
 * Mutates each ACTIVE mortgage whose documents are silent on maturity
 * (maturity_source === "unknown") with the fallback estimate. Read-first
 * precedence is enforced by that guard: "recorded" and "modification"
 * sources are never touched.
 */
export function applyMaturityEstimates(
  active: ReconciledMortgage[],
  parcel: ParcelZoning,
  todayISO?: string,
  T: MaturityTermConstants = DEFAULT_TERMS,
): void {
  const today = todayISO ?? new Date().toISOString().slice(0, 10);
  for (const m of active) {
    // 🔴 Read-first: a stated or modified maturity ignores every estimate.
    if (m.maturity_source !== "unknown" || m.effective_maturity_date) continue;

    const est = termFor(m, parcel, T);

    // Legacy-cache guard: is_credit_line === undefined means the extraction
    // predates the flag — we cannot tell a closed-end loan from a line of
    // credit, so NEVER assign a term (a cached LOC must not be ballooned).
    // Estimates activate once the doc is (re-)extracted with the flag.
    if (typeof m.is_credit_line !== "boolean") continue;

    if (est.revolving) {
      m.revolving = true;
      m.maturity_note = est.note;
      m.maturity_status = "unknown";   // no date — the card renders "revolving", never a balloon
      m.past_maturity = null;
      continue;
    }
    if (est.term === null) continue;   // cannot estimate (zoning unknown) — leave "unknown"

    // Extraction-gap discipline: a missed read must not masquerade as a silent document.
    const gap = m.extraction_confidence === "low" || m.extraction_confidence === "medium";

    if (!m.recording_date) continue;   // no anchor date to project from
    const estDate = addYears(m.recording_date, est.term);
    if (!estDate) continue;

    m.effective_maturity_date = estDate;
    m.maturity_source = "estimated";
    m.maturity_basis = est.basis;
    m.maturity_estimate_confidence = gap ? "low" : "normal";
    m.maturity_note = gap
      ? "maturity not captured — may be stated in the document; verify"
      : "estimated term — confirm actual maturity";
    m.past_maturity = null;            // an estimate NEVER asserts hard past-due

    // Guard: a modification recorded after the estimated balloon implies an
    // extension we couldn't read — never claim the balloon passed.
    const lastMod = m.modifications?.length
      ? m.modifications[m.modifications.length - 1].recording_date : null;
    const modAfterBalloon = !!lastMod && lastMod > estDate;

    if (estDate < today && !modAfterBalloon) {
      m.maturity_status = "estimated_balloon_may_have_passed"; // soft status only
    } else {
      m.maturity_status = "current";
    }
  }
}
