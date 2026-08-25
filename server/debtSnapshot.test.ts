// Stage 3 tests — run with: npx tsx server/debtSnapshot.test.ts
// Covers the spec's 🔴 assertions: card/takeaway same-binding, warn styling,
// foreclosure coloring, cleared block, extraction-gap handling, hash-keyed
// regeneration, and the 3014 end-to-end card from the live cache.

import assert from "node:assert/strict";
import { reconcile } from "./debtReconcile";
import { resolveState } from "./debtResolveState";
import { hashSnap, collectSnapNumbers, validateDebtTakeaway, type DebtSnap } from "./debtSnapshot";
import { buildDebtCardModel, fmtDateUS } from "@shared/debtCardModel";
import type { ExtractedRecorderDoc } from "./recorderDocIngest";

const base = (o: Partial<ExtractedRecorderDoc>): ExtractedRecorderDoc => ({
  doc_number: "0", doc_type: "other", recording_date: null, execution_date: null,
  pins: [], parties: { borrower: null, lender: null, assignor: null, assignee: null },
  amount: null, index_consideration_amount: null, interest_rate: null, maturity_date: null,
  modifies: null, references_docs: [], debtor_name: null, is_partial: false, is_blanket: false,
  extraction_confidence: "high", text_source: "text-layer", ...o,
});
const toSnap = (docs: ExtractedRecorderDoc[], today = "2026-08-12", extras: Partial<DebtSnap> = {}): DebtSnap => ({
  ...resolveState(reconcile(docs, today), docs, null, null, today),
  schema_version: 3,
  docs_total: docs.length, report_estimated_value: null, subject_is_commercial: null, ...extras,
});

// ── 1. maturity tile uses warn styling iff at_maturity/past_maturity ──
{
  const snapAt = toSnap([base({ doc_number: "M1", doc_type: "mortgage", recording_date: "2016-06-28", amount: 399000, maturity_date: "2026-07-05", parties: { borrower: "X LLC", lender: "Bank A", assignor: null, assignee: null } })]);
  const mAt = buildDebtCardModel(snapAt, "2026-08-12");
  assert.equal(mAt.tiles.find(t => t.label === "Maturity")!.variant, "warn", "at_maturity → warn tile");
  const snapCur = toSnap([base({ doc_number: "M1", doc_type: "mortgage", recording_date: "2016-06-28", amount: 399000, maturity_date: "2036-07-05", parties: { borrower: "X LLC", lender: "Bank A", assignor: null, assignee: null } })]);
  const mCur = buildDebtCardModel(snapCur, "2026-08-12");
  assert.equal(mCur.tiles.find(t => t.label === "Maturity")!.variant, "neutral", "current → neutral tile");
}

// ── 2. foreclosure tile red ONLY when foreclosure_active ──
{
  const active = toSnap([
    base({ doc_number: "M1", doc_type: "mortgage", recording_date: "2016-06-28", amount: 100000, parties: { borrower: "X LLC", lender: "Bank A", assignor: null, assignee: null } }),
    base({ doc_number: "F1", doc_type: "lis_pendens", recording_date: "2020-01-01" }),
  ]);
  assert.equal(buildDebtCardModel(active, "2026-08-12").tiles.find(t => t.label === "Foreclosure")!.variant, "bad");
  const resolved = toSnap([
    base({ doc_number: "F1", doc_type: "lis_pendens", recording_date: "2012-01-01" }),
    base({ doc_number: "D1", doc_type: "deed", recording_date: "2014-04-24", parties: { borrower: null, lender: null, assignor: "Jane Doe, court appointed receiver", assignee: "NEW LLC" } }),
    base({ doc_number: "M1", doc_type: "mortgage", recording_date: "2016-06-28", amount: 100000, parties: { borrower: "NEW LLC", lender: "Bank A", assignor: null, assignee: null } }),
  ]);
  assert.equal(buildDebtCardModel(resolved, "2026-08-12").tiles.find(t => t.label === "Foreclosure")!.variant, "ok", "resolved distress → green, never red");
}

