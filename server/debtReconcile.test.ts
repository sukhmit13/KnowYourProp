// Stage 2 reconcile tests — run with: npx tsx server/debtReconcile.test.ts
// Each assert maps to a rule in the Stage 2 spec, plus the 3014 W Irving Park
// ground-truth regression against the live recorder_doc_cache extractions.

import assert from "node:assert/strict";
import { reconcile } from "./debtReconcile";
import type { ExtractedRecorderDoc } from "./recorderDocIngest";

const base = (o: Partial<ExtractedRecorderDoc>): ExtractedRecorderDoc => ({
  doc_number: "0", doc_type: "other", recording_date: null, execution_date: null,
  pins: [], parties: { borrower: null, lender: null, assignor: null, assignee: null },
  amount: null, index_consideration_amount: null, interest_rate: null, maturity_date: null,
  modifies: null, references_docs: [], debtor_name: null, is_partial: false, is_blanket: false,
  extraction_confidence: "high", text_source: "text-layer", ...o,
});

// ── 1. doc-ref release satisfies and removes from active ──
{
  const s = reconcile([
    base({ doc_number: "M1", doc_type: "mortgage", recording_date: "2015-01-01", amount: 100000, parties: { borrower: "B", lender: "L", assignor: null, assignee: null } }),
    base({ doc_number: "R1", doc_type: "release", recording_date: "2020-01-01", references_docs: ["M1"] }),
  ]);
  assert.equal(s.satisfied.length, 1);
  assert.equal(s.satisfied[0].satisfy_match, "doc-ref");
  assert.equal(s.active.length, 0, "doc-ref-released mortgage must be absent from active");
}

// ── 2. modification supersedes terms; latest wins; not new debt ──
{
  const s = reconcile([
    base({ doc_number: "M1", doc_type: "mortgage", recording_date: "2015-01-01", amount: 100000, interest_rate: 5, maturity_date: "2020-01-01" }),
    base({ doc_number: "MOD1", doc_type: "modification", recording_date: "2018-01-01", references_docs: ["M1"], modifies: { references_doc: "M1", new_amount: 90000, new_maturity_date: "2022-01-01", new_interest_rate: 4.5, summary: "first" } }),
    base({ doc_number: "MOD2", doc_type: "modification", recording_date: "2021-01-01", references_docs: ["M1"], modifies: { references_doc: "M1", new_amount: null, new_maturity_date: "2030-01-01", new_interest_rate: null, summary: "second" } }),
  ], "2026-08-12");
  assert.equal(s.counts.mortgages, 1, "modifications must not create new debt");
  const m = s.active[0];
  assert.equal(m.modified, true);
  assert.equal(m.effective_maturity_date, "2030-01-01", "latest mod's maturity wins");
  assert.equal(m.effective_amount, 90000, "latest non-null value wins (MOD2 amount null keeps MOD1's)");
  assert.equal(m.effective_interest_rate, 4.5);
  assert.equal(m.original_interest_rate, 5, "original terms preserved");
  assert.equal(m.maturity_status, "current");
}

// ── 3. positions contiguous 1..n in recording order over active only ──
{
  const s = reconcile([
    base({ doc_number: "M3", doc_type: "mortgage", recording_date: "2020-05-01" }),
    base({ doc_number: "M1", doc_type: "mortgage", recording_date: "2010-01-01" }),
    base({ doc_number: "M2", doc_type: "mortgage", recording_date: "2015-03-01" }),
    base({ doc_number: "R1", doc_type: "release", references_docs: ["M2"] }),
  ]);
  assert.deepEqual(s.active.map(m => m.doc_number), ["M1", "M3"]);
  assert.deepEqual(s.active.map(m => m.position), [1, 2], "positions exactly 1..n, no gaps");
}

// ── 4. never satisfied on amount alone ──
{
  const s = reconcile([
    base({ doc_number: "M1", doc_type: "mortgage", recording_date: "2015-01-01", amount: 100000, parties: { borrower: "B", lender: "Bank A", assignor: null, assignee: null } }),
    base({ doc_number: "R1", doc_type: "release", recording_date: "2016-01-01", amount: 100000, parties: { borrower: null, lender: "Bank B", assignor: null, assignee: null } }),
  ]);
  assert.equal(s.active.length, 1, "amount-only match must NOT satisfy");
  assert.deepEqual(s.unmatched_releases, ["R1"], "unmatched release surfaced, not silent");
  // and when lender+amount both match, it satisfies but is flagged
  const s2 = reconcile([
    base({ doc_number: "M1", doc_type: "mortgage", recording_date: "2015-01-01", amount: 100000, parties: { borrower: "B", lender: "Bank A", assignor: null, assignee: null } }),
    base({ doc_number: "R1", doc_type: "release", recording_date: "2016-01-01", amount: 100000, parties: { borrower: null, lender: "Bank A", assignor: null, assignee: null } }),
  ]);
  assert.equal(s2.satisfied[0].satisfy_match, "inferred — verify");
  for (const m of [...s.satisfied, ...s2.satisfied]) {
    assert.ok(m.satisfy_match === "doc-ref" || m.satisfy_match === "inferred — verify");
  }
}

