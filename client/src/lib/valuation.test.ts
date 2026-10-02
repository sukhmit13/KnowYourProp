import assert from "node:assert/strict";
import {
  computeBusinessIncome,
  computeDaycareScenarios,
  computeValuationMetrics,
  isSbaRealEstateDominant,
  type ValuationInputs,
} from "./valuation";

const inputs = (overrides: Partial<ValuationInputs> = {}): ValuationInputs => ({
  loanType: "conventional",
  purchasePriceInput: "100,000",
  interestRateInput: "0",
  presetDownPaymentPercent: 100,
  presetTermYears: 30,
  sbaBusinessPrice: "49",
  sbaRealEstatePrice: "51",
  sbaBusinessDownPercent: "100",
  sbaBusinessTermYears: "10",
  sbaBusinessInterestRate: "0",
  sbaRealEstateDownPercent: "100",
  sbaRealEstateTermYears: "25",
  sbaRealEstateInterestRate: "0",
  selectedNoi: 0,
  annualTaxesInput: "2,000",
  annualInsuranceInput: "1,000",
  ...overrides,
});

// Expense inclusion is explicit and independent of NOI sign and loan path.
for (const loanType of ["conventional", "sba_business", "sba_biz_re"]) {
  for (const selectedNoi of [0, -5000]) {
    const included = computeValuationMetrics(inputs({
      loanType,
      selectedNoi,
      noiIncludesPropertyExpenses: true,
    }));
    assert.equal(included.annualOperatingCosts, 0, `${loanType}, NOI ${selectedNoi}: already-net costs aren't deducted again`);
    assert.equal(included.annualCashFlow, selectedNoi - included.annualDebtService);

    const notIncluded = computeValuationMetrics(inputs({
      loanType,
      selectedNoi,
      noiIncludesPropertyExpenses: false,
    }));
    assert.equal(notIncluded.annualOperatingCosts, 3000, `${loanType}, NOI ${selectedNoi}: costs are subtracted once`);
    assert.equal(notIncluded.annualCashFlow, selectedNoi - notIncluded.annualDebtService - 3000);
  }
}

// Without the new opt-in, legacy callers retain their prior conventions.
assert.equal(computeValuationMetrics(inputs({ selectedNoi: 1000 })).annualOperatingCosts, 0);
assert.equal(computeValuationMetrics(inputs({ selectedNoi: -1 })).annualOperatingCosts, 3000);
assert.equal(computeValuationMetrics(inputs({ loanType: "sba_business", selectedNoi: 0 })).annualOperatingCosts, 0);

assert.equal(isSbaRealEstateDominant(49, 51), true, "exactly 51% RE share is dominant");
assert.equal(isSbaRealEstateDominant(50, 50), false);
assert.equal(isSbaRealEstateDominant(0, 0), false, "zero combined price is not dominant");

// Explicit zero is a real input, not a request to apply the default.
const zeroRateAndDown = computeValuationMetrics(inputs({
  presetDownPaymentPercent: 0,
  interestRateInput: "0",
}));
assert.equal(zeroRateAndDown.downPayment, 0);
assert.equal(zeroRateAndDown.loanAmount, 100000);
assert.ok(Math.abs(zeroRateAndDown.annualDebtService - 100000 / 30) < 1e-9);
assert.ok(Number.isFinite(zeroRateAndDown.annualDebtService));
assert.equal(computeValuationMetrics(inputs({ presetDownPaymentPercent: -10 })).downPayment, 0);
assert.equal(computeValuationMetrics(inputs({ presetDownPaymentPercent: 150 })).downPayment, 100000);
assert.ok(
  Math.abs(computeValuationMetrics(inputs({ presetDownPaymentPercent: 0, presetTermYears: 0 })).annualDebtService - 100000 / 30) < 1e-9,
  "invalid zero term uses a safe default",
);

const zeroSbaTerms = computeValuationMetrics(inputs({
  loanType: "sba_biz_re",
  sbaBusinessPrice: "100000",
  sbaRealEstatePrice: "0",
  sbaBusinessDownPercent: "0",
  sbaBusinessInterestRate: "0",
}));
assert.equal(zeroSbaTerms.downPayment, 0);
assert.ok(Math.abs(zeroSbaTerms.sbaBusinessMonthly - 100000 / 120) < 1e-9);
assert.ok(Number.isFinite(zeroSbaTerms.annualDebtService));
assert.equal(computeValuationMetrics(inputs({
  loanType: "sba_business",
  sbaBusinessPrice: "100000",
  sbaBusinessDownPercent: "-5",
})).downPayment, 0);
assert.equal(computeValuationMetrics(inputs({
  loanType: "sba_business",
  sbaBusinessPrice: "100000",
  sbaBusinessDownPercent: "125",
})).downPayment, 100000);

const malformed = computeValuationMetrics(inputs({
  purchasePriceInput: "Infinity",
  interestRateInput: "not a rate",
  presetDownPaymentPercent: Number.NaN,
  presetTermYears: Number.POSITIVE_INFINITY,
  selectedNoi: Number.NaN,
}));
for (const value of Object.values(malformed)) {
  if (typeof value === "number") assert.ok(Number.isFinite(value), "valuation outputs must remain finite");
}

assert.deepEqual(
  computeBusinessIncome({
    detailMode: "simple",
    revenueAnnual: 50000,
    operatingExpensesAnnual: 60000,
    costOfGoodsSoldAnnual: 999,
    payrollAnnual: 999,
    otherOperatingExpensesAnnual: 999,
    ownerSalaryAnnual: 999,
    ownerPersonalExpensesAnnual: 999,
    oneTimeItemsAnnual: 999,
    managerSalaryAnnual: 999,
  }),
  { bookOperatingProfit: -10000, sde: -10000, businessOperatingIncome: -10000 },
);
assert.deepEqual(
  computeBusinessIncome({
    detailMode: "detailed",
    revenueAnnual: 100000,
    operatingExpensesAnnual: 999999,
    costOfGoodsSoldAnnual: 20000,
    payrollAnnual: 30000,
    otherOperatingExpensesAnnual: 10000,
    ownerSalaryAnnual: 12000,
    ownerPersonalExpensesAnnual: 3000,
    oneTimeItemsAnnual: 2000,
    managerSalaryAnnual: 25000,
  }),
  { bookOperatingProfit: 40000, sde: 57000, businessOperatingIncome: 32000 },
);

const daycare = computeDaycareScenarios({ buildingSqFt: 1000, revenuePerChildMonthly: 1200 });
assert.deepEqual(daycare.map(({ key, capacity, children }) => ({ key, capacity, children })), [
  { key: "100_efficient", capacity: 13, children: 13 },
  { key: "100_comfortable", capacity: 11, children: 11 },
  { key: "75_efficient", capacity: 13, children: 9 },
  { key: "75_comfortable", capacity: 11, children: 8 },
]);
assert.equal(daycare[2].monthlyRevenue, 9 * 1200);
assert.equal(daycare[2].annualRevenue, 9 * 1200 * 12, "75% revenue uses the integer child count");
console.log("Valuation helper checks passed");