// ── 3. cleared block hidden when empty ──
{
  const s = toSnap([base({ doc_number: "M1", doc_type: "mortgage", recording_date: "2016-06-28", amount: 100000, parties: { borrower: "X LLC", lender: "Bank A", assignor: null, assignee: null } })]);
  assert.equal(buildDebtCardModel(s, "2026-08-12").cleared, null);
}

// ── 4. extraction_gap: lender "— not extracted", position downgraded — no confident blank ──
{
  const s = toSnap([base({ doc_number: "M1", doc_type: "mortgage", recording_date: "2016-06-28", parties: { borrower: null, lender: null, assignor: null, assignee: null }, extraction_confidence: "low" })]);
  s.active[0].extraction_gap = true; // Stage 2.5 sets this for gap docs; force for the fixture
  const m = buildDebtCardModel(s, "2026-08-12");
  assert.match(m.tiles.find(t => t.label === "Lender")!.value, /not extracted/);
  const pos = m.tiles.find(t => t.label === "Lien Position")!;
  assert.equal(pos.variant, "warn");
  assert.match(pos.sub!, /low confidence/);
}

// ── 5. takeaway regenerated only when hash(snap) changes ──
{
  const docs = [base({ doc_number: "M1", doc_type: "mortgage", recording_date: "2016-06-28", amount: 399000, maturity_date: "2026-07-05", parties: { borrower: "X LLC", lender: "Bank A", assignor: null, assignee: null } })];
  const h1 = hashSnap(toSnap(docs));
  const h2 = hashSnap(toSnap(docs));
  assert.equal(h1, h2, "same resolved record → same hash → cache hit");
  // report cross-references must NOT bust the cache (display context only)
  const h3 = hashSnap(toSnap(docs, "2026-08-12", { report_estimated_value: 1250000, subject_is_commercial: true }));
  assert.equal(h1, h3, "report context change must not regenerate");
  const h4 = hashSnap(toSnap([...docs, base({ doc_number: "R1", doc_type: "release", recording_date: "2026-08-01", references_docs: ["M1"] })]));
  assert.notEqual(h1, h4, "new recorder doc → new hash → regenerate");
}

// ── 6. takeaway validator: same-binding number tracing + contradiction guards ──
{
  const snap = toSnap([
    base({ doc_number: "1618022008", doc_type: "mortgage", recording_date: "2016-06-28", amount: 399000, index_consideration_amount: 798000, interest_rate: 4, maturity_date: "2021-07-05", parties: { borrower: "HAPPY ARTS LLC", lender: "Albany Bank and Trust Company, N.A.", assignor: null, assignee: null } }),
    base({ doc_number: "2121004479", doc_type: "modification", recording_date: "2021-07-28", modifies: { doc_number: "1618022008", new_amount: 399000, new_maturity_date: "2026-07-05", new_interest_rate: 3.75, summary: "" } as any, references_docs: ["1618022008"] }),
  ]);
  const good = {
    title: "One mortgage in first position — at its modified maturity, so the live question is payoff or extension.",
    rows: [
      { tone: "caution", html: "<b>At maturity now.</b> The <b>$399,000</b> Albany loan hit its modified maturity of <b>7/5/2026</b>; a 2021 modification cut the rate <b>4% → 3.75%</b>.", chip: "Verify" },
      { tone: "good", html: "<b>First position by recording order</b> — the sole active lien on record.", chip: null },
      { tone: "insight", html: "Recorded 6/28/2016 as document 1618022008.", chip: null },
    ],
  };
  assert.equal(validateDebtTakeaway(snap, good).ok, true, "valid takeaway accepted");
  // invented number → reject
  const bad1 = { ...good, rows: [{ tone: "caution", html: "The loan is <b>$450,000</b>.", chip: null }, good.rows[1]] };
  assert.equal(validateDebtTakeaway(snap, bad1).ok, false, "untraceable $450,000 rejected");
  // claims live foreclosure while foreclosure_active=false → reject
  const bad2 = { ...good, rows: [{ tone: "bad", html: "An active <b>foreclosure</b> clouds title.", chip: null }, good.rows[1]] };
  assert.equal(validateDebtTakeaway(snap, bad2).ok, false, "false foreclosure claim rejected");
  // "past due" while status is at_maturity (not past) → reject
  const bad3 = { ...good, rows: [{ tone: "caution", html: "The loan is years past due.", chip: null }, good.rows[1]] };
  assert.equal(validateDebtTakeaway(snap, bad3).ok, false, "false past-due claim rejected");
  // tax lien mention → reject
  const bad4 = { ...good, rows: [{ tone: "caution", html: "A property tax lien exists.", chip: null }, good.rows[1]] };
  assert.equal(validateDebtTakeaway(snap, bad4).ok, false, "tax mention rejected");
  // numbers the card shows are in the allowed set — same binding as the tiles
  const nums = collectSnapNumbers(snap);
  for (const n of ["399,000", "3.75", "4", "2026", "798"]) assert.ok(nums.has(n), `snap number ${n} available to takeaway`);
}

