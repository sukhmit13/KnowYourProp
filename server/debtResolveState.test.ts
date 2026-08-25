// Stage 2.5 resolveState tests — run with: npx tsx server/debtResolveState.test.ts
// Each assert maps to a rule in the Stage 2.5 spec (v2 — judicial deeds), plus
// the 3014 W Irving Park ground-truth regression from the live cache.

import assert from "node:assert/strict";
import { reconcile } from "./debtReconcile";
import { resolveState } from "./debtResolveState";
import type { ExtractedRecorderDoc } from "./recorderDocIngest";

const base = (o: Partial<ExtractedRecorderDoc>): ExtractedRecorderDoc => ({
  doc_number: "0", doc_type: "other", recording_date: null, execution_date: null,
  pins: [], parties: { borrower: null, lender: null, assignor: null, assignee: null },
  amount: null, index_consideration_amount: null, interest_rate: null, maturity_date: null,
  modifies: null, references_docs: [], debtor_name: null, is_partial: false, is_blanket: false,
  extraction_confidence: "high", text_source: "text-layer", ...o,
});
const run = (docs: ExtractedRecorderDoc[], today = "2026-08-12") =>
  resolveState(reconcile(docs, today), docs, null, null, today);

// ── 1. judicial deed clears prior liens even at nominal/unknown consideration ──
{
  const s = run([
    base({ doc_number: "M1", doc_type: "mortgage", recording_date: "2010-01-01", amount: 100000, parties: { borrower: "OLD OWNER LLC", lender: "Bank A", assignor: null, assignee: null } }),
    base({ doc_number: "D1", doc_type: "deed", recording_date: "2014-04-24", index_consideration_amount: null, parties: { borrower: null, lender: null, assignor: "Jane Doe, Court appointed receiver", assignee: "NEW OWNER LLC" } }),
  ]);
  assert.equal(s.cleared_by_sale.length, 1, "judicial deed must clear prior lien at unknown consideration");
  assert.equal(s.active.length, 0);
  assert.match(s.cleared_by_sale[0].status!, /court-ordered/);
}

// ── 2. ORDINARY deed with unknown/nominal consideration clears NOTHING ──
{
  for (const consid of [null, 10]) {
    const s = run([
      base({ doc_number: "M1", doc_type: "mortgage", recording_date: "2010-01-01", amount: 100000, parties: { borrower: "OLD OWNER LLC", lender: "Bank A", assignor: null, assignee: null } }),
      base({ doc_number: "D1", doc_type: "deed", recording_date: "2014-04-24", index_consideration_amount: consid, parties: { borrower: null, lender: null, assignor: "John Smith", assignee: "NEW OWNER LLC" } }),
    ]);
    assert.equal(s.cleared_by_sale.length, 0, `ordinary deed with consideration=${consid} must NOT clear`);
    assert.equal(s.active.length, 1);
  }
}

// ── 3. tax lien NEVER "resolved by sale"; owner-specific liens do resolve ──
{
  const docs = [
    base({ doc_number: "T1", doc_type: "tax_lien", recording_date: "2010-01-01", debtor_name: "OLD OWNER LLC" }),
    base({ doc_number: "J1", doc_type: "judgment_lien", recording_date: "2013-01-01", debtor_name: "OLD OWNER LLC" }),
    base({ doc_number: "D1", doc_type: "deed", recording_date: "2014-04-24", index_consideration_amount: 500000, parties: { borrower: null, lender: null, assignor: "John Smith", assignee: "NEW OWNER LLC" } }),
  ];
  const s = run(docs);
  const tax = s.liens.find(l => l.doc_number === "T1")!;
  const jdg = s.liens.find(l => l.doc_number === "J1")!;
  assert.ok(!/resolved by sale/.test(tax.enforceability!), "tax lien must never be resolved by sale");
  assert.match(jdg.enforceability!, /resolved by sale|expired/);
}

