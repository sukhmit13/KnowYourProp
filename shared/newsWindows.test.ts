import assert from "node:assert/strict";
import { hasCurrentNeighborhoodWindow, NEIGHBORHOOD_NEWS_DAYS } from "./newsWindows";

assert.equal(NEIGHBORHOOD_NEWS_DAYS, 365);
assert.equal(hasCurrentNeighborhoodWindow({ window_days: 120 }), false, "old cached summaries must rebuild");
assert.equal(hasCurrentNeighborhoodWindow({}), false, "unversioned cached summaries must rebuild");
assert.equal(hasCurrentNeighborhoodWindow(null), false);
assert.equal(hasCurrentNeighborhoodWindow({ window_days: 365 }), true);
console.log("Neighborhood News window and cache checks passed");