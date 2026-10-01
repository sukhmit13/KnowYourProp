import assert from "node:assert/strict";
import {
  buildDevelopmentPipeline,
  addressesMatchForPipeline,
  getDevelopmentCorridor,
  normalizeAddrForMatch,
} from "./developmentPipeline";

assert.equal(normalizeAddrForMatch("100 N Main St"), normalizeAddrForMatch("100 North Main Street"));
assert.notEqual(normalizeAddrForMatch("100 N Main St"), normalizeAddrForMatch("100 S Main St"));
assert.notEqual(normalizeAddrForMatch("100 N North Ave"), normalizeAddrForMatch("100 S North Ave"));
assert.equal(normalizeAddrForMatch("100 W North Avenue"), "100 W NORTH");
assert.equal(normalizeAddrForMatch("100 North Avenue"), "100 NORTH");
assert.equal(addressesMatchForPipeline("100-104 W Main St", "100 West Main Street"), true);
assert.equal(addressesMatchForPipeline("100-104 W Main St", "102 W Main St"), true);
assert.equal(addressesMatchForPipeline("100-104 W Main St", "106 W Main St"), false);
assert.equal(addressesMatchForPipeline("100-104 N Main St", "102 S Main St"), false);

const now = Date.parse("2026-01-01T00:00:00.000Z");
const cutoff = now - 18 * 30.4375 * 24 * 60 * 60 * 1000;
const atCutoff = new Date(cutoff).toISOString();
const olderThanCutoff = new Date(cutoff - 24 * 60 * 60 * 1000).toISOString();

const result = buildDevelopmentPipeline({
  now,
  permits: [
    { permitNumber: "active-1", address: "100 N Main St", issueDate: "2025-10-01", units: 20 },
    { permitNumber: "active-2", address: "100 North Main Street", issueDate: "2025-11-01", units: 24 },
    { permitNumber: "cutoff", address: "500 W Lake St", issueDate: atCutoff, units: 10 },
    { permitNumber: "old", address: "200 N Elm St", issueDate: olderThanCutoff, units: 30 },
    { permitNumber: "unknown-units", address: "300 S Pine St", issueDate: "2025-12-01" },
    { permitNumber: "ambiguous", address: "400 S Oak St", issueDate: "2025-12-01", units: 8, unitsAmbiguous: true },
  ],
  dpdApplications: [
    { id: "same-as-permit", address: "100 North Main Street", units: 250 },
    { id: "same-dpd-1", address: "600 W Lake St", units: 40, applicationType: "Retail planned development" },
    { id: "same-dpd-2", address: "600 West Lake Street", units: 65, unitsAmbiguous: true },
    { id: "no-units", address: "700 N Ashland Ave", units: null },
    { id: "old-permit-overlap", address: "200 North Elm Street", units: 100 },
  ],
  recentApprovals: [
    { caseNumber: "zba-overlap", address: "600 West Lake Street", subject: "A 200-unit special use retail development" },
    { caseNumber: "zba-only", address: "800 N Broadway Ave", subject: "A 12-unit mixed-use project with retail" },
    { caseNumber: "zba-missing-units", address: "900 S Halsted St", subject: "Special use for a restaurant" },
  ],
  upcomingCases: [],
  developments: [
    { id: "coverage-only", address: "999 W Randolph St", units: 900, stage: 2 },
    { id: "news-overlap", address: "100 N Main St", units: 500, stage: 2 },
    { id: "no-address", units: 700, stage: 2 },
  ],
});

assert.equal(result.metrics.unitsUnderConstruction, null);
assert.equal(result.metrics.observedUnitsUnderConstruction, 42);
assert.equal(result.metrics.activePermitCount, 5);
assert.equal(result.metrics.potentialUnits, 77);
assert.equal(result.metrics.potentialAmbiguous, true);
assert.equal(result.metrics.potentialUnitsUnknownAddressCount, 2);
assert.equal(result.metrics.permitUnitsUnknownAddressCount, 1);
assert.equal(result.metrics.permitUnitsAmbiguous, true);
assert.equal(result.metrics.permitUnitsSource, "description");
assert.equal(result.metrics.invalidDatePermitCount, 0);
assert.equal(result.metrics.commercialProposals, 3);

