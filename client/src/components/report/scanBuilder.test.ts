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