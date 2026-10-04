import assert from "node:assert/strict";
import { getDevelopmentCorridor } from "./developmentPipeline";
import { buildCorridorRollup, dpdCoverageStatus, validateCorridorNewsInput, CORRIDOR_NEWS_DAYS } from "./corridorIntelligence";
import { withoutRepeatedNews } from "@shared/newsArticleDedup";
import { deriveNewsFeedCoverageStatus, corridorHistoricalSearches } from "./newsMonitor";

const coverage = {
  permits: { status: "partial" as const },
  licenses: { status: "partial" as const },
  articles: { status: "partial" as const },
  zoningAppeals: { status: "partial" as const },
  dpdApplications: { status: "partial" as const },
};
const corridors = [{
  corridorKey: "chicago_avenue",
  corridorName: "Chicago Avenue",
  tier: 1,
  description: "West Town corridor",
  distanceMiles: 0,
}];
const point = { latitude: 41.896, longitude: -87.69 };
const chicagoCorridor = getDevelopmentCorridor("100 W Chicago Ave", point.latitude, point.longitude)!;

assert.equal(
  getDevelopmentCorridor("7000 W Chicago Ave", 41.895, -87.8),
  null,
  "street-name match outside the corridor bbox must not classify",
);
assert.equal(
  getDevelopmentCorridor("100 N Milwaukee Ave", 41.9155, -87.6885)?.key,
  "milwaukee_avenue",
  "a point on the diagonal corridor is accepted",
);
assert.equal(
  getDevelopmentCorridor("100 W Chicago Ave", null, null),
  null,
  "records with no geocode remain unclassified",
);
assert.equal(validateCorridorNewsInput({ lat: "", lng: "", address: "" }), null, "empty coordinates are not accepted as zero");
assert.equal(validateCorridorNewsInput({
  lat: 41.9,
  lng: -87.68,
  excludeArticles: Array.from({ length: 751 }, () => ({ url: "https://example.com" })),
}), null, "exclusion lists are bounded");
assert.notEqual(validateCorridorNewsInput({
  lat: 41.9,
  lng: -87.68,
  excludeArticles: Array.from({ length: 201 }, (_, i) => ({ url: `https://example.com/${i}` })),
}), null, "a full-year exclusion archive is not rejected at the former 200-article cap");

const duplicateStories = [
  { url: "https://www.example.com/story?utm_source=x", title: "A long enough example corridor development story title", source: "Example" },
  { url: "https://example.com/story", title: "A long enough example corridor development story title", source: "Example" },
];
assert.equal(withoutRepeatedNews(duplicateStories, []).length, 1, "articles deduplicate by canonical URL/title");
assert.equal(withoutRepeatedNews(duplicateStories, [duplicateStories[0]]).length, 0, "client-owned exclusions are applied");

const result = buildCorridorRollup({
  corridors,
  sourceCoverage: coverage,
  licenses: [
    { businessName: "Example Cafe", address: "100 W Chicago Ave", licenseType: "Food", licenseCategory: "food", startDate: "2026-01-01", distanceMiles: 0.1, ...point, corridor: chicagoCorridor },
    { businessName: "Example Cafe", address: "100 W Chicago Ave", licenseType: "Liquor", licenseCategory: "liquor", startDate: "2026-02-01", distanceMiles: 0.1, ...point, corridor: chicagoCorridor },
  ],
  permits: [
    { permitNumber: "P-1", address: "100 W Chicago Ave", issueDate: "2025-10-01", latitude: point.latitude, longitude: point.longitude, corridor: chicagoCorridor, units: undefined, distanceMiles: 0.3 },
    { permitNumber: "P-1", address: "100 W Chicago Ave", issueDate: "2025-10-01", latitude: point.latitude, longitude: point.longitude, corridor: chicagoCorridor, units: undefined, distanceMiles: 0.4 },
  ],
  zoning: [
    { caseNumber: "Z-1", address: "100 W Chicago Ave", lat: point.latitude, lon: point.longitude, corridor: chicagoCorridor, meetingDate: "2026-01-01" },
    { caseNumber: "Z-1", address: "100 W Chicago Ave", lat: point.latitude, lon: point.longitude, corridor: chicagoCorridor, meetingDate: "2026-01-01" },
    { caseNumber: "Z-unknown", address: "100 W Chicago Ave", corridor: null },
  ],
  dpdApplications: [
    { id: "D-1", address: "100 W Chicago Ave", latitude: point.latitude, longitude: point.longitude, corridor: chicagoCorridor, hearingDate: "2026-01-01" },
    { id: "D-1", address: "100 W Chicago Ave", latitude: point.latitude, longitude: point.longitude, corridor: chicagoCorridor, hearingDate: "2026-01-01" },
    { id: "D-unknown", address: "100 W Chicago Ave", corridor: null },
  ],
  articles: [
    { url: "https://example.com/news", title: "A sufficiently long corridor story headline", source: "Example", corridor: null, corridorKeys: ["chicago_avenue"] },
    { url: "https://example.com/news?utm_medium=feed", title: "A sufficiently long corridor story headline", source: "Example", corridor: null, corridorKeys: ["chicago_avenue"] },
  ],
});

