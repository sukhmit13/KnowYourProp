import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CorridorIntelligenceView from "./CorridorIntelligenceView";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

test("corridor footer accurately distinguishes property distances, source radii and the unit proxy", () => {
  const html = renderToStaticMarkup(React.createElement(CorridorIntelligenceView, {
    kpis: { permits: null, permitUnits: null, licenses: null, articles: null, zoningAppeals: null, dpdApplications: null },
    corridors: [],
  }));
  assert.match(html, /Permit-row distances are measured from the property/);
  assert.doesNotMatch(html, /permit records are to the corridor/);
  assert.match(html, /within 1 mile of the property; DPD applications within 0.5 mile/);
  assert.match(html, /within 18 months, deduplicated by address/);
  assert.match(html, /Partial feeds show observed records only; missing counts remain unknown/);
});