import assert from "node:assert/strict";
import test from "node:test";
import { compareCorridorLicenses, licenseComparisonDates } from "./corridorLicenseComparison";
import type { NearbyLicense } from "./businessLicenses";

const asOf = new Date("2026-10-03T18:00:00Z");
const row = (businessName: string, address: string, startDate: string): NearbyLicense => ({
  businessName, address, startDate, licenseType: "Retail Food", licenseCategory: "food",
  latitude: 41.9, longitude: -87.6, distanceMiles: 0.1,
});

test("equal calendar-year windows have a full lookback for both periods", () => {
  assert.deepEqual(licenseComparisonDates(asOf), {
    end: "2026-10-04", currentStart: "2025-10-04", priorStart: "2024-10-04", historyStart: "2023-10-04",
  });
  assert.equal(licenseComparisonDates(new Date("2024-02-28T12:00:00Z")).currentStart, "2023-02-28");
});

test("different names replacing each other do not manufacture new licensed addresses", () => {
  const result = compareCorridorLicenses([
    row("Original Cafe", "100 W Test Avenue", "2024-01-01"),
    row("Second Cafe", "100 W Test Ave", "2025-01-01"),
    row("Third Cafe", "100 W Test Ave", "2026-01-01"),
    row("Third Cafe", "100 W Test Ave", "2026-03-01"),
  ], asOf);
  assert.equal(result.current.businessesWithNewLicenses, 1);
  assert.equal(result.prior.businessesWithNewLicenses, 1);
  assert.equal(result.current.previouslyUnseenAddresses, 0);
  assert.equal(result.prior.previouslyUnseenAddresses, 0);
  assert.equal(result.current.differentNamesAtKnownAddresses, 1);
  assert.equal(result.businessChange, 0);
  assert.equal(result.addressChange, 0);
  assert.deepEqual(result.possibleTurnover[0].previousNames, ["Second Cafe"]);
});

test("additional licenses for a recurring name are not first-observed businesses", () => {
  const result = compareCorridorLicenses([
    row("Existing Cafe", "100 W Test St", "2025-01-01"),
    row("Existing Cafe", "100 W Test St", "2026-01-01"),
    row("Fresh Cafe", "200 W Test St", "2026-01-01"),
  ], asOf);
  assert.equal(result.current.recurringBusinesses, 1);
  assert.equal(result.current.firstObservedBusinesses, 1);
  assert.equal(result.current.previouslyUnseenAddresses, 1);
  assert.equal(result.current.differentNamesAtKnownAddresses, 0);
  assert.equal(result.businessChangePct, 100);
});

test("same-period name changes share one address and expose their earlier name", () => {
  const result = compareCorridorLicenses([
    row("First Cafe", "100 W Test St", "2026-01-01"),
    row("Second Cafe", "100 W Test St", "2026-06-01"),
  ], asOf);
  assert.equal(result.current.businessesWithNewLicenses, 2);
  assert.equal(result.current.licensedAddresses, 1);
  assert.equal(result.current.previouslyUnseenAddresses, 1);
  assert.equal(result.current.differentNamesAtKnownAddresses, 1);
  assert.equal(result.businessChangePct, null);
});

test("invalid, future, and out-of-history records never inflate comparison counts", () => {
  const result = compareCorridorLicenses([
    row("Future", "100 W Test St", "2026-11-01"),
    row("Too old", "200 W Test St", "2023-01-01"),
    row("Invalid date", "300 W Test St", "2026-02-31"),
    row("Unknown", "400 W Test St", "2026-01-01"),
    row("Boundary", "500 W Test St", "2025-10-04"),
  ], asOf);
  assert.equal(result.current.businessesWithNewLicenses, 1);
  assert.equal(result.prior.businessesWithNewLicenses, 0);
  assert.equal(result.businessChangePct, null);
});