import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import {
  FoodAccessPanel, GroceryLicenseList, SeniorPopulationPanel, VehicleOwnershipPanel,
  EVRegistrationTrends, EVChargingTable, getEVChargingSiteCount, HotelShortTermRentalGroup, LicensedBusinessPanel,
} from "./ProjectUseDomainPanels";

const grocery = {
  storeCount: 2,
  stores: [
    { name: "Store A", address: "100 W Chicago Ave", squareFeet: 20000, distance: 0.4 },
    { name: "Store B", address: "200 W Chicago Ave", squareFeet: 35000, distance: 1.2 },
    { name: "Store C", address: "300 W Chicago Ave", squareFeet: null, distance: 2.1 },
  ],
  sources: { dataSource: "Chicago Data Portal — Grocery Store Status", dataYear: "2024" },
};
const seniors = {
  communityArea: "West Town", communityNumber: 24, totalPopulation: 42210,
  population65Plus: 4812, pct65Plus: 11.4, seniorsLivingAlone: 1906, pctSeniorsLivingAlone: 39.6,
  age65to74: 2410, age75to84: 1359, age85Plus: 1043,
  seniorDemandLevel: "high" as const, comparedToCityAvg: "Above city average",
  citywideRank: 12, rankDescription: "Top 20 in Chicago (#12 of 77)",
};
const vehicles = {
  communityArea: "West Town", communityNumber: 24, totalHouseholds: 1000,
  noVehicle: 200, oneVehicle: 400, twoVehicles: 300, threePlusVehicles: 100,
  avgVehiclesPerHousehold: 1.32, pctNoVehicle: 20, pctWithVehicle: 80,
  autoDependencyLevel: "moderate" as const, comparedToCityAvg: "Near city average",
};
const html = (node: React.ReactNode) => renderToStaticMarkup(<>{node}</>);

test("food access preserves aggregate count, partial store-area coverage, and disclosed product bands", () => {
  const markup = html(<FoodAccessPanel data={grocery} loading={false} scope="zip" areaLabel="60612" />);
  const $ = load(markup);
  assert.equal($(".kyp-blocks.two .kyp-block").length, 2);
  assert.match($(".kyp-block.orange").text(), /2/);
  assert.match(markup, /55,000/);
  assert.match($(".kyp-band.on").text(), /Limited access/);
  assert.match($(".kyp-src").text(), /planning convention/);
  assert.match($(".kyp-src").text(), /not a USDA|not USDA/);
  assert.equal($(".kyp-src").length, 1);
  assert.match($(".kyp-src").text(), /2 of 3|partial|non-null/i);
});

test("zero stores remains zero and missing square-footage stays unknown, not invented", () => {
  const noArea = { ...grocery, stores: grocery.stores.map(row => ({ ...row, squareFeet: null })) };
  const $ = load(html(<FoodAccessPanel data={noArea} loading={false} scope="community" areaLabel="West Town" />));
  assert.doesNotMatch($(".kyp-blocks").text(), /0 sq ft/);
  const zero = load(html(<FoodAccessPanel data={{ ...grocery, storeCount: 0, stores: [] }} loading={false} scope="zip" areaLabel="60612" />));
  assert.match(zero(".kyp-band.on").text(), /Food desert/);
  assert.match(zero(".kyp-block.red").text(), /0/);
});

test("grocery rows preserve reported distance and area metadata with name-only links", () => {
  const $ = load(html(<GroceryLicenseList data={grocery} loading={false} scope="zip" areaLabel="60612" coordinatesAvailable />));
  assert.equal($(".kyp-biz-card").length, 3);
  assert.equal($(".kyp-biz-card a").length, 3);
  assert.equal($(".addr a").length, 0);
  assert.match($(".kyp-biz-card").first().text(), /0\.4 mi/);
  assert.match($(".kyp-biz-card").first().text(), /20,000/);
  assert.match($(".kyp-src").text(), /area aggregate|area-bounded|area inventory/i);
  assert.equal($(".kyp-src").length, 1);
});

test("senior population keeps four counts, three age bars, and one neutral living-alone-share rank", () => {
  const markup = html(<SeniorPopulationPanel data={seniors} loading={false} scope="community" areaLabel="West Town" />);
  const $ = load(markup);
  assert.equal($(".kyp-blocks.four > .kyp-block").length, 4);
  assert.equal($(".kyp-hbar").length, 3);
  for (const count of ["4,812", "1,906", "1,043", "42,210", "2,410", "1,359"]) assert.match(markup, new RegExp(count));
  assert.equal($(".chip.rank").length, 1);
  assert.equal($(".kyp-block.slate .chip.rank").length, 1);
  assert.match($(".chip.rank").text(), /12/);
  assert.match($(".chip.rank").text(), /77/);
  assert.match($(".chip.rank").text(), /living.alone|share/i);
  assert.doesNotMatch(markup, /Market Assessment|Addressable Market|Primary Target|Secondary Target|Highest care needs|most seniors|12th-largest/i);
  assert.equal($(".kyp-band.slate").length, 3);
  assert.match($(".kyp-band.on").text(), /High share/);
  assert.equal($(".kyp-band[aria-current=true]").length, 1);
  assert.match($(".kyp-band.on .bar").attr("style") ?? "", /var\(--kyp-slate\)/);
  assert.match($(".kyp-src").text(), /overlap/);
  assert.match($(".kyp-src").text(), /planning convention/);
});

