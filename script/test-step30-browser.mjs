import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";

// Exercise the actual calculator, without app routes, credentials, or paid APIs.
const cwd = process.cwd();
const result = await build({
  stdin: {
    contents: `
      import React from "react";
      import { createRoot } from "react-dom/client";
      import { ValuationCalculator } from "@/components/report/ValuationCalculator";
      import { SectionNumberContext } from "@/components/report/AccordionSection";
      const root = createRoot(document.getElementById("root"));
      window.mountCalculator = (kind = "rental", overrides = {}) => {
        window.calculatorSnapshot = undefined;
        window.calculatorMetric = undefined;
        window.fixtureVersion = (window.fixtureVersion || 0) + 1;
        const props = {
          runId: window.fixtureVersion,
          initialPurchasePrice: "600000",
          mortgageRate: 6.5,
          annualCountyTaxes: 12000,
          annualInsuranceEstimate: 1800,
          initialUnitCount: 3,
          unitCountSource: "county apartment count",
          dscrLoanEligible: true,
          rentalSources: [{key:"market",label:"Market rent",annualRent:72000,source:"RentCast",basis:"market"}],
          onSnapshot: value => {window.calculatorSnapshot = value;},
          onMetric: (id,value) => {window.calculatorMetric = value;},
          ...(kind === "daycare" ? {isDaycare:true,buildingSqFt:1273,buildingAreaSource:"Entered building area"} : {}),
          ...(kind === "sba" ? {initialLoanType:"sba_biz_re",listingRevenue:800000,
            initialFinancing:{businessPrice:"490000",realEstatePrice:"510000"}} : {}),
          ...overrides,
        };
        root.render(<SectionNumberContext.Provider value={overrides.sectionNumber ?? 20}>
          <ValuationCalculator key={window.fixtureVersion} {...props}/>
        </SectionNumberContext.Provider>);
      };
      window.mountCalculator();
    `,
    resolveDir: cwd,
    sourcefile: "step30-fixture.tsx",
    loader: "tsx",
  },
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  alias: { "@": path.join(cwd, "client/src") },
  define: { "process.env.NODE_ENV": '"production"' },
});
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
page.setDefaultTimeout(5000);
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const css = fs.readFileSync("client/src/kyp-base.css", "utf8");
await page.setContent(`<html><head><style>${css}</style></head>
  <body><main class="kyp-report"><div class="kyp-body" id="root"></div></main></body></html>`);
