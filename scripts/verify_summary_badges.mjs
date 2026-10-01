// Browser regression check for summary badges on every report accordion.
// Run against the managed Vite workflow: node scripts/verify_summary_badges.mjs
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import ts from "typescript";
import { chromium } from "playwright";

const origin = process.env.SUMMARY_BADGES_ORIGIN || `https://${process.env.REPLIT_DEV_DOMAIN}`;
assert(origin && !origin.endsWith("undefined"),
  "Set SUMMARY_BADGES_ORIGIN or REPLIT_DEV_DOMAIN to the running Vite origin");

const runDetail = await fs.readFile("client/src/pages/RunDetail.tsx", "utf8");
const runAst = ts.createSourceFile("RunDetail.tsx", runDetail, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function variableInitializer(name) {
  let result;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) {
      result = node.initializer;
    }
    ts.forEachChild(node, visit);
  }
  visit(runAst);
  assert(result, `Missing production declaration: ${name}`);
  return result;
}

function literalArray(node, description) {
  while (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) ||
         ts.isParenthesizedExpression(node) || ts.isSatisfiesExpression(node)) {
    node = node.expression;
  }
  assert(ts.isArrayLiteralExpression(node), `${description} must remain a literal production array`);
  return node.elements.map((element) => {
    assert(ts.isStringLiteral(element), `${description} must contain literal string ids`);
    return element.text;
  });
}

const ids = literalArray(variableInitializer("ACC_DEFAULT_ORDER"), "ACC_DEFAULT_ORDER");
assert.equal(ids.length, 25, "Update this fixture when the production report section order changes");
assert.equal(new Set(ids).size, ids.length, "Production report section ids must be unique");

const jsxSectionIds = [];
const jsxSectionsById = new Map();
const parents = new WeakMap();
function collectAccPropsIds(node) {
  const isJsx = ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node);
  const opening = ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : undefined;
  if (isJsx && opening?.tagName?.getText(runAst) === "AccordionSection") {
    function findCall(child) {
      if (ts.isCallExpression(child) && child.expression.getText(runAst) === "accProps" &&
          child.arguments.length === 1 && ts.isStringLiteral(child.arguments[0])) {
        jsxSectionIds.push(child.arguments[0].text);
        const sectionNodes = jsxSectionsById.get(child.arguments[0].text) || [];
        sectionNodes.push(node);
        jsxSectionsById.set(child.arguments[0].text, sectionNodes);
      }
      ts.forEachChild(child, findCall);
    }
    findCall(node);
  }
  ts.forEachChild(node, (child) => {
    parents.set(child, node);
    collectAccPropsIds(child);
  });
}
parents.set(runAst, null);
collectAccPropsIds(runAst);
for (const id of ids) {
  assert.equal(jsxSectionIds.filter((sectionId) => sectionId === id).length, 1,
    `Expected exactly one production AccordionSection wired through accProps for "${id}"`);
}

const fallbackStatesInitializer = variableInitializer("headerFallbackStates");
assert(ts.isObjectLiteralExpression(fallbackStatesInitializer),
  "Production headerFallbackStates must remain an inspectable keyed object");
const fallbackStateKeys = fallbackStatesInitializer.properties.map((property) => {
  assert(ts.isPropertyAssignment(property) && property.name,
    "Production headerFallbackStates entries must have explicit keys");
  const name = property.name;
  assert(ts.isIdentifier(name) || ts.isStringLiteral(name),
    "Production headerFallbackStates keys must be literal identifiers or strings");
  return name.text;
});
for (const id of ids) {
  assert(fallbackStateKeys.includes(id), `Production headerFallbackStates is missing "${id}"`);
}
assert.equal(fallbackStateKeys.length, ids.length,
  "headerFallbackStates must define exactly one state for each default report section");

function isConditionalJsxGuard(node) {
  if (ts.isIfStatement(node) || ts.isConditionalExpression(node)) return true;
  if (!ts.isJsxExpression(node) || !node.expression) return false;
  const expression = node.expression;
  return ts.isConditionalExpression(expression) ||
    (ts.isBinaryExpression(expression) &&
      (expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
       expression.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
       expression.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken));
}
for (const id of ids) {
  const sectionNode = jsxSectionsById.get(id)?.[0];
  assert(sectionNode, `Missing production JSX node for "${id}"`);
  let ancestor = parents.get(sectionNode);
  while (ancestor) {
    assert(!isConditionalJsxGuard(ancestor),
      `The complete default header row "${id}" must not be hidden behind a JSX condition`);
    ancestor = parents.get(ancestor);
  }
}

