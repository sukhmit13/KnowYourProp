import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DevelopmentSection } from "./DevelopmentSection";
import { SectionNumberContext } from "./AccordionSection";

const props = (overrides: Record<string, unknown> = {}) => ({
  pipelineData: {
    pipeline: {
      unitsUnderConstruction: 48,
      activePermitCount: 11,
      permitUnitsSource: "description",
      potentialUnits: 187,
      potentialAmbiguous: true,
      commercialProposals: 3,
    },
  },
  permitData: undefined,
  permitLoading: false,
  permitError: false,
  dpdData: { dpdApplications: [], developments: [] },
  dpdLoading: false,
  dpdError: false,
  zbaData: { approvals: [], upcoming: [] },
  zbaLoading: false,
  zbaError: false,
  radiusMi: 0.5 as const,
  onRadiusChange: () => undefined,
  renderLogo: () => null,
  ...overrides,
});

test("development report renders separate pipeline evidence and estimate provenance", () => {
  const html = renderToStaticMarkup(React.createElement(DevelopmentSection, props()));
  assert.match(html, /~48/);
  assert.match(html, /~187/);
  assert.match(html, /estimated from permit descriptions/);
  // The permitted figure and the proposed figure must never share a block row.
  const rows = html.split('class="kyp-blocks');
  assert.equal(rows.filter((r) => /Units under construction/.test(r) && /Potential future units/.test(r)).length, 0);
  assert.match(html, /Permitted — issued in the last 18 months/);
  assert.match(html, /Proposed — no permit issued/);
  assert.match(html, /11 permits/);
  assert.match(html, /proposed or seeking zoning relief/);
  assert.match(html, /an 18-month issued permit is a proxy, not verified construction/);
  assert.match(html, /at least one application here reports more than one possible unit count/);
  const pipeline = html.match(/<section id="development-pipeline">([\s\S]*?)<\/section>/)?.[1] || "";
  assert.equal((pipeline.match(/class="kyp-src"/g) || []).length, 1);
  assert.doesNotMatch(pipeline, /pipefoot/);
  assert.doesNotMatch(html, /235 units|total pipeline units/i);
});

test("unknown upstream coverage renders unknown values rather than zeros", () => {
  const html = renderToStaticMarkup(React.createElement(DevelopmentSection, props({
    pipelineData: {
      pipeline: {
        unitsUnderConstruction: 0,
        activePermitCount: 0,
        potentialUnits: 0,
        commercialProposals: 0,
        sourceCoverage: {
          permits: { status: "unavailable" },
          dpdApplications: { status: "unavailable" },
        },
      },
      sourceCoverage: {
        dpdApplications: { status: "unavailable" },
        zbaActivity: { status: "unavailable" },
        news: { status: "unavailable" },
      },
    },
    dpdData: { dpdApplications: null, developments: null, sourceCoverage: { dpdApplications: { status: "unavailable" }, news: { status: "unavailable" } } },
    zbaData: { zbaActivity: { recentApprovals: null, upcomingCases: null }, sourceCoverage: { zbaActivity: { status: "unavailable" } } },
    dpdError: true,
    zbaError: true,
  })));
  assert.match(html, /Permit source coverage is unknown/);
  assert.match(html, /Plan Commission applications could not be loaded/);
  assert.match(html, /Zoning Board records could not be loaded/);
  assert.doesNotMatch(html, />0</);
});

test("available zero pipeline values remain distinct from unavailable coverage", () => {
  const html = renderToStaticMarkup(React.createElement(DevelopmentSection, props({
    pipelineData: {
      pipeline: {
        unitsUnderConstruction: 0,
        activePermitCount: 0,
        potentialUnits: 0,
        commercialProposals: 0,
        sourceCoverage: {
          permits: { status: "available" },
          dpdApplications: { status: "available" },
          zbaActivity: { status: "available" },
        },
      },
    },
  })));
  assert.match(html, /class="bv">0<\/div>/);
  assert.match(html, /0 permits/);
  assert.equal((html.match(/None in the record/g) || []).length, 2);
  assert.doesNotMatch(html, /Permit source coverage is unknown/);
});