test("vehicle bands are neutral and the one-vehicle residual shows its numeric working", () => {
  const $ = load(html(<VehicleOwnershipPanel data={vehicles} loading={false} areaLabel="West Town" />));
  assert.equal($(".kyp-blocks .kyp-block").length, 3);
  assert.equal($(".kyp-band.slate").length, 3);
  assert.match($(".kyp-band.on").text(), /Moderate/);
  assert.match($(".kyp-src").text(), /100/);
  assert.match($(".kyp-src").text(), /20/);
  assert.match($(".kyp-src").text(), /40/);
  assert.match($(".kyp-src").text(), /1\.0|1\.5/);
  assert.match($(".kyp-src").text(), /planning|estimated|estimate/);
  assert.doesNotMatch($.text(), /Strong demand|Moderate fuel demand|Limited market|Smaller vehicle market/);
});

test("EV trends have separate monthly chart frames, real endpoint windows, and latest observed zeros", () => {
  const data = {
    zipCode: "60612", sourceUrl: "https://www.ilsos.gov/departments/vehicles/statistics/electric.html", lastUpdated: "2026-01-17",
    cookCountyData: [{ year: 2025, month: 1, count: 10000 }, { year: 2025, month: 3, count: 12000 }],
    zipCodeData: [{ year: 2025, month: 1, count: 0 }, { year: 2025, month: 3, count: 0 }],
  };
  const markup = html(<EVRegistrationTrends data={data} loading={false} zipCode="60612" />);
  const $ = load(markup);
  assert.equal($(".kyp-twochart > div").length, 2);
  assert.match(markup, /12,000/);
  assert.match($(".kyp-src").text(), /Jan.*2025/);
  assert.match($(".kyp-src").text(), /Mar.*2025/);
  assert.doesNotMatch(markup, /past 2 years|over 24 months|Infinity|NaN/);
  assert.equal($(".kyp-blocks.two .bv").last().text(), "0");
  assert.equal($(".kyp-src").length, 1);
  assert.match($(".kyp-src").text(), /registered electric vehicles, not households/);
});

