---
name: Contractor rankings pipeline
description: How Contractor Discovery data is built from permits, and the rules that keep its rankings/activity honest.
---

Contractor Discovery is derived **entirely from the Chicago Building Permits Socrata dataset (ydr8-5enu)** — there is no contractor API. Trade classification is keyword matching on work descriptions (one permit can count toward multiple trades; falls back to `general`), so specialty breakdowns are inflated by nature.

Rules established (July 2026):
- **Never rank a trade by global totals.** When a specialty is selected, sort by permits *in that trade* and require primary-specialty match or ≥3 trade permits. **Why:** mega-electricians topped every trade (even "Bathroom") because filtering only needed one matching permit.
- **Compute active/inactive live from lastPermitDate** (≤30d Active, ≤90d Recent, else Inactive) — never trust the build-time `isActive` flag, which freezes at index-build time and disagrees with badges once data ages.
- **Rebuilds must fail hard, never publish partial data:** the build script throws on any fetch failure, sanity-checks size (≥100k permits, ≥1k contractors), and writes atomically (tmp + rename). **Why:** it previously `break`-ed on errors and wrote whatever it had.
- rankings.json refreshes monthly via the unified dataRefresh scheduler (30-day mtime check, async exec of the build script; included in startup/hot-reload stale checks).

**How to apply:** any new permit-derived ranking (architects, expeditors, etc.) should follow the same pattern — trade-specific sorting, live activity, fail-hard atomic rebuilds.
