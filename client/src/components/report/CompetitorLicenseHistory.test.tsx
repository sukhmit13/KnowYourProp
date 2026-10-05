import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CompetitorLicenseHistory, { CompetitorLicenseHistoryDisplay } from "./CompetitorLicenseHistory";
import type { CompetitorHistoryResult } from "../../../../shared/competitorHistory";

function result(overrides: Partial<CompetitorHistoryResult> = {}): CompetitorHistoryResult {
  return {
    classification: "unknown",
    firstLicenseDate: null,
    previousBusinesses: [],
    detail: "Insufficient matching license-history evidence.",
    sourceUrl: "https://data.cityofchicago.org/",
    checkedAt: "2026-06-05T12:00:00.000Z",
    ...overrides,
  };
}

test("replacement displays prior operator and earliest license date", () => {
  const markup = renderToStaticMarkup(
    <CompetitorLicenseHistoryDisplay result={result({
      classification: "replacement",
      firstLicenseDate: "2018-03-14",
      previousBusinesses: ["Marlow Market"],
      detail: "A prior operator appears at this location in City license history.",
    })} />,
  );
  assert.match(markup, /Replacement/);
  assert.match(markup, /Prior operator: Marlow Market/);
  assert.match(markup, /Earliest license: Mar 14, 2018/);
  assert.match(markup, /cannot prove an actual opening date or net capacity/);
  assert.match(markup, /href="https:\/\/data\.cityofchicago\.org\/"/);
});

test("additional location carries an explicit City-history qualification", () => {
  const markup = renderToStaticMarkup(
    <CompetitorLicenseHistoryDisplay result={result({
      classification: "additional",
      firstLicenseDate: "2022",
    })} />,
  );
  assert.match(markup, /Additional location/);
  assert.match(markup, /Within available City license history/);
  assert.match(markup, /Earliest license: 2022/);
  assert.doesNotMatch(markup, /opened today/i);
});

test("unknown history keeps known earliest license date and detail visible", () => {
  const markup = renderToStaticMarkup(
    <CompetitorLicenseHistoryDisplay result={result({
      firstLicenseDate: "2020-09",
      detail: "Available records do not distinguish a replacement from co-tenancy.",
    })} />,
  );
  assert.match(markup, /History unavailable or insufficient evidence/);
  assert.match(markup, /Earliest license: Sep 2020/);
  assert.match(markup, /do not distinguish a replacement from co-tenancy/);
  assert.match(markup, /cannot prove an actual opening date or net capacity/);
});

test("loading and failed history checks render restrained states", () => {
  const loading = renderToStaticMarkup(<CompetitorLicenseHistoryDisplay loading />);
  assert.match(loading, /Checking City license history/);
  const failed = renderToStaticMarkup(<CompetitorLicenseHistoryDisplay failed />);
  assert.match(failed, /History unavailable or insufficient evidence/);
  assert.match(failed, /cannot prove an actual opening date or net capacity/);
});

test("query-bearing child stays unmounted until the row is visible", () => {
  const markup = renderToStaticMarkup(
    <CompetitorLicenseHistory name="Northside Childcare" address="14 N Main St" projectUse="Day Care Center" />,
  );
  assert.match(markup, /Checking City license history/);
});
