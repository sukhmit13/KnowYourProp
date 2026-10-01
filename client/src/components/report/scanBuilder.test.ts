import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildScanSections } from "./scanBuilder";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

test("Mortgage & Lending Market scan hero counts returned comparables", () => {
  const section = buildScanSections({ compsData: { comparables: [{}, {}, {}] } }).find(({ id }) => id === "market");
  assert.deepEqual(section?.hero, { value: "3", label: "comps" });
});

test("Mortgage & Lending Market omits the comp hero when no comparables are returned", () => {
  const section = buildScanSections({ compsData: { comparables: [] } }).find(({ id }) => id === "market");
  assert.equal(section?.hero, undefined);
});

test("Business License scan describes license issuances without asserting business openings", () => {
  const section = buildScanSections({ businessLicenses: { totalCount: 4, priorPeriodCount: 2, changePct: 100 } })
    .find(({ id }) => id === "newBusinessLicenses");
  const text = renderToStaticMarkup(React.createElement(React.Fragment, null, section?.takeaway));
  assert.match(text, /4 businesses with new licenses/);
  assert.doesNotMatch(text, /opened|opening|formation/i);
  assert.deepEqual(section?.hero, { value: "4", label: "businesses with new licenses" });
  assert.equal(section?.verdict?.label, "+100% business count change");
});

test("merged development scan leads with recent-permit units, not permit counts or combined units", () => {
  const sections = buildScanSections({
    newConstruction: { subject: { totalPermits: 55 }, trend: { changePct: 12, suppressed: false } },
    development: { pipeline: { unitsUnderConstruction: 48, potentialUnits: 187, permitUnitsSource: "description" } },
  });
  assert.ok(!sections.some(({ id }) => id === "newConstruction"));
  const development = sections.find(({ id }) => id === "development");
  assert.deepEqual(development?.hero, { value: "~48", label: "units" });
  assert.equal(development?.verdict?.tone, "context");
  const text = renderToStaticMarkup(React.createElement(React.Fragment, null, development?.takeaway));
  assert.match(text, /~48 units/);
  assert.doesNotMatch(text, /235|187|55 new-construction/);
});

test("unknown development unit count does not create a zero unit hero", () => {
  const development = buildScanSections({ development: { pipeline: { unitsUnderConstruction: null } } })
    .find(({ id }) => id === "development");
  assert.equal(development?.hero, undefined);
});

test("unknown permit descriptions never create a zero hero; readable counts are identified as partial", () => {
  const unknown = buildScanSections({ development: { pipeline: { unitsUnderConstruction: null, observedUnitsUnderConstruction: 0, permitUnitsUnknownAddressCount: 1, permitUnitsSource: "description" } } })
    .find(({ id }) => id === "development");
  assert.equal(unknown?.hero, undefined);
  const partial = buildScanSections({ development: { pipeline: { unitsUnderConstruction: null, observedUnitsUnderConstruction: 12, permitUnitsUnknownAddressCount: 1, permitUnitsSource: "description" } } })
    .find(({ id }) => id === "development");
  assert.deepEqual(partial?.hero, { value: "~12", label: "units" });
  assert.match(renderToStaticMarkup(React.createElement(React.Fragment, null, partial?.takeaway)), /Readable counts only/);
});

const ownership = (ctx: Parameters<typeof buildScanSections>[0]) =>
  buildScanSections(ctx).find(({ id }) => id === "ownership");

test("Ownership & Title shows Checking while Recorder records are pending", () => {
  const section = ownership({ isLoadingLiens: true });
  assert.deepEqual(section?.verdict, { tone: "context", label: "Checking" });
  const text = renderToStaticMarkup(React.createElement(React.Fragment, null, section?.takeaway));
  assert.match(text, /Checking Recorder records/);
  assert.doesNotMatch(text, /unknown/i);
});

test("Ownership & Title uses unknown only after an unresolved search completes", () => {
  for (const lienData of [undefined, { searchFailed: true }]) {
    const section = ownership({ lienData });
    assert.equal(section?.verdict?.label, "Status unknown");
  }
});

test("Ownership & Title preserves a cached result during refresh", () => {
  const section = ownership({ isLoadingLiens: true, lienData: { activeLienCount: 0 } });
  assert.equal(section?.verdict?.label, "Clear title");
});

test("Ownership & Title shows Checking during retry of a failed search", () => {
  const section = ownership({ isLoadingLiens: true, lienData: { searchFailed: true } });
  assert.equal(section?.verdict?.label, "Checking");
});

test("report scan excludes Pre-Title Check while retaining Ownership & Title evidence", () => {
  const sections = buildScanSections({ lienData: { activeLienCount: 2 } });
  assert.ok(!sections.some(({ id, title }) => id === "debt" || /Pre-Title/i.test(title)));
  assert.deepEqual(sections.find(({ id }) => id === "ownership")?.verdict,
    { tone: "attention", label: "2 active liens" });
  assert.ok(sections.some(({ id }) => id === "market"));
});