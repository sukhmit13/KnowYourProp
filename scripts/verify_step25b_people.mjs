// Browser regression check using the production Neighborhood & People JSX.
// Run against the managed development workflow: node scripts/verify_step25b_people.mjs
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import ts from "typescript";
import { transform } from "esbuild";
import { chromium } from "playwright";

const origin = process.env.STEP25B_ORIGIN || `https://${process.env.REPLIT_DEV_DOMAIN}`;
assert(origin && !origin.endsWith("undefined"), "Set STEP25B_ORIGIN or REPLIT_DEV_DOMAIN to the running Vite origin");

const runDetail = await fs.readFile("client/src/pages/RunDetail.tsx", "utf8");
const runAst = ts.createSourceFile("RunDetail.tsx", runDetail, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let peopleSection;
let peopleSubsectionsSource;
const runHelpers = new Map();
function visitRunDetail(node) {
  if (ts.isJsxElement(node)
    && node.openingElement.tagName.getText(runAst) === "AccordionSection"
    && node.openingElement.attributes.getText(runAst).includes('accProps("people")')) {
    peopleSection = node.getText(runAst);
  }
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
    const name = node.name.text;
    if (name === "peopleSubsections" && ts.isVariableStatement(node.parent.parent)) {
      peopleSubsectionsSource = node.parent.parent.getText(runAst);
    }
    if (name === "DEMOGRAPHIC_FAVORABILITY" || name === "demographicChangeClass") {
      runHelpers.set(name, node.parent.parent.getText(runAst));
    }
  }
  ts.forEachChild(node, visitRunDetail);
}
visitRunDetail(runAst);
assert(peopleSection, 'Production <AccordionSection {...accProps("people")}> not found');
assert(peopleSubsectionsSource, "Production peopleSubsections/buildSubsectionNumbers declaration not found");
assert(runHelpers.has("DEMOGRAPHIC_FAVORABILITY") && runHelpers.has("demographicChangeClass"),
  "Production demographic trend helpers not found");

