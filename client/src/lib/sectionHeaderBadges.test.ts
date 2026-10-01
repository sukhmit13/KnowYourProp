import assert from "node:assert/strict";
import test from "node:test";
import { fallbackSummaryBadge, headerBadgeNumber, headerCountyRecordBadge, headerCountyUnitCount, headerFarCeilingBadge } from "./sectionHeaderBadges";

test("FAR ceiling badge retains the known subject ceiling when companion data is missing", () => {
  for (const companionLotSf of [undefined, null, "", " ", 0, -1, NaN]) {
    const label = headerFarCeilingBadge({ lotSf: 2967, maxFar: 1.2, hasCompanion: true, companionLotSf });
    assert.equal(label, "Est. subject ceiling 3,560 SF");
    assert.deepEqual(fallbackSummaryBadge({ hasData: true, label, emptyLabel: "Inputs needed" }), { label, tone: "c" });
  }
});

test("FAR ceiling badge scopes complete areas and never double-counts a manual combined override", () => {
  assert.equal(headerFarCeilingBadge({ lotSf: "2,967", maxFar: "1.2" }), "Est. FAR ceiling 3,560 SF");
  assert.equal(headerFarCeilingBadge({ lotSf: 2967, maxFar: 1.2, hasCompanion: true, companionLotSf: 2500 }),
    "Est. combined ceiling 6,560 SF");
  for (const companionLotSf of [undefined, 2500]) {
    assert.equal(headerFarCeilingBadge({ lotSf: 5467, maxFar: 1.2, hasCompanion: true, companionLotSf, manualCombinedLot: true }),
      "Est. combined ceiling 6,560 SF");
  }
  assert.equal(headerFarCeilingBadge({ lotSf: 2967, maxFar: 1.2, hasCompanion: false, companionLotSf: 2500 }),
    "Est. FAR ceiling 3,560 SF");
});

test("FAR ceiling badge still requires a valid subject lot area and FAR", () => {
  for (const value of [undefined, null, "", " ", 0, -1, true, Infinity, NaN]) {
    assert.equal(headerFarCeilingBadge({ lotSf: value, maxFar: 1.2, hasCompanion: true, companionLotSf: 2500 }), undefined);
    assert.equal(headerFarCeilingBadge({ lotSf: 2967, maxFar: value }), undefined);
  }
});

test("fallback badges explain applicability, check, and loading state in priority order", () => {
  assert.deepEqual(fallbackSummaryBadge({ applicable: false, checked: false }), {
    label: "Not applicable",
    tone: "c",
  });
  assert.deepEqual(fallbackSummaryBadge({ checked: false, loading: true }), {
    label: "Not checked",
    tone: "c",
  });
  assert.deepEqual(fallbackSummaryBadge({ loading: true }), {
    label: "Checking",
    tone: "indigo",
  });
  assert.deepEqual(fallbackSummaryBadge({ loading: true, hasData: true }), {
    label: "Status not verified",
    tone: "c",
  });
});

test("fallback badges distinguish unavailable, incomplete, known, and successful empty data", () => {
  assert.deepEqual(fallbackSummaryBadge(), { label: "Unavailable", tone: "c" });
  assert.deepEqual(fallbackSummaryBadge({ error: true }), { label: "Unavailable", tone: "c" });
  assert.deepEqual(fallbackSummaryBadge({ error: true, hasData: true }), {
    label: "Status not verified",
    tone: "c",
  });
  assert.deepEqual(fallbackSummaryBadge({ incomplete: true, label: "Known finding" }), {
    label: "Data incomplete",
    tone: "c",
  });
  assert.deepEqual(fallbackSummaryBadge({ label: "  Known finding  " }), {
    label: "  Known finding  ",
    tone: "c",
  });
  assert.deepEqual(fallbackSummaryBadge({ label: "  " }), { label: "Unavailable", tone: "c" });
  assert.deepEqual(fallbackSummaryBadge({ hasData: true, emptyLabel: "No records found" }), {
    label: "No records found",
    tone: "c",
  });
  assert.deepEqual(fallbackSummaryBadge({ hasData: true }), { label: "Status not verified", tone: "c" });
});

