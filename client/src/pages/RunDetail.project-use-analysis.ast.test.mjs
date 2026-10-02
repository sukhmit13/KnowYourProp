import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const runDetailPath = new URL("./RunDetail.tsx", import.meta.url);
const text = readFileSync(runDetailPath, "utf8");
const source = ts.createSourceFile(
  runDetailPath.pathname,
  text,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);

function descendants(node) {
  const nodes = [];
  const visit = (current) => {
    nodes.push(current);
    ts.forEachChild(current, visit);
  };
  visit(node);
  return nodes;
}

function jsxName(node) {
  if (ts.isJsxElement(node)) return node.openingElement.tagName.getText(source);
  if (ts.isJsxSelfClosingElement(node)) return node.tagName.getText(source);
  return null;
}

function attribute(node, name) {
  const opening = ts.isJsxElement(node) ? node.openingElement : node;
  return opening.attributes.properties.find(
    (property) => ts.isJsxAttribute(property) && property.name.getText(source) === name,
  );
}

function literalAttribute(node, name) {
  const value = attribute(node, name)?.initializer;
  if (value && ts.isStringLiteral(value)) return value.text;
  if (value && ts.isJsxExpression(value)) return value.expression?.getText(source) ?? null;
  return null;
}

function isAnalysisAccordion(node) {
  if (!ts.isJsxElement(node) || jsxName(node) !== "AccordionSection") return false;
  return node.openingElement.attributes.properties.some((property) => {
    if (!ts.isJsxSpreadAttribute(property) || !ts.isCallExpression(property.expression)) return false;
    return property.expression.expression.getText(source) === "accProps"
      && property.expression.arguments[0]?.getText(source) === '"analysis"';
  });
}

const analysis = descendants(source).find(isAnalysisAccordion);
assert.ok(analysis, 'Project Use Analysis outer AccordionSection must exist');
const analysisNodes = descendants(analysis);

function jsxNodes(name) {
  return analysisNodes.filter((node) => jsxName(node) === name);
}

function findVariable(name) {
  return descendants(source).find((node) =>
    ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name,
  );
}

