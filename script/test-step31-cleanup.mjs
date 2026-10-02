import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import postcss from "postcss";
import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";
import { transform } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const legacy = /sch-badge|val-step|val-cov|val-mt|val-formula|calc-inputs/;
const css = fs.readFileSync("client/src/index.css", "utf8");
assert.doesNotMatch(css, legacy, "all six retired selector families are gone");
// Verify every unrelated rule, declaration, and media condition stays intact.
const previous = postcss.parse(execFileSync("git", ["show", "HEAD:client/src/index.css"], { encoding: "utf8" }));
previous.walkRules(rule => { if (legacy.test(rule.selector)) rule.remove(); });
const semantic = node => {
  if (node.type === "comment") return undefined;
  return {
    type: node.type, selector: node.selector, name: node.name, params: node.params,
    prop: node.prop, value: node.value, important: node.important,
    nodes: node.nodes?.map(semantic).filter(Boolean),
  };
};
assert.deepEqual(semantic(postcss.parse(css)), semantic(previous), "only unused rules were removed");

const source = fs.readFileSync("client/src/pages/AreaDetail.tsx", "utf8");
assert.doesNotMatch(source, /deltaInterpretation|deltaLevel|Small delta =|Large delta =/);
assert.match(source, /Data source: American Community Survey 5-Year Estimates \(B09001, B23008\)/);
const traverse = traverseModule.default ?? traverseModule;
let deltaNode;
traverse(parse(source, { sourceType: "module", plugins: ["typescript", "jsx"] }), {
  JSXElement(path) {
    if (path.node.openingElement.attributes.some(attribute =>
      attribute.type === "JSXAttribute" && attribute.name.name === "data-testid" &&
      attribute.value?.value === "area-labor-force-delta")) deltaNode = path.node;
  },
});
assert.ok(deltaNode, "actual Area Detail numeric delta block found");
const block = source.slice(deltaNode.start, deltaNode.end);
assert.doesNotMatch(block, /Badge|destructive|deltaLevel|deltaInterpretation/);
// Render the actual JSX, not a replacement, across former verdict thresholds.
const { code } = await transform(`return (${block});`, { loader: "tsx", jsx: "transform" });
const render = new Function("React", "delta", code);
for (const delta of [0, 4, 7, 15, -3]) {
  const html = renderToStaticMarkup(render(React, delta));
  assert.match(html, new RegExp(`${delta} percentage points`));
  assert.match(html, /text-foreground/);
  assert.doesNotMatch(html, /destructive|text-red|text-rose|higher daycare demand|stay home/);
}

const calculator = fs.readFileSync("client/src/components/report/ValuationCalculator.tsx", "utf8");
assert.ok((calculator.match(/kyp-seg/g) ?? []).length >= 4);
assert.doesNotMatch(calculator, /kyp-block[^\n]*(?:>Simple<|>Detailed<|>Advanced<)/);
assert.doesNotMatch(calculator, /<Step number=\{(?!1\})\d+\}/);
assert.match(calculator, /Save price only/);
const coverage = fs.readFileSync("client/src/components/report/ValuationCoverage.tsx", "utf8");
assert.equal((coverage.match(/className="kyp-covrow"/g) ?? []).length, 2);
assert.match(coverage, /Your NOI/);
assert.match(coverage, /per year/);
console.log("Step 31 CSS isolation, Area Detail rendering, and valuation guards passed");