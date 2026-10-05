import assert from "node:assert/strict";
import test from "node:test";
import {
  computeDaycareScenarios, computeValuationMetrics, formatNumberInput,
  parseFormattedNumber, type ValuationInputs, type ValuationMetrics,
} from "./valuation";

const base: ValuationInputs = {
  loanType: "conventional", purchasePriceInput: "1,450,000", interestRateInput: "6.0",
  presetDownPaymentPercent: 20, presetTermYears: 30,
  sbaBusinessPrice: "650,000", sbaRealEstatePrice: "1,110,000",
  sbaBusinessDownPercent: "10", sbaBusinessTermYears: "25", sbaBusinessInterestRate: "10.25",
  sbaRealEstateDownPercent: "10", sbaRealEstateTermYears: "25", sbaRealEstateInterestRate: "6.0",
  selectedNoi: 643040, annualTaxesInput: "21,400", annualInsuranceInput: "12,600",
  noiIncludesPropertyExpenses: true,
};

// Recorded from the original pure calculator BEFORE the presentation rebuild.
// These literals deliberately are not recomputed by an alternative formula.
const fixtures: Array<{ name: string; input: Partial<ValuationInputs>; expected: ValuationMetrics }> = [
  { name: "primary residence", input: { purchasePriceInput: "550,000", selectedNoi: 0, noiIncludesPropertyExpenses: false },
    expected: { purchasePrice: 550000, downPayment: 110000, loanAmount: 440000,
      annualDebtService: 31656.267728065326, sbaBusinessMonthly: 0, sbaRealEstateMonthly: 0,
      annualTaxes: 21400, annualInsurance: 12600, annualOperatingCosts: 34000,
      monthlyPI: 2638.0223106721105, monthlyTaxes: 1783.3333333333333, monthlyInsurance: 1050,
      monthlyPITI: 5471.3556440054435, annualCashFlow: -65656.26772806533, dscr: 0, capRate: 0,
      roi: -59.687516116423026, hasNoi: false, noiCoversExpenses: false } },
  { name: "single-family rental", input: { purchasePriceInput: "450,000", selectedNoi: 24980 },
    expected: { purchasePrice: 450000, downPayment: 90000, loanAmount: 360000,
      annualDebtService: 25900.582686598907, sbaBusinessMonthly: 0, sbaRealEstateMonthly: 0,
      annualTaxes: 0, annualInsurance: 0, annualOperatingCosts: 0,
      monthlyPI: 2158.381890549909, monthlyTaxes: 0, monthlyInsurance: 0,
      monthlyPITI: 2158.381890549909, annualCashFlow: -920.5826865989075,
      dscr: 0.9644570665556794, capRate: 5.551111111111111, roi: -1.0228696517765639,
      hasNoi: true, noiCoversExpenses: true } },
  { name: "multifamily", input: { selectedNoi: 82700 },
    expected: { purchasePrice: 1450000, downPayment: 290000, loanAmount: 1160000,
      annualDebtService: 83457.43310126313, sbaBusinessMonthly: 0, sbaRealEstateMonthly: 0,
      annualTaxes: 0, annualInsurance: 0, annualOperatingCosts: 0,
      monthlyPI: 6954.786091771927, monthlyTaxes: 0, monthlyInsurance: 0,
      monthlyPITI: 6954.786091771927, annualCashFlow: -757.4331012631301,
      dscr: 0.9909243182648081, capRate: 5.703448275862069, roi: -0.261183828021769,
      hasNoi: true, noiCoversExpenses: true } },
  { name: "business only", input: { loanType: "sba_business", selectedNoi: 132779 },
    expected: { purchasePrice: 650000, downPayment: 65000, loanAmount: 585000,
      annualDebtService: 65032.10638896798, sbaBusinessMonthly: 5419.342199080665, sbaRealEstateMonthly: 0,
      annualTaxes: 0, annualInsurance: 0, annualOperatingCosts: 0,
      monthlyPI: 5419.342199080665, monthlyTaxes: 0, monthlyInsurance: 0,
      monthlyPITI: 5419.342199080665, annualCashFlow: 67746.89361103202,
      dscr: 2.0417453373849903, capRate: 20.42753846153846, roi: 104.22599017081848,
      hasNoi: true, noiCoversExpenses: true } },
  { name: "business and real estate", input: { loanType: "sba_biz_re" },
    expected: { purchasePrice: 1760000, downPayment: 176000, loanAmount: 1584000,
      annualDebtService: 142270.95839905075, sbaBusinessMonthly: 5419.342199080665, sbaRealEstateMonthly: 6436.57100084023,
      annualTaxes: 0, annualInsurance: 0, annualOperatingCosts: 0,
      monthlyPI: 11855.913199920897, monthlyTaxes: 0, monthlyInsurance: 0,
      monthlyPITI: 11855.913199920897, annualCashFlow: 500769.04160094925,
      dscr: 4.519826162949996, capRate: 36.53636363636364, roi: 284.5278645459939,
      hasNoi: true, noiCoversExpenses: true } },
];

for (const fixture of fixtures) {
  test(`unchanged arithmetic: ${fixture.name}`, () => {
    assert.deepEqual(computeValuationMetrics({ ...base, ...fixture.input }), fixture.expected);
  });
}

test("daycare revenue and enrollment are numerically unchanged, by scenario key", () => {
  assert.deepEqual(computeDaycareScenarios({ buildingSqFt: 5600, revenuePerChildMonthly: 2275 })
    .map(({ label, ...numeric }) => numeric), [
    { key: "100_efficient", capacity: 74, children: 74, monthlyRevenue: 168350, annualRevenue: 2020200 },
    { key: "100_comfortable", capacity: 62, children: 62, monthlyRevenue: 141050, annualRevenue: 1692600 },
    { key: "75_efficient", capacity: 74, children: 55, monthlyRevenue: 125125, annualRevenue: 1501500 },
    { key: "75_comfortable", capacity: 62, children: 46, monthlyRevenue: 104650, annualRevenue: 1255800 },
  ]);
});

test("accounting display preserves blanks, signs, grouping, and in-progress decimals", () => {
  for (const [raw, expected] of [
    ["1450000", "1,450,000"], ["1450000.", "1,450,000."],
    ["1450000.50", "1,450,000.50"], ["1,450,000.5", "1,450,000.5"],
    ["", ""], ["  ", ""], ["-", "-"], ["-2500.20", "-2,500.20"],
    [".", "."], [".75", ".75"], ["6.00", "6.00"], ["0", "0"],
    ["001250", "1,250"], ["12345678901234567890", "12,345,678,901,234,567,890"],
  ]) assert.equal(formatNumberInput(raw), expected);
  assert.equal(parseFormattedNumber(formatNumberInput("1450000")), 1450000);
});