test("headerBadgeNumber accepts finite nonnegative numbers and numeric strings including zero", () => {
  for (const value of [0, 1, 12.5, "0", " 2 ", "1,234.5"]) {
    assert.equal(typeof headerBadgeNumber(value), "number", `Expected ${String(value)} to parse`);
  }
  assert.equal(headerBadgeNumber(0), 0);
  assert.equal(headerBadgeNumber("0"), 0);
  assert.equal(headerBadgeNumber("1,234.5"), 1234.5);
});

test("headerBadgeNumber rejects absent, boolean, empty, malformed, negative, and non-finite values", () => {
  for (const value of [null, undefined, true, false, "", "not a number", -1, "-0.1", Infinity, -Infinity, NaN, {}, []]) {
    assert.equal(headerBadgeNumber(value), null, `Expected ${String(value)} to be rejected`);
  }
  assert.equal(headerBadgeNumber(" "), null, "Whitespace-only text is empty, not numeric zero");
});

test("headerCountyUnitCount falls back from absent or blank apartment counts to positive commercial units", () => {
  for (const apartments of [null, undefined, "", "   "]) {
    assert.equal(headerCountyUnitCount(apartments, 4), 4);
    assert.equal(headerCountyUnitCount(apartments, "3"), 3);
    assert.equal(headerCountyUnitCount(apartments, null), null);
    assert.equal(headerCountyUnitCount(apartments, 0), null);
  }
});

test("headerCountyUnitCount preserves zero, parses word counts, and falls back on malformed apartment values", () => {
  assert.equal(headerCountyUnitCount(0, 4), 0);
  assert.equal(headerCountyUnitCount("0", 4), 0);
  assert.equal(headerCountyUnitCount("Two", 4), 2);
  assert.equal(headerCountyUnitCount("not recorded", 4), 4);
  assert.equal(headerCountyUnitCount("not recorded", null), null);
});

test("county record badge includes commercial years and prefers year built over square footage", () => {
  assert.equal(headerCountyRecordBadge({ years: [null, undefined, 1898], buildingAreas: [null, undefined, 10040] }, 2026), "Built 1898");
  assert.equal(headerCountyRecordBadge({ years: [1920, 1910, 1898], buildingAreas: [2000] }, 2026), "Built 1920");
  assert.equal(headerCountyRecordBadge({ years: [" 1898 "], buildingAreas: [10040] }, 2026), "Built 1898");
});

test("invalid primary years do not hide a valid recorded fallback year", () => {
  for (const year of [undefined, null, "", " ", 0, -1, 1699, 2027, 1898.5, NaN, Infinity, true, "unknown"]) {
    assert.equal(headerCountyRecordBadge({ years: [year, 1898], buildingAreas: [10040] }, 2026), "Built 1898");
  }
});

test("county record badge falls back to positive recorded building square footage", () => {
  assert.equal(headerCountyRecordBadge({ years: [null, undefined], buildingAreas: [null, undefined, 10040] }, 2026), "10,040 sq ft");
  assert.equal(headerCountyRecordBadge({ years: [0, 2027], buildingAreas: [0, "1,250", 10040] }, 2026), "1,250 sq ft");
});

test("missing or invalid year and area remain unknown, not an incomplete-record claim", () => {
  for (const area of [undefined, null, "", " ", 0, -1, NaN, Infinity, true, "unknown"]) {
    const label = headerCountyRecordBadge({ years: [null, 0], buildingAreas: [area] }, 2026);
    assert.equal(label, undefined);
    assert.equal(fallbackSummaryBadge({ hasData: true, label, emptyLabel: "Year / area unavailable" }).label, "Year / area unavailable");
  }
});