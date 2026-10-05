import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";

// Real report components, served by Vite, with isolated fixture props.
// Browser interception is test-only: no app route or authentication bypass.
const origin = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const [shell, hooks, main] = await Promise.all(
  ["/", "/src/hooks/use-runs.ts", "/src/main.tsx"].map(p => fetch(origin + p).then(r => r.text())),
);
const react = hooks.match(/["'](\/[^"']*node_modules\/\.vite\/deps\/react\.js[^"']*)["']/)?.[1];
const query = hooks.match(/["'](\/[^"']*node_modules\/\.vite\/deps\/@tanstack_react-query\.js[^"']*)["']/)?.[1];
const dom = main.match(/["'](\/[^"']*node_modules\/\.vite\/deps\/react-dom_client\.js[^"']*)["']/)?.[1];
assert.ok(react && query && dom, "Vite's real React dependencies are available");
const html = shell.replace(/<script[^>]+src="\/src\/main\.tsx[^"]*"[^>]*><\/script>/, "")
  .replace("</body>", '<script type="module" src="/valuation-fixture-entry.js"></script></body>');
const entry = `
import React from ${JSON.stringify(react)};
import ReactDOM from ${JSON.stringify(dom)};
import {QueryClient,QueryClientProvider} from ${JSON.stringify(query)};
import "/src/kyp-base.css";
import {ValuationCalculator} from "/src/components/report/ValuationCalculator.tsx";
import {DaycareAnalysis} from "/src/components/report/DaycareAnalysis.tsx";
import {SectionNumberContext} from "/src/components/report/AccordionSection.tsx";
const e=React.createElement;
const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
const kind=new URLSearchParams(location.search).get("kind");
window.fixtureWrites=[];
function Fixture(){
 const [area,setArea]=React.useState(5600);
 const [listPrice,setListPrice]=React.useState(1110000);
 const [listRevenue,setListRevenue]=React.useState(1692600);
 const [market,setMarket]=React.useState(108000);
 const [tick,setTick]=React.useState(0);
 const [scenario,setScenario]=React.useState("100_efficient");
 const [revenueRate,setRevenueRate]=React.useState("2,275");
 window.fixtureRefresh=()=>{setArea(6200);setListPrice(1240000);setListRevenue(1840000);setMarket(120000);setTick(t=>t+1)};
 window.fixtureSetScenario=setScenario;
 const daycare=kind==="daycare";
 const business=kind==="business";
 const combined=kind==="combined"||daycare;
 const primary=kind==="primary";
 const rentals=primary||business||combined?[]:[{key:"market",label:"Market rent",annualRent:kind==="rental"?36000:market,source:"RentCast",basis:"market"}];
 const props={
  runId:1,isDaycare:daycare,buildingSqFt:area,buildingAreaSource:"County record",
  annualCountyTaxes:21400,annualInsuranceEstimate:12600,taxRecordLabel:"County bill",
  listingListPrice:listPrice,listingRevenue:listRevenue,rentalSources:rentals,
  initialLoanType:combined?"sba_biz_re":business?"sba_business":"conventional",
  initialFinancing:{businessPrice:"650,000",realEstatePrice:"1,110,000",businessDown:"10",businessTerm:"25",businessRate:"10.25",realEstateDown:"10",realEstateTerm:"25",realEstateRate:"6"},
  initialUnitCount:kind==="multi"?6:1,unitCountSource:"County record",
  dscrLoanEligible:!combined&&!business,commercialIncomeAllowed:combined,commercialOnly:combined,
  daycareScenarioKey:scenario,daycareRevenueRate:revenueRate,
  onSnapshot:snapshot=>{window.fixtureSnapshot=snapshot},
  onSavePrice:()=>{window.fixturePriceSaves=(window.fixturePriceSaves||0)+1},
  onUpdateProperty:async input=>{window.fixtureWrites.push(input);if(input.data.manualBuildingSqFt)setArea(input.data.manualBuildingSqFt)}
 };
 const siteProps={scope:"community_area",onScopeChange:()=>{},communityArea:"Fixture",areaData:null,
  enhancedData:null,capacityData:null,nearbyData:null,googleData:null,buildingSqFt:area,runId:1,
  buildingSource:"County record",daycareScenarioKey:scenario,onDaycareScenarioKeyChange:setScenario,
  daycareRevenueRate:revenueRate,onDaycareRevenueRateChange:setRevenueRate,updateProperty:props.onUpdateProperty};
 return e("main",{className:"kyp-section",style:{maxWidth:850,margin:"24px auto",padding:"24px",background:"#fff"}},
  e("h1",{},kind),daycare?e(SectionNumberContext.Provider,{value:17},e(DaycareAnalysis,siteProps)):null,
  e(SectionNumberContext.Provider,{value:36},e(ValuationCalculator,props)));
}
ReactDOM.createRoot(document.getElementById("root")).render(e(QueryClientProvider,{client},e(Fixture)));
`;

const browser = await chromium.launch({ headless: true });
await fs.mkdir("/tmp/valuation-rebuild-screens", { recursive: true });
try {
  const kinds = process.argv.slice(2);
  if (!kinds.length) kinds.push("primary", "rental", "multi", "business", "combined", "daycare");
  for (const kind of kinds) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/valuation-fixture-entry.js", r => r.fulfill({ contentType: "application/javascript", body: entry }));
    await page.route("**/valuation-fixture?*", r => r.fulfill({ contentType: "text/html", body: html }));
    await page.goto(`${origin}/valuation-fixture?kind=${kind}`);
    await page.getByText("Deal Inputs", { exact: true }).waitFor();
    await page.waitForFunction(() => !!window.fixtureSnapshot);
    const calc = page.getByTestId("valuation-calculator");
    assert.equal(await calc.locator(".kyp-calcsub").count(), 0);
    assert.ok(await calc.locator(".kyp-calchelp").count() <= 3);
    assert.ok(await page.locator(".kyp-dealgrid").count() > 0);
    assert.equal(await page.locator("select:not(.kyp-select)").count(), 0);
    const field = page.locator("input.kyp-input").first();
    assert.equal(await field.evaluate(el => getComputedStyle(el).textTransform), "none");
    const label = page.locator("label.kyp-field").first();
    assert.equal(await label.evaluate(el => getComputedStyle(el).textTransform), "uppercase");
    if (["primary", "rental", "multi", "combined"].includes(kind)) {
      const price = page.getByRole("textbox", { name: /^(Purchase price|Real estate price)/ });
      await price.fill("980000");
      await price.blur();
      assert.equal(await price.inputValue(), "980,000");
      await page.evaluate(() => window.fixtureRefresh());
      assert.equal(await price.inputValue(), "980,000", "listing refresh must not overwrite the entered price");
      assert.equal(await calc.getByText("From listing", { exact: true }).count(), 0);
    }
    if (kind === "business" || kind === "combined" || kind === "daycare") {
      assert.equal(await page.getByRole("textbox", { name: "Business purchase price" }).inputValue(), "650,000");
    }
    await calc.screenshot({ path: `/tmp/valuation-rebuild-screens/${kind}.jpg` });

    if (kind === "rental" || kind === "multi") {
      const source = page.getByRole("combobox", { name: "NOI source", exact: true });
      await source.selectOption("own_rent");
      const income = page.getByRole("textbox", { name: "Annual gross rent · manual", exact: true });
      await income.fill("1840000");
      await income.blur();
      assert.equal(await income.inputValue(), "1,840,000");
      await page.evaluate(() => window.fixtureRefresh());
      assert.equal(await income.inputValue(), "1,840,000", "refresh must not overwrite income");
      assert.ok(await page.locator(".kyp-ourest").count() > 0);
      await source.selectOption("market");
      await source.selectOption("own_rent");
      assert.equal(await income.inputValue(), "1,840,000", "switching sources preserves the manual draft");
      await income.fill("");
      await page.waitForFunction(() => window.fixtureSnapshot?.calculationComplete === false);
      assert.equal(await income.inputValue(), "");
      await page.getByRole("button", { name: "Use ours instead" }).click();
      assert.equal(await source.inputValue(), "market");
    }

    if (kind === "daycare") {
      const site = page.locator("#print-section-site-daycare-details");
      const scenario = page.getByRole("combobox", { name: "Daycare capacity and enrollment scenario" });
      assert.deepEqual(await scenario.locator("option").evaluateAll(options => options.map(o => o.value)),
        ["100_efficient", "75_efficient", "100_comfortable", "75_comfortable"]);
      await scenario.selectOption("75_comfortable");
      await page.waitForFunction(() => window.fixtureSnapshot?.noiSource.endsWith(":75_comfortable"));
      assert.equal(await site.locator(".kyp-block.grn,.kyp-block.red,.kyp-block.orange").count(), 0);
      await site.screenshot({ path: "/tmp/valuation-rebuild-screens/site-revenue.jpg" });
      const source = page.locator('select:has(option[value="own"])').last();
      await source.selectOption("own");
      const income = page.getByRole("textbox", { name: "Annual revenue · manual", exact: true });
      await income.fill("1840000");
      await income.blur();
      assert.equal(await income.inputValue(), "1,840,000");
      await scenario.selectOption("100_comfortable");
      assert.equal(await income.inputValue(), "1,840,000", "shared scenario changes do not overwrite manual revenue");
      await page.evaluate(() => window.fixtureRefresh());
      assert.equal(await income.inputValue(), "1,840,000");
      assert.ok(await page.locator(".kyp-ourest").count() > 0);
      await income.fill("");
      await page.waitForFunction(() => window.fixtureSnapshot?.calculationComplete === false);
      await page.getByRole("button", { name: "Use ours instead" }).click();
      const area = page.getByRole("textbox", { name: "Building square feet for daycare valuation" });
      await area.fill("0");
      await page.getByRole("button", { name: "Save building area" }).click();
      assert.equal(await page.evaluate(() => window.fixtureWrites.length), 0, "invalid building area must not save");
      await area.fill("6000");
      await area.blur();
      await page.getByRole("button", { name: "Save building area" }).click();
      await page.waitForFunction(() => window.fixtureWrites.some(w => w.data.manualBuildingSqFt === 6000));
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await calc.screenshot({ path: `/tmp/valuation-rebuild-screens/${kind}-mobile.jpg` });
    await calc.evaluate(el => scrollTo(0, el.getBoundingClientRect().top + scrollY));
    await page.screenshot({ path: `/tmp/valuation-rebuild-screens/${kind}-mobile-top.jpg` });
    const overflow = await page.evaluate(() => [...document.querySelectorAll("main *")]
      .filter(el => el.getBoundingClientRect().right > innerWidth + 1)
      .slice(0, 12).map(el => ({ tag: el.tagName, cls: el.className, right: el.getBoundingClientRect().right, text: el.textContent?.slice(0, 85) })));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${kind}: no mobile overflow: ${JSON.stringify(overflow)}`);
    assert.deepEqual(errors, [], `${kind}: no browser runtime errors`);
    console.log(`${kind}: presentation and interaction checks passed`);
    await page.close();
  }
} finally {
  await browser.close();
}
