import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { type NearbyLicensesResponse } from "@shared/businessLicenses";
import { AccordionSection } from "./AccordionSection";
import { NewBusinessLicensesSection } from "./NewBusinessLicensesSection";
import { REPORT_SECTION_TITLES } from "./sectionRegistry";
import { compareCorridorLicenses } from "@shared/corridorLicenseComparison";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const populatedData = {
  licenses: [{
    businessName: "Test Cafe",
    address: "100 N Main St",
    licenseType: "Retail Food",
    licenseCategory: "food" as const,
    startDate: "2026-01-01",
    distanceMiles: 0.25,
    latitude: 41.88,
    longitude: -87.63,
  }],
  totalCount: 1,
  licenseCount: 1,
  priorPeriodCount: 0,
  changePct: null,
  radiusMiles: 1,
  periodMonths: 12,
};

test("nearby-license accordion target stays mounted through loading, error, empty, and populated states", () => {
  const states: Array<{
    name: string;
    props: { data?: NearbyLicensesResponse; isLoading: boolean; isError: boolean };
  }> = [
    { name: "loading", props: { isLoading: true, isError: false } },
    { name: "error", props: { isLoading: false, isError: true } },
    { name: "empty", props: { data: { ...populatedData, licenses: [], totalCount: 0, licenseCount: 0 }, isLoading: false, isError: false } },
    { name: "populated", props: { data: populatedData, isLoading: false, isError: false } },
  ];

  for (const { name, props } of states) {
    const markup = renderToStaticMarkup(
      <AccordionSection
        id="newBusinessLicenses"
        index={1}
        order={1}
        eyebrow={REPORT_SECTION_TITLES.newBusinessLicenses}
        takeaway="Nearby licenses"
        verdict="context"
        open
        onToggle={() => {}}
      >
        <NewBusinessLicensesSection {...props} />
      </AccordionSection>,
    );
    assert.match(markup, /id="section-newBusinessLicenses"/, `${name} state retains its outer jump/print target`);
    assert.equal(
      markup.includes('id="print-section-new-business-licenses"'),
      name === "populated" || name === "empty",
      `${name} state retains the inner content anchor whenever records have been checked`,
    );
  }
});

test("new license records are not presented as confirmed business openings", () => {
  const markup = renderToStaticMarkup(
    <NewBusinessLicensesSection
      data={{ ...populatedData, priorPeriodCount: 2, changePct: -50 }}
      isLoading={false}
      isError={false}
    />,
  );
  assert.match(markup, /Businesses with new licenses/);
  assert.match(markup, /History unavailable/);
  assert.doesNotMatch(markup, /Year-over-year change|-50%/);
  assert.match(markup, /1 business with new licenses/);
  assert.match(markup, /ISSUE initial license applications only, renewals excluded/);
  assert.match(markup, /Unseen in prior-year issuances does not prove a new opening/);
  assert.match(markup, /License start Jan 2026/);
  assert.doesNotMatch(markup, />New businesses<|distinct openings|Formation change|filter openings|matching opening|1 openings|Issued Jan/);
});

test("nearby replacements are flagged by previous name and excluded from unseen-address growth", () => {
  const base = populatedData.licenses[0];
  const history = [
    { ...base, businessName: "Earlier Cafe", startDate: "2024-01-01" },
    { ...base, businessName: "Prior Cafe", startDate: "2025-01-01" },
    { ...base, businessName: "Current Cafe", startDate: "2026-01-01" },
  ];
  const issuanceComparison = compareCorridorLicenses(history, new Date("2026-10-03T12:00:00Z"));
  const markup = renderToStaticMarkup(<NewBusinessLicensesSection
    data={{ ...populatedData, licenses: [history[2]], issuanceComparison }}
    isLoading={false} isError={false}
  />);
  assert.match(markup, /Previously unseen licensed addresses/);
  assert.match(markup, /Change in unseen addresses/);
  assert.match(markup, /Different name at recorded address/);
  assert.match(markup, /Prior Cafe/);
  assert.match(markup, /Possible-turnover businesses/);
  assert.match(markup, /not net growth/);
  assert.doesNotMatch(markup, /business count change|Year-over-year change/);
});

test("a zero-current result retains prior history and zero comparisons instead of hiding the metrics", () => {
  const issuanceComparison = compareCorridorLicenses([
    { ...populatedData.licenses[0], startDate: "2025-01-01" },
  ], new Date("2026-10-03T12:00:00Z"));
  const markup = renderToStaticMarkup(<NewBusinessLicensesSection
    data={{ ...populatedData, licenses: [], totalCount: 0, licenseCount: 0, issuanceComparison }}
    isLoading={false} isError={false}
  />);
  assert.match(markup, /Latest 12\s?mo/);
  assert.match(markup, /Prior 12\s?mo/);
  assert.match(markup, /Prior-period history is shown above/);
  assert.match(markup, /current observations: 0/);
});

test("missing nearby data remains unknown rather than claiming no issuances", () => {
  const markup = renderToStaticMarkup(<NewBusinessLicensesSection isLoading={false} isError={false} />);
  assert.match(markup, /unknown rather than zero/);
  assert.doesNotMatch(markup, /No qualifying new license issuances/);
});

test("empty and failed license results do not claim no businesses opened", () => {
  const empty = renderToStaticMarkup(
    <NewBusinessLicensesSection
      data={{ ...populatedData, licenses: [], totalCount: 0, licenseCount: 0 }}
      isLoading={false}
      isError={false}
    />,
  );
  assert.match(empty, /No qualifying new license issuances/);
  assert.match(empty, /This does not establish whether new businesses opened/);
  const error = renderToStaticMarkup(<NewBusinessLicensesSection isLoading={false} isError />);
  assert.match(error, /New license issuance records could not be loaded/);
});