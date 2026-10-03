import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { buildDaycareTargets, daycareSupplyRankMatches, DaycareAnalysis } from "./DaycareAnalysis";

test("daycare slot targets retain the three ratio calculations and only estimate added centers for positive gaps", () => {
  const targets = buildDaycareTargets(300, 100);
  assert.deepEqual(targets.map(({ ratio, slotGap, centers }) => ({ ratio, slotGap, centers })), [
    { ratio: 1, slotGap: 200, centers: 3 },
    { ratio: 1.5, slotGap: 100, centers: 2 },
    { ratio: 1.75, slotGap: 72, centers: 1 },
  ]);
  assert.deepEqual(buildDaycareTargets(100, 100).map(({ slotGap, centers }) => ({ slotGap, centers })), [
    { slotGap: 0, centers: 0 },
    { slotGap: 0, centers: 0 },
    { slotGap: 0, centers: 0 },
  ]);
  assert.deepEqual(buildDaycareTargets(100, 66).map(({ ratio, targetSlots, slotGap, centers }) => ({ ratio, targetSlots, slotGap, centers })), [
    { ratio: 1, targetSlots: 100, slotGap: 34, centers: 1 },
    { ratio: 1.5, targetSlots: 67, slotGap: 1, centers: 1 },
    { ratio: 1.75, targetSlots: 58, slotGap: 0, centers: 0 },
  ]);
});

test("supply rank is shown only when its source value matches the supply record", () => {
  assert.equal(daycareSupplyRankMatches({ rank: 3, sourceValue: 77 }, 64, 77), true);
  assert.equal(daycareSupplyRankMatches({ rank: 3, sourceValue: 64 }, 64, 77), false);
  assert.equal(daycareSupplyRankMatches({ rank: 3 }, 55, 55), true);
  assert.equal(daycareSupplyRankMatches({ rank: 3 }, 64, 77), false);
  assert.equal(daycareSupplyRankMatches(null, 55, 55), false);
});

test("every daycare numbered subsection body aligns flush beneath its heading", () => {
  const markup = renderToStaticMarkup(
    <DaycareAnalysis
      scope="zip"
      onScopeChange={() => {}}
      areaData={null}
      enhancedData={null}
      capacityData={null}
      nearbyData={null}
      zipCode="60622"
      communityArea="West Town"
    />,
  );
  const $ = load(markup);
  for (const id of [
    "print-section-childcare",
    "print-section-childcare-demographics",
    "print-section-daycare-estimator",
    "print-section-childcare-capacity",
    "print-section-site-daycare-details",
    "print-section-nearby-business-daycare-centers",
    "section-google-places-daycare",
  ]) {
    assert.equal($(`#${id}`).children().eq(1).hasClass("px-4"), false, `${id} body should align flush beneath its full-width subhead`);
  }
});

test("daycare field map keeps the always-present site form, omits unknown outdoor space and missing city average", () => {
  const markup = renderToStaticMarkup(
    <DaycareAnalysis
      scope="zip"
      onScopeChange={() => {}}
      areaData={{
        status: "underserved",
        statusLabel: "Underserved",
        childrenUnder5: 100,
        licensedSlots: 66,
        childrenPerSlot: 1.5,
        centerSlots: 40,
        familyHomeSlots: 26,
        sources: {
          childrenSource: "ACS",
          childrenYear: "2023",
          childcareSource: "IDHS",
          childcareYear: "2024",
        },
      }}
      enhancedData={{
        childrenUnder5: 99,
        children0to2: 50,
        children3to4: 49,
        pct0to2: 50.5,
        pct3to4: 49.5,
        parentsInLaborForce0to5: 52,
        parentsInLaborForcePct0to5: 66,
        parentsInLaborForcePct6to17: 73,
        laborForceDelta: 7,
        comparisonTotal: 55,
        ranks: {
          childrenUnder5: { rank: 2, total: 55, sourceValue: 99 },
          pct0to2: { rank: 3, total: 55, sourceValue: 50.5 },
          laborForceDelta: { rank: 4, total: 55, sourceValue: 7 },
          parentsInLaborForcePct0to5: { rank: 5, total: 55, sourceValue: 66 },
        },
      }}
      capacityData={{ pct_slots_ccap: 0 }}
      zipCode="60622"
      communityArea="West Town"
      buildingSqFt={null}
      landSqFt={0}
      stories={null}
      runId={23}
      updateProperty={async () => undefined}
    />,
  );

  assert.match(markup, /Ages 3–4 · preschool/);
  assert.match(markup, /49\.5% of under-5/);
  assert.equal((markup.match(/class="kyp-hbar"/g) ?? []).length, 2);
  assert.match(markup, /5-point and 12-point bands are this product’s planning convention/);
  assert.match(markup, /Source-derived count proxy: 52/);
  assert.match(markup, /These age cohorts differ; it is not an observed ACS count/);
  assert.doesNotMatch(markup, /ACS estimate/);
  assert.match(markup, /kyp-block slate"><div class="bl">Labor-force delta · context rank<\/div><div class="chip rank">/);
  assert.match(markup, /1-slot gap · target 67 slots/);
  assert.match(markup, /Slots serving CCAP children/);
  assert.match(markup, /<div class="bv">0%<\/div>/);
  assert.doesNotMatch(markup, /Chicago average/);
  assert.equal((markup.match(/<input\b/g) ?? []).length, 3);
  assert.match(markup, /Correct the building record/);
  assert.match(markup, /Building-area record unavailable/);
  assert.match(markup, /Land size<\/td><td>0 sq ft/);
  assert.doesNotMatch(markup, /Estimated outdoor space/);
  assert.doesNotMatch(markup, /35 sq ft each/);
});