// ── 4. purchase-money mortgage never cleared ──
{
  const s = run([
    base({ doc_number: "D0", doc_type: "deed", recording_date: "2014-04-24", index_consideration_amount: 500000, parties: { borrower: null, lender: null, assignor: "Jane Doe, Court appointed receiver", assignee: "NEW OWNER LLC" } }),
    base({ doc_number: "M1", doc_type: "mortgage", recording_date: "2014-04-24", amount: 400000, parties: { borrower: "NEW OWNER LLC", lender: "Bank A", assignor: null, assignee: null } }),
  ]);
  assert.equal(s.cleared_by_sale.length, 0, "purchase-money mortgage must never be cleared");
  assert.equal(s.active.length, 1);
  assert.equal(s.active[0].purchase_money, true);
}

// ── 5. distress predating the clearing transfer resolves ──
{
  const s = run([
    base({ doc_number: "F1", doc_type: "lis_pendens", recording_date: "2012-01-01" }),
    base({ doc_number: "D1", doc_type: "deed", recording_date: "2014-04-24", parties: { borrower: null, lender: null, assignor: "Jane Doe, Court appointed receiver", assignee: "NEW OWNER LLC" } }),
    base({ doc_number: "F2", doc_type: "lis_pendens", recording_date: "2020-01-01" }),
  ]);
  assert.equal(s.distress.find(d => d.doc_number === "F1")!.state, "resolved");
  assert.equal(s.distress.find(d => d.doc_number === "F2")!.state, "active");
  assert.equal(s.foreclosure_active, true);
}

// ── 6. trustee-SALE subtype clears at nominal price; land-trust grantor does NOT ──
{
  const trusteeSale = run([
    base({ doc_number: "M1", doc_type: "mortgage", recording_date: "2010-01-01", amount: 100000, parties: { borrower: "OLD OWNER LLC", lender: "Bank A", assignor: null, assignee: null } }),
    { ...base({ doc_number: "D1", doc_type: "deed", recording_date: "2014-04-24", index_consideration_amount: 10, parties: { borrower: null, lender: null, assignor: "John Smith", assignee: "NEW OWNER LLC" } }), deed_subtype: "trustee" } as any,
  ]);
  assert.equal(trusteeSale.cleared_by_sale.length, 1, "trustee-sale deed_subtype must clear at nominal price");
  const landTrust = run([
    base({ doc_number: "M1", doc_type: "mortgage", recording_date: "2010-01-01", amount: 100000, parties: { borrower: "OLD OWNER LLC", lender: "Bank A", assignor: null, assignee: null } }),
    base({ doc_number: "D1", doc_type: "deed", recording_date: "2014-04-24", index_consideration_amount: 10, parties: { borrower: null, lender: null, assignor: "LA SALLE NATIONAL BANK, as Trustee under Trust Number 105335", assignee: "BANK OF RAVENSWOOD as Trustee under Trust No. 25-8035" } }),
  ]);
  assert.equal(landTrust.cleared_by_sale.length, 0, "routine land-trust grantor must NOT register as judicial");
}

// ── 7. no deeds / null owner → conservative, no throw, nothing cleared ──
{
  const s = run([
    base({ doc_number: "M1", doc_type: "mortgage", recording_date: "2010-01-01", amount: 100000, parties: { borrower: "SOMEONE LLC", lender: "Bank A", assignor: null, assignee: null } }),
  ]);
  assert.equal(s.current_owner, null);
  assert.equal(s.cleared_by_sale.length, 0);
  assert.equal(s.active.length, 1);
}

// ── 8. purity: resolveState must not annotate the caller's inputs ──
{
  const docs = [
    base({ doc_number: "M1", doc_type: "mortgage", recording_date: "2010-01-01", amount: 100000, parties: { borrower: "OLD OWNER LLC", lender: "Bank A", assignor: null, assignee: null } }),
    base({ doc_number: "F1", doc_type: "lis_pendens", recording_date: "2012-01-01" }),
    base({ doc_number: "D1", doc_type: "deed", recording_date: "2014-04-24", parties: { borrower: null, lender: null, assignor: "Jane Doe, Court appointed receiver", assignee: "NEW OWNER LLC" } }),
  ];
  const stack = reconcile(docs, "2026-08-12");
  const posBefore = stack.active[0].position;
  resolveState(stack, docs, null, null, "2026-08-12");
  assert.equal((stack.active[0] as any).resolved_by_sale, undefined, "reconcile output must not be annotated");
  assert.equal(stack.active[0].position, posBefore);
  assert.equal((docs[1] as any).state, undefined, "raw docs must not be annotated");
}

