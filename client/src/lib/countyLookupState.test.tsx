import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { countyLookupState } from "./countyLookupState";
import { CountyLookupStatus } from "../components/report/CountyLookupStatus";

const input = { hasAddress: true, pin: null as string | null, pinLoading: false, pinError: false, taxLoading: false, taxError: false, hasTaxData: false };

test("PIN loading, failure, and unresolved responses stay distinct from an unchecked tax bill", () => {
  assert.equal(countyLookupState({ ...input, pinLoading: true }).label, "Resolving PIN");
  const failure = countyLookupState({ ...input, pinError: true });
  assert.equal(failure.label, "PIN lookup failed");
  assert.equal(failure.retry, "pin");
  assert.match(failure.detail, /tax records have not been checked/i);
  assert.equal(countyLookupState(input).label, "PIN not resolved");
  assert.equal(countyLookupState({ ...input, hasAddress: false }).retry, null);
});

test("a known PIN enables tax-specific loading, failure, and unavailable states", () => {
  const withPin = { ...input, pin: "13263240350000" };
  assert.equal(countyLookupState({ ...withPin, taxLoading: true }).label, "Loading tax records");
  const failure = countyLookupState({ ...withPin, taxError: true });
  assert.equal(failure.label, "Tax lookup failed");
  assert.equal(failure.retry, "tax");
  assert.match(failure.detail, /does not mean there is no tax bill/);
  assert.equal(countyLookupState(withPin).label, "Bill unavailable");
});

test("previously returned data remains visible during failed or pending refreshes", () => {
  assert.equal(countyLookupState({ ...input, pin: "13263240350000", taxError: true, taxLoading: true, hasTaxData: true }).label, "Record loaded");
});

test("failure UI offers a specific retry and the loading UI does not offer a competing request", () => {
  const html = renderToStaticMarkup(<CountyLookupStatus state={countyLookupState({ ...input, pinError: true })} onRetry={() => {}} />);
  assert.match(html, /Retry PIN lookup/);
  assert.match(html, /role="status"/);
  const tax = renderToStaticMarkup(<CountyLookupStatus state={countyLookupState({ ...input, pin: "13263240350000", taxError: true })} onRetry={() => {}} />);
  assert.match(tax, /Retry tax lookup/);
  const loading = renderToStaticMarkup(<CountyLookupStatus state={countyLookupState({ ...input, pinLoading: true })} onRetry={() => {}} />);
  assert.doesNotMatch(loading, /<button/);
});

test("PIN submissions are parcel-scoped and auth/unlock changes do not reset the PIN", () => {
  const report = readFileSync("client/src/pages/RunDetail.tsx", "utf8");
  assert.match(report, /pinSubmission\?\.runKey === pinRunKey/);
  assert.match(report, /setPropertyPin\(""\);\s*setSubmittedPin\(null\);\s*setPinManuallyEdited\(false\);\s*\}, \[run\?\.id, run\?\.address\]\)/);
  assert.match(report, /useReportCountyRecords\(/);
});