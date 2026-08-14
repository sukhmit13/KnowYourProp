// Debt Snapshot — Stage 2: reconcile Stage 1's extracted documents into an
// active lien stack. Pure deterministic code, no LLM, no fetching.
//
// Core rules:
// 1. Position = recording order + release status, never loan-to-value.
// 2. A modification is NOT new debt — it rewrites the existing mortgage's
//    terms. Original terms are kept for display; effective terms drive
//    everything downstream. Latest modification wins.
// 3. A release must match a mortgage before it can satisfy it. Doc-ref match
//    preferred; the fuzzy fallback is conservative (lender AND amount AND
//    date window) and flagged "inferred — verify". Never satisfy on amount
//    alone — a false "satisfied" hides a real lien.
// 4. An assignment changes the holder, not the debt.
// 5. Maturity is bucketed off the EFFECTIVE (modified) date against today.

import type { ExtractedRecorderDoc } from "./recorderDocIngest";

const RELEASE_MATCH_WINDOW_DAYS = 183; // ~6 months fallback window
const MATURITY_NOW_WINDOW_DAYS = 90;   // "at maturity" if within this of today

export interface MortgageModification {
  doc_number: string;
  recording_date: string | null;
  new_amount: number | null;
  new_maturity_date: string | null;
  new_interest_rate: number | null;
  summary: string | null;
}

export interface ReconciledMortgage {
  doc_number: string;
  lender: string | null;
  borrower: string | null;
  recording_date: string | null;
  execution_date: string | null;
  pins: string[];
  original_amount: number | null;
  original_maturity_date: string | null;
  original_interest_rate: number | null;
  index_consideration_amount: number | null;
  effective_amount: number | null;
  effective_maturity_date: string | null;
  effective_interest_rate: number | null;
  is_blanket: boolean;
  extraction_confidence: string;
  satisfied: boolean;
  satisfied_by: string | null;
  satisfy_match: "doc-ref" | "inferred — verify" | null;
  modified: boolean;
  modifications: MortgageModification[];
  assigned_to: string | null;
  position: number | null;
  purchase_money: boolean;
  references_docs: string[];
  maturity_source?: "modification" | "recorded" | "estimated" | "unknown";
  maturity_status?: "current" | "at_maturity" | "past_maturity" | "estimated_balloon_may_have_passed" | "unknown";
  past_maturity?: boolean | null;
  // Stage 3 maturity estimation (server/debtMaturityEstimate.ts) — only set
  // when the recorded documents are silent on maturity.
  is_credit_line?: boolean;
  revolving?: boolean;                              // line of credit — no fixed maturity, never estimated
  maturity_basis?: string | null;                   // "7-yr balloon (commercial term)" etc.
  maturity_note?: string | null;                    // hedge/verify wording for display
  maturity_estimate_confidence?: "normal" | "low";  // low = possible extraction gap, not a silent document
}

export interface LienStack {
  active: ReconciledMortgage[];
  satisfied: ReconciledMortgage[];
  unmatched_releases: string[];
  unmatched_modifications: string[];
  subordinations: string[];
  counts: { mortgages: number; active: number; mods: number };
}

// Returns null when either date is missing or not a real calendar date —
// Stage 1 only validates the YYYY-MM-DD *shape*, so "2021-02-31" can arrive.
const parseDate = (s: string | null | undefined): number | null => {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const t = new Date(`${s}T00:00:00Z`).getTime();
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString().slice(0, 10) === s ? t : null; // rejects rollovers like Feb 31
};
const daysBetween = (a: string, b: string): number | null => {
  const ta = parseDate(a), tb = parseDate(b);
  return ta === null || tb === null ? null : Math.round((tb - ta) / 86400000);
};

// Doc numbers appear with cosmetic variations across instruments — "87 084 781"
// vs "87084781", leading zeros — so all reference matching uses a normal form.
const normDoc = (s: string): string => (s || "").replace(/[^0-9A-Za-z]/g, "").replace(/^0+/, "");

