import assert from "node:assert/strict";
import { getHmdaYearRateForScope, type HmdaRates } from "./use-runs";

const tractRates: HmdaRates = {
  avgRate: 6.4,
  avgFirstLienRate: 6.4,
  rateCount: 20,
  firstLienRateCount: 18,
  y2025: { avgFirstLienRate: 6.1, firstLienRateCount: 8 },
  y2024: { avgFirstLienRate: 6.8, firstLienRateCount: 10 },
  y2023: { avgFirstLienRate: 7.2, firstLienRateCount: 12 },
};

const communityRates: HmdaRates = {
  avgRate: 6.2,
  avgFirstLienRate: 6.2,
  rateCount: 40,
  firstLienRateCount: 36,
  y2025: { avgFirstLienRate: 5.9, firstLienRateCount: 16 },
  y2024: { avgFirstLienRate: 6.5, firstLienRateCount: 20 },
};

const rates = { tract: tractRates, community: communityRates };

assert.equal(getHmdaYearRateForScope(rates, "community", 2025), communityRates.y2025);
assert.equal(getHmdaYearRateForScope(rates, "tract", 2025), tractRates.y2025);
assert.equal(getHmdaYearRateForScope(rates, "community", 2023), null);
assert.equal(getHmdaYearRateForScope(rates, "tract", 2023), tractRates.y2023);
assert.equal(getHmdaYearRateForScope(undefined, "community", 2024), null);