// ── 6b. blanket / cross-collateralized detection (loan-scoped pool) ──
{
  const P1 = "11111110010000", P2 = "11111110020000", P3 = "11111110030000";
  const resolve = (docs: ExtractedRecorderDoc[], parcel: any, opts: any): DebtSnap => ({
    ...resolveState(reconcile(docs, "2026-08-12"), docs, parcel, opts, "2026-08-12"),
    docs_total: docs.length, report_estimated_value: null, subject_is_commercial: null,
  });
  const loan = base({ doc_number: "2500000001", doc_type: "mortgage", recording_date: "2025-01-15", amount: 2950000, maturity_date: "2035-01-15", pins: [P1], parties: { borrower: "OWNER LLC", lender: "Big Bank", assignor: null, assignee: null } });

  // cross-index signal: same doc indexed under a 2nd PIN ⇒ blanket, even though body pins[] named only one
  const s1 = resolve([loan], { pin: P1, value: 1000000 }, { indexByPin: { [P2]: [{ docNumber: "2500000001" }], [P3]: [{ docNumber: "9999999999" }] } });
  assert.equal(s1.active[0].blanket, true, "cross-index ⇒ blanket");
  assert.deepEqual(s1.active[0].blanket_pins, [P2], "pool = union(body, index) — P3 (loan untouched) NEVER in pool");
  assert.equal(s1.active[0].suppress_ltv, true);
  assert.ok(!s1.flags.includes("high_leverage"), "no high-leverage flag on blanket");
  // card render: cross-collateral strip lists blanket_pins; per-parcel LTV only
  // as struck artifact; pooled LTV (or its note) shows; badge names the condition
  const m1 = buildDebtCardModel(s1, "2026-08-12");
  assert.match(m1.tiles.find(t => t.label === "Loan Amount")!.sub!, /blanket · recorded loan/);
  assert.ok(m1.crossCollateral, "cross-collateral strip renders when blanket");
  assert.match(m1.crossCollateral!.heading, /spans 2 parcels/);
  assert.ok(m1.crossCollateral!.pins.some(p => p.self), "subject pin chip present");
  assert.ok(m1.crossCollateral!.pins.some(p => p.label.includes("11-11-111-002")), "sibling pin listed");
  assert.ok(m1.poolLtv, "LTV panel renders");
  assert.equal(m1.poolLtv!.pooledPct, null, "no sibling value ⇒ pooled unavailable");
  assert.match(m1.poolLtv!.note!, /incomplete/);
  assert.match(m1.headerBadge!.text, /cross-collateralized/);

  // pool LTV: complete valuations ⇒ amount / sum; any unvalued pin ⇒ null + note
  const vals: Record<string, number> = { [P2]: 2000000 };
  const s2 = resolve([loan], { pin: P1, value: 1000000 }, { indexByPin: { [P2]: [{ docNumber: "2500000001" }] }, valueOf: (p: string) => vals[p] ?? null });
  assert.equal(s2.active[0].pool_value, 3000000);
  assert.equal(s2.active[0].pool_ltv, +(2950000 / 3000000).toFixed(2));
  assert.equal(s2.active[0].pool_ltv_note, null);
  // pooled LTV renders live (with per-parcel struck as artifact) + validator lets the model cite it
  const s2snap: DebtSnap = { ...s2, report_estimated_value: 1000000, subject_is_commercial: true };
  const m2 = buildDebtCardModel(s2snap, "2026-08-12");
  assert.equal(m2.poolLtv!.pooledPct, 98);
  assert.equal(m2.poolLtv!.perParcelPct, 295, "per-parcel artifact struck, not hidden");
  assert.match(m2.poolLtv!.pooledSub!, /high for commercial/);
  const poolNums = collectSnapNumbers(s2snap);
  assert.ok(poolNums.has("98"), "pooled % citable");
  const pooledRow = {
    title: "One blanket loan across two parcels — leverage only makes sense across the pool.",
    rows: [
      { tone: "caution", html: "<b>Cross-collateralized.</b> Pooled across 2 parcels it's <b>~98% LTV</b> of combined value.", chip: "Verify" },
      { tone: "good", html: "<b>First position by recording order</b> — sole active lien.", chip: null },
    ],
  };
  assert.equal(validateDebtTakeaway(s2snap, pooledRow).ok, true, "pooled LTV citation accepted when pool_ltv present");
  const s1snap: DebtSnap = { ...s1 };
  assert.equal(validateDebtTakeaway(s1snap, pooledRow).ok, false, "LTV wording rejected when pool_ltv is null");
  // adversarial: per-parcel LTV presented as meaningful (no artifact label) → reject
  const perParcelAsReal = {
    title: "Heavily levered parcel.",
    rows: [
      { tone: "caution", html: "The loan runs <b>295% LTV</b> against this parcel's value.", chip: "Verify" },
      { tone: "good", html: "<b>First position by recording order.</b>", chip: null },
    ],
  };
  assert.equal(validateDebtTakeaway(s2snap, perParcelAsReal).ok, false, "per-parcel LTV without artifact label rejected");
  // …but the same figure labeled as an artifact passes
  const perParcelAsArtifact = {
    title: "One blanket loan across two parcels.",
    rows: [
      { tone: "caution", html: "Per-parcel leverage (~295%) is an <b>artifact</b> — pooled it's <b>~98% LTV</b>.", chip: "Verify" },
      { tone: "good", html: "<b>First position by recording order.</b>", chip: null },
    ],
  };
  assert.equal(validateDebtTakeaway(s2snap, perParcelAsArtifact).ok, true, "artifact-labeled per-parcel figure allowed");
  // adversarial: off-by-one pooled % (card shows 98) → reject
  for (const off of ["97", "99"]) {
    const drifted = {
      title: "Blanket loan.",
      rows: [
        { tone: "caution", html: `Pooled it's <b>~${off}% LTV</b> of combined value.`, chip: "Verify" },
        { tone: "good", html: "<b>First position by recording order.</b>", chip: null },
      ],
    };
    assert.equal(validateDebtTakeaway(s2snap, drifted).ok, false, `pooled % drift ${off} vs card 98 rejected`);
  }
  const s3 = resolve([loan], { pin: P1, value: 1000000 }, { indexByPin: { [P2]: [{ docNumber: "2500000001" }] }, valueOf: () => null });
  assert.equal(s3.active[0].pool_ltv, null, "unvalued sibling ⇒ pool_ltv null");
  assert.match(s3.active[0].pool_ltv_note!, /incomplete/);

  // 2821/2825-style regression: $2.95M blanket on the subject, sibling in the pool, no leverage alarm
  const loanBody2 = base({ ...loan, pins: [P1, P2] });
  const s4 = resolve([loanBody2], { pin: P1, value: 1000000 }, {});
  assert.equal(s4.active[0].blanket, true);
  assert.ok(s4.active[0].blanket_pins!.includes(P2));
  assert.equal(s4.active[0].suppress_ltv, true);
  assert.ok(!s4.flags.some(f => /leverage/i.test(f)), "no 'high leverage' flag");

  // truncated-body-PIN regression: extractors copy PINs verbatim — a 10-digit
  // "13-13-327-027" body pin must canonicalize to the 14-digit subject, NOT
  // create a phantom second pool member (false blanket on a one-parcel loan)
  const truncLoan = base({ ...loan, pins: ["13-13-327-027"] });
  const sT = resolve([truncLoan], { pin: "13133270270000", value: 1000000 }, {});
  assert.equal(sT.active[0].blanket, false, "truncated body pin ≠ phantom pool member");
  assert.deepEqual(sT.active[0].blanket_pins, []);
  // malformed pins (neither 10 nor 14 digits) are dropped, never pooled
  const weirdLoan = base({ ...loan, pins: ["13-13-327"] });
  const sW = resolve([weirdLoan], { pin: "13133270270000", value: 1000000 }, {});
  assert.equal(sW.active[0].blanket, false, "malformed pin dropped from pool");

  // soft signal: amount >> parcel value AND another pooled pin exists — but never from value alone
  const soloBig = base({ ...loan, pins: [P1] });
  const s5 = resolve([soloBig], { pin: P1, value: 1000000 }, {});
  assert.equal(s5.active[0].blanket, false, "big loan + NO other parcel ⇒ not blanket");
  assert.deepEqual(s5.active[0].blanket_pins, []);
}