// ── 9. 3014 W Irving Park ground-truth regression (live cache, scoped by index) ──
const { db } = await import("./db");
const { recorderDocCache } = await import("@shared/schema");
const { sql } = await import("drizzle-orm");
const rows = await db.select().from(recorderDocCache);
const idx: any = await db.execute(sql`SELECT documents_json FROM lien_cache WHERE pin = '13133270270000'`);
const parcelDocNums = new Set<string>(
  ((raw => typeof raw === "string" ? JSON.parse(raw) : raw ?? [])(idx.rows?.[0]?.documents_json)).map((d: any) => String(d.documentNumber)),
);
const docs = rows.map(r => r.extraction as ExtractedRecorderDoc).filter(d => parcelDocNums.has(d.doc_number));
if (!docs.some(d => d.doc_number === "1618022008")) {
  console.warn("SKIP 3014 regression — run ingestParcel('13133270270000') first");
} else {
  const s = run(docs);
  assert.match(s.current_owner ?? "", /HAPPY ARTS LLC/i);
  assert.equal(s.ownership_acquired, "2014-04-24", "acquired via the 2014 receiver's deed, NOT 2016");
  assert.match(s.acquired_via, /receiver|judicial/i);
  const clearedNums = s.cleared_by_sale.map(m => m.doc_number);
  assert.ok(clearedNums.includes("99996625"), "1999 Banco Popular in cleared_by_sale");
  assert.ok(clearedNums.includes("0518844084"), "2005 Greenpoint in cleared_by_sale");
  assert.equal(s.active.length, 1, '"1 active mortgage", not 3');
  const albany = s.active[0];
  assert.equal(albany.doc_number, "1618022008");
  assert.equal(albany.position, 1);
  assert.equal(albany.effective_amount, 399000);
  assert.equal(albany.effective_interest_rate, 3.75);
  assert.equal(albany.effective_maturity_date, "2026-07-05");
  assert.equal(albany.maturity_status, "at_maturity");
  const pre2014 = s.distress.filter(d => (d.recording_date ?? "") < "2014-04-24");
  assert.ok(pre2014.length >= 2, "expects the pre-2014 foreclosure filings");
  for (const d of pre2014) assert.equal(d.state, "resolved", `${d.doc_number} pre-2014 filing must be resolved`);
  assert.equal(s.foreclosure_active, false);
  console.log("3014 resolved state:", JSON.stringify({
    current_owner: s.current_owner, ownership_acquired: s.ownership_acquired, acquired_via: s.acquired_via,
    active: s.active.map(m => ({ doc: m.doc_number, pos: m.position, lender: m.lender, amt: m.effective_amount, rate: m.effective_interest_rate, mat: m.effective_maturity_date, status: m.maturity_status })),
    cleared_by_sale: s.cleared_by_sale.map(m => ({ doc: m.doc_number, status: m.status })),
    foreclosure_active: s.foreclosure_active, flags: s.flags,
  }, null, 1));
}

