import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { type NearbyLicensesResponse } from "@shared/businessLicenses";
import { AccordionSection } from "./AccordionSection";
import { NewBusinessLicensesSection } from "./NewBusinessLicensesSection";
import { REPORT_SECTION_TITLES } from "./sectionRegistry";

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
      name === "populated",
      `${name} state only has the legacy inner content anchor when populated`,
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
  assert.match(markup, /Year-over-year change/);
  assert.match(markup, /2 businesses with new licenses in the prior year/);
  assert.match(markup, /1 business with new licenses/);
  assert.match(markup, /Initial license applications \(ISSUE\) only; renewals excluded/);
  assert.match(markup, /Existing businesses may receive new licenses; these records do not confirm new business openings/);
  assert.match(markup, /License start Jan 2026/);
  assert.doesNotMatch(markup, />New businesses<|distinct openings|Formation change|filter openings|matching opening|1 openings|Issued Jan/);
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