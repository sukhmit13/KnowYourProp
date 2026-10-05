import assert from "node:assert/strict";
import test from "node:test";
import { annualExpenseAtRatio, formatAnnualExpense, ratioForAnnualExpense } from "./daycareExpenseConversions";

test("Simple percentage and Detailed annual dollars preserve the same daycare NOI", () => {
  const revenue = 584_126;
  const ratio = 75;
  const simpleExpense = annualExpenseAtRatio(revenue, ratio);
  assert.notEqual(simpleExpense, null);

  const detailedInput = formatAnnualExpense(simpleExpense!);
  const detailedExpense = Number(detailedInput.replace(/,/g, ""));
  const detailedRatio = ratioForAnnualExpense(detailedExpense, revenue);
  const roundTripExpense = annualExpenseAtRatio(revenue, Number(detailedRatio));

  assert.equal(detailedExpense, simpleExpense);
  assert.equal(revenue - detailedExpense, revenue - roundTripExpense!);
});

test("Detailed costs cannot be represented by a ratio at zero revenue unless expenses are also zero", () => {
  assert.equal(ratioForAnnualExpense(100, 0), null);
  assert.equal(ratioForAnnualExpense(0, 0), "0");
});