// ── 522 N Claremont regression (Stage 2.5 patch) — anchor binds to the SALES
// section; a quit-claim is NOT a sale: clears nothing, resets nothing ──
{
  const kalsi522 = (quitClaim = true, secondAmt = 198000) => [
    // 2010 prior-owner mortgage — should clear at the 2013 sale
    base({ doc_number: "M2010", doc_type: "mortgage", recording_date: "2010-03-01", amount: 250000, parties: { borrower: "OLD OWNER", lender: "Bank Z", assignor: null, assignee: null } }),
    // 2013 acquisition (the report's most recent genuine sale)
    base({ doc_number: "D2013", doc_type: "deed", recording_date: "2013-11-22", index_consideration_amount: 300000, parties: { borrower: null, lender: null, assignor: "OLD OWNER", assignee: "SUKHMIT KALSI, HARPREET KALSI" } }),
    // 2019 lis pendens → dismissed via 2021 release
    base({ doc_number: "F2019", doc_type: "lis_pendens", recording_date: "2019-06-01" }),
    base({ doc_number: "R2021", doc_type: "release", recording_date: "2021-04-22", references_docs: ["F2019"] }),
    // 2021 quit-claim: co-owner removed — NOT a sale (recorded with a
    // consideration figure that fooled the old arms-length gate)
    ...(quitClaim ? [base({ doc_number: "Q2021", doc_type: "deed", recording_date: "2021-04-30", index_consideration_amount: 200000, ...( { deed_subtype: "quit claim" } as any), parties: { borrower: null, lender: null, assignor: "SUKHMIT KALSI, HARPREET KALSI", assignee: "SUKHMIT KALSI" } })] : []),
    // 2021 first + 2025 second
    base({ doc_number: "M2021", doc_type: "mortgage", recording_date: "2021-05-17", amount: 712500, parties: { borrower: "SUKHMIT KALSI", lender: "United Wholesale Mtg", assignor: null, assignee: null } }),
    base({ doc_number: "M2025", doc_type: "mortgage", recording_date: "2025-08-28", amount: secondAmt, parties: { borrower: "SUKHMIT KALSI", lender: "Huntington Natl Bk", assignor: null, assignee: null } }),
  ];
  const salesSection = { most_recent_sale_date: "2013-11-22", sales: [{ date: "2013-11-22", price: 300000, doc_number: "D2013", is_arms_length: true }] };
  const docs = kalsi522();
  const s = resolveState(reconcile(docs, "2026-08-12"), docs, null, { salesSection }, "2026-08-12");

  assert.equal(s.anchor.date, "2013-11-22", "anchor = Sales section's most_recent_sale_date, NOT the 2021 quit-claim");
  assert.equal(s.anchor.source, "sales-section");
  assert.equal(s.ownership_acquired, "2013-11-22");
  assert.equal(s.active.length, 2, "BOTH the 2021 and 2025 mortgages are active");
  assert.deepEqual(s.active.map(m => m.doc_number), ["M2021", "M2025"]);
  assert.deepEqual(s.active.map(m => m.position), [1, 2]);
  assert.equal(s.active[1].lien_kind, "junior", "198k after 712.5k => junior lien, NOT refi");
  assert.ok(!s.active[0].refi_suspect, "junior second must not flag the first as refi_suspect");
  assert.equal(s.combined_recorded_debt, 910500, "712500 + 198000 ADDED, not treated as one");
  assert.equal(s.cleared_by_sale.length, 1, "pre-2013 prior-owner mortgage cleared at the sale");
  assert.equal(s.cleared_by_sale[0].doc_number, "M2010");
  assert.equal(s.distress.find(d => d.doc_number === "F2019")!.state, "resolved", "2019 lis pendens dismissed 2021");
  assert.equal(s.foreclosure_active, false);
  assert.equal(s.non_sale_transfers.length, 1, "quit-claim surfaces as a non-sale transfer");
  assert.equal(s.non_sale_transfers[0].doc_number, "Q2021");
  assert.match(s.current_owner ?? "", /SUKHMIT KALSI/);

  // refi path: a later loan >= 0.9× the first with no release => refi_suspect on the OLDER
  const docsRefi = kalsi522(true, 700000);
  const sr = resolveState(reconcile(docsRefi, "2026-08-12"), docsRefi, null, { salesSection }, "2026-08-12");
  assert.equal(sr.active[0].refi_suspect, true, "similar-or-larger later loan sets refi_suspect on the older");
  assert.notEqual(sr.active[1].lien_kind, "junior");

  // guard: salesSection absent → deed-derived fallback, no crash. (Here the
  // 2021 quit-claim's bogus consideration DOES clear — the exact bug the
  // Sales-section binding fixes.)
  const sf = resolveState(reconcile(docs, "2026-08-12"), docs, null, null, "2026-08-12");
  assert.equal(sf.anchor.source, "deed-derived");
  assert.ok(sf.anchor.date, "fallback anchor derives from deeds without crashing");
}