// Audit the actual production accProps implementation: fallback badges must be
// on the empty-value side of a preserving operator, and the tone prop remains.
const accPropsInitializer = variableInitializer("accProps");
assert(ts.isArrowFunction(accPropsInitializer), "Production accProps must remain an inspectable function");
const accPropsText = accPropsInitializer.getText(runAst);
assert.match(accPropsText, /fallbackSummaryBadge\s*\(/,
  "Production accProps must use the shared summary badge helper");
const fallbackResultNames = new Set();
function collectFallbackResults(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
    let hasFallbackCall = false;
    function findFallback(child) {
      if (ts.isCallExpression(child) && child.expression.getText(runAst) === "fallbackSummaryBadge") {
        hasFallbackCall = true;
      }
      ts.forEachChild(child, findFallback);
    }
    findFallback(node.initializer);
    if (hasFallbackCall) fallbackResultNames.add(node.name.text);
  }
  ts.forEachChild(node, collectFallbackResults);
}
collectFallbackResults(accPropsInitializer);

let returnedProps;
function findReturnObject(node) {
  if (ts.isReturnStatement(node) && node.expression && ts.isObjectLiteralExpression(node.expression)) {
    returnedProps = node.expression;
  }
  ts.forEachChild(node, findReturnObject);
}
findReturnObject(accPropsInitializer.body);
assert(returnedProps, "Production accProps must return its section props as an object");
function propertyInitializer(name) {
  const property = returnedProps.properties.find((item) =>
    (ts.isPropertyAssignment(item) || ts.isShorthandPropertyAssignment(item)) &&
    item.name?.getText(runAst).replaceAll('"', "") === name);
  assert(property, `Production accProps must provide ${name}`);
  return ts.isPropertyAssignment(property) ? property.initializer : property.name;
}
const badgeInitializer = propertyInitializer("badge");
const toneInitializer = propertyInitializer("badgeTone");
const fallbackReference = (node) => {
  let found = false;
  function visit(child) {
    if ((ts.isCallExpression(child) && child.expression.getText(runAst) === "fallbackSummaryBadge") ||
        (ts.isIdentifier(child) && fallbackResultNames.has(child.text))) found = true;
    ts.forEachChild(child, visit);
  }
  visit(node);
  return found;
};
let keepsExistingBadgeFirst = false;
function findPreservingFallback(node) {
  if (ts.isBinaryExpression(node) &&
      (node.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
       node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) &&
      !fallbackReference(node.left) && fallbackReference(node.right)) {
    keepsExistingBadgeFirst = true;
  }
  ts.forEachChild(node, findPreservingFallback);
}
findPreservingFallback(badgeInitializer);
assert(keepsExistingBadgeFirst,
  "Production accProps must preserve its existing badge before applying a fallback");
assert(toneInitializer, "Production accProps must retain an explicit badgeTone prop");

