// Distress-resolution tests — run with: npx tsx script/test-lien-distress.ts
// Maps to the "real sale clears prior lis pendens" spec.

import assert from "node:assert/strict";
import { resolveDistress, genuineSaleAnchor, parseFlexDate } from "../shared/lienDistress";

// 1122 W Bryn Mawr regression: lis pendens 2000, warranty-deed sale 2018 → resolved by sale
{
  const r = resolveDistress(
    [{ documentNumber: "LP1", recordedDate: "05/12/2000" }, { documentNumber: "LP2", recordedDate: "08/03/2000" }],
    [{ saleDate: "2018-06-15", salePrice: 640000, deedType: "Warranty Deed" }],
  );
  assert.equal(r.activeCount, 0, "sale-cleared filings must not be active");
  assert.equal(r.resolvedCount, 2);
  assert.equal(r.resolvedBy, "sale");
  assert.equal(r.resolvedSaleYear, 2018);
  assert.equal(r.oldestResolvedYear, 2000);
}

// quit-claim-only transfer after a filing does NOT resolve it
{
  const r = resolveDistress(
    [{ recordedDate: "2015-01-01" }],
    [{ saleDate: "2019-01-01", salePrice: 0, deedType: "Quit Claim Deed" },
     { saleDate: "2020-01-01", salePrice: 500, deedType: "Warranty Deed" }], // nominal — not a sale
  );
  assert.equal(r.activeCount, 1, "quit-claim/nominal transfer never clears distress");
  assert.equal(r.resolvedCount, 0);
}

// genuinely active lis pendens (no later sale, no dismissal, no refi) stays active
{
  const r = resolveDistress(
    [{ recordedDate: "2025-11-01" }],
    [{ saleDate: "2018-06-15", salePrice: 640000, deedType: "Warranty Deed" }], // sale BEFORE filing
  );
  assert.equal(r.activeCount, 1);
  assert.equal(r.resolvedCount, 0);
}

// explicit release/dismissal (isReleased from recorder index) resolves even without a sale
{
  const r = resolveDistress([{ recordedDate: "2022-01-01", isReleased: true }], []);
  assert.equal(r.activeCount, 0);
  assert.equal(r.resolvedBy, "released");
}

// NEW financing (mortgage/refi/HELOC) AFTER the filing → resolved "financing" — owner-agnostic
{
  const filings = [{ recordedDate: "2019-03-01" }];
  const anyBorrower = resolveDistress(filings, [], {
    mortgages: [{ recordedDate: "2022-05-01", grantor: "TOTALLY DIFFERENT PERSON", documentType: "MORTGAGE" }],
  });
  assert.equal(anyBorrower.activeCount, 0, "any new financing after the filing implies clean title");
  assert.equal(anyBorrower.resolvedBy, "financing");

  // a MODIFICATION or ASSIGNMENT of a pre-filing loan does NOT resolve
  for (const t of ["MORTGAGE MODIFICATION", "ASSIGNMENT OF MORTGAGE", "EXTENSION AGREEMENT"]) {
    const r = resolveDistress(filings, [], { mortgages: [{ recordedDate: "2022-05-01", documentType: t }] });
    assert.equal(r.activeCount, 1, `${t} must not resolve — no fresh title clearance`);
  }

  // financing recorded BEFORE the filing proves nothing
  const before = resolveDistress(filings, [], {
    mortgages: [{ recordedDate: "2018-01-01", documentType: "MORTGAGE" }],
  });
  assert.equal(before.activeCount, 1, "pre-filing financing must not resolve");
}

// sales anchor: latest GENUINE sale wins; date formats both parse
{
  const a = genuineSaleAnchor([
    { saleDate: "2010-01-01", salePrice: 300000, deedType: "Warranty Deed" },
    { saleDate: "2021-04-09", salePrice: 555000, deedType: "Trustees Deed" },
    { saleDate: "2024-01-01", salePrice: 10, deedType: "Warranty Deed" },      // nominal
    { saleDate: "2025-01-01", salePrice: 900000, deedType: "Quit-Claim Deed" }, // not a sale
  ]);
  assert.equal(a?.year, 2021);
  assert.equal(parseFlexDate("07/04/2018"), parseFlexDate("2018-07-04"));
  assert.equal(parseFlexDate("garbage"), null);
}

// filing with unparseable date stays active (never silently resolved)
{
  const r = resolveDistress([{ recordedDate: "unknown" }],
    [{ saleDate: "2020-01-01", salePrice: 500000, deedType: "Warranty Deed" }]);
  assert.equal(r.activeCount, 1);
}

// impossible calendar dates never resolve (Date.parse would normalize 02/31)
{
  assert.equal(parseFlexDate("2020-02-31"), null);
  assert.equal(parseFlexDate("13/45/2020"), null);
  const r = resolveDistress(
    [{ recordedDate: "2020-02-31" }],
    [{ saleDate: "2023-01-01", salePrice: 500000, deedType: "Warranty Deed" }],
  );
  assert.equal(r.activeCount, 1, "impossible filing date must stay active, never silently resolved");
  // impossible SALE date → no anchor → filing stays active
  const r2 = resolveDistress([{ recordedDate: "2015-01-01" }],
    [{ saleDate: "2023-02-30", salePrice: 500000, deedType: "Warranty Deed" }]);
  assert.equal(r2.activeCount, 1);
}

// released foreclosure resolves; unreleased recent foreclosure stays active
{
  const rel = resolveDistress([{ recordedDate: "2024-01-01", isReleased: true }], [], { staleYears: 2, nowMs: parseFlexDate("2026-08-12")! });
  assert.equal(rel.activeCount, 0);
  assert.equal(rel.resolvedBy, "released");
  const recent = resolveDistress([{ recordedDate: "2025-06-01" }], [], { staleYears: 2, nowMs: parseFlexDate("2026-08-12")! });
  assert.equal(recent.activeCount, 1, "recent unresolved foreclosure must stay active");
}

// staleness: old unresolved foreclosure goes historical ONLY with a parseable date
{
  const now = parseFlexDate("2026-08-12")!;
  const old = resolveDistress([{ recordedDate: "2012-02-09" }], [], { staleYears: 2, nowMs: now });
  assert.equal(old.activeCount, 0);
  assert.equal(old.resolvedBy, "stale");
  const unknown = resolveDistress([{ recordedDate: "garbage" }], [], { staleYears: 2, nowMs: now });
  assert.equal(unknown.activeCount, 1, "unparseable date must not go stale");
}

// isProbablyCleared (legacy staleness flag) counts as resolved, matching the old KPI contract
{
  const r = resolveDistress([{ recordedDate: "2015-01-01", isProbablyCleared: true }], []);
  assert.equal(r.activeCount, 0);
  assert.equal(r.resolvedCount, 1);
}

console.log("✓ all lien-distress tests passed");
