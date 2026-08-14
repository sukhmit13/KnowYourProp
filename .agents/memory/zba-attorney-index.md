---
name: ZBA attorney index rebuild
description: How the 5-year ZBA attorney ranking index (zba_cases) rebuilds — atomic swap, sanity floors, monthly scheduler, and the pitfalls hit while wiring it.
---

# ZBA attorney index rebuild

The report's "zoning attorneys in this ward" table and Discovery's attorney rankings both read the `zba_cases` DB table, rebuilt by the ZBA index build script from 5 years of chicago.gov ZBA resolution PDFs.

Rules established (Aug 2026):
- **Atomic + fail hard:** collect all rows in memory, then one transaction (delete + batch insert). Sanity floors before swap: >=10 PDFs, >=200 cases, **>=70% ward-resolution rate** (a Census geocoder outage would otherwise swap in a ward-less index).
- **Ward resolution must stay lightweight:** Census geocode + turf point-in-polygon against the local ward GeoJSON (`ward` property). The original version ran the full property lookup (zoning/TIF/parcel APIs) per case and took hours.
- **Monthly auto-refresh** lives in the unified data-refresh scheduler; staleness comes from the DB (last completed row in `zba_index_runs`, 30 days), not a file mtime. A startup check triggers it since server restarts reset the interval. `onRefresh('zba')` clears the in-memory summary cache.

**Why spawn, not exec:** the build logs heavily; `exec`'s maxBuffer (even 32MB) fills and kills the child mid-run with a misleading "Command failed". The scheduler uses `spawn`, drains stdout, keeps only a stderr tail.

**Production (autoscale) cannot scrape.** Autoscale instances throttle/die between requests — spawned hour-long builds die silently, leaving `zba_index_runs` rows stuck at `processing` forever (happened Jan + Aug 2026). So prod NEVER spawns the build: dev rebuilds write `server/data/zba_snapshot.json` (ships with each publish via the dist/data copy), and prod imports it at startup — idempotent via a `snapshot:<builtAt>` marker on the completed run row, plus cleanup of stale processing rows. Any future DB-backed dataset that needs heavy rebuilds should use this same snapshot-ship pattern.

Other pitfalls:
- Long-running background processes started from agent shell sessions die when the session ends (even with setsid/nohup). Run long rebuilds inside the app server via the scheduler.
- `pkill -f <pattern>` kills the agent's own shell if the pattern appears in the command line — bracket a character (`pkill -f "build_zba[_]index"`).
- Ward assignment uses *current* ward boundaries for all 5 years of cases (pre-2023 remap cases may be misclassified) — accepted tradeoff, revisit if a user questions ward counts.
