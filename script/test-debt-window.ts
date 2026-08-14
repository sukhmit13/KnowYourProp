// Debt read-window tests — run with: npx tsx script/test-debt-window.ts
// Maps to the "only OCR documents in the post-sale window" spec.

import assert from "node:assert/strict";
import {
  debtReadWindowStart, normalizeIndexDate, survivesSale,
  mapIndexTypeToDocType, indexOnlyStub, classifyIngest, DEBT_WINDOW_BUFFER_MONTHS,
} from "../server/debtReadWindow";
import type { RecorderIndexRow } from "../server/recorderDocIngest";

const row = (documentNumber: string, documentType: string, recordedDate: string, category: any = "other", amount: number | null = null): RecorderIndexRow =>
  ({ documentNumber, documentType, recordedDate, category, amount });

// windowStart = saleAnchor − 6 months (backward buffer for the closing package)
{
  assert.equal(DEBT_WINDOW_BUFFER_MONTHS, 6);
  assert.equal(debtReadWindowStart("2014-09-15"), "2014-03-15");
  assert.equal(debtReadWindowStart("09/15/2014"), "2014-03-15");   // MM/DD/YYYY index form
  assert.equal(debtReadWindowStart(null), null, "no genuine sale ⇒ no cutoff");
  assert.equal(debtReadWindowStart("2020-02-31"), null, "impossible date never creates a cutoff");
}

// no anchor ⇒ full history ingested (no cutoff)
{
  const rows = [row("A", "MORTGAGE", "01/01/1987", "mortgage"), row("B", "WARRANTY DEED", "2014-09-20", "deed")];
  const { read, indexOnly } = classifyIngest(rows, null);
  assert.equal(read.length, 2);
  assert.equal(indexOnly.length, 0);
}

// 3014 W Irving Park regression (sale 2014-09): pre-window distress/mortgages
// are index-only; the post-window financing is read.
{
  const windowStart = debtReadWindowStart("2014-09-15")!;
  const rows = [
    row("LP87", "LIS PENDENS", "06/01/1987", "litigation"),
    row("LP01", "LIS PENDENS", "03/10/2001", "litigation"),
    row("FC12", "FORECLOSURE", "05/05/2012", "foreclosure"),
    row("M99", "MORTGAGE", "07/07/1999", "mortgage"),
    row("M05", "MORTGAGE", "02/02/2005", "mortgage"),
    row("M16", "MORTGAGE", "04/01/2016", "mortgage"),
    row("MOD21", "MODIFICATION OF MORTGAGE", "08/15/2021", "mortgage"),
  ];
  const { read, indexOnly } = classifyIngest(rows, windowStart);
  assert.deepEqual(read.map(r => r.documentNumber).sort(), ["M16", "MOD21"], "only post-window docs are OCR'd");
  assert.deepEqual(indexOnly.map(r => r.documentNumber).sort(), ["FC12", "LP01", "LP87", "M05", "M99"]);
}

// purchase-money mortgage recorded shortly BEFORE the deed is still ingested (backward buffer)
{
  const windowStart = debtReadWindowStart("2014-09-15")!;
  const rows = [row("PM", "MORTGAGE", "2014-08-01", "mortgage")]; // 6 weeks before the sale
  const { read, indexOnly } = classifyIngest(rows, windowStart);
  assert.equal(read.length, 1, "backward buffer must catch the purchase-money mortgage");
  assert.equal(indexOnly.length, 0);
}

// pre-window TAX lien is still read (runs with the land — survives the sale)
{
  const windowStart = debtReadWindowStart("2014-09-15")!;
  const rows = [
    row("TX", "FEDERAL TAX LIEN", "01/01/2005", "federal_tax"),
    row("TX2", "TAX LIEN", "01/01/2006", "other_lien"),
    row("SA", "SPECIAL ASSESSMENT LIEN", "01/01/2007", "other_lien"),
    row("J", "JUDGMENT", "01/01/2005", "judgment"),
  ];
  const { read, indexOnly } = classifyIngest(rows, windowStart);
  assert.deepEqual(read.map(r => r.documentNumber).sort(), ["SA", "TX", "TX2"], "in-rem liens are never stubbed");
  assert.deepEqual(indexOnly.map(r => r.documentNumber), ["J"], "an in-personam judgment clears at sale — index-only");
  assert.equal(survivesSale(rows[0]), true);
  assert.equal(survivesSale(rows[3]), false);
}

