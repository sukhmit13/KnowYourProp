// Browser regression check using the production market JSX, not a hand-built mock.
// Run against the managed development workflow: node scripts/verify_step26_market.mjs
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import ts from "typescript";
import { transform } from "esbuild";
import { chromium } from "playwright";

const origin = process.env.STEP26_ORIGIN || `https://${process.env.REPLIT_DEV_DOMAIN}`;
const source = await fs.readFile("client/src/pages/RunDetail.tsx", "utf8");
const ast = ts.createSourceFile("RunDetail.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let market;
function visit(node) {
  if (ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === "AccordionSection"
    && node.openingElement.attributes.getText(ast).includes('accProps("market")')) market = node.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
assert(market, "Production market section not found");
function helper(name) {
  const node = ast.statements.find((item) => ts.isFunctionDeclaration(item) && item.name?.text === name);
  assert(node, `Missing production helper ${name}`);
  return node.getText(ast);
}
async function get(path) {
  const response = await fetch(`${origin}${path}`, { signal: AbortSignal.timeout(60000) });
  assert(response.ok, `${path}: HTTP ${response.status}`);
  return response;
}
const [hmdaData, sbaLoansData, hmdaModule, mainModule, hooksModule, viteHtml] = await Promise.all([
  get("/api/hmda-stats?communityArea=WEST%20TOWN&tract=17031242900").then((r) => r.json()),
  get("/api/sba-loans?zip=60612").then((r) => r.json()),
  get("/src/components/HMDAStats.tsx").then((r) => r.text()),
  get("/src/main.tsx").then((r) => r.text()),
  get("/src/hooks/use-runs.ts").then((r) => r.text()),
  get("/").then((r) => r.text()),
]);
const reactPath = hmdaModule.match(/from "([^"]*\/react\.js\?[^"]+)"/)?.[1];
const rootPath = mainModule.match(/from "([^"]*\/react-dom_client\.js\?[^"]+)"/)?.[1];
const queryPath = hooksModule.match(/from "([^"]*\/@tanstack_react-query\.js\?[^"]+)"/)?.[1];
assert(reactPath && rootPath && queryPath, "Vite dependency paths not found");
const fixture = {
  sectionIndex: 19,
  facts: { communityArea: "West Town", tractGeoid: "17031242900", zipCode: "60612", zoning: "RS-3" },
  hmdaData, sbaLoansData,
  transactionTrendsData: { years: [2022, 2023, 2024, 2025].map((year, index) => ({
    year, singleFamily: 190 - index * 3, unit2to4: 90 - index * 2,
    condo: 250 + index * 9, commercial: 30 + index * 2,
    medianPrice: { singleFamily: 750000, unit2to4: 825000, condo: 485000, commercial: 1400000 },
  })) },
  compsData: {
    comparables: Array.from({ length: 5 }, (_, index) => ({
      pin: `1703124000000${index}`, address: `${100 + index} Fixture Street`,
      saleDate: "2025-06-15", salePrice: 720000 + index * 10000, sqft: 2500,
      beds: 3, fullBaths: 2, halfBaths: 0, propertyClass: "203",
      distanceMiles: 0.1 + index * 0.1, pricePerSqft: 288 + index * 4, similarityScore: 92 - index,
    })),
    marketAnalysis: { estimatedValue: 742500, medianSalePrice: 725000, medianPricePerSqft: 293,
      priceRange: { low: 700000, high: 790000 }, basedOnComps: 5, confidence: "High" },
    searchParams: { radiusMiles: 0.75, monthsBack: 18, propertyClass: "203" },
    rawSalesCount: 30, matchedCharacteristics: 25, geocodedSalesCount: 20, nearbySalesCount: 5,
    totalCandidates: 30, error: null,
  },
};
const module = `
import React from "${reactPath}";
import ReactDOM from "${rootPath}";
const { useContext } = React;
const { createRoot } = ReactDOM;
import { QueryClient, QueryClientProvider } from "${queryPath}";
import { AccordionSection, KypSubhead, SectionNumberContext } from "/src/components/report/AccordionSection.tsx";
import { HMDAFinancingStats, HMDABuyerProfile, HMDALenders, HMDAMarketMixPanel } from "/src/components/HMDAStats.tsx";
import { SBAKpiStrip, SBALoansView } from "/src/components/SBALoansView.tsx";
import { ComparableSalesView } from "/src/components/ComparableSalesView.tsx";
import { Skeleton } from "/src/components/ui/skeleton.tsx";
const motion = { div: ({initial,animate,transition,...props}) => React.createElement("div",props) };
${helper("HMDAResidentialFooter")}
${helper("parseTransactionCount")}
function Fixture({facts,hmdaData,sbaLoansData,transactionTrendsData,compsData,sectionIndex}) {
  const isLoadingHmda=false, isLoadingTransactionTrends=false, isTransactionTrendsError=false;
  const isLoadingComps=false, isLoadingSBALoans=false, isSBALoansError=false, isLoadingZoning=false;
  const compPropertyClass="203", pinLookupData={characteristicsData:{buildingSf:2500}}, zoningInfo={category:"residential"};
  const refetchTransactionTrends=()=>{}, refetchSBALoans=()=>{}, newsFmtD=(date)=>date;
  const accProps=()=>({id:"market",index:sectionIndex,order:sectionIndex,eyebrow:"Mortgage & Lending Market",
    takeaway:"Live market records.",verdict:"context",open:true,onToggle:()=>{}});
  return ${market};
}
const base=${JSON.stringify(fixture).replaceAll("<", "\\u003c")};
const root=createRoot(document.getElementById("root"));
const queryClient=new QueryClient({defaultOptions:{queries:{retry:false,queryFn:async({queryKey})=>(await fetch(queryKey[0])).json()}}});
let revision=0;
window.renderFixture=(overrides={})=>root.render(React.createElement(QueryClientProvider,{client:queryClient},React.createElement(Fixture,{...base,...overrides,key:++revision})));
window.renderFixture();
`;
const compiled = await transform(module, { loader: "tsx", jsxFactory: "React.createElement", jsxFragment: "React.Fragment" });
// Retain Vite's generated React Refresh preamble and dependency setup.
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
await page.route("**/step26-check", (route) => route.fulfill({ status: 200, contentType: "text/html", body: html }));
try {
  await page.goto(`${origin}/step26-check`);
  await page.getByTestId("stat-hmda-originated").waitFor();
  await page.waitForTimeout(700);
  assert.equal(await page.getByTestId("stat-hmda-originated").getAttribute("aria-pressed"), "true");
  assert.equal(await page.locator(".recharts-pie").count(), 10, "All original donut panels remain");
  assert.equal((await page.locator(".kyp-hmda-panel .mh").allTextContents()).filter((text) => /Property Value|Denial Reasons/.test(text)).length, 2);
  assert.equal(await page.locator("#hmda-lenders").count(), 1);
  assert.equal(await page.locator(".kyp-charttitle").filter({ hasText: /lenders.*ranked by loans closed/ }).count(), 2);
  assert.equal(await page.locator("#tt-chart").count(), 1);
  assert.equal(await page.locator(".cmp-card").count(), 5);
  assert.equal(await page.locator(".kyp-src").count(), 3);
  assert.equal(await page.locator(".ttfoot").count(), 1);
  assert.equal(await page.locator(".kyp-scopenote,.chtitle,.kyp-loan-scope,.kyp-medrow,.yoyhd").count(), 0);
  assert.deepEqual(await page.locator(".kyp-subhead .n").allTextContents(), Array.from({ length: 8 }, (_, i) => `19.${i + 1}`));
  assert.equal(await page.locator('[data-testid^="row-hmda-lender-"]').count(), hmdaData[2025].community.byLender.length);
  assert.equal(await page.locator('[data-testid^="button-hmda-year-"]').count(), 3);
  await page.getByTestId("stat-hmda-denied").click();
  assert.match((await page.locator(".kyp-subhead .ct").allTextContents())[1], /denied applications/i);
  assert.match((await page.locator(".kyp-subhead .ct").allTextContents())[2], /applicants who were denied/i);
  assert.match((await page.locator(".kyp-subhead .ct").allTextContents())[3], /ranked by applications denied/i);
  assert.notEqual(await page.getByTestId("stat-hmda-denied").evaluate((el) => getComputedStyle(el).outlineWidth), "0px");
  await page.getByTestId("button-hmda-year-2024").click();
  assert.match(await page.getByTestId("stat-hmda-total").innerText(), new RegExp(hmdaData[2024].community.total.toLocaleString("en-US")));
  assert.equal(await page.locator(".kyp-blocks.two:not(.hero) .bv").first().innerText(), `#${hmdaData[2024].communityRank.byTotal.rank}`);
  await page.getByTestId("button-hmda-year-2023").click();
  assert.equal(await page.locator(".kyp-blocks.two:not(.hero) .bv").first().innerText(), `#${hmdaData[2023].communityRank.byTotal.rank}`);
  await page.getByTestId("button-hmda-year-2024").click();
  await page.getByTestId("button-hmda-scope-tract").click();
  assert.match(await page.locator(".kyp-src").first().innerText(), /Census Tract 17031242900/);
  assert.doesNotMatch(await page.locator(".kyp-src").first().innerText(), /Community Area West Town/);
  assert.match(await page.getByTestId("stat-hmda-total").innerText(), new RegExp(hmdaData[2024].tract.total.toLocaleString("en-US")));
  assert.equal(await page.locator(".kyp-blocks.two:not(.hero) .bv").first().innerText(), `#${hmdaData[2024].tractRank.byTotal.rank}`);
  await page.evaluate(() => window.renderFixture({ sectionIndex: 7 }));
  await page.waitForTimeout(200);
  assert.equal(await page.locator(".kyp-subhead .n").first().innerText(), "07.1");
  assert.match(await page.locator(".kyp-src").first().innerText(), /07\.1–07\.4/);
  const tractOnly = structuredClone(hmdaData);
  for (const year of [2025, 2024, 2023]) tractOnly[year].community = null;
  await page.evaluate((data) => window.renderFixture({ hmdaData: data, facts: { tractGeoid: "17031242900", zipCode: "60612" } }), tractOnly);
  await page.waitForTimeout(200);
  assert.match(await page.locator(".kyp-subhead .ct").first().innerText(), /Census Tract/i);
  const missing = structuredClone(hmdaData);
  missing[2025].communityRank.byTotal.rank = null;
  missing[2025].communityRank.byTotal.count = null;
  await page.evaluate((data) => window.renderFixture({ hmdaData: data }), missing);
  await page.waitForTimeout(200);
  assert.equal(await page.locator(".kyp-blocks.two:not(.hero) .kyp-block").count(), 2);
  assert.match(await page.locator(".kyp-blocks.two:not(.hero)").innerText(), /unavailable/i);
  await page.evaluate(() => window.renderFixture({ transactionTrendsData: { years: [
    { year: 2024, singleFamily: null, unit2to4: "", condo: undefined, commercial: " " },
    { year: 2025, singleFamily: null, unit2to4: "", condo: undefined, commercial: " " },
  ] } }));
  await page.waitForTimeout(200);
  assert.deepEqual(await page.locator(".ttbox .kyp-blocks.four .bv").allTextContents(), ["—", "—", "—", "—"]);
  assert.doesNotMatch(await page.locator("#print-section-transaction-trends").innerText(), /No qualifying property sales/);
  await page.evaluate(() => window.renderFixture());
  await page.waitForTimeout(600);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "/tmp/step26-market-desktop.png", fullPage: true });
  await page.screenshot({ path: "/tmp/step26-market-desktop-top.png" });
  await page.locator("#print-section-transaction-trends").screenshot({ path: "/tmp/step26-market-trends.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "No mobile horizontal overflow");
  await page.screenshot({ path: "/tmp/step26-market-mobile.png", fullPage: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "/tmp/step26-market-mobile-top.png" });
  assert.deepEqual(errors, []);
  console.log("Step26 browser checks passed: controls, charts, footers, numbering, scope/year, unavailable ranks, missing counts, mobile.");
} finally {
  await browser.close();
}