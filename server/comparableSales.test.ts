import assert from "node:assert/strict";
import test from "node:test";
import { getComparableSales } from "./comparableSales";

function mockCountyApi(sales: unknown[], characteristics: unknown[]) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const rows = url.pathname.endsWith("/wvhk-k5uv.json") ? sales : characteristics;
    return new Response(JSON.stringify(rows), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return () => { globalThis.fetch = originalFetch; };
}

test("comparable sales report raw and matched counts and use the mean of even middle values", async () => {
  const restoreFetch = mockCountyApi(
    [
      { pin: "PIN-1", class: "203", sale_date: "2026-09-20T00:00:00", sale_price: "200000", buyer_name: "Buyer One" },
      { pin: "PIN-2", class: "203", sale_date: "2026-09-19T00:00:00", sale_price: "600000", buyer_name: "Buyer Two" },
    ],
    [
      { pin: "PIN-1", centroid_y: "41.8791", centroid_x: "-87.6381", bldg_sf: "1000", beds: "2", fbath: "1", hbath: "0", addr: "100 TEST ST" },
      { pin: "PIN-2", centroid_y: "41.8792", centroid_x: "-87.6382", bldg_sf: "2000", beds: "3", fbath: "2", hbath: "0", addr: "102 TEST ST" },
    ],
  );

  try {
    const result = await getComparableSales(41.8791, -87.6381, "203", 1500, 2, 1);
    assert.equal(result.rawSalesCount, 2);
    assert.equal(result.matchedCharacteristics, 2);
    assert.equal(result.geocodedSalesCount, 2);
    assert.equal(result.nearbySalesCount, 2);
    assert.equal(result.marketAnalysis.medianSalePrice, 400000);
    assert.equal(result.marketAnalysis.medianPricePerSqft, 250);
    assert.equal(result.marketAnalysis.estimatedValue, 375000);
  } finally {
    restoreFetch();
  }
});

test("comparable sales preserve raw count when no characteristics match", async () => {
  const restoreFetch = mockCountyApi(
    [{ pin: "COMMERCIAL-1", class: "301", sale_date: "2026-09-20T00:00:00", sale_price: "500000", buyer_name: null }],
    [],
  );

  try {
    const result = await getComparableSales(41.8831, -87.6401, "301", null, null, null);
    assert.equal(result.rawSalesCount, 1);
    assert.equal(result.matchedCharacteristics, 0);
    assert.equal(result.geocodedSalesCount, 0);
    assert.equal(result.nearbySalesCount, 0);
    assert.equal(result.comparables.length, 0);
    assert.equal(result.marketAnalysis.basedOnComps, 0);
  } finally {
    restoreFetch();
  }
});

test("sales query errors are returned distinctly from an empty sales result", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("Socrata unavailable", { status: 503 })) as typeof fetch;

  try {
    const result = await getComparableSales(41.8821, -87.6421, "302", null, null, null);
    assert.equal(result.rawSalesCount, 0);
    assert.match(result.error ?? "", /Sales data could not be retrieved: Socrata HTTP 503/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("empty sales result returns zero raw and characteristics counts", async () => {
  const restoreFetch = mockCountyApi([], []);

  try {
    const result = await getComparableSales(41.8871, -87.6441, "204", null, null, null);
    assert.equal(result.rawSalesCount, 0);
    assert.equal(result.matchedCharacteristics, 0);
  } finally {
    restoreFetch();
  }
});