await page.addScriptTag({ content: result.outputFiles[0].text });
const snapshot = async () => {
  await page.waitForTimeout(60);
  return page.evaluate(() => window.calculatorSnapshot);
};
const mount = async (kind, props = {}) => {
  await page.evaluate(({ kind, props }) => window.mountCalculator(kind, props), { kind, props });
  await page.waitForTimeout(100);
};
const fill = async (label, value) => {
  await page.getByLabel(label, { exact: true }).fill(String(value));
  await page.waitForTimeout(60);
};
try {
  await page.waitForSelector('[data-testid="valuation-calculator"]', { timeout: 5000 });
  const initial = await snapshot();
  assert.ok(initial && initial.selectedNoi > 0, "rent build-up provides an income snapshot");
  const numbers = await page.locator(".kyp-calcstep .n").allTextContents();
  assert.deepEqual(numbers, ["20.1", "20.2", "20.3", "20.4", "20.5"]);
  await page.getByRole("button", { name: "Advanced", exact: true }).click();
  assert.equal((await snapshot()).selectedNoi, initial.selectedNoi, "tier changes do not change NOI");
  await fill("Annual property taxes", 15000);
  assert.ok(await page.locator(".kyp-tag").filter({ hasText: "Edited" }).count(), "tax edit changes provenance");
  const edited = await snapshot();
  assert.equal(edited.selectedNoi, initial.selectedNoi - 3000);
  await page.getByRole("button", { name: "Simple", exact: true }).click();
  assert.equal((await snapshot()).selectedNoi, edited.selectedNoi);

  await page.getByLabel("NOI source", { exact: true }).selectOption("direct");
  await fill("Annual NOI entered directly", -5000);
  assert.equal((await snapshot()).selectedNoi, -5000, "entered losses remain signed");
  assert.equal(await page.locator(".kyp-ledger").count(), 0, "manual NOI suppresses the build-up statement");
  await page.getByRole("button", { name: /Restore/i }).click();
  assert.equal((await snapshot()).selectedNoi, edited.selectedNoi);

  await page.getByLabel("NOI source", { exact: true }).selectOption("direct");
  const debt = (await snapshot()).metrics.annualDebtService;
  for (const [ratio, tone] of [[0.99, "red"], [1, "orange"], [1.249, "orange"], [1.25, "grn"]]) {
    await fill("Annual NOI entered directly", debt * ratio);
    assert.ok(await page.locator(`[data-testid="valuation-glance"] .kyp-block.${tone}`).count());
    assert.equal(await page.locator(".kyp-bands .kyp-band.on").count(), 1);
  }
  await page.getByLabel("Financing path", { exact: true }).selectOption("fha_va");
  assert.match(await page.locator(".kyp-lock").first().textContent(), /5% down/);
  assert.match(await page.locator('[data-testid="valuation-calculator"]').textContent(), /mortgage insurance/i);
  await page.getByLabel("Financing path", { exact: true }).selectOption("sba_business");
  assert.equal(await page.locator("#valuation-real-estate-price").count(), 0);
  assert.equal(await page.locator("#sba-re-rate").count(), 0);
  await page.getByLabel("Financing path", { exact: true }).selectOption("sba_biz_re");
  assert.equal(await page.locator("#valuation-real-estate-price").count(), 1);
  assert.equal(await page.locator("#sba-re-rate").count(), 1);

  await mount("rental", { listingStatedNoi: 42000 });
  await page.getByLabel("NOI source", { exact: true }).selectOption("listing_noi");
  const listed = await snapshot();
  assert.equal(listed.selectedNoi, 42000);
  assert.equal(listed.metrics.annualOperatingCosts, 0, "stated net income not taxed a second time");
  assert.match(await page.locator('[data-testid="valuation-calculator"]').textContent(), /\$12,000/);

  await mount("daycare");
  assert.equal(await page.locator('[data-testid="daycare-scenarios"] button').count(), 4);
  assert.equal(await page.locator('[data-testid="daycare-scenarios"] [aria-pressed="true"]').count(), 1);
  assert.deepEqual(await page.locator(".kyp-calcstep .n").allTextContents(),
    ["20.1", "20.2", "20.3", "20.4", "20.5", "20.6"]);
  await fill("Annual business operating expenses", 300000);
  assert.equal((await snapshot()).selectedNoi, 16 * 2275 * 12 - 300000 - 12000 - 1800);
  await page.locator('[data-testid="daycare-scenarios"] button').nth(2).click();
  assert.equal((await snapshot()).selectedNoi, 12 * 2275 * 12 - 300000 - 12000 - 1800);
  const daycare = await snapshot();
  assert.equal(daycare.metrics.annualCashFlow, daycare.selectedNoi - daycare.metrics.annualDebtService);
  assert.equal(daycare.metrics.annualOperatingCosts, 0);

  await mount("sba");
  await fill("Annual operating expenses", 500000);
  await fill("Third-party leased-space rent · annual", 0);
  const business = await snapshot();
  assert.equal(business.selectedNoi, 800000 - 500000 - 12000 - 1800);
  assert.equal(business.metrics.annualOperatingCosts, 0);
  assert.equal(await page.locator("#sba-business-term").inputValue(), "25", "51% uses shared RE term");
  await page.getByRole("button", { name: "Detailed", exact: true }).click();
  assert.equal((await snapshot()).calculationComplete, false, "missing detailed costs are not reported as zero expenses");
  await fill("Cost of goods sold", 150000);
  await fill("Payroll", 250000);
  await fill("Other operating expenses", 100000);
  await fill("Add back · owner salary (seller claim)", 60000);
  await fill("Add back · owner personal expenses (seller claim)", 20000);
  await fill("Add back · one-time items (seller claim)", 10000);
  await fill("Less · market manager salary", 70000);
  await fill("Third-party leased-space rent · annual", 36000);
  const detailed = await snapshot();
  assert.equal(detailed.businessIncomeModel.result.sde, 390000);
  assert.equal(detailed.businessIncomeModel.result.businessOperatingIncome, 320000);
  assert.equal(detailed.selectedNoi, 320000 + 14406);
  assert.equal(detailed.metrics.annualCashFlow, detailed.selectedNoi - detailed.metrics.annualDebtService);
  assert.equal(detailed.inputSnapshot.grossIncomeForReport, 836000);
  fs.mkdirSync("/tmp/step30-verification", { recursive: true });
  await page.screenshot({ path: "/tmp/step30-verification/sba-desktop.png", fullPage: true });
  await page.getByLabel("Financing path", { exact: true }).selectOption("sba_business");
  assert.equal((await snapshot()).calculationComplete, false, "leased occupancy isn't silently imputed");
  await fill("Leased-occupancy expense (annual)", 24000);
  const businessOnly = await snapshot();
  assert.equal(businessOnly.selectedNoi, 320000 - 24000);
  assert.equal(businessOnly.metrics.annualOperatingCosts, 0);
  assert.equal(await page.locator("#sba-business-term").inputValue(), "10");
  await page.getByLabel("Financing path", { exact: true }).selectOption("sba_biz_re");
  assert.equal(await page.locator("#sba-business-term").inputValue(), "25", "path change reapplies shared rule without price change");

  await mount("daycare");
  assert.equal((await snapshot()).calculationComplete, false);
  assert.equal(await page.locator('[data-testid="valuation-glance"]').count(), 0);
  await fill("Annual business operating expenses", 300000);
  const simpleDaycare = await snapshot();
  await page.getByRole("button", { name: "Detailed", exact: true }).click();
  assert.equal((await snapshot()).selectedNoi, simpleDaycare.selectedNoi, "daycare detail toggle is view-only");
  assert.equal(await page.locator(".kyp-ledger").count(), 2, "daycare income separates business and property");

  await mount("rental", { initialPurchasePrice: "", sectionNumber: 27 });
  assert.equal((await snapshot()).calculationComplete, false, "missing price is not a modeled zero-cost acquisition");
  assert.equal(await page.locator(".kyp-calcstep .n").first().textContent(), "27.1", "numbers follow live section context");
  await mount("rental", { commercialOnly: true, commercialIncomeAllowed: true, dscrLoanEligible: false });
  assert.equal((await snapshot()).calculationComplete, false, "housing rent estimates are not commercial property income");
  await fill("Commercial rent · annual", 36000);
  assert.equal((await snapshot()).noiModel.inputs.residentialRentAnnual, 0);
  assert.equal((await snapshot()).noiModel.result.grossIncome, 36000);
  assert.equal((await snapshot()).calculationComplete, true);
  await mount("rental", { rentalSources: [], listingStatedNoi: 42000 });
  assert.equal((await snapshot()).noiSource, "listing_noi", "listing-only income doesn't default to an empty manual input");
  await mount("rental", { rentalSources: [
    { key: "market", label: "Market rent", annualRent: 72000, source: "RentCast", basis: "market" },
    { key: "actual", label: "Actual rent", annualRent: 60000, source: "Listing", basis: "actual" },
  ] });
  await page.getByLabel("NOI source", { exact: true }).selectOption("actual");
  const priorBasis = await snapshot();
  await page.getByLabel("NOI source", { exact: true }).selectOption("direct");
  await fill("Annual NOI entered directly", -5000);
  await page.getByRole("button", { name: /Restore/i }).click();
  assert.equal((await snapshot()).noiSource, "noi_model:actual");
  assert.equal((await snapshot()).selectedNoi, priorBasis.selectedNoi);
  await mount("rental");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(100);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  assert.equal(overflow, false, "mobile calculator does not overflow");
  await page.screenshot({ path: "/tmp/step30-verification/rental-mobile.png", fullPage: true });
  assert.deepEqual(errors, [], "calculator renders without browser errors");
  const patch = fs.readFileSync("attached_assets/kyp-base-patch-30-valuation_1790923670086.css", "utf8");
  assert.ok(css.trimEnd().endsWith(patch.trimEnd()), "supplied patch is appended verbatim");
  assert.ok(css.indexOf("PATCH 30") > css.indexOf("PATCH 29"));
  const runDetail = fs.readFileSync("client/src/pages/RunDetail.tsx", "utf8");
  assert.doesNotMatch(runDetail, /isCashflowCalculatorOpen|isValuationCalculatorOpen|cashflowExpensePercent|val-step|val-cov|val-ref|val-mt|val-formula|calc-inputs|val-hrow|val-chip/);
  console.log("Step 30 browser, integration-source, and responsive checks passed");
} catch (error) {
  console.error("Browser errors:", errors);
  console.error("Rendered text:", (await page.locator("body").textContent()).slice(0, 800));
  throw error;
} finally {
  await browser.close();
}