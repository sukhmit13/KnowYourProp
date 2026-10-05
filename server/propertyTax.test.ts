import assert from "node:assert/strict";
import test from "node:test";
import { hasUsableTreasurerData, isTreasurerCacheStale, parseTreasurerText } from "./propertyTax";

// County-format fixture: headings contain NBSP; installment labels contain
// "Tax Year" too and must not terminate a year block prematurely.
const countyText = `Are Your Taxes Paid?
Tax Year\u00a02023\u00a0(billed in\u00a02024)
Total Amount Billed:\u00a0$15,195.89
1st INSTALLMENT - Tax Year 2023
Original Billed Amount:
$8,146.29
Current Amount Due:
$0.00
2nd INSTALLMENT - Tax Year 2023
Original Billed Amount:
$7,049.60
Current Amount Due:
$0.00
Total Amount Due:
$0.00
Tax Year\u00a02024\u00a0(billed in\u00a02025)
Total Amount Billed:\u00a0$18,217.38
1st INSTALLMENT - Tax Year 2024
Original Billed Amount:
$8,357.74
Current Amount Due:
$0.00
2nd INSTALLMENT - Tax Year 2024
Original Billed Amount:
$9,859.64
Current Amount Due:
$77.30
Total Amount Due:
$77.30
Tax Year\u00a02025\u00a0(billed in\u00a02026)
Total Amount Billed:\u00a0$18,810.81
1st INSTALLMENT - Tax Year 2025
Original Billed Amount:
$10,019.57
Current Amount Due:
$10,545.60
2nd INSTALLMENT - Tax Year 2025
Original Billed Amount:
$8,791.24
Current Amount Due:
$8,857.17
Total Amount Due:
$19,402.77
ATTENTION: Our records indicate a delinquent balance.
20-Year Property Tax Bill History
Tax Year 2006:
$7,092.23`;

test("county NBSP headings yield all verified bills and installment/payment amounts", () => {
  const parsed = parseTreasurerText(countyText);
  assert.equal(parsed.totalAnnualTaxAmount, 18810.81);
  assert.equal(parsed.paymentStatus, "delinquent");
  assert.deepEqual(parsed.taxYears.map(y => y.year), [2025, 2024, 2023]);
  assert.deepEqual(parsed.taxYears.map(y => [y.installment1, y.installment2, y.amountDue, y.status]), [
    [10019.57, 8791.24, 19402.77, "unpaid"],
    [8357.74, 9859.64, 77.3, "partial"],
    [8146.29, 7049.6, 0, "paid"],
  ]);
});

test("ordinary, repeated, and narrow non-breaking heading spaces parse identically", () => {
  const expected = parseTreasurerText(countyText);
  for (const replacement of [" ", "  ", "\u202f", "\t"]) {
    assert.deepEqual(parseTreasurerText(countyText.replace(/\u00a0/g, replacement)), expected);
  }
});

test("a first installment does not invent a second installment or a full-year bill", () => {
  const parsed = parseTreasurerText(`Are Your Taxes Paid?
Tax Year\u00a02025\u00a0(billed in\u00a02026)
Total Amount Billed: $10,019.57
1st INSTALLMENT - Tax Year 2025
Original Billed Amount: $10,019.57
Current Amount Due: $0.00
20-Year Property Tax Bill History`);
  assert.equal(parsed.taxYears[0].installment2, 0);
  assert.equal(parsed.taxYears[0].billed, 10019.57);
  assert.equal(parsed.taxYears[0].status, "unknown");
  assert.equal(parsed.totalAnnualTaxAmount, null);
});

test("an incomplete newest year leaves the latest complete annual bill visible", () => {
  const withoutSecondInstallment = countyText.replace(
    /2nd INSTALLMENT - Tax Year 2025[\s\S]*?ATTENTION:/,
    "ATTENTION:",
  );
  const parsed = parseTreasurerText(withoutSecondInstallment);
  assert.equal(parsed.taxYears[0].year, 2025);
  assert.equal(parsed.taxYears[0].installment2, 0);
  assert.equal(parsed.totalAnnualTaxAmount, 18217.38);
});

test("status-only parser failures are not usable bills and are retried immediately", () => {
  const empty = { totalAnnualTaxAmount: null, paymentStatus: "delinquent" as const, taxYears: [], mailingOwnerName: null };
  assert.equal(hasUsableTreasurerData(empty), false);
  assert.equal(isTreasurerCacheStale({
    totalAnnualTaxAmount: null, paymentStatus: "delinquent",
    taxYearsJson: [], treasurerScrapedAt: new Date(),
  }), true);
  assert.equal(hasUsableTreasurerData({ ...empty, totalAnnualTaxAmount: 0 }), true, "verified zero is not unknown");
});

test("failed unknown lookups retain the retry cooldown; verified recent bills stay cached", () => {
  const recent = new Date();
  assert.equal(isTreasurerCacheStale({ totalAnnualTaxAmount: null, paymentStatus: "unknown", taxYearsJson: [], treasurerScrapedAt: recent }), false);
  assert.equal(isTreasurerCacheStale({
    totalAnnualTaxAmount: "18810.81", paymentStatus: "delinquent",
    taxYearsJson: [{ year: new Date().getFullYear() - 1 }], treasurerScrapedAt: recent,
  }), false);
});