function propertyNames(objectLiteral) {
  const properties = ts.isInterfaceDeclaration(objectLiteral)
    ? objectLiteral.members
    : objectLiteral.properties;
  return properties
    .filter((property) => ts.isPropertyAssignment(property) || ts.isPropertySignature(property))
    .map((property) => property.name?.getText(source).replaceAll(/['"]/g, ""));
}

function wrapperById(id) {
  return analysisNodes.find((node) =>
    ts.isJsxElement(node)
      && jsxName(node) === "div"
      && literalAttribute(node, "id") === id,
  );
}

test("the complete RunDetail TSX parses without syntax diagnostics", () => {
  assert.deepEqual(source.parseDiagnostics, []);
});

test("the Project Use Analysis subtree is flat: no per-panel Card or Collapsible wrappers", () => {
  const banned = analysisNodes
    .map(jsxName)
    .filter((name) => name && /^(?:Card(?:[A-Z][A-Za-z0-9]*)?|Collapsible(?:[A-Z][A-Za-z0-9]*)?)$/.test(name));
  assert.deepEqual(banned, []);
});

test("rendered subsection headings follow the filtered numbering registry without gaps", () => {
  const registry = findVariable("projectUseSubsections");
  assert.ok(registry?.initializer && ts.isCallExpression(registry.initializer));
  const headingList = registry.initializer.arguments[0];
  assert.ok(headingList && ts.isArrayLiteralExpression(headingList));
  const declared = headingList.elements.map((entry) => {
    assert.ok(ts.isArrayLiteralExpression(entry));
    return entry.elements[0].text;
  });
  const rendered = jsxNodes("KypSubhead").map((node) => {
    const expression = attribute(node, "subsection")?.initializer;
    assert.ok(expression && ts.isJsxExpression(expression) && expression.expression);
    const property = expression.expression;
    assert.ok(ts.isPropertyAccessExpression(property));
    return property.name.text;
  });
  assert.deepEqual(rendered, declared);
  assert.equal(rendered.at(-1), "google", "Google Maps must remain the final non-daycare subsection");
});

test("the area-scope control appears once and is guarded by actual scoped data", () => {
  const controls = jsxNodes("ProjectUseAreaControl");
  assert.equal(controls.length, 1);
  let expression = controls[0].parent;
  while (expression && !ts.isJsxExpression(expression)) expression = expression.parent;
  assert.ok(expression && expression.expression);
  const guard = expression.expression.getText(source);
  assert.match(guard, /groceryData\s*\|\|\s*communityGroceryData/);
  assert.match(guard, /seniorsData\s*\|\|\s*seniorsZipData/);
  assert.match(guard, /childcareData\s*\|\|\s*communityChildcareData/);
  assert.match(guard, /!isDaycare/);
});

test("school-use childcare access keeps raw metrics but suppresses category takeaways", () => {
  const accessView = findVariable("childcareAccessTabs");
  assert.ok(accessView);
  const meters = descendants(accessView).filter((node) => jsxName(node) === "ChildcareDemandMeter");
  assert.equal(meters.length, 2, "ZIP and community-area views should both use the shared data component");
  for (const meter of meters) {
    assert.equal(literalAttribute(meter, "showInterpretation"), "false");
  }
});

test("each licensed-business family uses the shared business-list component", () => {
  const expected = new Map([
    ["print-section-grocery", 2],
    ["print-section-nearby-business", 1],
    ["print-section-nearby-business-ev", 1],
    ["print-section-nearby-business-hotels", 1],
    ["print-section-nearby-business-restaurants", 1],
    ["print-section-nearby-business-coffee", 1],
    ["print-section-nearby-business-bars", 1],
    ["print-section-cannabis", 1],
  ]);
  for (const [id, count] of expected) {
    const wrapper = wrapperById(id);
    assert.ok(wrapper, `expected rendered data family ${id}`);
    assert.equal(
      descendants(wrapper).filter((node) => jsxName(node) === "ProjectUseBusinessList").length,
      count,
      `${id} should use the shared licensed-business list`,
    );
    assert.ok(
      descendants(wrapper).some((node) =>
        (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node))
          && literalAttribute(node, "className") === "kyp-src",
      ),
      `${id} should end with one source/scope/link-grade note`,
    );
  }
  assert.equal(jsxNodes("ProjectUseGoogleMaps").length, 1);
});

test("every non-daycare data subsection has an end-position source/scope disclosure", () => {
  const sourceSectionIds = [
    "print-section-childcare-demographics",
    "print-section-parents-labor",
    "print-section-daycare-estimator",
    "print-section-site-daycare-details",
    "print-section-childcare-capacity",
    "print-section-grocery",
    "print-section-vehicle-ownership",
    "print-section-seniors",
    "print-section-nearby-business",
    "print-section-ev-registrations",
    "print-section-nearby-business-ev",
    "print-section-nearby-business-hotels",
    "print-section-nearby-business-restaurants",
    "print-section-nearby-business-coffee",
    "print-section-nearby-business-bars",
    "print-section-cannabis",
  ];
  for (const id of sourceSectionIds) {
    const wrapper = wrapperById(id);
    assert.ok(wrapper, `expected rendered subsection ${id}`);
    assert.ok(
      descendants(wrapper).some((node) =>
        (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node))
          && literalAttribute(node, "className") === "kyp-src",
      ),
      `${id} must include a source/scope disclosure`,
    );
  }
});

test("obsolete project-use collapsible state aliases and interpretive banners are absent", () => {
  const removedKeys = new Set([
    "childcareAccess", "childcareDemographics", "parentsLaborForce", "daycareEstimator",
    "siteDaycareDetails", "ccap", "nearbyDayCares", "groceryAccess", "autoDependency",
    "seniorPopulation", "nearbyFillingStations", "evRegistrations", "evCharging",
    "nearbyHotels", "nearbyRestaurants", "nearbyCoffee", "nearbyBars", "cannabisMarket",
  ]);
  const states = descendants(source).find((node) =>
    ts.isInterfaceDeclaration(node) && node.name.text === "SectionStates",
  );
  assert.ok(states);
  assert.deepEqual(propertyNames(states), propertyNames(states).filter((key) => !removedKeys.has(key)));
  const defaults = findVariable("DEFAULT_SECTION_STATES");
  assert.ok(defaults?.initializer && ts.isObjectLiteralExpression(defaults.initializer));
  assert.deepEqual(
    propertyNames(defaults.initializer),
    propertyNames(defaults.initializer).filter((key) => !removedKeys.has(key)),
  );
  assert.doesNotMatch(text, /const\s+isNearbyDayCaresOpen\b/);
  assert.doesNotMatch(text, /\b(?:childcareViewMode|seniorsViewMode)\b/);
  for (const phrase of [
    "Food Desert (No Grocery Stores)",
    "Limited Grocery Access",
    "Good Grocery Access",
    "Strong Demand for Senior Care",
    "Moderate Demand for Senior Care",
    "Limited Demand for Senior Care",
    "Market Assessment",
    "High Auto Dependency",
    "Small delta =",
    "This area is at the city average",
  ]) {
    assert.ok(!analysis.getText(source).includes(phrase), `removed interpretation remains: ${phrase}`);
  }
});