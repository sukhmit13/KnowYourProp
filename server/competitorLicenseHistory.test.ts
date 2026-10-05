import assert from "node:assert/strict";
import test from "node:test";
import { fetchCompetitorAddressHistory, getCompetitorLicenseHistory } from "./competitorLicenseHistory";

test("history paging includes renewals and cancelled records, and shared address requests reuse one job", async () => {
  const oldFetch = globalThis.fetch;
  const requests: URL[] = [];
  globalThis.fetch = async (url) => {
    requests.push(new URL(String(url)));
    assert.equal(requests.at(-1)!.searchParams.get("$where")?.includes("license_status"), false);
    assert.equal(requests.at(-1)!.searchParams.get("$where")?.includes("application_type"), false);
    const first = requests.at(-1)!.searchParams.get("$offset") === "0";
    return new Response(JSON.stringify(Array.from({ length: first ? 500 : 1 }, (_, i) => ({ id: String(i), address: "98765 W HISTORYTEST AVE" }))), { status: 200 });
  };
  try {
    const [a, b] = await Promise.all([
      fetchCompetitorAddressHistory("98765 W Historytest Ave"),
      fetchCompetitorAddressHistory("98765 West Historytest Avenue, Chicago, IL"),
    ]);
    assert.equal(requests.length, 2);
    assert.equal(a.length, 501);
    assert.equal(a, b);
    assert.equal(await fetchCompetitorAddressHistory("98765 W HISTORYTEST AVE"), a);
    assert.equal(requests.length, 2);
  } finally { globalThis.fetch = oldFetch; }
});

test("provider failure is explicit unknown, cached briefly, and never a clean no-prior-business result", async () => {
  const oldFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests++; return new Response("unavailable", { status: 503 }); };
  try {
    const input = { name: "New Daycare", address: "98764 W Historyfailure Ave", projectUse: "Day Care Center" };
    const first = await getCompetitorLicenseHistory(input);
    const second = await getCompetitorLicenseHistory(input);
    assert.equal(first.classification, "unknown");
    assert.equal(second.classification, "unknown");
    assert.match(first.detail, /HTTP 503/);
    assert.equal(requests, 1);
  } finally { globalThis.fetch = oldFetch; }
});

test("addresses outside Chicago do not get classified using Chicago-only coverage", async () => {
  const result = await getCompetitorLicenseHistory({ name: "Daycare", address: "100 Test Ave, Evanston, IL", projectUse: "Day Care Center" });
  assert.equal(result.classification, "unknown");
  assert.match(result.detail, /does not cover/);
});
