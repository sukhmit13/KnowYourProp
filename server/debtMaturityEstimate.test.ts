// Stage 3 maturity-estimation tests — run with: npx tsx server/debtMaturityEstimate.test.ts
// Each assert maps to a rule in the consolidated maturity spec.

import assert from "node:assert/strict";
import { reconcile, type ReconciledMortgage } from "./debtReconcile";
import { applyMaturityEstimates, termFor, DEFAULT_TERMS } from "./debtMaturityEstimate";
import type { ExtractedRecorderDoc } from "./recorderDocIngest";

const base = (o: Partial<ExtractedRecorderDoc>): ExtractedRecorderDoc => ({
  doc_number: "0", doc_type: "other", recording_date: null, execution_date: null,
  pins: [], parties: { borrower: null, lender: null, assignor: null, assignee: null },
  amount: null, index_consideration_amount: null, interest_rate: null, maturity_date: null,
  modifies: null, references_docs: [], debtor_name: null, is_partial: false, is_blanket: false,
  extraction_confidence: "high", text_source: "text-layer", is_credit_line: false, ...o,
});
const mortgage = (o: Partial<ExtractedRecorderDoc>) => base({ doc_type: "mortgage", ...o });
const TODAY = "2026-08-12";
const stackFor = (docs: ExtractedRecorderDoc[], residentialZoning: boolean | null) => {
  const s = reconcile(docs, TODAY);
  applyMaturityEstimates(s.active, { residentialZoning }, TODAY);
  return s.active;
};

// 1) commercial TERM mortgage, no stated maturity => ~7-yr balloon, estimated
{
  const [m] = stackFor([mortgage({ doc_number: "M1", recording_date: "2022-03-01", amount: 900000, parties: { borrower: "B LLC", lender: "Bank", assignor: null, assignee: null } })], false);
  assert.equal(m.maturity_source, "estimated");
  assert.equal(m.effective_maturity_date, "2029-03-01");
  assert.match(m.maturity_basis!, /7-yr balloon \(commercial term\)/);
  assert.equal(m.maturity_status, "current");
  assert.equal(m.past_maturity, null, "estimate must never set hard past_maturity");
}

// 2) business/commercial LINE OF CREDIT => revolving, NO fixed term, "renews; verify"
{
  const [m] = stackFor([mortgage({ doc_number: "L1", recording_date: "2020-01-01", is_credit_line: true, parties: { borrower: "B LLC", lender: "Bank", assignor: null, assignee: null } })], false);
  assert.equal(m.revolving, true);
  assert.equal(m.effective_maturity_date, null, "credit line must never get a balloon date");
  assert.equal(m.maturity_source, "unknown");
  assert.match(m.maturity_note!, /revolving, renews; no fixed maturity, verify/);
}

// 3) HELOC (residential credit line) => "draw/repay term, verify", not a 10-yr payoff
{
  const [m] = stackFor([mortgage({ doc_number: "H1", recording_date: "2020-01-01", is_credit_line: true })], true);
  assert.equal(m.revolving, true);
  assert.equal(m.effective_maturity_date, null);
  assert.match(m.maturity_note!, /home-equity line — draw\/repay term, verify/);
}

// 4) residential 1st => 30-yr; residential 2nd (closed-end) => 10-yr; SBA => its schedule
{
  const active = stackFor([
    mortgage({ doc_number: "F1", recording_date: "2010-05-01", amount: 400000 }),
    mortgage({ doc_number: "S2", recording_date: "2015-06-01", amount: 60000 }),
  ], true);
  assert.equal(active[0].effective_maturity_date, "2040-05-01");
  assert.match(active[0].maturity_basis!, /30-yr \(residential\)/);
  assert.equal(active[1].effective_maturity_date, "2025-06-01"); // 10-yr junior
  assert.match(active[1].maturity_basis!, /2nd-lien 10-yr/);
  assert.equal(active[1].maturity_status, "estimated_balloon_may_have_passed");

  const sba = termFor({ lender: "U.S. Small Business Administration", position: 1 }, { residentialZoning: false });
  assert.equal(sba.term, DEFAULT_TERMS.SBA_RE_TERM_YRS);
  assert.match(sba.basis!, /SBA schedule/);
}

// 5) ESTIMATED past date => soft "estimated balloon may have passed", NOT hard past
{
  const [m] = stackFor([mortgage({ doc_number: "M2", recording_date: "2012-01-01", amount: 1000000 })], false);
  assert.equal(m.maturity_source, "estimated"); // 2019 balloon, long past
  assert.equal(m.maturity_status, "estimated_balloon_may_have_passed");
  assert.notEqual(m.maturity_status, "past_maturity");
  assert.equal(m.past_maturity, null);
  assert.match(m.maturity_note!, /estimated term — confirm actual maturity/);
}

