import assert from "node:assert/strict";
import { getUpcomingDevelopmentsRefetchInterval } from "./use-runs";

const pendingColdSnapshot = {
  pipeline: {
    sourceCoverage: {
      zbaActivity: { refreshing: true },
    },
  },
};

assert.equal(getUpcomingDevelopmentsRefetchInterval(pendingColdSnapshot, 0), 10_000);
assert.equal(getUpcomingDevelopmentsRefetchInterval({
  pipeline: {
    sourceCoverage: {
      zbaActivity: { refreshing: false, projects: [{ id: "available" }] },
    },
  },
}, 10_000), false);
assert.equal(getUpcomingDevelopmentsRefetchInterval(pendingColdSnapshot, 90_000), false);