assert.equal(result.dpdApplications[0].pipelineStage, "permitted");
assert.equal(result.dpdApplications[1].pipelineStage, "proposed");
assert.equal(result.recentApprovals[0].pipelineStage, "proposed");
assert.equal(result.recentApprovals[1].pipelineStage, "zoning");
assert.equal(result.developments[0].pipelineStage, "coverage");
assert.equal(result.developments[1].pipelineStage, "permitted");
assert.equal(result.developments[0].units, 900);
assert.equal(result.developments[0].stage, 2);

assert.deepEqual(
  getDevelopmentCorridor("1000 N Broadway Ave", 41.96, -87.659),
  { key: "broadway", name: "Broadway", tier: 1 },
);
assert.equal(getDevelopmentCorridor("1000 N Sheridan Rd", 41.96, -87.659), null);
assert.equal(getDevelopmentCorridor("1000 N Broadway Ave", 41.96, -87.70), null);
assert.equal(getDevelopmentCorridor("1000 N Broadway Ave", null, -87.659), null);
assert.equal(getDevelopmentCorridor("1000 N Broadway Ave", 41.96, null), null);

const diagonal = getDevelopmentCorridor("1000 N Milwaukee Ave", 41.90, -87.675);
assert.equal(diagonal?.key, "milwaukee_avenue");
assert.equal(getDevelopmentCorridor("1000 N Milwaukee Ave", 41.90, -87.70), null);

const expiredPermit = buildDevelopmentPipeline({
  now,
  permits: [{ permitNumber: "old-excludes", address: "100 N Main St", issueDate: olderThanCutoff, units: 50 }],
  dpdApplications: [{ address: "100 North Main Street", units: 200 }],
  recentApprovals: [],
  upcomingCases: [],
  developments: [{ address: "100 N Main St", units: 300 }],
});
assert.equal(expiredPermit.metrics.activePermitCount, 0);
assert.equal(expiredPermit.metrics.unitsUnderConstruction, 0);
assert.equal(expiredPermit.metrics.potentialUnits, 0);
assert.equal(expiredPermit.dpdApplications[0].pipelineStage, "permitted");
assert.equal(expiredPermit.developments[0].pipelineStage, "permitted");

const invalidPermitPrecedence = buildDevelopmentPipeline({
  now,
  permits: [
    { permitNumber: "future", address: "100 N Main St", issueDate: "2027-01-01", units: 10 },
    { permitNumber: "invalid", address: "200 N Main St", issueDate: "not-a-date", units: 10 },
  ],
  dpdApplications: [
    { address: "100 North Main Street", units: 80 },
    { address: "200 North Main Street", units: 60 },
  ],
  recentApprovals: [],
  upcomingCases: [],
  developments: [],
});
assert.equal(invalidPermitPrecedence.metrics.activePermitCount, 0);
assert.equal(invalidPermitPrecedence.metrics.invalidDatePermitCount, 2);
assert.equal(invalidPermitPrecedence.metrics.potentialUnits, 140);
assert.equal(invalidPermitPrecedence.dpdApplications[0].pipelineStage, "proposed");
assert.equal(invalidPermitPrecedence.dpdApplications[1].pipelineStage, "proposed");
assert.equal(invalidPermitPrecedence.permits[0].pipelineStage, "proposed");
assert.equal(invalidPermitPrecedence.permits[1].pipelineStage, "proposed");