// 5b) modification recorded AFTER the estimated balloon => never "may have passed"
{
  const [m] = stackFor([
    mortgage({ doc_number: "M3", recording_date: "2012-01-01", amount: 500000 }),
    base({ doc_number: "X1", doc_type: "modification", recording_date: "2021-06-01", references_docs: ["M3"], modifies: { references_doc: "M3", new_amount: null, new_maturity_date: null, new_interest_rate: 4.0, summary: "rate change" } }),
  ], false);
  assert.equal(m.maturity_source, "estimated"); // mod stated no new maturity — still silent paper
  assert.equal(m.maturity_status, "current", "mod after estimated balloon implies extension — never 'may have passed'");
}

// 6) read-first: any stated or modified maturity overrides ALL estimates, verbatim
{
  const [stated] = stackFor([mortgage({ doc_number: "M4", recording_date: "2018-01-01", maturity_date: "2048-07-01" })], false);
  assert.equal(stated.maturity_source, "recorded");
  assert.equal(stated.effective_maturity_date, "2048-07-01", "recorded date used verbatim — no 7-yr balloon");
  assert.equal(stated.maturity_basis ?? null, null);

  const [modded] = stackFor([
    mortgage({ doc_number: "M5", recording_date: "2018-01-01", maturity_date: "2023-01-01" }),
    base({ doc_number: "X2", doc_type: "modification", recording_date: "2022-06-01", references_docs: ["M5"], modifies: { references_doc: "M5", new_amount: null, new_maturity_date: "2030-01-01", new_interest_rate: null, summary: "extended" } }),
  ], false);
  assert.equal(modded.maturity_source, "modification");
  assert.equal(modded.effective_maturity_date, "2030-01-01");
}

// 7) maturity_date==null with LOW extraction_confidence => "not captured — verify", low-confidence estimate
{
  const [m] = stackFor([mortgage({ doc_number: "M6", recording_date: "2020-01-01", extraction_confidence: "low" })], false);
  assert.equal(m.maturity_source, "estimated");
  assert.equal(m.maturity_estimate_confidence, "low");
  assert.match(m.maturity_note!, /maturity not captured — may be stated in the document; verify/);
}

// 8) tunable: COMMERCIAL_BALLOON_YRS=5 changes only the commercial-term estimate
{
  const T = { ...DEFAULT_TERMS, COMMERCIAL_BALLOON_YRS: 5 };
  const com = termFor({ lender: "Bank", position: 1 }, { residentialZoning: false }, T);
  assert.equal(com.term, 5);
  assert.match(com.basis!, /5-yr balloon/);
  assert.equal(termFor({ lender: "Bank", position: 1 }, { residentialZoning: true }, T).term, 30);
  assert.equal(termFor({ lender: "Bank", position: 2 }, { residentialZoning: true }, T).term, 10);
}

// 9) zoning unknown => no term estimate (never guess); credit-line flag still applies
{
  const [m] = stackFor([mortgage({ doc_number: "M7", recording_date: "2020-01-01" })], null);
  assert.equal(m.maturity_source, "unknown");
  assert.equal(m.effective_maturity_date, null);
  const [loc] = stackFor([mortgage({ doc_number: "L2", recording_date: "2020-01-01", is_credit_line: true })], null);
  assert.equal(loc.revolving, true);
  assert.match(loc.maturity_note!, /line of credit — revolving/);
}

// 10) LEGACY CACHE GUARD: extraction predates is_credit_line (undefined) => NO estimate ever
//     (we cannot tell a closed-end loan from a cached line of credit)
{
  const legacy = mortgage({ doc_number: "M8", recording_date: "2020-01-01" });
  delete (legacy as any).is_credit_line;
  const [m] = stackFor([legacy], false);
  assert.equal(m.maturity_source, "unknown", "legacy cached doc must never be ballooned");
  assert.equal(m.effective_maturity_date, null);
  assert.notEqual(m.revolving, true);
}

// 11) provenance: a rate/amount-only modification must NOT relabel a recorded maturity as "modification"
{
  const [m] = stackFor([
    mortgage({ doc_number: "M9", recording_date: "2018-01-01", maturity_date: "2048-01-01" }),
    base({ doc_number: "X3", doc_type: "modification", recording_date: "2021-01-01", references_docs: ["M9"], modifies: { references_doc: "M9", new_amount: 450000, new_maturity_date: null, new_interest_rate: null, summary: "amount change" } }),
  ], false);
  assert.equal(m.maturity_source, "recorded", "maturity provenance stays 'recorded' when the mod didn't touch maturity");
  assert.equal(m.effective_maturity_date, "2048-01-01");
}

console.log("✓ all maturity-estimation tests passed");