const [mainSource, componentSource] = await Promise.all([
  fetch(`${origin}/src/main.tsx`).then((response) => response.text()),
  fetch(`${origin}/src/components/report/AccordionSection.tsx`).then((response) => response.text()),
]);
assert.match(componentSource, /from ["'][^"']*\/react\.js\?[^"']+["']/,
  "Vite React dependency path not found in AccordionSection");
const reactPath = componentSource.match(/from ["']([^"']*\/react\.js\?[^"']+)["']/)?.[1];
const rootPath = mainSource.match(/from ["']([^"']*\/react-dom_client\.js\?[^"']+)["']/)?.[1];
assert(reactPath && rootPath, "Vite React and ReactDOM dependency paths not found");
assert.match(componentSource, /AccordionSection/, "Production AccordionSection module is not available");

const fixtureIds = JSON.stringify(ids);
const fixtureHtml = `<!doctype html><html><head>
<link rel="stylesheet" href="/src/index.css"><link rel="stylesheet" href="/src/kyp-base.css">
<style>body{margin:0;background:#fff}main{max-width:1050px;margin:auto;padding:20px}.kyp-accrow{margin:0 0 8px}</style>
</head><body><div id="root"></div>
<script type="module">
import RefreshRuntime from "/@react-refresh";
RefreshRuntime.injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => (type) => type;
window.__vite_plugin_react_preamble_installed__ = true;
</script>
<script type="module">
import React from "${reactPath}";
import ReactDOM from "${rootPath}";
import { AccordionSection } from "/src/components/report/AccordionSection.tsx";
import { fallbackSummaryBadge } from "/src/lib/sectionHeaderBadges.ts";
const { createRoot } = ReactDOM;
const h = React.createElement;
const ids = ${fixtureIds};
const specialStates = {
  ownership: { hasData: true, label: "Title verified" },
  propertyTax: { hasData: true, label: "0", emptyLabel: "No current balance" },
  historic: {},
  zoning: { loading: true },
  zoningHistory: { applicable: false },
  potential: { hasData: true, incomplete: true },
};
const existingBadges = {
  listing: { label: "ACTIVE LISTING", tone: "g" },
  countyRecord: { label: "TAX RECORD", tone: "o" },
};
function Fixture() {
  const [hidden, setHidden] = React.useState({});
  const [open, setOpen] = React.useState({});
  return h("main", null, ids.map((id, i) => {
    const fallback = fallbackSummaryBadge(specialStates[id] || { hasData: true });
    const existing = existingBadges[id];
    const badge = existing ? existing.label : fallback.label;
    const badgeTone = existing ? existing.tone : fallback.tone;
    return h(AccordionSection, {
      key: id, id, index: i + 1, order: i + 1, eyebrow: id,
      takeaway: "Production accordion fixture", verdict: "context",
      badge, badgeTone, open: open[id] !== false,
      onToggle: () => setOpen((value) => ({ ...value, [id]: value[id] === false })),
      off: !!hidden[id],
      onToggleOff: () => setHidden((value) => ({ ...value, [id]: !value[id] })),
      children: h("p", null, "Fixture body for " + id),
    });
  }));
}
createRoot(document.getElementById("root")).render(h(Fixture));
</script></body></html>`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.route("**/summary-badge-check", (route) =>
  route.fulfill({ contentType: "text/html", body: fixtureHtml }));
try {
  await page.goto(`${origin}/summary-badge-check`);
  await page.locator('[data-testid="accsec-ownership"] .badge').waitFor().catch((error) => {
    throw new Error(`${error.message}\nBrowser errors: ${errors.join("; ")}`);
  });
  assert.equal(await page.locator(".kyp-accrow").count(), 25, "Render a header for every current report section");
  for (const id of ids) {
    assert.equal(await page.locator(`[data-testid="accsec-${id}"] .badge`).count(), 1,
      `Every section needs a visible badge: ${id}`);
  }

  const label = async (id) => (await page.locator(`[data-testid="accsec-${id}"] .badge`).textContent())?.trim();
  const tone = async (id) => page.locator(`[data-testid="accsec-${id}"] .badge`).getAttribute("class");
  assert.equal(await label("ownership"), "Title verified", "Show a loaded finding");
  assert.equal(await label("propertyTax"), "0", "Do not mistake a valid zero for missing data");
  assert.equal(await label("historic"), "Unavailable", "Explain missing data");
  assert.equal(await label("zoning"), "Checking", "Show checking state");
  assert.match(await tone("zoning"), /\bindigo\b/, "Checking uses the indigo tone");
  assert.equal(await label("zoningHistory"), "Not applicable");
  assert.equal(await label("potential"), "Data incomplete");
  assert.equal(await label("listing"), "ACTIVE LISTING", "Keep an existing production-style badge label");
  assert.match(await tone("listing"), /\bg\b/, "Keep an existing badge tone");
  assert.equal(await label("countyRecord"), "TAX RECORD");
  assert.match(await tone("countyRecord"), /\bo\b/);
  await page.screenshot({ path: "/tmp/summary-badges-desktop.png", fullPage: true });

  const ownershipRow = page.locator('[data-testid="accsec-ownership"]');
  await ownershipRow.locator('[data-testid="acchide-ownership"]').click();
  assert.equal(await ownershipRow.locator(".badge").count(), 1, "Off sections must keep their badge visible");
  assert.ok((await ownershipRow.getAttribute("class")).includes("offrow"), "Off section remains dimmed");
  assert.equal(await ownershipRow.locator(".kyp-accbody").getAttribute("class"), "kyp-accbody closed");
  await ownershipRow.locator('[data-testid="acchide-ownership"]').click();
  assert.equal(await ownershipRow.locator(".badge").count(), 1, "Show toggle restores the section without losing its badge");

  const zoningHeader = page.locator('[data-testid="accsec-zoning"] .kyp-acchd');
  await zoningHeader.click();
  assert.equal(await page.locator('[data-testid="accsec-zoning"] .kyp-acchd').getAttribute("aria-expanded"), "false");
  await zoningHeader.click();
  assert.equal(await page.locator('[data-testid="accsec-zoning"] .kyp-acchd').getAttribute("aria-expanded"), "true");

  await page.setViewportSize({ width: 390, height: 844 });
  for (const id of ids) {
    const badge = page.locator(`[data-testid="accsec-${id}"] .badge`);
    assert.equal(await badge.count(), 1, `Mobile layout must retain badge for ${id}`);
    const box = await badge.boundingBox();
    assert(box && box.x >= 0 && box.x + box.width <= 390, `Badge for ${id} fits the mobile viewport`);
  }
  await page.screenshot({ path: "/tmp/summary-badges-mobile.png", fullPage: true });
  await page.locator('[data-testid="accsec-listing"] [data-testid="acchide-listing"]').click();
  assert.equal(await label("listing"), "ACTIVE LISTING", "Existing badge survives mobile hide/show toggling");
  assert.deepEqual(errors, [], "Browser fixture should not emit runtime errors");
  console.log("Summary badge checks passed: 25 production section IDs, loaded/zero/missing/checking/not-applicable/incomplete states, preserved labels and tones, off/show and open/close toggles, desktop and mobile.");
} finally {
  await browser.close();
}