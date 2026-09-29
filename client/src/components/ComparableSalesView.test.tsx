import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ComparableSalesView } from "./ComparableSalesView";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

function render(compsData: {
  comparables: [];
  marketAnalysis: {
    estimatedValue: number | null;
    medianSalePrice: number | null;
    medianPricePerSqft: number | null;
    priceRange: { low: number; high: number } | null;
    basedOnComps: number;
    confidence: "High" | "Medium" | "Low" | "None";
  };
  searchParams: { radiusMiles: number; monthsBack: number; propertyClass: string };
  totalCandidates: number;
  rawSalesCount: number;
  matchedCharacteristics: number;
  geocodedSalesCount: number;
  nearbySalesCount: number;
  error: string | null;
}) {
  return renderToStaticMarkup(React.createElement(ComparableSalesView, { compsData, isLoading: false }));
}

function result(overrides: Partial<ReturnType<typeof baseResult>> = {}) {
  return { ...baseResult(), ...overrides };
}

function baseResult() {
  return {
    comparables: [] as [],
    marketAnalysis: {
      estimatedValue: null,
      medianSalePrice: null,
      medianPricePerSqft: null,
      priceRange: null,
      basedOnComps: 0,
      confidence: "None" as const,
    },
    searchParams: { radiusMiles: 0.75, monthsBack: 18, propertyClass: "203" },
    totalCandidates: 0,
    rawSalesCount: 0,
    matchedCharacteristics: 0,
    geocodedSalesCount: 0,
    nearbySalesCount: 0,
    error: null,
  };
}

test("empty comparable messages distinguish no sales, no characteristics, and no nearby matches", () => {
  assert.match(render(result()), /No sales of class 203 were returned in the countywide recent-sales query.*does not confirm that none occurred near this address/);
  assert.match(render(result({ rawSalesCount: 12 })), /12 countywide class 203 sales were returned in the recent-sales sample, but the county characteristics file has no record/);
  assert.match(render(result({ rawSalesCount: 12, matchedCharacteristics: 4, geocodedSalesCount: 4 })), /None of the 4 geocoded sales among 12 countywide class 203 candidates.*fell within 0\.75 mi/);
});

test("query errors render explicitly and do not claim the area has no sales", () => {
  const html = render(result({ error: "Sales data could not be retrieved: Socrata HTTP 503" }));
  assert.match(html, /Sales data could not be retrieved: Socrata HTTP 503/);
  assert.doesNotMatch(html, /No sales of class/);
  assert.doesNotMatch(html, /No comparable sales found within the search parameters/);
});

test("Low confidence suppresses only Indicated Value while retaining sale medians", () => {
  const html = render(result({
    marketAnalysis: {
      estimatedValue: 375000,
      medianSalePrice: 400000,
      medianPricePerSqft: 250,
      priceRange: { low: 200000, high: 600000 },
      basedOnComps: 2,
      confidence: "Low",
    },
    rawSalesCount: 2,
    matchedCharacteristics: 2,
  }));

  assert.doesNotMatch(html, /text-comps-indicated-value/);
  assert.match(html, /No value estimate — comps are 0\.75 mi out, too far to support one\./);
  assert.match(html, /Median Sale Price/);
  assert.match(html, /Median \$\/Sqft/);
  assert.match(html, /\$400K/);
  assert.match(html, /\$250/);
});

test("radius over 1.5 miles suppresses Indicated Value even with Medium confidence", () => {
  const html = render(result({
    marketAnalysis: {
      estimatedValue: 375000,
      medianSalePrice: 400000,
      medianPricePerSqft: 250,
      priceRange: { low: 200000, high: 600000 },
      basedOnComps: 3,
      confidence: "Medium",
    },
    searchParams: { radiusMiles: 1.75, monthsBack: 18, propertyClass: "203" },
    rawSalesCount: 3,
    matchedCharacteristics: 3,
  }));

  assert.doesNotMatch(html, /text-comps-indicated-value/);
  assert.match(html, /No value estimate — comps are 1\.75 mi out, too far to support one\./);
  assert.match(html, /Median Sale Price/);
  assert.match(html, /Median \$\/Sqft/);
});