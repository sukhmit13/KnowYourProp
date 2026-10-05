import assert from "node:assert/strict";
import test from "node:test";
import { validateSiteDetails } from "./siteDetailsValidation";

test("site area validation accepts grouped or ungrouped numbers and stores one numeric value", () => {
  const grouped = validateSiteDetails({ building: "5,600", land: "12,000", stories: "2" });
  const ungrouped = validateSiteDetails({ building: "5600", land: "12000", stories: "2" });

  assert.deepEqual(grouped, ungrouped);
  assert.deepEqual(grouped.value, {
    manualBuildingSqFt: 5600,
    manualLandSqFt: 12000,
    manualStories: 2,
  });
});

test("required building area and story count validation keep blanks distinct from explicit zero land", () => {
  assert.equal(validateSiteDetails({ building: "", land: "0", stories: "" }).value, undefined);
  assert.equal(validateSiteDetails({ building: "5,600", land: "0", stories: "" }).value?.manualLandSqFt, 0);
  assert.equal(validateSiteDetails({ building: "5,600", land: "", stories: "1.5" }).value, undefined);
});
