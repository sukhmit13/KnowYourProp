import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NewConstructionSection } from "./NewConstructionSection";

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
});