import assert from "node:assert/strict";
import { getDpdApplications } from "./dpdApplications";

const originalFetch = globalThis.fetch;
const hearingPage = `
  <table>
    <tr>
      <td>123 N MAIN ST</td>
      <td>Replacing a 6-unit building with a 200-unit tower.</td>
    </tr>
  </table>
`;

try {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("geocoding.geo.census.gov")) {
      return new Response(JSON.stringify({ result: { addressMatches: [] } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(hearingPage, { status: 200 });
  }) as typeof fetch;

  const { applications } = await getDpdApplications(1);
  assert.equal(applications.length, 1);
  assert.equal(applications[0].units, 200);
  assert.equal(applications[0].unitsAmbiguous, true);
} finally {
  globalThis.fetch = originalFetch;
}