// ── 5. assignment changes holder, creates no lien ──
{
  const s = reconcile([
    base({ doc_number: "M1", doc_type: "mortgage", recording_date: "2015-01-01", parties: { borrower: "B", lender: "Bank A", assignor: null, assignee: null } }),
    base({ doc_number: "A1", doc_type: "assignment", recording_date: "2018-01-01", references_docs: ["M1"], parties: { borrower: null, lender: null, assignor: "Bank A", assignee: "Bank B" } }),
  ]);
  assert.equal(s.counts.mortgages, 1, "assignment must create no new lien");
  assert.equal(s.active[0].assigned_to, "Bank B");
}

// ── 6. inferred release can never predate its mortgage, and invalid dates never infer ──
{
  const s = reconcile([
    base({ doc_number: "M1", doc_type: "mortgage", recording_date: "2015-01-01", amount: 100000, parties: { borrower: "B", lender: "Bank A", assignor: null, assignee: null } }),
    base({ doc_number: "R1", doc_type: "release", recording_date: "2014-01-01", amount: 100000, parties: { borrower: null, lender: "Bank A", assignor: null, assignee: null } }),
  ]);
  assert.equal(s.active.length, 1, "release predating the mortgage must NOT satisfy");
  assert.deepEqual(s.unmatched_releases, ["R1"]);
  const s2 = reconcile([
    base({ doc_number: "M1", doc_type: "mortgage", recording_date: "2015-02-31", amount: 100000, parties: { borrower: "B", lender: "Bank A", assignor: null, assignee: null } }),
    base({ doc_number: "R1", doc_type: "release", recording_date: "2016-01-01", amount: 100000, parties: { borrower: null, lender: "Bank A", assignor: null, assignee: null } }),
  ]);
  assert.equal(s2.active.length, 1, "invalid calendar date must never produce an inferred satisfaction");
}

// ── 7. invalid maturity date buckets as unknown, not at_maturity ──
{
  const s = reconcile([
    base({ doc_number: "M1", doc_type: "mortgage", recording_date: "2015-01-01", maturity_date: "2021-02-31" }),
  ], "2026-08-12");
  assert.equal(s.active[0].maturity_status, "unknown");
  assert.equal(s.active[0].past_maturity, null);
}

// ── 8. normalized-key collision → ambiguous refs match nothing ──
{
  const s = reconcile([
    base({ doc_number: "0012345", doc_type: "mortgage", recording_date: "2010-01-01" }),
    base({ doc_number: "12345", doc_type: "mortgage", recording_date: "2012-01-01" }),
    base({ doc_number: "R1", doc_type: "release", recording_date: "2020-01-01", references_docs: ["12345"] }),
  ]);
  assert.equal(s.active.length, 2, "ambiguous reference must not satisfy either candidate");
  assert.deepEqual(s.unmatched_releases, ["R1"]);
}

// ── 9. 3014 W Irving Park ground-truth regression (live cache, scoped to parcel) ──
const { db } = await import("./db");
const { recorderDocCache } = await import("@shared/schema");
const rows = await db.select().from(recorderDocCache);
// scope to the 3014 parcel via its recorder index (extracted pins are OCR-noisy)
const { sql } = await import("drizzle-orm");
const idx: any = await db.execute(sql`SELECT documents_json FROM lien_cache WHERE pin = '13133270270000'`);
const parcelDocNums = new Set<string>(
  ((raw => typeof raw === "string" ? JSON.parse(raw) : raw ?? [])(idx.rows?.[0]?.documents_json)).map((d: any) => String(d.documentNumber)),
);
const docs = rows.map(r => r.extraction as ExtractedRecorderDoc)
  .filter(d => parcelDocNums.has(d.doc_number));
const has3014 = docs.some(d => d.doc_number === "1618022008");
if (!has3014) {
  console.warn("SKIP 3014 regression — 1618022008 not in recorder_doc_cache (run ingestParcel('13133270270000') first)");
} else {
  const s = reconcile(docs, "2026-08-12");
  const m = s.active.find(x => x.doc_number === "1618022008");
  assert.ok(m, "1618022008 must be active");
  // NOTE: the spec's "one active at position 1" assumed every old mortgage has
  // a recorded release. The recorder shows NO release for 99996625 (1999) or
  // 0518844084 (2005) — both hit foreclosure filings; parcel sold 2016. Pure
  // Stage 2 rules correctly keep them active (never fake a satisfaction);
  // resolving stale pre-sale liens is Stage 2.5's state-resolution job.
  assert.equal(m!.position, 3);
  // normalization regression: 1991 release writes its ref as "87 084 781"
  assert.ok(s.satisfied.some(x => x.doc_number === "87084781" && x.satisfy_match === "doc-ref"),
    "space-separated doc-ref must still match");
  assert.equal(m!.lender, "Albany Bank and Trust Company, N.A.");
  assert.equal(m!.effective_amount, 399000);
  assert.equal(m!.effective_interest_rate, 3.75);
  assert.equal(m!.effective_maturity_date, "2026-07-05");
  assert.equal(m!.original_interest_rate, 4);
  assert.equal(m!.modified, true);
  assert.equal(m!.maturity_status, "at_maturity", "must be at_maturity — NOT current, NOT past_maturity");
  assert.ok(m!.modifications.some(x => x.doc_number === "2121004479"));
  console.log("3014 stack:", JSON.stringify({ active: s.active.map(x => ({ doc: x.doc_number, pos: x.position, lender: x.lender, amt: x.effective_amount, rate: x.effective_interest_rate, mat: x.effective_maturity_date, status: x.maturity_status })), satisfied: s.satisfied.length, unmatched_releases: s.unmatched_releases, counts: s.counts }, null, 1));
}

console.log("ALL STAGE 2 TESTS PASSED");
process.exit(0);