test("gas stations enable EV history fetching, numbering, and rendering independently of vehicle ownership", () => {
  const source = readFileSync("client/src/pages/RunDetail.tsx", "utf8");
  assert.match(source, /const isAutoService = isGasStation \|\| isAutoRepair \|\| isAutoBody;/);
  assert.match(source, /const hasEVRegistrationPanel = isAutoService;/);
  assert.match(source, /useEVRegistrations\(facts\?\.zipCode, hasEVRegistrationPanel\)/);
  assert.match(source, /\["evRegistrations", hasEVRegistrationPanel\]/);
  assert.match(source, /\{hasEVRegistrationPanel && \(\s*<div id="print-section-ev-registrations">/);
  assert.match(source, /const hasAutoOwnershipPanel = isAutoRepair \|\| isAutoBody;/);
});

test("ZIP observations are not discarded when the county series is missing", () => {
  const data = {
    zipCode: "60612", sourceUrl: "", lastUpdated: "2026-01-17", cookCountyData: null,
    zipCodeData: [{ year: 2025, month: 1, count: 20 }, { year: 2025, month: 2, count: 35 }],
  };
  const $ = load(html(<EVRegistrationTrends data={data} loading={false} zipCode="60612" />));
  assert.equal($(".kyp-blocks.two .bv").first().text(), "—");
  assert.equal($(".kyp-blocks.two .bv").last().text(), "35");
  assert.match($.text(), /Cook County registration rows are not available/);
  assert.match($(".kyp-src").text(), /Feb.*2025/);
});

test("every domain loading/unavailable/error state keeps one source note at the end", () => {
  for (const state of [{ loading: true }, { loading: false }, { loading: false, error: true }]) {
    const panels = [
      <FoodAccessPanel {...state} scope="zip" areaLabel="60612" />,
      <GroceryLicenseList {...state} scope="zip" areaLabel="60612" />,
      <SeniorPopulationPanel {...state} scope="community" areaLabel="West Town" />,
      <VehicleOwnershipPanel {...state} areaLabel="West Town" />,
      <EVRegistrationTrends {...state} zipCode="60612" />,
      <EVChargingTable {...state} />,
      <LicensedBusinessPanel {...state} category="Restaurants" source="Chicago Business Licenses" listKey="restaurant" />,
    ];
    for (const panel of panels) {
      const $ = load(html(panel));
      assert.equal($(".kyp-src").length, 1, `${panel.type.name} ${JSON.stringify(state)}`);
      assert.equal($("body").children().last().hasClass("kyp-src"), true);
      assert.match($(".kyp-src").text(), /Scope:/);
      assert.match($(".kyp-src").text(), /Source:/);
    }
  }
});

test("EV infrastructure preserves seven columns, deduped site counts and all grouped source attributes", () => {
  const stations = [
    { name: "Station A", address: "100 W Chicago Ave", distanceMiles: 0.4, evNetwork: "Network A", evLevel2Count: 2, dcFastCount: 0, accessDays: "24 hours", dateLastConfirmed: "2026-01-05" },
    { name: "Station B", address: "100 W Chicago Ave", distanceMiles: 0.4, evNetwork: "Network B", evLevel2Count: 3, dcFastCount: 1, accessDays: "Business hours", dateLastConfirmed: "2025-12-01" },
    { name: "Unknown station", address: "200 W Chicago Ave", distanceMiles: null, evNetwork: null, evLevel2Count: null, dcFastCount: null, accessDays: null, dateLastConfirmed: null },
  ];
  const $ = load(html(<EVChargingTable stations={stations} loading={false} />));
  assert.equal($(".kyp-dtab th").length, 7);
  assert.equal($(".kyp-dtab tbody tr").length, 2);
  const first = $(".kyp-dtab tbody tr").first().text();
  assert.match(first, /Network A/); assert.match(first, /Network B/);
  assert.match(first, /24 hours/); assert.match(first, /Business hours/);
  assert.match(first, /1\/5\/2026|Jan 5, 2026|2026-01-05/);
  assert.match(first, /12\/1\/2025|Dec 1, 2025|2025-12-01/);
  assert.match($(".kyp-dtab tbody tr").last().text(), /Unknown/);
  assert.deepEqual($(".kyp-blocks .bv").toArray().map(node => $(node).text()), ["1", "1", "1"]);
  assert.doesNotMatch($.text(), /best for longer stops|best for quick stops/i);
  const lastCells = $(".kyp-dtab tbody tr").last().find("td").toArray().map(node => $(node).text());
  assert.equal(lastCells[3], "—");
  assert.equal(lastCells[4], "—");
});

test("hotel rental grouping is unnumbered, preserves zeros, and has no invented listing rows", () => {
  const $ = load(html(<HotelShortTermRentalGroup counts={{ totalFound: 2, within1Mile: 0, within2Miles: 1, within3Miles: 2 }} />));
  assert.equal($(".subwrap .kyp-subhead").length, 1);
  assert.equal($(".kyp-subhead .n").length, 0);
  assert.deepEqual($(".kyp-blocks .bv").toArray().map(node => $(node).text()), ["0", "1", "2"]);
  assert.equal($(".kyp-biz-card").length, 0);
});

test("charging badge and table share address dedup, repeated IDs do not inflate ports or lose metadata", () => {
  const stations = [
    { id: "a", name: "First", address: "100 W Chicago Ave", distanceMiles: 0.5, evLevel2Count: 2 },
    { id: "b", name: "Second", address: "100 W Chicago Ave", distanceMiles: 0.4, evLevel2Count: 3 },
    { id: "b", name: "Second", address: "100 W Chicago Ave", distanceMiles: 0.4, evLevel2Count: 3, evNetwork: "Updated network" },
    { id: "c", name: "Unknown distance", address: "200 W Chicago Ave", distanceMiles: null },
  ];
  assert.equal(getEVChargingSiteCount(stations), 1);
  const $ = load(html(<EVChargingTable stations={stations} loading={false} />));
  const cells = $(".kyp-dtab tbody tr").first().find("td");
  assert.equal(cells.eq(3).text(), "5");
  assert.equal(cells.eq(1).text(), "0.4 mi");
  assert.match(cells.eq(2).text(), /Updated network/);
  assert.equal($(".kyp-blocks .bv").last().text(), String(getEVChargingSiteCount(stations)));
});

test("the shared restaurant/coffee license component preserves zero-distance and unknown-distance records", () => {
  const data = { locations: [
    { id: 1, name: "At site", address: "100 W Chicago Ave", latitude: 41.8, longitude: -87.6, distanceMiles: 0 },
    { id: 2, name: "Farther", address: "200 W Chicago Ave", latitude: 41.8, longitude: -87.6, distanceMiles: 1.2 },
  ] };
  const $ = load(html(<LicensedBusinessPanel data={data} loading={false} category="Coffee shops" source="Chicago Business Licenses" listKey="coffee" />));
  assert.equal($(".kyp-biz-card").length, 1);
  assert.match($(".kyp-biz-card").text(), /0\.0 mi/);
  assert.equal($(".kyp-blocks .bv").text(), "1");
  assert.equal($(".kyp-src").length, 1);
});

test("source radius aggregates are not replaced by counts of capped license rows", () => {
  const data = { within1Mile: 24, locations: [
    { name: "First returned row", address: "100 W Chicago Ave", distanceMiles: 0.4 },
    { name: "Second returned row", address: "200 W Chicago Ave", distanceMiles: 0.6 },
  ] };
  const $ = load(html(<LicensedBusinessPanel data={data} loading={false} category="Restaurants" source="Chicago Business Licenses" listKey="restaurant" />));
  assert.equal($(".kyp-blocks .bv").text(), "24");
  assert.equal($(".kyp-biz-card").length, 2);
  assert.match($(".kyp-src").text(), /detail list may be capped/);
});