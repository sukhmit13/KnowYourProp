---
name: Property context guardrails
description: Durable rules for the property memory context system (extraction, writes, coverage semantics)
---

Both original preconditions are now satisfied: writes are serialized via an in-process per-run lock (promise chain in the context module), and the inspection endpoint `GET /api/property-context/:runId` is dev-gated (never mounted in prod). Remaining durable rules:

1. **Extraction must stay cache/local-only — some helpers hide live fetches.** The tax/lien helper functions spawn Playwright scrapers on cache miss; the landmark checker triggers a live city-API fallback *only when an address argument is passed*.
   **Why:** Extraction runs inline before paid report generation; a hidden scrape adds minutes of latency or hangs the request.
   **How to apply:** In the extractor, read the tax/lien cache tables directly via db.select, and call the landmark check with coordinates only (no address).

2. **Derived metrics must be written with `verified: true`.** Validation rule 2 only *downgrades* verification (unverifies if any input fact is unverified); it never upgrades. The schema default is false.
   **Why:** Omitting the flag silently produces unverified derived metrics even when all inputs are verified, and the report prompt then distrusts them.

3. **`source_coverage_status` is owned by saveContext's recompute.** saveContext unconditionally recomputes it as a verified-facts ratio; any other write to the field is dead code that silently loses.

4. **The run lock is in-process only.** If production ever runs multiple server instances, concurrent generates for the same run can interleave load-mutate-save (last write wins). Extraction's idempotent wipe-and-rewrite bounds damage to a stale overwrite, but revisit locking before multi-instance scaling.
