import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProfessionalEntry, ProfessionalRecord, ProfessionKey } from "@shared/professionalRecord";
import { SectionNumberContext } from "./AccordionSection";
import { ProfessionalRecordSection } from "./ProfessionalRecordSection";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const entry = (name: string, key: string, overrides: Partial<ProfessionalEntry> = {}): ProfessionalEntry => ({
  name,
  key,
  role: "General Contractor",
  lastSeen: "2024-06-18",
  lastSeenPrecision: "day",
  recordCount: 1,
  facts: [],
  ...overrides,
});

const record = (
  groups: ProfessionalRecord["groups"],
  overrides: Partial<ProfessionalRecord> = {},
): ProfessionalRecord => ({
  groups,
  totalNames: groups.reduce((sum, group) => sum + group.entries.length, 0),
  groupCount: groups.filter((group) => group.entries.length > 0).length,
  firstYear: 2016,
  lastYear: 2024,
  sourceCoverage: { permits: { status: "available" } },
  ...overrides,
});

const render = (data: ProfessionalRecord, props: { loading?: boolean; error?: boolean } = {}) =>
  renderToStaticMarkup(
    <SectionNumberContext.Provider value={25}>
      <ProfessionalRecordSection data={data} {...props} />
    </SectionNumberContext.Provider>,
  );

