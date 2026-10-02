import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { alignChildcareChildrenUnder5, getChildcareEnhancedRanks } from "./childcareEnhancedRanks";

test("childcare ranks use descending competition ranks and valid unique geographies", () => {
  const data = [
    { zipCode: "10001", childrenUnder5: 10, pct0to2: 0, laborForceDelta: 5, parentsInLaborForcePct0to5: 60 },
    { zipCode: "10002", childrenUnder5: 20, pct0to2: 40, laborForceDelta: 5, parentsInLaborForcePct0to5: 70 },
    { zipCode: "10003", childrenUnder5: 20, pct0to2: 20, laborForceDelta: 3, parentsInLaborForcePct0to5: 70 },
    { zipCode: "10004", childrenUnder5: null, pct0to2: 10, laborForceDelta: "", parentsInLaborForcePct0to5: 50 },
    { zipCode: "10002", childrenUnder5: 999, pct0to2: 99, laborForceDelta: 99, parentsInLaborForcePct0to5: 99 },
  ];
  const before = structuredClone(data);

  const result = getChildcareEnhancedRanks(data, data[0], "zipCode");

  assert.deepEqual(result, {
    ranks: {
      childrenUnder5: { rank: 3, total: 3, sourceValue: 10 },
      pct0to2: { rank: 4, total: 4 },
      laborForceDelta: { rank: 1, total: 3 },
      parentsInLaborForcePct0to5: { rank: 3, total: 4 },
    },
    comparisonTotal: 4,
  });
  assert.deepEqual(data, before, "ranking must not mutate the cached source array");
});

test("invalid targets have no rank while valid zeroes remain rankable", () => {
  const data = [
    { communityArea: "Alpha", childrenUnder5: 0, pct0to2: null, laborForceDelta: 0, parentsInLaborForcePct0to5: 0 },
    { communityArea: "Beta", childrenUnder5: 4, pct0to2: 10, laborForceDelta: 2, parentsInLaborForcePct0to5: 5 },
    { communityArea: "Gamma", childrenUnder5: Number.NaN, pct0to2: undefined, laborForceDelta: Infinity, parentsInLaborForcePct0to5: "3" },
  ];

  const validZero = getChildcareEnhancedRanks(data, data[0], "communityArea");
  assert.deepEqual(validZero.ranks, {
    childrenUnder5: { rank: 2, total: 2, sourceValue: 0 },
    pct0to2: null,
    laborForceDelta: { rank: 2, total: 2 },
    parentsInLaborForcePct0to5: { rank: 2, total: 2 },
  });

  const invalidTarget = getChildcareEnhancedRanks(data, data[2], "communityArea");
  assert.deepEqual(invalidTarget.ranks, {
    childrenUnder5: null,
    pct0to2: null,
    laborForceDelta: null,
    parentsInLaborForcePct0to5: null,
  });
  assert.equal(invalidTarget.comparisonTotal, 3);
});

test("empty or unidentifiable comparison sets yield null ranks", () => {
  const target = { zipCode: "10001", childrenUnder5: 2, pct0to2: 1, laborForceDelta: 3, parentsInLaborForcePct0to5: 4 };
  const result = getChildcareEnhancedRanks([], target, "zipCode");
  assert.deepEqual(result, {
    ranks: {
      childrenUnder5: null,
      pct0to2: null,
      laborForceDelta: null,
      parentsInLaborForcePct0to5: null,
    },
    comparisonTotal: 0,
  });
});

test("community ranks join the access counts without replacing enhanced response records", () => {
  const accessByArea = JSON.parse(readFileSync("server/data/community_area_childcare.json", "utf8")) as Record<
    string,
    { childrenUnder5?: number }
  >;
  const enhanced = JSON.parse(readFileSync("server/data/demographics/childcare_enhanced.json", "utf8")) as Array<{
    communityArea: string;
    childrenUnder5: number;
    pct0to2: number;
    laborForceDelta: number;
    parentsInLaborForcePct0to5: number;
  }>;
  const accessRecords = enhanced.map(record => ({
    communityArea: record.communityArea,
    childrenUnder5: accessByArea[record.communityArea.toUpperCase()]?.childrenUnder5 ?? null,
  }));
  const rankingRecords = alignChildcareChildrenUnder5(enhanced, accessRecords, "communityArea");
  const matching = enhanced.filter(record =>
    record.childrenUnder5 === accessByArea[record.communityArea.toUpperCase()]?.childrenUnder5
  );
  const differing = enhanced.filter(record =>
    record.childrenUnder5 !== accessByArea[record.communityArea.toUpperCase()]?.childrenUnder5
  );
  const targetIndex = enhanced.findIndex(record => record.communityArea === "Albany Park");
  const ranks = getChildcareEnhancedRanks(rankingRecords, enhanced[targetIndex], "communityArea");
  const responsePayload = { ...enhanced[targetIndex], ...ranks };

  assert.equal(matching.length, 13);
  assert.equal(differing.length, 64);
  assert.equal(responsePayload.comparisonTotal, 77);
  assert.equal(responsePayload.ranks.childrenUnder5?.total, 77);
  assert.equal(responsePayload.ranks.childrenUnder5?.sourceValue, accessByArea["ALBANY PARK"].childrenUnder5);
  assert.equal(rankingRecords[targetIndex].childrenUnder5, accessByArea["ALBANY PARK"].childrenUnder5);
  assert.equal(responsePayload.childrenUnder5, 3824, "wire keeps the original enhanced record field");
  assert.notEqual(responsePayload.ranks.childrenUnder5?.sourceValue, responsePayload.childrenUnder5);
});

test("missing access identity does not fall back to enhanced childrenUnder5", () => {
  const enhanced = [
    { communityArea: "Alpha", childrenUnder5: 100, pct0to2: 20, laborForceDelta: 3, parentsInLaborForcePct0to5: 60 },
    { communityArea: "Beta", childrenUnder5: 200, pct0to2: 30, laborForceDelta: 4, parentsInLaborForcePct0to5: 70 },
  ];
  const rankingRecords = alignChildcareChildrenUnder5(
    enhanced,
    [{ communityArea: "Alpha", childrenUnder5: 0 }],
    "communityArea",
  );

  assert.equal(rankingRecords[0].childrenUnder5, 0);
  assert.equal(rankingRecords[1].childrenUnder5, null);
  assert.equal(enhanced[1].childrenUnder5, 200);
  const ranks = getChildcareEnhancedRanks(rankingRecords, enhanced[1], "communityArea");
  assert.equal(ranks.ranks.childrenUnder5, null);
  assert.equal(ranks.comparisonTotal, 2);
});