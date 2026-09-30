// Browser regression check for the approved report, navigation, and print titles.
// Run against the managed development workflow: node scripts/verify_section_titles.mjs
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import ts from "typescript";
import { chromium } from "playwright";

const origin = process.env.SECTION_TITLES_ORIGIN || `https://${process.env.REPLIT_DEV_DOMAIN}`;
assert(origin && !origin.endsWith("undefined"),
  "Set SECTION_TITLES_ORIGIN or REPLIT_DEV_DOMAIN to the running Vite origin");

const [runDetail, registrySource, nearbyComponentSource] = await Promise.all([
  fs.readFile("client/src/pages/RunDetail.tsx", "utf8"),
  fs.readFile("client/src/components/report/sectionRegistry.tsx", "utf8"),
  fs.readFile("client/src/components/report/NewBusinessLicensesSection.tsx", "utf8"),
]);
const runAst = ts.createSourceFile("RunDetail.tsx", runDetail, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const registryAst = ts.createSourceFile("sectionRegistry.tsx", registrySource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function initializer(source, ast, variableName) {
  let result;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === variableName) {
      result = node.initializer;
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert(result, `Production ${variableName} declaration not found`);
  return result;
}

function evaluateLiteral(node, description, bindings = {}) {
  while (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) ||
         ts.isParenthesizedExpression(node) || ts.isSatisfiesExpression(node)) {
    node = node.expression;
  }
  assert(ts.isObjectLiteralExpression(node) || ts.isArrayLiteralExpression(node),
    `${description} must remain a literal production value so this harness can inspect it safely`);
  const names = Object.keys(bindings);
  return new Function(...names, `return (${node.getText(node.getSourceFile())});`)(...names.map((name) => bindings[name]));
}

const reportSectionTitles = evaluateLiteral(
  initializer(registrySource, registryAst, "REPORT_SECTION_TITLES"),
  "REPORT_SECTION_TITLES",
);
const registryBindings = { REPORT_SECTION_TITLES: reportSectionTitles };
const printSections = evaluateLiteral(initializer(runDetail, runAst, "PRINT_SECTIONS"), "PRINT_SECTIONS", registryBindings);
const accCustomMeta = evaluateLiteral(initializer(runDetail, runAst, "ACC_CUSTOM_META"), "ACC_CUSTOM_META", registryBindings);
const sectionMeta = evaluateLiteral(initializer(registrySource, registryAst, "SECTION_META"), "SECTION_META", registryBindings);

const expectedTitles = [
  reportSectionTitles.businessLicenses,
  reportSectionTitles.newBusinessLicenses,
  reportSectionTitles.zoning,
  reportSectionTitles.zoningHistory,
];
assert.deepEqual(expectedTitles, [
  "Business License History at This Address",
  "New Business Licenses Nearby",
  "Zoning & Allowed Uses",
  "Recorded Zoning Actions",
], "REPORT_SECTION_TITLES must retain the four approved exact labels");
const titleSources = {
  [expectedTitles[0]]: accCustomMeta.businessLicenses?.title,
  [expectedTitles[1]]: sectionMeta.newBusinessLicenses?.title,
  [expectedTitles[2]]: sectionMeta.zoning?.title,
  [expectedTitles[3]]: accCustomMeta.zoningHistory?.title,
};
for (const title of expectedTitles) {
  assert.equal(titleSources[title], title, `Production heading metadata must use the approved title: ${title}`);
}

const printOptionForTitle = new Map();
for (const title of expectedTitles) {
  const matches = printSections.filter((section) => section.label === title);
  assert.equal(matches.length, 1, `Expected one production print option named "${title}"`);
  printOptionForTitle.set(title, matches[0]);
}
const retiredPrintLabels = ["Business Licenses", "New Business Licenses", "Zoning Details", "Zoning History"];
for (const retired of retiredPrintLabels) {
  assert.equal(printSections.some((section) => section.label === retired), false,
    `Retired pre-title print option "${retired}" must not remain`);
}

const expectedPrintIds = new Map([
  [expectedTitles[0], "business-licenses"],
  [expectedTitles[1], "new-business-licenses"],
  [expectedTitles[2], "project-type"],
  [expectedTitles[3], "zoning-history"],
]);
const navigationTargets = new Map([
  [expectedTitles[0], ["print-section-business-licenses", "section-businessLicenses"]],
  [expectedTitles[1], ["section-newBusinessLicenses"]],
  [expectedTitles[2], ["section-zoning", "print-section-project-type"]],
  [expectedTitles[3], ["print-section-zoning-history", "section-zoningHistory"]],
]);
for (const title of expectedTitles) {
  const option = printOptionForTitle.get(title);
  assert.equal(option.id, expectedPrintIds.get(title), `Print option "${title}" must use its intended section ID`);
}
const zoningDistrictDetails = printSections.filter((section) => section.label === "Zoning District Details");
assert.equal(zoningDistrictDetails.length, 1, "Standalone zoning context card must have its own print option");
assert.equal(zoningDistrictDetails[0].id, "zoning-details");
assert.equal(sectionMeta.newBusinessLicenses?.anchorId, "section-newBusinessLicenses",
  "Nearby-license navigation metadata must target its always-mounted accordion row");
assert.ok(["section-zoning", "print-section-project-type"].includes(sectionMeta.zoning?.anchorId),
  "Zoning metadata must point to the actual project-use section, not the standalone district card");

const expectedAnchors = new Map([
  ["business-licenses", "print-section-business-licenses"],
  ["new-business-licenses", "print-section-new-business-licenses"],
  ["project-type", "print-section-project-type"],
  ["zoning-history", "print-section-zoning-history"],
  ["zoning-details", "print-section-zoning-details"],
]);
for (const [sectionId, anchor] of expectedAnchors) {
  assert.ok(runDetail.includes(`id="${anchor}"`) || nearbyComponentSource.includes(`id="${anchor}"`),
    `Production report anchor #${anchor} must exist`);
}

let jumpSectionsInitializer;
function findJumpSections(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "jumpSections") {
    jumpSectionsInitializer = node.initializer;
  }
  ts.forEachChild(node, findJumpSections);
}
findJumpSections(runAst);
assert(jumpSectionsInitializer && ts.isArrayLiteralExpression(jumpSectionsInitializer),
  "Production jumpSections navigation array not found");
