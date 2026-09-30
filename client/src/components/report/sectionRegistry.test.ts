import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { SECTION_META, SECTION_ORDER } from "./sectionRegistry";

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