const rangeOverlap = buildDevelopmentPipeline({
  now,
  permits: [
    { permitNumber: "range", address: "100-104 W Main St", issueDate: "2025-12-01", units: 40 },
    { permitNumber: "single", address: "100 West Main Street", issueDate: "2025-12-01", units: 20 },
    { permitNumber: "south", address: "100 S Main St", issueDate: "2025-12-01", units: 15 },
  ],
  dpdApplications: [
    { address: "102 W Main St", units: 200 },
    { address: "100 N Main St", units: 30 },
  ],
  recentApprovals: [],
  upcomingCases: [],
  developments: [
    { address: "102 West Main Street" },
    { address: "100 South Main Street" },
  ],
});
assert.equal(rangeOverlap.metrics.unitsUnderConstruction, 55);
assert.equal(rangeOverlap.metrics.activePermitCount, 3);
assert.equal(rangeOverlap.metrics.potentialUnits, 30);
assert.equal(rangeOverlap.dpdApplications[0].pipelineStage, "permitted");
assert.equal(rangeOverlap.dpdApplications[1].pipelineStage, "proposed");
assert.equal(rangeOverlap.developments[0].pipelineStage, "permitted");
assert.equal(rangeOverlap.developments[1].pipelineStage, "permitted");

const noNewsContribution = buildDevelopmentPipeline({
  now,
  permits: [],
  dpdApplications: [],
  recentApprovals: [],
  upcomingCases: [],
  developments: [{ address: "100 N Main St", units: 500, unitsAmbiguous: true }],
});
assert.equal(noNewsContribution.metrics.potentialUnits, 0);
assert.equal(noNewsContribution.metrics.potentialAmbiguous, false);
assert.equal(noNewsContribution.metrics.commercialProposals, 0);

const allUnknownPermitUnits = buildDevelopmentPipeline({
  now,
  permits: [
    { permitNumber: "unknown-1", address: "100 N Main St", issueDate: "2025-12-01" },
    { permitNumber: "unknown-2", address: "200 N Main St", issueDate: "2025-12-01" },
  ],
  dpdApplications: [],
  recentApprovals: [],
  upcomingCases: [],
  developments: [],
});
assert.equal(allUnknownPermitUnits.metrics.unitsUnderConstruction, null);
assert.equal(allUnknownPermitUnits.metrics.observedUnitsUnderConstruction, 0);
assert.equal(allUnknownPermitUnits.metrics.permitUnitsUnknownAddressCount, 2);

const mixedPermitUnits = buildDevelopmentPipeline({
  now,
  permits: [
    { permitNumber: "known", address: "100 N Main St", issueDate: "2025-12-01", units: 12 },
    { permitNumber: "unknown", address: "200 N Main St", issueDate: "2025-12-01" },
  ],
  dpdApplications: [],
  recentApprovals: [],
  upcomingCases: [],
  developments: [],
});
assert.equal(mixedPermitUnits.metrics.unitsUnderConstruction, null);
assert.equal(mixedPermitUnits.metrics.observedUnitsUnderConstruction, 12);
assert.equal(mixedPermitUnits.metrics.permitUnitsUnknownAddressCount, 1);

const newsRangeBridge = buildDevelopmentPipeline({
  now,
  permits: [
    { permitNumber: "range-a", address: "100-104 W Main St", issueDate: "2025-12-01", units: 20 },
    { permitNumber: "range-b", address: "200-204 W Main St", issueDate: "2025-12-01", units: 30 },
  ],
  dpdApplications: [],
  recentApprovals: [],
  upcomingCases: [],
  developments: [{ id: "bridge-news", address: "100-204 W Main St", stage: 2 }],
});
assert.equal(newsRangeBridge.metrics.unitsUnderConstruction, 50);
assert.equal(newsRangeBridge.metrics.observedUnitsUnderConstruction, 50);

const wardEvidenceRangeBridge = buildDevelopmentPipeline({
  now,
  permits: [
    { permitNumber: "range-a", address: "100-104 W Main St", issueDate: "2025-12-01", units: 20 },
    { permitNumber: "range-b", address: "200-204 W Main St", issueDate: "2025-12-01", units: 30 },
  ],
  dpdApplications: [],
  recentApprovals: [],
  upcomingCases: [],
  zbaEvidenceUpcomingCases: [{ caseNumber: "out-of-radius-bridge", address: "100-204 W Main St" }],
  developments: [],
});
assert.equal(wardEvidenceRangeBridge.metrics.unitsUnderConstruction, 50);
assert.equal(wardEvidenceRangeBridge.metrics.observedUnitsUnderConstruction, 50);

console.log("development pipeline rules passed");