test("report integration removes the standalone new-construction accordion and fixes jump targets", () => {
  const runDetail = readFileSync(new URL("../../pages/RunDetail.tsx", import.meta.url), "utf8");
  const developmentSection = readFileSync(new URL("./DevelopmentSection.tsx", import.meta.url), "utf8");
  const defaultOrder = runDetail.match(/const ACC_DEFAULT_ORDER = \[([^\]]*)\];/)?.[1] || "";
  assert.doesNotMatch(defaultOrder, /newConstruction/);
  assert.doesNotMatch(runDetail, /<AccordionSection \{\.\.\.accProps\("newConstruction"\)\}>/);
  assert.match(runDetail, /<AccordionSection \{\.\.\.accProps\("development"\)\}>[\s\S]{0,500}<DevelopmentSection/);
  assert.match(runDetail, /<DevelopmentSection/);
  assert.match(runDetail, /development:\s*upcomingDevsData,/);
  assert.match(runDetail, /pipelineData=\{upcomingDevsData\}/);
  assert.match(runDetail, /sourceCoverage: upcomingDevsData\.pipeline\?\.sourceCoverage/);
  assert.doesNotMatch(runDetail, /upcomingDevsData\?\.development/);
  assert.doesNotMatch(runDetail, /<div hidden aria-hidden="true">|Section Summary|upcoming-dev-summary|badge-upcoming-dev-stage|badge-upcoming-dev-zba|badge-dev-status-|trigger-dev-news-sub|trigger-new-construction-sub|trigger-zba-activity-sub/);
  assert.equal((runDetail.match(/id="print-section-upcoming-developments"/g) || []).length, 0);
  assert.equal((developmentSection.match(/id="print-section-upcoming-developments"/g) || []).length, 1);
  assert.match(runDetail, /setAccOpen\(\(m\) => \(\{ \.\.\.m, development: true \}\)\); return 'development-proposed'/);
  assert.match(runDetail, /return 'development-zba'/);
  assert.match(runDetail, /return 'print-section-new-construction'/);
});

test("merged section has four dynamic subsection numbers and five source footers in every data state", () => {
  for (const sectionNumber of [23, 31]) {
    for (const state of [{}, { permitLoading: true, dpdLoading: true, zbaLoading: true }, { permitError: true, dpdError: true, zbaError: true, permitData: undefined }]) {
      const html = renderToStaticMarkup(
        React.createElement(SectionNumberContext.Provider, { value: sectionNumber },
          React.createElement(DevelopmentSection, props(state))),
      );
      assert.deepEqual(Array.from(html.matchAll(/class="n">([^<]+)<\/span>/g), (match) => match[1]),
        [1, 2, 3, 4].map((subsection) => `${sectionNumber}.${subsection}`));
      assert.equal((html.match(/class="kyp-src(?:\s|")/g) || []).length, 5);
      assert.match(html, /id="print-section-new-construction"/);
      assert.doesNotMatch(html, /first is a field on the permit record/);
    }
  }
});

test("partial zoning coverage suppresses proposal totals and news match tags identify the right source", () => {
  const html = renderToStaticMarkup(React.createElement(SectionNumberContext.Provider, { value: 31 },
    React.createElement(DevelopmentSection, props({
      pipelineData: { pipeline: { unitsUnderConstruction: 48, activePermitCount: 3, potentialUnits: 20, commercialProposals: 2, permitUnitsSource: "description",
        sourceCoverage: { permits: { status: "available" }, dpdApplications: { status: "available" }, zbaActivity: { status: "partial" } } } },
      dpdData: { dpdApplications: [], developments: [
        { id: "permit-news", stage: 2, title: "Permit coverage", status: "Approved", pipelineStage: "permitted" },
        { id: "application-news", stage: 2, title: "Application coverage", status: "Proposed", pipelineStage: "proposed" },
        { id: "case-news", stage: 2, title: "Case coverage", pipelineStage: "zoning" },
      ] },
    }))));
  assert.match(html, /Application-source coverage is unknown/);
  assert.match(html, /also a permit in 31\.1/);
  assert.match(html, /also an application in 31\.2/);
  assert.match(html, /also a zoning case in 31\.3/);
  assert.match(html, /class="kyp-pill ind">Approved/);
});

test("observed partial proposals stay visible without claiming complete counts or zero activity", () => {
  for (const observed of [187, 0]) {
    const html = renderToStaticMarkup(React.createElement(DevelopmentSection, props({
      pipelineData: { pipeline: { unitsUnderConstruction: null, observedUnitsUnderConstruction: 12, activePermitCount: 4, permitUnitsUnknownAddressCount: 2, permitUnitsSource: "description",
        potentialUnits: null, commercialProposals: null, observedPotentialUnits: observed, observedCommercialProposals: observed > 0 ? 3 : 0,
        sourceCoverage: { permits: { status: "available" }, dpdApplications: { status: "partial" }, zbaActivity: { status: "partial" } } } },
    })));
    assert.match(html, /~12/);
    assert.match(html, /4 permits · 2 with no unit count/);
    assert.match(html, /source coverage is incomplete/);
    if (observed > 0) assert.match(html, /~187/);
    else {
      assert.match(html, /None in the record/);
      assert.doesNotMatch(html, /class="bv">~?0</);
    }
  }
});

test("news failures use the backend's developmentNews coverage instead of asserting an empty feed", () => {
  const html = renderToStaticMarkup(React.createElement(DevelopmentSection, props({
    dpdData: { dpdApplications: [], developments: [], sourceCoverage: { developmentNews: { status: "unavailable" } } },
  })));
  assert.match(html, /Development news could not be loaded/);
  assert.doesNotMatch(html, /No nearby development coverage found/);
});