const navigationItems = jumpSectionsInitializer.elements
  .filter(ts.isObjectLiteralExpression)
  .map((item) => {
    const label = item.properties.find((property) =>
      ts.isPropertyAssignment(property) && property.name.getText(runAst) === "label");
    const action = item.properties.find((property) =>
      ts.isPropertyAssignment(property) && property.name.getText(runAst) === "action");
    const labelValue = label && ts.isPropertyAssignment(label) ? label.initializer : null;
    return {
      label: labelValue
        ? new Function("REPORT_SECTION_TITLES", `return (${labelValue.getText(runAst)});`)(reportSectionTitles)
        : null,
      action: action?.getText(runAst) ?? "",
    };
  });
for (const title of expectedTitles) {
  const matches = navigationItems.filter((item) => item.label === title);
  assert.equal(matches.length, 1, `Expected one production jump-navigation choice named "${title}"`);
  const action = matches[0].action;
  assert.ok(navigationTargets.get(title).some((target) => action.includes(target)),
    `Navigation choice "${title}" must target its production report section`);
}
const printTargetDeclaration = (() => {
  let result;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "getPrintTarget") {
      result = node.initializer;
    }
    ts.forEachChild(node, visit);
  }
  visit(runAst);
  return result;
})();
assert(printTargetDeclaration && ts.isArrowFunction(printTargetDeclaration),
  "Production getPrintTarget function not found for direct fixture evaluation");
const printTargetSource = printTargetDeclaration.getText(runAst);

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