const accordionSource = await fs.readFile("client/src/components/report/AccordionSection.tsx", "utf8");
const accordionAst = ts.createSourceFile("AccordionSection.tsx", accordionSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const numberingHelper = accordionAst.statements.find((node) =>
  ts.isFunctionDeclaration(node) && node.name?.text === "buildSubsectionNumbers");
assert(numberingHelper, "Production buildSubsectionNumbers helper not found");

async function get(path) {
  const response = await fetch(`${origin}${path}`, { signal: AbortSignal.timeout(60000) });
  assert(response.ok, `${path}: HTTP ${response.status}`);
  return response;
}

const [accordionModule, mainModule, viteHtml] = await Promise.all([
  get("/src/components/report/AccordionSection.tsx").then((response) => response.text()),
  get("/src/main.tsx").then((response) => response.text()),
  get("/").then((response) => response.text()),
]);
const reactPath = accordionModule.match(/from "([^"]*\/react\.js\?[^"]+)"/)?.[1];
const rootPath = mainModule.match(/from "([^"]*\/react-dom_client\.js\?[^"]+)"/)?.[1];
assert(reactPath && rootPath, "Vite-generated React dependency paths not found");

function geoMetrics() {
  const rows = [
    ["Population", "34,699", 34699, "34,311", 34311],
    ["Median Age", "35.2", 35.2, "31.6", 31.6],
    ["Median Household Income", "$60,457", 60457, "$41,300", 41300],
    ["Per Capita Income", "$43,589", 43589, "$26,796", 26796],
    ["% Below Poverty", "23.5%", 23.5, "32.6%", 32.6],
    ["% Unemployed (16+)", "11.1%", 11.1, "11.8%", 11.8],
    ["% Without HS Diploma (25+)", "11.1%", 11.1, "15.6%", 15.6],
    ["% White", "26.3%", 26.3, "27.7%", 27.7],
    ["% Black/African American", "54.8%", 54.8, "60.5%", 60.5],
    ["% Hispanic/Latino", "16.1%", 16.1, "12.3%", 12.3],
    ["% Asian", "4.9%", 4.9, "4.6%", 4.6],
    ["% BIPOC", "73.7%", 73.7, "72.3%", 72.3],
    ["% Owner-Occupied", "30.8%", 30.8, "27.7%", 27.7],
    ["% Renter-Occupied", "69.2%", 69.2, "72.3%", 72.3],
    ["% Housing Vacancy", "10.9%", 10.9, "14.4%", 14.4],
    ["Median Home Value", "$331,600", 331600, "$269,800", 269800],
    ["Median Gross Rent", "$1,330", 1330, "$1,016", 1016],
    ["% Commute via Transit", "23.4%", 23.4, "33.8%", 33.8],
  ];
  return {
    metrics: rows.map(([label, value, rawValue]) => ({ label, value, rawValue })),
    priorMetrics: rows.map(([label, , , value, rawValue]) => ({ label, value, rawValue })),
  };
}
const zipMetrics = geoMetrics();
const tractMetrics = geoMetrics();
tractMetrics.metrics[0] = { label: "Population", value: "12,345", rawValue: 12345 };
tractMetrics.priorMetrics[0] = { label: "Population", value: "11,900", rawValue: 11900 };
const fixture = {
  sectionIndex: 25,
  facts: { zipCode: "60612", communityArea: "West Town", tractGeoid: "17031242900" },
  languageData: {
    communityArea: "West Town",
    communityNumber: 28,
    population5Plus: 40400,
    englishOnlyPct: 65.2,
    nonEnglishPct: 34.8,
    topLanguages: [
      { language: "English only", count: 26360, pct: 65.2 },
      { language: "Spanish", count: 8161, pct: 20.2 },
      { language: "Polish", count: 1656, pct: 4.1 },
    ],
    limitedEnglishProficiency: { count: 4000, pct: 9.9 },
    linguisticDiversity: "high",
    comparedToCityAvg: "15% above city average",
    citywideRank: 16,
    rankDescription: "Upper tier for diversity (#16 of 55)",
  },
  languageZipData: {
    zipCode: "60612",
    population5Plus: 35900,
    englishOnlyPct: 72.5,
    nonEnglishPct: 27.5,
    topLanguages: [
      { language: "English only", count: 26028, pct: 72.5 },
      { language: "Spanish", count: 5672, pct: 15.8 },
      { language: "Chinese", count: 898, pct: 2.5 },
    ],
    limitedEnglishProficiency: { count: 3052, pct: 8.5 },
    linguisticDiversity: "moderate",
    comparedToCityAvg: "23% below city average",
    citywideRank: 34,
    rankDescription: "Middle tier for diversity (#34 of 55)",
  },
  censusACSData: {
    zip: {
      geoid: "60612",
      name: "ZIP 60612",
      ...zipMetrics,
      dataYear: 2023,
      source: "U.S. Census Bureau ACS 5-Year Estimates",
    },
    tract: {
      geoid: "17031242900",
      name: "Census Tract 17031242900",
      ...tractMetrics,
      dataYear: 2023,
      source: "U.S. Census Bureau ACS 5-Year Estimates",
    },
  },
  lodesData: {
    tractGeoid: "17031242900",
    workersInTract: 577,
    residentsWhoWork: 1061,
    highEarners: 340,
    retailJobs: 25,
    healthcareJobs: 9,
    artsEntertainmentJobs: 26,
    foodServiceJobs: 31,
  },
  electionData: {
    name: "West Town",
    number: 28,
    presidential: {
      "2024": { democratic_pct: 82.8, republican_pct: 15.5, margin: "D+67.3", total_votes: 42500 },
      "2020": { democratic_pct: 87.2, republican_pct: 11.1, margin: "D+76.1", total_votes: 44200 },
      "2016": { democratic_pct: 84.8, republican_pct: 10.2, margin: "D+74.6", total_votes: 40800 },
    },
    mayoral: {
      "2023": { winner: "Brandon Johnson", winner_label: "Progressive", winner_pct: 62.4, opponent: "Paul Vallas", opponent_label: "Moderate", opponent_pct: 37.6 },
      "2019": { winner: "Lori Lightfoot", winner_label: "Reform", winner_pct: 79.8, opponent: "Toni Preckwinkle", opponent_label: "Establishment", opponent_pct: 20.2 },
    },
    referendums: [
      { question: "Elected School Board", year: 2024, yes_pct: 58, no_pct: 42, passed: true },
      { question: "Bring Chicago Home", year: 2024, yes_pct: 46, no_pct: 54, passed: false },
      { question: "Broadband Access", year: 2020, yes_pct: 71, no_pct: 29, passed: true },
      { question: "City Plan Goals", year: 2020, yes_pct: 74, no_pct: 26, passed: true },
      { question: "Firearm Restrictions", year: 2020, yes_pct: 77, no_pct: 23, passed: true },
      { question: "Preserve ACA", year: 2018, yes_pct: 82, no_pct: 18, passed: true },
      { question: "Bump Stock Ban", year: 2018, yes_pct: 84, no_pct: 16, passed: true },
    ],
    classification: "Strongly Democratic",
    avg_dem_margin: 72.7,
    trend: "Trending more Republican",
    data_sources: ["Chicago Board of Election Commissioners", "Illinois State Board of Elections"],
    notes: "",
    last_updated: "2025-01-01",
  },
  // Test-only records exercise multiple religion groups. The production route currently
  // searches Google Places; its response has no source field, so the UI's real fallback is Google Places.
  placesOfWorshipData: {
    totalCount: 5,
    radiusMiles: 1,
    places: [
      { id: "fixture-christian-1", name: "Fixture Parish One", religion: "christian", denomination: null, address: "100 Fixture Street" },
      { id: "fixture-christian-2", name: "Fixture Parish Two", religion: "christian", denomination: null, address: "200 Fixture Street" },
      { id: "fixture-muslim-1", name: "Fixture Islamic Center", religion: "muslim", denomination: null, address: "300 Fixture Street" },
      { id: "fixture-jewish-1", name: "Fixture Synagogue", religion: "jewish", denomination: null, address: "400 Fixture Street" },
      { id: "fixture-spiritual-1", name: "Fixture Meditation Center", religion: "spiritualist", denomination: null, address: "500 Fixture Street" },
    ],
  },
};

const moduleSource = `
import React from "${reactPath}";
import ReactDOM from "${rootPath}";
const { createRoot } = ReactDOM;
import { AccordionSection, KypSubhead, SectionNumberContext } from "/src/components/report/AccordionSection.tsx";
import { Skeleton } from "/src/components/ui/skeleton.tsx";
${numberingHelper.getText(accordionAst)}
${runHelpers.get("DEMOGRAPHIC_FAVORABILITY")}
${runHelpers.get("demographicChangeClass")}
const motion = { div: ({ initial, animate, transition, ...props }) => React.createElement("div", props) };
const Info = () => null;
const base = ${JSON.stringify(fixture).replaceAll("<", "\\u003c")};
function Fixture(props) {
  const facts = props.facts ?? base.facts;
  const languageData = props.languageData ?? base.languageData;
  const languageZipData = props.languageZipData ?? base.languageZipData;
  const censusACSData = props.censusACSData ?? base.censusACSData;
  const lodesData = props.lodesData ?? base.lodesData;
  const electionData = props.electionData ?? base.electionData;
  const placesOfWorshipData = props.placesOfWorshipData ?? base.placesOfWorshipData;
  const sectionIndex = props.sectionIndex ?? base.sectionIndex;
  const [languagesViewMode, setLanguagesViewMode] = React.useState("zip");
  const [demoViewMode, setDemoViewMode] = React.useState("zip");
  window.fixtureControls = { setLanguagesViewMode, setDemoViewMode };
  const isLoadingLanguageZip = false, isLoadingLanguage = false, isLoadingCensusACS = false;
  const isLoadingLodes = false, isLoadingElection = false, isLoadingPlacesOfWorship = false;
  ${peopleSubsectionsSource}
  const accProps = () => ({
    id: "people", index: sectionIndex, order: sectionIndex, eyebrow: "Neighborhood & People",
    takeaway: "Fixture data for browser regression checks.", verdict: "context", open: true, onToggle: () => {},
  });
  return ${peopleSection};
}
const root = createRoot(document.getElementById("root"));
let revision = 0;
window.renderFixture = (overrides = {}) => root.render(React.createElement(Fixture, { ...base, ...overrides, key: ++revision }));
window.renderFixture();
`;
const compiled = await transform(moduleSource, {
  loader: "tsx",
  jsxFactory: "React.createElement",
  jsxFragment: "React.Fragment",
});

const entry = /<script\b[^>]*src="[^"]*\/src\/main\.tsx[^"]*"[^>]*><\/script>/;
assert(entry.test(viteHtml), "Vite HTML entry not found");
const html = viteHtml.replace(entry, () => `<script type="module">${compiled.code}</script>`)
  .replace('<div id="root"></div>', '<div id="root" class="test-container subsection-text"></div>')
  .replace("</head>", `<link rel="stylesheet" href="/src/index.css?direct"><link rel="stylesheet" href="/src/kyp-base.css?direct">
<style>body{background:#faf9f6;margin:0}.test-container{max-width:1080px;padding:24px;margin:0 auto}@media(max-width:600px){.test-container{padding:12px}}</style></head>`);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", (error) => { errors.push(error.message); console.error("Browser:", error.message); });
await page.route("**/step25b-people-check", (route) =>
  route.fulfill({ status: 200, contentType: "text/html", body: html }));

try {
  await page.goto(`${origin}/step25b-people-check`);
  await page.locator("#section-people .kyp-subhead").first().waitFor();
  await page.waitForTimeout(500);
  const people = page.locator("#section-people");
  const worshipCssContext = await people.locator("#print-section-worship").evaluate((section) => ({
    hasSchoolBoxAncestor: section.closest(".schbox") !== null,
    productionIndexCssLoaded: [...document.styleSheets].some((sheet) => {
      if (!sheet.href) return false;
      const url = new URL(sheet.href);
      return url.pathname === "/src/index.css" && url.searchParams.has("direct");
    }),
  }));
  assert.equal(worshipCssContext.hasSchoolBoxAncestor, false,
    "The AST-extracted worship subtree must not gain a synthetic .schbox ancestor");
  assert.equal(worshipCssContext.productionIndexCssLoaded, true,
    "Worship styling is checked against the production global index.css");

  async function worshipLayoutSnapshot() {
    return people.locator("#print-section-worship").evaluate((section) => {
      const rect = (element) => {
        const { left, right, top, bottom, width } = element.getBoundingClientRect();
        return { left, right, top, bottom, width };
      };
      return {
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        rows: [...section.querySelectorAll(".srow.step23-list-row")].map((row) => {
          const name = row.querySelector(".step23-name");
          const meta = row.querySelector(".step23-meta");
          const rowStyle = getComputedStyle(row);
          const nameStyle = getComputedStyle(name);
          const metaStyle = getComputedStyle(meta);
          return {
            display: rowStyle.display,
            flexWrap: rowStyle.flexWrap,
            paddingTop: rowStyle.paddingTop,
            paddingBottom: rowStyle.paddingBottom,
            borderBottomWidth: rowStyle.borderBottomWidth,
            borderBottomStyle: rowStyle.borderBottomStyle,
            borderBottomColor: rowStyle.borderBottomColor,
            scrollWidth: row.scrollWidth,
            clientWidth: row.clientWidth,
            rect: rect(row),
            name: {
              fontSize: nameStyle.fontSize,
              fontWeight: nameStyle.fontWeight,
              color: nameStyle.color,
              rect: rect(name),
            },
            meta: {
              fontSize: metaStyle.fontSize,
              color: metaStyle.color,
              flexBasis: metaStyle.flexBasis,
              rect: rect(meta),
            },
          };
        }),
        groups: [...section.querySelectorAll(".subwrap > .kyp-subhead")].map((header) => {
          const count = header.querySelector(".ct");
          return {
            countText: count.innerText.trim(),
            countMarginLeft: getComputedStyle(count).marginLeft,
            countTextAlign: getComputedStyle(count).textAlign,
            headerRect: rect(header),
            countRect: rect(count),
          };
        }),
      };
    });
  }

  function assertWorshipLayout(snapshot, context, { mobile = false } = {}) {
    assert.equal(snapshot.rows.length, fixture.placesOfWorshipData.places.length,
      `${context}: all production worship rows are styled`);
    for (const row of snapshot.rows) {
      assert.equal(row.display, "flex", `${context}: worship row uses flex layout`);
      assert.equal(row.flexWrap, "wrap", `${context}: worship row can wrap`);
      assert.equal(row.paddingTop, "9px", `${context}: worship row has 9px top padding`);
      assert.equal(row.paddingBottom, "9px", `${context}: worship row has 9px bottom padding`);
      assert.equal(row.borderBottomWidth, "1px", `${context}: worship row has a fine bottom rule`);
      assert.equal(row.borderBottomStyle, "solid", `${context}: worship bottom rule is solid`);
      assert.equal(row.borderBottomColor, "rgb(240, 238, 231)", `${context}: worship bottom rule uses #f0eee7`);
      assert.equal(row.name.fontSize, "13.5px", `${context}: worship names use school-list sizing`);
      assert.equal(row.name.fontWeight, "600", `${context}: worship names are bold`);
      assert.equal(row.meta.fontSize, "11.5px", `${context}: worship addresses use the smaller metadata size`);
      assert.notEqual(row.meta.color, row.name.color,
        `${context}: worship addresses are muted relative to names`);
      assert.ok(row.name.rect.width > 0 && row.meta.rect.width > 0,
        `${context}: names and addresses have separate visible boxes`);
      assert.ok(row.scrollWidth <= row.clientWidth + 1,
        `${context}: worship row content does not overflow its own width`);
    }
    assert.equal(snapshot.groups.length, 4, `${context}: each religion group has a heading`);
    for (const group of snapshot.groups) {
      // Flex auto margins resolve to pixel widths; verify alignment from rendered geometry.
      assert.equal(group.countTextAlign, "right", `${context}: religion count text is right-aligned`);
      assert.ok(Math.abs(group.countRect.right - group.headerRect.right) <= 1.5,
        `${context}: religion count aligns with the right edge of its heading`);
    }

    if (mobile) {
      assert.ok(snapshot.documentWidth <= snapshot.viewportWidth,
        `${context}: the page has no horizontal overflow`);
      for (const row of snapshot.rows) {
        assert.equal(row.meta.flexBasis, "100%", `${context}: address takes a full flex line`);
        assert.ok(row.meta.rect.top >= row.name.rect.bottom - 0.5,
          `${context}: address wraps beneath, rather than concatenating with, its name`);
        assert.ok(row.rect.left >= 0 && row.rect.right <= snapshot.viewportWidth,
          `${context}: worship row stays within the viewport`);
      }
    } else {
      let sameLineRows = 0;
      for (const row of snapshot.rows) {
        const sameLine = row.name.rect.top < row.meta.rect.bottom
          && row.meta.rect.top < row.name.rect.bottom;
        if (sameLine) {
          sameLineRows += 1;
          assert.ok(row.meta.rect.left - row.name.rect.right >= 8,
            `${context}: adjacent name and address have a visible 8px gap`);
        }
      }
      assert.ok(sameLineRows > 0, `${context}: desktop keeps at least one name and address on the same line`);
    }
  }

  assert.equal(await people.locator(".kyp-src").count(), 5, "Exactly one source footer per subsection");
  assert.deepEqual(await people.locator(".kyp-subhead .n").allTextContents(), ["25.1", "25.2", "25.3", "25.4", "25.5"]);
  assert.equal(await people.locator(".kyp-scopenote,.kyp-blocks.hero,.kyp-cxtile,.kyp-block.dark,.kyp-loanrow").count(), 0,
    "Removed scope notes, hero/cxtile/dark/loan-row markup");
  assert.doesNotMatch(await people.innerText(), /Consider bilingual signage|translation services|Note:\s*\d+% have limited English proficiency/i,
    "The bilingual-signage recommendation must stay removed");
  assert.equal(await people.locator("#print-section-worship .kyp-blocks").count(), 0, "No duplicate worship-total block");
  assert.equal(await people.locator("#print-section-worship .ct").first().innerText(), "5 within 1 mile",
    "Worship total appears only in the subhead counter-text");

  const sourceFooters = () => people.locator(".kyp-src").allTextContents();
  let footers = (await sourceFooters()).map((text) => text.replace(/\s+/g, " ").trim());
  assert.match(await people.locator("#print-section-languages .kyp-subhead .ct").innerText(), /^ZIP 60612$/);
  assert.match(footers[0], /Describes ZIP 60612, not this address\..*by ZIP Code/);
  assert.match(await people.locator("#print-section-demographics .kyp-subhead .ct").innerText(), /^ZIP 60612 · 2014–2018 vs 2019–2023$/);
  assert.match(footers[1], /Describes ZIP 60612, not this address\./);
  const daytimeHeading = people.locator(".kyp-subhead").filter({ hasText: "Daytime Economy" });
  assert.equal(await daytimeHeading.count(), 1, "Find the Daytime Economy heading by its production label");
  assert.match(await daytimeHeading.locator(".ct").innerText(), /^Census Tract 17031242900$/);
  assert.match(footers[2], /Describes Census Tract 17031242900, not this address\..*LODES8\), 2021/);
  assert.match(await people.locator("#print-section-political .kyp-subhead .ct").innerText(), /^Community Area West Town · not rated$/);
  assert.match(footers[3], /Describes Community Area West Town, not this address\..*Chicago Board of Election Commissioners.*reported, not rated/);
  assert.match(footers[4], /Describes places within 1 mile of this address\..*Source: Google Places\./);
  await page.getByTestId("tab-languages-community").click();
  await page.getByTestId("button-demographics-tract").click();
  footers = (await sourceFooters()).map((text) => text.replace(/\s+/g, " ").trim());
  assert.equal(await people.locator("#print-section-languages .kyp-subhead .ct").innerText(), "West Town");
  assert.equal(await people.locator("#print-section-languages .kyp-blocks.two .bv").first().innerText(), "34.8%",
    "Neighborhood mode selects the community-area language record");
  assert.match(footers[0], /Describes West Town, not this address\..*by Community Area/);
  assert.equal(await people.locator("#print-section-demographics .kyp-subhead .ct").innerText(),
    "Census Tract 17031242900 · 2014–2018 vs 2019–2023");
  assert.equal(await people.locator("#print-section-demographics tbody tr").first().locator("td").nth(2).innerText(), "12,345",
    "Tract mode selects the separate tract ACS record");
  assert.match(footers[1], /Describes Census Tract 17031242900, not this address\./);
  await page.getByTestId("tab-languages-zip").click();
  await page.getByTestId("button-demographics-zip").click();
  await page.waitForTimeout(100);
  assert.equal(await people.locator("#print-section-languages .kyp-blocks.two .bv").first().innerText(), "27.5%");
  assert.equal(await people.locator("#print-section-demographics tbody tr").first().locator("td").nth(2).innerText(), "34,699");

  assert.equal(await people.locator("#print-section-languages .kyp-hbar").count(), fixture.languageZipData.topLanguages.length,
    "Top-language horizontal bar inventory");
  assert.equal(await people.locator("#print-section-demographics table.kyp-dtab").count(), 1, "One demographic table");
  assert.equal(await people.locator("#print-section-demographics tbody tr").count(), 18, "All demographic fixture rows render");
  assert.equal(await people.locator('[data-testid="section-lodes"] .kyp-hbar.wide').count(), 4, "Four jobs-by-industry bars");
  assert.equal(await people.locator("#print-section-political .kyp-votebar").count(), 3, "Three presidential stacked bars");
  assert.equal(await people.locator("#print-section-political .kyp-mixcard").count(), 2, "Two mayoral runoff cards");
  assert.equal(await people.locator("#print-section-political .kyp-refrow").count(), 7, "Seven referendum rows");
  assert.equal(await people.locator("#print-section-worship .subwrap").count(), 4, "One worship list grouped by religion");
  assert.equal(await people.locator("#print-section-worship .srow.step23-list-row").count(), fixture.placesOfWorshipData.places.length,
    "Every worship fixture appears as a school-style list row");
  assert.equal(await people.locator("#print-section-worship .kyp-charttitle").count(), 0, "Worship remains a list, not a chart");

  const subheadNumbers = await people.locator(".kyp-subhead .n").allTextContents();
  assert.deepEqual(subheadNumbers, ["25.1", "25.2", "25.3", "25.4", "25.5"]);
  await page.evaluate(() => window.renderFixture({ sectionIndex: 7 }));
  await page.waitForTimeout(100);
  assert.deepEqual(await people.locator(".kyp-subhead .n").allTextContents(), ["07.1", "07.2", "07.3", "07.4", "07.5"],
    "Subsection numbering follows production buildSubsectionNumbers and its parent section index");
  await page.evaluate(() => window.renderFixture());
  await page.waitForTimeout(150);

  const phraseSizes = await people.locator(".kyp-block .bv.txt").evaluateAll((els) =>
    els.map((el) => getComputedStyle(el).fontSize));
  assert.deepEqual(phraseSizes, ["24px", "24px"], "Linguistic and voting phrases use 24px text sizing");
  const daytime = people.locator('[data-testid="section-lodes"] .kyp-blocks.four');
  assert.equal(await daytime.locator(":scope > .kyp-block").count(), 4);
  assert.equal(await daytime.locator(":scope > .kyp-block.ind").count(), 1, "Daytime headline block uses ind tone");
  assert.equal(await daytime.locator(":scope > .kyp-block.slate").count(), 3, "Daytime supporting blocks use slate tone");
  const daytimeStructure = await daytime.locator(":scope > .kyp-block").evaluateAll((blocks) => blocks.map((block) => {
    const children = [...block.children];
    const boxes = children.map((child) => child.getBoundingClientRect());
    return {
      classes: block.className,
      childClasses: children.map((child) => child.className),
      fontSize: getComputedStyle(children.find((child) => child.classList.contains("bv"))).fontSize,
      stacked: boxes.length === 3 && boxes[0].top < boxes[1].top && boxes[1].top < boxes[2].top,
    };
  }));
  for (const tile of daytimeStructure) {
    assert.deepEqual(tile.childClasses, ["bv", "bl", "bd"], "Each daytime tile orders value, label, detail");
    assert.equal(tile.fontSize, "36px", "Daytime numbers use the shared numeric size");
    assert.equal(tile.stacked, true, "Daytime value, label, and detail each occupy a separate line");
    assert.match(tile.classes, /(?:^|\s)(?:ind|slate)(?:\s|$)/);
    assert.doesNotMatch(tile.classes, /dark|indigo/);
  }
  const toneComparison = await people.evaluate(() => ({
    daytimeInd: getComputedStyle(document.querySelector('[data-testid="section-lodes"] .kyp-block.ind')).backgroundColor,
    languageInd: getComputedStyle(document.querySelector("#print-section-languages .kyp-block.ind")).backgroundColor,
    daytimeSlate: [...document.querySelectorAll('[data-testid="section-lodes"] .kyp-block.slate')].map((el) => getComputedStyle(el).backgroundColor),
    languageSlate: getComputedStyle(document.querySelector("#print-section-languages .kyp-block.slate")).backgroundColor,
  }));
  assert.equal(toneComparison.daytimeInd, toneComparison.languageInd, "Daytime indigo matches the section headline indigo tone");
  assert.deepEqual(toneComparison.daytimeSlate, Array(3).fill(toneComparison.languageSlate),
    "Every daytime supporting tile matches the section's slate tone");
  assert.match(await people.locator("#print-section-languages .kyp-blocks.two .bv").first().evaluate((el) => getComputedStyle(el).fontSize), /^36px$/,
    "Numeric blocks retain the 36px numeral size");
  const noHighEarners = structuredClone(fixture.lodesData);
  noHighEarners.highEarners = 0;
  await page.evaluate((lodesData) => window.renderFixture({ lodesData }), noHighEarners);
  await page.waitForTimeout(100);
  assert.equal(await people.locator('[data-testid="section-lodes"] .kyp-blocks.four > .kyp-block').count(), 3,
    "Higher-earning tile drops out when highEarners is zero");
  await page.evaluate(() => window.renderFixture());
  await page.waitForTimeout(150);

  const groups = people.locator("#print-section-worship .subwrap");
  const groupHeaders = groups.locator(":scope > .kyp-subhead");
  assert.equal(await groupHeaders.count(), 4);
  assert.equal(await groupHeaders.nth(0).evaluate((el) => el.classList.contains("first")), true,
    "Only the first worship group suppresses its top rule");
  for (let index = 0; index < await groupHeaders.count(); index += 1) {
    const heading = groupHeaders.nth(index);
    assert.equal(await heading.locator(".n").count(), 0, "Worship group heads are not numbered subsections");
    assert.match(await heading.locator(".ct").innerText(), /^\d+$/, "Religion group count is a bare number");
    if (index > 0) assert.equal(await heading.evaluate((el) => el.classList.contains("first")), false);
  }
  assert.equal(await people.locator("#print-section-worship .step23-distance").count(), 0, "No unsupported worship distance is invented");
  const worshipLinks = people.locator("#print-section-worship .step23-name");
  assert.equal(await worshipLinks.count(), fixture.placesOfWorshipData.places.length);
  for (const place of fixture.placesOfWorshipData.places) {
    const row = people.getByTestId(`row-worship-${place.id}`);
    const link = row.locator("a.step23-name");
    assert.equal(await link.innerText(), place.name, `Keep the fixture name for ${place.id}`);
    assert.equal(await row.locator(".step23-meta").innerText(), place.address,
      `Keep the fixture address for ${place.id}`);
    assert.equal(await link.getAttribute("href"),
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.name} Chicago IL`)}`);
    assert.equal(await link.getAttribute("target"), "_blank");
    assert.equal(await link.getAttribute("rel"), "noopener noreferrer");
  }
  const worshipFooter = people.locator("#print-section-worship .kyp-src");
  assert.match(await worshipFooter.innerText(), /Source: Google Places\./,
    "Keep the production Places attribution; do not copy the OSM attribution from the visual mock");
  assert.equal(await worshipFooter.evaluate((footer) => {
    const groups = footer.parentElement.querySelectorAll(".subwrap");
    const lastGroup = groups[groups.length - 1];
    return !!lastGroup && Boolean(lastGroup.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING);
  }), true, "The worship footer follows the final religion group");
  assert.deepEqual(await groupHeaders.locator(".lbl").allTextContents(),
    ["Christian", "Muslim", "Jewish", "Spiritualist / Meditation"],
    "Production religion grouping and ordering remain unchanged");
  assert.deepEqual(await groupHeaders.locator(".ct").allTextContents(), ["2", "1", "1", "1"],
    "Religion counts continue to reflect the original worship fixture");
  await page.evaluate((placesOfWorshipData) => window.renderFixture({ placesOfWorshipData }), {
    ...fixture.placesOfWorshipData,
    source: "Fixture-provided source attribution",
  });
  await page.waitForTimeout(100);
  assert.match(await people.locator("#print-section-worship .kyp-src").innerText(),
    /Source: Fixture-provided source attribution\./, "Honor source metadata rather than hard-coding the mock's OSM label");
  await page.evaluate(() => window.renderFixture());
  await page.waitForTimeout(150);

  assertWorshipLayout(await worshipLayoutSnapshot(), "Desktop worship styling");
  await people.locator("#print-section-worship").screenshot({ path: "/tmp/worship-styling-desktop.png" });
  await page.emulateMedia({ media: "print" });
  const printWorshipStyles = await people.locator("#print-section-worship .srow.step23-list-row").evaluateAll((rows) =>
    rows.map((row) => {
      const name = row.querySelector(".step23-name");
      const style = getComputedStyle(name);
      return {
        display: getComputedStyle(row).display,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
      };
    }));
  assert.equal(printWorshipStyles.length, fixture.placesOfWorshipData.places.length,
    "All worship rows remain present in print media");
  for (const style of printWorshipStyles) {
    assert.equal(style.display, "flex", "Worship rows remain flex rows in print media");
    assert.equal(style.fontSize, "13.5px", "Worship names retain 13.5px styling in print media");
    assert.equal(style.fontWeight, "600", "Worship names remain bold in print media");
  }
  await page.emulateMedia({ media: "screen" });

  assert.deepEqual(errors, []);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "/tmp/step25b-people-desktop-top.png" });
  await page.screenshot({ path: "/tmp/step25b-people-desktop-full.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  assertWorshipLayout(await worshipLayoutSnapshot(), "Mobile worship styling", { mobile: true });
  const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  await page.screenshot({ path: "/tmp/step25b-people-mobile-top.png" });
  await page.screenshot({ path: "/tmp/step25b-people-mobile-full.png", fullPage: true });
  await people.locator("#print-section-worship").screenshot({ path: "/tmp/worship-styling-mobile.png" });
  assert.equal(mobileOverflow, false, "No mobile horizontal overflow (including the existing wide demographics table)");
  console.log("Step25b browser checks passed: dynamic numbering, scope toggles/footers, section inventory, daytime tiles, worship list/attribution, and mobile width.");
} finally {
  await browser.close();
}