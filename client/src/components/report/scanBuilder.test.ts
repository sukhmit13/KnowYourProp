import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
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