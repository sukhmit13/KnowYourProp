import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NewConstructionSection } from "./NewConstructionSection";

const render = (overrides: Partial<React.ComponentProps<typeof NewConstructionSection>> = {}) => renderToStaticMarkup(
  <NewConstructionSection
    data={{
      permits: [],
      subject: {
        totalPermits: 15,
        byCategory: { singleFamily: 10, multifamily: 5 },
        annual: { "2026": { total: 9 }, "2025": { total: 6 } },
        permittedUnits: 120,
        medianReportedCost: 412500,
      },
      trend: { suppressed: false, current12Months: 18, prior12Months: 8, changePct: 125 },
      communityBenchmark: { name: "Edgewater", totalPermits: 40 },
    }}
    isLoading={false}
    isError={false}
    {...overrides}
  />,
);

test("nearby permit count offers access to records beyond the initial list", () => {
  const permits = Array.from({ length: 15 }, (_, i) => ({
    permitNumber: `permit-${i}`,
    address: `${i} N TEST ST`,
    category: "singleFamily",
    issueDate: "2026-01-01",
    distanceMiles: i / 100,
  }));
  const html = renderToStaticMarkup(
    <NewConstructionSection
      data={{
        permits,
        subject: {
          totalPermits: 15,
          byCategory: { singleFamily: 15 },
          annual: { "2026": { total: 15 } },
          permittedUnits: 15,
          medianReportedCost: 100000,
        },
        activePermitCount: 15,
        trend: { suppressed: false, current12Months: 15, prior12Months: 0, changePct: 100 },
      }}
      isLoading={false}
      isError={false}
    />,
  );
  assert.match(html, /15 nearby permits/i);
  assert.equal((html.match(/data-testid="row-new-construction-/g) ?? []).length, 12);
  assert.match(html, /Show all 15 nearby permits/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /Single family/);
  assert.match(html, /15<\/b>/);
  assert.match(html, /2026/);
});

test("12-month trend and community benchmark render as blocks, in slate", () => {
  const html = render();
  assert.match(html, /\+125%/);
  assert.match(html, /18 permits vs 8 the year before/);
  assert.match(html, /Edgewater community area/);
  assert.match(html, /same 3-year window/);
  assert.doesNotMatch(html, /12-month trend:/);
  assert.match(html, /class="kyp-block slate"><div class="bv">\+125%/);
  assert.doesNotMatch(html, /kyp-block (grn|orange|red)[^"]*">\s*<div class="bv">\+125%/);
  assert.match(html, /kyp-blocks four kyp-biz-heroes/);
});

test("suppressed trend remains an unknown block while an absent benchmark has no block", () => {
  const html = render({
    data: {
      permits: [],
      subject: {
        totalPermits: 4,
        byCategory: {},
        annual: {},
        permittedUnits: 4,
        medianReportedCost: null,
      },
      trend: { suppressed: true, current12Months: 1, prior12Months: 2, changePct: null },
    },
  });
  assert.match(html, /class="bv">—<\/div><div><div class="bl">12-month change<\/div><div class="bd">too few permits to compare/);
  assert.match(html, /class="kyp-blocks kyp-biz-heroes"/);
  assert.equal((html.match(/class="kyp-block (?:ind|slate)"/g) || []).length, 3);
  assert.doesNotMatch(html, /community area|same 3-year window/);
  assert.doesNotMatch(html, /12-month trend:|trend is not shown because/i);
});

test("missing trend and benchmark are omitted without changing permit and supply evidence", () => {
  const html = render({
    subjectUnits: 50,
    data: {
      permits: [{
        permitNumber: "permit-evidence",
        address: "5412 N. Broadway",
        category: "multifamily",
        issueDate: "2026-07-09",
        distanceMiles: 0.21,
        units: 44,
        stories: 7,
        reportedCost: 9100000,
        contractorName: "Skender Construction",
        architectName: "Hartshorne Plunkard",
      }],
      subject: {
        totalPermits: 1,
        byCategory: { multifamily: 1 },
        annual: { "2026": { total: 1 } },
        permittedUnits: 120,
        medianReportedCost: 9100000,
      },
    },
  });
  assert.match(html, /Nearby permits/);
  assert.match(html, /Median reported cost/);
  assert.match(html, /5412 N\. Broadway/);
  assert.match(html, /Multifamily/);
  assert.match(html, /44 units/);
  assert.match(html, /7 stories/);
  assert.match(html, /\$9,100,000/);
  assert.match(html, /Skender Construction/);
  assert.match(html, /Hartshorne Plunkard/);
  assert.match(html, /They identify 120 units, 2\.4× the subject’s 50 — competing supply, not confirmed construction\./);
  assert.doesNotMatch(html, /12-month change|community area|12-month trend:/);
  assert.match(html, /Describes permits within 1 mile, not this address\./);
  assert.match(html, /Permit - New Construction/);
});

test("construction loading and error states keep scope and source notes without asserting zero", () => {
  const loadingHtml = renderToStaticMarkup(
    <NewConstructionSection data={undefined} isLoading isError={false} />,
  );
  assert.match(loadingHtml, /kyp-biz-loading/);
  assert.match(loadingHtml, /Describes permits within 1 mile, not this address\./);
  assert.match(loadingHtml, /Source: Chicago Building Permits/);
  assert.doesNotMatch(loadingHtml, /nearby construction result is unknown rather than zero/);

  const errorHtml = renderToStaticMarkup(
    <NewConstructionSection data={undefined} isLoading={false} isError />,
  );
  assert.match(errorHtml, /nearby construction result is unknown rather than zero/);
  assert.match(errorHtml, /new-construction-notes/);
  assert.equal((errorHtml.match(/<p>/g) || []).length, 2);
});