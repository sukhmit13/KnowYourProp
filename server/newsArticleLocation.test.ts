import assert from "node:assert/strict";
import { getDevelopmentCorridor } from "./developmentPipeline";
import {
  articleTextMentionsAddress,
  filterArticlesMentioningAddress,
  cachedNewsHasAddressEvidence,
  extractArticleAddresses,
  resolveArticleAddressPoint,
} from "./newsArticleLocation";

const subject = "3255 W ARMITAGE AVE, CHICAGO, IL, 60647";
const unrelated = { title: "Plans Revealed For Redevelopment Of 3601 West Cortland Street In Logan Square", summary: "A redevelopment site in Logan Square." };
assert.equal(filterArticlesMentioningAddress([unrelated], subject).length, 0);
assert.equal(cachedNewsHasAddressEvidence({ meta: [{ tier: "parcel", matched_address: subject, title: unrelated.title }] }, subject), false);
assert.equal(cachedNewsHasAddressEvidence({ meta: [{ tier: "parcel", matched_address: subject, title: "Plans at 3255 West Armitage Avenue" }] }, subject), true);
assert.equal(cachedNewsHasAddressEvidence({ meta: [{ tier: "parcel", matched_address: subject, title: "Logan Square Plans", addressEvidenceSnippet: "Redevelopment of 3255 W. Armitage Ave." }] }, subject), true);
assert.equal(filterArticlesMentioningAddress([{ title: "Plans at 13255 W Armitage Avenue" }, { title: "Plans at 3255 N Armitage Avenue" }, { title: "Plans at 3255 West Cortland Street" }], subject).length, 0);
assert.equal(filterArticlesMentioningAddress([{ title: "Plans Revealed", summary: "The project is at 3255 West Armitage Avenue." }], subject).length, 1);
assert.equal(cachedNewsHasAddressEvidence({ meta: [{ tier: "adjacent", matched_address: "3601 W Cortland Street", title: unrelated.title }] }, subject), true);

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