// ── incomplete sales history: a JUDICIAL deed newer than the sales anchor wins;
// and with 3 liens a refi is caught behind an intervening junior loan ──
{
  // MyDec is missing the 2020 receiver's sale — deed-derived judicial override
  const docs = [
    base({ doc_number: "M2015", doc_type: "mortgage", recording_date: "2015-01-01", amount: 500000, parties: { borrower: "OLD OWNER LLC", lender: "Bank A", assignor: null, assignee: null } }),
    base({ doc_number: "D2020", doc_type: "deed", recording_date: "2020-06-01", index_consideration_amount: null, parties: { borrower: null, lender: null, assignor: "Jane Doe, Court appointed receiver", assignee: "NEW OWNER LLC" } }),
  ];
  const staleSales = { most_recent_sale_date: "2012-05-01", sales: [{ date: "2012-05-01", price: 400000, doc_number: "D2012", is_arms_length: true }] };
  const s = resolveState(reconcile(docs, "2026-08-12"), docs, null, { salesSection: staleSales }, "2026-08-12");
  assert.equal(s.anchor.date, "2020-06-01", "judicial deed newer than a stale sales anchor must win");
  assert.equal(s.anchor.source, "deed-derived");
  assert.equal(s.cleared_by_sale.length, 1, "prior-owner mortgage clears at the judicial sale");

  // anchor-deed proximity guard: no deed near the sale date → deed details unknown, sale date kept
  const farDocs = [
    base({ doc_number: "M1", doc_type: "mortgage", recording_date: "2021-01-01", amount: 100000, parties: { borrower: "OWNER", lender: "Bank B", assignor: null, assignee: null } }),
    base({ doc_number: "DLATE", doc_type: "deed", recording_date: "2024-01-01", index_consideration_amount: 5000, parties: { borrower: null, lender: null, assignor: "OWNER", assignee: "OWNER TRUST" } }),
  ];
  const sf = resolveState(reconcile(farDocs, "2026-08-12"), farDocs, null, { salesSection: { most_recent_sale_date: "2018-03-01", sales: [{ date: "2018-03-01", price: 350000, doc_number: "DX", is_arms_length: true }] } }, "2026-08-12");
  assert.equal(sf.anchor.date, "2018-03-01", "sale date kept when no deed records near it");
  assert.equal(sf.ownership_acquired, "2018-03-01");
  assert.equal(sf.active.length, 1, "post-anchor mortgage stays active; late transfer must not anchor");

  // 3 liens: 500k (2015) + junior 100k (2018) + 480k (2022) — the 2022 loan is a
  // refi suspect of the 2015 FIRST even though the junior sits between them
  const tri = [
    base({ doc_number: "D2014", doc_type: "deed", recording_date: "2014-05-01", index_consideration_amount: 600000, parties: { borrower: null, lender: null, assignor: "SELLER", assignee: "OWNER" } }),
    base({ doc_number: "MA", doc_type: "mortgage", recording_date: "2015-01-01", amount: 500000, parties: { borrower: "OWNER", lender: "Bank A", assignor: null, assignee: null } }),
    base({ doc_number: "MB", doc_type: "mortgage", recording_date: "2018-01-01", amount: 100000, parties: { borrower: "OWNER", lender: "Bank B", assignor: null, assignee: null } }),
    base({ doc_number: "MC", doc_type: "mortgage", recording_date: "2022-01-01", amount: 480000, parties: { borrower: "OWNER", lender: "Bank C", assignor: null, assignee: null } }),
  ];
  const st = resolveState(reconcile(tri, "2026-08-12"), tri, null, { salesSection: { most_recent_sale_date: "2014-05-01", sales: [{ date: "2014-05-01", price: 600000, doc_number: "D2014", is_arms_length: true }] } }, "2026-08-12");
  assert.equal(st.active.length, 3);
  assert.equal(st.active[0].refi_suspect, true, "refi caught across the intervening junior loan");
  assert.equal(st.active[1].lien_kind, "junior");
  assert.notEqual(st.active[2].lien_kind, "junior", "480k over a 100k junior is NOT junior");
}

