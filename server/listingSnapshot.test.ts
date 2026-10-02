import assert from "node:assert/strict";
import { buildListingSnapshotPrompt, normalizeAnnualListingValue } from "./listingSnapshot";

const prompt = buildListingSnapshotPrompt("123 Main St");
for (const field of ["revenue", "sde", "ebitda"]) {
  assert.ok(prompt.includes(`"${field}"`), `listing JSON contract includes ${field}`);
  assert.ok(prompt.includes(field), `listing extraction instructions mention ${field}`);
}
assert.match(prompt, /SDE and EBITDA may be negative only when the listing explicitly states a loss/);
assert.match(prompt, /not aliases for grossAnnualIncome or statedNoi/);

assert.equal(normalizeAnnualListingValue(120000), 120000);
assert.equal(normalizeAnnualListingValue(0), 0);
assert.equal(normalizeAnnualListingValue(-1000), null, "revenue cannot be negative");
assert.equal(normalizeAnnualListingValue(-1000, true), -1000, "explicitly stated negative earnings remain signed");
assert.equal(normalizeAnnualListingValue(Number.NaN, true), null);
assert.equal(normalizeAnnualListingValue(Number.POSITIVE_INFINITY, true), null);
assert.equal(normalizeAnnualListingValue(undefined, true), null, "older cached listings with absent earnings remain absent");
console.log("Listing snapshot extraction checks passed");