// unknown/garbled recording date ⇒ err on reading, never silently stub
{
  const windowStart = debtReadWindowStart("2014-09-15")!;
  const { read, indexOnly } = classifyIngest([row("X", "MORTGAGE", "unknown", "mortgage")], windowStart);
  assert.equal(read.length, 1);
  assert.equal(indexOnly.length, 0);
}

// demand-driven union: another section's requested pre-window doc is still read
{
  const windowStart = debtReadWindowStart("2014-09-15")!;
  const rows = [row("DEED88", "WARRANTY DEED", "03/03/1988", "deed"), row("M99", "MORTGAGE", "07/07/1999", "mortgage")];
  const { read, indexOnly } = classifyIngest(rows, windowStart, ["DEED88"]);
  assert.deepEqual(read.map(r => r.documentNumber), ["DEED88"], "companion/ownership needs override the window");
  assert.deepEqual(indexOnly.map(r => r.documentNumber), ["M99"]);
}

// index-only stub: correct doc_type mapping, normalized date, marked index_only
{
  const s = indexOnlyStub(row("LP01", "LIS PENDENS", "03/10/2001", "litigation"));
  assert.equal(s.doc_type, "lis_pendens");
  assert.equal(s.recording_date, "2001-03-10");
  assert.equal(s.index_only, true);
  assert.equal(s.text_source, "index");
  assert.equal(s.amount, null);
  assert.equal(mapIndexTypeToDocType(row("A", "ASSIGNMENT OF MORTGAGE", "", "mortgage")), "assignment");
  assert.equal(mapIndexTypeToDocType(row("B", "MODIFICATION AGREEMENT", "", "mortgage")), "modification");
  assert.equal(mapIndexTypeToDocType(row("C", "", "", "judgment")), "judgment_lien");
  assert.equal(mapIndexTypeToDocType(row("D", "", "", "mechanic")), "mechanics_lien");
  assert.equal(normalizeIndexDate("02/31/2020"), null, "impossible date normalizes to null (⇒ read)");
}

// integration: pre-window stubs flow through reconcile → resolveState as
// "historical, resolved by sale" — never as active debt or live distress.
{
  const { reconcile } = await import("../server/debtReconcile");
  const { resolveState } = await import("../server/debtResolveState");
  const windowStart = debtReadWindowStart("2014-09-15")!;
  const rows = [
    row("LP87", "LIS PENDENS", "06/01/1987", "litigation"),
    row("M99", "MORTGAGE", "07/07/1999", "mortgage"),
  ];
  const { indexOnly } = classifyIngest(rows, windowStart);
  const stubs = indexOnly.map(indexOnlyStub);
  const fullDocs = [
    // the current acquisition deed + purchase-money mortgage (in-window, fully extracted)
    { doc_number: "D14", doc_type: "deed", recording_date: "2014-09-20", execution_date: null, pins: [], parties: { borrower: null, lender: null, assignor: "OLD OWNER LLC", assignee: "NEW OWNER LLC" }, amount: null, index_consideration_amount: 500000, interest_rate: null, maturity_date: null, modifies: null, references_docs: [], debtor_name: null, is_partial: false, is_blanket: false, extraction_confidence: "high", text_source: "text-layer" },
    { doc_number: "M14", doc_type: "mortgage", recording_date: "2014-09-20", execution_date: null, pins: [], parties: { borrower: "NEW OWNER LLC", lender: "BANK", assignor: null, assignee: null }, amount: 400000, index_consideration_amount: null, interest_rate: null, maturity_date: null, modifies: null, references_docs: [], debtor_name: null, is_partial: false, is_blanket: false, extraction_confidence: "high", text_source: "text-layer" },
  ] as any[];
  const docs = [...stubs, ...fullDocs];
  const resolved = resolveState(reconcile(docs as any), docs as any, { pin: "13133270270000", value: 600000 },
    { salesSection: { most_recent_sale_date: "2014-09-15", sales: [{ date: "2014-09-15", price: 500000, doc_number: "D14", is_arms_length: true }] } });
  assert.equal(resolved.active.length, 1, "only the in-window purchase-money mortgage is active");
  assert.equal(resolved.active[0].doc_number, "M14");
  assert.equal(resolved.cleared_by_sale.length, 1, "pre-window stub mortgage lands in cleared_by_sale");
  assert.equal(resolved.cleared_by_sale[0].doc_number, "M99");
  const lp = resolved.distress.find(d => d.doc_number === "LP87")!;
  assert.equal(lp.state, "resolved", "pre-window lis pendens stub is resolved, not live");
  assert.equal(resolved.foreclosure_active, false);
}

console.log("✓ all debt read-window tests passed");