// ── 7. 3014 W Irving Park end-to-end from the live cache ──
const { db } = await import("./db");
const { sql } = await import("drizzle-orm");
const rows: any = await db.execute(sql`SELECT extraction FROM recorder_doc_cache`);
const idx: any = await db.execute(sql`SELECT documents_json FROM lien_cache WHERE pin = '13133270270000'`);
const parcelDocNums = new Set<string>(
  ((raw => typeof raw === "string" ? JSON.parse(raw) : raw ?? [])(idx.rows?.[0]?.documents_json)).map((d: any) => String(d.documentNumber)),
);
const docs = rows.rows.map((r: any) => (typeof r.extraction === "string" ? JSON.parse(r.extraction) : r.extraction) as ExtractedRecorderDoc)
  .filter((d: ExtractedRecorderDoc) => parcelDocNums.has(d.doc_number));
if (!docs.some((d: any) => d.doc_number === "1618022008")) {
  console.warn("SKIP 3014 end-to-end — run ingestParcel('13133270270000') first");
} else {
  const snap = toSnap(docs, "2026-08-12", { docs_total: parcelDocNums.size });
  const m = buildDebtCardModel(snap, "2026-08-12");
  const tile = (l: string) => m.tiles.find(t => t.label === l)!;
  assert.match(tile("Lender").value, /Albany/);
  assert.equal(tile("Loan Amount").value, "$399,000");
  // The mismatch note renders only when the index consideration differs AND is
  // present in the record — for this cache it's null, so the sub is the plain
  // "recorded loan" framing (data-honest; nothing invented).
  const idxAmt = snap.active[0].index_consideration_amount;
  if (idxAmt != null && idxAmt !== 399000) assert.match(tile("Loan Amount").subWas ?? "", /index/);
  else assert.match(tile("Loan Amount").sub ?? "", /recorded loan/);
  assert.equal(tile("Lien Position").value, "1st · sole active");
  assert.equal(tile("Maturity").value, fmtDateUS("2026-07-05"));
  assert.equal(tile("Maturity").variant, "warn", "at-maturity marigold");
  assert.equal(tile("Interest Rate").value, "3.75%");
  assert.equal(tile("Interest Rate").subWas, "was 4%");
  assert.equal(tile("Acquired").value, "4/24/2014");
  assert.match(tile("Acquired").sub ?? "", /receiver/);
  assert.equal(tile("Foreclosure").value, "None active");
  assert.equal(tile("Foreclosure").variant, "ok");
  assert.equal(snap.active[0].blanket, false, "3014 Albany single-PIN loan — no blanket false positive");
  assert.deepEqual(snap.active[0].blanket_pins, []);
  assert.equal(m.crossCollateral, null, "blanket==false ⇒ no cross-collateral strip");
  assert.equal(m.poolLtv, null, "blanket==false ⇒ no LTV panel");
  assert.equal(m.cleared!.rows.length, 2, "cleared block renders 2 rows for 3014");
  assert.match(m.modification!.docNumber, /2121004479/);
  assert.equal(m.lifecycle!.atOrPast, true);
  assert.match(m.headerBadge!.text, /1 active · at maturity/);
  // takeaway self-consistency: card values exist in the number set the validator enforces
  const nums = collectSnapNumbers(snap);
  for (const n of ["399,000", "3.75", "2026", "2014"]) assert.ok(nums.has(n), `takeaway can cite ${n}`);
  console.log("3014 card model OK:", JSON.stringify({ badge: m.headerBadge, tiles: m.tiles.map(t => ({ l: t.label, v: t.value, s: t.sub, was: t.subWas, variant: t.variant })) }, null, 1));
}

