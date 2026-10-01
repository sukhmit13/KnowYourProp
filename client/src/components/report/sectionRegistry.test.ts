import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { REPORT_SECTION_TITLES, SECTION_META, SECTION_ORDER } from "./sectionRegistry";

test("approved report titles are bound consistently to section, print, and jump surfaces", () => {
  assert.deepEqual(REPORT_SECTION_TITLES, {
    businessLicenses: "Business License History at This Address",
    newBusinessLicenses: "New License Issuances Nearby",
    zoning: "Zoning & Allowed Uses",
    zoningHistory: "Recorded Zoning Actions",
  });

  assert.equal(SECTION_META.zoning.title, REPORT_SECTION_TITLES.zoning);
  assert.equal(SECTION_META.zoning.anchorId, "section-zoning");
  assert.equal(SECTION_META.newBusinessLicenses.title, REPORT_SECTION_TITLES.newBusinessLicenses);
  assert.equal(SECTION_META.newBusinessLicenses.anchorId, "section-newBusinessLicenses");
  const runDetail = readFileSync(new URL("../../pages/RunDetail.tsx", import.meta.url), "utf8");
  const accordionSection = readFileSync(new URL("./AccordionSection.tsx", import.meta.url), "utf8");
  const nearbyLicenses = readFileSync(new URL("./NewBusinessLicensesSection.tsx", import.meta.url), "utf8");
  assert.match(runDetail, /<AccordionSection \{\.\.\.accProps\("zoning"\)\}>[\s\S]*?\{facts\?\.zoning && \(/);

  assert.match(runDetail, /businessLicenses:\s*\{\s*title:\s*REPORT_SECTION_TITLES\.businessLicenses/);
  assert.match(runDetail, /zoningHistory:\s*\{\s*title:\s*REPORT_SECTION_TITLES\.zoningHistory/);
  assert.match(runDetail, /\{\s*id: 'business-licenses', label: REPORT_SECTION_TITLES\.businessLicenses/);
  assert.match(runDetail, /\{\s*id: 'project-type', label: REPORT_SECTION_TITLES\.zoning/);
  assert.match(runDetail, /\{\s*id: 'zoning-details', label: 'Zoning District Details'/);
  assert.match(runDetail, /\{\s*id: 'zoning-history', label: REPORT_SECTION_TITLES\.zoningHistory/);

  for (const { entry, target } of [
    {
      entry: "{ label: REPORT_SECTION_TITLES.zoning, icon: Scale, action: () => { setAccHidden((m) => ({ ...m, zoning: false })); setAccOpen((m) => ({ ...m, zoning: true })); return 'section-zoning'; } },",
      target: "section-zoning",
    },
    {
      entry: "{ label: REPORT_SECTION_TITLES.zoningHistory, icon: Gavel, action: () => { setAccHidden((m) => ({ ...m, zoningHistory: false })); setAccOpen((m) => ({ ...m, zoningHistory: true })); return 'print-section-zoning-history'; } },",
      target: "print-section-zoning-history",
    },
    {
      entry: "{ label: REPORT_SECTION_TITLES.businessLicenses, icon: FileText, action: () => { setAccHidden((m) => ({ ...m, businessLicenses: false })); setAccOpen((m) => ({ ...m, businessLicenses: true })); return 'print-section-business-licenses'; } },",
      target: "print-section-business-licenses",
    },
    {
      entry: "{ label: REPORT_SECTION_TITLES.newBusinessLicenses, icon: FileText, action: () => { setAccHidden((m) => ({ ...m, newBusinessLicenses: false })); setAccOpen((m) => ({ ...m, newBusinessLicenses: true })); return 'section-newBusinessLicenses'; } },",
      target: "section-newBusinessLicenses",
    },
  ]) {
    assert.ok(runDetail.includes(entry), `jump binding exists for ${target}`);
  }

  assert.match(runDetail, /id="print-section-business-licenses"/);
  assert.match(runDetail, /id="print-section-zoning-history"/);
  assert.match(runDetail, /id="print-section-project-type"/);
  assert.match(runDetail, /id="print-section-zoning-details"/);
  assert.match(nearbyLicenses, /id="print-section-new-business-licenses"/);
  assert.match(accordionSection, /id=\{`section-\$\{id\}`\}/);
  assert.match(runDetail, /aria-label=\{REPORT_SECTION_TITLES\.businessLicenses\}/);
  assert.match(runDetail, /aria-label=\{REPORT_SECTION_TITLES\.zoningHistory\}/);
  assert.match(nearbyLicenses, /aria-label=\{REPORT_SECTION_TITLES\.newBusinessLicenses\}/);
  assert.match(runDetail, /if \(sectionId === 'project-type'\) \{\s*const row = document\.getElementById\('section-zoning'\);\s*if \(row instanceof HTMLElement\) return row;/);
  assert.match(runDetail, /\['business-licenses', 'zoning-history'\]\.includes\(sectionId\)[\s\S]*?anchor\.closest\('\.kyp-accrow'\)/);
  assert.match(runDetail, /if \(sectionId === 'new-business-licenses'\) \{\s*const row = document\.getElementById\('section-newBusinessLicenses'\);\s*if \(row instanceof HTMLElement\) return row;/);
  const printTargetHelper = runDetail.match(/const getPrintTarget = \([\s\S]*?\n    \};/)?.[0];
  assert.ok(printTargetHelper, "print target helper stays available to the selection/cleanup passes");
  assert.doesNotMatch(printTargetHelper, /'ward'|'zoning-details'/);
  assert.match(printTargetHelper, /return anchor;\s*\n/);
  assert.match(runDetail, /id="print-section-ward"/);
  assert.match(runDetail, /\{\s*id: 'business-licenses', label: REPORT_SECTION_TITLES\.businessLicenses, defaultChecked: true/);
  assert.match(runDetail, /\{\s*id: 'new-business-licenses', label: REPORT_SECTION_TITLES\.newBusinessLicenses, defaultChecked: true/);
  assert.match(runDetail, /\{\s*id: 'project-type', label: REPORT_SECTION_TITLES\.zoning, defaultChecked: true/);
  assert.match(runDetail, /\{\s*id: 'zoning-details', label: 'Zoning District Details', defaultChecked: true/);
  assert.match(runDetail, /\{\s*id: 'zoning-history', label: REPORT_SECTION_TITLES\.zoningHistory, defaultChecked: true/);
});

test("canonical title updates preserve the established report section order", () => {
  assert.deepEqual(SECTION_ORDER, [
    "countyRecord", "permits", "ownership", "historic", "zoning", "valuation", "market", "incentives", "transit", "newBusinessLicenses", "newConstruction",
    "crime", "proximity", "schools", "entCulture", "corridor", "development", "people", "news",
  ]);
  const runDetail = readFileSync(new URL("../../pages/RunDetail.tsx", import.meta.url), "utf8");
  const defaultOrder = runDetail.match(/const ACC_DEFAULT_ORDER = \[([^\]]*)\];/);
  assert.ok(defaultOrder, "accordion default order remains declared");
  assert.deepEqual([...defaultOrder[1].matchAll(/"([^"]+)"/g)].map(([, id]) => id), [
    "ownership", "propertyTax", "historic", "zoning", "zoningHistory", "potential", "incentives", "transit", "crime", "businessLicenses", "valuation", "listing",
    "countyRecord", "permits", "analysis", "newBusinessLicenses", "newConstruction", "market", "proximity", "schools", "entCulture", "corridor", "development", "people", "news",
  ]);
});

test("proximity, schools, and culture are independent report sections", () => {
  const proximity = SECTION_ORDER.indexOf("proximity");
  assert.ok(proximity >= 0);
  assert.deepEqual(SECTION_ORDER.slice(proximity, proximity + 3), ["proximity", "schools", "entCulture"]);
  assert.equal(SECTION_META.proximity.title, "Proximity");
  assert.equal(SECTION_META.schools.anchorId, "print-section-schools-daycare");
  assert.equal(SECTION_META.entCulture.anchorId, "print-section-entertainment-culture");
  assert.ok(!SECTION_META.proximity.info.join(" ").match(/school|dining|culture|transit|traffic/i));
});

test("Pre-Title Check is absent from the report, navigation, and export settings", () => {
  assert.ok(!SECTION_ORDER.some((id) => id === ("debt" as string)));
  assert.equal(SECTION_META.debt, undefined);
  const source = readFileSync(new URL("../../pages/RunDetail.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /PreTitleCheck|preTitleCheck|pre-title-check/);
  assert.match(source, /<OwnershipTitleSection\b/);
  assert.match(source, /useDebtSnapshot/);
});

test("persisted report orders drop the retired section and preserve custom ordering", () => {
  const source = readFileSync(new URL("../../pages/RunDetail.tsx", import.meta.url), "utf8");
  const ast = ts.createSourceFile("RunDetail.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) &&
        (node.name.text.startsWith("ACC_") && node.name.text.endsWith("_ORDER") ||
         node.name.text.startsWith("ACC_BEFORE_") || node.name.text === "mergeAccOrder")) {
      declarations.push(`const ${node.getText(ast)};`);
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  const { outputText } = ts.transpileModule(
    `${declarations.join("\n")}\nconst result = mergeAccOrder(saved, ACC_DEFAULT_ORDER);`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  );
  const merge = new Function("saved", "id", "localStorage", `${outputText}\nreturn result;`);
  const saved = ["news", "ownership", "debt", "market", "people"];
  const result: string[] = merge(saved, "fixture", { getItem: () => "done" });
  assert.ok(!result.includes("debt"));
  assert.deepEqual(result.filter((id) => saved.includes(id)), ["news", "ownership", "market", "people"]);
  assert.ok(result.includes("propertyTax"));
});