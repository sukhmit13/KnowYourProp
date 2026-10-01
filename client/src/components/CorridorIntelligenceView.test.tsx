import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CorridorIntelligenceView, { type CorridorCardData, type CorridorKpis } from "./CorridorIntelligenceView";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const kpis: CorridorKpis = {
  permits: 8,
  permitUnits: "31 units",
  licenses: 4,
  articles: 2,
  zoningAppeals: 1,
  dpdApplications: 3,
};

const corridor = (overrides: Partial<CorridorCardData> = {}): CorridorCardData => ({
  key: "broadway",
  name: "Broadway",
  tier: 1,
  tierLabel: "Primary",
  distanceMi: 0.24,
  onCorridor: false,
  blurb: "A busy neighborhood retail spine.",
  licenses: [{ name: "Lakeview Pantry", address: "123 N Broadway", date: "Jun 2026", tags: ["Retail Food", "Limited Business"] }],
  construction: [{
    address: "140 N Broadway",
    date: "May 2026",
    use: "Multifamily",
    stories: 6,
    units: 42,
    parking: 18,
    cost: 9_200_000,
    distanceMi: 0.08,
    architect: "Studio North",
    gc: "Lake Builders",
    cityClass: null,
  }],
  coverage: [{ title: "New homes planned on Broadway", url: "https://example.org/story", source: "Local Journal", date: "May 2026", summary: "A corridor-level update." }],
  zoning: [{ address: "150 N Broadway", kind: "Special Use", zone: "B3-5", caseNo: "Z-22", date: "Apr 2026", status: "Approved", distanceMi: 0.1, use: "Restaurant" }],
  dpdApplications: [{ address: "160 N Broadway", applicationType: "Planned Development", applicant: "Example LLC", status: "Under review", hearingDate: "Mar 2026", proposal: "New apartments", applicationUrl: null, hearingUrl: "https://example.org/hearing", distanceMi: 0.2 }],
  ...overrides,
});

function render(corridors: CorridorCardData[], options: Partial<Parameters<typeof CorridorIntelligenceView>[0]> = {}) {
  return renderToStaticMarkup(
    <CorridorIntelligenceView kpis={kpis} corridors={corridors} {...options} />,
  );
}

test("renders the five-block rollup and every compact corridor record with owning-section links", () => {
  const html = render([corridor()], {
    renderNewsArticle: (article, testid) => <article data-testid={testid}>{article.title}</article>,
  });

  assert.match(html, /class="kyp-blocks five"/);
  assert.match(html, /New construction permits/);
  assert.match(html, /31 units · via City Building Permits/);
  assert.match(html, /class="kyp-subhead first"/);
  assert.match(html, /Retail Food/);
  assert.match(html, /Limited Business/);
  assert.match(html, /42 units · 6-story · 18 parking · \$9\.2M · 0\.08 mi/);
  assert.match(html, /architect-rankings&amp;search=Studio\+North/);
  assert.match(html, /gc-rankings&amp;search=Lake\+Builders/);
  assert.match(html, /href="#section-new-business-licenses"/);
  assert.match(html, /href="#development-permits"/);
  assert.match(html, /href="#development-zba"/);
  assert.match(html, /href="#development-proposed"/);
  assert.match(html, /data-testid="corridor-coverage-broadway-0"/);
  assert.match(html, /Permit costs are reported estimates/);
});

test("uses server counts, honors explicit null, and only falls back for legacy fixtures without counts", () => {
  const html = render([
    corridor({ counts: { licenses: null, permits: 12, zoningAppeals: 4, dpdApplications: null, articles: 7 } }),
    corridor({ key: "legacy", name: "Clark Street", counts: undefined }),
  ]);

  assert.match(html, /all — →/);
  assert.match(html, /all 12 →/);
  assert.match(html, /all 1 →/);
  assert.match(html, /<div class="bv">2<\/div><div class="bl">News articles/);
  assert.match(html, /all 4 →/);
});

test("unknown and loading license totals never appear as false zeroes", () => {
  const loadingHtml = render([corridor({ counts: { licenses: null, permits: 0, zoningAppeals: 0, dpdApplications: 0, articles: 0 } })], {
    licensesLoading: true,
  });
  assert.match(loadingHtml, /class="bd">Loading<\/div>/);
  assert.match(loadingHtml, /all — →/);
  assert.doesNotMatch(loadingHtml, /<a href="#section-new-business-licenses">all 0 →<\/a>/);

  const nullHtml = render([corridor({ counts: { licenses: null, permits: null, zoningAppeals: null, dpdApplications: null, articles: null } })]);
  assert.match(nullHtml, /Businesses with new licenses<\/div><div class="bd">last 12 mo<\/div>/);
  assert.match(nullHtml, /all — →/);
});

test("keeps all news articles and does not cap corridor arrays", () => {
  const manyLicenses = Array.from({ length: 13 }, (_, index) => ({
    name: `Business ${index}`,
    address: `${index} Broadway`,
    date: null,
    tags: ["Retail"],
  }));
  const html = render([corridor({
    licenses: manyLicenses,
    coverage: Array.from({ length: 6 }, (_, index) => ({
      title: `Article ${index}`,
      url: `https://example.org/${index}`,
      source: "Local Journal",
      date: null,
      summary: "",
    })),
  })], {
    renderNewsArticle: (article, testid) => <article data-testid={testid}>{article.title}</article>,
  });

  assert.equal((html.match(/data-testid="corridor-license-broadway-/g) ?? []).length, 13);
  assert.equal((html.match(/data-testid="corridor-coverage-broadway-/g) ?? []).length, 6);
});