assert.equal(result.cards[0].licenses.length, 1, "same establishment's license categories group into one row");
assert.deepEqual(result.cards[0].licenses[0].tags.sort(), ["Liquor / Tavern", "Retail Food"].sort());
assert.equal(result.cards[0].counts.licenses, 1, "positive observations remain reportable under partial source coverage");
assert.equal(result.kpis.licenses, 1);
assert.equal(result.cards[0].counts.permits, 1, "permits deduplicate by permit number");
assert.equal(result.cards[0].construction[0].distanceMi, 0.4, "the source's nearby distance is retained");
assert.equal(result.cards[0].counts.zoningAppeals, 1, "zoning deduplicates by case number");
assert.equal(result.cards[0].counts.dpdApplications, 1, "DPD deduplicates by id");
assert.equal(result.kpis.dpdApplications, result.cards.reduce((sum, card) => sum + (card.counts.dpdApplications || 0), 0));
assert.equal(result.kpis.permitUnits, null, "pipeline unit total remains suppressed when active permit units are unknown");
assert.equal(result.cards[0].counts.articles, 1, "text-associated legacy reporting deduplicates after exclusions");
assert.equal(result.kpis.articles, 1);
assert.equal(result.cards[0].counts.zoningAppeals, 1, "unknown-geocode ZBA rows do not fabricate a corridor");
assert.equal(coverage.dpdApplications.status, "partial", "rows from the explicitly incomplete DPD source stay partial");

assert.equal(dpdCoverageStatus({ successfulPageCount: 0 }), "unavailable");
assert.equal(dpdCoverageStatus({ successfulPageCount: 1 }), "partial");
assert.equal(deriveNewsFeedCoverageStatus(["unavailable", "partial"]), "partial");
assert.equal(deriveNewsFeedCoverageStatus(["unavailable", "unavailable"]), "unavailable");

const unknownCoverage = buildCorridorRollup({
  corridors,
  sourceCoverage: { ...coverage, permits: { status: "unavailable" } },
  permits: [{ permitNumber: "P-2", address: "100 W Chicago Ave", latitude: point.latitude, longitude: point.longitude, corridor: chicagoCorridor }],
});
assert.equal(unknownCoverage.cards[0].counts.permits, null, "source unavailability stays unknown despite any raw rows");
assert.equal(unknownCoverage.kpis.permits, null);
assert.equal(unknownCoverage.kpis.permitUnits, null, "unknown permit source cannot claim a zero unit estimate");

const incompleteEmpty = buildCorridorRollup({
  corridors,
  sourceCoverage: { ...coverage, permits: { status: "partial" } },
});
assert.equal(incompleteEmpty.cards[0].counts.permits, null, "empty counts from partial sources stay unknown");
assert.equal(incompleteEmpty.kpis.permits, null);
assert.equal(incompleteEmpty.kpis.permitUnits, null);

const rssEmptyAfterFailure = buildCorridorRollup({
  corridors,
  sourceCoverage: { ...coverage, articles: { status: "partial" } },
  articles: [],
});
assert.equal(rssEmptyAfterFailure.cards[0].counts.articles, null, "empty partial RSS coverage is not rendered as zero");
assert.equal(rssEmptyAfterFailure.kpis.articles, null);

assert.equal(CORRIDOR_NEWS_DAYS, 365, "corridor coverage spans a year, not one quarter");
const historySearches = corridorHistoricalSearches(["broadway"], 365, new Date("2026-10-03T12:00:00Z"));
assert.equal(historySearches.length, 4, "older articles have bounded searches across the entire annual window");
assert.equal(historySearches[0].start, "2025-10-04");
assert.equal(historySearches[3].end, "2026-10-04");
for (let i = 0; i < historySearches.length; i++) {
  const feed = historySearches[i];
  const query = new URL(feed.url).searchParams.get("q")!;
  assert.match(query, /"broadway" Chicago/i);
  assert.ok(query.includes(`after:${feed.start} before:${feed.end}`));
  if (i > 0) assert.equal(historySearches[i - 1].end, feed.start, "historical queries leave no gaps");
}
assert.equal(corridorHistoricalSearches(["unknown_corridor"], 365).length, 0);

const issuance = (name: string, date: string) => ({
  businessName: name, address: "100 W Chicago Ave", licenseType: "Food", licenseCategory: "food" as const,
  startDate: date, distanceMiles: 0.1, ...point, corridor: chicagoCorridor,
});
const compared = buildCorridorRollup({
  corridors, sourceCoverage: { ...coverage, licenses: { status: "available" } },
  licenses: [issuance("New Cafe", "2026-01-01")],
  licenseHistory: [issuance("Former Cafe", "2025-01-01"), issuance("New Cafe", "2026-01-01")],
  asOf: new Date("2026-10-03T12:00:00Z"),
});
assert.equal(compared.cards[0].licenseComparison?.current.differentNamesAtKnownAddresses, 1);
assert.equal(compared.cards[0].licenseComparison?.current.previouslyUnseenAddresses, 0);
assert.equal(compared.cards[0].licenseComparison?.businessChange, 0);
assert.equal(compared.kpis.licenses, 1, "historical rows never inflate the current license KPI");
assert.equal(result.cards[0].licenseComparison, null, "missing historical coverage does not create zero trend");

console.log("Corridor intelligence tests passed");