test("rich roll-up uses a fixed profession order, neutral chips, and no person-level performance claims", () => {
  const full = record([
    { key: "lenders", label: "Lenders", entries: [entry("Lakefront Bank", "bank", { role: "Mortgage lender", position: "Current", facts: ["$430,000", "Release not recorded"] })] },
    { key: "taxAttorneys", label: "Tax attorneys", entries: [entry("Mira Chen", "chen", { role: "Tax appeal attorney", lastSeen: "2022", lastSeenPrecision: "year", outcome: "2 of 3 decreased", facts: ["3 appeal records"] })] },
    { key: "zoningAttorneys", label: "Zoning lawyers", entries: [entry("Samir Patel", "patel", { role: "Zoning attorney", outcome: "GRANTED", tag: "ARDC verified", discoveryUrl: "https://example.test/discovery/patel" })] },
    { key: "expediters", label: "Expediters", entries: [entry("Permit Path", "path", { role: "Permit expediter", firm: "Permit Path LLC", lastSeen: "2023-08", lastSeenPrecision: "month" })] },
    { key: "design", label: "Design", entries: [entry("Studio North", "studio", { role: "Architect", lastSeen: "2021", lastSeenPrecision: "year" })] },
    { key: "contractors", label: "Contractors", entries: [entry("Diaz Plumbing", "diaz", { role: "Plumbing Contractor", firm: "Diaz & Sons", lastSeen: "2024-06-18", facts: ["4 records", "Current contact"], discoveryUrl: undefined })] },
  ]);
  const html = render(full);
  const groupOrder = ["Contractors", "Architects &amp; Engineers", "Permit Expediters", "Zoning Attorneys", "Tax Appeal Attorneys", "Lenders"];
  let cursor = -1;
  for (const label of groupOrder) {
    const next = html.indexOf(label);
    assert.ok(next > cursor, `${label} appears in the fixed order`);
    cursor = next;
  }
  for (let index = 1; index <= 6; index += 1) assert.match(html, new RegExp(`25\\.${index}`));
  assert.match(html, /Aug 2023/);
  assert.match(html, />2022</);
  assert.match(html, /outcome as the Board of Review recorded it/);
  assert.match(html, /outcome as the Zoning Board of Appeals recorded it/);
  assert.doesNotMatch(html, /outcome as the Assessor recorded it/);
  assert.match(html, /GRANTED/);
  assert.match(html, /2 of 3 decreased/);
  assert.match(html, /class="kyp-pill ind"/);
  assert.match(html, /class="kyp-tag rec"/);
  assert.doesNotMatch(html, /win rate|success rate|\d+ for \d+|\d+% of (cases|appeals)/i);
  assert.doesNotMatch(html, /kyp-block [^"]*\b(grn|orange|red|bad)\b|kyp-pill (good|watch|bad)/);
  assert.equal((html.match(/<p>/g) ?? []).length, 1, "the source is exactly one paragraph");
  assert.equal((html.match(/class="kyp-src"/g) ?? []).length, 1);
  assert.equal((html.match(/<a\b/g) ?? []).length, 1, "only the eligible Discovery name is linked");
  assert.match(html, /Diaz Plumbing/);
  assert.doesNotMatch(html, /href="[^"]*diaz/);
  const metas = html.match(/<div class="kyp-biz-cardmeta">.*?<\/div>/g) ?? [];
  assert.ok(metas.length > 0);
  for (const meta of metas) assert.ok((meta.match(/class="f"/g) ?? []).length <= 2);
});

test("thin and shuffled data omits empty and unknown groups and numbers surviving subsections contiguously", () => {
  const thin = record([
    { key: "lenders", label: "Lenders", entries: [] },
    { key: "expediters", label: "Expediters", entries: [entry("Northstar Permits", "north", { lastSeen: "", facts: ["One filing"] })] },
    { key: "contractors", label: "Contractors", entries: [] },
    { key: "design", label: "Design", entries: [] },
    { key: "taxAttorneys", label: "Tax attorneys", entries: [] },
    { key: "zoningAttorneys", label: "Zoning lawyers", entries: [] },
    { key: "unknown" as ProfessionKey, label: "Unknown", entries: [entry("Not shown", "unknown")] },
  ] as ProfessionalRecord["groups"], { totalNames: 1, groupCount: 1, firstYear: 2024, lastYear: 2024 });
  const html = render(thin, { loading: true });
  assert.match(html, /25\.1/);
  assert.doesNotMatch(html, /25\.2|Lenders|Contractors|Unknown|Not shown/);
  assert.match(html, /Northstar Permits/);
  assert.match(html, />—</);
  assert.match(html, /one filing year on record/);
  assert.doesNotMatch(html, /No .* on record|kyp-emptypanel/);
});

test("missing year bounds display an em dash, and missing dates are never inferred", () => {
  const item = entry("Unscheduled Builder", "unscheduled", { lastSeen: "", facts: [] });
  const data = record([{ key: "contractors", label: "Contractors", entries: [item] }], { firstYear: null, lastYear: 2023 });
  const html = render(data);
  assert.match(html, /class="bv txt">—</);
  assert.match(html, /class="kyp-biz-distance">—</);
});

test("loading, error, partial coverage, and cached refresh errors do not claim complete zero", () => {
  const loading = renderToStaticMarkup(<ProfessionalRecordSection loading />);
  const failed = renderToStaticMarkup(<ProfessionalRecordSection error />);
  assert.match(loading, /Professional records are loading/);
  assert.match(loading, /kyp-biz-loading/);
  assert.match(failed, /could not be loaded/);
  assert.doesNotMatch(`${loading}${failed}`, /0 Names on record|No professional entries/);

  const partial = record([], {
    totalNames: 0,
    groupCount: 0,
    sourceCoverage: { permits: { status: "partial" }, tax: { status: "unavailable" } },
  });
  const partialHtml = render(partial);
  assert.match(partialHtml, /Coverage is partial/);
  assert.doesNotMatch(partialHtml, /No professional entries are available/);
  assert.match(render(partial, { error: true }), /Refresh failed; showing the available record data/);
});

test("date formatting preserves supplied precision and uses an em dash for invalid records", () => {
  const data = record([{ key: "contractors", label: "Contractors", entries: [
    entry("Day Record", "day", { lastSeen: "2024-02-03", lastSeenPrecision: "day" }),
    entry("Month Record", "month", { lastSeen: "2024-02", lastSeenPrecision: "month" }),
    entry("Year Record", "year", { lastSeen: "2024", lastSeenPrecision: "year" }),
    entry("Invalid Record", "invalid", { lastSeen: "not-a-date", lastSeenPrecision: "day" }),
  ] }]);
  const html = render(data);
  assert.match(html, /Feb 3, 2024/);
  assert.match(html, /Feb 2024/);
  assert.match(html, />2024</);
  assert.ok((html.match(/class="kyp-biz-distance">—</g) ?? []).length >= 1);
});