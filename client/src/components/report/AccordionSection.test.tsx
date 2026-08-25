import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildSubsectionNumbers, KypSubhead, SectionNumberContext } from "./AccordionSection";

test("subsection labels are contiguous for every rendered heading", () => {
  const numbers = buildSubsectionNumbers([
    ["history", true],
    ["professionals", false],
    ["violations", true],
  ]);

  assert.deepEqual(numbers, { history: 1, violations: 2 });

  const markup = renderToStaticMarkup(
    <SectionNumberContext.Provider value={4}>
      <KypSubhead subsection={numbers.history}><span className="lbl">History</span></KypSubhead>
      <KypSubhead subsection={numbers.violations}><span className="lbl">Violations</span></KypSubhead>
    </SectionNumberContext.Provider>,
  );

  assert.match(markup, />04\.1</);
  assert.match(markup, />04\.2</);
  assert.doesNotMatch(markup, />04\.3</);

  const loadingMarkup = renderToStaticMarkup(
    <SectionNumberContext.Provider value={4}>
      <KypSubhead><span className="lbl">Loading section</span></KypSubhead>
    </SectionNumberContext.Provider>,
  );

  assert.doesNotMatch(loadingMarkup, /class="n"/);
});