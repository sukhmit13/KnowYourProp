import assert from "node:assert/strict";
import { getDevelopmentCorridor } from "./developmentPipeline";
import {
  articleTextMentionsAddress,
  extractArticleAddresses,
  resolveArticleAddressPoint,
} from "./newsArticleLocation";

const chicagoCache = new Map([
  ["100 w chicago ave", { address: "100 W Chicago Ave, Chicago, IL 60622", lat: "41.896", lon: "-87.69" }],
  ["200 w chicago ave", { address: "200 W Chicago Ave, Chicago, IL 60622", lat: "41.895", lon: "-87.691" }],
]);
const read = async (key: string) => chicagoCache.get(key);

assert.equal(articleTextMentionsAddress("Planned work at 100 West Chicago Avenue.", "100 W Chicago Ave"), true);
assert.equal(articleTextMentionsAddress("A project at 200 W Chicago Ave.", "100 W Chicago Ave"), false);
assert.deepEqual(extractArticleAddresses("A permit was issued at 200 W Chicago Ave."), ["200 W Chicago Ave"]);

const subjectPoint = await resolveArticleAddressPoint({
  text: "A project at 100 W Chicago Avenue.",
  matchedAddress: "100 W Chicago Ave",
  tier: "parcel",
  subjectAddress: "100 W Chicago Ave",
}, read);
assert.equal(subjectPoint?.identity, "matched-address");
assert.deepEqual(
  subjectPoint && getDevelopmentCorridor(subjectPoint.address, subjectPoint.latitude, subjectPoint.longitude),
  { key: "chicago_avenue", name: "Chicago Avenue", tier: 1 },
  "an explicit address match can use its own cached parcel coordinates",
);

const adjacentPoint = await resolveArticleAddressPoint({
  text: "A project at 200 W Chicago Avenue.",
  matchedAddress: "200 W Chicago Ave",
  tier: "adjacent",
  subjectAddress: "100 W Chicago Ave",
}, read);
assert.equal(adjacentPoint?.latitude, 41.895, "adjacent stories resolve their own cached address point");

let subjectCacheReads = 0;
const adjacentWithoutOwnPoint = await resolveArticleAddressPoint({
  text: "A co-parcel story also mentions 100 W Chicago Ave.",
  matchedAddress: "200 W Chicago Ave",
  tier: "adjacent",
  subjectAddress: "100 W Chicago Ave",
}, async key => {
  if (key.startsWith("100 w chicago")) subjectCacheReads++;
  return key.startsWith("100 w chicago") ? chicagoCache.get("100 w chicago ave") : undefined;
});
assert.equal(adjacentWithoutOwnPoint, null, "adjacent articles never borrow the subject parcel point");
assert.equal(subjectCacheReads, 0, "subject point cache is not queried for adjacent article text");

console.log("News article location tests passed");