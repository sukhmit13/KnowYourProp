import assert from "node:assert/strict";
import test from "node:test";
import { getHmdaRankings } from "./hmdaRankings";

test("community rankings report subject counts and leaders for each year's dataset", () => {
  const yearData = {
    2025: {
      NORTH: { total: 80, originated: { total: 50 } },
      SOUTH: { total: 120, originated: { total: 40 } },
      WEST: { total: 60, originated: { total: 70 } },
    },
    2024: {
      NORTH: { total: 55, originated: { total: 25 } },
      SOUTH: { total: 50, originated: { total: 35 } },
    },
    2023: {
      NORTH: { total: 30, originated: { total: 10 } },
      SOUTH: { total: 70, originated: { total: 20 } },
    },
  };

  const ranks2025 = getHmdaRankings(yearData[2025], "NORTH", "Chicago community areas");
  const ranks2024 = getHmdaRankings(yearData[2024], "NORTH", "Chicago community areas");
  const ranks2023 = getHmdaRankings(yearData[2023], "NORTH", "Chicago community areas");

  assert.deepEqual(ranks2025, {
    byTotal: { rank: 2, outOf: 3, count: 80, leader: { name: "SOUTH", count: 120 } },
    byOriginated: { rank: 2, outOf: 3, count: 50, leader: { name: "WEST", count: 70 } },
    areaLabel: "Chicago community areas",
  });
  assert.equal(ranks2024?.byTotal.rank, 1);
  assert.equal(ranks2024?.byTotal.count, 55);
  assert.deepEqual(ranks2024?.byTotal.leader, { name: "NORTH", count: 55 });
  assert.equal(ranks2023?.byTotal.rank, 2);
  assert.equal(ranks2023?.byOriginated.leader?.name, "SOUTH");
});

test("tract rankings use only included mapped Chicago tracts and preserve missing subjects", () => {
  const data = {
    "17031000100": { total: 40, originated: { total: 12 } },
    "17031000200": { total: 90, originated: { total: 30 } },
    "17031000300": { total: 200, originated: { total: 80 } },
  };
  const chicagoTracts = new Set(["17031000100", "17031000200"]);
  const mapped = getHmdaRankings(data, "17031000100", "Mapped Chicago Census tracts", chicagoTracts);
  assert.deepEqual(mapped, {
    byTotal: { rank: 2, outOf: 2, count: 40, leader: { name: "17031000200", count: 90 } },
    byOriginated: { rank: 2, outOf: 2, count: 12, leader: { name: "17031000200", count: 30 } },
    areaLabel: "Mapped Chicago Census tracts",
  });

  const outsideScope = getHmdaRankings(data, "17031000300", "Mapped Chicago Census tracts", chicagoTracts);
  assert.equal(outsideScope?.byTotal.rank, null);
  assert.equal(outsideScope?.byTotal.count, 200);
  assert.equal(outsideScope?.byTotal.outOf, 2);
  assert.equal(outsideScope?.byOriginated.rank, null);
  assert.equal(outsideScope?.byOriginated.count, 80);
  assert.equal(outsideScope?.byOriginated.outOf, 2);

  const missing = getHmdaRankings(data, "17031999999", "Mapped Chicago Census tracts", chicagoTracts);
  assert.equal(missing?.byTotal.rank, null);
  assert.equal(missing?.byTotal.count, null);
  assert.deepEqual(missing?.byTotal.leader, { name: "17031000200", count: 90 });
  assert.equal(getHmdaRankings(null, "missing", "Mapped Chicago Census tracts"), null);
});

test("unavailable measures do not create ranks, denominators, or leaders", () => {
  const ranks = getHmdaRankings({
    BLANK: { total: 3, originated: { total: "" } },
    NULL: { total: 2, originated: { total: null } },
    ABSENT: { total: 1 },
  }, "BLANK", "Chicago community areas");

  assert.deepEqual(ranks?.byOriginated, {
    rank: null,
    outOf: 0,
    count: null,
    leader: null,
  });
});

test("partial measures omit unavailable records but keep confirmed zero counts", () => {
  const ranks = getHmdaRankings({
    ZERO: { total: 0, originated: { total: 0 } },
    HIGH: { total: 10, originated: { total: 4 } },
    MISSING: { total: "", originated: { total: null } },
    ABSENT: {},
  }, "ZERO", "Chicago community areas");

  assert.deepEqual(ranks?.byTotal, {
    rank: 2,
    outOf: 2,
    count: 0,
    leader: { name: "HIGH", count: 10 },
  });
  assert.deepEqual(ranks?.byOriginated, {
    rank: 2,
    outOf: 2,
    count: 0,
    leader: { name: "HIGH", count: 4 },
  });

  const absentSubject = getHmdaRankings({
    ZERO: { total: 0, originated: { total: 0 } },
  }, "ABSENT", "Chicago community areas");
  assert.equal(absentSubject?.byTotal.rank, null);
  assert.equal(absentSubject?.byTotal.count, null);
  assert.deepEqual(absentSubject?.byTotal.leader, { name: "ZERO", count: 0 });
});