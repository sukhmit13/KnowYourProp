import assert from "node:assert/strict";
import test from "node:test";
import { licenseComparisonDates } from "@shared/corridorLicenseComparison";
import { getNearbyBusinessLicenses } from "./businessLicenses";

test("corridor history loads 36 months of ISSUE records while current/prior counts remain 12 months each", async () => {
  const dates = licenseComparisonDates();
  const raw = (id: string, name: string, date: string) => ({
    id, license_id: id, legal_name: name, doing_business_as_name: name, address: "100 W Chicago Ave",
    city: "Chicago", state: "IL", zip_code: "60622", license_description: "Retail Food Establishment",
    business_activity: "", license_start_date: date, license_status: "AAI", application_type: "ISSUE",
    latitude: "41.896", longitude: "-87.69",
  });
  const rows = [
    raw("current", "Current Cafe", dates.currentStart),
    raw("prior", "Prior Cafe", dates.priorStart),
    raw("baseline", "Older Cafe", dates.historyStart),
  ];
  const originalFetch = globalThis.fetch;
  const queries: string[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    const where = url.searchParams.get("$where")!;
    queries.push(where);
    assert.ok(where.includes("application_type='ISSUE'"));
    assert.ok(where.includes(`license_start_date>='${dates.historyStart}'`));
    assert.ok(where.includes(`license_start_date<'${dates.end}'`));
    return new Response(JSON.stringify(rows), { status: 200 });
  };
  try {
    const result = await getNearbyBusinessLicenses(41.896, -87.69, 1, true);
    assert.equal(queries.length, 2);
    assert.equal(result.totalCount, 1);
    assert.equal(result.priorPeriodCount, 1);
    assert.equal(result.changePct, 0);
    assert.equal(result.issuanceHistory?.length, 3, "duplicate query hits deduplicate by source transaction");
    assert.equal(result.issuanceComparison?.current.previouslyUnseenAddresses, 0);
    assert.equal(result.issuanceComparison?.current.differentNamesAtKnownAddresses, 1);
    assert.deepEqual(result.issuanceComparison?.currentObservations[0].previousNames, ["Prior Cafe"]);
    assert.deepEqual(result.licenses.map(row => row.businessName), ["Current Cafe"]);
    const withoutHistory = await getNearbyBusinessLicenses(41.896, -87.69, 1);
    assert.equal(withoutHistory.issuanceHistory, undefined, "ordinary consumers do not receive a large extra history payload");
    assert.deepEqual(withoutHistory.issuanceComparison, result.issuanceComparison, "nearby and corridor consumers share the same turnover comparison");
  } finally {
    globalThis.fetch = originalFetch;
  }
});