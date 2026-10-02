import assert from "node:assert/strict";
import test from "node:test";
import { childcareCitywideCcapStats } from "./childcareCcapStats";

test("citywide comparison uses the actual summed denominator, not an average of area percentages", () => {
  assert.deepEqual(childcareCitywideCcapStats([
    { ccap_children_total: 100, total_capacity: 100 }, { ccap_children_total: 0, total_capacity: 300 },
  ]), { citywide_ccap_children: 100, citywide_capacity: 400, citywide_pct_ccap: 25 });
});

test("missing citywide counts and no denominator are unknown; an observed zero numerator remains 0%", () => {
  assert.equal(childcareCitywideCcapStats([]).citywide_pct_ccap, null);
  assert.equal(childcareCitywideCcapStats([{ ccap_children_total: 0, total_capacity: 0 }]).citywide_pct_ccap, null);
  assert.equal(childcareCitywideCcapStats([{ ccap_children_total: null, total_capacity: 100 }]).citywide_pct_ccap, null);
  assert.equal(childcareCitywideCcapStats([{ ccap_children_total: 0, total_capacity: 100 }]).citywide_pct_ccap, 0);
});