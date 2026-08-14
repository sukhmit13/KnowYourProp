---
name: SBA CSV URL auto-detection
description: How SBA CSV download URLs are stored, kept current, and why columns must be header-resolved.
---

## Files
- `server/data/sba_config.json` — stores current download URLs + `datasetPage`
- `server/sbaLoans.ts` — `loadSBAUrls()` reads config; `clearSBACache()` clears in-memory map
- `server/dataRefresh.ts::updateSBAUrls()` — weekly link check

## Aug 2026 portal migration (important)
SBA moved data.sba.gov off CKAN onto Drupal (~Aug 4–5, 2026):
- The old CKAN `resource_show` API is **gone** (returns HTML). Old `/dataset/.../resource/.../download/*.csv` URLs 404.
- New CSVs live at `https://data.sba.gov/sites/default/files/uploaded_resources/FOIA_7a_FY2020_Present_asof_<YYMMDD>.csv` (and `FOIA_504_FY2010_Present_...`), linked from `https://data.sba.gov/dataset/7a-504-foia`.
- `updateSBAUrls()` now scrapes that dataset page with regexes for the two filenames; keeps existing URLs on any failure.

## Column resolution — never hardcode indices
The migration also **reshuffled columns** (e.g. Subprogram column removed, later fields shifted). `sbaLoans.ts` now resolves field→index from each CSV's header row (`resolveColumns`, with alternate header names) and **throws** if expected columns are missing — a silent empty result would cache "no lending activity" for a week.

**Also:** new CSVs quote every field, so pre-filters like `line.includes(',IL,')` fail; use case-insensitive loose matching before parsing.

**Why:** a stale URL or shifted column silently rendered "No SBA loans found" for every ZIP in the report.