// ── 2A. Blanket/PIN derivation runs on CLEARED mortgages too ──
{
  // A prior-owner blanket mortgage (cleared at sale) must still get blanket_pins computed.
  const pin14a = "12345678901234";
  const pin14b = "98765432109876";
  const docs = [
    base({
      doc_number: "MOLD",
      doc_type: "mortgage",
      recording_date: "2010-01-01",
      amount: 800000,
      pins: [pin14a, pin14b],
      parties: { borrower: "OLD OWNER", lender: "Big Bank", assignor: null, assignee: null },
    }),
    base({
      doc_number: "D2015",
      doc_type: "deed",
      recording_date: "2015-06-01",
      index_consideration_amount: 900000,
      parties: { borrower: null, lender: null, assignor: "OLD OWNER", assignee: "NEW OWNER" },
    }),
    base({
      doc_number: "MNEW",
      doc_type: "mortgage",
      recording_date: "2015-06-01",
      amount: 600000,
      pins: [pin14a],
      parties: { borrower: "NEW OWNER", lender: "New Bank", assignor: null, assignee: null },
    }),
  ];
  const salesSection = { most_recent_sale_date: "2015-06-01", sales: [{ date: "2015-06-01", price: 900000, doc_number: "D2015", is_arms_length: true }] };
  const s = resolveState(reconcile(docs, "2026-08-12"), docs, { pin: pin14a }, { salesSection }, "2026-08-12");
  assert.equal(s.cleared_by_sale.length, 1, "old blanket mortgage clears at sale");
  const cleared = s.cleared_by_sale[0];
  assert.equal(cleared.doc_number, "MOLD");
  assert.equal(cleared.blanket, true, "2A: cleared mortgage must have blanket flag computed");
  assert.ok(cleared.blanket_pins!.includes(pin14b), "2A: cleared mortgage must have blanket_pins computed");
  const active = s.active[0];
  assert.equal(active.doc_number, "MNEW");
  assert.equal(active.blanket, false, "new single-PIN mortgage is not blanket");
}

// ── 2B. scopeChanges emitted for refi chain with differing PIN sets ──
{
  const pinA = "11111111110000";
  const pinB = "22222222220000";
  // Two mortgages: older covers pinA + pinB (blanket), newer covers only pinA (narrowed scope)
  // Older is position 1 (no sale between them so it stays active, becomes refi_suspect when newer arrives)
  const docs = [
    base({
      doc_number: "MA",
      doc_type: "mortgage",
      recording_date: "2015-01-01",
      amount: 500000,
      pins: [pinA, pinB],
      parties: { borrower: "OWNER", lender: "Bank A", assignor: null, assignee: null },
    }),
    base({
      doc_number: "MB",
      doc_type: "mortgage",
      recording_date: "2020-01-01",
      amount: 480000,
      pins: [pinA],
      parties: { borrower: "OWNER", lender: "Bank B", assignor: null, assignee: null },
    }),
  ];
  const s = resolveState(reconcile(docs, "2026-08-12"), docs, { pin: pinA }, null, "2026-08-12");
  assert.equal(s.active[0].refi_suspect, true, "older loan flagged refi_suspect");
  assert.equal(s.scopeChanges.length, 1, "2B: one scope change emitted when PIN sets differ");
  const sc = s.scopeChanges[0];
  assert.equal(sc.atDocNumber, "MB", "scope change points to the newer loan");
  assert.deepEqual(sc.droppedPins, [pinB], "2B: PIN B was dropped");
  assert.deepEqual(sc.addedPins, [], "2B: no PINs added");
}

// ── 2B. No scopeChanges when PIN sets are equal ──
{
  const pinA = "11111111110000";
  const docs = [
    base({
      doc_number: "MA",
      doc_type: "mortgage",
      recording_date: "2015-01-01",
      amount: 500000,
      pins: [pinA],
      parties: { borrower: "OWNER", lender: "Bank A", assignor: null, assignee: null },
    }),
    base({
      doc_number: "MB",
      doc_type: "mortgage",
      recording_date: "2020-01-01",
      amount: 480000,
      pins: [pinA],
      parties: { borrower: "OWNER", lender: "Bank B", assignor: null, assignee: null },
    }),
  ];
  const s = resolveState(reconcile(docs, "2026-08-12"), docs, { pin: pinA }, null, "2026-08-12");
  assert.equal(s.scopeChanges.length, 0, "2B: no scope change when PIN sets are equal");
}

