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