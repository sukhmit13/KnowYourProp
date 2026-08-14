---
name: Data refresh scheduler
description: How the unified static-data refresh system works — schedules, guards, callbacks, and file locations.
---

## Pattern
`server/dataRefresh.ts` — single file manages all auto-refresh. Same `global.__xxx` singleton guards as `ridershipRefresh.ts`:
- `g.__dataRefreshScheduled` — set on first call to `scheduleDataRefresh()`
- `g.__dataRefreshing` — set during an active cycle to prevent overlap

Check interval: 6 hours (`setInterval`). On start, also checks immediately if any dataset is stale.

## Schedules
- Monthly (30 days): grocery stores (`53t8-wyrc`), day care centers (`r5kz-chrr`), cannabis (IDFPR), minority contractors (Chicago MBE/WBE)
- Quarterly (90 days): 12 POI files (`r5kz-chrr`), EV stations (`fi3z-jc3f`)
- Weekly (7 days): SBA CSV URL auto-detection (CKAN API)

## In-memory cache callbacks
`onRefresh(key, cb)` — registered inside `registerRoutes()` in `routes.ts`. Keys:
- `'grocery'` → calls `resetGroceryCache()` from `grocery-stores.ts`
- `'capacity'` → nulls `capacityCcaData` and `capacityZipData` locals in `routes.ts`
- `'sba'` → calls `clearSBACache()` from `sbaLoans.ts`

## Wiring
`server/index.ts` calls `scheduleDataRefresh()` after `scheduleRidershipRefresh()`.

**Why:** Hot-reload: the `g.__dataRefreshScheduled` guard has a hot-reload branch that checks if monthly files are stale and triggers `runAllRefreshes()` without re-registering the interval.