export function reconcile(docs: ExtractedRecorderDoc[], todayISO?: string): LienStack {
  // ---- build mortgage records; effective terms start = original ----
  const mortgages: ReconciledMortgage[] = docs
    .filter(d => d.doc_type === "mortgage")
    .map(m => ({
      doc_number: m.doc_number,
      lender: m.parties?.lender ?? null,
      borrower: m.parties?.borrower ?? null,
      recording_date: m.recording_date,
      execution_date: m.execution_date ?? null,
      pins: m.pins ?? [],
      original_amount: m.amount ?? null,
      original_maturity_date: m.maturity_date ?? null,
      original_interest_rate: m.interest_rate ?? null,
      index_consideration_amount: m.index_consideration_amount ?? null,
      effective_amount: m.amount ?? null,
      effective_maturity_date: m.maturity_date ?? null,
      effective_interest_rate: m.interest_rate ?? null,
      is_blanket: m.is_blanket || (m.pins?.length ?? 0) > 1,
      extraction_confidence: m.extraction_confidence,
      satisfied: false, satisfied_by: null, satisfy_match: null,
      modified: false, modifications: [], assigned_to: null,
      position: null, purchase_money: false,
      references_docs: m.references_docs ?? [],
      // tri-state: true/false from a post-flag extraction; undefined = legacy
      // cached doc that predates the flag — the estimator must NOT treat that
      // as "confirmed closed-end" (a cached LOC would get ballooned).
      is_credit_line: typeof m.is_credit_line === "boolean" ? m.is_credit_line : undefined,
    }));
  // Normalized-key collisions make a reference ambiguous — matching the wrong
  // mortgage could satisfy/modify the wrong lien, so ambiguous keys resolve to
  // nothing (the release then surfaces in unmatched_releases instead).
  const byNorm = new Map<string, ReconciledMortgage[]>();
  for (const m of mortgages) {
    const k = normDoc(m.doc_number);
    byNorm.set(k, [...(byNorm.get(k) ?? []), m]);
  }
  const mById = new Map<string, ReconciledMortgage>();
  byNorm.forEach((list, k) => { if (list.length === 1) mById.set(k, list[0]); });
  const findRef = (ids: string[] | null | undefined): ReconciledMortgage[] =>
    (ids ?? []).map(id => mById.get(normDoc(id))).filter((m): m is ReconciledMortgage => !!m);

  const unmatchedReleases: string[] = [];
  const unmatchedModifications: string[] = [];

  // ---- 1. RELEASES / SATISFACTIONS ----
  for (const r of docs.filter(d => d.doc_type === "release" || d.doc_type === "satisfaction")) {
    const refs = findRef(r.references_docs);
    if (refs.length) {
      for (const m of refs) {
        m.satisfied = true; m.satisfied_by = r.doc_number; m.satisfy_match = "doc-ref";
      }
    } else {
      // conservative fallback: same lender AND same amount, within the window. Flagged.
      const cand = mortgages.find(m => {
        if (m.satisfied) return false;
        if (!(m.lender && r.parties?.lender && m.lender === r.parties.lender)) return false;
        if (!(m.original_amount && r.amount && m.original_amount === r.amount)) return false;
        if (!m.recording_date || !r.recording_date) return false;
        const d = daysBetween(m.recording_date, r.recording_date);
        // must be a real, non-negative interval — a release can't predate its
        // mortgage, and invalid dates must never produce an inferred satisfaction
        return d !== null && d >= 0 && d <= RELEASE_MATCH_WINDOW_DAYS + 3650;
      });
      if (cand) { cand.satisfied = true; cand.satisfied_by = r.doc_number; cand.satisfy_match = "inferred — verify"; }
      else unmatchedReleases.push(r.doc_number);
    }
  }

  // ---- 2. MODIFICATIONS supersede terms (NOT new debt) ----
  for (const mod of docs.filter(d => d.doc_type === "modification")) {
    const m = (mod.modifies?.references_doc ? mById.get(normDoc(mod.modifies.references_doc)) : undefined)
      ?? findRef(mod.references_docs)[0] ?? null;
    if (!m) { unmatchedModifications.push(mod.doc_number); continue; }
    const chg = mod.modifies ?? ({} as NonNullable<ExtractedRecorderDoc["modifies"]>);
    m.modified = true;
    m.modifications.push({
      doc_number: mod.doc_number, recording_date: mod.recording_date,
      new_amount: chg.new_amount ?? null, new_maturity_date: chg.new_maturity_date ?? null,
      new_interest_rate: chg.new_interest_rate ?? null, summary: chg.summary ?? null,
    });
  }
  // apply the LATEST modification's stated values as effective (several mods = newest wins)
  for (const m of mortgages) {
    if (!m.modifications.length) continue;
    m.modifications.sort((a, b) => (a.recording_date || "").localeCompare(b.recording_date || ""));
    for (const mod of m.modifications) { // walk oldest→newest so latest non-null wins
      if (mod.new_amount != null) m.effective_amount = mod.new_amount;
      if (mod.new_maturity_date != null) m.effective_maturity_date = mod.new_maturity_date;
      if (mod.new_interest_rate != null) m.effective_interest_rate = mod.new_interest_rate;
    }
  }

  // ---- 3. ASSIGNMENTS: holder changes, debt does not ----
  for (const a of docs.filter(d => d.doc_type === "assignment")) {
    const m = findRef(a.references_docs)[0];
    if (m) m.assigned_to = a.parties?.assignee ?? a.parties?.lender ?? null;
  }

  // ---- 4. ACTIVE STACK + positions (recording order) ----
  const active = mortgages.filter(m => !m.satisfied)
    .sort((a, b) => (a.recording_date || "").localeCompare(b.recording_date || ""));
  active.forEach((m, i) => { m.position = i + 1; });
  const deeds = docs.filter(d => d.doc_type === "deed");
  for (const m of active) { // purchase-money: mortgage recorded same day as a deed
    if (deeds.some(d => d.recording_date && d.recording_date === m.recording_date)) m.purchase_money = true;
  }

  // ---- 5. EFFECTIVE MATURITY vs TODAY (modification supersedes) ----
  const today = todayISO ?? new Date().toISOString().slice(0, 10);
  for (const m of active) {
    // "modification" provenance only when a modification actually SUPPLIED the
    // effective maturity — a rate/amount-only mod leaves a recorded date recorded.
    m.maturity_source = (m.effective_maturity_date && m.modifications.some(x => x.new_maturity_date != null)) ? "modification"
      : m.original_maturity_date ? "recorded" : "unknown";
    if (!m.effective_maturity_date) { m.maturity_status = "unknown"; m.past_maturity = null; continue; }
    const d = daysBetween(m.effective_maturity_date, today); // >0 => today is after maturity
    if (d === null) { m.maturity_status = "unknown"; m.past_maturity = null; continue; } // invalid calendar date
    m.past_maturity = d > 0;
    m.maturity_status = d > MATURITY_NOW_WINDOW_DAYS ? "past_maturity"
      : d < -MATURITY_NOW_WINDOW_DAYS ? "current"
      : "at_maturity"; // within ±90 days of today
  }

  return {
    active,
    satisfied: mortgages.filter(m => m.satisfied),
    unmatched_releases: unmatchedReleases,
    unmatched_modifications: unmatchedModifications,
    subordinations: docs.filter(d => d.doc_type === "subordination").map(d => d.doc_number),
    counts: {
      mortgages: mortgages.length,
      active: active.length,
      mods: docs.filter(d => d.doc_type === "modification").length,
    },
  };
}
