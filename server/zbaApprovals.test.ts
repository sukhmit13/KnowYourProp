import assert from "node:assert/strict";
import {
  deriveZbaCoverageStatus,
  getSnapshotWithoutWaiting,
  retainLastGoodOnIncomplete,
  type ZbaActivityCoverage,
} from "./zbaApprovals";

const lastGood = [
  { caseNumber: "1-25-S", subject: "Existing approved case", lat: 41.9, lon: -87.6 },
  { caseNumber: "2-25-S", subject: "Second existing case" },
];

// A failed/incomplete fetch retains prior cases while allowing successful new
// evidence to be merged into that last-good snapshot.
assert.deepEqual(retainLastGoodOnIncomplete(lastGood, [], false), lastGood);
assert.deepEqual(
  retainLastGoodOnIncomplete(lastGood, [{ caseNumber: "3-25-S", subject: "New partial case" }], false).map(item => item.caseNumber),
  ["1-25-S", "2-25-S", "3-25-S"],
);
assert.deepEqual(retainLastGoodOnIncomplete(lastGood, [], true), []);
assert.equal(deriveZbaCoverageStatus({
  hasCache: true,
  agendaComplete: false,
  decisionsComplete: false,
  coordinateTotal: 2,
  geocodedCount: 1,
}), "partial");
assert.equal(deriveZbaCoverageStatus({
  hasCache: false,
  agendaComplete: false,
  decisionsComplete: false,
  coordinateTotal: 0,
  geocodedCount: 0,
}), "unavailable");
assert.equal(deriveZbaCoverageStatus({
  hasCache: true,
  agendaComplete: true,
  decisionsComplete: true,
  coordinateTotal: 2,
  geocodedCount: 2,
}), "available");

let refreshCount = 0;
let resolveRefresh!: () => void;
const pendingRefresh = new Promise<void>(resolve => { resolveRefresh = resolve; });
const currentSnapshot = {
  recentApprovals: lastGood,
  upcomingCases: [],
  coverage: {
    status: "partial",
    refreshing: true,
    checkedAt: null,
    agenda: { expectedMonths: 1, successfulMonths: 0 },
    decisions: { expectedMonths: 1, successfulMonths: 0 },
    coordinates: { total: 2, geocoded: 1, missing: 1 },
    note: "Stale cache retained during refresh.",
  } satisfies ZbaActivityCoverage,
};
const returned = getSnapshotWithoutWaiting(
  () => currentSnapshot,
  () => {
    refreshCount++;
    return pendingRefresh;
  },
);
assert.equal(returned, currentSnapshot);
assert.equal(refreshCount, 1);
assert.equal(returned.coverage.refreshing, true);
resolveRefresh();

console.log("ZBA snapshot coverage rules passed");