// ── 2B. No scopeChanges when either PIN set is empty/unknown ──
{
  const docs = [
    base({ doc_number: "MA", doc_type: "mortgage", recording_date: "2015-01-01", amount: 500000, parties: { borrower: "OWNER", lender: "Bank A", assignor: null, assignee: null } }),
    base({ doc_number: "MB", doc_type: "mortgage", recording_date: "2020-01-01", amount: 480000, parties: { borrower: "OWNER", lender: "Bank B", assignor: null, assignee: null } }),
  ];
  const s = resolveState(reconcile(docs, "2026-08-12"), docs, null, null, "2026-08-12");
  assert.equal(s.scopeChanges.length, 0, "2B: no scope change when PIN sets are empty (missing data)");
}

// ── 2C. cashOutSuspect and recordedDelta on the newer refi loan ──
{
  const docs = [
    base({ doc_number: "MA", doc_type: "mortgage", recording_date: "2015-01-01", amount: 400000, parties: { borrower: "OWNER", lender: "Bank A", assignor: null, assignee: null } }),
    base({ doc_number: "MB", doc_type: "mortgage", recording_date: "2021-01-01", amount: 752500, parties: { borrower: "OWNER", lender: "Bank B", assignor: null, assignee: null } }),
  ];
  const s = resolveState(reconcile(docs, "2026-08-12"), docs, null, null, "2026-08-12");
  assert.equal(s.active[0].refi_suspect, true, "older flagged refi_suspect");
  const newer = s.active[1];
  assert.equal(newer.cashOutSuspect, true, "2C: newer.effective_amount (752500) > older (400000) * 1.05 => cashOutSuspect");
  assert.equal(newer.recordedDelta, 752500 - 400000, "2C: recordedDelta = newer - older");
}

// ── 2C. No cashOutSuspect when increase is <= 5% ──
{
  const docs = [
    base({ doc_number: "MA", doc_type: "mortgage", recording_date: "2015-01-01", amount: 400000, parties: { borrower: "OWNER", lender: "Bank A", assignor: null, assignee: null } }),
    base({ doc_number: "MB", doc_type: "mortgage", recording_date: "2021-01-01", amount: 415000, parties: { borrower: "OWNER", lender: "Bank B", assignor: null, assignee: null } }),
  ];
  const s = resolveState(reconcile(docs, "2026-08-12"), docs, null, null, "2026-08-12");
  assert.equal(s.active[0].refi_suspect, true, "refi_suspect set (415k >= 90% of 400k)");
  assert.ok(!s.active[1].cashOutSuspect, "2C: 415k <= 400k * 1.05 => no cashOutSuspect");
}

// ── 2A/2B/2C. Explicitly released blanket mortgage remains in the refi chain ──
{
  const pinA = "17091230010000";
  const pinB = "17091230020000";
  const docs = [
    base({
      doc_number: "MOLD",
      doc_type: "mortgage",
      recording_date: "2015-01-01",
      amount: 500000,
      pins: [pinA, pinB],
      parties: { borrower: "OWNER", lender: "Old Bank", assignor: null, assignee: null },
    }),
    base({
      doc_number: "REL1",
      doc_type: "release",
      recording_date: "2020-01-05",
      references_docs: ["MOLD"],
    }),
    base({
      doc_number: "MNEW",
      doc_type: "mortgage",
      recording_date: "2020-01-02",
      amount: 650000,
      pins: [pinA],
      parties: { borrower: "OWNER", lender: "New Bank", assignor: null, assignee: null },
    }),
  ];
  const s = resolveState(reconcile(docs, "2026-08-12"), docs, { pin: pinA }, null, "2026-08-12");
  assert.equal(s.satisfied.length, 1, "released mortgage is retained in resolved history");
  assert.deepEqual(s.satisfied[0].blanket_pins, [pinB], "released mortgage receives blanket PIN annotation");
  assert.equal(s.scopeChanges.length, 1, "released blanket-to-single-PIN refinance creates one scope change");
  assert.deepEqual(s.scopeChanges[0].droppedPins, [pinB], "scope change records the dropped companion PIN");
  assert.equal(s.active[0].cashOutSuspect, true, "new replacement loan receives the recorded-principal increase signal");
  assert.equal(s.active[0].recordedDelta, 150000, "replacement delta compares original recorded principals");
}

console.log("ALL STAGE 2.5 TESTS PASSED");
process.exit(0);
