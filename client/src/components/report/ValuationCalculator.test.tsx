import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { SectionNumberContext } from "./AccordionSection";
import { ValuationCalculator } from "./ValuationCalculator";

test("valuation uses one numbered NOI path with unknown daycare inputs kept blank", () => {
  const markup = renderToStaticMarkup(
    <ValuationCalculator
      runId={null}
      isDaycare
      buildingSqFt={0}
      daycareRevenueRate=""
      taxesInput=""
      insuranceInput=""
    />,
  );

  assert.match(markup, /Deal Inputs/);
  assert.match(markup, /Income → NOI/);
  assert.match(markup, /Revenue source/);
  assert.match(markup, /Unknown annual revenue/);
  assert.match(markup, /<span class="bv">—<\/span><\/div><div class="kyp-block ind"><span class="bl">Total NOI/);
  assert.match(markup, /Enter the remaining inputs above to calculate deal metrics/);
  const $ = load(markup);
  assert.equal($(".kyp-calcstep").length, 5);
  const daycareFooters = $("#valuation-calculator-section .kyp-src");
  assert.equal(daycareFooters.length, 5, "each of the five daycare steps has one source footer");
  assert.deepEqual(daycareFooters.toArray().map((footer) => $(footer).find("p").length), [2, 2, 2, 2, 1]);
  assert.match(markup, /Business operating expenses · % of revenue/);
  assert.match(markup, /Default 60% · owns site/);
  assert.doesNotMatch(markup, /Site Cashflow/);
});

test("SBA listing revenue is a named source with an explicit manual override and default ratio", () => {
  const markup = renderToStaticMarkup(
    <ValuationCalculator
      runId={null}
      initialLoanType="sba_business"
      listingRevenue={584126}
      listingListPrice={350000}
      taxesInput="0"
      insuranceInput="0"
    />,
  );

  assert.match(markup, /Business revenue source/);
  assert.match(markup, /Active listing · seller claim/);
  assert.match(markup, /Enter my own/);
  assert.match(markup, /584,126 annual revenue/);
  assert.match(markup, /75% default · rent included/);
  assert.match(markup, /Business-only Simple includes leased occupancy in its ratio/);
});

test("conventional primary/no-income path shows property costs and a currency-only monthly PITI readout", () => {
  const markup = renderToStaticMarkup(
    <SectionNumberContext.Provider value={36}>
      <ValuationCalculator
        runId={null}
        initialPurchasePrice="485000"
        taxesInput="8900"
        insuranceInput="2400"
      />
    </SectionNumberContext.Provider>,
  );
  const $ = load(markup);
  assert.match(markup, /Property costs/);
  assert.equal($(".kyp-readout .rl").text(), "Monthly payment");
  assert.match($(".kyp-readout .rv").text(), /^\$\d[\d,]*$/);
  assert.equal($(".kyp-readout .rn a").attr("href"), "#valuation-subsection-36-2");
  assert.equal($("#valuation-subsection-36-2").length, 1, "readout link points to a rendered step");
  assert.equal($(".kyp-calcstep").length, 3);
  assert.doesNotMatch(markup, /Coverage Check/);
});

test("listing-only NOI source keeps a final manual NOI fallback instead of substituting gross rent", () => {
  const markup = renderToStaticMarkup(
    <ValuationCalculator runId={null} listingStatedNoi={135000} />,
  );
  const $ = load(markup);
  const options = $('select[aria-label="NOI source"] option').toArray().map((option) => $(option).text());
  assert.equal(options.at(-1), "Enter my own");
  assert.match(markup, /value="own_noi"/);
  assert.match(markup, /Listing-stated NOI · seller claim/);
  assert.doesNotMatch(markup, /Gross rent.*listing NOI/i);
});

test("daycare leased-space Simple mode defaults to 75% with occupancy in business expenses", () => {
  const markup = renderToStaticMarkup(
    <ValuationCalculator
      runId={null}
      isDaycare
      initialLoanType="sba_business"
      buildingSqFt={6000}
      daycareRevenueRate="2,275"
      taxesInput="21400"
      insuranceInput="12600"
    />,
  );
  assert.match(markup, /Default 75% · leased site/);
  assert.match(markup, /Leased occupancy is already inside this expense ratio/);
  assert.match(markup, /landlord property costs stay outside this business-only statement/);
  assert.doesNotMatch(markup, /Annual property taxes · Cook County record/);
});
