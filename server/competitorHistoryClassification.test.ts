import assert from "node:assert/strict";
import test from "node:test";
import { classifyCompetitorHistory, normalizeHistoryAddress, historyUseMatcher, type HistoryLicense } from "./competitorHistoryClassification";

const input = { name: "New Daycare", address: "100 West Test Avenue, Chicago, IL", projectUse: "Day Care Center" };
const license = (name: string, account: string, start: string, end: string, overrides: Partial<HistoryLicense> = {}): HistoryLicense => ({
  address: "100 W TEST AVE", doing_business_as_name: name, legal_name: `${name} LLC`,
  account_number: account, license_number: account, license_description: "Day Care Center 2 - 6 Years",
  license_start_date: start, expiration_date: end, ...overrides,
});
const current = license("New Daycare", "2", "2024-01-01", "2026-01-01");
const older = license("Old Daycare", "1", "2010-01-01", "2020-01-01");

test("a completed same-location history identifies a replacement, not a possible replacement", () => {
  const result = classifyCompetitorHistory(input, [older, current]);
  assert.equal(result.classification, "replacement");
  assert.equal(result.firstLicenseDate, "2024-01-01");
  assert.deepEqual(result.previousBusinesses, ["Old Daycare"]);
});
test("no earlier same-use operator yields additional within available license history", () => {
  const result = classifyCompetitorHistory(input, [current]);
  assert.equal(result.classification, "additional");
  assert.match(result.detail, /available City license history/);
  assert.match(result.detail, /not a verified opening date/);
});
test("a restaurant predecessor is not a daycare replacement", () => {
  assert.equal(classifyCompetitorHistory(input, [
    { ...older, license_description: "Retail Food Establishment" }, current,
  ]).classification, "additional");
});
test("renewals, additional licenses, and renamed DBA under the same account retain earliest observed date", () => {
  const result = classifyCompetitorHistory(input, [
    license("Previous DBA", "2", "2012-01-01", "2014-01-01"), current,
    license("New Daycare", "2", "2025-01-01", "2027-01-01"),
  ]);
  assert.equal(result.firstLicenseDate, "2012-01-01");
  assert.equal(result.classification, "additional");
  assert.deepEqual(result.previousBusinesses, []);
});
test("overlapping license dates are not proof of replacement", () => {
  const result = classifyCompetitorHistory(input, [{ ...older, expiration_date: "2025-01-01" }, current]);
  assert.equal(result.classification, "unknown");
  assert.equal(result.firstLicenseDate, "2024-01-01");
  assert.deepEqual(result.previousBusinesses, ["Old Daycare"]);
});
test("different explicit units do not create a false replacement", () => {
  const result = classifyCompetitorHistory({ ...input, address: "100 W Test Ave STE 100" }, [
    { ...older, address: "100 W TEST AVE #200" }, { ...current, address: "100 W TEST AVE UNIT 100" },
  ]);
  assert.equal(result.classification, "additional");
});
test("unitless prior records cannot establish replacement of a specific tenant", () => {
  const result = classifyCompetitorHistory({ ...input, address: "100 W Test Ave STE 100" }, [
    older, { ...current, address: "100 W TEST AVE UNIT 100" },
  ]);
  assert.equal(result.classification, "unknown");
});
test("a neighboring address or another street direction never supplies a predecessor", () => {
  assert.equal(classifyCompetitorHistory(input, [current,
    { ...older, address: "1000 W TEST AVE" }, { ...older, address: "100 E TEST AVE" },
  ]).classification, "additional");
});
test("missing, ambiguous, and incomplete history do not become a confirmed addition", () => {
  assert.equal(classifyCompetitorHistory(input, []).classification, "unknown");
  assert.equal(classifyCompetitorHistory(input, [older]).classification, "unknown");
  assert.equal(classifyCompetitorHistory(input, [current], false).classification, "unknown");
  assert.equal(classifyCompetitorHistory(input, [current, { ...current, account_number: "3" }]).classification, "unknown");
});
test("a city license number can establish identity despite a differently branded Places name", () => {
  assert.equal(classifyCompetitorHistory({ ...input, name: "Different Brand", licenseNumber: "2" }, [older, current]).classification, "replacement");
});
test("missing or impossible start dates cannot establish business age", () => {
  assert.equal(classifyCompetitorHistory(input, [{ ...current, license_start_date: "2024-02-30" }]).classification, "unknown");
});
test("gas and auto matching requires corresponding activities, not a convenience-store food license", () => {
  const gas = historyUseMatcher("Gas Station")!;
  assert.equal(gas({ license_description: "Retail Food Establishment" }), false);
  assert.equal(gas({ license_description: "Motor Vehicle Services License", business_activity: "Retail Sales of Motor Vehicle Fuel" }), true);
  assert.equal(historyUseMatcher("Auto Repair (Minor)")!({ business_activity: "Motor Vehicle Repair - Engine and Body Work" }), true);
});
test("tutoring-only children's services do not establish a prior daycare", () => {
  assert.equal(classifyCompetitorHistory(input, [current, { ...older,
    license_description: "Children's Services Facility License",
    business_activity: "After School Program / Tutoring Children Under 18 Years of Age",
  }]).classification, "additional");
});
test("undated prior operators do not turn into a clean negative history", () => {
  assert.equal(classifyCompetitorHistory(input, [current, { ...older, license_start_date: undefined, date_issued: undefined }]).classification, "unknown");
});
test("street normalization preserves unit identity and does not conflate similarly numbered buildings", () => {
  assert.deepEqual(normalizeHistoryAddress("100 West Test Avenue, Chicago, IL"), normalizeHistoryAddress("100 W TEST AVE"));
  assert.notEqual(normalizeHistoryAddress("100 W TEST AVE").building, normalizeHistoryAddress("1000 W TEST AVE").building);
});