const fixture = {
  titles: expectedTitles.map((title, index) => ({
    id: ["businessLicenses", "newBusinessLicenses", "zoning", "zoningHistory"][index],
    title,
    takeaway: "Production title metadata rendered in a browser-only fixture.",
  })),
  zoningDistrictDetailsId: zoningDistrictDetails[0].id,
  printSections,
  nearbyLicenses: {
    totalCount: 1,
    licenseCount: 1,
    priorPeriodCount: 3,
    changePct: -67,
    radiusMiles: 1,
    periodMonths: 12,
    licenses: [{
      businessName: "Fixture Coffee",
      address: "100 Fixture Street",
      licenseType: "Retail Food Establishment",
      licenseCategory: "food",
      startDate: "2025-04-15",
      distanceMiles: 0.18,
      latitude: 41.88,
      longitude: -87.65,
    }],
  },
};
const moduleSource = `
import React from "${reactPath}";
import ReactDOM from "${rootPath}";
const { createRoot } = ReactDOM;
import { AccordionSection } from "/src/components/report/AccordionSection.tsx";
import { PrintSettingsDialog } from "/src/components/PrintSettingsDialog.tsx";
import { NewBusinessLicensesSection } from "/src/components/report/NewBusinessLicensesSection.tsx";
const base = ${JSON.stringify(fixture).replaceAll("<", "\\u003c")};
const getPrintTarget = ${printTargetSource};
function Fixture() {
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [nearbyState, setNearbyState] = React.useState("populated");
  window.setPrintDialogOpen = setDialogOpen;
  window.setNearbyState = setNearbyState;
  const nearbyStateProps = {
    populated: { data: base.nearbyLicenses, isLoading: false, isError: false },
    loading: { data: undefined, isLoading: true, isError: false },
    error: { data: undefined, isLoading: false, isError: true },
    empty: {
      data: { ...base.nearbyLicenses, totalCount: 0, licenseCount: 0, licenses: [] },
      isLoading: false,
      isError: false,
    },
  }[nearbyState];
  window.resolveProductionPrintTarget = (sectionId) => getPrintTarget(sectionId);
  window.applyProductionPrintSelection = (selectedSections) => {
    base.printSections.forEach((section) => {
      const target = getPrintTarget(section.id);
      if (!target) return;
      if (selectedSections.includes(section.id)) target.classList.remove("print-exclude");
      else target.classList.add("print-exclude");
    });
  };
  return (
    <main className="title-fixture">
      {base.titles.map((item, index) => {
        const bodyId = item.id === "businessLicenses" ? "print-section-business-licenses"
          : item.id === "zoning" ? "print-section-project-type"
            : item.id === "zoningHistory" ? "print-section-zoning-history" : undefined;
        return (
          <AccordionSection
            key={item.id}
            id={item.id}
            index={index + 1}
            order={index + 1}
            eyebrow={item.title}
            takeaway={item.takeaway}
            verdict="context"
            open={true}
            onToggle={() => {}}
          >
            {item.id === "newBusinessLicenses"
              ? <NewBusinessLicensesSection {...nearbyStateProps} />
              : <div id={bodyId} className="fixture-section-body">
                Browser-only content fixture — no report APIs or production data are requested.
              </div>}
          </AccordionSection>
        );
      })}
      <div id="print-section-zoning-details" className="kyp-ctxc fixture-standalone-zoning"
        data-testid="standalone-zoning-card">
        <div className="top">Zoning District Details — standalone context card</div>
      </div>
      <div id="section-ownership" className="kyp-accrow fixture-sibling">
        <div className="kyp-acchd" data-testid="ownership-header">Ownership &amp; Title</div>
        <div id="print-section-ownership">Ownership fixture content.</div>
      </div>
      <div id="section-ward" className="kyp-accrow fixture-sibling">
        <div className="kyp-acchd" data-testid="ward-header">Ward &amp; Alderperson</div>
        <div id="print-section-ward">Ward fixture content.</div>
      </div>
      <PrintSettingsDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        sections={base.printSections}
        onPrint={(sections) => {
          window.lastPrintedSections = sections;
          window.applyProductionPrintSelection(sections);
        }}
        projectType="Other"
      />
    </main>
  );
}
const root = createRoot(document.getElementById("root"));
window.lastPrintedSections = null;
root.render(React.createElement(Fixture));
`;