// ── Stage 2.5 patch: two-lien stack card (522-style) ──
{
  const docs = [
    base({ doc_number: "D2013", doc_type: "deed", recording_date: "2013-11-22", index_consideration_amount: 300000, parties: { borrower: null, lender: null, assignor: "OLD OWNER", assignee: "SUKHMIT KALSI, HARPREET KALSI" } }),
    base({ doc_number: "F2019", doc_type: "lis_pendens", recording_date: "2019-06-01" }),
    base({ doc_number: "R2021", doc_type: "release", recording_date: "2021-04-22", references_docs: ["F2019"] }),
    base({ doc_number: "Q2021", doc_type: "deed", recording_date: "2021-04-30", index_consideration_amount: 200000, ...({ deed_subtype: "quit claim" } as any), parties: { borrower: null, lender: null, assignor: "SUKHMIT KALSI, HARPREET KALSI", assignee: "SUKHMIT KALSI" } }),
    base({ doc_number: "M2021", doc_type: "mortgage", recording_date: "2021-05-17", amount: 712500, parties: { borrower: "SUKHMIT KALSI", lender: "United Wholesale Mtg", assignor: null, assignee: null } }),
    base({ doc_number: "M2025", doc_type: "mortgage", recording_date: "2025-08-28", amount: 198000, parties: { borrower: "SUKHMIT KALSI", lender: "Huntington Natl Bk", assignor: null, assignee: null } }),
  ];
  const salesSection = { most_recent_sale_date: "2013-11-22", sales: [{ date: "2013-11-22", price: 300000, doc_number: "D2013", is_arms_length: true }] };
  const snap: DebtSnap = {
    ...resolveState(reconcile(docs, "2026-08-12"), docs, null, { salesSection }, "2026-08-12"),
    docs_total: docs.length, report_estimated_value: null, subject_is_commercial: null,
  };
  const m = buildDebtCardModel(snap, "2026-08-12");
  assert.equal(m.stackSummary!.pill, "2 active mortgages");
  assert.match(m.stackSummary!.text, /2013 sale forward/);
  assert.match(m.stackSummary!.text, /\$910,500/);
  assert.equal(m.stack.length, 1, "one secondary lien block");
  assert.equal(m.stack[0].junior, true);
  assert.match(m.stack[0].posLabel, /2nd/);
  assert.match(m.stack[0].note!, /adds to the debt/);
  assert.match(m.stack[0].note!, /\$910,500/);
  assert.equal(m.refiSuspect, null, "junior second → no refi warning");
  assert.match(m.headerBadge!.text, /2 active · ~\$910K/);
  assert.match(m.anchorBlock!.title, /Read from the 2013 sale forward/);
  assert.match(m.anchorBlock!.body, /quit-claim.*not a sale/);
  assert.match(m.resolvedDistress!, /lis pendens — resolved/);
  assert.match(m.caveat, /title transfer, not a sale/);
  const nums = collectSnapNumbers(snap);
  for (const n of ["910,500", "712,500", "198,000", "2013"]) assert.ok(nums.has(n), `takeaway can cite ${n}`);

  // refi variant → refiSuspect strip on the card
  const docsR = docs.map(d => d.doc_number === "M2025" ? { ...d, amount: 700000 } : d);
  const snapR: DebtSnap = {
    ...resolveState(reconcile(docsR, "2026-08-12"), docsR, null, { salesSection }, "2026-08-12"),
    docs_total: docsR.length, report_estimated_value: null, subject_is_commercial: null,
  };
  const mR = buildDebtCardModel(snapR, "2026-08-12");
  assert.match(mR.refiSuspect!, /may be a refinance/i);
  assert.equal(mR.stack[0].junior, false);
  console.log("522-style two-lien card OK:", JSON.stringify({ badge: m.headerBadge, sum: m.stackSummary, stack0: m.stack[0] }, null, 1));
}

console.log("ALL STAGE 3 TESTS PASSED");
process.exit(0);
