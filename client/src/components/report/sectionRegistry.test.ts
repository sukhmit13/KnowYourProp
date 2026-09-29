import assert from "node:assert/strict";
import test from "node:test";
import { SECTION_META, SECTION_ORDER } from "./sectionRegistry";

test("proximity, schools, and culture are independent report sections", () => {
  const proximity = SECTION_ORDER.indexOf("proximity");
  assert.ok(proximity >= 0);
  assert.deepEqual(SECTION_ORDER.slice(proximity, proximity + 3), ["proximity", "schools", "entCulture"]);
  assert.equal(SECTION_META.proximity.title, "Proximity");
  assert.equal(SECTION_META.schools.anchorId, "print-section-schools-daycare");
  assert.equal(SECTION_META.entCulture.anchorId, "print-section-entertainment-culture");
  assert.ok(!SECTION_META.proximity.info.join(" ").match(/school|dining|culture|transit|traffic/i));
});