const { transform } = await import("esbuild");
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
<style>
  body{background:#faf9f6;margin:0}
  .test-container{max-width:980px;padding:24px;margin:0 auto}
  .title-fixture{display:grid;gap:14px}
  .fixture-section-body{padding:12px 4px;color:#52606b}
  .fixture-standalone-zoning{padding:12px;margin-block:8px}
  .fixture-sibling{padding:8px}
  @media(max-width:600px){.test-container{padding:12px}}
</style></head>`);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const errors = [];
const apiRequests = [];
page.on("pageerror", (error) => { errors.push(error.message); console.error("Browser:", error.message); });
page.on("request", (request) => {
  if (new URL(request.url()).pathname.startsWith("/api/")) apiRequests.push(request.url());
});
await page.route("**/api/**", (route) => route.abort());
await page.route("**/section-titles-browser-check", (route) =>
  route.fulfill({ status: 200, contentType: "text/html", body: html }));

try {
  await page.goto(`${origin}/section-titles-browser-check`);
  await page.locator("#section-businessLicenses .kyp-acchd .eb").waitFor();
  await page.waitForTimeout(300);
  const headingIds = ["businessLicenses", "newBusinessLicenses", "zoning", "zoningHistory"];
  const headingTitles = await Promise.all(headingIds.map((id) =>
    page.locator(`#section-${id} .kyp-acchd .eb`).textContent()));
  assert.deepEqual(headingTitles, expectedTitles,
    "Actual AccordionSection headings render the approved production metadata");
  assert.equal(await page.locator('[data-testid="row-license-0"]').count(), 1,
    "The actual nearby-license component rendered its inline fixture");
  const nearbyScopeText = await page.locator("#section-newBusinessLicenses").innerText();
  assert.match(nearbyScopeText, /1\s*[- ]?mile/i, "Nearby-license scope must identify the one-mile radius");
  assert.match(nearbyScopeText, /12 months/i, "Nearby-license scope must identify the trailing 12-month period");
  assert.match(nearbyScopeText, /new issuances/i, "Nearby-license scope must identify new issuances");

  const targetResults = await page.evaluate((ids) => Object.fromEntries(ids.map((id) => {
    const target = window.resolveProductionPrintTarget(id);
    return [id, target?.id ?? null];
  })), [...expectedPrintIds.values(), zoningDistrictDetails[0].id]);
  assert.deepEqual(targetResults, {
    "business-licenses": "section-businessLicenses",
    "new-business-licenses": "section-newBusinessLicenses",
    "project-type": "section-zoning",
    "zoning-history": "section-zoningHistory",
    "zoning-details": "print-section-zoning-details",
  }, "The extracted production getPrintTarget must resolve each option to its intended fixture target");
  assert.equal(await page.locator("#print-section-zoning-details").evaluate((card) =>
    card.closest(".kyp-accrow") === null), true,
  "The standalone zoning context card fixture must remain outside every accordion row");
  assert.deepEqual(apiRequests, [], "This isolated browser fixture must not make API requests");

  await page.screenshot({ path: "/tmp/section-titles-desktop.png", fullPage: true });
  await page.evaluate(() => window.setPrintDialogOpen(true));
  await page.getByTestId("button-print-deselect-all").waitFor();
  for (const title of expectedTitles) {
    assert.equal(await page.getByText(title, { exact: true }).count(), 2,
      `The production report heading and actual print option should both show "${title}"`);
  }
  const renderedPrintLabels = await page.locator('label[for^="print-section-check-"]').allTextContents();
  for (const title of expectedTitles) {
    assert.equal(renderedPrintLabels.filter((label) => label.trim() === title).length, 1,
      `Print dialog must render exactly one "${title}" option`);
  }
  assert.equal(renderedPrintLabels.filter((label) => label.trim() === "Zoning District Details").length, 1,
    "The standalone zoning context option has its distinct title");
  for (const retired of retiredPrintLabels) {
    assert.equal(renderedPrintLabels.some((label) => label.trim() === retired), false,
      `Retired option "${retired}" must not appear in the rendered print dialog`);
  }

  const watchedTargets = [
    ...expectedPrintIds.values(),
    zoningDistrictDetails[0].id,
    "ownership",
    "ward",
  ];
  async function confirmWithAllExcept(sectionId) {
    await page.evaluate(() => window.setPrintDialogOpen(true));
    await page.getByTestId("button-print-select-all").waitFor();
    await page.getByTestId("button-print-select-all").click();
    await page.getByTestId(`checkbox-print-${sectionId}`).click();
    await page.evaluate(() => { window.lastPrintedSections = null; });
    await page.getByTestId("button-confirm-print").click();
    await page.waitForFunction(() => window.lastPrintedSections !== null);
    const selected = await page.evaluate(() => window.lastPrintedSections);
    assert.equal(selected.includes(sectionId), false, `Print checkbox must independently exclude ${sectionId}`);
    for (const otherId of watchedTargets.filter((id) => id !== sectionId)) {
      assert.equal(selected.includes(otherId), true, `Selecting all must preserve sibling print option ${otherId}`);
    }
    return selected;
  }
  async function assertPrintTargetExcluded(sectionId, targetSelector, siblingSelectors) {
    await confirmWithAllExcept(sectionId);
    assert.equal(await page.locator(targetSelector).evaluate((element) => element.classList.contains("print-exclude")),
      true, `Deselecting ${sectionId} must exclude its actual getPrintTarget element`);
    if (sectionId !== "zoning-details") {
      assert.equal(await page.locator(targetSelector).locator(".kyp-acchd").count(), 1,
        `The excluded ${sectionId} target must be the whole report row, including its header`);
    }
    for (const selector of siblingSelectors) {
      assert.equal(await page.locator(selector).evaluate((element) => element.classList.contains("print-exclude")),
        false, `Deselecting ${sectionId} must not cause collateral exclusion of ${selector}`);
    }
    await page.evaluate(() => window.setPrintDialogOpen(true));
    await page.getByTestId("button-print-select-all").waitFor();
    await page.getByTestId("button-print-select-all").click();
    await page.evaluate(() => { window.lastPrintedSections = null; });
    await page.getByTestId("button-confirm-print").click();
    await page.waitForFunction(() => window.lastPrintedSections !== null);
    assert.equal(await page.evaluate((id) => window.lastPrintedSections.includes(id), sectionId), true,
      `Selecting ${sectionId} must independently include it`);
    assert.equal(await page.locator(targetSelector).evaluate((element) => element.classList.contains("print-exclude")),
      false, `Including ${sectionId} must restore its target`);
  }

  await assertPrintTargetExcluded("business-licenses", "#section-businessLicenses", [
    "#section-businessLicenses .kyp-acchd",
    "#print-section-ownership",
    "#print-section-zoning-details",
    "#print-section-ward",
  ]);
  await assertPrintTargetExcluded("new-business-licenses", "#section-newBusinessLicenses", [
    "#section-newBusinessLicenses .kyp-acchd",
    "#print-section-ownership",
    "#print-section-zoning-details",
    "#print-section-ward",
  ]);
  await assertPrintTargetExcluded("project-type", "#section-zoning", [
    "#section-zoning .kyp-acchd",
    "#print-section-zoning-details",
    "#print-section-ownership",
    "#print-section-ward",
  ]);
  await assertPrintTargetExcluded("zoning-history", "#section-zoningHistory", [
    "#section-zoningHistory .kyp-acchd",
    "#print-section-ownership",
    "#print-section-zoning-details",
    "#print-section-ward",
  ]);
  await assertPrintTargetExcluded("zoning-details", "#print-section-zoning-details", [
    "#section-zoning",
    "#print-section-ownership",
    "#print-section-ward",
  ]);

  for (const state of ["populated", "loading", "error", "empty"]) {
    await page.evaluate((nextState) => window.setNearbyState(nextState), state);
    if (state === "populated") {
      await page.locator("#print-section-new-business-licenses").waitFor();
      assert.equal(await page.locator('[data-testid="row-license-0"]').count(), 1);
    } else if (state === "loading") {
      await page.locator(".kyp-biz-loading").waitFor();
      assert.equal(await page.locator("#print-section-new-business-licenses").count(), 0);
    } else if (state === "error") {
      await page.getByText(/issuance records could not be loaded/i).waitFor();
      assert.equal(await page.locator("#print-section-new-business-licenses").count(), 0);
    } else {
      await page.getByText(/No qualifying new business issuances/i).waitFor();
      assert.equal(await page.locator("#print-section-new-business-licenses").count(), 0);
    }
    const fallbackTarget = await page.evaluate(() => {
      const target = window.resolveProductionPrintTarget("new-business-licenses");
      return target?.id ?? null;
    });
    assert.equal(fallbackTarget, "section-newBusinessLicenses",
      `getPrintTarget must resolve the always-mounted nearby section while state is ${state}`);
    const stateText = await page.locator("#section-newBusinessLicenses").innerText();
    if (state === "populated") {
      assert.match(stateText, /1\s*[- ]?mile/i, "Nearby scope should identify the one-mile radius");
      assert.match(stateText, /12 months/i, "Nearby scope should identify the trailing 12-month period");
      assert.match(stateText, /new issuances/i, "Nearby scope should identify new issuances");
    }
  }

  await page.evaluate(() => window.setPrintDialogOpen(true));
  await page.getByTestId("button-print-select-all").waitFor();
  await page.getByTestId("button-print-select-all").click();
  const printTitle = page.getByText(expectedTitles[3], { exact: true }).last();
  await printTitle.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "/tmp/section-titles-print-dialog.png" });

  await page.evaluate(() => window.setPrintDialogOpen(false));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  const mobileLayout = await page.evaluate(() => {
    const title = [...document.querySelectorAll("#section-businessLicenses .kyp-acchd .eb")]
      .find((element) => element.textContent?.trim() === "Business License History at This Address");
    const lineHeight = title ? Number.parseFloat(getComputedStyle(title).lineHeight) : 0;
    return {
      pageWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      titleLines: title ? title.getClientRects().length : 0,
      titleHeight: title?.getBoundingClientRect().height ?? 0,
      titleLineHeight: lineHeight,
      headingOverflow: [...document.querySelectorAll(".kyp-acchd .mid")]
        .some((element) => element.scrollWidth > element.clientWidth + 1),
    };
  });
  assert.equal(mobileLayout.pageWidth <= mobileLayout.viewportWidth, true,
    "Report headings and fixture must not create horizontal page overflow on mobile");
  assert.equal(mobileLayout.headingOverflow, false, "Mobile report headings must wrap without clipping");
  assert.ok(mobileLayout.titleLines >= 2 || mobileLayout.titleHeight > mobileLayout.titleLineHeight * 1.2,
    "The longest at-address title should wrap on a mobile viewport");
  await page.screenshot({ path: "/tmp/section-titles-mobile.png", fullPage: true });
  assert.deepEqual(errors, []);
  assert.deepEqual(apiRequests, [], "No API requests were made during any browser interaction");
  console.log("Section-title browser checks passed: production title metadata/navigation, actual getPrintTarget behavior, checkbox-driven row include/exclude, nearby loading states, scope, and mobile wrapping.");
} finally {
  await browser.close();
}