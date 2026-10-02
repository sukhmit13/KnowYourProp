import assert from "node:assert/strict";
import test from "node:test";
import { manualPropertyColumns, manualPropertyPatchSchema } from "./manualPropertyPatch";

test("capacity PATCH preserves omitted listing metadata and accepts legacy numeric strings", () => {
  const patch = manualPropertyPatchSchema.parse({ manualBuildingSqFt: "6000", manualLandSqFt: "9000", manualStories: "1.5" });
  const saved = { sourceListingUrl: "https://example.com/listing", askingPrice: 300000, manualStories: "2" };
  assert.deepEqual({ ...saved, ...manualPropertyColumns(patch) }, {
    sourceListingUrl: saved.sourceListingUrl, askingPrice: 300000, manualBuildingSqFt: 6000, manualLandSqFt: 9000, manualStories: "1.5",
  });
});

test("explicit clears and real zeros survive independently of other fields", () => {
  assert.deepEqual(manualPropertyColumns(manualPropertyPatchSchema.parse({
    manualLandSqFt: 0, askingPrice: 0, sourceListingUrl: "", manualStories: null,
  })), { manualLandSqFt: 0, askingPrice: 0, sourceListingUrl: null, manualStories: null });
  assert.deepEqual(manualPropertyColumns({ manualBuildingSqFt: null }), { manualBuildingSqFt: null });
});

test("invalid and empty capacity patches fail explicitly", () => {
  for (const patch of [{}, { manualBuildingSqFt: -1 }, { manualBuildingSqFt: 0 }, { manualLandSqFt: -1 },
    { manualStories: "not a number" }, { manualBuildingSqFt: "5000sqft" }, { manualBuildingSqFt: true },
    { manualBuildingSqFt: [5000] }, { sourceListingUrl: "javascript:alert(1)" }]) {
    assert.equal(manualPropertyPatchSchema.safeParse(patch).success, false, JSON.stringify(patch));
  }
});