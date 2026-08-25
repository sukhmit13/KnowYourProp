import assert from "node:assert/strict";
import { categorizePermit, computeConstructionStats, isAccessoryStructure, shouldFlagConstructionSupply } from "./newConstruction";
import type { NewConstructionPermit } from "./chicagoPermits";

const permit = (overrides: Partial<NewConstructionPermit>): NewConstructionPermit => ({
  permitNumber: "P1", address: "100 N TEST ST", category: "singleFamily", workDescription: "NEW SINGLE FAMILY RESIDENCE",
  issueDate: "2026-01-15", reportedCost: 100000, communityArea: "24", latitude: 41.9, longitude: -87.6, ...overrides,
});

assert.equal(categorizePermit("NEW 1 DU SINGLE FAMILY RESIDENCE"), "singleFamily");
assert.equal(categorizePermit("NEW 24 DWELLING UNITS WITH RETAIL"), "multifamily");
assert.equal(categorizePermit("NEW RETAIL AND OFFICE BUILDING"), "commercial");
assert.equal(isAccessoryStructure("NEW DETACHED GARAGE SERVING EXISTING RESIDENCE"), true);
assert.equal(isAccessoryStructure("NEW 4 STORY APARTMENT WITH GARAGE"), false);

const stats = computeConstructionStats([
  permit({ permitNumber: "1", reportedCost: 100000, units: 1 }),
  permit({ permitNumber: "2", category: "multifamily", reportedCost: 340000, units: 12 }),
  permit({ permitNumber: "3", category: "commercial", reportedCost: 500000 }),
]);
assert.equal(stats.totalPermits, 3);
assert.equal(stats.byCategory.multifamily, 1);
assert.equal(stats.medianReportedCost, 340000);
assert.equal(stats.permittedUnits, 13);
assert.equal(shouldFlagConstructionSupply(12, 340), true);
assert.equal(shouldFlagConstructionSupply(12, 11), false);
assert.equal(shouldFlagConstructionSupply(340, 12), false);

console.log("new construction rules passed");